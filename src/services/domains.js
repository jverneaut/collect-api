import { normalizeDomainInput, normalizeUrlInput } from '../lib/normalize.js';
import { clampLimit, decodeCursor, encodeCursor, makeCreatedAtCursorWhere } from '../lib/pagination.js';

export function makeDomainsService(app) {
  return {
    async createDomain(input) {
      const { host, canonicalUrl } = normalizeDomainInput(input.domain);

      const result = await app.prisma.$transaction(async (tx) => {
        const existing = await tx.domain.findUnique({ where: { host } });
        const domain =
          existing ??
          (await tx.domain.create({
            data: { host, canonicalUrl },
          }));

        let homepageUrl = null;
        if (input.createHomepageUrl) {
          const homepage = normalizeUrlInput(canonicalUrl);
          homepageUrl = await tx.url.upsert({
            where: { normalizedUrl: homepage.normalizedUrl },
            update: { type: 'HOMEPAGE', isCanonical: true },
            create: {
              domainId: domain.id,
              path: homepage.path,
              normalizedUrl: homepage.normalizedUrl,
              type: 'HOMEPAGE',
              isCanonical: true,
            },
          });
        }

        let initialCrawl = null;
        if (input.createInitialCrawl && homepageUrl) {
          initialCrawl = await tx.urlCrawl.create({
            data: {
              urlId: homepageUrl.id,
              status: 'PENDING',
              tasks: {
                create: [
                  { type: 'SCREENSHOT' },
                  { type: 'TECHNOLOGIES' },
                  { type: 'CATEGORIES' },
                  { type: 'CONTENT' },
                  { type: 'COLORS' },
                ],
              },
            },
            include: { tasks: true },
          });
        }

        return { domain, homepageUrl, initialCrawl, created: !existing };
      });

      return {
        statusCode: result.created ? 201 : 200,
        data: {
          ...result.domain,
          homepageUrl: result.homepageUrl,
          initialCrawl: result.initialCrawl,
        },
      };
    },

    async listDomains(query) {
      const limit = clampLimit(query.limit, { max: 100, fallback: 20 });
      const cursor = decodeCursor(query.cursor);
      const cursorWhere = makeCreatedAtCursorWhere(cursor);

      const where = {
        ...(query.search ? { host: { contains: query.search } } : {}),
        ...cursorWhere,
      };

      const domains = await app.prisma.domain.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });

      const nextCursor =
        domains.length === limit
          ? encodeCursor({
              createdAt: domains[domains.length - 1].createdAt,
              id: domains[domains.length - 1].id,
            })
          : null;

      if (!query.includeHomepage || domains.length === 0) {
        const domainIds = domains.map((d) => d.id);
        const counts = await app.prisma.url.groupBy({
          by: ['domainId'],
          where: { domainId: { in: domainIds } },
          _count: { _all: true },
        });

        const countByDomainId = new Map(counts.map((row) => [row.domainId, row._count._all]));
        return {
          items: domains.map((d) => ({ ...d, urlsCount: countByDomainId.get(d.id) ?? 0 })),
          nextCursor,
        };
      }

      const domainIds = domains.map((d) => d.id);
      const counts = await app.prisma.url.groupBy({
        by: ['domainId'],
        where: { domainId: { in: domainIds } },
        _count: { _all: true },
      });
      const countByDomainId = new Map(counts.map((row) => [row.domainId, row._count._all]));

      const homepageUrls = await app.prisma.url.findMany({
        where: { domainId: { in: domainIds }, type: 'HOMEPAGE' },
        include: {
          crawls: {
            orderBy: [{ createdAt: 'desc' }],
            take: 1,
            include: {
              tasks: true,
              screenshots: { orderBy: [{ createdAt: 'desc' }], take: 1 },
              categories: { include: { category: true } },
            },
          },
        },
      });

      const homepageByDomainId = new Map(homepageUrls.map((u) => [u.domainId, u]));
      const items = domains.map((domain) => ({
        ...domain,
        urlsCount: countByDomainId.get(domain.id) ?? 0,
        homepage: homepageByDomainId.get(domain.id) ?? null,
      }));

      return { items, nextCursor };
    },

    async getDomain(domainId, options) {
      const domain = await app.prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      const response = { ...domain };
      response.urlsCount = await app.prisma.url.count({ where: { domainId: domain.id } });

      if (options.includeProfile) {
        response.profile = await app.prisma.domainProfile.findUnique({ where: { domainId: domain.id } });
      }

      if (options.includeDerived) {
        response.derived = await this.getDerivedFromHomepage(domain.id, {
          preferStatus: options.derivedPreferStatus,
        });
      }

      if (options.includeUrls) {
        const includeLatest = options.includeLatestCrawls;
        const statusFilter = options.latestCrawlStatus === 'SUCCESS' ? { status: 'SUCCESS' } : undefined;

        response.urls = await app.prisma.url.findMany({
          where: { domainId: domain.id },
          orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
          include: includeLatest
            ? {
                crawls: {
                  where: statusFilter,
                  orderBy: [{ createdAt: 'desc' }],
                  take: 1,
                  include: {
                    tasks: true,
                    screenshots: { orderBy: [{ createdAt: 'desc' }], take: 1 },
                    categories: { include: { category: true } },
                    technologies: { include: { technology: true } },
                  },
                },
              }
            : undefined,
        });
      }

      return response;
    },

    async getHomepageUrl(domainId) {
      return app.prisma.url.findFirst({
        where: { domainId, type: 'HOMEPAGE' },
        orderBy: [{ createdAt: 'asc' }],
      });
    },

    async getDerivedFromHomepage(domainId, { preferStatus = 'SUCCESS' } = {}) {
      const homepage = await this.getHomepageUrl(domainId);
      if (!homepage) {
        return {
          homepageUrl: null,
          homepageLatestCrawl: null,
          primaryCategory: null,
          categories: [],
          technologies: [],
          screenshot: null,
        };
      }

      const crawl =
        preferStatus === 'SUCCESS'
          ? await app.services.crawls.getLatestCrawlForUrl(homepage.id, { status: 'SUCCESS' })
          : await app.services.crawls.getLatestCrawlForUrl(homepage.id);

      const categories = crawl?.categories?.map((c) => c.category).filter(Boolean) ?? [];
      const technologies = crawl?.technologies?.map((t) => t.technology).filter(Boolean) ?? [];

      const primaryCategory =
        crawl?.categories?.slice().sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]?.category ?? null;

      const screenshot = crawl?.screenshots?.slice().sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

      return {
        homepageUrl: homepage,
        homepageLatestCrawl: crawl,
        primaryCategory,
        categories,
        technologies,
        screenshot,
      };
    },

    async getDomainEntity(domainId) {
      return app.prisma.domain.findUnique({ where: { id: domainId } });
    },

    async getDomainByHost(host) {
      return app.prisma.domain.findUnique({ where: { host } });
    },

    async getProfile(domainId) {
      return app.prisma.domainProfile.findUnique({ where: { domainId } });
    },

    async deleteDomain(domainId) {
      await app.prisma.domain.delete({ where: { id: domainId } });
      return { deleted: true };
    },
  };
}

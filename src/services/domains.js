import { normalizeDomainInput, normalizeUrlInput } from '../lib/normalize.js';
import { clampLimit, decodeCursor, encodeCursor, makeCreatedAtCursorWhere } from '../lib/pagination.js';

function normalizeUrlsScope(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['all', 'any'].includes(normalized)) return 'ALL';
  if (['crawl_run', 'crawl-run', 'crawlrun', 'run'].includes(normalized)) return 'CRAWL_RUN';
  return 'LATEST_CRAWL_RUN';
}

function normalizePreferStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized === 'ANY' ? 'ANY' : 'SUCCESS';
}

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
                { type: 'SECTIONS' },
              ],
            },
          },
          include: { tasks: true },
        });
      }

        return { domain, homepageUrl, initialCrawl, created: !existing };
      });

      let ingestionJob = null;
      let ingestionCrawlRun = null;
      if (input.enqueueIngestion) {
        const requested = await app.services.crawlRuns.requestDomainCrawlRun(result.domain.id, input.ingestion ?? {});
        ingestionJob = requested.job;
        ingestionCrawlRun = requested.crawlRun;
      }

      return {
        statusCode: result.created ? 201 : 200,
        data: {
          ...result.domain,
          homepageUrl: result.homepageUrl,
          initialCrawl: result.initialCrawl,
          ingestionJob,
          ingestionCrawlRun,
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
        orderBy: [{ domainId: 'asc' }, { isCanonical: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
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

      const homepageByDomainId = new Map();
      for (const homepageUrl of homepageUrls) {
        if (!homepageByDomainId.has(homepageUrl.domainId)) {
          homepageByDomainId.set(homepageUrl.domainId, homepageUrl);
        }
      }
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
        const urlsScope = normalizeUrlsScope(options.urlsScope);
        const preferRunStatus = normalizePreferStatus(options.urlsPreferRunStatus);

        let crawlRunId = null;
        if (urlsScope === 'CRAWL_RUN') {
          if (!options.urlsCrawlRunId) throw app.httpErrors.badRequest('urlsCrawlRunId is required when urlsScope=crawl_run');
          crawlRunId = options.urlsCrawlRunId;
        } else if (urlsScope === 'LATEST_CRAWL_RUN') {
          const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
          const successful =
            preferRunStatus === 'SUCCESS'
              ? await app.prisma.crawlRun.findFirst({
                  where: { domainId: domain.id, status: 'SUCCESS' },
                  orderBy,
                })
              : null;
          const latest = successful ?? (await app.prisma.crawlRun.findFirst({ where: { domainId: domain.id }, orderBy }));
          crawlRunId = latest?.id ?? null;
        }

        response.urlsScope = options.urlsScope ?? 'latest_crawl_run';
        response.urlsCrawlRunId = crawlRunId;

        const statusFilter =
          crawlRunId || options.latestCrawlStatus !== 'SUCCESS' ? undefined : { status: 'SUCCESS' };

        response.urls = await app.prisma.url.findMany({
          where: {
            domainId: domain.id,
            ...(crawlRunId ? { crawls: { some: { crawlRunId } } } : {}),
          },
          orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
          include: includeLatest
            ? {
                crawls: {
                  where: {
                    ...(crawlRunId ? { crawlRunId } : {}),
                    ...(statusFilter ?? {}),
                  },
                  orderBy: [{ createdAt: 'desc' }],
                  take: 1,
                  include: {
                    tasks: true,
                    screenshots: { orderBy: [{ createdAt: 'desc' }], take: 1 },
                    sections: { orderBy: [{ index: 'asc' }] },
                    categories: { include: { category: true } },
                    technologies: { include: { technology: true } },
                  },
                },
              }
            : undefined,
        });

        if (crawlRunId) response.foundUrlsCount = response.urls.length;
      }

      return response;
    },

    async getHomepageUrl(domainId) {
      return app.prisma.url.findFirst({
        where: { domainId, type: 'HOMEPAGE' },
        orderBy: [{ isCanonical: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
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

    async patchDomain(domainId, patch) {
      const data = {};
      if (patch?.isPublished === true || patch?.isPublished === false) {
        data.isPublished = patch.isPublished;
      }

      if (Object.keys(data).length === 0) {
        throw app.httpErrors.badRequest('No valid fields to update');
      }

      return app.prisma.domain.update({
        where: { id: domainId },
        data,
      });
    },

    async deleteDomain(domainId) {
      await app.prisma.domain.delete({ where: { id: domainId } });
      return { deleted: true };
    },
  };
}

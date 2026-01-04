function safeStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function normalizePreferStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized === 'ANY' ? 'ANY' : 'SUCCESS';
}

function buildDerivedFromHomepageCrawl(homepageCrawl) {
  if (!homepageCrawl) {
    return {
      homepageUrl: null,
      homepageLatestCrawl: null,
      primaryCategory: null,
      categories: [],
      technologies: [],
      screenshot: null,
    };
  }

  const categories = homepageCrawl.categories?.map((c) => c.category).filter(Boolean) ?? [];
  const technologies = homepageCrawl.technologies?.map((t) => t.technology).filter(Boolean) ?? [];

  const primaryCategory =
    homepageCrawl.categories?.slice().sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]?.category ?? null;

  const screenshot = homepageCrawl.screenshots?.slice().sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

  return {
    homepageUrl: homepageCrawl.url ?? null,
    homepageLatestCrawl: homepageCrawl,
    primaryCategory,
    categories,
    technologies,
    screenshot,
  };
}

export function makeCrawlRunsService(app) {
  return {
    async getLatestCrawlRunForDomain(domainId, { preferStatus = 'SUCCESS' } = {}) {
      const normalizedPreferStatus = normalizePreferStatus(preferStatus);

      const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];

      if (normalizedPreferStatus === 'SUCCESS') {
        const successful = await app.prisma.crawlRun.findFirst({
          where: { domainId, status: 'SUCCESS' },
          orderBy,
        });
        if (successful) return successful;
      }

      return app.prisma.crawlRun.findFirst({ where: { domainId }, orderBy });
    },

    async getDerivedForCrawlRun(crawlRunId, { preferStatus = 'SUCCESS' } = {}) {
      const normalizedPreferStatus = normalizePreferStatus(preferStatus);

      const include = {
        url: true,
        tasks: true,
        screenshots: true,
        categories: { include: { category: true } },
        technologies: { include: { technology: true } },
      };

      const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];

      const successCrawl =
        normalizedPreferStatus === 'SUCCESS'
          ? await app.prisma.urlCrawl.findFirst({
              where: {
                crawlRunId,
                status: 'SUCCESS',
                url: { type: 'HOMEPAGE' },
              },
              orderBy,
              include,
            })
          : null;

      const crawl =
        successCrawl ??
        (await app.prisma.urlCrawl.findFirst({
          where: { crawlRunId, url: { type: 'HOMEPAGE' } },
          orderBy,
          include,
        }));

      return buildDerivedFromHomepageCrawl(crawl);
    },

    async requestDomainCrawlRun(domainId, options = {}) {
      const domain = await app.services.domains.getDomainEntity(domainId);
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      const crawlRun = await app.prisma.crawlRun.create({
        data: {
          domainId: domain.id,
          status: 'PENDING',
          optionsJson: safeStringify(options),
        },
      });

      const job = app.jobs.enqueue(
        { type: 'DOMAIN_INGESTION', input: { domainId: domain.id, crawlRunId: crawlRun.id, options } },
        async ({ update, signal }) => {
          await app.prisma.crawlRun.update({
            where: { id: crawlRun.id },
            data: { status: 'RUNNING', startedAt: new Date() },
          });

          try {
            const result = await app.services.ingestion.ingestDomain(domain.id, options, {
              update,
              signal,
              crawlRunId: crawlRun.id,
            });

            await app.prisma.crawlRun.update({
              where: { id: crawlRun.id },
              data: {
                status: 'SUCCESS',
                finishedAt: new Date(),
                error: null,
              },
            });

            return { ...result, crawlRunId: crawlRun.id };
          } catch (error) {
            await app.prisma.crawlRun.update({
              where: { id: crawlRun.id },
              data: {
                status: 'FAILED',
                finishedAt: new Date(),
                error: error?.message || 'Crawl run failed',
              },
            });
            throw error;
          }
        }
      );

      const updated = await app.prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: { jobId: job.id },
      });

      return { crawlRun: updated, job };
    },

    async listCrawlRunsForDomain(domainId, { limit = 50, status, includeOverview, overviewPreferStatus } = {}) {
      const domain = await app.services.domains.getDomainEntity(domainId);
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      const take = Math.max(1, Math.min(Number(limit) || 50, 200));
      const items = await app.prisma.crawlRun.findMany({
        where: { domainId: domain.id, ...(status ? { status } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });

      if (items.length === 0) return [];

      const runIds = items.map((r) => r.id);
      const counts = await app.prisma.urlCrawl.groupBy({
        by: ['crawlRunId'],
        where: { crawlRunId: { in: runIds } },
        _count: { _all: true },
      });

      const foundUrlsCountByRunId = new Map(
        counts.map((row) => [row.crawlRunId, row._count._all]),
      );

      let overviewByRunId = null;
      if (includeOverview) {
        overviewByRunId = new Map();
        const preferStatus = normalizePreferStatus(overviewPreferStatus);

        const include = {
          url: true,
          screenshots: true,
          categories: { include: { category: true } },
          technologies: { include: { technology: true } },
        };
        const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];

        const successHomepages =
          preferStatus === 'SUCCESS'
            ? await app.prisma.urlCrawl.findMany({
                where: {
                  crawlRunId: { in: runIds },
                  status: 'SUCCESS',
                  url: { type: 'HOMEPAGE' },
                },
                orderBy,
                include,
              })
            : [];

        for (const crawl of successHomepages) {
          if (!overviewByRunId.has(crawl.crawlRunId)) {
            overviewByRunId.set(crawl.crawlRunId, buildDerivedFromHomepageCrawl(crawl));
          }
        }

        const missingIds = runIds.filter((id) => !overviewByRunId.has(id));
        if (missingIds.length) {
          const anyHomepages = await app.prisma.urlCrawl.findMany({
            where: { crawlRunId: { in: missingIds }, url: { type: 'HOMEPAGE' } },
            orderBy,
            include,
          });

          for (const crawl of anyHomepages) {
            if (!overviewByRunId.has(crawl.crawlRunId)) {
              overviewByRunId.set(crawl.crawlRunId, buildDerivedFromHomepageCrawl(crawl));
            }
          }
        }
      }

      return items.map((crawlRun) => ({
        ...crawlRun,
        foundUrlsCount: foundUrlsCountByRunId.get(crawlRun.id) ?? 0,
        ...(overviewByRunId ? { overview: overviewByRunId.get(crawlRun.id) ?? buildDerivedFromHomepageCrawl(null) } : {}),
      }));
    },

    async getCrawlRun(crawlRunId) {
      return app.prisma.crawlRun.findUnique({ where: { id: crawlRunId } });
    },

    async getCrawlRunWithResults(
      crawlRunId,
      { includeUrls = true, includeOverview = true, overviewPreferStatus = 'SUCCESS' } = {},
    ) {
      const crawlRun = await this.getCrawlRun(crawlRunId);
      if (!crawlRun) throw app.httpErrors.notFound('Crawl run not found');

      const foundUrlsCount = await app.prisma.urlCrawl.count({ where: { crawlRunId: crawlRun.id } });

      const derived = includeOverview
        ? await this.getDerivedForCrawlRun(crawlRun.id, { preferStatus: overviewPreferStatus })
        : undefined;

      const urls = includeUrls
        ? await app.prisma.url.findMany({
            where: {
              domainId: crawlRun.domainId,
              crawls: { some: { crawlRunId: crawlRun.id } },
            },
            orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
            include: {
              crawls: {
                where: { crawlRunId: crawlRun.id },
                orderBy: [{ createdAt: 'desc' }],
                take: 1,
                include: {
                  tasks: true,
                  screenshots: { orderBy: [{ createdAt: 'desc' }], take: 1 },
                  categories: { include: { category: true } },
                  technologies: { include: { technology: true } },
                },
              },
            },
          })
        : undefined;

      return {
        ...crawlRun,
        foundUrlsCount,
        ...(includeOverview ? { derived } : {}),
        ...(includeUrls ? { urls } : {}),
      };
    },
  };
}

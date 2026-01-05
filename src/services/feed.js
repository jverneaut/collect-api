import { clampLimit } from '../lib/pagination.js';

export function makeFeedService(app) {
  return {
    async latestSites(query) {
      const limit = clampLimit(query.limit, { max: 100, fallback: 20 });

      const latestPublishedRuns = await app.prisma.crawlRun.findMany({
        where: {
          status: 'SUCCESS',
          isPublished: true,
          publishedAt: { not: null },
          domain: { isPublished: true },
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        distinct: ['domainId'],
        take: limit,
      });

      if (!latestPublishedRuns.length) return { items: [] };

      const domainIds = latestPublishedRuns.map((r) => r.domainId);
      const runIds = latestPublishedRuns.map((r) => r.id);

      const [domains, homepageCrawls] = await Promise.all([
        app.prisma.domain.findMany({ where: { id: { in: domainIds } } }),
        app.prisma.urlCrawl.findMany({
          where: {
            crawlRunId: { in: runIds },
            isPublished: true,
            url: { domainId: { in: domainIds }, type: 'HOMEPAGE' },
          },
          include: {
            url: true,
            screenshots: { where: { isPublished: true }, orderBy: [{ createdAt: 'desc' }], take: 1 },
            categories: { include: { category: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      ]);

      const domainById = new Map(domains.map((d) => [d.id, d]));
      const homepageCrawlByRunId = new Map();
      for (const crawl of homepageCrawls) {
        if (!crawl.crawlRunId) continue;
        if (!homepageCrawlByRunId.has(crawl.crawlRunId)) {
          homepageCrawlByRunId.set(crawl.crawlRunId, crawl);
        }
      }

      const items = latestPublishedRuns
        .map((run) => {
          const domain = domainById.get(run.domainId);
          if (!domain) return null;

          const homepageCrawl = homepageCrawlByRunId.get(run.id) ?? null;
          const primaryCategory =
            homepageCrawl?.categories?.slice().sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;
          const screenshot = homepageCrawl?.screenshots?.[0] ?? null;

          if (!homepageCrawl || !homepageCrawl.url || !screenshot) return null;

          return {
            domain,
            homepage: {
              url: homepageCrawl.url,
              latestCrawl: homepageCrawl,
              screenshot,
              category: primaryCategory?.category ?? null,
              categoryConfidence: primaryCategory?.confidence ?? null,
            },
          };
        })
        .filter(Boolean);

      return { items };
    },
  };
}

import { clampLimit } from '../lib/pagination.js';

export function makeFeedService(app) {
  return {
    async latestSites(query) {
      const limit = clampLimit(query.limit, { max: 100, fallback: 20 });

      const domains = await app.prisma.domain.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });

      const domainIds = domains.map((d) => d.id);
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

      const items = domains.map((domain) => {
        const homepage = homepageByDomainId.get(domain.id) ?? null;
        const latestCrawl = homepage?.crawls?.[0] ?? null;
        const primaryCategory =
          latestCrawl?.categories?.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;

        return {
          domain,
          homepage: homepage
            ? {
                url: homepage,
                latestCrawl,
                screenshot: latestCrawl?.screenshots?.[0] ?? null,
                category: primaryCategory?.category ?? null,
                categoryConfidence: primaryCategory?.confidence ?? null,
              }
            : null,
        };
      });

      return { items };
    },
  };
}

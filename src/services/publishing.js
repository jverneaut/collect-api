function safeStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return null;
  const tags = input
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(0, 50);
  return tags.length ? tags : [];
}

function parseMs(value) {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

function crawlTime(crawl) {
  return crawl?.crawledAt ?? crawl?.finishedAt ?? crawl?.createdAt ?? null;
}

function crawlRunTime(crawlRun) {
  return crawlRun?.finishedAt ?? crawlRun?.createdAt ?? null;
}

function timeMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

export function makePublishingService(app) {
  return {
    async getReviewCount() {
      const [latestSuccessByDomain, latestReviewedByDomain, latestPublishedByDomain] = await Promise.all([
        app.prisma.crawlRun.findMany({
          where: { status: 'SUCCESS' },
          orderBy: [
            { domainId: 'asc' },
            { finishedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          distinct: ['domainId'],
        }),
        app.prisma.crawlRun.findMany({
          where: { status: 'SUCCESS', reviewStatus: 'REVIEWED' },
          orderBy: [
            { domainId: 'asc' },
            { reviewedAt: 'desc' },
            { finishedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          distinct: ['domainId'],
        }),
        app.prisma.crawlRun.findMany({
          where: { status: 'SUCCESS', isPublished: true },
          orderBy: [
            { domainId: 'asc' },
            { publishedAt: 'desc' },
            { finishedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          distinct: ['domainId'],
        }),
      ]);

      const reviewedByDomainId = new Map(latestReviewedByDomain.map((r) => [r.domainId, r]));
      const publishedByDomainId = new Map(latestPublishedByDomain.map((r) => [r.domainId, r]));

      const domainsToReview = latestSuccessByDomain.filter((latest) => {
        const reviewed = reviewedByDomainId.get(latest.domainId) ?? null;
        const published = publishedByDomainId.get(latest.domainId) ?? null;
        const latestMs = timeMs(crawlRunTime(latest));
        if (!latestMs) return false;

        const baselineMs = Math.max(
          timeMs(crawlRunTime(reviewed)),
          timeMs(crawlRunTime(published)),
        );

        if (!baselineMs) return true;
        return latestMs > baselineMs;
      });

      return { domains: domainsToReview.length, crawlRuns: domainsToReview.length };
    },

    async listDomainsToReview({ limit = 50 } = {}) {
      const take = Math.max(1, Math.min(Number(limit) || 50, 200));

      const [latestSuccessByDomain, latestReviewedByDomain, latestPublishedByDomain] = await Promise.all([
        app.prisma.crawlRun.findMany({
          where: { status: 'SUCCESS' },
          orderBy: [
            { domainId: 'asc' },
            { finishedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          distinct: ['domainId'],
        }),
        app.prisma.crawlRun.findMany({
          where: { status: 'SUCCESS', reviewStatus: 'REVIEWED' },
          orderBy: [
            { domainId: 'asc' },
            { reviewedAt: 'desc' },
            { finishedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          distinct: ['domainId'],
        }),
        app.prisma.crawlRun.findMany({
          where: { status: 'SUCCESS', isPublished: true },
          orderBy: [
            { domainId: 'asc' },
            { publishedAt: 'desc' },
            { finishedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          distinct: ['domainId'],
        }),
      ]);

      const reviewedByDomainId = new Map(latestReviewedByDomain.map((r) => [r.domainId, r]));
      const publishedByDomainId = new Map(latestPublishedByDomain.map((r) => [r.domainId, r]));

      const domainsToReviewSorted = latestSuccessByDomain
        .map((latest) => {
          const reviewed = reviewedByDomainId.get(latest.domainId) ?? null;
          const published = publishedByDomainId.get(latest.domainId) ?? null;
          const latestMs = timeMs(crawlRunTime(latest));
          const baselineMs = Math.max(
            timeMs(crawlRunTime(reviewed)),
            timeMs(crawlRunTime(published)),
          );
          const needsReview = !baselineMs ? Boolean(latestMs) : latestMs > baselineMs;
          return needsReview ? { domainId: latest.domainId, latest, latestMs } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.latestMs - a.latestMs)
        .slice(0, take);

      if (!domainsToReviewSorted.length) return [];

      const domainIds = domainsToReviewSorted.map((row) => row.domainId);
      const latestRuns = domainsToReviewSorted.map((row) => row.latest);

      const [domains, profiles, successRunsCounts] = await Promise.all([
        app.prisma.domain.findMany({
          where: { id: { in: domainIds } },
        }),
        app.prisma.domainProfile.findMany({
          where: { domainId: { in: domainIds } },
        }),
        app.prisma.crawlRun.groupBy({
          by: ['domainId'],
          where: { domainId: { in: domainIds }, status: 'SUCCESS' },
          _count: { _all: true },
        }),
      ]);

      const domainById = new Map(domains.map((d) => [d.id, d]));
      const profileByDomainId = new Map(profiles.map((p) => [p.domainId, p]));
      const latestRunByDomainId = new Map(latestRuns.map((r) => [r.domainId, r]));
      const successRunsCountByDomainId = new Map(successRunsCounts.map((row) => [row.domainId, row._count._all]));

      const latestRunIds = latestRuns.map((r) => r.id);
      const homepageCrawls =
        latestRunIds.length === 0
          ? []
          : await app.prisma.urlCrawl.findMany({
              where: {
                crawlRunId: { in: latestRunIds },
                url: { type: 'HOMEPAGE' },
              },
              include: {
                url: true,
                screenshots: { orderBy: [{ createdAt: 'desc' }], take: 1 },
                categories: { include: { category: true } },
              },
            });

      const homepageCrawlByRunId = new Map();
      for (const crawl of homepageCrawls) {
        const runId = crawl.crawlRunId;
        if (!runId) continue;

        const candidateScore =
          (crawl.status === 'SUCCESS' ? 100 : 0) +
          (crawl.url?.isCanonical ? 10 : 0) +
          (crawlTime(crawl) ? parseMs(crawlTime(crawl)) / 1_000_000_000_000 : 0);

        const existing = homepageCrawlByRunId.get(runId);
        if (!existing) {
          homepageCrawlByRunId.set(runId, { crawl, score: candidateScore });
          continue;
        }

        if (candidateScore > existing.score) {
          homepageCrawlByRunId.set(runId, { crawl, score: candidateScore });
        }
      }

      return domainIds
        .map((domainId) => {
          const domain = domainById.get(domainId);
          if (!domain) return null;
          const latestRun = latestRunByDomainId.get(domainId) ?? null;
          const homepageCrawl = latestRun?.id ? homepageCrawlByRunId.get(latestRun.id)?.crawl ?? null : null;
          const primaryCategory =
            homepageCrawl?.categories
              ?.slice()
              .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;

          return {
            domain: {
              ...domain,
              profile: profileByDomainId.get(domain.id) ?? null,
            },
            pendingCrawlRunsCount: successRunsCountByDomainId.get(domainId) ?? 0,
            latestPendingCrawlRun: latestRun,
            latestPendingOverview: latestRun
              ? {
                  homepageUrl: homepageCrawl?.url ?? null,
                  homepageLatestCrawl: homepageCrawl,
                  screenshot: homepageCrawl?.screenshots?.[0] ?? null,
                  primaryCategory: primaryCategory?.category ?? null,
                  categoryConfidence: primaryCategory?.confidence ?? null,
                }
              : null,
          };
        })
        .filter(Boolean);
    },

    async saveCrawlRunPublication(crawlRunId, input = {}) {
      const crawlRun = await app.prisma.crawlRun.findUnique({ where: { id: crawlRunId } });
      if (!crawlRun) throw app.httpErrors.notFound('Crawl run not found');

      const domainIsPublished =
        input.domainIsPublished === true || input.domainIsPublished === false ? input.domainIsPublished : null;

      const crawlRunIsPublished =
        input.crawlRunIsPublished === true || input.crawlRunIsPublished === false ? input.crawlRunIsPublished : null;

      const tags = normalizeTags(input.crawlRunTags);

      const crawlsToPublish = Array.isArray(input.crawlsToPublish)
        ? input.crawlsToPublish.map((id) => String(id)).filter(Boolean)
        : [];
      const crawlsToUnpublish = Array.isArray(input.crawlsToUnpublish)
        ? input.crawlsToUnpublish.map((id) => String(id)).filter(Boolean)
        : [];

      const sectionsToPublish = Array.isArray(input.sectionsToPublish)
        ? input.sectionsToPublish.map((id) => String(id)).filter(Boolean)
        : [];
      const sectionsToUnpublish = Array.isArray(input.sectionsToUnpublish)
        ? input.sectionsToUnpublish.map((id) => String(id)).filter(Boolean)
        : [];

      const markReviewed = input.markReviewed !== false;

      return await app.prisma.$transaction(async (tx) => {
        if (domainIsPublished !== null) {
          await tx.domain.update({ where: { id: crawlRun.domainId }, data: { isPublished: domainIsPublished } });
        }

        if (crawlRunIsPublished !== null || tags !== null || markReviewed) {
          const data = {};
          if (crawlRunIsPublished !== null) {
            data.isPublished = crawlRunIsPublished;
            data.publishedAt = crawlRunIsPublished ? new Date() : null;
          }
          if (tags !== null) {
            data.tagsJson = safeStringify(tags);
          }
          if (markReviewed) {
            data.reviewStatus = 'REVIEWED';
            data.reviewedAt = new Date();
          }
          await tx.crawlRun.update({ where: { id: crawlRun.id }, data });
        }

        if (crawlsToPublish.length) {
          await tx.urlCrawl.updateMany({
            where: { id: { in: crawlsToPublish }, crawlRunId: crawlRun.id },
            data: { isPublished: true },
          });

          await tx.screenshot.updateMany({
            where: { crawlId: { in: crawlsToPublish } },
            data: { isPublished: true },
          });
        }

        if (crawlsToUnpublish.length) {
          await tx.urlCrawl.updateMany({
            where: { id: { in: crawlsToUnpublish }, crawlRunId: crawlRun.id },
            data: { isPublished: false },
          });

          await tx.screenshot.updateMany({
            where: { crawlId: { in: crawlsToUnpublish } },
            data: { isPublished: false },
          });

          await tx.sectionScreenshot.updateMany({
            where: { crawlId: { in: crawlsToUnpublish } },
            data: { isPublished: false },
          });
        }

        if (sectionsToPublish.length) {
          await tx.sectionScreenshot.updateMany({
            where: { id: { in: sectionsToPublish }, crawl: { crawlRunId: crawlRun.id } },
            data: { isPublished: true },
          });
        }

        if (sectionsToUnpublish.length) {
          await tx.sectionScreenshot.updateMany({
            where: { id: { in: sectionsToUnpublish }, crawl: { crawlRunId: crawlRun.id } },
            data: { isPublished: false },
          });
        }

        const updated = await tx.crawlRun.findUnique({ where: { id: crawlRun.id } });
        return { crawlRun: updated };
      });
    },
  };
}

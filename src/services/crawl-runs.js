function safeStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

export function makeCrawlRunsService(app) {
  return {
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

    async listCrawlRunsForDomain(domainId, { limit = 50, status } = {}) {
      const domain = await app.services.domains.getDomainEntity(domainId);
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      const take = Math.max(1, Math.min(Number(limit) || 50, 200));
      return app.prisma.crawlRun.findMany({
        where: { domainId: domain.id, ...(status ? { status } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
    },

    async getCrawlRun(crawlRunId) {
      return app.prisma.crawlRun.findUnique({ where: { id: crawlRunId } });
    },
  };
}


export function makeCrawlsService(app) {
  return {
    async createCrawl(urlId, input) {
      const url = await app.prisma.url.findUnique({ where: { id: urlId } });
      if (!url) throw app.httpErrors.notFound('URL not found');

      return app.prisma.urlCrawl.create({
        data: {
          urlId: url.id,
          status: 'PENDING',
          tasks: { create: input.tasks.map((type) => ({ type })) },
        },
        include: { tasks: true },
      });
    },

    async getCrawl(urlId, crawlId) {
      const crawl = await app.prisma.urlCrawl.findFirst({
        where: { id: crawlId, urlId },
        include: {
          tasks: true,
          screenshots: { orderBy: [{ createdAt: 'desc' }] },
          categories: { include: { category: true } },
          technologies: { include: { technology: true } },
        },
      });

      if (!crawl) throw app.httpErrors.notFound('Crawl not found');
      return crawl;
    },

    async getCrawlById(crawlId) {
      return app.prisma.urlCrawl.findUnique({
        where: { id: crawlId },
        include: {
          tasks: true,
          screenshots: true,
          categories: { include: { category: true } },
          technologies: { include: { technology: true } },
        },
      });
    },

    async getLatestCrawlForUrl(urlId, { status } = {}) {
      return app.prisma.urlCrawl.findFirst({
        where: { urlId, ...(status ? { status } : {}) },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          tasks: true,
          screenshots: true,
          categories: { include: { category: true } },
          technologies: { include: { technology: true } },
        },
      });
    },

    async patchCrawl(crawlId, patch) {
      return app.prisma.urlCrawl.update({
        where: { id: crawlId },
        data: {
          ...patch,
          startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
          finishedAt: patch.finishedAt ? new Date(patch.finishedAt) : undefined,
          crawledAt: patch.crawledAt ? new Date(patch.crawledAt) : undefined,
        },
      });
    },

    async patchTask(crawlId, taskType, patch) {
      const now = new Date();
      return app.prisma.crawlTask.update({
        where: {
          crawlId_type: { crawlId, type: taskType },
        },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.status === 'RUNNING'
            ? {
                startedAt: now,
                lastAttemptAt: now,
                attempts: { increment: 1 },
              }
            : {}),
          ...(patch.status === 'SUCCESS' || patch.status === 'FAILED' ? { finishedAt: now } : {}),
        },
      });
    },

    async addScreenshot(crawlId, input) {
      const crawl = await app.prisma.urlCrawl.findUnique({ where: { id: crawlId } });
      if (!crawl) throw app.httpErrors.notFound('Crawl not found');

      return app.prisma.screenshot.create({
        data: {
          crawlId: crawl.id,
          kind: input.kind,
          width: input.width,
          height: input.height,
          format: input.format,
          storageKey: input.storageKey,
          publicUrl: input.publicUrl,
        },
      });
    },

    async setCategories(crawlId, input) {
      const crawl = await app.prisma.urlCrawl.findUnique({ where: { id: crawlId } });
      if (!crawl) throw app.httpErrors.notFound('Crawl not found');

      const items = await app.prisma.$transaction(async (tx) => {
        await tx.crawlCategory.deleteMany({ where: { crawlId: crawl.id } });

        const rows = [];
        for (const item of input.items) {
          const category = await tx.category.upsert({
            where: { slug: item.slug },
            update: { name: item.name, description: item.description },
            create: { slug: item.slug, name: item.name, description: item.description },
          });
          rows.push({ category, confidence: item.confidence ?? null });
          await tx.crawlCategory.create({
            data: { crawlId: crawl.id, categoryId: category.id, confidence: item.confidence },
          });
        }

        return rows;
      });

      return { items };
    },

    async setTechnologies(crawlId, input) {
      const crawl = await app.prisma.urlCrawl.findUnique({ where: { id: crawlId } });
      if (!crawl) throw app.httpErrors.notFound('Crawl not found');

      const items = await app.prisma.$transaction(async (tx) => {
        await tx.crawlTechnology.deleteMany({ where: { crawlId: crawl.id } });

        const rows = [];
        for (const item of input.items) {
          const technology = await tx.technology.upsert({
            where: { slug: item.slug },
            update: { name: item.name, websiteUrl: item.websiteUrl },
            create: { slug: item.slug, name: item.name, websiteUrl: item.websiteUrl },
          });
          rows.push({ technology, confidence: item.confidence ?? null });
          await tx.crawlTechnology.create({
            data: { crawlId: crawl.id, technologyId: technology.id, confidence: item.confidence },
          });
        }

        return rows;
      });

      return { items };
    },

    async listTasks(crawlId) {
      return app.prisma.crawlTask.findMany({ where: { crawlId } });
    },

    async listScreenshots(crawlId) {
      return app.prisma.screenshot.findMany({ where: { crawlId }, orderBy: [{ createdAt: 'desc' }] });
    },

    async listCategories(crawlId) {
      return app.prisma.crawlCategory.findMany({
        where: { crawlId },
        include: { category: true },
      });
    },

    async listTechnologies(crawlId) {
      return app.prisma.crawlTechnology.findMany({
        where: { crawlId },
        include: { technology: true },
      });
    },
  };
}

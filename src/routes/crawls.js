const CreateCrawlSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      items: { type: 'string', enum: ['SCREENSHOT', 'TECHNOLOGIES', 'CATEGORIES', 'CONTENT', 'COLORS'] },
      default: ['SCREENSHOT', 'TECHNOLOGIES'],
      minItems: 1,
    },
  },
};

const UpsertScreenshotSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['FULL_PAGE', 'VIEWPORT'], default: 'FULL_PAGE' },
    width: { type: 'integer', minimum: 1 },
    height: { type: 'integer', minimum: 1 },
    format: { type: 'string' },
    storageKey: { type: 'string' },
    publicUrl: { type: 'string' },
  },
};

const UpsertCategoriesSchema = {
  type: 'object',
  required: ['items'],
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slug', 'name'],
        additionalProperties: false,
        properties: {
          slug: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

const UpsertTechnologiesSchema = {
  type: 'object',
  required: ['items'],
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slug', 'name'],
        additionalProperties: false,
        properties: {
          slug: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          websiteUrl: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

const UpdateTaskSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] },
    error: { type: 'string' },
  },
};

export async function crawlRoutes(app) {
  app.post(
    '/urls/:urlId/crawls',
    {
      schema: {
        params: {
          type: 'object',
          required: ['urlId'],
          additionalProperties: false,
          properties: { urlId: { type: 'string', minLength: 1 } },
        },
        body: CreateCrawlSchema,
      },
    },
    async (request, reply) => {
      const crawl = await app.services.crawls.createCrawl(request.params.urlId, request.body);
      reply.code(201).ok(crawl);
    }
  );

  app.get(
    '/urls/:urlId/crawls/:crawlId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['urlId', 'crawlId'],
          additionalProperties: false,
          properties: {
            urlId: { type: 'string', minLength: 1 },
            crawlId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const crawl = await app.services.crawls.getCrawl(request.params.urlId, request.params.crawlId);
      reply.ok(crawl);
    }
  );

  app.patch(
    '/crawls/:crawlId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['crawlId'],
          additionalProperties: false,
          properties: { crawlId: { type: 'string', minLength: 1 } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] },
            startedAt: { type: 'string' },
            finishedAt: { type: 'string' },
            crawledAt: { type: 'string' },
            httpStatus: { type: 'integer' },
            finalUrl: { type: 'string' },
            title: { type: 'string' },
            metaDescription: { type: 'string' },
            language: { type: 'string' },
            contentHash: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const crawl = await app.services.crawls.patchCrawl(request.params.crawlId, request.body);
      reply.ok(crawl);
    }
  );

  app.patch(
    '/crawls/:crawlId/tasks/:taskType',
    {
      schema: {
        params: {
          type: 'object',
          required: ['crawlId', 'taskType'],
          additionalProperties: false,
          properties: {
            crawlId: { type: 'string', minLength: 1 },
            taskType: {
              type: 'string',
              enum: ['SCREENSHOT', 'TECHNOLOGIES', 'CATEGORIES', 'CONTENT', 'COLORS'],
            },
          },
        },
        body: UpdateTaskSchema,
      },
    },
    async (request, reply) => {
      const task = await app.services.crawls.patchTask(
        request.params.crawlId,
        request.params.taskType,
        request.body
      );
      reply.ok(task);
    }
  );

  app.post(
    '/crawls/:crawlId/screenshots',
    {
      schema: {
        params: {
          type: 'object',
          required: ['crawlId'],
          additionalProperties: false,
          properties: { crawlId: { type: 'string', minLength: 1 } },
        },
        body: UpsertScreenshotSchema,
      },
    },
    async (request, reply) => {
      const screenshot = await app.services.crawls.addScreenshot(request.params.crawlId, request.body);
      reply.code(201).ok(screenshot);
    }
  );

  app.put(
    '/crawls/:crawlId/categories',
    {
      schema: {
        params: {
          type: 'object',
          required: ['crawlId'],
          additionalProperties: false,
          properties: { crawlId: { type: 'string', minLength: 1 } },
        },
        body: UpsertCategoriesSchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.crawls.setCategories(request.params.crawlId, request.body);
      reply.ok(result);
    }
  );

  app.put(
    '/crawls/:crawlId/technologies',
    {
      schema: {
        params: {
          type: 'object',
          required: ['crawlId'],
          additionalProperties: false,
          properties: { crawlId: { type: 'string', minLength: 1 } },
        },
        body: UpsertTechnologiesSchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.crawls.setTechnologies(request.params.crawlId, request.body);
      reply.ok(result);
    }
  );
}

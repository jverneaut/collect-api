const CreateUrlSchema = {
  type: 'object',
  required: ['url'],
  additionalProperties: false,
  properties: {
    url: { type: 'string', minLength: 1 },
    type: {
      type: 'string',
      enum: ['HOMEPAGE', 'ABOUT', 'CONTACT', 'PRICING', 'BLOG', 'CAREERS', 'DOCS', 'TERMS', 'PRIVACY', 'OTHER'],
      default: 'OTHER',
    },
    isCanonical: { type: 'boolean', default: false },
  },
};

const ListCrawlsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
    cursor: { type: 'string' },
    status: { type: 'string', enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] },
  },
};

const ListUrlsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scope: { type: 'string', enum: ['all', 'latest_crawl_run', 'crawl_run'], default: 'latest_crawl_run' },
    crawlRunId: { type: 'string', minLength: 1 },
    preferRunStatus: { type: 'string', enum: ['ANY', 'SUCCESS'], default: 'SUCCESS' },
  },
};

export async function urlRoutes(app) {
  app.post(
    '/domains/:domainId/urls',
    {
      schema: {
        params: {
          type: 'object',
          required: ['domainId'],
          additionalProperties: false,
          properties: { domainId: { type: 'string', minLength: 1 } },
        },
        body: CreateUrlSchema,
      },
    },
    async (request, reply) => {
      const url = await app.services.urls.upsertUrlForDomain(request.params.domainId, request.body);
      reply.code(200).ok(url);
    }
  );

  app.get(
    '/domains/:domainId/urls',
    {
      schema: {
        params: {
          type: 'object',
          required: ['domainId'],
          additionalProperties: false,
          properties: { domainId: { type: 'string', minLength: 1 } },
        },
        querystring: ListUrlsQuerySchema,
      },
    },
    async (request, reply) => {
      const urls = await app.services.urls.listUrlsForDomain(request.params.domainId, request.query);
      reply.ok({ items: urls });
    }
  );

  app.get(
    '/domains/:domainId/urls/:urlId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['domainId', 'urlId'],
          additionalProperties: false,
          properties: {
            domainId: { type: 'string', minLength: 1 },
            urlId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const url = await app.services.urls.getUrlForDomain(request.params.domainId, request.params.urlId);
      reply.ok(url);
    }
  );

  app.get(
    '/urls/:urlId/crawls',
    {
      schema: {
        params: {
          type: 'object',
          required: ['urlId'],
          additionalProperties: false,
          properties: { urlId: { type: 'string', minLength: 1 } },
        },
        querystring: ListCrawlsQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.urls.listUrlCrawls(request.params.urlId, request.query);
      reply.ok(result);
    }
  );
}

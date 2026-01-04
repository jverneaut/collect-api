const DomainParamsSchema = {
  type: 'object',
  required: ['domainId'],
  additionalProperties: false,
  properties: { domainId: { type: 'string', minLength: 1 } },
};

const ListQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    status: { type: 'string', enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] },
    includeOverview: { type: 'boolean', default: false },
    overviewPreferStatus: { type: 'string', enum: ['ANY', 'SUCCESS'], default: 'SUCCESS' },
  },
};

const GetCrawlRunQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    includeUrls: { type: 'boolean', default: true },
    includeOverview: { type: 'boolean', default: true },
    overviewPreferStatus: { type: 'string', enum: ['ANY', 'SUCCESS'], default: 'SUCCESS' },
  },
};

export async function crawlRunRoutes(app) {
  app.get(
    '/domains/:domainId/crawl-runs',
    {
      schema: {
        tags: ['domains'],
        summary: 'List crawl runs for a domain',
        params: DomainParamsSchema,
        querystring: ListQuerySchema,
      },
    },
    async (request, reply) => {
      const items = await app.services.crawlRuns.listCrawlRunsForDomain(request.params.domainId, request.query);
      reply.ok({ items });
    }
  );

  app.get(
    '/crawl-runs/:crawlRunId',
    {
      schema: {
        tags: ['crawls'],
        summary: 'Get a crawl run by id',
        params: {
          type: 'object',
          required: ['crawlRunId'],
          additionalProperties: false,
          properties: { crawlRunId: { type: 'string', minLength: 1 } },
        },
        querystring: GetCrawlRunQuerySchema,
      },
    },
    async (request, reply) => {
      const crawlRun = await app.services.crawlRuns.getCrawlRunWithResults(request.params.crawlRunId, request.query);
      reply.ok(crawlRun);
    }
  );
}

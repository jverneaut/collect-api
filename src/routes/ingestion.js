const DomainParamsSchema = {
  type: 'object',
  required: ['domainId'],
  additionalProperties: false,
  properties: { domainId: { type: 'string', minLength: 1 } },
};

const IngestBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    isShopify: { type: 'boolean' },
    maxUrls: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
    urlConcurrency: { type: 'integer', minimum: 1, maximum: 20, default: 3 },
    screenshot: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['png', 'jpeg'], default: 'png' },
        fullPage: { type: 'boolean', default: true },
        adblock: { type: 'boolean', default: true },
        waitMs: { type: 'integer', minimum: 0, maximum: 60000, default: 500 },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000, default: 60000 },
      },
    },
    technologies: {
      type: 'object',
      additionalProperties: false,
      properties: {
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000, default: 60000 },
      },
    },
  },
};

export async function ingestionRoutes(app) {
  app.post(
    '/domains/:domainId/ingest',
    {
      schema: {
        tags: ['domains'],
        summary: 'Discover URLs and crawl them',
        params: DomainParamsSchema,
        body: IngestBodySchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.crawlRuns.requestDomainCrawlRun(request.params.domainId, request.body ?? {});
      reply.code(202).ok(result);
    }
  );
}

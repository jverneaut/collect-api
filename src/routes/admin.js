const ReviewListQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  },
};

const CrawlRunParamsSchema = {
  type: 'object',
  required: ['crawlRunId'],
  additionalProperties: false,
  properties: { crawlRunId: { type: 'string', minLength: 1 } },
};

const SavePublicationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    domainIsPublished: { type: 'boolean' },
    crawlRunIsPublished: { type: 'boolean' },
    crawlRunTags: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    markReviewed: { type: 'boolean', default: true },
    crawlsToPublish: { type: 'array', items: { type: 'string' }, maxItems: 500, default: [] },
    crawlsToUnpublish: { type: 'array', items: { type: 'string' }, maxItems: 500, default: [] },
    sectionsToPublish: { type: 'array', items: { type: 'string' }, maxItems: 2000, default: [] },
    sectionsToUnpublish: { type: 'array', items: { type: 'string' }, maxItems: 2000, default: [] },
  },
};

export async function adminRoutes(app) {
  app.get(
    '/review/count',
    {
      schema: {
        tags: ['admin'],
        summary: 'Count domains / crawl runs pending review',
      },
    },
    async (_request, reply) => {
      const result = await app.services.publishing.getReviewCount();
      reply.ok(result);
    },
  );

  app.get(
    '/review/domains',
    {
      schema: {
        tags: ['admin'],
        summary: 'List domains with pending crawl runs',
        querystring: ReviewListQuerySchema,
      },
    },
    async (request, reply) => {
      const items = await app.services.publishing.listDomainsToReview(request.query);
      reply.ok({ items });
    },
  );

  app.patch(
    '/crawl-runs/:crawlRunId/publication',
    {
      schema: {
        tags: ['admin'],
        summary: 'Save publication flags for a crawl run',
        params: CrawlRunParamsSchema,
        body: SavePublicationSchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.publishing.saveCrawlRunPublication(
        request.params.crawlRunId,
        request.body,
      );
      reply.ok(result);
    },
  );
}


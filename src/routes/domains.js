const DomainInputSchema = {
  type: 'object',
  required: ['domain'],
  additionalProperties: false,
  properties: {
    domain: { type: 'string', minLength: 1 },
    createHomepageUrl: { type: 'boolean', default: true },
    createInitialCrawl: { type: 'boolean', default: true },
  },
};

const ListQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    cursor: { type: 'string' },
    search: { type: 'string' },
    includeHomepage: { type: 'boolean', default: true },
  },
};

const GetQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    includeUrls: { type: 'boolean', default: true },
    includeLatestCrawls: { type: 'boolean', default: true },
    includeProfile: { type: 'boolean', default: true },
    latestCrawlStatus: { type: 'string', enum: ['ANY', 'SUCCESS'], default: 'ANY' },
  },
};

export async function domainRoutes(app) {
  app.post('/', { schema: { body: DomainInputSchema } }, async (request, reply) => {
    const result = await app.services.domains.createDomain(request.body);
    reply.code(result.statusCode).ok(result.data);
  });

  app.get('/', { schema: { querystring: ListQuerySchema } }, async (request, reply) => {
    const result = await app.services.domains.listDomains(request.query);
    reply.ok(result);
  });

  app.get(
    '/:domainId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['domainId'],
          additionalProperties: false,
          properties: { domainId: { type: 'string', minLength: 1 } },
        },
        querystring: GetQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.domains.getDomain(request.params.domainId, request.query);
      reply.ok(result);
    }
  );

  app.delete(
    '/:domainId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['domainId'],
          additionalProperties: false,
          properties: { domainId: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const result = await app.services.domains.deleteDomain(request.params.domainId);
      reply.ok(result);
    }
  );
}

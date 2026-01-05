const DomainInputSchema = {
  type: "object",
  required: ["domain"],
  additionalProperties: false,
  properties: {
    domain: { type: "string", minLength: 1 },
    createHomepageUrl: { type: "boolean", default: false },
    createInitialCrawl: { type: "boolean", default: true },
    enqueueIngestion: { type: "boolean", default: true },
    ingestion: {
      type: "object",
      additionalProperties: false,
      properties: {
        isShopify: { type: "boolean" },
        maxUrls: { type: "integer", minimum: 1, maximum: 200 },
        urlConcurrency: { type: "integer", minimum: 1, maximum: 20 },
        screenshot: {
          type: "object",
          additionalProperties: false,
          properties: {
            format: { type: "string", enum: ["png", "jpeg"] },
            fullPage: { type: "boolean" },
            adblock: { type: "boolean" },
            waitMs: { type: "integer", minimum: 0, maximum: 60000 },
            timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
          },
        },
        technologies: {
          type: "object",
          additionalProperties: false,
          properties: {
            scope: {
              type: "string",
              enum: ["homepage", "per_url"],
              default: "homepage",
            },
            timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
          },
        },
      },
    },
  },
};

const ListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    cursor: { type: "string" },
    search: { type: "string" },
    includeHomepage: { type: "boolean", default: true },
  },
};

const GetQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    includeUrls: { type: "boolean", default: true },
    includeLatestCrawls: { type: "boolean", default: true },
    includeProfile: { type: "boolean", default: true },
    includeDerived: { type: "boolean", default: true },
    urlsScope: {
      type: "string",
      enum: ["all", "latest_crawl_run", "crawl_run"],
      default: "latest_crawl_run",
    },
    urlsCrawlRunId: { type: "string", minLength: 1 },
    urlsPreferRunStatus: {
      type: "string",
      enum: ["ANY", "SUCCESS"],
      default: "SUCCESS",
    },
    latestCrawlStatus: {
      type: "string",
      enum: ["ANY", "SUCCESS"],
      default: "ANY",
    },
    derivedPreferStatus: {
      type: "string",
      enum: ["ANY", "SUCCESS"],
      default: "SUCCESS",
    },
  },
};

const PatchDomainSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    isPublished: { type: "boolean" },
  },
};

export async function domainRoutes(app) {
  app.post(
    "/",
    { schema: { body: DomainInputSchema } },
    async (request, reply) => {
      const result = await app.services.domains.createDomain(request.body);
      reply.code(result.statusCode).ok(result.data);
    },
  );

  app.get(
    "/",
    { schema: { querystring: ListQuerySchema } },
    async (request, reply) => {
      const result = await app.services.domains.listDomains(request.query);
      reply.ok(result);
    },
  );

  app.get(
    "/:domainId",
    {
      schema: {
        params: {
          type: "object",
          required: ["domainId"],
          additionalProperties: false,
          properties: { domainId: { type: "string", minLength: 1 } },
        },
        querystring: GetQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.domains.getDomain(
        request.params.domainId,
        request.query,
      );
      reply.ok(result);
    },
  );

  app.patch(
    "/:domainId",
    {
      schema: {
        params: {
          type: "object",
          required: ["domainId"],
          additionalProperties: false,
          properties: { domainId: { type: "string", minLength: 1 } },
        },
        body: PatchDomainSchema,
      },
    },
    async (request, reply) => {
      const result = await app.services.domains.patchDomain(
        request.params.domainId,
        request.body,
      );
      reply.ok(result);
    },
  );

  app.delete(
    "/:domainId",
    {
      schema: {
        params: {
          type: "object",
          required: ["domainId"],
          additionalProperties: false,
          properties: { domainId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const result = await app.services.domains.deleteDomain(
        request.params.domainId,
      );
      reply.ok(result);
    },
  );
}

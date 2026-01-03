import { clampLimit } from '../lib/pagination.js';

const LatestSitesQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

export async function feedRoutes(app) {
  app.get('/feed/latest-sites', { schema: { querystring: LatestSitesQuerySchema } }, async (request, reply) => {
    const result = await app.services.feed.latestSites(request.query);
    reply.ok(result);
  });
}

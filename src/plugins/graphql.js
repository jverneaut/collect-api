import fp from 'fastify-plugin';
import mercurius from 'mercurius';
import { makeGraphqlSchema, makeGraphqlResolvers } from '../graphql/index.js';

export const graphqlPlugin = fp(async (app) => {
  if (!app.config.GRAPHQL_ENABLED) return;

  await app.register(mercurius, {
    schema: makeGraphqlSchema(),
    resolvers: makeGraphqlResolvers(app),
    context: (request) => ({
      request,
      domainDerivedCache: new Map(),
      domainUrlsCountCache: new Map(),
      domainHomepageUrlCache: new Map(),
    }),
    graphiql: app.config.NODE_ENV !== 'production',
  });
});

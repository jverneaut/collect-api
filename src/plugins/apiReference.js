import fp from 'fastify-plugin';
import scalarApiReference from '@scalar/fastify-api-reference';

export const apiReferencePlugin = fp(async (app) => {
  if (!app.config.API_REFERENCE_ENABLED) return;

  await app.register(scalarApiReference, {
    routePrefix: '/reference',
    configuration: {
      theme: 'purple',
    },
  });
});


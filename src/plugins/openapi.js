import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';

export const openapiPlugin = fp(async (app) => {
  if (!app.config.OPENAPI_ENABLED) return;

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Collect.Design API',
        description: 'Collect.Design domains, URLs and crawl timelines API.',
        version: '1.0.0',
      },
    },
  });
});


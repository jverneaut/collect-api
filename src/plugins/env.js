import fp from 'fastify-plugin';
import env from '@fastify/env';

export const envPlugin = fp(async (app) => {
  const schema = {
    type: 'object',
    required: ['DATABASE_URL', 'HOST', 'PORT'],
    properties: {
      NODE_ENV: { type: 'string', default: 'development' },
      DATABASE_URL: { type: 'string' },
      HOST: { type: 'string', default: '0.0.0.0' },
      PORT: { type: 'integer', default: 3000 },
      LOG_LEVEL: { type: 'string', default: 'info' },
      GRAPHQL_ENABLED: { type: 'boolean', default: true },
      METRICS_ENABLED: { type: 'boolean', default: true },
      OPENAPI_ENABLED: { type: 'boolean', default: true },
      API_REFERENCE_ENABLED: { type: 'boolean', default: true },
      STORAGE_DIR: { type: 'string', default: './storage' },
      STORAGE_PUBLIC_PATH: { type: 'string', default: '/storage' },
      MB_PAGES_FINDER_BASE_URL: { type: 'string' },
      MB_SCREENSHOTTER_BASE_URL: { type: 'string' },
      MB_TECHNOLOGIES_FINDER_BASE_URL: { type: 'string' },
      JOBS_CONCURRENCY: { type: 'integer', default: 2 },
    },
  };

  await app.register(env, {
    schema,
    dotenv: false,
  });
});

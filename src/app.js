import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { randomUUID } from 'crypto';

import { envPlugin } from './plugins/env.js';
import { responsePlugin } from './plugins/response.js';
import { prismaPlugin } from './plugins/prisma.js';
import { servicesPlugin } from './plugins/services.js';
import { metricsPlugin } from './plugins/metrics.js';
import { graphqlPlugin } from './plugins/graphql.js';

import { healthRoutes } from './routes/health.js';
import { domainRoutes } from './routes/domains.js';
import { urlRoutes } from './routes/urls.js';
import { crawlRoutes } from './routes/crawls.js';
import { taxonomyRoutes } from './routes/taxonomies.js';
import { feedRoutes } from './routes/feed.js';

export async function buildApp(options = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    genReqId: () => randomUUID(),
    ...options,
  });

  await app.register(envPlugin);
  await app.register(sensible);
  await app.register(responsePlugin);
  await app.register(prismaPlugin);
  await app.register(servicesPlugin);
  await app.register(metricsPlugin);
  await app.register(graphqlPlugin);

  await app.register(healthRoutes);
  await app.register(domainRoutes, { prefix: '/domains' });
  await app.register(urlRoutes);
  await app.register(crawlRoutes);
  await app.register(taxonomyRoutes);
  await app.register(feedRoutes);

  return app;
}

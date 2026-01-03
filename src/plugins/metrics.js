import fp from 'fastify-plugin';
import client from 'prom-client';

export const metricsPlugin = fp(async (app) => {
  if (!app.config.METRICS_ENABLED) return;

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestDurationMs = new client.Histogram({
    name: 'http_request_duration_ms',
    help: 'Duration of HTTP requests in ms',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [register],
  });

  app.addHook('onRequest', async (request) => {
    request.metricsStart = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = request.metricsStart;
    if (!start) return;
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const route = request.routeOptions?.url || request.raw.url?.split('?')?.[0] || 'unknown';
    httpRequestDurationMs
      .labels(request.method, route, String(reply.statusCode))
      .observe(durationMs);
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', register.contentType);
    return register.metrics();
  });
});

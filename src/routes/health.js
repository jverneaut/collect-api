export async function healthRoutes(app) {
  app.get('/health', async (_request, reply) => {
    reply.ok({ status: 'ok' });
  });

  app.get('/ready', async (_request, reply) => {
    await app.prisma.$queryRaw`SELECT 1`;
    reply.ok({ status: 'ready' });
  });
}


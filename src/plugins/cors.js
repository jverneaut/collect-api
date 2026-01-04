import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export const corsPlugin = fp(async (app) => {
  await app.register(cors, {
    origin: true,
  });
});


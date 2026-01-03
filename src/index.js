import 'dotenv/config';
import { buildApp } from './app.js';

const app = await buildApp();

const host = app.config.HOST;
const port = app.config.PORT;

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error({ error }, 'Failed to start server');
  process.exit(1);
}


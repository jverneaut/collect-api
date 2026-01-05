import 'dotenv/config';
import { buildApp } from './app.js';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function maybeMigrateSqlite() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const autoMigrate = process.env.AUTO_MIGRATE_SQLITE !== 'false';
  if (!autoMigrate) return;
  if (!databaseUrl.startsWith('file:')) return;

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrateScript = path.join(rootDir, 'scripts', 'migrate-sqlite.js');

  try {
    await execFileAsync(process.execPath, [migrateScript], { cwd: rootDir });
  } catch (error) {
    // Best effort: keep booting, but make the issue visible.
    console.error('SQLite migration failed. You may need to run `npm run db:migrate`.', error);
  }
}

await maybeMigrateSqlite();

const app = await buildApp();

const host = app.config.HOST;
const port = app.config.PORT;

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error({ error }, 'Failed to start server');
  process.exit(1);
}

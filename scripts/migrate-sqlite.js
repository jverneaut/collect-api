import { access } from 'fs/promises';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function sqlite(dbPath, sql) {
  const { stdout } = await execFileAsync('sqlite3', [dbPath, sql], { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function parseTableInfo(output) {
  // Default sqlite3 output: cid|name|type|notnull|dflt_value|pk
  return String(output || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|');
      return { name: parts[1] };
    });
}

async function main() {
  const dbPath = path.resolve('prisma', 'dev.db');

  try {
    await access(dbPath);
  } catch {
    process.stdout.write(`No SQLite DB found at ${dbPath}\n`);
    process.stdout.write('Run `npm run db:init` first.\n');
    return;
  }

  const columns = parseTableInfo(await sqlite(dbPath, 'PRAGMA table_info(UrlCrawl);'));
  const hasCrawlRunId = columns.some((c) => c.name === 'crawlRunId');

  await sqlite(dbPath, 'PRAGMA foreign_keys = ON;');

  await sqlite(
    dbPath,
    `
    CREATE TABLE IF NOT EXISTS CrawlRun (
      id TEXT PRIMARY KEY NOT NULL,
      domainId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      jobId TEXT,
      startedAt DATETIME,
      finishedAt DATETIME,
      error TEXT,
      optionsJson TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (domainId) REFERENCES Domain(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS CrawlRun_domainId_createdAt_idx ON CrawlRun(domainId, createdAt);
    CREATE INDEX IF NOT EXISTS CrawlRun_status_createdAt_idx ON CrawlRun(status, createdAt);
  `
  );

  if (!hasCrawlRunId) {
    await sqlite(dbPath, 'ALTER TABLE UrlCrawl ADD COLUMN crawlRunId TEXT;');
  }

  await sqlite(
    dbPath,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS UrlCrawl_crawlRunId_urlId_unique ON UrlCrawl(crawlRunId, urlId);
    CREATE INDEX IF NOT EXISTS UrlCrawl_crawlRunId_createdAt_idx ON UrlCrawl(crawlRunId, createdAt);
  `
  );

  process.stdout.write('SQLite migration applied.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


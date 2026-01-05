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
  const hasUrlCrawlIsPublished = columns.some((c) => c.name === 'isPublished');

  const domainColumns = parseTableInfo(await sqlite(dbPath, 'PRAGMA table_info(Domain);'));
  const hasDomainIsPublished = domainColumns.some((c) => c.name === 'isPublished');

  const crawlRunColumns = parseTableInfo(await sqlite(dbPath, 'PRAGMA table_info(CrawlRun);'));
  const hasCrawlRunReviewStatus = crawlRunColumns.some((c) => c.name === 'reviewStatus');
  const hasCrawlRunReviewedAt = crawlRunColumns.some((c) => c.name === 'reviewedAt');
  const hasCrawlRunIsPublished = crawlRunColumns.some((c) => c.name === 'isPublished');
  const hasCrawlRunPublishedAt = crawlRunColumns.some((c) => c.name === 'publishedAt');
  const hasCrawlRunTagsJson = crawlRunColumns.some((c) => c.name === 'tagsJson');

  const screenshotColumns = parseTableInfo(await sqlite(dbPath, 'PRAGMA table_info(Screenshot);'));
  const hasScreenshotIsPublished = screenshotColumns.some((c) => c.name === 'isPublished');
  const hasScreenshotProminentColor = screenshotColumns.some((c) => c.name === 'prominentColor');

  const sectionColumns = parseTableInfo(await sqlite(dbPath, 'PRAGMA table_info(SectionScreenshot);'));
  const hasSectionIsPublished = sectionColumns.some((c) => c.name === 'isPublished');

  const technologyColumns = parseTableInfo(await sqlite(dbPath, 'PRAGMA table_info(Technology);'));
  const hasTechnologyIconStorageKey = technologyColumns.some((c) => c.name === 'iconStorageKey');
  const hasTechnologyIconPublicUrl = technologyColumns.some((c) => c.name === 'iconPublicUrl');
  const hasTechnologyIconContentType = technologyColumns.some((c) => c.name === 'iconContentType');

  await sqlite(dbPath, 'PRAGMA foreign_keys = ON;');

  await sqlite(
    dbPath,
    `
    CREATE TABLE IF NOT EXISTS CrawlRun (
      id TEXT PRIMARY KEY NOT NULL,
      domainId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reviewStatus TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      reviewedAt DATETIME,
      isPublished INTEGER NOT NULL DEFAULT 0,
      publishedAt DATETIME,
      tagsJson TEXT,
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

    CREATE TABLE IF NOT EXISTS SectionScreenshot (
      id TEXT PRIMARY KEY NOT NULL,
      crawlId TEXT NOT NULL,
      "index" INTEGER NOT NULL,
      isPublished INTEGER NOT NULL DEFAULT 0,
      clipJson TEXT,
      elementJson TEXT,
      format TEXT,
      storageKey TEXT,
      publicUrl TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (crawlId) REFERENCES UrlCrawl(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS SectionScreenshot_crawlId_index_unique ON SectionScreenshot(crawlId, "index");
    CREATE INDEX IF NOT EXISTS SectionScreenshot_crawlId_idx ON SectionScreenshot(crawlId);
  `
  );

  if (!hasCrawlRunId) {
    await sqlite(dbPath, 'ALTER TABLE UrlCrawl ADD COLUMN crawlRunId TEXT;');
  }

  if (!hasUrlCrawlIsPublished) {
    await sqlite(dbPath, "ALTER TABLE UrlCrawl ADD COLUMN isPublished INTEGER NOT NULL DEFAULT 0;");
  }

  if (!hasDomainIsPublished) {
    await sqlite(dbPath, "ALTER TABLE Domain ADD COLUMN isPublished INTEGER NOT NULL DEFAULT 0;");
  }

  if (!hasCrawlRunReviewStatus) {
    await sqlite(dbPath, "ALTER TABLE CrawlRun ADD COLUMN reviewStatus TEXT NOT NULL DEFAULT 'PENDING_REVIEW';");
  }
  if (!hasCrawlRunReviewedAt) {
    await sqlite(dbPath, 'ALTER TABLE CrawlRun ADD COLUMN reviewedAt DATETIME;');
  }
  if (!hasCrawlRunIsPublished) {
    await sqlite(dbPath, 'ALTER TABLE CrawlRun ADD COLUMN isPublished INTEGER NOT NULL DEFAULT 0;');
  }
  if (!hasCrawlRunPublishedAt) {
    await sqlite(dbPath, 'ALTER TABLE CrawlRun ADD COLUMN publishedAt DATETIME;');
  }
  if (!hasCrawlRunTagsJson) {
    await sqlite(dbPath, 'ALTER TABLE CrawlRun ADD COLUMN tagsJson TEXT;');
  }

  if (!hasScreenshotIsPublished) {
    await sqlite(dbPath, 'ALTER TABLE Screenshot ADD COLUMN isPublished INTEGER NOT NULL DEFAULT 0;');
  }

  if (!hasScreenshotProminentColor) {
    await sqlite(dbPath, 'ALTER TABLE Screenshot ADD COLUMN prominentColor TEXT;');
  }

  if (!hasSectionIsPublished) {
    await sqlite(dbPath, 'ALTER TABLE SectionScreenshot ADD COLUMN isPublished INTEGER NOT NULL DEFAULT 0;');
  }

  if (!hasTechnologyIconStorageKey) {
    await sqlite(dbPath, 'ALTER TABLE Technology ADD COLUMN iconStorageKey TEXT;');
  }
  if (!hasTechnologyIconPublicUrl) {
    await sqlite(dbPath, 'ALTER TABLE Technology ADD COLUMN iconPublicUrl TEXT;');
  }
  if (!hasTechnologyIconContentType) {
    await sqlite(dbPath, 'ALTER TABLE Technology ADD COLUMN iconContentType TEXT;');
  }

  await sqlite(
    dbPath,
    `
    CREATE INDEX IF NOT EXISTS CrawlRun_reviewStatus_createdAt_idx ON CrawlRun(reviewStatus, createdAt);
    CREATE INDEX IF NOT EXISTS CrawlRun_isPublished_publishedAt_idx ON CrawlRun(isPublished, publishedAt);
  `,
  );

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

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Domain (
  id TEXT PRIMARY KEY NOT NULL,
  host TEXT NOT NULL UNIQUE,
  canonicalUrl TEXT NOT NULL,
  displayName TEXT,
  isPublished INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS DomainProfile (
  domainId TEXT PRIMARY KEY NOT NULL,
  sourceCrawlId TEXT,
  name TEXT,
  description TEXT,
  primaryColorsJson TEXT,
  styleTagsJson TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domainId) REFERENCES Domain(id) ON DELETE CASCADE
);

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
CREATE INDEX IF NOT EXISTS CrawlRun_reviewStatus_createdAt_idx ON CrawlRun(reviewStatus, createdAt);
CREATE INDEX IF NOT EXISTS CrawlRun_isPublished_publishedAt_idx ON CrawlRun(isPublished, publishedAt);

CREATE TABLE IF NOT EXISTS Url (
  id TEXT PRIMARY KEY NOT NULL,
  domainId TEXT NOT NULL,
  path TEXT NOT NULL,
  normalizedUrl TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'OTHER',
  isCanonical INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domainId) REFERENCES Domain(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS Url_domainId_path_unique ON Url(domainId, path);
CREATE INDEX IF NOT EXISTS Url_domainId_type_idx ON Url(domainId, type);

CREATE TABLE IF NOT EXISTS UrlCrawl (
  id TEXT PRIMARY KEY NOT NULL,
  urlId TEXT NOT NULL,
  crawlRunId TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  isPublished INTEGER NOT NULL DEFAULT 0,
  startedAt DATETIME,
  finishedAt DATETIME,
  crawledAt DATETIME,
  httpStatus INTEGER,
  finalUrl TEXT,
  title TEXT,
  metaDescription TEXT,
  language TEXT,
  contentHash TEXT,
  error TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (urlId) REFERENCES Url(id) ON DELETE CASCADE,
  FOREIGN KEY (crawlRunId) REFERENCES CrawlRun(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS UrlCrawl_crawlRunId_urlId_unique ON UrlCrawl(crawlRunId, urlId);
CREATE INDEX IF NOT EXISTS UrlCrawl_urlId_createdAt_idx ON UrlCrawl(urlId, createdAt);
CREATE INDEX IF NOT EXISTS UrlCrawl_crawlRunId_createdAt_idx ON UrlCrawl(crawlRunId, createdAt);
CREATE INDEX IF NOT EXISTS UrlCrawl_status_createdAt_idx ON UrlCrawl(status, createdAt);

CREATE TABLE IF NOT EXISTS CrawlTask (
  id TEXT PRIMARY KEY NOT NULL,
  crawlId TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  lastAttemptAt DATETIME,
  startedAt DATETIME,
  finishedAt DATETIME,
  error TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (crawlId) REFERENCES UrlCrawl(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS CrawlTask_crawlId_type_unique ON CrawlTask(crawlId, type);
CREATE INDEX IF NOT EXISTS CrawlTask_status_type_idx ON CrawlTask(status, type);

CREATE TABLE IF NOT EXISTS Screenshot (
  id TEXT PRIMARY KEY NOT NULL,
  crawlId TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'FULL_PAGE',
  isPublished INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  format TEXT,
  storageKey TEXT,
  publicUrl TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (crawlId) REFERENCES UrlCrawl(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS Screenshot_crawlId_idx ON Screenshot(crawlId);

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

CREATE TABLE IF NOT EXISTS Category (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS CrawlCategory (
  crawlId TEXT NOT NULL,
  categoryId TEXT NOT NULL,
  confidence REAL,
  PRIMARY KEY (crawlId, categoryId),
  FOREIGN KEY (crawlId) REFERENCES UrlCrawl(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES Category(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS CrawlCategory_categoryId_idx ON CrawlCategory(categoryId);

CREATE TABLE IF NOT EXISTS Technology (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  websiteUrl TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS CrawlTechnology (
  crawlId TEXT NOT NULL,
  technologyId TEXT NOT NULL,
  confidence REAL,
  PRIMARY KEY (crawlId, technologyId),
  FOREIGN KEY (crawlId) REFERENCES UrlCrawl(id) ON DELETE CASCADE,
  FOREIGN KEY (technologyId) REFERENCES Technology(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS CrawlTechnology_technologyId_idx ON CrawlTechnology(technologyId);

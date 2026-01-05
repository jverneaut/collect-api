import fp from 'fastify-plugin';
import { makeDomainsService } from '../services/domains.js';
import { makeUrlsService } from '../services/urls.js';
import { makeCrawlsService } from '../services/crawls.js';
import { makeCrawlRunsService } from '../services/crawl-runs.js';
import { makeTaxonomiesService } from '../services/taxonomies.js';
import { makeFeedService } from '../services/feed.js';
import { makeIngestionService } from '../services/ingestion.js';
import { makePublishingService } from '../services/publishing.js';

export const servicesPlugin = fp(async (app) => {
  app.decorate('services', {
    domains: makeDomainsService(app),
    urls: makeUrlsService(app),
    crawls: makeCrawlsService(app),
    crawlRuns: makeCrawlRunsService(app),
    taxonomies: makeTaxonomiesService(app),
    feed: makeFeedService(app),
    ingestion: makeIngestionService(app),
    publishing: makePublishingService(app),
  });
});

import { normalizeUrlForDomainHost } from '../lib/normalize.js';
import { clampLimit, decodeCursor, encodeCursor, makeCreatedAtCursorWhere } from '../lib/pagination.js';

function normalizeUrlsScope(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['all', 'any'].includes(normalized)) return 'ALL';
  if (['crawl_run', 'crawl-run', 'crawlrun', 'run'].includes(normalized)) return 'CRAWL_RUN';
  return 'LATEST_CRAWL_RUN';
}

function normalizePreferStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized === 'ANY' ? 'ANY' : 'SUCCESS';
}

export function makeUrlsService(app) {
  return {
    async getUrlById(urlId) {
      return app.prisma.url.findUnique({ where: { id: urlId } });
    },

    async createUrlForDomain(domainId, input) {
      const domain = await app.prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      return this.upsertUrlForDomain(domain.id, input);
    },

    async upsertUrlForDomain(domainId, input) {
      const domain = await app.prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      let normalized;
      try {
        normalized = normalizeUrlForDomainHost(input.url, domain.host);
      } catch (error) {
        throw app.httpErrors.badRequest(error?.message || 'Invalid URL');
      }

      return app.prisma.url.upsert({
        where: { normalizedUrl: normalized.normalizedUrl },
        update: {
          type: input.type ?? undefined,
          isCanonical: input.isCanonical ?? undefined,
        },
        create: {
          domainId: domain.id,
          path: normalized.path,
          normalizedUrl: normalized.normalizedUrl,
          type: input.type ?? 'OTHER',
          isCanonical: input.isCanonical ?? false,
        },
      });
    },

    async listUrlsForDomain(domainId, options = {}) {
      const domain = await app.prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      const scope = normalizeUrlsScope(options.scope);
      const preferStatus = normalizePreferStatus(options.preferRunStatus);

      let crawlRunId = null;
      if (scope === 'CRAWL_RUN') {
        if (!options.crawlRunId) throw app.httpErrors.badRequest('crawlRunId is required when scope=crawl_run');
        crawlRunId = options.crawlRunId;
      }

      if (scope === 'LATEST_CRAWL_RUN') {
        const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
        const successful =
          preferStatus === 'SUCCESS'
            ? await app.prisma.crawlRun.findFirst({
                where: { domainId: domain.id, status: 'SUCCESS' },
                orderBy,
              })
            : null;
        const latest = successful ?? (await app.prisma.crawlRun.findFirst({ where: { domainId: domain.id }, orderBy }));
        crawlRunId = latest?.id ?? null;
      }

      return app.prisma.url.findMany({
        where: {
          domainId: domain.id,
          ...(options.type ? { type: options.type } : {}),
          ...(crawlRunId ? { crawls: { some: { crawlRunId } } } : {}),
        },
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
        take: options.limit ? clampLimit(options.limit, { max: 200, fallback: 50 }) : undefined,
      });
    },

    async getUrlForDomain(domainId, urlId, { includeLatestCrawl = true } = {}) {
      const url = await app.prisma.url.findFirst({
        where: { id: urlId, domainId },
        include: includeLatestCrawl
          ? {
              crawls: {
                orderBy: [{ createdAt: 'desc' }],
                take: 1,
                include: {
                  tasks: true,
                  screenshots: { orderBy: [{ createdAt: 'desc' }], take: 1 },
                  categories: { include: { category: true } },
                  technologies: { include: { technology: true } },
                },
              },
            }
          : undefined,
      });

      if (!url) throw app.httpErrors.notFound('URL not found');
      return url;
    },

    async listUrlCrawls(urlId, query) {
      const limit = clampLimit(query.limit, { max: 200, fallback: 20 });
      const cursor = decodeCursor(query.cursor);
      const cursorWhere = makeCreatedAtCursorWhere(cursor);

      const where = {
        urlId,
        ...(query.status ? { status: query.status } : {}),
        ...cursorWhere,
      };

      const items = await app.prisma.urlCrawl.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });

      const nextCursor =
        items.length === limit
          ? encodeCursor({ createdAt: items[items.length - 1].createdAt, id: items[items.length - 1].id })
          : null;

      return { items, nextCursor };
    },
  };
}

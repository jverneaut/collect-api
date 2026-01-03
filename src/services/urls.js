import { normalizeUrlInput } from '../lib/normalize.js';
import { clampLimit, decodeCursor, encodeCursor, makeCreatedAtCursorWhere } from '../lib/pagination.js';

export function makeUrlsService(app) {
  return {
    async getUrlById(urlId) {
      return app.prisma.url.findUnique({ where: { id: urlId } });
    },

    async createUrlForDomain(domainId, input) {
      const domain = await app.prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      const normalized = normalizeUrlInput(input.url);
      if (normalized.host !== domain.host) {
        throw app.httpErrors.badRequest('URL host must match domain host');
      }

      return app.prisma.url.create({
        data: {
          domainId: domain.id,
          path: normalized.path,
          normalizedUrl: normalized.normalizedUrl,
          type: input.type,
          isCanonical: input.isCanonical,
        },
      });
    },

    async listUrlsForDomain(domainId, options = {}) {
      const domain = await app.prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw app.httpErrors.notFound('Domain not found');

      return app.prisma.url.findMany({
        where: {
          domainId: domain.id,
          ...(options.type ? { type: options.type } : {}),
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

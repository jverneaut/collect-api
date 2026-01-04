# Collect.Design API

Fastify + Prisma API for Collect.Design domains, URLs and crawl timelines.

## Setup (SQLite dev)

1. Create `.env` from `.env.example` (SQLite uses `file:./dev.db`, relative to `prisma/schema.prisma`)
2. Install deps: `npm install`
3. Init DB (SQLite): `npm run db:init` (existing DB upgrades: `npm run db:migrate`, reset: `npm run db:reset`)
4. Seed dev data: `npm run seed` (refuses to run with `NODE_ENV=production`)
5. Start: `npm run dev`

Health: `GET /health`  
Ready: `GET /ready`  
Metrics (if enabled): `GET /metrics`  
GraphQL (if enabled): `POST /graphql` and GraphiQL at `/graphiql`
API Reference (if enabled): `/reference`
Static storage (screenshots): `GET /storage/*`

## Ingestion (URL discovery + crawl)

The ingestion flow uses the micro-backend clients:

- `MB_PAGES_FINDER_BASE_URL`
- `MB_SCREENSHOTTER_BASE_URL`
- `MB_TECHNOLOGIES_FINDER_BASE_URL`

Trigger a run (async job):

- `POST /domains/:domainId/ingest`
- Poll job: `GET /jobs/:jobId`
- List crawl runs for a domain: `GET /domains/:domainId/crawl-runs`
- Get crawl run results (overview + found URLs): `GET /crawl-runs/:crawlRunId`

Homepage URL:

- The API does not precreate a homepage URL by default (some sites use `/en`, etc.); ingestion relies on the homepage returned by the pages-finder.

Shopify hint:

- If you pass `{ "isShopify": true }` to ingestion, the API forwards it to the pages-finder to discover Shopify-specific pages.
- If omitted, the API tries to detect Shopify from an initial technologies scan of the homepage and forwards `isShopify` automatically.

Technologies scope:

- By default, technologies are detected once from the homepage and copied to every crawled URL (faster and matches most sites).
- To detect technologies per URL, pass `{ "technologies": { "scope": "per_url" } }`.

URL visibility:

- URLs remain stored even if they stop being discovered in later runs.
- Default listing hides URLs not found in the latest crawl run: `GET /domains/:domainId/urls?scope=latest_crawl_run`.
- You can inspect a specific run: `GET /domains/:domainId/urls?scope=crawl_run&crawlRunId=...` or `GET /crawl-runs/:crawlRunId`.

## Core REST endpoints

- `POST /domains`
- `GET /domains`
- `GET /domains/:domainId`
- `POST /domains/:domainId/urls`
- `GET /domains/:domainId/urls` (by default only URLs found in the latest crawl run)
- `GET /domains/:domainId/urls/:urlId`
- `POST /domains/:domainId/ingest` (discover URLs + crawl them)
- `GET /domains/:domainId/crawl-runs` (domain-level crawl requests)
- `GET /crawl-runs/:crawlRunId` (includes per-run overview + URLs found by default)
- `POST /urls/:urlId/crawls`
- `GET /urls/:urlId/crawls`
- `GET /urls/:urlId/crawls/:crawlId`
- `PATCH /crawls/:crawlId`
- `PATCH /crawls/:crawlId/tasks/:taskType`
- `POST /crawls/:crawlId/screenshots`
- `PUT /crawls/:crawlId/categories`
- `PUT /crawls/:crawlId/technologies`
- `GET /feed/latest-sites`
- `GET /jobs`
- `GET /jobs/:jobId`

All responses use a consistent envelope:

```json
{
  "ok": true,
  "data": {
    /* ... */
  }
}
```

Errors:

```json
{ "ok": false, "error": { "code": "…", "message": "…", "details": {} } }
```

## Architecture

- Fastify plugins live in `src/plugins/*`.
- Shared business/data-access logic lives in `src/services/*` and is used by both REST routes (`src/routes/*`) and GraphQL resolvers (`src/graphql/index.js`).

## MySQL production

This repo includes `prisma/schema.mysql.prisma` (same models, MySQL provider). Use it when generating/migrating in production:

- `prisma generate --schema prisma/schema.mysql.prisma`
- `prisma migrate deploy --schema prisma/schema.mysql.prisma`

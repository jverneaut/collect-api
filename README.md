# Collect.Design API

Fastify + Prisma API for Collect.Design domains, URLs and crawl timelines.

## Setup (SQLite dev)

1. Create `.env` from `.env.example` (SQLite uses `file:./dev.db`, relative to `prisma/schema.prisma`)
2. Install deps: `npm install`
3. Init DB (SQLite): `npm run db:init`
4. Seed dev data: `npm run seed` (refuses to run with `NODE_ENV=production`)
4. Start: `npm run dev`

Health: `GET /health`  
Ready: `GET /ready`  
Metrics (if enabled): `GET /metrics`  
GraphQL (if enabled): `POST /graphql` and GraphiQL at `/graphiql`
API Reference (if enabled): `/reference`

## Core REST endpoints

- `POST /domains`
- `GET /domains`
- `GET /domains/:domainId`
- `POST /domains/:domainId/urls`
- `GET /domains/:domainId/urls`
- `GET /domains/:domainId/urls/:urlId`
- `POST /urls/:urlId/crawls`
- `GET /urls/:urlId/crawls`
- `GET /urls/:urlId/crawls/:crawlId`
- `PATCH /crawls/:crawlId`
- `PATCH /crawls/:crawlId/tasks/:taskType`
- `POST /crawls/:crawlId/screenshots`
- `PUT /crawls/:crawlId/categories`
- `PUT /crawls/:crawlId/technologies`
- `GET /feed/latest-sites`

All responses use a consistent envelope:

```json
{ "ok": true, "data": { /* ... */ } }
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

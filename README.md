# bolt

Sprint planning + execution workspace for Nick + Claudio.

## Monorepo
- `apps/web` React + Vite UI
- `apps/api` Fastify API
- `packages/shared` shared types

## Quick start
```bash
npm install
npm run dev:api
npm run dev:web
```

## Infra
```bash
docker compose up -d
```
(Postgres on 5432, MinIO on 9000/9001)

## Planning docs
See `/docs` for product, architecture, data model, API spec, and phased build plan.

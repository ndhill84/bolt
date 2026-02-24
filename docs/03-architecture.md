# Architecture

## Stack
- **Frontend:** React + Vite + TypeScript + TanStack Query + Tailwind.
- **Backend API:** Fastify + TypeScript.
- **DB:** PostgreSQL + Prisma ORM.
- **Storage:** S3-compatible object storage (AWS S3 / Cloudflare R2 / MinIO).
- **Auth (MVP-light):** single workspace token/session (expand later).

## System Components
1. **Web UI**
   - Board, Story Drawer, Files panel, Agent Activity dashboard.
2. **API Service**
   - Story lifecycle, notes, dependencies, uploads metadata, digests.
3. **Digest Engine**
   - Produces compact AI summaries from sprint state.
4. **Activity Ingestor**
   - Receives agent events and stores timeline/session updates.
5. **Object Storage Adapter**
   - Presigned upload/download URLs.

## Token-Efficient API Patterns
- Compact list endpoints; details fetched on demand.
- Pagination + cursor for all collections.
- `updated_since` filters for incremental refresh.
- Server-side digest endpoints to prevent large prompt payloads.
- Stable enums and concise keys in responses.
- Field projection (`fields`) and controlled expansion (`include`) on major endpoints.
- Batch mutations for high-churn sprint operations.

### Architectural Rule
Token efficiency is a first-order requirement, not a nice-to-have. For all new endpoints and UI data flows, optimize for frequent LLM usage first, while preserving full feature coverage.

## Deployment Targets
- Local dev via Docker Compose (Postgres + MinIO optional).
- Production on a single VM/container platform initially.

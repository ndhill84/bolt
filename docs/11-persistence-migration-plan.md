# Bolt Persistence Migration Plan (In-Memory → SQLite + Filesystem)

## Goal
Move Bolt from volatile in-memory runtime state to durable local storage without breaking the current UI/API contract.

Primary outcomes:
- Data survives API restarts
- Projects, stories, and context files are persistent first-class entities
- Zero external infrastructure (no Postgres, no MinIO, no Docker required)
- File storage is AI-agent friendly with extracted text and summaries
- Safe cutover with rollback path

---

## Scope

### In Scope
- SQLite-backed persistence for all entities
- Local filesystem file storage with AI-ready text extraction
- API compatibility with current frontend
- DB migrations + seed strategy
- Operational runbook (start, verify, rollback, reset)
- DELETE endpoints for all major entities

### Out of Scope (for this migration)
- Auth/RBAC
- Multi-tenant orgs/billing
- Full-text search engine (FTS5 could be added later as a follow-up)
- Cloud/S3 object storage
- File upload via multipart form (API accepts path/metadata; actual upload mechanism is a follow-up)

---

## Architecture Target

- **DB:** SQLite (via Prisma, WAL mode)
- **ORM:** Prisma with `provider = "sqlite"`
- **DB file:** `apps/api/data/bolt.db` (gitignored)
- **File storage:** local filesystem at `apps/api/data/files/{projectId}/{storyId}/{filename}`
- **App:** Fastify API (unchanged)
- **No external services required**

### SQLite Configuration
- Enable WAL mode on startup: `PRAGMA journal_mode=WAL;`
- Enable foreign keys: `PRAGMA foreign_keys=ON;`
- Busy timeout for concurrent reads: `PRAGMA busy_timeout=5000;`

---

## Data Model

### project
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK, `@default(uuid())` |
| name | String | Required |
| description | String? | Nullable |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

### story
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK |
| projectId | String | FK → project, indexed |
| title | String | Required |
| description | String? | |
| acceptanceCriteria | String? | |
| status | String | `waiting\|in_progress\|completed`, default `waiting` |
| priority | String | `low\|med\|high\|urgent`, default `med` |
| blocked | Boolean | Default false. **See note on computation below.** |
| points | Int? | |
| assignee | String? | |
| dueAt | DateTime? | |
| createdAt | DateTime | |
| updatedAt | DateTime | `@updatedAt` |

Index: `@@index([projectId, status])`

### story_label
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK |
| storyId | String | FK → story |
| label | String | e.g. "frontend", "bug", "demo" |

Unique: `@@unique([storyId, label])`

### story_note
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK |
| storyId | String | FK → story, cascade delete |
| author | String | |
| body | String | |
| kind | String | `note\|decision\|update`, default `note` |
| createdAt | DateTime | |

Index: `@@index([storyId, createdAt])`

### story_dependency
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK |
| storyId | String | FK → story, cascade delete |
| dependsOnStoryId | String | FK → story, cascade delete |
| type | String | `blocks`, default `blocks` |
| createdAt | DateTime | |

Unique: `@@unique([storyId, dependsOnStoryId])`

### file_asset
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK |
| projectId | String | FK → project |
| storyId | String? | FK → story, nullable |
| filename | String | |
| contentType | String | |
| byteSize | Int | Default 0 |
| filePath | String | Relative path under `data/files/` |
| textContent | String? | Extracted plain text for AI consumption |
| summary | String? | Short AI-generated summary of file |
| uploadedBy | String | |
| createdAt | DateTime | |

Index: `@@index([projectId, storyId, createdAt])`

### agent_session
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK |
| projectId | String | FK → project |
| title | String | |
| state | String | `planning\|coding\|testing\|blocked\|done` |
| startedAt | DateTime | `@default(now())` |
| lastHeartbeatAt | DateTime | |
| createdAt | DateTime | |

Index: `@@index([projectId, state])`

### agent_event
| Column | Type | Notes |
|--------|------|-------|
| id | String (uuid) | PK |
| sessionId | String | FK → agent_session, cascade delete |
| type | String | `status\|action\|artifact\|blocker\|summary` |
| message | String | |
| createdAt | DateTime | |

Index: `@@index([sessionId, createdAt])`

### Design Decision: `blocked` field

The `blocked` boolean on `story` is currently set manually when a dependency is added but **never recalculated when a dependency is removed**. This creates stale state.

**Decision for this migration:** Compute `blocked` at query time.
- `blocked = true` if the story has at least one dependency whose target story is not `completed`.
- `blocked = false` when all dependency targets are `completed` (or no dependencies exist).
- This is strictly dependency-driven state (no unrelated flags).
- Remove the stored `blocked` column.
- API response still includes `blocked` as a computed field for backward compatibility.
- If query-time computation is too slow at scale, re-add as a denormalized column with trigger-based updates in a later pass.

---

## File Storage Architecture

### Storage layout
```
apps/api/data/
├── bolt.db              # SQLite database
└── files/
    ├── {projectId}/
    │   ├── {storyId}/
    │   │   └── {uuid}-{filename}
    │   └── project-level/
    │       └── {uuid}-{filename}
```

### Upload flow
1. File binary written to `data/files/{projectId}/{storyId}/{uuid}-{filename}`
2. Metadata row created in `file_asset` with `filePath` pointing to relative path
3. Text extraction runs (sync for small files, async for large):
   - `.txt`, `.md`, `.json`, `.csv` → read directly
   - `.pdf` → extract via lightweight lib (e.g. `pdf-parse`)
   - `.png`, `.jpg` → skip text extraction (or OCR in future pass)
4. Extracted text stored in `textContent` column
5. Optional: AI summary generated and stored in `summary` column
6. On extraction failure, write an `extraction_failures` log row (fileId, reason, timestamp) and continue without blocking upload


### File API contract (v1, explicit)
- `POST /api/v1/files/upload` (multipart/form-data) for real uploads
  - fields: `projectId` (required), `storyId` (optional), `file` (required), `uploadedBy` (optional)
- `POST /api/v1/files` (JSON metadata-only) retained for backward compatibility/testing
  - fields: `projectId`, `storyId`, `filename`, `contentType`, `byteSize`, `uploadedBy`, optional `textContent`
- `GET /api/v1/files/:id/content` returns extracted text content (detail endpoint)

Rule: list endpoints do not return full content by default.

### AI context retrieval pattern
- `GET /api/v1/files?projectId=X&include=textContent` → returns file metadata + extracted text (capped/truncated)
- `GET /api/v1/files?projectId=X&include=summary` → returns metadata + short summaries only
- `GET /api/v1/files/:id/content` → full extracted text for a single file
- Default list (no `include`) → metadata only (token-efficient)

Token caps:
- `textContent` in list responses capped to 2,000 chars per file
- `summary` capped to 400 chars
- Full text only from detail endpoint

### Backup
- Copy `apps/api/data/` directory (db + files)
- Or: `sqlite3 bolt.db ".backup backup.db"` for atomic DB snapshot

### Reset
```bash
rm -rf apps/api/data/bolt.db apps/api/data/files/
npx prisma migrate dev
npm run seed
```

---

## API Changes

### Existing endpoints (preserved, no breaking changes)
- `GET /api/v1/stories` (+ `?projectId=`, `?status=`)
- `POST /api/v1/stories`
- `PATCH /api/v1/stories/:id`
- `POST /api/v1/stories/:id/move`
- `GET/POST /api/v1/stories/:id/notes`
- `GET/POST /api/v1/stories/:id/dependencies`
- `GET/POST /api/v1/files`
- `GET/POST /api/v1/agent/sessions`
- `GET/POST /api/v1/agent/sessions/:id/events`
- `GET /api/v1/digests/project/:projectId/daily`

### New endpoints
- `PATCH /api/v1/projects/:id`
- `DELETE /api/v1/projects/:id` (default: reject if non-empty; allow `?force=true` for cascade delete)
- `DELETE /api/v1/stories/:id` (cascade notes/deps/files)
- `DELETE /api/v1/stories/:id/notes/:noteId`
- `DELETE /api/v1/dependencies/:id`
- `DELETE /api/v1/files/:id` (remove metadata + filesystem file)
- `GET /api/v1/stories/:id/labels`
- `POST /api/v1/stories/:id/labels`
- `DELETE /api/v1/stories/:id/labels/:label`

### Token-efficiency rules (enforced in this migration)
- All list endpoints default `limit=50`, max `limit=200`
- `fields` query param for selective column return
- `include` query param for opt-in expansions (e.g. `textContent`, `summary`)
- `updated_since` filter on stories/files/events for delta sync
- `cursor` pagination on all collections
- `blocked` computed server-side, never requires client-side dependency scanning

### Backward compatibility
1. `projectId` missing → default to `core` project
2. Status/priority enums unchanged
3. `{ data: ... }` envelope preserved on all responses
4. `blocked` still appears in story responses (computed, not stored)

---

## Migration Phases

### Phase 0 — Freeze and Inventory (15 min)
- Document every endpoint the UI currently calls
- Confirm current runtime is in-memory mode
- Tag current commit as `pre-persistence` for rollback

Exit criteria: endpoint inventory complete, rollback tag exists

### Phase 1 — Prisma Schema + SQLite Setup (30 min)
- Update `schema.prisma`: provider → `sqlite`, url → `file:./data/bolt.db`
- Add all tables including `story_label`, computed `blocked` logic
- Add `filePath`, `textContent`, `summary` columns to `file_asset`
- Remove `storageKey` column (replaced by `filePath`)
- Generate migration, validate on fresh DB
- Add SQLite pragmas to API startup (`WAL`, `foreign_keys`, `busy_timeout`)
- `.gitignore` the `data/` directory

Exit criteria: `prisma migrate dev` succeeds, client generates, pragmas applied

### Phase 2 — Data Access Layer (2-3 hours)
- Create functional modules:
  - `src/db/projects.ts`
  - `src/db/stories.ts`
  - `src/db/notes.ts`
  - `src/db/dependencies.ts`
  - `src/db/files.ts`
  - `src/db/agent.ts`
- Each module exports typed functions (list, create, update, delete, getById)
- Implement computed `blocked` in story list/get queries
- Implement `fields`, `limit`, `cursor`, `updated_since` at the DAL level
- Wire Fastify handlers to DAL (remove all in-memory arrays)
- Add DELETE endpoints

Exit criteria: API compiles, all handlers use DAL, no in-memory arrays, DELETE routes exist
- Verification gate: No `const ...[]` in API runtime handlers for domain state (projects/stories/notes/dependencies/files/events)

### Phase 3 — File Storage Implementation (1 hour)
- Create `data/files/` directory structure on startup
- Implement file write utility (save to disk + create metadata row)
- Implement text extraction for `.txt`, `.md`, `.json`, `.csv`
- Wire `POST /files` to accept file metadata + optional content
- Wire `GET /files` to support `include=textContent` and `include=summary`
- Wire `DELETE /files/:id` to remove both DB row and filesystem file

Exit criteria: files persist on disk, text extracted and queryable, delete cleans up both

### Phase 4 — Seed Scripts (30 min)
- Prisma seed (`prisma/seed.ts`): baseline `core` project + agent session stub
- Demo seed script (`scripts/seed-demo.ts`): calculator + weather projects with stories, deps, notes, labels, files
- Both scripts idempotent (check before insert, use stable IDs or unique markers)

Exit criteria: `npx prisma db seed` boots clean app, demo script populates board reproducibly

### Phase 5 — Frontend Integration Validation (30 min)
- Verify project selector loads from persistent data
- Create/edit/delete project
- Story lifecycle: create → edit → move → complete
- Notes, dependencies, labels, files in drawer
- Restart API, confirm all data persists
- Agent dock still shows session/events

Exit criteria: full UI flow works across restart

### Phase 6 — Cutover + Cleanup (15 min)
- Remove all dead in-memory code
- Remove Docker Compose Postgres/MinIO services (keep compose file only if needed for other services)
- Remove `storageKey` references
- Update README setup instructions (no Docker required)
- Update `.env.example`
- Tag release

Exit criteria: single persistence path, clean repo, updated docs

---

## Runtime / Environment

### Required
- Node.js 22+
- npm 10+

### Not required (removed)
- Docker
- PostgreSQL
- MinIO / S3

### Environment variables
- `DATABASE_URL` — optional, defaults to `file:./data/bolt.db`
- `PORT` — optional, defaults to `4000`

### Boot order
1. `npx prisma migrate deploy` (or `dev` for local)
2. `npm run dev:api`
3. `npm run dev:web`

### npm scripts to add
```json
{
  "db:migrate": "prisma migrate dev",
  "db:seed": "prisma db seed",
  "db:seed:demo": "tsx scripts/seed-demo.ts",
  "db:reset": "rm -f data/bolt.db && prisma migrate dev && prisma db seed"
}
```

---

## Testing Matrix

### API tests
- Project CRUD + delete (reject if stories exist, or cascade)
- Story CRUD + move + computed `blocked` accuracy
- Label CRUD + unique constraint
- Notes CRUD + cascade on story delete
- Dependency CRUD + unique constraint + blocked recomputation
- File CRUD + filesystem cleanup on delete
- Agent session/event CRUD
- `fields`, `limit`, `cursor`, `updated_since` on story list

### Persistence tests
- Create data → restart API → data still present
- Delete story → notes/deps/labels cascade
- Delete file → DB row + filesystem file both gone
- Seed idempotency (run twice, no duplicates)
- Migration on non-empty DB

### Concurrency tests
- Two rapid status moves on same story → last write wins, no crash
- Concurrent note additions → both persist

### UI tests
- Project dropdown switches board content
- Add/edit/delete project from top bar
- Story drawer: edit, notes, deps, labels, files all persist
- Computed blocked badge updates when dependency target completes
- File attachment shows in drawer, text content available to API

---

## Cutover Checklist

1. Tag current commit as `pre-persistence`
2. Run `npx prisma migrate dev` — confirm `data/bolt.db` created
3. Run `npx prisma db seed` — confirm `core` project exists
4. Start API → verify `GET /health` and `GET /api/v1/projects`
5. Start web → verify board loads
6. Create a story → restart API → story still visible
7. Run demo seed → verify both demo projects populated
8. Run DELETE on a test story → confirm cascade
9. Tag release as `v0.2.0-persistent`

---

## Rollback Plan

If cutover fails:
1. `git checkout pre-persistence` — revert to in-memory API
2. `data/bolt.db` is untouched (can be inspected or kept for retry)
3. Restart API in in-memory mode
4. Fix issues on branch, reattempt

Data is never destroyed during rollback. The DB file just sits unused until the next attempt.

Frontend compatibility note:
- If the frontend starts depending on new persistence-only endpoints, pin frontend + API versions together when rolling back.

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SQLite file corruption | Low | WAL mode + atomic backups + `.db` is gitignored |
| Concurrent write contention | Low | WAL mode + `busy_timeout` pragma; fine at Bolt's scale |
| Text extraction fails on file type | Medium | Graceful fallback: `textContent = null`, log warning |
| `blocked` computation slow at scale | Low | Start computed; add denormalized column + triggers if needed |
| Prisma SQLite quirks (`createMany`, etc.) | Medium | Test all seed paths; use individual creates if needed |
| Large files bloat `data/` directory | Low | Not in DB; filesystem can be cleaned independently |
| Missing `data/` directory on fresh clone | Low | API creates directory on startup if absent |

---

## Deliverables

- Updated Prisma schema (`sqlite` provider, all tables including `story_label`)
- SQLite pragmas applied at startup
- Functional DAL modules (`src/db/*.ts`)
- Fastify handlers wired to DAL (no in-memory arrays)
- DELETE endpoints for all entities
- File storage utility (write to disk + extract text)
- Seed scripts: baseline + demo
- Updated README (no Docker/Postgres/MinIO required)
- Updated `.env.example`
- `data/` directory in `.gitignore`

---

## Estimated Effort

| Phase | Estimate |
|-------|----------|
| Phase 0 — Freeze/inventory | 15 min |
| Phase 1 — Schema + SQLite setup | 30 min |
| Phase 2 — Data access layer | 2-3 hours |
| Phase 3 — File storage | 1 hour |
| Phase 4 — Seed scripts | 30 min |
| Phase 5 — Frontend validation | 30 min |
| Phase 6 — Cutover + cleanup | 15 min |
| **Total** | **~5-6 hours** |


---

## Development-Ready Execution Checklist (Final)

Use this as the exact build sequence.

### Branch + safety
- [ ] Create branch: `feat/sqlite-persistence-cutover`
- [ ] Tag current state: `pre-persistence-sqlite`
- [ ] Confirm working tree clean before migration work

### Schema + Prisma (SQLite)
- [ ] Set Prisma datasource to SQLite (`file:./data/bolt.db`)
- [ ] Add/update models: `project`, `story`, `story_label`, `story_note`, `story_dependency`, `file_asset`, `agent_session`, `agent_event`
- [ ] Remove stored `blocked` column and compute at query layer
- [ ] Add file columns: `filePath`, `textContent`, `summary`
- [ ] Run migration: `npx prisma migrate dev --name sqlite_persistence_cutover`
- [ ] Generate client: `npx prisma generate`

### API implementation
- [ ] Implement DAL modules under `apps/api/src/db/*`
- [ ] Replace in-memory arrays in runtime handlers
- [ ] Keep response envelopes (`{ data: ... }`)
- [ ] Add/confirm project endpoints (`GET/POST/PATCH/DELETE` with `force=true` policy)
- [ ] Add/confirm delete endpoints for stories/notes/dependencies/files
- [ ] Add token controls: `limit`, `cursor`, `fields`, `include`, `updated_since`
- [ ] Add blocked computation from dependency status (unfulfilled deps only)

### File storage + AI context
- [ ] Create `apps/api/data/files/` on startup if missing
- [ ] Implement `POST /api/v1/files/upload` (multipart)
- [ ] Keep `POST /api/v1/files` metadata path for compatibility/testing
- [ ] Implement extraction pipeline for text-friendly formats
- [ ] Store extraction output in `textContent`
- [ ] Store optional short summary in `summary`
- [ ] Log extraction failures (non-fatal)
- [ ] Add `GET /api/v1/files/:id/content` detail endpoint

### Seeds
- [ ] Baseline seed (`core` project + dock session)
- [ ] Demo seed script (calculator/weather with deps/labels/notes/files)
- [ ] Verify idempotency by running seeds twice

### Frontend validation gates
- [ ] Project selector loads and filters correctly
- [ ] Create/edit/delete project works
- [ ] Story create/edit/move/delete works
- [ ] Notes/dependencies/labels/files persist
- [ ] Blocked badge updates from dependency completion
- [ ] Restart API and verify data remains

### Performance + token gates
- [ ] Default list limit = 50, max = 200
- [ ] List `textContent` truncation enforced (2k chars max)
- [ ] `summary` truncation enforced (400 chars max)
- [ ] No oversized default payloads

### Definition of Done
- [ ] No in-memory runtime state arrays for domain data
- [ ] SQLite file persists all core entities across restart
- [ ] Demo projects visible and stable after restart
- [ ] All compatibility endpoints still work for current UI
- [ ] README/setup docs updated for SQLite + local file storage
- [ ] Final cutover tag created: `v0.2.0-persistent-sqlite`

### First development command set
```bash
cd ~/bolt
git checkout -b feat/sqlite-persistence-cutover
npm --workspace @bolt/api run build
# then implement Phase 1 onward from this checklist
```

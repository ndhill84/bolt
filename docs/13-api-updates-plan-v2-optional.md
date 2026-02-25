# 13) API Updates Plan — V2 Optional Enhancements

## Goal
Add higher-leverage API capabilities that improve scale, planning semantics (true sprints), and advanced automation quality for `Bolt-skill`.

## Success Criteria
- Skill can orchestrate multi-item workflows efficiently.
- Data model supports explicit sprint planning.
- API supports scalable querying and richer change tracking.

## Scope (V2 Optional)

### 1) Introduce Sprint Domain Model
**Why:** Current model is project-centric; “sprint” behavior is implicit.

**Plan**
- Add `Sprint` entity:
  - `id`, `projectId`, `name`, `goal`, `status` (`planned|active|closed`), `startAt`, `endAt`, timestamps
- Add `story.sprintId` nullable foreign key.
- New endpoints:
  - `GET /projects/:id/sprints`
  - `POST /projects/:id/sprints`
  - `PATCH /sprints/:id`
  - `POST /sprints/:id/close`
  - `POST /sprints/:id/start`
  - Optional: `POST /sprints/:id/stories:assign` (batch assignment)

**Acceptance**
- Stories can be assigned/unassigned to sprints safely.
- One active sprint per project enforced (if desired policy).

---

### 2) Batch Mutation Endpoints
**Why:** Agent workflows often need controlled multi-record updates.

**Plan**
Add:
- `POST /stories/batch/move`
- `POST /stories/batch/patch`
- `POST /stories/batch/delete` (optional + guarded)

Request contract:
- Explicit item list + operation payload
- Per-item result list (`ok`/`error`) + overall summary
- Optional transactional mode (`all_or_nothing=true`)

**Acceptance**
- Skill can perform triage and planning updates in fewer calls.
- Partial failures are explicit and recoverable.

---

### 3) Cursor Pagination for List Endpoints
**Why:** Offset/limit eventually degrades and is unstable under churn.

**Plan**
- Add cursor pagination to high-volume endpoints:
  - `/stories`, `/files`, `/agent/sessions/:id/events`, future `/audit`
- Response shape:

```json
{
  "data": [],
  "page": {
    "nextCursor": "...",
    "hasMore": true
  }
}
```

- Keep `limit` with sane caps.

**Acceptance**
- Deterministic page traversal under concurrent writes.

---

### 4) Audit / Changefeed Endpoint
**Why:** Skills need efficient “what changed since X?” reads.

**Plan**
- Add endpoint:
  - `GET /api/v1/audit?since=<ISO>&projectId=<id|all>&limit=<n>`
- Include normalized events for:
  - project/story create/update/delete
  - story move
  - note/dependency/file changes
- Return monotonic ordering and stable event ids.

**Acceptance**
- Skill can generate robust deltas and standups without full table scans.

---

### 5) Digest Upgrades
**Why:** Better planning summaries for human+agent loops.

**Plan**
Enhance digest responses with:
- `byAssignee`
- `byPriority`
- `newBlocked` and `resolvedBlocked` since window
- `recentMoves`
- optional sprint-specific digest (`/digests/sprint/:id`)

**Acceptance**
- Skill can produce concise progress reports from one endpoint.

---

### 6) API Auth Hardening (Optional but Recommended)
**Why:** Separate skill repo will likely run in different contexts.

**Plan**
- Introduce token-based auth (service token or scoped PAT style).
- Scope permissions by operation class (read/write/admin).
- Add rate limiting for write endpoints.

**Acceptance**
- External skill runtime can authenticate safely without over-privilege.

---

## Implementation Order (V2)
1. Sprint model + migrations + endpoints
2. Cursor pagination primitives
3. Batch endpoints
4. Audit/changefeed
5. Digest enhancements
6. Auth/rate-limit hardening
7. Docs + contract examples

## Test Plan (V2)
- **Migration tests:** sprint model integrity, backfill behavior.
- **Contract tests:** batch endpoint partial/all-or-nothing semantics.
- **Pagination tests:** no duplicates/omissions across pages.
- **Audit tests:** event completeness and ordering.
- **Performance tests:** query latency under larger datasets.

## Risks & Mitigations
- **Risk:** scope blowout from introducing sprint entity.
  - **Mitigation:** phase sprint endpoints first, delay advanced sprint analytics.
- **Risk:** batch endpoints increase blast radius of mistakes.
  - **Mitigation:** dry-run mode + max batch size + explicit confirms in skill.
- **Risk:** audit stream ambiguity.
  - **Mitigation:** canonical event schema and strict ordering key.

## Deferred Beyond V2
- Webhooks/outbound events
- Realtime subscriptions (SSE/WebSocket)
- Multi-tenant org/workspace model
- Fine-grained RBAC UI/admin tooling

## Exit Gate
V2 is complete when `Bolt-skill` can perform sprint-aware planning, efficient bulk operations, incremental sync, and richer autonomous reporting without fragile client-side orchestration.

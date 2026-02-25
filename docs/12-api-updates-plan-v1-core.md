# 12) API Updates Plan — V1 Core (AgentSkills-Ready)

## Goal
Ship the minimum API changes needed for a reliable, portable `Bolt-skill` (AgentSkills format), without introducing major schema churn.

## Success Criteria
- Skill can perform core CRUD + workflow actions deterministically.
- API responses are machine-parseable and consistent.
- Retry-safe writes prevent duplicate actions.
- No breaking changes to existing UI consumers.

## Scope (V1 Core)

### 1) Standardize Error Envelope
**Why:** Skill runtimes need predictable error handling.

**Plan**
- Normalize all non-2xx responses to:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

- Define initial error codes:
  - `BAD_REQUEST`
  - `NOT_FOUND`
  - `CONFLICT`
  - `UNSUPPORTED_MEDIA_TYPE`
  - `PAYLOAD_TOO_LARGE`
  - `SERVICE_UNAVAILABLE`
  - `INTERNAL_ERROR`

**Acceptance**
- Every route returns envelope above on error.
- Existing messages preserved in `message` where practical.

---

### 2) Add Idempotency for Writes
**Why:** Agents may retry requests; writes must not duplicate records.

**Plan**
- Support `Idempotency-Key` header on mutating routes (`POST`, `PATCH`, `DELETE` where applicable).
- Persist request fingerprint + response (status/body) in a lightweight table.
- Replays with same key + same fingerprint return original response.
- Same key + different fingerprint returns conflict error (`CONFLICT`).

**Initial target routes**
- `POST /projects`
- `PATCH /projects/:id`
- `POST /stories`
- `PATCH /stories/:id`
- `POST /stories/:id/move`
- `POST /stories/:id/notes`
- `POST /stories/:id/dependencies`
- `POST /files`
- `POST /files/upload`

**Acceptance**
- Duplicate create attempts with same key do not create duplicate data.
- Idempotent replay response matches first response.

---

### 3) Extend List Filters for Skill Workflows
**Why:** Skill must fetch targeted sets without client-side over-filtering.

**Plan**
Add filters to `GET /stories`:
- `assignee`
- `priority` (`low|med|high|urgent`)
- `blocked` (`true|false`)
- `due_before` (ISO datetime)
- `due_after` (ISO datetime)
- `has_dependencies` (`true|false`)

Validation behavior:
- invalid enum/value/date => `400 BAD_REQUEST` with structured error.
- preserve existing filters (`projectId`, `status`, `updated_since`, `limit`, `fields`).

**Acceptance**
- Filters combine logically (`AND`) and are indexed enough for expected dataset size.
- Existing clients remain functional.

---

### 4) Tighten API Contract Docs
**Why:** AgentSkills integration depends on explicit contracts.

**Plan**
- Update `docs/05-api-spec.md` with:
  - new error envelope
  - idempotency semantics
  - new story filters
  - examples for success/error cases
- Add request/response examples for each core route used by skill.

**Acceptance**
- Docs are complete enough to generate skill schemas without guesswork.

---

### 5) Add Readiness Endpoint
**Why:** Skills need a clear preflight signal before acting.

**Plan**
- Keep `/health` as liveness.
- Add `/ready` to verify:
  - DB connectivity
  - Prisma client ready
  - required bootstrap state available

**Acceptance**
- `/ready` returns non-2xx when app cannot safely process writes.

---

## Implementation Order (V1)
1. Error envelope middleware + shared error code map
2. Story filter extensions + validation
3. Idempotency key persistence + middleware wrapper
4. `/ready` endpoint
5. API spec updates + examples
6. Regression test pass

## Test Plan (V1)
- **Unit:** validators, error mapper, idempotency key conflict logic.
- **Contract:** route-level response shape checks (success + error).
- **Integration:** replay write requests with same idempotency key; confirm no duplicates.
- **Regression:** existing UI flows unchanged (projects/stories/notes/files/dependencies).

## Risks & Mitigations
- **Risk:** envelope change breaks current frontend assumptions.
  - **Mitigation:** maintain success envelope unchanged; only normalize errors.
- **Risk:** idempotency storage growth.
  - **Mitigation:** TTL cleanup job (e.g., 7 days) in later patch.
- **Risk:** filter complexity impacts performance.
  - **Mitigation:** start with pragmatic query paths; add indexes as needed.

## Out of Scope (V1)
- Sprint entity/model
- Batch mutation endpoints
- Cursor pagination
- Full audit/changefeed endpoint

## Exit Gate
V1 is complete when `Bolt-skill` can reliably execute: project select/edit, story list/create/update/move, note add, dependency add/remove, and digest read with deterministic error handling and retry safety.

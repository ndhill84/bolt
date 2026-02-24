# MVP Scope

## Board + Stories
- Kanban columns: **Waiting**, **In Progress**, **Completed**.
- Story CRUD with fields:
  - title, description, acceptance criteria
  - status, priority, points, due date
  - assignee, labels
- Drag/drop status changes.
- Story detail drawer with edit controls.

## Notes + Decisions
- Notes/comments per story.
- Convert note -> action item.
- Decision log entries (ADR-lite): decision, rationale, date, owner.

## Dependencies + Blockers
- Story dependency links (blocks / blocked_by).
- Automatic blocked indicator on cards.
- Blocker queue with owner + ETA.

## File Context
- Upload files to project or story.
- Metadata in DB, binary in object storage.
- Download/view links from UI.

## Agent Activity (first-class)
- “Now” panel: current task, state, started_at, heartbeat.
- Timeline feed of actions.
- Session records with outcomes.
- Evidence links (commit/PR/test/log).

## Digest + Token Optimization
- Sprint digest endpoint returning compact summary for AI.
- Delta sync endpoints via `updated_since`.
- Field selection (`fields`) and include flags (`include`).

# API Spec (MVP Draft)

## Base
- `/api/v1`
- JSON only
- Cursor pagination: `?limit=20&cursor=...`
- Delta sync: `?updated_since=ISO8601`
- Field shaping: `?fields=id,title,status,priority`

## Projects & Sprints
- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `GET /projects/:id/sprints`
- `POST /projects/:id/sprints`

## Stories
- `GET /stories` (filters: project_id, sprint_id, status, assignee, blocked)
- `POST /stories`
- `GET /stories/:id`
- `PATCH /stories/:id`
- `DELETE /stories/:id`
- `POST /stories/:id/move` (status transition)

## Story Notes / Decisions
- `GET /stories/:id/notes`
- `POST /stories/:id/notes`

## Dependencies
- `GET /stories/:id/dependencies`
- `POST /stories/:id/dependencies`
- `DELETE /dependencies/:id`

## Files
- `POST /files/presign-upload`
- `POST /files` (save metadata after upload)
- `GET /files` (filter by project/story)
- `GET /files/:id/presign-download`

## Action Items
- `GET /action-items`
- `POST /action-items`
- `PATCH /action-items/:id`

## Agent Activity
- `GET /agent/sessions?state=...`
- `POST /agent/sessions`
- `PATCH /agent/sessions/:id`
- `GET /agent/sessions/:id/events`
- `POST /agent/sessions/:id/events`
- `POST /agent/sessions/:id/artifacts`

## Digests
- `GET /digests/sprint/:id`
- `GET /digests/project/:id/daily`

### Sprint Digest Response (compact)
```json
{
  "sprint_id": "...",
  "counts": {"waiting": 4, "in_progress": 3, "completed": 12},
  "blocked": [{"id":"s42","title":"Auth refresh bug","blocked_by":["s12"]}],
  "risks": ["2 urgent stories have no assignee"],
  "recent_decisions": ["Use Fastify over Express for perf + schema validation"],
  "next_actions": ["Resolve dependency s12 -> s42"]
}
```

# Data Model (Draft)

## Core Entities

### project
- id (uuid)
- name
- description
- created_at, updated_at

### sprint
- id (uuid)
- project_id (fk)
- name
- goal
- starts_on, ends_on
- status (planned|active|closed)
- created_at, updated_at

### story
- id (uuid)
- project_id (fk)
- sprint_id (fk nullable)
- title
- description
- acceptance_criteria
- status (waiting|in_progress|completed)
- priority (low|med|high|urgent)
- points (int nullable)
- assignee
- due_at (timestamp nullable)
- blocked (bool)
- created_at, updated_at

### story_dependency
- id (uuid)
- story_id (fk)
- depends_on_story_id (fk)
- type (blocks|blocked_by)
- created_at

### story_note
- id (uuid)
- story_id (fk)
- author
- body
- kind (note|decision|update)
- created_at

### action_item
- id (uuid)
- story_id (fk nullable)
- note_id (fk nullable)
- title
- assignee
- status (open|in_progress|done)
- due_at
- created_at, updated_at

### file_asset
- id (uuid)
- project_id (fk)
- story_id (fk nullable)
- uploader
- filename
- content_type
- byte_size
- storage_key
- sha256
- created_at

### agent_session
- id (uuid)
- project_id (fk)
- title
- state (planning|coding|testing|blocked|done)
- started_at
- ended_at
- confidence (int 0-100 nullable)
- risk_summary (text nullable)

### agent_event
- id (uuid)
- session_id (fk)
- type (status|action|artifact|blocker|summary)
- message
- metadata_json
- created_at

### artifact_link
- id (uuid)
- session_id (fk)
- kind (commit|pr|file|test|log)
- label
- url
- created_at

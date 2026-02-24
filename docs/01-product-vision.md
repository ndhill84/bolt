# Bolt — Product Vision

## Purpose
Bolt is a collaborative web app for **Nick + Claudio (AI teammate)** to plan, execute, and ship software sprints with full transparency.

## Core Outcomes
- Manage sprint stories from backlog to done.
- Track blockers, dependencies, and decisions clearly.
- Attach project context files so AI can work with relevant info.
- Visualize AI activity in real time (what it is doing, why, and outputs).
- Keep API and UI token-efficient for AI operations.

## Core Tenet
**Token efficiency is non-negotiable.**
Because Bolt is designed for direct, frequent interaction by OpenClaw and other LLMs, every API and UI decision should optimize for minimal token usage without reducing feature depth.

Implementation principle:
- Default to compact responses
- Fetch detail on demand
- Prefer deltas over full snapshots
- Keep schemas stable and concise
- Add server-side digests for planning and status workflows

## Users
- **Founder/Operator (Nick):** needs high-level visibility, risk, and velocity.
- **Builder/AI Teammate (Claudio):** needs focused context and low-noise updates.

## Non-Goals (MVP)
- No heavy enterprise RBAC.
- No multi-tenant org billing.
- No complex Gantt/resource planning.

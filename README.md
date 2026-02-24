<div align="center">
  <img src="assets/bolt-logo.svg" alt="Bolt logo" width="120" />

# ⚡ Bolt
### Build software faster — together.

**Bolt is a collaborative Sprint Board + AI Activity platform for shipping software projects with full visibility.**

[![Status](https://img.shields.io/badge/status-active%20development-22c55e?style=flat-square)](https://github.com/ndhill84/bolt)
[![Monorepo](https://img.shields.io/badge/monorepo-npm%20workspaces-6366f1?style=flat-square)](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
[![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb?style=flat-square)](https://vitejs.dev/)
[![Backend](https://img.shields.io/badge/backend-Fastify-000000?style=flat-square)](https://fastify.dev/)
[![Database](https://img.shields.io/badge/database-PostgreSQL-336791?style=flat-square)](https://www.postgresql.org/)
[![Storage](https://img.shields.io/badge/storage-S3%20compatible-f59e0b?style=flat-square)](https://aws.amazon.com/s3/)

</div>

---

## 🚀 What is Bolt?

Bolt is a project cockpit for **human + AI software teams**.

It combines:
- **Sprint planning and execution** (stories, status, priorities, dependencies)
- **Context management** (notes, decisions, file attachments)
- **AI observability** (what the agent is doing right now, timeline, artifacts)

The goal: less chaos, better momentum, faster shipping.

---

## ✨ Core Product Vision

- Clear board states: **Waiting → In Progress → Completed**
- Story-level execution: edit, note, prioritize, assign, unblock
- Context as a first-class feature: attach docs/files/screenshots/logs
- Built-in agent transparency: see active task, progress, blockers, outputs
- Token-efficient API design for AI collaboration at scale

---

## 🧱 Tech Stack

### Frontend
- React + TypeScript + Vite

### Backend
- Fastify + TypeScript

### Data + Storage
- PostgreSQL (Prisma)
- S3-compatible object storage (MinIO/S3/R2)

### Monorepo
- npm workspaces

---

## 📁 Repository Structure

```text
bolt/
├─ apps/
│  ├─ web/          # React UI
│  └─ api/          # Fastify API
├─ packages/
│  └─ shared/       # Shared types/contracts
├─ docs/            # Product + architecture + API planning docs
├─ docker-compose.yml
└─ README.md
```

---

## 🛠️ Local Setup

### 1) Prerequisites

- Node.js **22+**
- npm **10+**
- Docker + Docker Compose

### 2) Clone

```bash
git clone https://github.com/ndhill84/bolt.git
cd bolt
```

### 3) Install dependencies

```bash
npm install
```

### 4) Start local infrastructure (Postgres + MinIO)

```bash
docker compose up -d
```

Services:
- Postgres: `localhost:5432`
- MinIO API: `localhost:9000`
- MinIO Console: `localhost:9001`

### 5) Run API and Web app

In terminal A:
```bash
npm run dev:api
```

In terminal B:
```bash
npm run dev:web
```

Default ports:
- API: `http://localhost:4000`
- Web: Vite default (`http://localhost:5173`)

---

## ✅ Build

```bash
npm run -ws build
```

---

## 📘 Project Docs

See the `/docs` folder for:
- Product vision
- MVP scope
- Architecture
- Data model
- API spec
- UI/UX plan
- Build phases

---

## 🧭 Current Status

In active build mode.

Already implemented:
- Monorepo scaffold
- API + web starter
- Core board flow scaffold
- Story endpoints + notes + move/edit primitives

In progress:
- File upload & context pipeline
- Agent Activity dashboard (live “what AI is doing” view)
- Digest endpoints for compact AI-ready summaries

---

## 🌍 Why this project matters

Bolt is more than a sprint board.

It’s an operating system for ambitious builders who want to:
- move faster without losing context,
- collaborate deeply with AI,
- and keep execution transparent from idea to shipped code.

If you’re building cool things with an AI teammate, this is for you.

---

## 🤝 Contributing

PRs, ideas, and feedback are welcome.

If you contribute, please:
- keep APIs compact and composable,
- prefer clear UX over complexity,
- optimize for human + AI collaboration.

---

## 📄 License

TBD.

(Choose MIT/Apache-2.0/etc. before public launch.)

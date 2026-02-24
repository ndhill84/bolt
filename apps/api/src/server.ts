import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Prisma, PrismaClient } from '@prisma/client';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();
const importDynamic = new Function('m', 'return import(m)') as (moduleName: string) => Promise<unknown>;
let multipartReady = false;

await app.register(cors, { origin: true });
try {
  const multipartModule = (await importDynamic('@fastify/multipart')) as { default?: unknown };
  if (multipartModule?.default) {
    await app.register(multipartModule.default as Parameters<typeof app.register>[0]);
    multipartReady = true;
  }
} catch {
  app.log.warn('@fastify/multipart not installed; /api/v1/files/upload will return 503');
}

type StoryStatus = 'waiting' | 'in_progress' | 'completed';

type ProjectBody = {
  name?: string;
  description?: string;
};

type StoryBody = {
  projectId?: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  status?: StoryStatus;
  priority?: 'low' | 'med' | 'high' | 'urgent';
  blocked?: boolean;
  points?: number;
  assignee?: string;
  dueAt?: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const FILE_LIST_INCLUDE_ALLOWLIST = new Set(['summary', 'textContent']);
const STORY_FIELDS_ALLOWLIST = new Set([
  'id',
  'projectId',
  'title',
  'description',
  'acceptanceCriteria',
  'status',
  'priority',
  'blocked',
  'points',
  'assignee',
  'dueAt',
  'createdAt',
  'updatedAt',
]);
const FILE_FIELDS_ALLOWLIST = new Set([
  'id',
  'projectId',
  'storyId',
  'filename',
  'contentType',
  'byteSize',
  'filePath',
  'textContent',
  'summary',
  'uploadedBy',
  'createdAt',
]);

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(appDir, 'data');

async function ensureDataLayout() {
  await mkdir(path.join(dataDir, 'files'), { recursive: true });
}

async function applySqlitePragmas() {
  const db = new DatabaseSync(path.join(dataDir, 'bolt.db'));
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec('PRAGMA busy_timeout=5000;');
  db.close();
}

async function bootstrapCoreProject() {
  await prisma.project.upsert({
    where: { id: 'core' },
    update: { name: 'Core / Other' },
    create: { id: 'core', name: 'Core / Other' },
  });

  const existing = await prisma.agentSession.findFirst({ where: { projectId: 'core' } });
  if (!existing) {
    const now = new Date();
    await prisma.agentSession.create({
      data: {
        id: 'agent-main',
        projectId: 'core',
        title: 'Build Bolt milestones',
        state: 'coding',
        startedAt: new Date(now.getTime() - 1000 * 60 * 20),
        lastHeartbeatAt: now,
      },
    });

    await prisma.agentEvent.create({
      data: {
        sessionId: 'agent-main',
        type: 'status',
        message: 'Milestone started: file context + agent dashboard',
        createdAt: new Date(now.getTime() - 1000 * 60 * 15),
      },
    });
  }
}

async function refreshBlocked(storyId: string) {
  const deps = await prisma.storyDependency.findMany({
    where: { storyId },
    include: { dependsOn: { select: { status: true } } },
  });
  const blocked = deps.some((dep) => dep.dependsOn.status !== 'completed');
  await prisma.story.update({ where: { id: storyId }, data: { blocked } });
}

function parseLimit(raw?: string): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseUpdatedSince(raw?: string): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date('');
  return parsed;
}

function parseCsv(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function buildFieldSet(raw: string | undefined, allowlist: Set<string>): Set<string> | null {
  if (!raw) return null;
  const requested = parseCsv(raw);
  return new Set(requested.filter((field) => allowlist.has(field)));
}

function shapeRecord<T extends Record<string, unknown>>(record: T, fields: Set<string> | null): Record<string, unknown> {
  if (!fields) return { ...record };
  const shaped: Record<string, unknown> = {};
  for (const field of fields) shaped[field] = record[field];
  return shaped;
}

function truncate(value: unknown, maxChars: number): unknown {
  if (typeof value !== 'string') return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

app.get('/health', async () => ({ ok: true }));

app.get('/api/v1/projects', async () => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' } });
  return { data: projects };
});

app.post('/api/v1/projects', async (req, reply) => {
  const body = req.body as ProjectBody;
  if (!body?.name?.trim()) return reply.status(400).send({ error: 'name is required' });

  const project = await prisma.project.create({
    data: {
      name: body.name.trim(),
      description: body.description,
    },
  });

  return reply.status(201).send({ data: project });
});

app.patch('/api/v1/projects/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as ProjectBody;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'project not found' });

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: body.name?.trim() || existing.name,
      description: body.description,
    },
  });

  return { data: project };
});

app.delete('/api/v1/projects/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { force } = req.query as { force?: string };

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return reply.status(404).send({ error: 'project not found' });

  const [storyCount, fileCount, sessionCount] = await Promise.all([
    prisma.story.count({ where: { projectId: id } }),
    prisma.fileAsset.count({ where: { projectId: id } }),
    prisma.agentSession.count({ where: { projectId: id } }),
  ]);

  const isEmpty = storyCount === 0 && fileCount === 0 && sessionCount === 0;
  if (!isEmpty && force !== 'true') {
    return reply.status(409).send({ error: 'project not empty; pass force=true to delete' });
  }

  if (force === 'true') {
    await prisma.$transaction([
      prisma.fileAsset.deleteMany({ where: { projectId: id } }),
      prisma.story.deleteMany({ where: { projectId: id } }),
      prisma.agentSession.deleteMany({ where: { projectId: id } }),
      prisma.project.delete({ where: { id } }),
    ]);
  } else {
    await prisma.project.delete({ where: { id } });
  }

  return { data: { id, deleted: true } };
});

app.get('/api/v1/stories', async (req, reply) => {
  const q = req.query as {
    status?: StoryStatus;
    projectId?: string;
    limit?: string;
    updated_since?: string;
    fields?: string;
  };
  const where: Prisma.StoryWhereInput = {};

  if (q.projectId && q.projectId !== 'all') where.projectId = q.projectId;
  if (q.status) where.status = q.status;
  const updatedSince = parseUpdatedSince(q.updated_since);
  if (updatedSince && Number.isNaN(updatedSince.getTime())) {
    return reply.status(400).send({ error: 'updated_since must be a valid ISO timestamp' });
  }
  if (updatedSince) where.updatedAt = { gte: updatedSince };

  const stories = await prisma.story.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: parseLimit(q.limit),
  });
  const fields = buildFieldSet(q.fields, STORY_FIELDS_ALLOWLIST);
  return { data: stories.map((story) => shapeRecord(story as unknown as Record<string, unknown>, fields)) };
});

app.post('/api/v1/stories', async (req, reply) => {
  const body = req.body as StoryBody;
  if (!body.title?.trim()) return reply.status(400).send({ error: 'title is required' });

  const projectId = body.projectId ?? 'core';
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return reply.status(404).send({ error: 'project not found' });

  const story = await prisma.story.create({
    data: {
      projectId,
      title: body.title,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      status: body.status ?? 'waiting',
      priority: body.priority ?? 'med',
      blocked: body.blocked ?? false,
      points: body.points,
      assignee: body.assignee,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    },
  });

  const session = await prisma.agentSession.findFirst({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  if (session) {
    await prisma.agentEvent.create({
      data: {
        sessionId: session.id,
        type: 'action',
        message: `Story created: ${story.title}`,
      },
    });
  }

  return reply.status(201).send({ data: story });
});

app.patch('/api/v1/stories/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as StoryBody;

  const existing = await prisma.story.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'story not found' });

  const story = await prisma.story.update({
    where: { id },
    data: {
      title: body.title ?? existing.title,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      status: body.status,
      priority: body.priority,
      blocked: body.blocked,
      points: body.points,
      assignee: body.assignee,
      dueAt: body.dueAt === undefined ? undefined : body.dueAt ? new Date(body.dueAt) : null,
    },
  });

  return { data: story };
});

app.post('/api/v1/stories/:id/move', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: StoryStatus };

  const existing = await prisma.story.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'story not found' });

  const story = await prisma.story.update({ where: { id }, data: { status } });

  const session = await prisma.agentSession.findFirst({ where: { projectId: story.projectId }, orderBy: { createdAt: 'asc' } });
  if (session) {
    await prisma.agentEvent.create({
      data: {
        sessionId: session.id,
        type: 'status',
        message: `Story moved: ${story.title} -> ${status}`,
      },
    });
  }

  return { data: story };
});

app.delete('/api/v1/stories/:id', async (req, reply) => {
  const { id } = req.params as { id: string };

  const story = await prisma.story.findUnique({ where: { id } });
  if (!story) return reply.status(404).send({ error: 'story not found' });

  await prisma.$transaction([
    prisma.fileAsset.deleteMany({ where: { storyId: id } }),
    prisma.story.delete({ where: { id } }),
  ]);

  return { data: { id, deleted: true } };
});

app.get('/api/v1/stories/:id/notes', async (req) => {
  const { id } = req.params as { id: string };
  const notes = await prisma.storyNote.findMany({ where: { storyId: id }, orderBy: { createdAt: 'desc' } });
  return { data: notes };
});

app.post('/api/v1/stories/:id/notes', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { body?: string; author?: string; kind?: string };

  const story = await prisma.story.findUnique({ where: { id } });
  if (!story) return reply.status(404).send({ error: 'story not found' });
  if (!body?.body?.trim()) return reply.status(400).send({ error: 'body is required' });

  const note = await prisma.storyNote.create({
    data: {
      storyId: id,
      author: body.author ?? 'you',
      body: body.body,
      kind: body.kind ?? 'note',
    },
  });

  return reply.status(201).send({ data: note });
});

app.get('/api/v1/stories/:id/labels', async (req, reply) => {
  const { id } = req.params as { id: string };
  const story = await prisma.story.findUnique({ where: { id } });
  if (!story) return reply.status(404).send({ error: 'story not found' });

  const labels = await prisma.storyLabel.findMany({ where: { storyId: id }, orderBy: { label: 'asc' } });
  return { data: labels };
});

app.post('/api/v1/stories/:id/labels', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { label?: string };
  const label = body?.label?.trim();

  if (!label) return reply.status(400).send({ error: 'label is required' });

  const story = await prisma.story.findUnique({ where: { id } });
  if (!story) return reply.status(404).send({ error: 'story not found' });

  try {
    const created = await prisma.storyLabel.create({ data: { storyId: id, label } });
    return reply.status(201).send({ data: created });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.status(409).send({ error: 'label already exists for this story' });
    }
    throw error;
  }
});

app.delete('/api/v1/stories/:id/labels/:label', async (req, reply) => {
  const { id, label } = req.params as { id: string; label: string };
  const story = await prisma.story.findUnique({ where: { id } });
  if (!story) return reply.status(404).send({ error: 'story not found' });

  const deleted = await prisma.storyLabel.deleteMany({ where: { storyId: id, label } });
  if (deleted.count === 0) return reply.status(404).send({ error: 'label not found' });

  return { data: { storyId: id, label, deleted: true } };
});

app.get('/api/v1/stories/:id/dependencies', async (req) => {
  const { id } = req.params as { id: string };
  const deps = await prisma.storyDependency.findMany({ where: { storyId: id }, orderBy: { createdAt: 'desc' } });
  return { data: deps };
});

app.post('/api/v1/stories/:id/dependencies', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { dependsOnStoryId?: string; type?: string };

  const story = await prisma.story.findUnique({ where: { id } });
  if (!story) return reply.status(404).send({ error: 'story not found' });
  if (!body?.dependsOnStoryId) return reply.status(400).send({ error: 'dependsOnStoryId is required' });

  const dependencyTarget = await prisma.story.findUnique({ where: { id: body.dependsOnStoryId } });
  if (!dependencyTarget) return reply.status(404).send({ error: 'dependsOn story not found' });

  try {
    const dependency = await prisma.storyDependency.create({
      data: {
        storyId: id,
        dependsOnStoryId: body.dependsOnStoryId,
        type: body.type ?? 'blocks',
      },
    });

    await refreshBlocked(id);
    return reply.status(201).send({ data: dependency });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.status(409).send({ error: 'dependency already exists' });
    }
    throw error;
  }
});

app.delete('/api/v1/dependencies/:id', async (req, reply) => {
  const { id } = req.params as { id: string };

  const dependency = await prisma.storyDependency.findUnique({ where: { id } });
  if (!dependency) return reply.status(404).send({ error: 'dependency not found' });

  await prisma.storyDependency.delete({ where: { id } });
  await refreshBlocked(dependency.storyId);

  return { data: { id, deleted: true } };
});

app.get('/api/v1/files', async (req, reply) => {
  const q = req.query as {
    storyId?: string;
    projectId?: string;
    limit?: string;
    updated_since?: string;
    fields?: string;
    include?: string;
  };
  const where: Prisma.FileAssetWhereInput = {};

  if (q.projectId && q.projectId !== 'all') where.projectId = q.projectId;
  if (q.storyId) where.storyId = q.storyId;
  const updatedSince = parseUpdatedSince(q.updated_since);
  if (updatedSince && Number.isNaN(updatedSince.getTime())) {
    return reply.status(400).send({ error: 'updated_since must be a valid ISO timestamp' });
  }
  if (updatedSince) where.createdAt = { gte: updatedSince };

  const files = await prisma.fileAsset.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: parseLimit(q.limit),
  });

  const fields = buildFieldSet(q.fields, FILE_FIELDS_ALLOWLIST);
  const includeSet = new Set(parseCsv(q.include).filter((field) => FILE_LIST_INCLUDE_ALLOWLIST.has(field)));
  includeSet.forEach((field) => fields?.add(field));

  const data = files.map((file) => {
    const shaped = shapeRecord(file as unknown as Record<string, unknown>, fields);
    if ('summary' in shaped) shaped.summary = truncate(shaped.summary, 400);
    if ('textContent' in shaped) shaped.textContent = truncate(shaped.textContent, 2000);
    return shaped;
  });
  return { data };
});

app.post('/api/v1/files', async (req, reply) => {
  const body = req.body as {
    projectId?: string;
    storyId?: string;
    filename?: string;
    contentType?: string;
    byteSize?: number;
    filePath?: string;
    textContent?: string;
    summary?: string;
    uploadedBy?: string;
  };

  if (!body.filename?.trim()) return reply.status(400).send({ error: 'filename is required' });

  const projectId = body.projectId && body.projectId !== 'all' ? body.projectId : 'core';
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return reply.status(404).send({ error: 'project not found' });

  if (body.storyId) {
    const story = await prisma.story.findUnique({ where: { id: body.storyId } });
    if (!story) return reply.status(404).send({ error: 'story not found' });
  }

  const file = await prisma.fileAsset.create({
    data: {
      projectId,
      storyId: body.storyId,
      filename: body.filename,
      contentType: body.contentType ?? 'application/octet-stream',
      byteSize: body.byteSize ?? 0,
      filePath: body.filePath ?? `files/${projectId}/${Date.now()}-${body.filename}`,
      textContent: body.textContent,
      summary: body.summary,
      uploadedBy: body.uploadedBy ?? 'you',
    },
  });

  const session = await prisma.agentSession.findFirst({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  if (session) {
    await prisma.agentEvent.create({
      data: {
        sessionId: session.id,
        type: 'artifact',
        message: `Context file added: ${file.filename}`,
      },
    });
  }

  return reply.status(201).send({ data: file });
});

app.get('/api/v1/files/:id/content', async (req, reply) => {
  const { id } = req.params as { id: string };
  const file = await prisma.fileAsset.findUnique({ where: { id } });
  if (!file) return reply.status(404).send({ error: 'file not found' });

  return {
    data: {
      id: file.id,
      summary: file.summary,
      textContent: file.textContent,
    },
  };
});

app.post('/api/v1/files/upload', async (req, reply) => {
  if (!multipartReady || typeof (req as { parts?: unknown }).parts !== 'function') {
    return reply.status(503).send({
      error: 'multipart support unavailable; install @fastify/multipart to enable uploads',
    });
  }

  const parts = (req as unknown as { parts: () => AsyncIterable<any> }).parts();

  let projectId: string | undefined;
  let storyId: string | undefined;
  let uploadedBy: string | undefined;
  let filePart: any;

  for await (const part of parts) {
    if (part.type === 'file' && part.fieldname === 'file') {
      filePart = part;
      continue;
    }
    if (part.type === 'field') {
      if (part.fieldname === 'projectId') projectId = String(part.value);
      if (part.fieldname === 'storyId') storyId = String(part.value);
      if (part.fieldname === 'uploadedBy') uploadedBy = String(part.value);
    }
  }

  if (!projectId?.trim()) return reply.status(400).send({ error: 'projectId is required' });
  if (!uploadedBy?.trim()) return reply.status(400).send({ error: 'uploadedBy is required' });
  if (!filePart) return reply.status(400).send({ error: 'file is required' });

  const normalizedProjectId = projectId.trim();
  const normalizedStoryId = storyId?.trim() || undefined;

  const project = await prisma.project.findUnique({ where: { id: normalizedProjectId } });
  if (!project) return reply.status(404).send({ error: 'project not found' });

  if (normalizedStoryId) {
    const story = await prisma.story.findUnique({ where: { id: normalizedStoryId } });
    if (!story) return reply.status(404).send({ error: 'story not found' });
  }

  const dirSuffix = normalizedStoryId ?? 'project-level';
  const relativeDir = path.join('files', normalizedProjectId, dirSuffix);
  const absoluteDir = path.join(dataDir, relativeDir);
  await mkdir(absoluteDir, { recursive: true });

  const originalName = path.basename(filePart.filename ?? `upload-${Date.now()}`);
  const safeFilename = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedFilename = `${Date.now()}-${randomUUID()}-${safeFilename}`;
  const relativePath = path.join(relativeDir, storedFilename);
  const absolutePath = path.join(dataDir, relativePath);

  const fileBytes = await filePart.toBuffer();
  await writeFile(absolutePath, fileBytes);

  const file = await prisma.fileAsset.create({
    data: {
      projectId: normalizedProjectId,
      storyId: normalizedStoryId,
      filename: originalName,
      contentType: filePart.mimetype ?? 'application/octet-stream',
      byteSize: fileBytes.byteLength,
      filePath: relativePath,
      uploadedBy: uploadedBy.trim(),
    },
  });

  return reply.status(201).send({ data: file });
});

app.delete('/api/v1/files/:id', async (req, reply) => {
  const { id } = req.params as { id: string };

  const file = await prisma.fileAsset.findUnique({ where: { id } });
  if (!file) return reply.status(404).send({ error: 'file not found' });

  const maybeRelativePath = file.filePath.replace(/^\/+/, '');
  const absolutePath = path.join(dataDir, maybeRelativePath);
  try {
    await unlink(absolutePath);
  } catch {
    // Ignore missing files, remove DB row regardless.
  }

  await prisma.fileAsset.delete({ where: { id } });
  return { data: { id, deleted: true } };
});

app.get('/api/v1/agent/sessions', async (req) => {
  const q = req.query as { projectId?: string };
  const where: Prisma.AgentSessionWhereInput = {};
  if (q.projectId && q.projectId !== 'all') where.projectId = q.projectId;

  const sessions = await prisma.agentSession.findMany({ where, orderBy: { createdAt: 'asc' } });
  return { data: sessions };
});

app.get('/api/v1/agent/sessions/:id/events', async (req, reply) => {
  const { id } = req.params as { id: string };
  const q = req.query as { limit?: string; updated_since?: string };
  const where: Prisma.AgentEventWhereInput = { sessionId: id };
  const updatedSince = parseUpdatedSince(q.updated_since);
  if (updatedSince && Number.isNaN(updatedSince.getTime())) {
    return reply.status(400).send({ error: 'updated_since must be a valid ISO timestamp' });
  }
  if (updatedSince) where.createdAt = { gte: updatedSince };

  const events = await prisma.agentEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: parseLimit(q.limit),
  });
  return { data: events };
});

app.post('/api/v1/agent/sessions/:id/events', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { type?: string; message?: string };

  const session = await prisma.agentSession.findUnique({ where: { id } });
  if (!session) return reply.status(404).send({ error: 'session not found' });
  if (!body?.message) return reply.status(400).send({ error: 'message is required' });

  const event = await prisma.agentEvent.create({
    data: {
      sessionId: id,
      type: body.type ?? 'action',
      message: body.message,
    },
  });

  await prisma.agentSession.update({ where: { id }, data: { lastHeartbeatAt: new Date() } });
  return reply.status(201).send({ data: event });
});

app.get('/api/v1/digests/project/:projectId/daily', async (req) => {
  const { projectId } = req.params as { projectId: string };
  const storyWhere = projectId === 'all' ? {} : { projectId };

  const [projectStories, recentEvents] = await Promise.all([
    prisma.story.findMany({ where: storyWhere, orderBy: { updatedAt: 'desc' } }),
    prisma.agentEvent.findMany({
      where: projectId === 'all' ? {} : { session: { projectId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const counts = {
    waiting: projectStories.filter((s) => s.status === 'waiting').length,
    in_progress: projectStories.filter((s) => s.status === 'in_progress').length,
    completed: projectStories.filter((s) => s.status === 'completed').length,
  };

  const blocked = projectStories.filter((s) => s.blocked).map((s) => ({ id: s.id, title: s.title }));
  const recent = recentEvents.map((e) => e.message);

  return {
    data: {
      counts,
      blocked,
      recent_activity: recent,
      next_actions: blocked.length ? ['Unblock blocked stories'] : ['Move waiting stories into progress'],
    },
  };
});

async function start() {
  await ensureDataLayout();
  await applySqlitePragmas();
  await bootstrapCoreProject();

  const port = Number(process.env.PORT || 4000);
  await app.listen({ port, host: '0.0.0.0' });
}

await start();

app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

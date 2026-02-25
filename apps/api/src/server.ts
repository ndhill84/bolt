import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Prisma, PrismaClient } from '@prisma/client';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
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
  sprintId?: string | null;
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

type SprintStatus = 'planned' | 'active' | 'closed';

type SprintBody = {
  name?: string;
  goal?: string;
  status?: SprintStatus;
  startAt?: string | null;
  endAt?: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const TEXT_CONTENT_MAX_CHARS = 20000;
const SUMMARY_MAX_CHARS = 400;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/xml',
  'text/xml',
  'application/octet-stream',
]);
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
  'extracted',
  'uploadedBy',
  'createdAt',
]);
const PRIORITY_ALLOWLIST = new Set(['low', 'med', 'high', 'urgent']);
const SPRINT_STATUS_ALLOWLIST = new Set(['planned', 'active', 'closed']);
const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 48;
const MAX_BATCH_SIZE = 100;

type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

type IdempotencyMeta = {
  key: string;
  method: string;
  route: string;
  fingerprint: string;
};

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(appDir, 'data');
const writeRateWindow = new Map<string, { count: number; resetAt: number }>();

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

async function refreshBlockedForDependents(dependsOnStoryId: string) {
  const dependents = await prisma.storyDependency.findMany({
    where: { dependsOnStoryId },
    select: { storyId: true },
  });

  await Promise.all(dependents.map((dep) => refreshBlocked(dep.storyId)));
}

async function createsDependencyCycle(storyId: string, dependsOnStoryId: string): Promise<boolean> {
  const queue = [dependsOnStoryId];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (current === storyId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const nextEdges = await prisma.storyDependency.findMany({
      where: { storyId: current },
      select: { dependsOnStoryId: true },
    });

    for (const edge of nextEdges) queue.push(edge.dependsOnStoryId);
  }

  return false;
}

function parseLimitStrict(raw?: string): { limit: number; error?: string } {
  if (!raw) return { limit: DEFAULT_LIMIT };
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return { limit: DEFAULT_LIMIT, error: 'limit must be a positive integer' };
  if (parsed > MAX_LIMIT) return { limit: MAX_LIMIT, error: `limit capped at ${MAX_LIMIT}` };
  return { limit: parsed };
}

function parseUpdatedSince(raw?: string): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date('');
  return parsed;
}

function invalidUpdatedSinceReply(reply: any) {
  return reply.status(400).send({ error: 'updated_since must be a valid ISO timestamp' });
}

function invalidLimitReply(reply: any, error?: string) {
  if (!error) return null;
  return reply.status(400).send({ error });
}

function invalidFieldsReply(reply: any, invalid: string[]) {
  return reply.status(400).send({ error: `invalid fields: ${invalid.join(',')}` });
}

function invalidIncludeReply(reply: any, invalid: string[]) {
  return reply.status(400).send({ error: `invalid include: ${invalid.join(',')}` });
}

function normalizeProjectId(projectId?: string): string | null {
  if (!projectId || projectId === 'all') return null;
  return projectId;
}

function parseCsv(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function buildFieldSet(raw: string | undefined, allowlist: Set<string>): { fields: Set<string> | null; invalid: string[] } {
  if (!raw) return { fields: null, invalid: [] };
  const requested = parseCsv(raw);
  const invalid = requested.filter((field) => !allowlist.has(field));
  return { fields: new Set(requested.filter((field) => allowlist.has(field))), invalid };
}

function parseIncludeSet(raw: string | undefined, allowlist: Set<string>): { include: Set<string>; invalid: string[] } {
  const requested = parseCsv(raw);
  const invalid = requested.filter((field) => !allowlist.has(field));
  return { include: new Set(requested.filter((field) => allowlist.has(field))), invalid };
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

function canExtractText(contentType: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  if (contentType.startsWith('text/')) return true;
  if (contentType === 'application/json' || contentType === 'application/xml') return true;
  return ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.xml', '.yml', '.yaml'].some((ext) =>
    lower.endsWith(ext),
  );
}

function deriveTextAndSummary(contentType: string, filename: string, bytes: Buffer): {
  textContent: string | null;
  summary: string | null;
  extractionError?: string;
} {
  if (!canExtractText(contentType, filename)) return { textContent: null, summary: null };

  try {
    const text = bytes.toString('utf8').replace(/\u0000/g, '').trim();
    if (!text) return { textContent: null, summary: null };

    const normalized = text.replace(/\s+/g, ' ').trim();
    const summary = normalized.slice(0, SUMMARY_MAX_CHARS);
    return {
      textContent: text.slice(0, TEXT_CONTENT_MAX_CHARS),
      summary: summary || null,
    };
  } catch (error) {
    return {
      textContent: null,
      summary: null,
      extractionError: error instanceof Error ? error.message : 'unknown extraction error',
    };
  }
}

function codeFromStatus(statusCode: number): ErrorCode {
  if (statusCode === 400) return 'BAD_REQUEST';
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 409) return 'CONFLICT';
  if (statusCode === 413) return 'PAYLOAD_TOO_LARGE';
  if (statusCode === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (statusCode === 429) return 'RATE_LIMITED';
  if (statusCode === 503) return 'SERVICE_UNAVAILABLE';
  if (statusCode >= 500) return 'INTERNAL_ERROR';
  return 'BAD_REQUEST';
}

function errorPayload(statusCode: number, message: string, code?: ErrorCode, details?: Record<string, unknown>): ErrorEnvelope {
  return {
    error: {
      code: code ?? codeFromStatus(statusCode),
      message,
      ...(details ? { details } : {}),
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function idempotencyFingerprint(req: FastifyRequest, route: string): string {
  const source = stableStringify({
    method: req.method,
    route,
    params: req.params ?? {},
    query: req.query ?? {},
    body: req.body ?? null,
  });
  return createHash('sha256').update(source).digest('hex');
}

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor?: string): { updatedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    const updatedAt = new Date(iso);
    if (!id || Number.isNaN(updatedAt.getTime())) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function cursorWhere(cursor?: string): Prisma.StoryWhereInput | null {
  const parsed = decodeCursor(cursor);
  if (!parsed) return null;
  return {
    OR: [
      { updatedAt: { lt: parsed.updatedAt } },
      { updatedAt: parsed.updatedAt, id: { lt: parsed.id } },
    ],
  };
}

function cursorWhereByCreatedAt(cursor?: string): Prisma.FileAssetWhereInput | null {
  const parsed = decodeCursor(cursor);
  if (!parsed) return null;
  return {
    OR: [
      { createdAt: { lt: parsed.updatedAt } },
      { createdAt: parsed.updatedAt, id: { lt: parsed.id } },
    ],
  };
}

async function logAudit(eventType: string, entityType: string, entityId: string, projectId?: string | null, payload?: unknown) {
  try {
    await prisma.auditEvent.create({
      data: {
        eventType,
        entityType,
        entityId,
        projectId: projectId ?? null,
        source: 'api',
        payload: payload === undefined ? null : JSON.stringify(payload),
      },
    });
  } catch (error) {
    app.log.warn({ err: error }, 'failed to write audit event');
  }
}

app.addHook('preHandler', async (req, reply) => {
  const authToken = process.env.BOLT_API_TOKEN;
  if (authToken) {
    const inbound = req.headers['x-bolt-token'];
    const provided = typeof inbound === 'string' ? inbound : Array.isArray(inbound) ? inbound[0] : '';
    if (provided !== authToken) {
      return reply.status(401).send(errorPayload(401, 'unauthorized'));
    }
  }

  if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    const writeKey = `${req.ip}:${req.method}`;
    const now = Date.now();
    const windowMs = 60_000;
    const maxWrites = 120;
    const current = writeRateWindow.get(writeKey);
    if (!current || current.resetAt <= now) {
      writeRateWindow.set(writeKey, { count: 1, resetAt: now + windowMs });
    } else {
      current.count += 1;
      if (current.count > maxWrites) {
        return reply.status(429).send(errorPayload(429, 'write rate limit exceeded'));
      }
    }
  }

  if (!['POST', 'PATCH'].includes(req.method)) return;

  const keyHeader = req.headers['idempotency-key'];
  const key = typeof keyHeader === 'string' ? keyHeader.trim() : '';
  if (!key) return;

  const route = req.routeOptions.url ?? req.url.split('?')[0] ?? '/unknown';
  const method = req.method;
  const fingerprint = idempotencyFingerprint(req, route);

  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      key_method_route: {
        key,
        method,
        route,
      },
    },
  });

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return reply.status(409).send(errorPayload(409, 'idempotency key reused with a different request payload', 'IDEMPOTENCY_CONFLICT'));
    }

    reply.header('x-idempotent-replay', 'true');
    return reply.status(existing.statusCode).type('application/json').send(existing.responseBody);
  }

  (req as FastifyRequest & { idempotencyMeta?: IdempotencyMeta }).idempotencyMeta = {
    key,
    method,
    route,
    fingerprint,
  };
});

app.addHook('onSend', async (req, reply, payload) => {
  let outgoing: unknown = payload;
  if (typeof payload === 'string') {
    try {
      outgoing = JSON.parse(payload);
    } catch {
      outgoing = payload;
    }
  }

  if (reply.statusCode >= 400 && typeof outgoing === 'object' && outgoing !== null) {
    const obj = outgoing as Record<string, unknown>;
    const nestedError = obj.error as Record<string, unknown> | undefined;

    if (typeof obj.error === 'string') {
      outgoing = errorPayload(reply.statusCode, obj.error);
    } else if (nestedError && (typeof nestedError.code !== 'string' || typeof nestedError.message !== 'string')) {
      const message =
        typeof nestedError.message === 'string'
          ? nestedError.message
          : typeof obj.message === 'string'
            ? obj.message
            : 'request failed';
      outgoing = errorPayload(reply.statusCode, message);
    } else if (!obj.error && typeof obj.message === 'string') {
      outgoing = errorPayload(reply.statusCode, obj.message);
    }
  }

  const meta = (req as FastifyRequest & { idempotencyMeta?: IdempotencyMeta }).idempotencyMeta;
  if (meta && reply.statusCode < 500) {
    const bodyString = typeof outgoing === 'string' ? outgoing : JSON.stringify(outgoing);
    try {
      await prisma.idempotencyRecord.create({
        data: {
          key: meta.key,
          method: meta.method,
          route: meta.route,
          fingerprint: meta.fingerprint,
          statusCode: reply.statusCode,
          responseBody: bodyString,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        req.log.warn({ err: error }, 'failed to persist idempotency record');
      }
    }
  }

  if (typeof outgoing === 'string') return outgoing;
  return JSON.stringify(outgoing);
});

app.setErrorHandler((error: unknown, _req, reply) => {
  const maybeError = error as { statusCode?: number; message?: string };
  const statusCode = typeof maybeError.statusCode === 'number' ? maybeError.statusCode : 500;
  return reply.status(statusCode).send(errorPayload(statusCode, maybeError.message || 'internal error'));
});

app.get('/health', async () => ({ ok: true }));

app.get('/ready', async (_req, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await Promise.all([
      prisma.project.count({ where: { id: 'core' } }),
      prisma.idempotencyRecord.count(),
      prisma.auditEvent.count(),
      prisma.sprint.count(),
    ]);
    return { ok: true };
  } catch (error) {
    return reply.status(503).send(errorPayload(503, 'service not ready', 'SERVICE_UNAVAILABLE', {
      reason: error instanceof Error ? error.message : 'unknown',
    }));
  }
});

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

  await logAudit('project.created', 'project', project.id, project.id, { name: project.name });
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

  await logAudit('project.updated', 'project', project.id, project.id, {
    before: { name: existing.name, description: existing.description },
    after: { name: project.name, description: project.description },
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

  await logAudit('project.deleted', 'project', id, id, { force: force === 'true' });
  return { data: { id, deleted: true } };
});

app.get('/api/v1/projects/:id/sprints', async (req, reply) => {
  const { id } = req.params as { id: string };
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return reply.status(404).send({ error: 'project not found' });

  const sprints = await prisma.sprint.findMany({
    where: { projectId: id },
    orderBy: [{ createdAt: 'desc' }],
  });
  return { data: sprints };
});

app.post('/api/v1/projects/:id/sprints', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as SprintBody;
  if (!body?.name?.trim()) return reply.status(400).send({ error: 'name is required' });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return reply.status(404).send({ error: 'project not found' });

  if (body.status && !SPRINT_STATUS_ALLOWLIST.has(body.status)) {
    return reply.status(400).send(errorPayload(400, 'invalid sprint status', 'VALIDATION_ERROR'));
  }

  if ((body.status ?? 'planned') === 'active') {
    const active = await prisma.sprint.findFirst({ where: { projectId: id, status: 'active' } });
    if (active) return reply.status(409).send({ error: 'only one active sprint is allowed per project' });
  }

  const sprint = await prisma.sprint.create({
    data: {
      projectId: id,
      name: body.name.trim(),
      goal: body.goal,
      status: body.status ?? 'planned',
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
    },
  });

  await logAudit('sprint.created', 'sprint', sprint.id, id, { name: sprint.name, status: sprint.status });
  return reply.status(201).send({ data: sprint });
});

app.patch('/api/v1/sprints/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as SprintBody;

  const existing = await prisma.sprint.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'sprint not found' });

  if (body.status && !SPRINT_STATUS_ALLOWLIST.has(body.status)) {
    return reply.status(400).send(errorPayload(400, 'invalid sprint status', 'VALIDATION_ERROR'));
  }

  if (body.status === 'active' && existing.status !== 'active') {
    const active = await prisma.sprint.findFirst({ where: { projectId: existing.projectId, status: 'active' } });
    if (active && active.id !== id) {
      return reply.status(409).send({ error: 'only one active sprint is allowed per project' });
    }
  }

  if (existing.status === 'closed' && body.status && body.status !== 'closed') {
    return reply.status(409).send({ error: 'closed sprint cannot be reopened in v2 defaults' });
  }

  const sprint = await prisma.sprint.update({
    where: { id },
    data: {
      name: body.name?.trim() ?? existing.name,
      goal: body.goal ?? existing.goal,
      status: body.status ?? existing.status,
      startAt: body.startAt === undefined ? existing.startAt : body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt === undefined ? existing.endAt : body.endAt ? new Date(body.endAt) : null,
    },
  });

  await logAudit('sprint.updated', 'sprint', sprint.id, sprint.projectId, { before: existing, after: sprint });
  return { data: sprint };
});

app.post('/api/v1/sprints/:id/start', async (req, reply) => {
  const { id } = req.params as { id: string };
  const existing = await prisma.sprint.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'sprint not found' });
  if (existing.status === 'closed') return reply.status(409).send({ error: 'cannot start a closed sprint' });

  const active = await prisma.sprint.findFirst({ where: { projectId: existing.projectId, status: 'active' } });
  if (active && active.id !== id) {
    return reply.status(409).send({ error: 'only one active sprint is allowed per project' });
  }

  const sprint = await prisma.sprint.update({
    where: { id },
    data: { status: 'active', startAt: existing.startAt ?? new Date() },
  });

  await logAudit('sprint.started', 'sprint', sprint.id, sprint.projectId);
  return { data: sprint };
});

app.post('/api/v1/sprints/:id/close', async (req, reply) => {
  const { id } = req.params as { id: string };
  const existing = await prisma.sprint.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'sprint not found' });

  const sprint = await prisma.sprint.update({
    where: { id },
    data: { status: 'closed', endAt: existing.endAt ?? new Date() },
  });

  await logAudit('sprint.closed', 'sprint', sprint.id, sprint.projectId);
  return { data: sprint };
});

app.post('/api/v1/sprints/:id/stories:assign', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { storyIds?: string[]; dry_run?: boolean };
  const storyIds = body.storyIds ?? [];
  if (!Array.isArray(storyIds) || storyIds.length === 0) return reply.status(400).send({ error: 'storyIds is required' });
  if (storyIds.length > MAX_BATCH_SIZE) {
    return reply.status(400).send(errorPayload(400, `max batch size is ${MAX_BATCH_SIZE}`, 'VALIDATION_ERROR'));
  }

  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) return reply.status(404).send({ error: 'sprint not found' });
  if (sprint.status === 'closed') return reply.status(409).send({ error: 'cannot assign stories to closed sprint' });

  const stories = await prisma.story.findMany({ where: { id: { in: storyIds } } });
  const invalid = stories.filter((s) => s.projectId !== sprint.projectId).map((s) => s.id);
  if (invalid.length) {
    return reply.status(400).send(errorPayload(400, 'all stories must belong to the sprint project', 'VALIDATION_ERROR', { invalid }));
  }

  if (body.dry_run === true) {
    return { data: { dry_run: true, sprintId: id, assignCount: stories.length } };
  }

  const result = await prisma.story.updateMany({
    where: { id: { in: storyIds }, projectId: sprint.projectId },
    data: { sprintId: id },
  });

  await logAudit('sprint.stories_assigned', 'sprint', id, sprint.projectId, { storyIds, count: result.count });
  return { data: { sprintId: id, assigned: result.count } };
});

app.get('/api/v1/stories', async (req, reply) => {
  const q = req.query as {
    status?: StoryStatus;
    projectId?: string;
    sprintId?: string;
    limit?: string;
    cursor?: string;
    updated_since?: string;
    fields?: string;
    assignee?: string;
    priority?: 'low' | 'med' | 'high' | 'urgent';
    blocked?: 'true' | 'false';
    due_before?: string;
    due_after?: string;
    has_dependencies?: 'true' | 'false';
  };
  const where: Prisma.StoryWhereInput = {};

  const normalizedProjectId = normalizeProjectId(q.projectId);
  if (normalizedProjectId) where.projectId = normalizedProjectId;
  if (q.sprintId) where.sprintId = q.sprintId;
  if (q.status) where.status = q.status;
  if (q.assignee?.trim()) {
    where.assignee = { contains: q.assignee.trim() };
  }
  if (q.priority) {
    if (!PRIORITY_ALLOWLIST.has(q.priority)) {
      return reply.status(400).send(errorPayload(400, 'priority must be one of low, med, high, urgent', 'VALIDATION_ERROR'));
    }
    where.priority = q.priority;
  }
  if (q.blocked !== undefined) {
    if (q.blocked !== 'true' && q.blocked !== 'false') {
      return reply.status(400).send(errorPayload(400, 'blocked must be true or false', 'VALIDATION_ERROR'));
    }
    where.blocked = q.blocked === 'true';
  }

  const updatedSince = parseUpdatedSince(q.updated_since);
  if (updatedSince && Number.isNaN(updatedSince.getTime())) {
    return invalidUpdatedSinceReply(reply);
  }
  if (updatedSince) where.updatedAt = { gte: updatedSince };

  let dueAfter: Date | null = null;
  if (q.due_after) {
    dueAfter = new Date(q.due_after);
    if (Number.isNaN(dueAfter.getTime())) {
      return reply.status(400).send(errorPayload(400, 'due_after must be a valid ISO timestamp', 'VALIDATION_ERROR'));
    }
  }

  let dueBefore: Date | null = null;
  if (q.due_before) {
    dueBefore = new Date(q.due_before);
    if (Number.isNaN(dueBefore.getTime())) {
      return reply.status(400).send(errorPayload(400, 'due_before must be a valid ISO timestamp', 'VALIDATION_ERROR'));
    }
  }

  if (dueAfter || dueBefore) {
    where.dueAt = {
      ...(dueAfter ? { gte: dueAfter } : {}),
      ...(dueBefore ? { lte: dueBefore } : {}),
    };
  }

  if (q.has_dependencies !== undefined) {
    if (q.has_dependencies !== 'true' && q.has_dependencies !== 'false') {
      return reply.status(400).send(errorPayload(400, 'has_dependencies must be true or false', 'VALIDATION_ERROR'));
    }
    where.dependencies = q.has_dependencies === 'true' ? { some: {} } : { none: {} };
  }

  const limitResult = parseLimitStrict(q.limit);
  if (limitResult.error) return invalidLimitReply(reply, limitResult.error);

  const paginationWhere = cursorWhere(q.cursor);
  if (q.cursor && !paginationWhere) {
    return reply.status(400).send(errorPayload(400, 'cursor is invalid', 'VALIDATION_ERROR'));
  }

  const stories = await prisma.story.findMany({
    where: paginationWhere ? { AND: [where, paginationWhere] } : where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limitResult.limit + 1,
  });
  const { fields, invalid } = buildFieldSet(q.fields, STORY_FIELDS_ALLOWLIST);
  if (invalid.length) return invalidFieldsReply(reply, invalid);

  const hasMore = stories.length > limitResult.limit;
  const pageItems = hasMore ? stories.slice(0, limitResult.limit) : stories;
  const nextCursor = hasMore ? encodeCursor(pageItems[pageItems.length - 1].updatedAt, pageItems[pageItems.length - 1].id) : null;

  return {
    data: pageItems.map((story) => shapeRecord(story as unknown as Record<string, unknown>, fields)),
    page: { nextCursor, hasMore },
  };
});

app.post('/api/v1/stories', async (req, reply) => {
  const body = req.body as StoryBody;
  if (!body.title?.trim()) return reply.status(400).send({ error: 'title is required' });

  const projectId = body.projectId ?? 'core';
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return reply.status(404).send({ error: 'project not found' });

  if (body.sprintId) {
    const sprint = await prisma.sprint.findUnique({ where: { id: body.sprintId } });
    if (!sprint) return reply.status(404).send({ error: 'sprint not found' });
    if (sprint.projectId !== projectId) return reply.status(400).send({ error: 'sprint must belong to the same project' });
    if (sprint.status === 'closed') return reply.status(409).send({ error: 'cannot add story to closed sprint' });
  }

  const story = await prisma.story.create({
    data: {
      projectId,
      sprintId: body.sprintId ?? null,
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

  await logAudit('story.created', 'story', story.id, story.projectId, { title: story.title, sprintId: story.sprintId });
  return reply.status(201).send({ data: story });
});

app.patch('/api/v1/stories/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as StoryBody;

  const existing = await prisma.story.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'story not found' });

  if (body.sprintId !== undefined) {
    if (body.sprintId === null) {
      // allow unassign
    } else {
      const sprint = await prisma.sprint.findUnique({ where: { id: body.sprintId } });
      if (!sprint) return reply.status(404).send({ error: 'sprint not found' });
      if (sprint.projectId !== existing.projectId) {
        return reply.status(400).send({ error: 'sprint must belong to the same project' });
      }
      if (sprint.status === 'closed') return reply.status(409).send({ error: 'cannot move story into closed sprint' });
    }
  }

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
      sprintId: body.sprintId === undefined ? undefined : body.sprintId,
      dueAt: body.dueAt === undefined ? undefined : body.dueAt ? new Date(body.dueAt) : null,
    },
  });

  await logAudit('story.updated', 'story', story.id, story.projectId, { before: existing, after: story });
  return { data: story };
});

app.post('/api/v1/stories/:id/move', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: StoryStatus };

  const existing = await prisma.story.findUnique({ where: { id } });
  if (!existing) return reply.status(404).send({ error: 'story not found' });

  const story = await prisma.story.update({ where: { id }, data: { status } });
  await refreshBlockedForDependents(id);
  await logAudit('story.moved', 'story', story.id, story.projectId, { from: existing.status, to: status });

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

  const dependentStoryIds = await prisma.storyDependency.findMany({
    where: { dependsOnStoryId: id },
    select: { storyId: true },
  });

  await prisma.$transaction([
    prisma.fileAsset.deleteMany({ where: { storyId: id } }),
    prisma.story.delete({ where: { id } }),
  ]);

  await Promise.all(dependentStoryIds.map((dep) => refreshBlocked(dep.storyId)));
  await logAudit('story.deleted', 'story', id, story.projectId, { title: story.title });

  return { data: { id, deleted: true } };
});

app.post('/api/v1/stories/batch/move', async (req, reply) => {
  const body = req.body as { items?: Array<{ id: string; status: StoryStatus }>; dry_run?: boolean; all_or_nothing?: boolean };
  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return reply.status(400).send({ error: 'items are required' });
  if (items.length > MAX_BATCH_SIZE) {
    return reply.status(400).send(errorPayload(400, `max batch size is ${MAX_BATCH_SIZE}`, 'VALIDATION_ERROR'));
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const run = async () => {
    for (const item of items) {
      const story = await prisma.story.findUnique({ where: { id: item.id } });
      if (!story) {
        results.push({ id: item.id, ok: false, error: 'story not found' });
        if (body.all_or_nothing) throw new Error(`story ${item.id} not found`);
        continue;
      }
      if (body.dry_run) {
        results.push({ id: item.id, ok: true });
        continue;
      }
      await prisma.story.update({ where: { id: item.id }, data: { status: item.status } });
      await refreshBlockedForDependents(item.id);
      await logAudit('story.moved', 'story', item.id, story.projectId, { to: item.status, batch: true });
      results.push({ id: item.id, ok: true });
    }
  };

  try {
    if (body.all_or_nothing && !body.dry_run) {
      await prisma.$transaction(async () => run());
    } else {
      await run();
    }
  } catch (error) {
    return reply.status(409).send(errorPayload(409, error instanceof Error ? error.message : 'batch move failed', 'CONFLICT', { results }));
  }

  return { data: { dry_run: Boolean(body.dry_run), results } };
});

app.post('/api/v1/stories/batch/patch', async (req, reply) => {
  const body = req.body as {
    items?: Array<{ id: string; patch: Pick<StoryBody, 'priority' | 'assignee' | 'blocked' | 'sprintId' | 'dueAt'> }>;
    dry_run?: boolean;
    all_or_nothing?: boolean;
  };
  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return reply.status(400).send({ error: 'items are required' });
  if (items.length > MAX_BATCH_SIZE) {
    return reply.status(400).send(errorPayload(400, `max batch size is ${MAX_BATCH_SIZE}`, 'VALIDATION_ERROR'));
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const run = async () => {
    for (const item of items) {
      const existing = await prisma.story.findUnique({ where: { id: item.id } });
      if (!existing) {
        results.push({ id: item.id, ok: false, error: 'story not found' });
        if (body.all_or_nothing) throw new Error(`story ${item.id} not found`);
        continue;
      }

      if (item.patch.sprintId) {
        const sprint = await prisma.sprint.findUnique({ where: { id: item.patch.sprintId } });
        if (!sprint || sprint.projectId !== existing.projectId || sprint.status === 'closed') {
          results.push({ id: item.id, ok: false, error: 'invalid sprint assignment' });
          if (body.all_or_nothing) throw new Error(`invalid sprint for ${item.id}`);
          continue;
        }
      }

      if (body.dry_run) {
        results.push({ id: item.id, ok: true });
        continue;
      }

      await prisma.story.update({
        where: { id: item.id },
        data: {
          priority: item.patch.priority,
          assignee: item.patch.assignee,
          blocked: item.patch.blocked,
          sprintId: item.patch.sprintId,
          dueAt: item.patch.dueAt ? new Date(item.patch.dueAt) : item.patch.dueAt === null ? null : undefined,
        },
      });
      await logAudit('story.updated', 'story', item.id, existing.projectId, { patch: item.patch, batch: true });
      results.push({ id: item.id, ok: true });
    }
  };

  try {
    if (body.all_or_nothing && !body.dry_run) {
      await prisma.$transaction(async () => run());
    } else {
      await run();
    }
  } catch (error) {
    return reply.status(409).send(errorPayload(409, error instanceof Error ? error.message : 'batch patch failed', 'CONFLICT', { results }));
  }

  return { data: { dry_run: Boolean(body.dry_run), results } };
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

  await logAudit('note.created', 'story_note', note.id, story.projectId, { storyId: id });
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
  if (body.dependsOnStoryId === id) return reply.status(400).send({ error: 'story cannot depend on itself' });

  const dependencyTarget = await prisma.story.findUnique({ where: { id: body.dependsOnStoryId } });
  if (!dependencyTarget) return reply.status(404).send({ error: 'dependsOn story not found' });
  if (dependencyTarget.projectId !== story.projectId) {
    return reply.status(400).send({ error: 'dependencies must be within the same project' });
  }

  if (await createsDependencyCycle(id, body.dependsOnStoryId)) {
    return reply.status(400).send({ error: 'dependency would create a cycle' });
  }

  try {
    const dependency = await prisma.storyDependency.create({
      data: {
        storyId: id,
        dependsOnStoryId: body.dependsOnStoryId,
        type: body.type ?? 'blocks',
      },
    });

    await refreshBlocked(id);
    await logAudit('dependency.created', 'story_dependency', dependency.id, story.projectId, {
      storyId: id,
      dependsOnStoryId: body.dependsOnStoryId,
    });
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
  const ownerStory = await prisma.story.findUnique({ where: { id: dependency.storyId } });
  await logAudit('dependency.deleted', 'story_dependency', id, ownerStory?.projectId, { storyId: dependency.storyId });

  return { data: { id, deleted: true } };
});

app.get('/api/v1/files', async (req, reply) => {
  const q = req.query as {
    storyId?: string;
    projectId?: string;
    limit?: string;
    cursor?: string;
    updated_since?: string;
    fields?: string;
    include?: string;
  };
  const where: Prisma.FileAssetWhereInput = {};

  const normalizedProjectId = normalizeProjectId(q.projectId);
  if (normalizedProjectId) where.projectId = normalizedProjectId;
  if (q.storyId) where.storyId = q.storyId;
  const updatedSince = parseUpdatedSince(q.updated_since);
  if (updatedSince && Number.isNaN(updatedSince.getTime())) {
    return invalidUpdatedSinceReply(reply);
  }
  if (updatedSince) where.createdAt = { gte: updatedSince };

  const limitResult = parseLimitStrict(q.limit);
  if (limitResult.error) return invalidLimitReply(reply, limitResult.error);

  const paginationWhere = cursorWhereByCreatedAt(q.cursor);
  if (q.cursor && !paginationWhere) {
    return reply.status(400).send(errorPayload(400, 'cursor is invalid', 'VALIDATION_ERROR'));
  }

  const files = await prisma.fileAsset.findMany({
    where: paginationWhere ? { AND: [where, paginationWhere] } : where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limitResult.limit + 1,
  });

  const { fields, invalid: invalidFields } = buildFieldSet(q.fields, FILE_FIELDS_ALLOWLIST);
  const { include: includeSet, invalid: invalidInclude } = parseIncludeSet(q.include, FILE_LIST_INCLUDE_ALLOWLIST);
  if (invalidFields.length) return invalidFieldsReply(reply, invalidFields);
  if (invalidInclude.length) return invalidIncludeReply(reply, invalidInclude);

  const defaultFileFields = [
    'id',
    'projectId',
    'storyId',
    'filename',
    'contentType',
    'byteSize',
    'filePath',
    'extracted',
    'uploadedBy',
    'createdAt',
  ];

  const effectiveFields = fields ? new Set(fields) : new Set(defaultFileFields);
  includeSet.forEach((field) => effectiveFields.add(field));

  const hasMore = files.length > limitResult.limit;
  const pageItems = hasMore ? files.slice(0, limitResult.limit) : files;

  const data = pageItems.map((file) => {
    const shaped = shapeRecord(file as unknown as Record<string, unknown>, effectiveFields);
    if (effectiveFields.has('extracted')) shaped.extracted = Boolean(file.textContent);
    if ('summary' in shaped) shaped.summary = truncate(shaped.summary, 400);
    if ('textContent' in shaped) shaped.textContent = truncate(shaped.textContent, 2000);
    return shaped;
  });
  const nextCursor = hasMore ? encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id) : null;
  return { data, page: { nextCursor, hasMore } };
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

  const inferredSummary = body.summary ?? (typeof body.textContent === 'string' ? body.textContent.slice(0, SUMMARY_MAX_CHARS) : undefined);

  const file = await prisma.fileAsset.create({
    data: {
      projectId,
      storyId: body.storyId,
      filename: body.filename,
      contentType: body.contentType ?? 'application/octet-stream',
      byteSize: body.byteSize ?? 0,
      filePath: body.filePath ?? `files/${projectId}/${Date.now()}-${body.filename}`,
      textContent: body.textContent,
      summary: inferredSummary,
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

  await logAudit('file.created', 'file', file.id, projectId, { filename: file.filename, storyId: file.storyId });
  return reply.status(201).send({ data: file });
});

app.get('/api/v1/files/:id/content', async (req, reply) => {
  const { id } = req.params as { id: string };
  const file = await prisma.fileAsset.findUnique({ where: { id } });
  if (!file) return reply.status(404).send({ error: 'file not found' });

  return {
    data: {
      id: file.id,
      extracted: Boolean(file.textContent),
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
  if (fileBytes.byteLength === 0) {
    return reply.status(400).send({ error: 'empty file uploads are not allowed' });
  }
  if (fileBytes.byteLength > MAX_UPLOAD_BYTES) {
    return reply.status(413).send({ error: `file too large; max ${MAX_UPLOAD_BYTES} bytes` });
  }

  const contentType = filePart.mimetype ?? 'application/octet-stream';
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType) && !contentType.startsWith('text/')) {
    return reply.status(415).send({ error: `unsupported content type: ${contentType}` });
  }

  await writeFile(absolutePath, fileBytes);

  const extracted = deriveTextAndSummary(contentType, originalName, fileBytes);

  const file = await prisma.fileAsset.create({
    data: {
      projectId: normalizedProjectId,
      storyId: normalizedStoryId,
      filename: originalName,
      contentType,
      byteSize: fileBytes.byteLength,
      filePath: relativePath,
      textContent: extracted.textContent,
      summary: extracted.summary,
      uploadedBy: uploadedBy.trim(),
    },
  });

  if (extracted.extractionError) {
    app.log.warn(
      {
        fileId: file.id,
        projectId: normalizedProjectId,
        storyId: normalizedStoryId,
        filename: originalName,
        extractionError: extracted.extractionError,
      },
      'file extraction failed',
    );
  }

  await logAudit('file.uploaded', 'file', file.id, normalizedProjectId, { filename: file.filename, storyId: file.storyId });
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
  await logAudit('file.deleted', 'file', id, file.projectId, { filename: file.filename });
  return { data: { id, deleted: true } };
});

app.get('/api/v1/agent/sessions', async (req) => {
  const q = req.query as { projectId?: string };
  const where: Prisma.AgentSessionWhereInput = {};
  const normalizedProjectId = normalizeProjectId(q.projectId);
  if (normalizedProjectId) where.projectId = normalizedProjectId;

  const sessions = await prisma.agentSession.findMany({ where, orderBy: { createdAt: 'asc' } });
  return { data: sessions };
});

app.get('/api/v1/agent/sessions/:id/events', async (req, reply) => {
  const { id } = req.params as { id: string };
  const q = req.query as { limit?: string; cursor?: string; updated_since?: string };
  const where: Prisma.AgentEventWhereInput = { sessionId: id };
  const updatedSince = parseUpdatedSince(q.updated_since);
  if (updatedSince && Number.isNaN(updatedSince.getTime())) {
    return invalidUpdatedSinceReply(reply);
  }
  if (updatedSince) where.createdAt = { gte: updatedSince };

  const parsedCursor = decodeCursor(q.cursor);
  if (q.cursor && !parsedCursor) {
    return reply.status(400).send(errorPayload(400, 'cursor is invalid', 'VALIDATION_ERROR'));
  }
  if (parsedCursor) {
    where.OR = [
      { createdAt: { lt: parsedCursor.updatedAt } },
      { createdAt: parsedCursor.updatedAt, id: { lt: parsedCursor.id } },
    ];
  }

  const limitResult = parseLimitStrict(q.limit);
  if (limitResult.error) return invalidLimitReply(reply, limitResult.error);

  const events = await prisma.agentEvent.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limitResult.limit + 1,
  });

  const hasMore = events.length > limitResult.limit;
  const pageItems = hasMore ? events.slice(0, limitResult.limit) : events;
  const nextCursor = hasMore ? encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id) : null;
  return { data: pageItems, page: { nextCursor, hasMore } };
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
  await logAudit('agent.event.created', 'agent_event', event.id, session.projectId, { sessionId: id, type: event.type });
  return reply.status(201).send({ data: event });
});

app.get('/api/v1/audit', async (req, reply) => {
  const q = req.query as { since?: string; projectId?: string; limit?: string; cursor?: string };
  const where: Prisma.AuditEventWhereInput = {};

  const normalizedProjectId = normalizeProjectId(q.projectId);
  if (normalizedProjectId) where.projectId = normalizedProjectId;

  if (q.since) {
    const since = new Date(q.since);
    if (Number.isNaN(since.getTime())) {
      return reply.status(400).send(errorPayload(400, 'since must be a valid ISO timestamp', 'VALIDATION_ERROR'));
    }
    where.createdAt = { gte: since };
  }

  const parsedCursor = decodeCursor(q.cursor);
  if (q.cursor && !parsedCursor) {
    return reply.status(400).send(errorPayload(400, 'cursor is invalid', 'VALIDATION_ERROR'));
  }
  if (parsedCursor) {
    where.OR = [
      { createdAt: { lt: parsedCursor.updatedAt } },
      { createdAt: parsedCursor.updatedAt, id: { lt: parsedCursor.id } },
    ];
  }

  const limitResult = parseLimitStrict(q.limit);
  if (limitResult.error) return invalidLimitReply(reply, limitResult.error);

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limitResult.limit + 1,
  });

  const hasMore = events.length > limitResult.limit;
  const pageItems = hasMore ? events.slice(0, limitResult.limit) : events;
  const data = pageItems.map((event) => ({
    eventId: event.id,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    projectId: event.projectId,
    source: event.source,
    actor: event.actor,
    at: event.createdAt,
    diff: event.payload ? JSON.parse(event.payload) : null,
  }));
  const nextCursor = hasMore ? encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id) : null;

  return { data, page: { nextCursor, hasMore } };
});

app.get('/api/v1/digests/sprint/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) return reply.status(404).send({ error: 'sprint not found' });

  const stories = await prisma.story.findMany({ where: { sprintId: id }, orderBy: { updatedAt: 'desc' } });
  const counts = {
    waiting: stories.filter((s) => s.status === 'waiting').length,
    in_progress: stories.filter((s) => s.status === 'in_progress').length,
    completed: stories.filter((s) => s.status === 'completed').length,
    total: stories.length,
  };

  return {
    data: {
      sprint,
      counts,
      blocked: stories.filter((s) => s.blocked).map((s) => ({ id: s.id, title: s.title })),
      byAssignee: stories.reduce<Record<string, number>>((acc, s) => {
        const key = s.assignee?.trim() || 'Unassigned';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };
});

app.get('/api/v1/digests/project/:projectId/daily', async (req) => {
  const { projectId } = req.params as { projectId: string };
  const storyWhere = projectId === 'all' ? {} : { projectId };
  const windowStart = new Date(Date.now() - 1000 * 60 * 60 * 24);

  const [projectStories, recentEvents, recentAudit] = await Promise.all([
    prisma.story.findMany({ where: storyWhere, orderBy: { updatedAt: 'desc' } }),
    prisma.agentEvent.findMany({
      where: projectId === 'all' ? {} : { session: { projectId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.auditEvent.findMany({
      where: {
        ...(projectId === 'all' ? {} : { projectId }),
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  const counts = {
    waiting: projectStories.filter((s) => s.status === 'waiting').length,
    in_progress: projectStories.filter((s) => s.status === 'in_progress').length,
    completed: projectStories.filter((s) => s.status === 'completed').length,
  };

  const blocked = projectStories.filter((s) => s.blocked).map((s) => ({ id: s.id, title: s.title }));
  const recent = recentEvents.map((e) => e.message);

  const byAssignee = projectStories.reduce<Record<string, number>>((acc, story) => {
    const key = story.assignee?.trim() || 'Unassigned';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byPriority = projectStories.reduce<Record<string, number>>((acc, story) => {
    acc[story.priority] = (acc[story.priority] ?? 0) + 1;
    return acc;
  }, {});

  const recentMoves = recentAudit
    .filter((event) => event.eventType === 'story.moved')
    .slice(0, 10)
    .map((event) => ({ eventId: event.id, entityId: event.entityId, at: event.createdAt, diff: event.payload ? JSON.parse(event.payload) : null }));

  const newBlocked = recentAudit.filter((event) => {
    if (event.eventType !== 'story.updated' || !event.payload) return false;
    try {
      const payload = JSON.parse(event.payload) as { before?: { blocked?: boolean }; after?: { blocked?: boolean } };
      return payload.before?.blocked === false && payload.after?.blocked === true;
    } catch {
      return false;
    }
  }).length;

  const resolvedBlocked = recentAudit.filter((event) => {
    if (event.eventType !== 'story.updated' || !event.payload) return false;
    try {
      const payload = JSON.parse(event.payload) as { before?: { blocked?: boolean }; after?: { blocked?: boolean } };
      return payload.before?.blocked === true && payload.after?.blocked === false;
    } catch {
      return false;
    }
  }).length;

  return {
    data: {
      counts,
      blocked,
      byAssignee,
      byPriority,
      newBlocked,
      resolvedBlocked,
      recentMoves,
      recent_activity: recent,
      next_actions: blocked.length ? ['Unblock blocked stories'] : ['Move waiting stories into progress'],
    },
  };
});

app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

async function start() {
  await ensureDataLayout();
  await applySqlitePragmas();
  await bootstrapCoreProject();

  const port = Number(process.env.PORT || 4000);
  await app.listen({ port, host: '0.0.0.0' });
}

await start();

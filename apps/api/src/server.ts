import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const prisma = new PrismaClient();
const DEFAULT_PROJECT_ID = 'default';

type StoryStatus = 'waiting' | 'in_progress' | 'completed';

async function ensureDefaults() {
  await prisma.project.upsert({
    where: { id: DEFAULT_PROJECT_ID },
    update: {},
    create: { id: DEFAULT_PROJECT_ID, name: 'Bolt Default Project', description: 'Default project for local development' }
  });

  const session = await prisma.agentSession.findFirst({ where: { projectId: DEFAULT_PROJECT_ID } });
  if (!session) {
    await prisma.agentSession.create({
      data: {
        projectId: DEFAULT_PROJECT_ID,
        title: 'Build Bolt milestones',
        state: 'coding',
        lastHeartbeatAt: new Date(),
        events: { create: [{ type: 'status', message: 'Persistence mode active' }] }
      }
    });
  }
}

app.get('/health', async () => ({ ok: true }));

app.get('/api/v1/stories', async (req) => {
  const q = req.query as { status?: StoryStatus; limit?: string; fields?: string };
  const limit = Math.min(Number(q.limit ?? 50), 100);
  const data = await prisma.story.findMany({
    where: {
      projectId: DEFAULT_PROJECT_ID,
      ...(q.status ? { status: q.status } : {})
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      blocked: true,
      assignee: true,
      updatedAt: true
    }
  });
  return { data };
});

app.post('/api/v1/stories', async (req, reply) => {
  const body = req.body as any;
  if (!body?.title) return reply.status(400).send({ error: 'title is required' });

  const data = await prisma.story.create({
    data: {
      projectId: DEFAULT_PROJECT_ID,
      title: body.title,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      status: body.status ?? 'waiting',
      priority: body.priority ?? 'med',
      blocked: body.blocked ?? false,
      points: body.points,
      assignee: body.assignee,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
    }
  });

  await prisma.agentEvent.create({
    data: {
      sessionId: (await prisma.agentSession.findFirstOrThrow({ where: { projectId: DEFAULT_PROJECT_ID }, select: { id: true } })).id,
      type: 'action',
      message: `Story created: ${data.title}`
    }
  });

  return reply.status(201).send({ data });
});

app.patch('/api/v1/stories/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as any;

  try {
    const data = await prisma.story.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        priority: body.priority,
        assignee: body.assignee,
        blocked: body.blocked,
      }
    });
    return { data };
  } catch {
    return reply.status(404).send({ error: 'story not found' });
  }
});

app.post('/api/v1/stories/:id/move', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: StoryStatus };

  try {
    const data = await prisma.story.update({ where: { id }, data: { status } });
    const session = await prisma.agentSession.findFirst({ where: { projectId: DEFAULT_PROJECT_ID }, select: { id: true } });
    if (session) {
      await prisma.agentEvent.create({ data: { sessionId: session.id, type: 'status', message: `Story moved: ${data.title} -> ${status}` } });
    }
    return { data };
  } catch {
    return reply.status(404).send({ error: 'story not found' });
  }
});

app.get('/api/v1/stories/:id/notes', async (req) => {
  const { id } = req.params as { id: string };
  const data = await prisma.storyNote.findMany({ where: { storyId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return { data };
});

app.post('/api/v1/stories/:id/notes', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { body: string; author?: string };
  if (!body?.body?.trim()) return reply.status(400).send({ error: 'body is required' });

  const story = await prisma.story.findUnique({ where: { id }, select: { id: true } });
  if (!story) return reply.status(404).send({ error: 'story not found' });

  const data = await prisma.storyNote.create({
    data: { storyId: id, body: body.body, author: body.author ?? 'you', kind: 'note' }
  });
  return reply.status(201).send({ data });
});

app.get('/api/v1/stories/:id/dependencies', async (req) => {
  const { id } = req.params as { id: string };
  const data = await prisma.storyDependency.findMany({ where: { storyId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return { data };
});

app.post('/api/v1/stories/:id/dependencies', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { dependsOnStoryId: string };
  if (!body?.dependsOnStoryId) return reply.status(400).send({ error: 'dependsOnStoryId is required' });

  const [story, dependsOn] = await Promise.all([
    prisma.story.findUnique({ where: { id }, select: { id: true } }),
    prisma.story.findUnique({ where: { id: body.dependsOnStoryId }, select: { id: true } })
  ]);
  if (!story) return reply.status(404).send({ error: 'story not found' });
  if (!dependsOn) return reply.status(404).send({ error: 'dependsOn story not found' });

  const data = await prisma.storyDependency.upsert({
    where: { storyId_dependsOnStoryId: { storyId: id, dependsOnStoryId: body.dependsOnStoryId } },
    update: {},
    create: { storyId: id, dependsOnStoryId: body.dependsOnStoryId }
  });

  await prisma.story.update({ where: { id }, data: { blocked: true } });
  return reply.status(201).send({ data });
});

app.get('/api/v1/files', async (req) => {
  const q = req.query as { storyId?: string; limit?: string };
  const data = await prisma.fileAsset.findMany({
    where: { projectId: DEFAULT_PROJECT_ID, ...(q.storyId ? { storyId: q.storyId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(q.limit ?? 100), 200)
  });
  return { data };
});

app.post('/api/v1/files', async (req, reply) => {
  const body = req.body as any;
  if (!body?.filename) return reply.status(400).send({ error: 'filename is required' });

  const data = await prisma.fileAsset.create({
    data: {
      projectId: DEFAULT_PROJECT_ID,
      storyId: body.storyId,
      filename: body.filename,
      contentType: body.contentType ?? 'application/octet-stream',
      byteSize: body.byteSize ?? 0,
      storageKey: body.storageKey ?? `uploads/${Date.now()}-${body.filename}`,
      uploadedBy: body.uploadedBy ?? 'you'
    }
  });

  const session = await prisma.agentSession.findFirst({ where: { projectId: DEFAULT_PROJECT_ID }, select: { id: true } });
  if (session) {
    await prisma.agentEvent.create({ data: { sessionId: session.id, type: 'artifact', message: `Context file added: ${data.filename}` } });
  }

  return reply.status(201).send({ data });
});

app.get('/api/v1/agent/sessions', async () => {
  const data = await prisma.agentSession.findMany({ where: { projectId: DEFAULT_PROJECT_ID }, orderBy: { createdAt: 'desc' }, take: 10 });
  return { data };
});

app.get('/api/v1/agent/sessions/:id/events', async (req) => {
  const { id } = req.params as { id: string };
  const data = await prisma.agentEvent.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return { data };
});

app.post('/api/v1/agent/sessions/:id/events', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { type?: string; message: string };
  if (!body?.message) return reply.status(400).send({ error: 'message is required' });

  const session = await prisma.agentSession.findUnique({ where: { id }, select: { id: true } });
  if (!session) return reply.status(404).send({ error: 'session not found' });

  const data = await prisma.agentEvent.create({ data: { sessionId: id, type: body.type ?? 'action', message: body.message } });
  await prisma.agentSession.update({ where: { id }, data: { lastHeartbeatAt: new Date() } });
  return reply.status(201).send({ data });
});

app.get('/api/v1/digests/project/default/daily', async () => {
  const [waiting, inProgress, completed, blocked, recentEvents] = await Promise.all([
    prisma.story.count({ where: { projectId: DEFAULT_PROJECT_ID, status: 'waiting' } }),
    prisma.story.count({ where: { projectId: DEFAULT_PROJECT_ID, status: 'in_progress' } }),
    prisma.story.count({ where: { projectId: DEFAULT_PROJECT_ID, status: 'completed' } }),
    prisma.story.findMany({ where: { projectId: DEFAULT_PROJECT_ID, blocked: true }, select: { id: true, title: true }, take: 20 }),
    prisma.agentEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { message: true } })
  ]);

  return {
    data: {
      counts: { waiting, in_progress: inProgress, completed },
      blocked,
      recent_activity: recentEvents.map((e) => e.message),
      next_actions: blocked.length ? ['Unblock blocked stories'] : ['Move waiting stories into progress']
    }
  };
});

const port = Number(process.env.PORT || 4000);

await ensureDefaults();

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

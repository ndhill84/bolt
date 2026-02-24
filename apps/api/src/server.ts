import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

type StoryStatus = 'waiting' | 'in_progress' | 'completed';
type Priority = 'low' | 'med' | 'high' | 'urgent';

interface Story {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  status: StoryStatus;
  priority: Priority;
  blocked: boolean;
  points?: number;
  assignee?: string;
  dueAt?: string;
  updatedAt: string;
}

interface Note {
  id: string;
  storyId: string;
  author: string;
  body: string;
  createdAt: string;
}

interface Dependency {
  id: string;
  storyId: string;
  dependsOnStoryId: string;
}

const stories: Story[] = [
  {
    id: 's1',
    title: 'Setup Bolt foundation',
    description: 'Monorepo + initial docs + basic app shells',
    status: 'in_progress',
    priority: 'high',
    blocked: false,
    assignee: 'Claudio',
    updatedAt: new Date().toISOString()
  }
];

const notes: Note[] = [];
const dependencies: Dependency[] = [];

app.get('/health', async () => ({ ok: true }));

app.get('/api/v1/stories', async (req) => {
  const q = req.query as { status?: StoryStatus };
  const data = q.status ? stories.filter((s) => s.status === q.status) : stories;
  return { data };
});

app.post('/api/v1/stories', async (req, reply) => {
  const body = req.body as Partial<Story> & { title: string };
  if (!body.title) return reply.status(400).send({ error: 'title is required' });

  const story: Story = {
    id: randomUUID(),
    title: body.title,
    description: body.description,
    acceptanceCriteria: body.acceptanceCriteria,
    status: body.status ?? 'waiting',
    priority: body.priority ?? 'med',
    blocked: body.blocked ?? false,
    points: body.points,
    assignee: body.assignee,
    dueAt: body.dueAt,
    updatedAt: new Date().toISOString()
  };

  stories.unshift(story);
  return reply.status(201).send({ data: story });
});

app.patch('/api/v1/stories/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as Partial<Story>;
  const story = stories.find((s) => s.id === id);
  if (!story) return reply.status(404).send({ error: 'story not found' });

  Object.assign(story, body, { updatedAt: new Date().toISOString() });
  return { data: story };
});

app.post('/api/v1/stories/:id/move', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: StoryStatus };
  const story = stories.find((s) => s.id === id);
  if (!story) return reply.status(404).send({ error: 'story not found' });
  story.status = status;
  story.updatedAt = new Date().toISOString();
  return { data: story };
});

app.get('/api/v1/stories/:id/notes', async (req) => {
  const { id } = req.params as { id: string };
  return { data: notes.filter((n) => n.storyId === id) };
});

app.post('/api/v1/stories/:id/notes', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { body: string; author?: string };
  const story = stories.find((s) => s.id === id);
  if (!story) return reply.status(404).send({ error: 'story not found' });
  if (!body?.body?.trim()) return reply.status(400).send({ error: 'body is required' });

  const note: Note = {
    id: randomUUID(),
    storyId: id,
    author: body.author ?? 'Nick',
    body: body.body,
    createdAt: new Date().toISOString()
  };

  notes.unshift(note);
  return reply.status(201).send({ data: note });
});

app.get('/api/v1/stories/:id/dependencies', async (req) => {
  const { id } = req.params as { id: string };
  return { data: dependencies.filter((d) => d.storyId === id) };
});

app.post('/api/v1/stories/:id/dependencies', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { dependsOnStoryId: string };
  const story = stories.find((s) => s.id === id);
  if (!story) return reply.status(404).send({ error: 'story not found' });
  if (!body?.dependsOnStoryId) return reply.status(400).send({ error: 'dependsOnStoryId is required' });

  const dependency: Dependency = {
    id: randomUUID(),
    storyId: id,
    dependsOnStoryId: body.dependsOnStoryId
  };

  dependencies.push(dependency);
  story.blocked = true;
  story.updatedAt = new Date().toISOString();
  return reply.status(201).send({ data: dependency });
});

app.get('/api/v1/agent/sessions', async () => {
  return {
    data: [
      {
        id: 'agent-main',
        title: 'Build core board workflow',
        state: 'coding',
        startedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
        lastHeartbeatAt: new Date().toISOString()
      }
    ]
  };
});

const port = Number(process.env.PORT || 4000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

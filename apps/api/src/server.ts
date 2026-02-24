import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

type StoryStatus = 'waiting' | 'in_progress' | 'completed';
type Priority = 'low' | 'med' | 'high' | 'urgent';

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface Story {
  id: string;
  projectId: string;
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

interface FileAsset {
  id: string;
  projectId: string;
  storyId?: string;
  filename: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
  uploadedBy: string;
  createdAt: string;
}

interface AgentSession {
  id: string;
  projectId: string;
  title: string;
  state: 'planning' | 'coding' | 'testing' | 'blocked' | 'done';
  startedAt: string;
  lastHeartbeatAt: string;
}

interface AgentEvent {
  id: string;
  sessionId: string;
  type: 'status' | 'action' | 'artifact' | 'blocker' | 'summary';
  message: string;
  createdAt: string;
}

const projects: Project[] = [
  { id: 'core', name: 'Core / Other' },
  { id: 'demo-calc', name: 'Demo: Scientific Calculator' },
  { id: 'demo-weather', name: 'Demo: CLI Weather App' }
];

const stories: Story[] = [
  {
    id: 's1',
    projectId: 'core',
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
const files: FileAsset[] = [];
const agentSessions: AgentSession[] = [
  {
    id: 'agent-main',
    projectId: 'core',
    title: 'Build Bolt milestones',
    state: 'coding',
    startedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    lastHeartbeatAt: new Date().toISOString()
  }
];
const agentEvents: AgentEvent[] = [
  {
    id: randomUUID(),
    sessionId: 'agent-main',
    type: 'status',
    message: 'Milestone started: file context + agent dashboard',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
  }
];

app.get('/health', async () => ({ ok: true }));

app.get('/api/v1/projects', async () => ({ data: projects }));

app.post('/api/v1/projects', async (req, reply) => {
  const body = req.body as Partial<Project> & { name: string };
  if (!body?.name?.trim()) return reply.status(400).send({ error: 'name is required' });
  const project: Project = { id: randomUUID(), name: body.name.trim(), description: body.description };
  projects.push(project);
  return reply.status(201).send({ data: project });
});

app.patch('/api/v1/projects/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as Partial<Project>;
  const project = projects.find((p) => p.id === id);
  if (!project) return reply.status(404).send({ error: 'project not found' });

  if (body.name?.trim()) project.name = body.name.trim();
  project.description = body.description;
  return { data: project };
});

app.get('/api/v1/stories', async (req) => {
  const q = req.query as { status?: StoryStatus; projectId?: string };
  let data = stories;
  if (q.projectId && q.projectId !== 'all') data = data.filter((s) => s.projectId === q.projectId);
  if (q.status) data = data.filter((s) => s.status === q.status);
  return { data };
});

app.post('/api/v1/stories', async (req, reply) => {
  const body = req.body as Partial<Story> & { title: string };
  if (!body.title) return reply.status(400).send({ error: 'title is required' });

  const story: Story = {
    id: randomUUID(),
    projectId: body.projectId ?? 'core',
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
  agentEvents.unshift({ id: randomUUID(), sessionId: 'agent-main', type: 'action', message: `Story created: ${story.title}`, createdAt: new Date().toISOString() });
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
  agentEvents.unshift({ id: randomUUID(), sessionId: 'agent-main', type: 'status', message: `Story moved: ${story.title} -> ${status}`, createdAt: new Date().toISOString() });
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
    author: body.author ?? 'you',
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

app.get('/api/v1/files', async (req) => {
  const q = req.query as { storyId?: string; projectId?: string };
  let data = files;
  if (q.projectId && q.projectId !== 'all') data = data.filter((f) => f.projectId === q.projectId);
  if (q.storyId) data = data.filter((f) => f.storyId === q.storyId);
  return { data };
});

app.post('/api/v1/files', async (req, reply) => {
  const body = req.body as Partial<FileAsset> & { filename: string; projectId?: string };
  if (!body.filename) return reply.status(400).send({ error: 'filename is required' });

  const file: FileAsset = {
    id: randomUUID(),
    projectId: body.projectId ?? 'core',
    storyId: body.storyId,
    filename: body.filename,
    contentType: body.contentType ?? 'application/octet-stream',
    byteSize: body.byteSize ?? 0,
    storageKey: body.storageKey ?? `uploads/${Date.now()}-${body.filename}`,
    uploadedBy: body.uploadedBy ?? 'you',
    createdAt: new Date().toISOString()
  };

  files.unshift(file);
  agentEvents.unshift({ id: randomUUID(), sessionId: 'agent-main', type: 'artifact', message: `Context file added: ${file.filename}`, createdAt: new Date().toISOString() });
  return reply.status(201).send({ data: file });
});

app.get('/api/v1/agent/sessions', async (req) => {
  const q = req.query as { projectId?: string };
  const data = q.projectId && q.projectId !== 'all'
    ? agentSessions.filter((s) => s.projectId === q.projectId)
    : agentSessions;
  return { data };
});

app.get('/api/v1/agent/sessions/:id/events', async (req) => {
  const { id } = req.params as { id: string };
  return { data: agentEvents.filter((e) => e.sessionId === id) };
});

app.post('/api/v1/agent/sessions/:id/events', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { type: AgentEvent['type']; message: string };
  const session = agentSessions.find((s) => s.id === id);
  if (!session) return reply.status(404).send({ error: 'session not found' });
  if (!body?.message) return reply.status(400).send({ error: 'message is required' });

  const evt: AgentEvent = {
    id: randomUUID(),
    sessionId: id,
    type: body.type ?? 'action',
    message: body.message,
    createdAt: new Date().toISOString()
  };
  session.lastHeartbeatAt = new Date().toISOString();
  agentEvents.unshift(evt);
  return reply.status(201).send({ data: evt });
});

app.get('/api/v1/digests/project/:projectId/daily', async (req) => {
  const { projectId } = req.params as { projectId: string };
  const projectStories = projectId === 'all' ? stories : stories.filter((s) => s.projectId === projectId);
  const counts = {
    waiting: projectStories.filter((s) => s.status === 'waiting').length,
    in_progress: projectStories.filter((s) => s.status === 'in_progress').length,
    completed: projectStories.filter((s) => s.status === 'completed').length,
  };

  const blocked = projectStories.filter((s) => s.blocked).map((s) => ({ id: s.id, title: s.title }));
  const recent = agentEvents.slice(0, 5).map((e) => e.message);

  return {
    data: {
      counts,
      blocked,
      recent_activity: recent,
      next_actions: blocked.length ? ['Unblock blocked stories'] : ['Move waiting stories into progress']
    }
  };
});

const port = Number(process.env.PORT || 4000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

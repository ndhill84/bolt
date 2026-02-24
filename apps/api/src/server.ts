import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true }));

app.get('/api/v1/stories', async () => {
  return {
    data: [
      { id: 's1', title: 'Setup Bolt foundation', status: 'in_progress', priority: 'high', blocked: false, updatedAt: new Date().toISOString() }
    ]
  };
});

const port = Number(process.env.PORT || 4000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

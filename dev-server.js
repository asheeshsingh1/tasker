// Simple local dev server that mimics Vercel's serverless functions
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Dynamically import and run API handlers
async function loadHandler(path) {
  const module = await import(join(__dirname, path));
  return module.default;
}

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const handler = await loadHandler('./api/auth/register.ts');
  return handler(req, res);
});

app.post('/api/auth/login', async (req, res) => {
  const handler = await loadHandler('./api/auth/login.ts');
  return handler(req, res);
});

app.get('/api/auth/me', async (req, res) => {
  const handler = await loadHandler('./api/auth/me.ts');
  return handler(req, res);
});

// Todos routes
app.get('/api/todos', async (req, res) => {
  const handler = await loadHandler('./api/todos/index.ts');
  return handler(req, res);
});

app.post('/api/todos', async (req, res) => {
  const handler = await loadHandler('./api/todos/index.ts');
  return handler(req, res);
});

app.delete('/api/todos', async (req, res) => {
  const handler = await loadHandler('./api/todos/index.ts');
  return handler(req, res);
});

app.patch('/api/todos/:id', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/todos/[id].ts');
  return handler(req, res);
});

app.delete('/api/todos/:id', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/todos/[id].ts');
  return handler(req, res);
});

// Pause/Resume routes
app.post('/api/todos/:id/pause', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/todos/[id]/pause.ts');
  return handler(req, res);
});

app.post('/api/todos/:id/resume', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/todos/[id]/resume.ts');
  return handler(req, res);
});

// Recurring tasks routes
app.get('/api/recurring', async (req, res) => {
  const handler = await loadHandler('./api/recurring/index.ts');
  return handler(req, res);
});

app.post('/api/recurring', async (req, res) => {
  const handler = await loadHandler('./api/recurring/index.ts');
  return handler(req, res);
});

app.patch('/api/recurring/:id', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/recurring/[id].ts');
  return handler(req, res);
});

app.delete('/api/recurring/:id', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/recurring/[id].ts');
  return handler(req, res);
});

app.post('/api/recurring/generate', async (req, res) => {
  const handler = await loadHandler('./api/recurring/generate.ts');
  return handler(req, res);
});

app.post('/api/recurring/:id/complete', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/recurring/[id]/complete.ts');
  return handler(req, res);
});

app.post('/api/recurring/:id/uncomplete', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/recurring/[id]/uncomplete.ts');
  return handler(req, res);
});

app.post('/api/recurring/:id/start', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/recurring/[id]/start.ts');
  return handler(req, res);
});

app.post('/api/recurring/:id/pause', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/recurring/[id]/pause.ts');
  return handler(req, res);
});

app.post('/api/recurring/:id/resume', async (req, res) => {
  req.query = { id: req.params.id };
  const handler = await loadHandler('./api/recurring/[id]/resume.ts');
  return handler(req, res);
});

const PORT = 3001;
const HOST = '0.0.0.0'; // Listen on all network interfaces
app.listen(PORT, HOST, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📱 Access from phone: http://192.168.1.2:${PORT}`);
});


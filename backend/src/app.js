import express from 'express';
import healthRouter from './routes/health.js';
import authRoutes from './routes/auth.js';
import assessmentRoutes from './routes/assessments.js';
import targetRoutes from './routes/targets.js';
import scanRoutes from './routes/scans.js';
import findingRoutes from './routes/findings.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRouter);

app.use('/api/auth', authRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/findings', findingRoutes);

// 404 fallback (must stay after all routes)
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (malformed JSON, unexpected errors)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error('[error]', err.message);
  return res.status(500).json({ error: 'Internal server error' });
});

export default app;

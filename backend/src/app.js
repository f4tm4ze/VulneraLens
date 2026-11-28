import express from 'express';
import healthRouter from './routes/health.js';
import authRoutes from './routes/auth.js';
import assessmentRoutes from './routes/assessments.js';
import targetRoutes from './routes/targets.js';
import scanRoutes from './routes/scans.js';
import findingRoutes from './routes/findings.js';
import adminRoutes from './routes/admin.js';
import zapHistoryRoutes from './routes/zapHistory.js';
import { authenticate, authorize } from './middleware/auth.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRouter);

app.use('/api/auth', authRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/findings', findingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/zap-history', zapHistoryRoutes);

app.get('/api/reports', authenticate, authorize('administrator', 'assessor'), async (req, res) => {
  try {
    const pool = (await import('./config/db.js')).default;
    const [rows] = await pool.execute(
      `SELECT 
        a.id AS assessment_id, 
        a.name AS assessment_name, 
        a.created_at, 
        a.status, 
        COUNT(DISTINCT s.id) AS scan_count, 
        COUNT(DISTINCT f.id) AS finding_count, 
        COALESCE(SUM(CASE WHEN f.status='confirmed' THEN 1 ELSE 0 END),0) AS confirmed_count 
      FROM assessments a 
      LEFT JOIN scans s ON s.assessment_id=a.id AND s.archived_at IS NULL 
      LEFT JOIN findings f ON f.scan_id=s.id AND f.archived_at IS NULL 
      WHERE a.archived_at IS NULL 
      GROUP BY a.id 
      ORDER BY a.created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('[reports]', err.message);
    return res.status(500).json({ error: 'Failed to list reports' });
  }
});

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
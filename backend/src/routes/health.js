import { Router } from 'express';
import { checkDatabase } from '../config/db.js';

const router = Router();

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('Database check timed out');
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// GET /api/health - is the API process running?
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'vulneralens-backend',
    time: new Date().toISOString(),
  });
});

// GET /api/health/db - can the API reach MySQL?
router.get('/db', async (_req, res) => {
  try {
    const info = await withTimeout(checkDatabase(), 4000);
    res.json({ status: 'ok', database: info.db, mysqlVersion: info.version });
  } catch (err) {
    // Log details on the server only; send a safe message to the client.
    console.error('[db] connection failed:', err.code || err.message);
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      code: err.code || 'UNKNOWN',
    });
  }
});

export default router;
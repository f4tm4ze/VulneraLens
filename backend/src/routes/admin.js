import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, authorize('administrator'));

router.get('/users', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

router.get('/audit-log', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM (
        SELECT ar.id, 'Human verification' AS event_type, ar.finding_id,
               f.title AS finding_title, u.name AS actor_name,
               ar.remarks AS details, ar.reviewed_at AS event_at
        FROM assessor_reviews ar
        JOIN findings f ON f.id = ar.finding_id
        JOIN users u ON u.id = ar.assessor_id
        UNION ALL
        SELECT al.id, 'AI analysis' AS event_type, al.finding_id,
               f.title AS finding_title, u.name AS actor_name,
               CONCAT('Model: ', al.model) AS details, al.created_at AS event_at
        FROM ai_logs al
        JOIN findings f ON f.id = al.finding_id
        LEFT JOIN users u ON u.id = al.user_id
      ) events ORDER BY event_at DESC LIMIT 250`
    );
    return res.json(rows);
  } catch (err) {
    console.error('[audit-log]', err.message);
    return res.status(500).json({ error: 'Failed to load audit log' });
  }
});

export default router;

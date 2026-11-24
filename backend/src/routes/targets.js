import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { isPositiveInt, isValidTargetUrl } from '../utils/validators.js';

const router = Router();
const VALID_TYPES = ['web_app', 'api', 'network', 'host'];

router.use(authenticate);

// Register a target under an assessment
router.post('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { assessment_id, target_url, target_type, authorized } = req.body ?? {};
  const assessmentId = Number(assessment_id);

  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Valid assessment_id is required' });
  }
  if (!isValidTargetUrl(target_url)) {return res.status(400).json({ error: 'Target is outside the allowed scope. Only localhost / 127.0.0.1 are permitted.',  });
  }
  const type = target_type ?? 'web_app';
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid target_type' });
  }
  if (authorized !== true) {
    return res.status(403).json({
      error: 'Target must be explicitly marked as authorized (authorized: true)',
    });
  }

  try {
    const [assessment] = await pool.execute('SELECT id FROM assessments WHERE id = ?', [
      assessmentId,
    ]);
    if (assessment.length === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const [result] = await pool.execute(
      'INSERT INTO targets (assessment_id, target_url, target_type, authorized) VALUES (?, ?, ?, ?)',
      [assessmentId, target_url.trim(), type, true]
    );

    const [rows] = await pool.execute('SELECT * FROM targets WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to register target' });
  }
});

// List targets (optionally filtered by assessment_id)
router.get('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { assessment_id } = req.query;

  try {
    if (assessment_id !== undefined) {
      const id = Number(assessment_id);
      if (!isPositiveInt(id)) {
        return res.status(400).json({ error: 'Invalid assessment_id' });
      }
      const [rows] = await pool.execute(
        'SELECT * FROM targets WHERE assessment_id = ? ORDER BY created_at DESC',
        [id]
      );
      return res.json(rows);
    }

    const [rows] = await pool.execute('SELECT * FROM targets ORDER BY created_at DESC');
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to list targets' });
  }
});

export default router;

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { isPositiveInt } from '../utils/validators.js';

const router = Router();
const VALID_STATUSES = ['draft', 'in_progress', 'completed', 'archived'];

router.use(authenticate);

function validName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 150;
}
function validDescription(d) {
  return d === null || d === undefined || (typeof d === 'string' && d.length <= 10000);
}

// Create assessment
router.post('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { name, description, status } = req.body ?? {};

  if (!validName(name)) {
    return res.status(400).json({ error: 'Assessment name must be 2-150 characters' });
  }
  if (!validDescription(description)) {
    return res.status(400).json({ error: 'Invalid description' });
  }
  const assessmentStatus = status ?? 'draft';
  if (!VALID_STATUSES.includes(assessmentStatus)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO assessments (name, description, status, created_by) VALUES (?, ?, ?, ?)',
      [name.trim(), description || null, assessmentStatus, req.user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM assessments WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to create assessment' });
  }
});

// List assessments
router.get('/', authorize('administrator', 'assessor'), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, u.name AS created_by_name
       FROM assessments a
       JOIN users u ON a.created_by = u.id
       ORDER BY a.created_at DESC`
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to list assessments' });
  }
});

// Update assessment
router.put('/:id', authorize('administrator', 'assessor'), async (req, res) => {
  const assessmentId = Number(req.params.id);
  const { name, description, status } = req.body ?? {};

  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }
  if (name !== undefined && !validName(name)) {
    return res.status(400).json({ error: 'Assessment name must be 2-150 characters' });
  }
  if (!validDescription(description)) {
    return res.status(400).json({ error: 'Invalid description' });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const [existing] = await pool.execute('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const updatedName = name !== undefined ? name.trim() : existing[0].name;
    const updatedDescription = description !== undefined ? description : existing[0].description;
    const updatedStatus = status ?? existing[0].status;

    await pool.execute(
      'UPDATE assessments SET name = ?, description = ?, status = ? WHERE id = ?',
      [updatedName, updatedDescription, updatedStatus, assessmentId]
    );

    const [rows] = await pool.execute('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
    return res.json(rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to update assessment' });
  }
});

// Delete assessment (administrator only)
router.delete('/:id', authorize('administrator'), async (req, res) => {
  const assessmentId = Number(req.params.id);
  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM assessments WHERE id = ?', [assessmentId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    return res.json({ message: 'Assessment deleted' });
  } catch {
    return res.status(500).json({ error: 'Failed to delete assessment' });
  }
});

export default router;

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { isPositiveInt } from '../utils/validators.js';

const router = Router();
const VALID_DECISIONS = ['confirmed', 'false_positive', 'needs_retest', 'mitigated'];
const VALID_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const VALID_STATUSES = ['open', 'confirmed', 'false_positive', 'mitigated'];

router.use(authenticate);

// List findings (optional filters: scan_id, severity, status)
router.get('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { scan_id, assessment_id, severity, status } = req.query;
  const conditions = [];
  const params = [];

  if (scan_id !== undefined) {
    const id = Number(scan_id);
    if (!isPositiveInt(id)) {
      return res.status(400).json({ error: 'Invalid scan_id' });
    }
    conditions.push('f.scan_id = ?');
    params.push(id);
  }
  if (assessment_id !== undefined) {
    const id = Number(assessment_id);
    if (!isPositiveInt(id)) {
      return res.status(400).json({ error: 'Invalid assessment_id' });
    }
    conditions.push('s.assessment_id = ?');
    params.push(id);
  }
  if (severity !== undefined) {
    if (!VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: 'Invalid severity' });
    }
    conditions.push('f.severity = ?');
    params.push(severity);
  }
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    conditions.push('f.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.execute(
      `SELECT f.*,
              (SELECT COUNT(*) FROM assessor_reviews ar WHERE ar.finding_id = f.id) AS review_count
       FROM findings f
       JOIN scans s ON f.scan_id = s.id
       ${whereClause}
       ORDER BY f.created_at DESC`,
      params
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to list findings' });
  }
});

// Create a finding manually (assessor records an observation against a scan)
router.post('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { scan_id, title, description, severity, affected_url, evidence, remediation } =
    req.body ?? {};
  const scanId = Number(scan_id);

  if (!isPositiveInt(scanId)) {
    return res.status(400).json({ error: 'Valid scan_id is required' });
  }
  if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200) {
    return res.status(400).json({ error: 'Title must be 2-200 characters' });
  }
  const sev = severity ?? 'info';
  if (!VALID_SEVERITIES.includes(sev)) {
    return res.status(400).json({ error: 'Invalid severity' });
  }
  for (const [k, v, max] of [
    ['description', description, 10000],
    ['evidence', evidence, 10000],
    ['remediation', remediation, 10000],
    ['affected_url', affected_url, 500],
  ]) {
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > max)) {
      return res.status(400).json({ error: `Invalid ${k}` });
    }
  }

  try {
    const [scan] = await pool.execute('SELECT id FROM scans WHERE id = ?', [scanId]);
    if (scan.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    const [result] = await pool.execute(
      `INSERT INTO findings (scan_id, title, description, severity, affected_url, evidence, remediation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        scanId,
        title.trim(),
        description || null,
        sev,
        affected_url || null,
        evidence || null,
        remediation || null,
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM findings WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to create finding' });
  }
});

// Submit a human review for a finding
router.post('/:id/reviews', authorize('administrator', 'assessor'), async (req, res) => {
  const findingId = Number(req.params.id);
  const { decision, remarks } = req.body ?? {};

  if (!isPositiveInt(findingId)) {
    return res.status(400).json({ error: 'Invalid finding ID' });
  }
  if (!VALID_DECISIONS.includes(decision)) {
    return res.status(400).json({
      error: `Decision must be one of: ${VALID_DECISIONS.join(', ')}`,
    });
  }
  if (remarks !== undefined && remarks !== null && (typeof remarks !== 'string' || remarks.length > 10000)) {
    return res.status(400).json({ error: 'Invalid remarks' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [findings] = await connection.execute('SELECT id FROM findings WHERE id = ? FOR UPDATE', [
      findingId,
    ]);
    if (findings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Finding not found' });
    }

    const [reviewResult] = await connection.execute(
      'INSERT INTO assessor_reviews (finding_id, assessor_id, decision, remarks) VALUES (?, ?, ?, ?)',
      [findingId, req.user.id, decision, remarks || null]
    );

    // Sync finding status when the decision maps directly to a finding status
    if (['confirmed', 'false_positive', 'mitigated'].includes(decision)) {
      await connection.execute('UPDATE findings SET status = ? WHERE id = ?', [
        decision,
        findingId,
      ]);
    }

    await connection.commit();

    const [rows] = await pool.execute('SELECT * FROM assessor_reviews WHERE id = ?', [
      reviewResult.insertId,
    ]);
    return res.status(201).json(rows[0]);
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ error: 'Failed to submit review' });
  } finally {
    if (connection) connection.release();
  }
});

// List reviews for a finding
router.get('/:id/reviews', authorize('administrator', 'assessor'), async (req, res) => {
  const findingId = Number(req.params.id);
  if (!isPositiveInt(findingId)) {
    return res.status(400).json({ error: 'Invalid finding ID' });
  }

  try {
    const [found] = await pool.execute('SELECT id FROM findings WHERE id = ?', [findingId]);
    if (found.length === 0) {
      return res.status(404).json({ error: 'Finding not found' });
    }

    const [rows] = await pool.execute(
      `SELECT ar.*, u.name AS assessor_name, u.email AS assessor_email
       FROM assessor_reviews ar
       JOIN users u ON ar.assessor_id = u.id
       WHERE ar.finding_id = ?
       ORDER BY ar.reviewed_at DESC`,
      [findingId]
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to list reviews' });
  }
});

export default router;

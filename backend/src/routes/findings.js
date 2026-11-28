
import { Router } from 'express';
import pool from '../config/db.js';
import { authorize } from '../middleware/auth.js';
import { isPositiveInt } from '../utils/validators.js';

const router = Router();

const VALID_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];

// ============================================================
// LIST FINDINGS
// GET /api/findings
// archived=1 returns archived findings
// ============================================================
router.get('/', authorize('administrator', 'assessor'), async (req, res) => {
  const archived = req.query.archived === '1';

  try {
    const [rows] = await pool.execute(
      `SELECT
          f.*,
          s.assessment_id,
          s.target_id,
          s.scanner_type,
          t.target_url,
          a.name AS assessment_name
       FROM findings f
       LEFT JOIN scans s ON f.scan_id = s.id
       LEFT JOIN targets t ON s.target_id = t.id
       LEFT JOIN assessments a ON s.assessment_id = a.id
       WHERE ${
         archived
           ? 'f.archived_at IS NOT NULL'
           : 'f.archived_at IS NULL'
       }
       ORDER BY f.created_at DESC`
    );

    return res.json(rows);
  } catch (err) {
    console.error('[list findings]', err.message);
    return res.status(500).json({ error: 'Failed to list findings' });
  }
});

// ============================================================
// CREATE FINDING MANUALLY
// POST /api/findings
// ============================================================
router.post('/', authorize('administrator', 'assessor'), async (req, res) => {
  const {
    scan_id,
    title,
    description,
    severity,
    affected_url,
    evidence,
    remediation,
    http_method,
    affected_parameter,
    payload,
    request_evidence,
    response_evidence,
    references_text,
  } = req.body ?? {};

  const scanId = Number(scan_id);

  if (!isPositiveInt(scanId)) {
    return res.status(400).json({ error: 'Valid scan_id is required' });
  }

  if (
    typeof title !== 'string' ||
    title.trim().length < 2 ||
    title.trim().length > 200
  ) {
    return res.status(400).json({ error: 'Title must be 2-200 characters' });
  }

  const sev = severity ?? 'info';

  if (!VALID_SEVERITIES.includes(sev)) {
    return res.status(400).json({ error: 'Invalid severity' });
  }

  for (const [key, value, max] of [
    ['description', description, 10000],
    ['evidence', evidence, 10000],
    ['remediation', remediation, 10000],
    ['affected_url', affected_url, 500],
    ['http_method', http_method, 20],
    ['affected_parameter', affected_parameter, 255],
    ['payload', payload, 10000],
    ['request_evidence', request_evidence, 10000],
    ['response_evidence', response_evidence, 10000],
    ['references_text', references_text, 10000],
  ]) {
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== 'string' || value.length > max)
    ) {
      return res.status(400).json({ error: `Invalid ${key}` });
    }
  }

  try {
    const [scan] = await pool.execute(
      'SELECT id FROM scans WHERE id = ?',
      [scanId]
    );

    if (scan.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    const [result] = await pool.execute(
      `INSERT INTO findings (
        scan_id,
        title,
        description,
        severity,
        affected_url,
        evidence,
        remediation,
        source_tool,
        http_method,
        affected_parameter,
        payload,
        request_evidence,
        response_evidence,
        references_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Manual review', ?, ?, ?, ?, ?, ?)`,
      [
        scanId,
        title.trim(),
        description || null,
        sev,
        affected_url || null,
        evidence || null,
        remediation || null,
        http_method || null,
        affected_parameter || null,
        payload || null,
        request_evidence || null,
        response_evidence || null,
        references_text || null,
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM findings WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[create finding]', err.message);
    return res.status(500).json({ error: 'Failed to create finding' });
  }
});

export default router;

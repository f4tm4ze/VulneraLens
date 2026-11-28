
import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { isPositiveInt, checkTargetScope } from '../utils/validators.js';
import { runNmapDnsScan } from '../services/nmapDns.js';
import { runZapScan } from '../services/zap.js';
import { runNiktoScan } from '../services/nikto.js';

const router = Router();

router.use(authenticate);

// Execute a scan against a target assigned to this assessment.
router.post('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { assessment_id, target_id, scanner_type } = req.body ?? {};
  const assessmentId = Number(assessment_id);
  const targetId = Number(target_id);

  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Valid assessment_id is required' });
  }

  if (!isPositiveInt(targetId)) {
    return res.status(400).json({ error: 'Valid target_id is required' });
  }

  if (
    typeof scanner_type !== 'string' ||
    scanner_type.trim().length < 2 ||
    scanner_type.length > 100
  ) {
    return res.status(400).json({ error: 'scanner_type must be 2-100 characters' });
  }

  const normalizedType = scanner_type.trim().toLowerCase();
  const supportedTypes = ['nmap_dns', 'nmap', 'zap', 'owasp_zap', 'nikto'];
  if (!supportedTypes.includes(normalizedType)) return res.status(400).json({ error: 'Supported scanners: Nmap + DNS, OWASP ZAP, Nikto' });

  try {
    const [targets] = await pool.execute(
      `SELECT t.id, t.target_url, t.authorized, a.archived_at AS assessment_archived_at
       FROM targets t
       INNER JOIN assessment_targets at
         ON at.target_id = t.id
       JOIN assessments a ON a.id = at.assessment_id
       WHERE t.id = ? AND at.assessment_id = ?`,
      [targetId, assessmentId]
    );

    if (targets.length === 0) {
      return res.status(404).json({
        error: 'Target not found or not assigned to this assessment',
      });
    }

    const target = targets[0];
    if (target.assessment_archived_at) return res.status(403).json({ error: 'Archived assessments cannot start scans. Restore the assessment first.' });

    if (!target.authorized) {
      return res.status(403).json({ error: 'Target is not authorized for scanning' });
    }

    const scope = checkTargetScope(target.target_url);

    if (!scope.ok) {
      return res.status(403).json({ error: `Scope check failed: ${scope.error}` });
    }

    const [result] = await pool.execute(
      'INSERT INTO scans (assessment_id, target_id, scanner_type) VALUES (?, ?, ?)',
      [assessmentId, targetId, normalizedType]
    );

    const scanId = result.insertId;

    const [rows] = await pool.execute(
      'SELECT * FROM scans WHERE id = ?',
      [scanId]
    );

    if (normalizedType === 'nmap_dns' || normalizedType === 'nmap') {
      runNmapDnsScan(scanId, target.target_url).catch((err) => {
        console.error(`[scan ${scanId}] nmap_dns failed:`, err.message);
      });
    } else if (normalizedType === 'zap' || normalizedType === 'owasp_zap') {
      runZapScan(scanId, target.target_url).catch((err) => {
        console.error(`[scan ${scanId}] zap failed:`, err.message);
      });
    } else if (normalizedType === 'nikto') {
      runNiktoScan(scanId, target.target_url).catch((err) => {
        console.error(`[scan ${scanId}] nikto failed:`, err.message);
      });
    } else {
      await pool.execute("UPDATE scans SET status='failed', error_message='Unsupported scanner type', completed_at=NOW() WHERE id=?", [scanId]);
      return res.status(400).json({ error: 'Supported scanners: nmap_dns, zap, nikto' });
    }

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[create scan]', err.message);
    return res.status(500).json({ error: 'Failed to create scan' });
  }
});

// List scans, optionally filtered by assessment.
router.get('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { assessment_id } = req.query;

  try {
    let sql = `
      SELECT s.*, t.target_url
      FROM scans s
      JOIN targets t ON s.target_id = t.id
    `;
    const params = [];
    const archived = req.query.archived === '1';
    sql += archived ? ' WHERE s.archived_at IS NOT NULL' : ' WHERE s.archived_at IS NULL';

    if (assessment_id !== undefined) {
      const id = Number(assessment_id);

      if (!isPositiveInt(id)) {
        return res.status(400).json({ error: 'Invalid assessment_id' });
      }

      sql += ' AND s.assessment_id = ?';
      params.push(id);
    }

    const [rows] = await pool.execute(`${sql} ORDER BY s.id DESC`, params);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to list scans' });
  }
});

router.post('/:id/archive', authorize('administrator', 'assessor'), async (req, res) => {
  const scanId = Number(req.params.id);
  if (!isPositiveInt(scanId)) return res.status(400).json({ error: 'Invalid scan ID' });
  try {
    const [result] = await pool.execute('UPDATE scans SET archived_at=NOW() WHERE id=? AND archived_at IS NULL', [scanId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Scan not found or already archived' });
    return res.json({ message: 'Scan archived; tool logs and findings retained' });
  } catch { return res.status(500).json({ error: 'Failed to archive scan' }); }
});
router.post('/:id/restore', authorize('administrator', 'assessor'), async (req, res) => {
  const scanId = Number(req.params.id);
  if (!isPositiveInt(scanId)) return res.status(400).json({ error: 'Invalid scan ID' });
  try {
    const [result] = await pool.execute('UPDATE scans SET archived_at=NULL WHERE id=? AND archived_at IS NOT NULL', [scanId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Archived scan not found' });
    return res.json({ message: 'Scan restored' });
  } catch { return res.status(500).json({ error: 'Failed to restore scan' }); }
});

// Scan execution detail including real tool-run logs and parsed output.
router.get('/:id/details', authorize('administrator', 'assessor'), async (req, res) => {
  const scanId = Number(req.params.id);
  if (!isPositiveInt(scanId)) return res.status(400).json({ error: 'Invalid scan ID' });
  try {
    const [scanRows] = await pool.execute('SELECT s.*, t.target_url FROM scans s JOIN targets t ON t.id=s.target_id WHERE s.id=?', [scanId]);
    if (!scanRows.length) return res.status(404).json({ error: 'Scan not found' });
    const [runs] = await pool.execute('SELECT * FROM tool_runs WHERE scan_id=? ORDER BY id', [scanId]);
    return res.json({ scan: scanRows[0], tool_runs: runs });
  } catch { return res.status(500).json({ error: 'Failed to load scan details' }); }
});

export default router;

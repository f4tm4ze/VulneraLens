import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { isPositiveInt, checkTargetScope } from '../utils/validators.js';
import { runNmapDnsScan } from '../services/nmapDns.js';
import { runZapScan } from '../services/zap.js';

const router = Router();

router.use(authenticate);

// Record and execute a scan against an authorized, in-scope target
router.post('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { target_id, scanner_type } = req.body ?? {};
  const targetId = Number(target_id);

  if (!isPositiveInt(targetId)) {
    return res.status(400).json({ error: 'Valid target_id is required' });
  }
  if (typeof scanner_type !== 'string' || scanner_type.trim().length < 2 || scanner_type.length > 100) {
    return res.status(400).json({ error: 'scanner_type must be 2-100 characters' });
  }

  const normalizedType = scanner_type.trim().toLowerCase();

  try {
    const [targets] = await pool.execute(
      'SELECT id, assessment_id, target_url, authorized FROM targets WHERE id = ?',
      [targetId]
    );
    if (targets.length === 0) {
      return res.status(404).json({ error: 'Target not found' });
    }
    if (!targets[0].authorized) {
      return res.status(403).json({ error: 'Target is not authorized for scanning' });
    }

    const scope = checkTargetScope(targets[0].target_url);
    if (!scope.ok) {
      return res.status(403).json({ error: `Scope check failed: ${scope.error}` });
    }

    const [result] = await pool.execute(
      'INSERT INTO scans (assessment_id, target_id, scanner_type) VALUES (?, ?, ?)',
      [targets[0].assessment_id, targetId, normalizedType]
    );
    const scanId = result.insertId;
    const [rows] = await pool.execute('SELECT * FROM scans WHERE id = ?', [scanId]);

    if (normalizedType === 'nmap_dns' || normalizedType === 'nmap') {
      runNmapDnsScan(scanId, targets[0].target_url).catch((err) => {
        console.error(`[scan ${scanId}] nmap_dns failed:`, err.message);
      });
    } else if (normalizedType === 'zap' || normalizedType === 'owasp_zap') {
      runZapScan(scanId, targets[0].target_url).catch((err) => {
        console.error(`[scan ${scanId}] zap failed:`, err.message);
      });
    }

    return res.status(201).json(rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to create scan' });
  }
});

// List scans (optionally by assessment_id)
router.get('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { assessment_id } = req.query;
  try {
    let sql = `SELECT s.*, t.target_url FROM scans s JOIN targets t ON s.target_id = t.id`;
    const params = [];
    if (assessment_id !== undefined) {
      const id = Number(assessment_id);
      if (!isPositiveInt(id)) {
        return res.status(400).json({ error: 'Invalid assessment_id' });
      }
      sql += ' WHERE s.assessment_id = ?';
      params.push(id);
    }
    const [rows] = await pool.execute(`${sql} ORDER BY s.id DESC`, params);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to list scans' });
  }
});

export default router;

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { checkTargetScope } from '../utils/validators.js';

const router = Router();
router.use(authenticate);
const dvwaUrl = (process.env.DVWA_TARGET_URL || 'http://localhost:8080').replace(/\/$/, '');

async function ensureDvwaTarget() {
  const checked = checkTargetScope(dvwaUrl);
  if (!checked.ok) throw new Error(`Configured DVWA URL is outside allowed scope: ${checked.error}`);
  const [existing] = await pool.execute('SELECT * FROM targets WHERE target_url=? LIMIT 1', [dvwaUrl]);
  let target;
  if (existing.length) {
    target = existing[0];
  } else {
    const [result] = await pool.execute(
      `INSERT INTO targets (target_url, target_type, authorized) VALUES (?, 'web_app', TRUE)`,
      [dvwaUrl]
    );
    const [rows] = await pool.execute('SELECT * FROM targets WHERE id=?', [result.insertId]);
    target = rows[0];
  }
  // Link older assessments to the single configured DVWA target for backwards compatibility.
  await pool.execute(
    `INSERT IGNORE INTO assessment_targets (assessment_id, target_id) SELECT id, ? FROM assessments WHERE archived_at IS NULL`,
    [target.id]
  );
  return target;
}


router.get('/status', authorize('administrator', 'assessor'), async (_req, res) => {
  try {
    const checked = checkTargetScope(dvwaUrl);
    if (!checked.ok) return res.status(400).json({ configured_url: dvwaUrl, status: 'invalid_scope', error: checked.error });
    const response = await fetch(dvwaUrl, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    return res.json({ configured_url: dvwaUrl, status: 'reachable', http_status: response.status, checked_at: new Date().toISOString() });
  } catch (err) {
    return res.json({ configured_url: dvwaUrl, status: 'unreachable', error: err.message, checked_at: new Date().toISOString() });
  }
});

router.get('/', authorize('administrator', 'assessor'), async (req, res) => {
  try {
    const target = await ensureDvwaTarget();
    if (req.query.assessment_id) {
      const aid = Number(req.query.assessment_id);
      const [linked] = await pool.execute('SELECT 1 FROM assessment_targets WHERE assessment_id=? AND target_id=?', [aid, target.id]);
      return res.json(linked.length ? [target] : []);
    }
    return res.json([target]);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load configured DVWA target' });
  }
});
router.post('/', authorize('administrator', 'assessor'), (_req, res) => {
  res.status(403).json({ error: 'VulneraLens is restricted to the configured DVWA target. Arbitrary targets are disabled.' });
});
export default router;

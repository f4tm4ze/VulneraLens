
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import pool from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { isPositiveInt } from '../utils/validators.js';

const router = Router();
const VALID_STATUSES = ['draft', 'in_progress', 'completed'];

router.use(authenticate);

function validName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 150;
}

function validDescription(d) {
  return d === null || d === undefined || (typeof d === 'string' && d.length <= 10000);
}

// ============================================================
// CREATE ASSESSMENT
// Creates an assessment and automatically assigns local DVWA.
// ============================================================
router.post('/', authorize('administrator', 'assessor'), async (req, res) => {
  const { name, description, status } = req.body ?? {};
  const configuredTargetUrl = (process.env.DVWA_TARGET_URL || 'http://localhost:8080').replace(/\/$/, '');

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

  // DVWA is the only supported target; target IDs are not client-controlled.
  const targetIds = [];
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [targetRows] = await connection.execute(
      'SELECT id FROM targets WHERE target_url=? LIMIT 1',
      [configuredTargetUrl]
    );

    let dvwaTargetId;

    if (targetRows.length) {
      dvwaTargetId = targetRows[0].id;
    } else {
      const [newTarget] = await connection.execute(
        `INSERT INTO targets (target_url, target_type, authorized)
         VALUES (?, 'web_app', TRUE)`,
        [configuredTargetUrl]
      );

      dvwaTargetId = newTarget.insertId;
    }

    targetIds.push(dvwaTargetId);

    const [result] = await connection.execute(
      'INSERT INTO assessments (name, description, status, created_by) VALUES (?, ?, ?, ?)',
      [name.trim(), description || null, assessmentStatus, req.user.id]
    );

    const assessmentId = result.insertId;

    for (const targetId of targetIds) {
      await connection.execute(
        'INSERT INTO assessment_targets (assessment_id, target_id) VALUES (?, ?)',
        [assessmentId, targetId]
      );
    }

    await connection.commit();

    const [rows] = await pool.execute(
      'SELECT * FROM assessments WHERE id = ?',
      [assessmentId]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    if (connection) {
      await connection.rollback();
    }

    console.error('[create assessment]', err.message);
    return res.status(500).json({ error: 'Failed to create assessment' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ============================================================
// LIST ASSESSMENTS
// archived=1 returns archived assessments.
// ============================================================
router.get('/', authorize('administrator', 'assessor'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, u.name AS created_by_name
       FROM assessments a
       JOIN users u ON a.created_by = u.id
       WHERE (
  (? = 1 AND a.archived_at IS NOT NULL)
  OR
  (? = 0 AND a.archived_at IS NULL)
)
ORDER BY a.created_at DESC`,
[
  req.query.archived === '1' ? 1 : 0,
  req.query.archived === '1' ? 1 : 0
]
    );

    return res.json(rows);
  } catch (err) {
    console.error('[list assessments]', err.message);
    return res.status(500).json({ error: 'Failed to list assessments' });
  }
});

// ============================================================
// UPDATE ASSESSMENT
// ============================================================
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
    const [existing] = await pool.execute(
      'SELECT * FROM assessments WHERE id = ?',
      [assessmentId]
    );

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

    const [rows] = await pool.execute(
      'SELECT * FROM assessments WHERE id = ?',
      [assessmentId]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error('[update assessment]', err.message);
    return res.status(500).json({ error: 'Failed to update assessment' });
  }
});

// ============================================================
// ARCHIVE ASSESSMENT
// Soft archive only. Assessment data and relationships are retained.
// ============================================================
router.post('/:id/archive', authorize('administrator', 'assessor'), async (req, res) => {
  const assessmentId = Number(req.params.id);

  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE assessments
       SET status_before_archive = status,
           status = 'archived',
           archived_at = NOW()
       WHERE id = ? AND archived_at IS NULL`,
      [assessmentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assessment not found or already archived' });
    }

    return res.json({ message: 'Assessment archived; all records retained' });
  } catch (err) {
    console.error('[archive assessment]', err);
    return res.status(500).json({ error: 'Failed to archive assessment' });
  }
});

// ============================================================
// RESTORE ASSESSMENT
// Restores a soft-archived assessment without deleting any data.
// ============================================================
router.post('/:id/restore', authorize('administrator', 'assessor'), async (req, res) => {
  const assessmentId = Number(req.params.id);

  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE assessments
       SET status = COALESCE(status_before_archive, 'draft'),
           status_before_archive = NULL,
           archived_at = NULL
       WHERE id = ? AND archived_at IS NOT NULL`,
      [assessmentId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Archived assessment not found' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM assessments WHERE id = ?',
      [assessmentId]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error('[restore assessment]', err);
    return res.status(500).json({ error: 'Failed to restore assessment' });
  }
});

// ============================================================
// ASSESSMENT DASHBOARD COUNTS
// ============================================================
router.get('/:id/dashboard', authorize('administrator', 'assessor'), async (req, res) => {
  const assessmentId = Number(req.params.id);

  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }

  try {
    const [sevRows] = await pool.execute(
      `SELECT f.severity, COUNT(*) AS count
       FROM findings f
       JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ?
       GROUP BY f.severity`,
      [assessmentId]
    );

    const [catRows] = await pool.execute(
      `SELECT f.category, COUNT(*) AS count
       FROM findings f
       JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ?
       GROUP BY f.category
       ORDER BY count DESC`,
      [assessmentId]
    );

    const [statusRows] = await pool.execute(
      `SELECT f.status, COUNT(*) AS count
       FROM findings f
       JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ?
       GROUP BY f.status`,
      [assessmentId]
    );

    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    for (const r of sevRows) {
      bySeverity[r.severity] = Number(r.count);
    }

    const byStatus = {
      open: 0,
      confirmed: 0,
      false_positive: 0,
      mitigated: 0
    };

    for (const r of statusRows) {
      byStatus[r.status] = Number(r.count);
    }

    const byCategory = catRows.map(r => ({
      category: r.category,
      count: Number(r.count)
    }));

    const totalFindings = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return res.json({
      totalFindings,
      bySeverity,
      byCategory,
      byStatus
    });
  } catch (err) {
    console.error('[assessment dashboard]', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard counts' });
  }
});

// ============================================================
// PDF REPORT
// Contains ONLY confirmed findings.
// ============================================================
router.get('/:id/report', authorize('administrator', 'assessor'), async (req, res) => {
  const assessmentId = Number(req.params.id);

  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }

  try {
    const [assessments] = await pool.execute(
      'SELECT * FROM assessments WHERE id = ?',
      [assessmentId]
    );

    if (assessments.length === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const assessment = assessments[0];

    const [confirmed] = await pool.execute(
      `SELECT f.*
       FROM findings f
       JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ?
         AND f.status = 'confirmed'
         AND f.archived_at IS NULL
         AND s.archived_at IS NULL
       ORDER BY FIELD(f.severity, 'critical', 'high', 'medium', 'low', 'info'), f.id ASC`,
      [assessmentId]
    );

    const [scanSummary] = await pool.execute(
      `SELECT scanner_type, status, started_at, completed_at, duration_ms, error_message
       FROM scans
       WHERE assessment_id = ? AND archived_at IS NULL
       ORDER BY id`,
      [assessmentId]
    );

    const [toolSummary] = await pool.execute(
      `SELECT tr.tool_name, tr.status, tr.tool_version, tr.started_at,
              tr.completed_at, tr.duration_ms, tr.error_message
       FROM tool_runs tr
       JOIN scans s ON s.id = tr.scan_id
       WHERE s.assessment_id = ? AND s.archived_at IS NULL
       ORDER BY tr.id`,
      [assessmentId]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vulneralens-report-${assessmentId}.pdf"`
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text('VulneraLens Security Assessment Report', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(12).text(`Assessment: ${assessment.name}`);

    if (assessment.description) {
      doc.text(`Description: ${assessment.description}`);
    }

    doc.text(`Generated: ${new Date().toISOString()}`);
    doc.text(`Confirmed Findings: ${confirmed.length}`);
    doc.text(`Scan runs: ${scanSummary.length}`);
    doc.moveDown();

    doc.fontSize(12).text('Tool execution summary');

    scanSummary.forEach(scan => {
      doc.fontSize(9).text(
        `${scan.scanner_type}: ${scan.status} · ${scan.started_at || 'not started'} · ${scan.duration_ms ?? 'duration unavailable'} ms${scan.error_message ? ` · Error: ${scan.error_message}` : ''}`
      );
    });

    doc.moveDown(0.4);
    doc.fontSize(11).text('Individual tool runs');

    toolSummary.forEach(tool => {
      doc.fontSize(9).text(
        `${tool.tool_name}${tool.tool_version ? ` (${tool.tool_version})` : ''}: ${tool.status} · ${tool.duration_ms ?? 'duration unavailable'} ms${tool.error_message ? ` · ${tool.error_message}` : ''}`
      );
    });

    doc.moveDown();

    if (confirmed.length === 0) {
      doc.fontSize(11).text('No confirmed findings were recorded for this assessment.');
    } else {
      confirmed.forEach((f, idx) => {
        doc.fontSize(13).text(
          `${idx + 1}. [${String(f.severity).toUpperCase()}] ${f.title}`
        );

        doc.fontSize(10).text(
          `Category: ${f.category} | URL: ${f.affected_url || 'N/A'}`
        );

        doc.moveDown(0.3);

        doc.fontSize(10).text(
          `Risk / Explanation: ${f.ai_explanation || f.description || 'N/A'}`
        );

        if (f.evidence) {
          doc.moveDown(0.2);
          doc.fontSize(9).text(
            `Evidence: ${String(f.evidence).slice(0, 1200)}`
          );
        }

        doc.moveDown(0.2);

        doc.fontSize(10).text(
          `Remediation: ${f.ai_remediation || f.remediation || 'N/A'}`
        );

        doc.fontSize(9).text(
          `Source tool: ${f.source_tool || 'Not recorded'} | HTTP method: ${f.http_method || 'N/A'} | Parameter: ${f.affected_parameter || 'N/A'}`
        );

        doc.moveDown();
      });
    }

    doc.end();
  } catch (err) {
    console.error('[report]', err.message);

    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate PDF report' });
    }
  }
});

export default router;

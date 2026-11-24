import { Router } from 'express';
import PDFDocument from 'pdfkit';
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

// DB-driven dashboard counts for an assessment
router.get('/:id/dashboard', authorize('administrator', 'assessor'), async (req, res) => {
  const assessmentId = Number(req.params.id);
  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }

  try {
    const [sevRows] = await pool.execute(
      `SELECT f.severity, COUNT(*) AS count
       FROM findings f JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ?
       GROUP BY f.severity`,
      [assessmentId]
    );
    const [catRows] = await pool.execute(
      `SELECT f.category, COUNT(*) AS count
       FROM findings f JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ?
       GROUP BY f.category
       ORDER BY count DESC`,
      [assessmentId]
    );
    const [statusRows] = await pool.execute(
      `SELECT f.status, COUNT(*) AS count
       FROM findings f JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ?
       GROUP BY f.status`,
      [assessmentId]
    );

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const r of sevRows) bySeverity[r.severity] = Number(r.count);

    const byStatus = { open: 0, confirmed: 0, false_positive: 0, mitigated: 0 };
    for (const r of statusRows) byStatus[r.status] = Number(r.count);

    const byCategory = catRows.map((r) => ({ category: r.category, count: Number(r.count) }));
    const totalFindings = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return res.json({ totalFindings, bySeverity, byCategory, byStatus });
  } catch {
    return res.status(500).json({ error: 'Failed to load dashboard counts' });
  }
});

// Generate PDF report containing ONLY confirmed findings
router.get('/:id/report', authorize('administrator', 'assessor'), async (req, res) => {
  const assessmentId = Number(req.params.id);
  if (!isPositiveInt(assessmentId)) {
    return res.status(400).json({ error: 'Invalid assessment ID' });
  }

  try {
    const [assessments] = await pool.execute('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
    if (assessments.length === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    const assessment = assessments[0];

    const [confirmed] = await pool.execute(
      `SELECT f.*
       FROM findings f
       JOIN scans s ON f.scan_id = s.id
       WHERE s.assessment_id = ? AND f.status = 'confirmed'
       ORDER BY FIELD(f.severity, 'critical', 'high', 'medium', 'low', 'info'), f.id ASC`,
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
    if (assessment.description) doc.text(`Description: ${assessment.description}`);
    doc.text(`Generated: ${new Date().toISOString()}`);
    doc.text(`Confirmed Findings: ${confirmed.length}`);
    doc.moveDown();

    if (confirmed.length === 0) {
      doc.fontSize(11).text('No confirmed findings were recorded for this assessment.');
    } else {
      confirmed.forEach((f, idx) => {
        doc.fontSize(13).text(`${idx + 1}. [${String(f.severity).toUpperCase()}] ${f.title}`);
        doc.fontSize(10).text(`Category: ${f.category} | URL: ${f.affected_url || 'N/A'}`);
        doc.moveDown(0.3);
        doc.fontSize(10).text(`Risk / Explanation: ${f.ai_explanation || f.description || 'N/A'}`);
        if (f.evidence) {
          doc.moveDown(0.2);
          doc.fontSize(9).text(`Evidence: ${String(f.evidence).slice(0, 1200)}`);
        }
        doc.moveDown(0.2);
        doc.fontSize(10).text(`Remediation: ${f.ai_remediation || f.remediation || 'N/A'}`);
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

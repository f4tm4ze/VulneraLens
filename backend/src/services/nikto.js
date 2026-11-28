import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../config/db.js';
import { checkTargetScope } from '../utils/validators.js';
const execFileAsync = promisify(execFile);
const EVIDENCE_DIR = path.resolve(process.cwd(), 'evidence', 'nikto');

export async function runNiktoScan(scanId, targetUrl) {
  const scope = checkTargetScope(targetUrl);
  if (!scope.ok) throw new Error(scope.error);
  const started = Date.now();
  const config = ['-host', scope.url, '-nointeractive'];
  let runId;
  const [insert] = await pool.execute(
    `INSERT INTO tool_runs (scan_id, tool_name, command_config, status, started_at) VALUES (?, 'Nikto', ?, 'running', NOW())`,
    [scanId, `nikto ${config.join(' ')}`]
  );
  runId = insert.insertId;
  try {
    const versionInfo = await execFileAsync('nikto', ['-Version'], { timeout: 10000 }).catch(() => ({ stdout: '' }));
    await pool.execute(`UPDATE tool_runs SET tool_version=? WHERE id=?`, [String(versionInfo.stdout||'').slice(0,100), runId]);
    const { stdout = '', stderr = '' } = await execFileAsync('nikto', config, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    const evidencePath = path.join(EVIDENCE_DIR, `scan-${scanId}.txt`);
    await fs.writeFile(evidencePath, `${stdout}\n${stderr}`, 'utf8');
    const findings = parseNiktoOutput(stdout);
    for (const item of findings) {
      await pool.execute(
        `INSERT INTO findings (scan_id, title, description, severity, category, affected_url, evidence, remediation, source_tool) VALUES (?, ?, ?, ?, 'server_misconfiguration', ?, ?, ?, 'Nikto')`,
        [scanId, item.title.slice(0, 200), item.description, item.severity, scope.url, item.raw, 'Review the server configuration and remove or restrict the exposed resource.']
      );
    }
    await pool.execute(
      `UPDATE tool_runs SET status='completed', completed_at=NOW(), duration_ms=?, progress_pct=100, stdout_text=?, stderr_text=?, exit_code=0, parsed_results=? WHERE id=?`,
      [Date.now() - started, stdout, stderr, JSON.stringify(findings), runId]
    );
    await pool.execute(`UPDATE scans SET status='completed', evidence_path=?, completed_at=NOW(), duration_ms=?, stdout_text=?, stderr_text=?, exit_code=0, progress_pct=100 WHERE id=?`, [evidencePath, Date.now() - started, stdout, stderr, scanId]);
    return { findings, evidencePath };
  } catch (err) {
    const message = err.code === 'ENOENT' ? 'Nikto executable not found in backend container.' : err.message;
    await pool.execute(`UPDATE tool_runs SET status='failed', completed_at=NOW(), duration_ms=?, stderr_text=?, error_message=? WHERE id=?`, [Date.now() - started, message, message, runId]);
    await pool.execute(`UPDATE scans SET status='failed', error_message=?, completed_at=NOW(), duration_ms=?, stderr_text=? WHERE id=?`, [message, Date.now() - started, message, scanId]);
    throw err;
  }
}
function parseNiktoOutput(output) {
  const lines = String(output || '').split(/\r?\n/).filter(line => /^\+ /.test(line));
  return lines.map(raw => ({
    title: raw.replace(/^\+\s*/, '').slice(0, 200),
    description: raw.replace(/^\+\s*/, ''),
    severity: /OSVDB|CVE|vulnerab|exploit/i.test(raw) ? 'medium' : 'info',
    raw,
  }));
}

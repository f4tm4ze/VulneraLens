import { execFile } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import pool from '../config/db.js';
import { checkTargetScope } from '../utils/validators.js';

const execFileAsync = promisify(execFile);
const EVIDENCE_DIR = path.resolve(process.cwd(), 'evidence', 'nmap');

/**
 * Parse Nmap XML output into a list of open port/service objects.
 */
export function parseNmapXml(xmlContent) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const parsed = parser.parse(xmlContent);
  const host = parsed?.nmaprun?.host;
  if (!host) return [];

  const hosts = Array.isArray(host) ? host : [host];
  const results = [];

  for (const h of hosts) {
    const portsNode = h?.ports?.port;
    if (!portsNode) continue;
    const ports = Array.isArray(portsNode) ? portsNode : [portsNode];
    for (const p of ports) {
      const state = p?.state?.['@_state'];
      if (state !== 'open') continue;
      results.push({
        port: Number(p['@_portid']),
        protocol: p['@_protocol'] || 'tcp',
        state,
        service: p?.service?.['@_name'] || 'unknown',
        product: p?.service?.['@_product'] || '',
        version: p?.service?.['@_version'] || '',
      });
    }
  }
  return results;
}

/**
 * Run DNS lookup + non-destructive Nmap service scan on an in-scope target.
 */
export async function runNmapDnsScan(scanId, targetUrl) {
  const scope = checkTargetScope(targetUrl);
  if (!scope.ok) {
    await pool.execute(
      `UPDATE scans SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
      [scope.error, scanId]
    );
    throw new Error(scope.error);
  }

  await pool.execute(
    `UPDATE scans SET status = 'running', started_at = NOW() WHERE id = ?`,
    [scanId]
  );

  const runStarted = Date.now();
  const [dnsRun] = await pool.execute(`INSERT INTO tool_runs (scan_id, tool_name, command_config, status, started_at) VALUES (?, 'DNS Enumeration', 'node dns.lookup (all addresses)', 'running', NOW())`, [scanId]);
  const [nmapRun] = await pool.execute(`INSERT INTO tool_runs (scan_id, tool_name, command_config, status, started_at) VALUES (?, 'Nmap', 'nmap -sV -T4 --top-ports 100 -oX <evidence.xml> <DVWA host>', 'pending', NULL)`, [scanId]);
  try {
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    const xmlPath = path.join(EVIDENCE_DIR, `scan-${scanId}.xml`);

    // 1. DNS lookup
    const dnsStarted = Date.now();
    const dnsRecords = await dns.lookup(scope.host, { all: true }).catch(() => []);
    await pool.execute(`UPDATE tool_runs SET status='completed', completed_at=NOW(), duration_ms=?, parsed_results=?, stdout_text=? WHERE id=?`, [Date.now()-dnsStarted, JSON.stringify(dnsRecords), dnsRecords.map(r => `${r.address} (IPv${r.family})`).join('\n'), dnsRun.insertId]);
    await pool.execute(`UPDATE tool_runs SET status='running', started_at=NOW() WHERE id=?`, [nmapRun.insertId]);
    const nmapVersion = await execFileAsync('nmap', ['--version'], { timeout: 10000 }).catch(() => ({ stdout: '' }));
    await pool.execute(`UPDATE tool_runs SET tool_version=? WHERE id=?`, [String(nmapVersion.stdout||'').split('\n')[0].slice(0,100), nmapRun.insertId]);
    await pool.execute(
      `INSERT INTO findings (scan_id, title, description, severity, category, affected_url, evidence, remediation, source_tool)
       VALUES (?, ?, ?, 'info', 'dns', ?, ?, ?, 'DNS Enumeration')`,
      [
        scanId,
        `DNS Resolution for ${scope.host}`,
        `Resolved ${scope.host} to ${dnsRecords.map((r) => `${r.address} (IPv${r.family})`).join(', ') || 'no records'}.`,
        scope.url,
        JSON.stringify({ host: scope.host, records: dnsRecords }, null, 2),
        'Verify DNS records resolve only to expected local/internal interfaces.',
      ]
    );

    // 2. Non-destructive Nmap service version scan
    const nmapStarted = Date.now();
    const nmapArgs = ['-sV', '-T4', '-p', `1-100,${scope.port}`, '-oX', xmlPath, scope.host];
    await pool.execute(`UPDATE tool_runs SET command_config=? WHERE id=?`, [`nmap ${nmapArgs.join(' ')}`, nmapRun.insertId]);
    const { stdout: nmapStdout = '', stderr: nmapStderr = '' } = await execFileAsync('nmap', nmapArgs, { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });

    const xmlContent = await fs.readFile(xmlPath, 'utf8');
    const openPorts = parseNmapXml(xmlContent);
    await pool.execute(`UPDATE tool_runs SET status='completed', completed_at=NOW(), duration_ms=?, progress_pct=100, stdout_text=?, stderr_text=?, exit_code=0, parsed_results=? WHERE id=?`, [Date.now()-nmapStarted, nmapStdout, nmapStderr, JSON.stringify(openPorts), nmapRun.insertId]);

    for (const p of openPorts) {
      const banner = [p.product, p.version].filter(Boolean).join(' ');
      await pool.execute(
        `INSERT INTO findings (scan_id, title, description, severity, category, affected_url, evidence, remediation, source_tool)
         VALUES (?, ?, ?, 'info', 'network_service', ?, ?, ?, 'Nmap')`,
        [
          scanId,
          `Open Port ${p.port}/${p.protocol} (${p.service})`,
          `Detected open ${p.protocol.toUpperCase()} port ${p.port} running ${p.service}${banner ? ` (${banner})` : ''}.`,
          `${scope.host}:${p.port}`,
          JSON.stringify(p, null, 2),
          'Restrict unnecessary open ports via firewall rules and keep exposed services updated.',
        ]
      );
    }

    await pool.execute(
      `UPDATE scans SET status = 'completed', evidence_path = ?, completed_at = NOW(), duration_ms=?, progress_pct=100, stdout_text=?, stderr_text=?, exit_code=0 WHERE id = ?`,
      [xmlPath, Date.now()-runStarted, nmapStdout, nmapStderr, scanId]
    );

    return { xmlPath, openPorts, dnsRecords };
  } catch (err) {
    const msg = err.code === 'ENOENT'
      ? 'nmap binary not found on host. Install Nmap or run via Docker Compose.'
      : err.message;
    await pool.execute(
      `UPDATE scans SET status = 'failed', error_message = ?, completed_at = NOW(), duration_ms=? WHERE id = ?`,
      [msg, Date.now()-runStarted, scanId]
    );
    await pool.execute(`UPDATE tool_runs SET status='failed', completed_at=NOW(), duration_ms=?, error_message=?, stderr_text=? WHERE id IN (?, ?) AND status IN ('running','pending')`, [Date.now()-runStarted, msg, msg, dnsRun.insertId, nmapRun.insertId]);
    throw err;
  }
}

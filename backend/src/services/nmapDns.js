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

  try {
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    const xmlPath = path.join(EVIDENCE_DIR, `scan-${scanId}.xml`);

    // 1. DNS lookup
    const dnsRecords = await dns.lookup(scope.host, { all: true }).catch(() => []);
    await pool.execute(
      `INSERT INTO findings (scan_id, title, description, severity, category, affected_url, evidence, remediation)
       VALUES (?, ?, ?, 'info', 'dns', ?, ?, ?)`,
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
    await execFileAsync('nmap', ['-sV', '-T4', '--top-ports', '100', '-oX', xmlPath, scope.host], {
      timeout: 120000,
    });

    const xmlContent = await fs.readFile(xmlPath, 'utf8');
    const openPorts = parseNmapXml(xmlContent);

    for (const p of openPorts) {
      const banner = [p.product, p.version].filter(Boolean).join(' ');
      await pool.execute(
        `INSERT INTO findings (scan_id, title, description, severity, category, affected_url, evidence, remediation)
         VALUES (?, ?, ?, 'info', 'network_service', ?, ?, ?)`,
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
      `UPDATE scans SET status = 'completed', evidence_path = ?, completed_at = NOW() WHERE id = ?`,
      [xmlPath, scanId]
    );

    return { xmlPath, openPorts, dnsRecords };
  } catch (err) {
    const msg = err.code === 'ENOENT'
      ? 'nmap binary not found on host. Install Nmap or run via Docker Compose.'
      : err.message;
    await pool.execute(
      `UPDATE scans SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
      [msg, scanId]
    );
    throw err;
  }
}

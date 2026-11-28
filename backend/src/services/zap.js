import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../config/db.js';
import { checkTargetScope } from '../utils/validators.js';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'evidence', 'zap');

function getZapConfig() {
  return {
    baseUrl: (process.env.ZAP_API_URL || 'http://127.0.0.1:8090').replace(/\/+$/, ''),
    apiKey: process.env.ZAP_API_KEY || '',
    dvwaUser: process.env.DVWA_USER || 'admin',
    dvwaPassword: process.env.DVWA_PASSWORD || 'password',
    dvwaSecurity: process.env.DVWA_SECURITY || 'low',
  };
}

async function zapRequest(endpoint, params = {}) {
  const { baseUrl, apiKey } = getZapConfig();
  const url = new URL(`${baseUrl}${endpoint}`);
  if (apiKey) url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    throw new Error(`ZAP API error ${res.status} on ${endpoint}`);
  }
  return res.json();
}

/**
 * Authenticate to DVWA and return the session Cookie header value.
 */
async function authenticateDvwa(targetBaseUrl) {
  const { dvwaUser, dvwaPassword, dvwaSecurity } = getZapConfig();
  const loginUrl = new URL('/login.php', targetBaseUrl).toString();

  const getRes = await fetch(loginUrl, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const html = await getRes.text();
  const setCookie = getRes.headers.get('set-cookie') || '';
  const phpSessMatch = setCookie.match(/PHPSESSID=([^;]+)/i);
  const tokenMatch = html.match(/name=['"]user_token['"][^>]*value=['"]([^'"]+)['"]/i);

  const phpsessid = phpSessMatch ? phpSessMatch[1] : '';
  const body = new URLSearchParams({
    username: dvwaUser,
    password: dvwaPassword,
    Login: 'Login',
  });
  if (tokenMatch) body.set('user_token', tokenMatch[1]);

  const postRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(phpsessid ? { Cookie: `PHPSESSID=${phpsessid}` } : {}),
    },
    body: body.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });

  const postCookie = postRes.headers.get('set-cookie') || '';
  const finalSessMatch = postCookie.match(/PHPSESSID=([^;]+)/i);
  const finalSess = finalSessMatch ? finalSessMatch[1] : phpsessid;

  return `PHPSESSID=${finalSess}; security=${dvwaSecurity}`;
}

function mapZapRisk(risk) {
  const r = String(risk || '').toLowerCase();
  if (r.includes('high')) return 'high';
  if (r.includes('medium')) return 'medium';
  if (r.includes('low')) return 'low';
  return 'info';
}

async function pollZapStatus(endpoint, scanKey, timeoutMs = 180000, toolRunId = null, offset = 0, scale = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await zapRequest(endpoint, { scanId: scanKey });
    const pct = Number(data.status ?? 0);
    if (toolRunId !== null) await pool.execute('UPDATE tool_runs SET progress_pct=? WHERE id=?', [Math.max(0, Math.min(100, Math.round(offset + pct * scale / 100))), toolRunId]);
    if (pct >= 100) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`ZAP scan timed out on ${endpoint}`);
}

/**
 * Run authenticated OWASP ZAP spider + active scan on an in-scope target.
 */
export async function runZapScan(scanId, targetUrl) {
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

  const zapStarted = Date.now();
  const [zapRun] = await pool.execute(`INSERT INTO tool_runs (scan_id, tool_name, command_config, status, started_at) VALUES (?, 'OWASP ZAP', 'Authenticated spider followed by configured active scan via ZAP API', 'running', NOW())`, [scanId]);
  try {
    const versionInfo = await zapRequest('/JSON/core/view/version/').catch(() => null);
    if (versionInfo?.version) await pool.execute(`UPDATE tool_runs SET tool_version=? WHERE id=?`, [String(versionInfo.version).slice(0,100), zapRun.insertId]);
    // 1. Authenticate to DVWA and configure ZAP replacer rule for session cookie
    const cookieHeader = await authenticateDvwa(scope.url).catch(() => null);
    if (cookieHeader) {
      await zapRequest('/JSON/replacer/action/removeRule/', { description: 'DVWA_Auth_Cookie' }).catch(() => {});
      await zapRequest('/JSON/replacer/action/addRule/', {
        description: 'DVWA_Auth_Cookie',
        enabled: 'true',
        matchType: 'REQ_HEADER',
        matchRegex: 'false',
        matchString: 'Cookie',
        replacement: cookieHeader,
        initiators: '',
      });
    }

    // 2. Spider
    const spiderRes = await zapRequest('/JSON/spider/action/scan/', { url: scope.url, recurse: 'true' });
    await pool.execute(`UPDATE tool_runs SET command_config=? WHERE id=?`, [`ZAP authenticated spider (${scope.url}) followed by active scan`, zapRun.insertId]);
    await pollZapStatus('/JSON/spider/view/status/', spiderRes.scan, 180000, zapRun.insertId, 0, 40);

    // 3. Active Scan
    const ascanRes = await zapRequest('/JSON/ascan/action/scan/', { url: scope.url, recurse: 'true' });
    await pollZapStatus('/JSON/ascan/view/status/', ascanRes.scan, 180000, zapRun.insertId, 40, 55);

    // 4. Import alerts as JSON evidence
    const alertsRes = await zapRequest('/JSON/core/view/alerts/', { baseurl: scope.url });
    const alerts = alertsRes.alerts || [];

    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    const jsonPath = path.join(EVIDENCE_DIR, `scan-${scanId}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(alerts, null, 2), 'utf8');

    for (const a of alerts) {
      const evidenceObj = {
        url: a.url,
        method: a.method,
        requestHeader: a.requestHeader,
        requestBody: a.requestBody,
        responseHeader: a.responseHeader,
        responseBody: a.responseBody,
        param: a.param,
        attack: a.attack,
        evidence: a.evidence,
        cweid: a.cweid,
        wascid: a.wascid,
        confidence: a.confidence,
        other: a.other,
      };
      await pool.execute(
        `INSERT INTO findings (scan_id, title, description, severity, category, affected_url, evidence, remediation, source_tool, http_method, affected_parameter, payload, request_evidence, response_evidence, references_text)
         VALUES (?, ?, ?, ?, 'web_vulnerability', ?, ?, ?, 'OWASP ZAP', ?, ?, ?, ?, ?, ?)`,
        [
          scanId,
          String(a.alert || a.name || 'ZAP Alert').slice(0, 200),
          a.description || '',
          mapZapRisk(a.risk),
          String(a.url || scope.url).slice(0, 500),
          JSON.stringify(evidenceObj, null, 2),
          a.solution || '',
          a.method || null,
          a.param || null,
          a.attack || null,
          a.requestHeader || a.requestBody || null,
          a.responseHeader || a.responseBody || null,
          [a.reference, a.cweid ? `CWE-${a.cweid}` : null].filter(Boolean).join('\n') || null,
        ]
      );
    }

    await pool.execute(`UPDATE tool_runs SET status='completed', completed_at=NOW(), duration_ms=?, progress_pct=100, stdout_text=?, parsed_results=?, exit_code=0 WHERE id=?`, [Date.now()-zapStarted, `Spider scan ${spiderRes.scan} and active scan ${ascanRes.scan} completed. Imported ${alerts.length} alerts.`, JSON.stringify({ spider_scan_id: spiderRes.scan, active_scan_id: ascanRes.scan, alerts }), zapRun.insertId]);
    await pool.execute(
      `UPDATE scans SET status = 'completed', evidence_path = ?, completed_at = NOW(), duration_ms=?, progress_pct=100, stdout_text=?, exit_code=0 WHERE id = ?`,
      [jsonPath, Date.now()-zapStarted, `Spider scan ${spiderRes.scan} and active scan ${ascanRes.scan} completed. Imported ${alerts.length} alerts.`, scanId]
    );

    return { jsonPath, alertCount: alerts.length };
  } catch (err) {
    await pool.execute(`UPDATE tool_runs SET status='failed', completed_at=NOW(), duration_ms=?, error_message=?, stderr_text=? WHERE id=?`, [Date.now()-zapStarted, err.message, err.message, zapRun.insertId]);
    await pool.execute(
      `UPDATE scans SET status = 'failed', error_message = ?, completed_at = NOW(), duration_ms=?, stderr_text=? WHERE id = ?`,
      [err.message, Date.now()-zapStarted, err.message, scanId]
    );
    throw err;
  }
}
/**
 * Retrieve HTTP traffic history recorded by ZAP.
 */
export async function getZapHistory(start = 0, count = 100) {
  const data = await zapRequest('/JSON/core/view/messages/', {
    start,
    count,
  });

  return data.messages || [];
}
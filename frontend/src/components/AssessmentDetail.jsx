import { useCallback, useEffect, useState } from 'react';
import { api, downloadReport } from '../api.js';
import { Badge, btnCls, btnGhostCls, ErrorMsg, Field, inputCls } from './ui.jsx';

const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const DECISIONS = ['confirmed', 'false_positive', 'needs_retest', 'mitigated'];

export default function AssessmentDetail({ assessment, section = 'dashboard' }) {
  const id = assessment.id;
  const [targets, setTargets] = useState([]);
  const [scans, setScans] = useState([]);
  const [findings, setFindings] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, s, f, d] = await Promise.all([
        api(`/targets?assessment_id=${id}`),
        api(`/scans?assessment_id=${id}`),
        api(`/findings?assessment_id=${id}`),
        api(`/assessments/${id}/dashboard`),
      ]);
      setTargets(t);
      setScans(s);
      setFindings(f);
      setDashboard(d);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!scans.some(scan => ['queued','running'].includes(scan.status))) return;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [scans, load]);

  return (
    <div className="space-y-6">
      <ErrorMsg message={error} />
      
      {section === 'assessment-scans' && (
        <Scans
          assessmentId={id}
          targets={targets}
          scans={scans}
          reload={load}
          setError={setError}
        />
      )}
      {section === 'overview' && dashboard && (
        <DashboardSection
          dashboard={dashboard}
          scans={scans}
          findings={findings}
          targets={targets}
        />
      )}
      {section === 'assessment-findings' && <Findings scans={scans} findings={findings} reload={load} setError={setError} />}
      {section === 'assessment-reports' && <Reports assessment={assessment} findings={findings} onExport={() => downloadReport(id).catch(e => setError(e.message))} />}
    </div>
  );

}

function DashboardSection({ dashboard, scans, findings, targets }) {
  const pending = dashboard.byStatus.open || 0;
  const confirmed = dashboard.byStatus.confirmed || 0;
  const rejected = dashboard.byStatus.false_positive || 0;
  return (
    <>
      <div className="summary-strip">
        <Summary label="Registered targets" value={targets.length} detail="Authorized assets" />
        <Summary label="Recorded scans" value={scans.length} detail="Nmap, DNS, ZAP or manual" />
        <Summary label="Total findings" value={dashboard.totalFindings} detail="Imported and manual observations" />
        <Summary label="Awaiting review" value={pending} detail="Requires assessor decision" />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading"><div><h2>Findings by severity</h2><p>Current severity assigned to each finding.</p></div></div>
          <div className="severity-list">
            {Object.entries(dashboard.bySeverity).map(([key, value]) => <div className="severity-row" key={key}>
              <span className={`severity-dot sev-${key}`} /><span className="severity-name">{key === 'info' ? 'Informational' : key[0].toUpperCase() + key.slice(1)}</span><strong>{value}</strong>
              <div className="severity-track"><i style={{ width: `${dashboard.totalFindings ? value / dashboard.totalFindings * 100 : 0}%` }} /></div>
            </div>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Verification progress</h2><p>Human review determines the final status.</p></div></div>
          <div className="verification-summary">
            <div><strong>{pending}</strong><span>Pending review</span></div>
            <div><strong>{confirmed}</strong><span>Confirmed</span></div>
            <div><strong>{rejected}</strong><span>Rejected</span></div>
          </div>
          <div className="workflow-note"><b>Human decision required</b><p>AI analysis is advisory. Only findings confirmed by an assessor are included in the final PDF report.</p></div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading"><div><h2>Recent findings</h2><p>Latest observations from this assessment.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Finding</th><th>Severity</th><th>Status</th><th>Source</th></tr></thead><tbody>
          {findings.slice(0, 8).map(f => <tr key={f.id}><td className="primary-cell">{f.title}</td><td><Badge kind="severity" value={f.severity} /></td><td><Badge value={f.status} /></td><td>{f.scanner_type || 'Recorded finding'}</td></tr>)}
          {!findings.length && <tr><td colSpan="4" className="empty-cell">No findings recorded for this assessment.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Scan activity</h2><p>Execution status of reconnaissance and web application scans.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Scan</th><th>Target</th><th>Status</th><th>Started</th></tr></thead><tbody>
          {scans.slice(0, 8).map(scan => <tr key={scan.id}><td className="primary-cell">#{scan.id} · {scan.scanner_type}<ScanLog scanId={scan.id}/></td><td>{scan.target_url}</td><td><Badge value={scan.status} /></td><td>{scan.started_at ? new Date(scan.started_at).toLocaleString() : '—'}{scan.completed_at&&<div className="text-xs text-ink/50">Ended {new Date(scan.completed_at).toLocaleTimeString()}</div>}{scan.duration_ms!=null&&<div className="text-xs text-ink/50">{scan.duration_ms} ms</div>}</td></tr>)}
          {!scans.length && <tr><td colSpan="4" className="empty-cell">No scans have been started for this assessment.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}

function ScanLog({scanId}){const [open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState('');async function toggle(){const next=!open;setOpen(next);if(next&&!data){try{setData(await api(`/scans/${scanId}/details`))}catch(e){setError(e.message)}}}return <div className="mt-1"><button className="text-button text-xs" onClick={toggle}>{open?'Hide execution details':'Execution details'}</button>{open&&<div className="mt-1 max-w-xl whitespace-normal text-xs space-y-1">{error&&<p>{error}</p>}{data?.tool_runs?.map(r=><div className="border border-line p-2" key={r.id}><b>{r.tool_name}</b> · {r.status} · {r.duration_ms??'—'} ms{r.error_message&&<p className="text-red-600">{r.error_message}</p>}{r.stdout_text&&<details><summary>Output</summary><pre className="max-h-36 overflow-auto whitespace-pre-wrap">{r.stdout_text}</pre></details>}{r.stderr_text&&<details><summary>Error output</summary><pre className="max-h-36 overflow-auto whitespace-pre-wrap">{r.stderr_text}</pre></details>}</div>)}</div>}</div>}

function Summary({ label, value, detail }) {
  return <div className="summary-item"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Reports({ assessment, findings, onExport }) {
  const confirmed = findings.filter(f => f.status === 'confirmed');
  return <section className="panel">
    <div className="panel-heading"><div><h2>Security assessment report</h2><p>{assessment.name}</p></div><button className={btnCls} onClick={onExport}>Export PDF</button></div>
    <div className="report-summary">
      <div><span>Confirmed findings</span><strong>{confirmed.length}</strong></div>
      <div><span>Excluded from report</span><strong>{findings.length - confirmed.length}</strong></div>
    </div>
    <p className="helper-text">The PDF contains confirmed findings only, including available explanations, evidence, severity, and remediation. Pending and rejected findings are excluded.</p>
    <h3 className="subheading">Included findings</h3>
    {confirmed.length ? confirmed.map(f => <div className="report-finding" key={f.id}><Badge kind="severity" value={f.severity} /><strong>{f.title}</strong><span>{f.affected_url || 'No affected URL recorded'}</span></div>) : <p className="empty-cell">No confirmed findings are available for export.</p>}
  </section>;
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-line pb-1 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Scans({ assessmentId, targets, scans, reload, setError }) {
  const [targetId, setTargetId] = useState('');
  const [scanner, setScanner] = useState('nmap_dns');
  const [expandedScan, setExpandedScan] = useState(null);
  const [scanDetails, setScanDetails] = useState({});
  const [scanArchiveView, setScanArchiveView] = useState(false);
  const [targetStatus, setTargetStatus] = useState(null);
  useEffect(() => { api('/targets/status').then(setTargetStatus).catch(e=>setError(e.message)); }, []);
  const [scanList, setScanList] = useState(scans);
  useEffect(() => { setScanList(scans); }, [scans]);
  useEffect(() => { if (scanArchiveView) api(`/scans?assessment_id=${assessmentId}&archived=1`).then(setScanList).catch(e=>setError(e.message)); else setScanList(scans); }, [scanArchiveView, assessmentId, scans]);
  async function archiveScan(scan) { try { await api(`/scans/${scan.id}/${scanArchiveView?'restore':'archive'}`, {method:'POST'}); if(scanArchiveView) setScanList(prev=>prev.filter(x=>x.id!==scan.id)); else setScanList(prev=>prev.filter(x=>x.id!==scan.id)); reload(); } catch(e){setError(e.message);} }
  useEffect(() => { if (!targetId && targets.length) setTargetId(String(targets[0].id)); }, [targets, targetId]);
  async function showDetails(id) {
    if (expandedScan === id) { setExpandedScan(null); return; }
    setExpandedScan(id);
    try { const detail = await api(`/scans/${id}/details`); setScanDetails(prev => ({...prev, [id]: detail})); } catch (e) { setError(e.message); }
  }

  useEffect(() => {
    if (!expandedScan || !scans.some(scan => scan.id===expandedScan && ['queued','running'].includes(scan.status))) return;
    const timer = window.setInterval(() => api(`/scans/${expandedScan}/details`).then(detail=>setScanDetails(prev=>({...prev,[expandedScan]:detail}))).catch(()=>{}), 3000);
    return () => window.clearInterval(timer);
  }, [expandedScan, scans]);
  async function add(e) {
    e.preventDefault();
    try {
      await api('/scans', {
        method: 'POST',
        body: {
          assessment_id: assessmentId,
          target_id: Number(targetId),
          scanner_type: scanner,
        },
      });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Section title="Assessment activity">
      <p className="helper-text !mx-0">Run tools only against the configured DVWA instance. Nmap checks ports and services; DNS enumeration resolves the configured host; ZAP crawls and checks web behavior; Nikto checks server configuration and exposed files.</p>
      <details className="panel p-3 text-sm"><summary className="font-semibold cursor-pointer">Tool information and limitations</summary><div className="mt-2 space-y-2"><p><b>Nmap:</b> identifies open ports and service/version details; service detection may be incomplete or inaccurate.</p><p><b>DNS Enumeration:</b> resolves the configured hostname to address records; it does not perform broad third-party domain enumeration.</p><p><b>OWASP ZAP:</b> spiders and checks DVWA using its API and configured authentication; scans may miss vulnerabilities and active checks can modify test data.</p><p><b>Nikto:</b> checks web-server configuration and common exposed resources; findings are indicators that require manual verification.</p></div></details>
      <div className="border border-line p-3 text-sm"><b>Configured DVWA target:</b> {targets[0]?.target_url || 'Loading target…'} <span className="ml-2">{targetStatus?.status==='reachable'?'Reachable':targetStatus?.status==='unreachable'?'Unreachable':'Checking…'}</span>{targetStatus?.http_status&&<span> · HTTP {targetStatus.http_status}</span>}{targetStatus?.error&&<p className="text-amber-700">{targetStatus.error}</p>}</div>
      {targets.length === 0 && <p className="text-sm text-ink/60">The configured DVWA target is not linked. Reopen or recreate the assessment after checking DVWA configuration.</p>}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <select className={`${inputCls} !w-auto`} value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
          <option value="">Select target…</option>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.target_url}</option>)}
        </select>
        <select className={`${inputCls} !w-auto`} value={scanner} onChange={(e) => setScanner(e.target.value)}><option value="nmap_dns">Nmap + DNS Enumeration</option><option value="zap">OWASP ZAP</option><option value="nikto">Nikto Web Server Checks</option></select>
        <button className={btnGhostCls} disabled={targets.length === 0}>
          Start scan
        </button>
      </form>
      <div className="flex justify-between items-center mt-3"><b>{scanArchiveView?'Archived scan runs':'Scan activity'}</b><button className="text-button" onClick={()=>setScanArchiveView(v=>!v)}>{scanArchiveView?'Show active scans':'View archived scans'}</button></div>
      <ul className="text-sm">
        {scanList.map((s) => (
          <li key={s.id} className="border-b border-line py-2">
            <div className="flex flex-wrap items-center gap-2">Scan #{s.id} — {s.scanner_type} on <span className="font-mono text-xs">{s.target_url}</span> <Badge value={s.status} /><button className="text-button" onClick={() => showDetails(s.id)}>{expandedScan===s.id?'Hide tool details':'Tool details'}</button><button className="text-button" onClick={()=>archiveScan(s)}>{scanArchiveView?'Restore':'Archive'}</button></div>
            {expandedScan===s.id&&<div className="mt-2 border-l-2 border-line pl-3 text-xs space-y-2">{scanDetails[s.id]?.tool_runs?.map(run=><div key={run.id} className="space-y-1"><b>{run.tool_name}</b> <Badge value={run.status}/><p>Progress: {run.progress_pct??0}% · Config: {run.command_config||'Not recorded'}</p><p>Started: {run.started_at?new Date(run.started_at).toLocaleString():'—'} · Finished: {run.completed_at?new Date(run.completed_at).toLocaleString():'—'} · Duration: {run.duration_ms??'—'} ms</p>{run.error_message&&<p className="text-red-600">{run.error_message}</p>}{run.stdout_text&&<details><summary>Stdout</summary><pre className="whitespace-pre-wrap max-h-48 overflow-auto">{run.stdout_text}</pre></details>}{run.stderr_text&&<details><summary>Stderr</summary><pre className="whitespace-pre-wrap max-h-48 overflow-auto">{run.stderr_text}</pre></details>}{run.parsed_results&&<details><summary>Parsed results</summary><pre className="whitespace-pre-wrap max-h-48 overflow-auto">{run.parsed_results}</pre></details>}</div>)}{!scanDetails[s.id]&&<span>Loading execution details…</span>}</div>}
          </li>
        ))}
      </ul>
      {scanList.length===0&&<p className="text-sm text-ink/60">No {scanArchiveView?'archived':'active'} scans.</p>}
    </Section>
  );
}

function Findings({ scans, findings, reload, setError }) {
  const empty = { scan_id: '', title: '', severity: 'info', affected_url: '', description: '', evidence: '', remediation: '' };
  const [form, setForm] = useState(empty);
  const [reviewing, setReviewing] = useState(null);
  const [analyzing, setAnalyzing] = useState(null);
  const [aiNotes, setAiNotes] = useState({}); // finding id -> why live AI was unavailable
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    try {
      await api('/findings', { method: 'POST', body: { ...form, scan_id: Number(form.scan_id) } });
      setForm(empty);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function analyze(fid) {
    setAnalyzing(fid);
    try {
      const res = await api(`/findings/${fid}/analyze`, { method: 'POST', body: {} });
      setAiNotes((n) => ({ ...n, [fid]: res.ai_errors ?? [] }));
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(null);
    }
  }

  return (
    <Section title="Findings">
      {scans.length > 0 && (
        <form onSubmit={add} className="grid gap-3 border border-line bg-surface p-3 md:grid-cols-3">
          <select className={inputCls} value={form.scan_id} onChange={set('scan_id')} required>
            <option value="">Scan…</option>
            {scans.map((s) => <option key={s.id} value={s.id}>#{s.id} {s.scanner_type}</option>)}
          </select>
          <input className={inputCls} placeholder="Title" value={form.title} onChange={set('title')} required minLength={2} />
          <select className={inputCls} value={form.severity} onChange={set('severity')}>
            {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input className={inputCls} placeholder="Affected URL" value={form.affected_url} onChange={set('affected_url')} />
          <input className={inputCls} placeholder="Description" value={form.description} onChange={set('description')} />
          <input className={inputCls} placeholder="Evidence" value={form.evidence} onChange={set('evidence')} />
          <input className={`${inputCls} md:col-span-2`} placeholder="Remediation" value={form.remediation} onChange={set('remediation')} />
          <button className={btnCls}>Add finding</button>
        </form>
      )}
      {findings.length === 0 && <p className="text-sm text-ink/60">No findings yet.</p>}
      {findings.map((f) => (
        <div key={f.id} className="finding-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge kind="severity" value={f.severity} />
            <Badge value={f.status} />
            <span className="finding-title">{f.title}</span>
            <span className="text-xs text-ink/60">{f.review_count} review(s)</span>
            <button className="ml-auto text-accent underline" disabled={analyzing === f.id} onClick={() => analyze(f.id)}>
              {analyzing === f.id ? 'Analyzing…' : f.ai_explanation ? 'Re-analyze' : 'Analyze with AI'}
            </button>
            <button className="text-accent underline" onClick={() => setReviewing(reviewing === f.id ? null : f.id)}>
              {reviewing === f.id ? 'Close' : 'Review'}
            </button>
          </div>
          {f.affected_url && <p className="mt-1 font-mono text-xs">{f.affected_url}</p>}
          {f.description && <p className="mt-1">{f.description}</p>}
          {f.evidence && <p className="mt-1 text-ink/70"><b>Evidence:</b> {f.evidence}</p>}
          {f.remediation && <p className="mt-1 text-ink/70"><b>Remediation:</b> {f.remediation}</p>}
          {analyzing === f.id && (
            <p className="mt-2 border border-line bg-surface px-3 py-2 text-xs">AI is analyzing this finding…</p>
          )}
          {f.ai_explanation && analyzing !== f.id && <AiPanel finding={f} notes={aiNotes[f.id]} />}
          {reviewing === f.id && <Review findingId={f.id} reload={reload} setError={setError} />}
        </div>
      ))}
    </Section>
  );
}

function AiPanel({ finding: f, notes = [] }) {
  const offline = f.ai_model === 'offline-template';
  const steps = String(f.ai_remediation || '')
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
  const when = f.ai_analyzed_at ? new Date(f.ai_analyzed_at).toLocaleString() : null;

  return (
    <div className="mt-3 border border-accent/40 bg-surface/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-accent/40 bg-accent px-3 py-1.5 text-canvas">
        <span className="text-xs font-semibold uppercase tracking-wide">AI Analysis</span>
        <span className="text-xs opacity-80">suggestion only — assessor must verify</span>
        <span className="ml-auto text-xs opacity-90">
          {offline ? 'Offline template' : f.ai_model || 'model not recorded'}
          {when && ` · ${when}`}
        </span>
      </div>

      <div className="space-y-3 p-3">
        {offline && (
          <p className="border border-amber-500 bg-amber-100 px-2 py-1 text-xs text-black">
            Live AI was not reachable, so this is a built-in template answer, not a model response.
            {notes.length > 0 && <span className="font-mono"> ({notes.join('; ')})</span>}
          </p>
        )}

        <div>
          <p className="field-kicker">AI explanation</p>
          <p className="mt-0.5">{f.ai_explanation}</p>
        </div>

        <div className="severity-comparison">
          <span className="field-kicker">Severity comparison</span>
          <span className="flex items-center gap-1 text-xs">
            Recorded <Badge kind="severity" value={f.severity} />
          </span>
          {f.ai_severity && (
            <span className="flex items-center gap-1 text-xs">
              AI suggestion <Badge kind="severity" value={f.ai_severity} />
              {f.ai_severity !== f.severity && <span className="text-ink/60">(differs)</span>}
            </span>
          )}
          {f.ai_confidence && (
            <span className="flex items-center gap-1 text-xs">
              AI confidence: <b>{f.ai_confidence}</b>
            </span>
          )}
        </div>

        {steps.length > 0 && (
          <div>
            <p className="field-kicker">Suggested remediation</p>
            <ol className="mt-0.5 list-decimal space-y-0.5 pl-5">
              {steps.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function Review({ findingId, reload, setError }) {
  const [reviews, setReviews] = useState([]);
  const [decision, setDecision] = useState('confirmed');
  const [remarks, setRemarks] = useState('');
  const [severity, setSeverity] = useState('');

  const load = useCallback(async () => {
    try {
      setReviews(await api(`/findings/${findingId}/reviews`));
    } catch (e) {
      setError(e.message);
    }
  }, [findingId, setError]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!scans.some(scan => ['queued','running'].includes(scan.status))) return;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [scans, load]);

  async function submit(e) {
    e.preventDefault();
    try {
      await api(`/findings/${findingId}/reviews`, { method: 'POST', body: { decision, remarks, ...(severity ? { severity } : {}) } });
      setRemarks('');
      await load();
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="review-panel mt-3 space-y-2 border-t border-line pt-3"><div><p className="field-kicker">Human verification</p><p className="helper-text">Check the technical evidence before choosing a decision. Your decision, notes, and timestamp are recorded.</p></div>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <select className={`${inputCls} !w-auto`} value={decision} onChange={(e) => setDecision(e.target.value)}>
          {DECISIONS.map((d) => <option key={d} value={d}>{({ confirmed: "Confirm finding", false_positive: "Reject as false positive", needs_retest: "Needs retesting", mitigated: "Mark as mitigated" })[d]}</option>)}
        </select>
        <select className={`${inputCls} !w-auto`} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Keep current severity</option>
          {SEVERITIES.map(v => <option key={v} value={v}>{v === 'info' ? 'Informational' : v[0].toUpperCase() + v.slice(1)}</option>)}
        </select>
        <input className={`${inputCls} flex-1`} placeholder="Verification notes (explain your decision)" value={remarks} onChange={(e) => setRemarks(e.target.value)} required />
        <button className={btnCls}>Submit review</button>
      </form>
      {reviews.map((r) => (
        <p key={r.id} className="text-xs">
          <b>{r.assessor_name}</b> → {r.decision}
          {r.remarks && `: ${r.remarks}`} <span className="text-ink/50">({new Date(r.reviewed_at).toLocaleString()})</span>
        </p>
      ))}
    </div>
  );
}
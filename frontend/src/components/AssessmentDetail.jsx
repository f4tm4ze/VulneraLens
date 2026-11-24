import { useCallback, useEffect, useState } from 'react';
import { api, downloadReport } from '../api.js';
import { Badge, btnCls, btnGhostCls, ErrorMsg, Field, inputCls } from './ui.jsx';

const TYPES = ['web_app', 'api', 'network', 'host'];
const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const DECISIONS = ['confirmed', 'false_positive', 'needs_retest', 'mitigated'];

export default function AssessmentDetail({ assessment, onBack }) {
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

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button className="text-sm text-accent underline" onClick={onBack}>← All assessments</button>
          <h2 className="mt-2 text-lg font-semibold">{assessment.name}</h2>
          {assessment.description && <p className="text-sm text-ink/70">{assessment.description}</p>}
        </div>
        <button
          className={btnCls}
          onClick={() => downloadReport(id).catch((e) => setError(e.message))}
        >
          Export Confirmed PDF
        </button>
      </div>
      <ErrorMsg message={error} />
      {dashboard && <DashboardSection dashboard={dashboard} />}
      <Targets id={id} targets={targets} reload={load} setError={setError} />
      <Scans targets={targets} scans={scans} reload={load} setError={setError} />
      <Findings scans={scans} findings={findings} reload={load} setError={setError} />
    </div>
  );
}

function DashboardSection({ dashboard }) {
  return (
    <Section title={`Dashboard (${dashboard.totalFindings} findings)`}>
      <div className="grid gap-4 md:grid-cols-3">
        <table className="w-full border border-line text-sm">
          <thead>
            <tr className="border-b border-line bg-ink/5 text-left">
              <th className="px-2 py-1">Severity</th>
              <th className="px-2 py-1 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(dashboard.bySeverity).map(([k, v]) => (
              <tr key={k} className="border-b border-line">
                <td className="px-2 py-1"><Badge value={k} /></td>
                <td className="px-2 py-1 text-right font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full border border-line text-sm">
          <thead>
            <tr className="border-b border-line bg-ink/5 text-left">
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(dashboard.byStatus).map(([k, v]) => (
              <tr key={k} className="border-b border-line">
                <td className="px-2 py-1"><Badge value={k} /></td>
                <td className="px-2 py-1 text-right font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full border border-line text-sm">
          <thead>
            <tr className="border-b border-line bg-ink/5 text-left">
              <th className="px-2 py-1">Category</th>
              <th className="px-2 py-1 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.byCategory.length === 0 ? (
              <tr><td className="px-2 py-1 text-ink/60" colSpan={2}>No findings yet</td></tr>
            ) : (
              dashboard.byCategory.map((c) => (
                <tr key={c.category} className="border-b border-line">
                  <td className="px-2 py-1">{c.category}</td>
                  <td className="px-2 py-1 text-right font-mono">{c.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-line pb-1 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Targets({ id, targets, reload, setError }) {
  const [form, setForm] = useState({ target_url: '', target_type: 'web_app', authorized: false });

  async function add(e) {
    e.preventDefault();
    try {
      await api('/targets', { method: 'POST', body: { ...form, assessment_id: id } });
      setForm({ target_url: '', target_type: 'web_app', authorized: false });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Section title="Targets">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border border-line bg-surface p-3">
        <div className="min-w-64 flex-1">
          <Field label="Target URL">
            <input className={inputCls} placeholder="http://localhost:8080" value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} required />
          </Field>
        </div>
        <select className={`${inputCls} !w-auto`} value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value })}>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.authorized} onChange={(e) => setForm({ ...form, authorized: e.target.checked })} />
          I am authorized to test this target
        </label>
        <button className={btnCls} disabled={!form.authorized}>Add target</button>
      </form>
      <ul className="text-sm">
        {targets.length === 0 && <li className="text-ink/60">No targets yet.</li>}
        {targets.map((t) => (
          <li key={t.id} className="border-b border-line py-1 font-mono text-xs">
            #{t.id} {t.target_url} <Badge value={t.target_type} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Scans({ targets, scans, reload, setError }) {
  const [targetId, setTargetId] = useState('');
  const [scanner, setScanner] = useState('manual-review');

  async function add(e) {
    e.preventDefault();
    try {
      await api('/scans', { method: 'POST', body: { target_id: Number(targetId), scanner_type: scanner } });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Section title="Scans">
      <p className="text-xs text-ink/60">Scans are recorded only; no automated scanner runs yet.</p>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <select className={`${inputCls} !w-auto`} value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
          <option value="">Select target…</option>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.target_url}</option>)}
        </select>
        <input className={`${inputCls} !w-48`} value={scanner} onChange={(e) => setScanner(e.target.value)} required minLength={2} />
        <button className={btnGhostCls}>Record scan</button>
      </form>
      <ul className="text-sm">
        {scans.map((s) => (
          <li key={s.id} className="border-b border-line py-1">
            Scan #{s.id} — {s.scanner_type} on <span className="font-mono text-xs">{s.target_url}</span> <Badge value={s.status} />
          </li>
        ))}
      </ul>
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
        <div key={f.id} className="border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge kind="severity" value={f.severity} />
            <Badge value={f.status} />
            <span className="font-semibold">{f.title}</span>
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
          <p className="text-xs font-semibold uppercase text-ink/60">What this means</p>
          <p className="mt-0.5">{f.ai_explanation}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-xs font-semibold uppercase text-ink/60">Severity</span>
          <span className="flex items-center gap-1 text-xs">
            current <Badge kind="severity" value={f.severity} />
          </span>
          {f.ai_severity && (
            <span className="flex items-center gap-1 text-xs">
              AI suggests <Badge kind="severity" value={f.ai_severity} />
              {f.ai_severity !== f.severity && <span className="text-ink/60">(differs)</span>}
            </span>
          )}
          {f.ai_confidence && (
            <span className="flex items-center gap-1 text-xs">
              confidence <Badge value={f.ai_confidence} />
            </span>
          )}
        </div>

        {steps.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-ink/60">How to fix</p>
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

  const load = useCallback(async () => {
    try {
      setReviews(await api(`/findings/${findingId}/reviews`));
    } catch (e) {
      setError(e.message);
    }
  }, [findingId, setError]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    try {
      await api(`/findings/${findingId}/reviews`, { method: 'POST', body: { decision, remarks } });
      setRemarks('');
      await load();
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <select className={`${inputCls} !w-auto`} value={decision} onChange={(e) => setDecision(e.target.value)}>
          {DECISIONS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <input className={`${inputCls} flex-1`} placeholder="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
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
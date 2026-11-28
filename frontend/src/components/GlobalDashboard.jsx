
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, ErrorMsg } from './ui.jsx';

export default function GlobalDashboard() {
  const [assessments, setAssessments] = useState([]);
  const [findings, setFindings] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    Promise.all([
      api('/assessments'),
      api('/findings'),
      api('/scans'),
    ])
      .then(([a, f, s]) => {
        if (!alive) return;
        setAssessments(a);
        setFindings(f);
        setScans(s);
      })
      .catch(err => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!scans.some(scan => ['queued','running'].includes(scan.status))) return;
    const timer = window.setInterval(() => Promise.all([api('/assessments'),api('/findings'),api('/scans')]).then(([a,f,s])=>{setAssessments(a);setFindings(f);setScans(s)}).catch(()=>{}), 3000);
    return () => window.clearInterval(timer);
  }, [scans]);


  const countAssessments = status =>
    assessments.filter(a => a.status === status).length;

  const countFindings = status =>
    findings.filter(f => f.status === status).length;

  const severities = [
    ['critical', 'Critical'],
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
    ['info', 'Informational'],
  ];

  if (loading) {
    return <div className="notice">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <ErrorMsg message={error} />

      <div className="summary-strip">
        <Summary
          label="Total assessments"
          value={assessments.length}
          detail="Registered assessments"
        />
        <Summary
          label="Completed"
          value={countAssessments('completed')}
          detail="Finished assessments"
        />
        <Summary
          label="Total findings"
          value={findings.length}
          detail="Across all assessments"
        />
        <Summary
          label="Pending verification"
          value={countFindings('open')}
          detail="Awaiting assessor review"
        />
      </div>

      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Findings by severity</h2>
              <p>Severity distribution across all assessments.</p>
            </div>
          </div>

          <div className="severity-list">
            {severities.map(([key, label]) => {
              const count = findings.filter(
                f => f.severity === key
              ).length;

              return (
                <div className="severity-row" key={key}>
                  <span className={`severity-dot sev-${key}`} />
                  <span className="severity-name">{label}</span>
                  <strong>{count}</strong>
                  <div className="severity-track">
                    <i
                      style={{
                        width: `${
                          findings.length
                            ? count / findings.length * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Verification progress</h2>
              <p>Human assessor decisions across all findings.</p>
            </div>
          </div>

          <div className="verification-summary">
            <div>
              <strong>{countFindings('open')}</strong>
              <span>Pending review</span>
            </div>
            <div>
              <strong>{countFindings('confirmed')}</strong>
              <span>Confirmed</span>
            </div>
            <div>
              <strong>{countFindings('false_positive')}</strong>
              <span>Rejected</span>
            </div>
          </div>

          <div className="workflow-note">
            <b>Human verification required</b>
            <p>
              AI analysis is advisory. Only findings confirmed
              by an assessor are included in final reports.
            </p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent assessments</h2>
            <p>Latest registered security assessments.</p>
          </div>
          <span className="record-count">
            {assessments.length} assessments
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Status</th>
                <th>Created by</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {assessments.slice(0, 8).map(a => (
                <tr key={a.id}>
                  <td className="primary-cell">{a.name}</td>
                  <td><Badge value={a.status} /></td>
                  <td>{a.created_by_name || '—'}</td>
                  <td>
                    {a.created_at
                      ? new Date(a.created_at).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}

              {!assessments.length && (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    No assessments have been created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ScanActivity scans={scans} />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent findings</h2>
            <p>Latest vulnerability observations across assessments.</p>
          </div>
          <span className="record-count">
            {findings.length} findings
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Finding</th>
                <th>Severity</th>
                <th>Verification</th>
                <th>Detected</th>
              </tr>
            </thead>
            <tbody>
              {findings.slice(0, 8).map(f => (
                <tr key={f.id}>
                  <td className="primary-cell">{f.title}</td>
                  <td>
                    <Badge kind="severity" value={f.severity} />
                  </td>
                  <td><Badge value={f.status} /></td>
                  <td>
                    {f.created_at
                      ? new Date(f.created_at).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}

              {!findings.length && (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    No findings have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value, detail }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ScanActivity({scans}){const [expanded,setExpanded]=useState(null),[details,setDetails]=useState({}),[error,setError]=useState('');async function load(id){try{const data=await api(`/scans/${id}/details`);setDetails(prev=>({...prev,[id]:data}));setError('')}catch(e){setError(e.message)}}async function toggle(id){if(expanded===id){setExpanded(null);return}setExpanded(id);await load(id)}useEffect(()=>{if(!expanded||!scans.some(s=>s.id===expanded&&['queued','running'].includes(s.status)))return;const timer=window.setInterval(()=>load(expanded),3000);return()=>window.clearInterval(timer)},[expanded,scans]);return <section className="panel"><div className="panel-heading"><div><h2>Scan Activity</h2><p>Live scan statuses with per-tool logs and raw output.</p></div><span className="record-count">{scans.length} scan runs</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Scan</th><th>Target</th><th>Status</th><th>Timing</th></tr></thead><tbody>{scans.slice(0,10).map(scan=><tr key={scan.id}><td className="primary-cell">#{scan.id} · {scan.scanner_type}<button className="text-button block" onClick={()=>toggle(scan.id)}>{expanded===scan.id?'Hide details':'Details'}</button></td><td className="break-all">{scan.target_url}</td><td><Badge value={scan.status}/></td><td>{scan.started_at?new Date(scan.started_at).toLocaleString():'Not started'}{scan.duration_ms!=null&&<small className="block">{scan.duration_ms} ms</small>}</td></tr>)}</tbody></table></div>{expanded&&<div className="border-t border-line p-3 text-sm space-y-2"><strong>Execution details for Scan #{expanded}</strong>{error&&<p className="text-red-600">{error}</p>}{details[expanded]?.tool_runs?.map(run=><div className="border border-line p-2 space-y-1" key={run.id}><div className="flex gap-2"><b>{run.tool_name}</b><Badge value={run.status}/></div><p>Version: {run.tool_version||'Not recorded'} · Duration: {run.duration_ms??'—'} ms</p><p>Progress: {run.progress_pct??0}% · Config: {run.command_config||'Not recorded'}</p>{run.error_message&&<p className="text-red-600">{run.error_message}</p>}{run.stdout_text&&<details><summary>Output</summary><pre className="whitespace-pre-wrap max-h-40 overflow-auto">{run.stdout_text}</pre></details>}{run.stderr_text&&<details><summary>Error output</summary><pre className="whitespace-pre-wrap max-h-40 overflow-auto">{run.stderr_text}</pre></details>}{run.parsed_results&&<details><summary>Parsed results</summary><pre className="whitespace-pre-wrap max-h-40 overflow-auto">{run.parsed_results}</pre></details>}</div>)}</div>}</section>}

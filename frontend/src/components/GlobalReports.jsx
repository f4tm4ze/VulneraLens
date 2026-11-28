import { useEffect, useState } from 'react';
import { api, downloadReport } from '../api.js';
import { Badge, ErrorMsg } from './ui.jsx';
export default function GlobalReports(){
 const [assessments,setAssessments]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(null);
 useEffect(()=>{api('/reports').then(setAssessments).catch(e=>setError(e.message))},[]);
 async function exportPdf(a){setBusy(a.assessment_id);try{await downloadReport(a.assessment_id)}catch(e){setError(e.message)}finally{setBusy(null)}}
 return <div className="space-y-4"><ErrorMsg message={error}/><p className="helper-text">Reports are available globally. PDF exports include confirmed findings from the selected assessment; report content is based on persisted scan data.</p>
 {assessments.map(a=>{return <section className="panel p-4 space-y-3" key={a.assessment_id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{a.assessment_name}</h2><p className="text-xs text-ink/60">Assessment #{a.assessment_id} · {a.created_at?new Date(a.created_at).toLocaleDateString():'Date unavailable'}</p></div><Badge value={a.status}/></div><div className="report-summary"><div><span>Scan runs</span><strong>{a.scan_count}</strong></div><div><span>Total findings</span><strong>{a.finding_count}</strong></div><div><span>Confirmed</span><strong>{a.confirmed_count}</strong></div></div><button className="text-button" disabled={busy===a.assessment_id} onClick={()=>exportPdf(a)}>{busy===a.assessment_id?'Preparing PDF…':'Export confirmed findings PDF'}</button></section>})}
 {!assessments.length&&<div className="panel empty-cell">No active assessments available for reports.</div>}</div>
}

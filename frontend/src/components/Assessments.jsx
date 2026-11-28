import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, btnCls, ErrorMsg, Field, inputCls } from './ui.jsx';
const STATUSES = ['draft', 'in_progress', 'completed'];
export default function Assessments({ user, onOpen }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [archivedView, setArchivedView] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', status: 'draft' });
  const load = useCallback(async () => {
    try { setItems(await api(`/assessments${archivedView ? '?archived=1' : ''}`)); setError(''); }
    catch (e) { setError(e.message); }
  }, [archivedView]);
  useEffect(() => { load(); }, [load]);
  async function create(e) {
    e.preventDefault();
    try {
      await api('/assessments', { method: 'POST', body: form });
      setForm({ name: '', description: '', status: 'draft' });
      await load();
    } catch (e) { setError(e.message); }
  }
  async function archive(a) {
    if (!window.confirm(`Archive "${a.name}"? All assessment data will be retained.`)) return;
    try { await api(`/assessments/${a.id}/archive`, { method: 'POST' }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function restore(a) {
    try { await api(`/assessments/${a.id}/restore`, { method: 'POST' }); await load(); }
    catch (e) { setError(e.message); }
  }
  return <div className="space-y-6">
    <ErrorMsg message={error}/>
    {!archivedView && <form onSubmit={create} className="grid gap-3 border border-line bg-surface p-4 md:grid-cols-4">
      <Field label="Assessment name"><input className={inputCls} value={form.name} minLength={2} required onChange={e=>setForm({...form,name:e.target.value})}/></Field>
      <div className="md:col-span-2"><Field label="Description"><input className={inputCls} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field></div>
      <div className="flex items-end gap-2"><select className={inputCls} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select><button className={btnCls}>Create</button></div>
      <div className="md:col-span-4 text-xs text-ink/60">The only supported target is the configured local DVWA instance. Target assignment is automatic.</div>
    </form>}
    <div className="flex items-center justify-between"><h2 className="font-semibold">{archivedView?'Archived assessments':'Assessments'} <span className="record-count">{items.length}</span></h2><button className="text-button" onClick={()=>setArchivedView(v=>!v)}>{archivedView?'View active assessments':'View archive'}</button></div>
    <div className="panel table-wrap"><table className="data-table"><thead><tr><th>Assessment</th><th>Status</th><th>Created by</th><th>Created</th><th>Action</th></tr></thead><tbody>
      {items.map(a=><tr key={a.id}><td className="primary-cell">{a.name}<div className="text-xs text-ink/50">{a.description || 'DVWA-only assessment'}</div></td><td><Badge value={a.status}/></td><td>{a.created_by_name || user?.name || '—'}</td><td>{a.created_at?new Date(a.created_at).toLocaleDateString():'—'}</td><td className="flex gap-2">{!archivedView&&<button className="text-button" onClick={()=>onOpen(a)}>Open</button>}{archivedView?<button className="text-button" onClick={()=>restore(a)}>Restore</button>:<button className="text-button" onClick={()=>archive(a)}>Archive</button>}</td></tr>)}
      {!items.length&&<tr><td colSpan="5" className="empty-cell">{archivedView?'No archived assessments.':'No assessments created yet.'}</td></tr>}
    </tbody></table></div>
  </div>;
}

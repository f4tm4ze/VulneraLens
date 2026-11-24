import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, btnCls, ErrorMsg, Field, inputCls } from './ui.jsx';

const STATUSES = ['draft', 'in_progress', 'completed', 'archived'];

export default function Assessments({ user, onOpen }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', status: 'draft' });

  const load = useCallback(async () => {
    try {
      setItems(await api('/assessments'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    try {
      await api('/assessments', { method: 'POST', body: form });
      setForm({ name: '', description: '', status: 'draft' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(a) {
    if (!window.confirm(`Delete "${a.name}" and all its targets, scans and findings?`)) return;
    try {
      await api(`/assessments/${a.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <ErrorMsg message={error} />

      <form onSubmit={create} className="grid gap-4 border border-line bg-surface p-4 md:grid-cols-4">
        <Field label="Name">
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <div className="flex items-end gap-2">
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className={btnCls}>Create</button>
        </div>
      </form>

      <table className="w-full border border-line text-left text-sm">
        <thead className="bg-surface">
          <tr>
            {['Name', 'Status', 'Created by', 'Created', ''].map((h) => (
              <th key={h} className="border-b border-line px-4 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-4 text-ink/60">No assessments yet.</td></tr>
          )}
          {items.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-b-0">
              <td className="px-4 py-2">
                <button className="text-accent underline" onClick={() => onOpen(a)}>{a.name}</button>
              </td>
              <td className="px-4 py-2"><Badge value={a.status} /></td>
              <td className="px-4 py-2">{a.created_by_name}</td>
              <td className="px-4 py-2">{new Date(a.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-2 text-right">
                {user.role === 'administrator' && (
                  <button className="text-red-700 underline" onClick={() => remove(a)}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

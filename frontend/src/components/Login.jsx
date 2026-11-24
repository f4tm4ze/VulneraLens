import { useState } from 'react';
import { api, setToken } from '../api.js';
import { btnCls, ErrorMsg, Field, inputCls } from './ui.jsx';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: form });
      }
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email: form.email, password: form.password },
      });
      setToken(data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 border border-line bg-surface p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Vulnera<span className="text-accent">Lens</span>
          </h1>
          <p className="text-sm text-ink/70">
            {mode === 'login' ? 'Sign in to continue' : 'Create an assessor account'}
          </p>
        </div>
        {mode === 'register' && (
          <Field label="Name">
            <input className={inputCls} value={form.name} onChange={set('name')} required minLength={2} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" className={inputCls} value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Password">
          <input
            type="password"
            className={inputCls}
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
          />
        </Field>
        <ErrorMsg message={error} />
        <button className={`${btnCls} w-full`} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register & sign in'}
        </button>
        <button
          type="button"
          className="w-full text-sm text-accent underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}

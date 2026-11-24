import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './components/Login.jsx';
import Assessments from './components/Assessments.jsx';
import AssessmentDetail from './components/AssessmentDetail.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setSelected(null);
    };
    window.addEventListener('vl-logout', onLogout);
    return () => window.removeEventListener('vl-logout', onLogout);
  }, []);

  function logout() {
    setToken(null);
    setUser(null);
    setSelected(null);
  }

  if (loading) return <p className="p-6 text-sm">Loading…</p>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Vulnera<span className="text-accent">Lens</span>
            </h1>
            <p className="text-sm text-ink/70">AI-Assisted Web Application Security Assessment Platform</p>
          </div>
          <div className="text-right text-sm">
            <p>{user.name} <span className="text-ink/60">({user.role})</span></p>
            <button className="text-accent underline" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {selected ? (
          <AssessmentDetail assessment={selected} onBack={() => setSelected(null)} />
        ) : (
          <Assessments user={user} onOpen={setSelected} />
        )}
      </main>
    </div>
  );
}

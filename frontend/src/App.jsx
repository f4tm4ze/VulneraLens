
import GlobalDashboard from './components/GlobalDashboard.jsx';
import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './components/Login.jsx';
import Assessments from './components/Assessments.jsx';
import AssessmentDetail from './components/AssessmentDetail.jsx';
import GlobalFindings from './components/GlobalFindings.jsx';
import GlobalReports from './components/GlobalReports.jsx';
import TrafficHistory from './components/TrafficHistory.jsx';

const NAV = [
  {
    label: 'Assessment',
    items: [
      ['dashboard', 'Dashboard', '▦'],
      ['assessments', 'Assessments', '▤'],
      ['findings', 'Findings', '⚑'],
      ['reports', 'Reports', '▧'],
      ['traffic', 'Traffic History', '↔'],
    ],
  },
  {
    label: 'Administration',
    items: [
      ['users', 'Users', '♙'],
      ['audit', 'Audit Log', '≡'],
    ],
  },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [selected, setSelected] = useState(null);
  const [section, setSection] = useState('dashboard');

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

  function navigate(key) {
    setSection(key);

    if (
      ['assessments', 'dashboard', 'findings', 'reports', 'traffic', 'users', 'audit'].includes(key)
    ) {
      setSelected(null);
    }
  }

  if (loading) return <div className="loading-screen">Loading VulneraLens…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const activeSection = NAV.flatMap(g => g.items)
    .find(i => i[0] === section);

  const isAssessmentView = Boolean(selected) &&
    ['overview', 'assessment-scans', 'assessment-findings', 'assessment-reports'].includes(section);

  const pageTitle = isAssessmentView
    ? ({
        overview: 'Overview',
        'assessment-scans': 'Scan Activity',
        'assessment-findings': 'Assessment Findings',
        'assessment-reports': 'Assessment Reports',
      }[section])
    : activeSection?.[1] || 'Dashboard';

  const adminOnly = ['users', 'audit'].includes(section);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div>
            <div className="brand-name">
              Vulnera<span>Lens</span>
            </div>
            <div className="brand-caption">SECURITY ASSESSMENT</div>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav aria-label="Main navigation" className="side-nav">
          {NAV.map(group => (
            <div className="nav-group" key={group.label}>
              <div className="nav-heading">{group.label}</div>

              {group.items.map(([key, label, icon]) => {
                const disabled =
                  ['users', 'audit'].includes(key) &&
                  user.role !== 'administrator';

                return (
                  <button
                    key={key}
                    className={`nav-link ${
                      section === key ||
                      (isAssessmentView && key === 'assessments')
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => navigate(key)}
                    disabled={disabled}
                    title={disabled ? 'Administrator access required' : undefined}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {icon}
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="scope-note">
            <span className="scope-dot" /> Local assessment workspace
          </div>

          <div className="profile">
            <div className="avatar">
              {(user.name || 'U').slice(0, 1).toUpperCase()}
            </div>

            <div className="profile-info">
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>

            <button
              className="signout"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
            >
              ↗
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>VulneraLens</span>

            {isAssessmentView ? (
              <>
                <span className="crumb-sep">/</span>
                <span>Assessment</span>
                <span className="crumb-sep">/</span>
                <strong>{selected?.name}</strong>
              </>
            ) : (
              <>
                <span className="crumb-sep">/</span>
                <strong>{pageTitle}</strong>
              </>
            )}
          </div>

          <div className="topbar-right">
            <span className="environment">
              <i /> Authorized testing only
            </span>
            <span className="topbar-user">{user.name}</span>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {isAssessmentView
                  ? 'ASSESSMENT WORKSPACE'
                  : 'SECURITY OPERATIONS'}
              </p>

              <h1>{pageTitle}</h1>

              <p className="page-description">
                {isAssessmentView
                  ? `Assessment workspace for ${selected?.name}.`
                  : ({
                      dashboard: 'Overview of all security assessments and verification activity.',
                      assessments: 'Create and manage security assessment engagements.',
                      findings: 'Browse findings, evidence, reproduction guidance, and verification status across assessments.',
                      reports: 'View assessment summaries and export confirmed findings globally.',
                      traffic: 'Review HTTP requests and responses captured by the ZAP proxy.',
                      users: 'Manage platform accounts and access roles.',
                      audit: 'Review recorded AI analysis and assessor decisions.',
                    }[section] || '')}
              </p>
            </div>

            {isAssessmentView && (
              <div className="flex flex-wrap gap-2">
                <button className="text-button" onClick={() => setSection('overview')}>
                  Overview
                </button>
                <button className="text-button" onClick={() => setSection('assessment-scans')}>
                  Scan Activity
                </button>
                <button className="text-button" onClick={() => setSection('assessment-findings')}>
                  Findings
                </button>
                <button className="text-button" onClick={() => setSection('assessment-reports')}>
                  Reports
                </button>
                <button className="text-button" onClick={() => navigate('assessments')}>
                  All assessments ↗
                </button>
              </div>
            )}
          </div>

          {adminOnly && user.role !== 'administrator' ? (
            <div className="notice">
              Administrator access is required to view this section.
            </div>
          ) : section === 'users' || section === 'audit' ? (
            <Administration section={section} />
          ) : section === 'dashboard' ? (
            <GlobalDashboard />
          ) : section === 'findings' ? (
    <GlobalFindings />
  ) : section === 'reports' ? (
    <GlobalReports />
  ) : section === 'traffic' ? (
    <TrafficHistory />
  ) : section === 'assessments' ? (
    <Assessments
      user={user}
      onOpen={(a) => {
        setSelected(a);
        setSection('overview');
      }}
    />
  ) : selected ? (
    <AssessmentDetail
      assessment={selected}
      section={section}
    />
  ) : (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>Select an assessment first</h2>
          <p>
            This section contains assessment-specific information.
            Open an assessment to continue.
          </p>
        </div>

        <button
          className="text-button"
          onClick={() => navigate('assessments')}
        >
          View assessments ↗
        </button>
      </div>
    </div>
  )}
        </div>
      </main>
    </div>
  );
}

function Administration({ section }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    api(section === 'users' ? '/admin/users' : '/admin/audit-log')
      .then(data => {
        if (alive) setRows(data);
      })
      .catch(e => {
        if (alive) setError(e.message);
      });

    return () => {
      alive = false;
    };
  }, [section]);

  if (error) return <div className="notice notice-warning">{error}</div>;

  if (section === 'users') {
    return (
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Platform users</h2>
            <p>Accounts with access to this assessment workspace.</p>
          </div>
          <span className="record-count">{rows.length} accounts</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id}>
                  <td className="primary-cell">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className="role-label">{u.role}</span>
                  </td>
                  <td>
                    {u.created_at
                      ? new Date(u.created_at).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    No user records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Audit activity</h2>
          <p>Recorded AI analysis requests and human verification decisions.</p>
        </div>
        <span className="record-count">{rows.length} events</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Activity</th>
              <th>Finding</th>
              <th>Actor</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.event_type}-${r.id}-${i}`}>
                <td>{r.event_at ? new Date(r.event_at).toLocaleString() : '—'}</td>
                <td>{r.event_type}</td>
                <td>{r.finding_title || `#${r.finding_id}`}</td>
                <td>{r.actor_name || 'System'}</td>
                <td>{r.details || '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan="5" className="empty-cell">
                  No recorded activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

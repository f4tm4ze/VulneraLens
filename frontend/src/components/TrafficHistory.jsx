import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const display = (value) => {
  if (value === null || value === undefined || value === '') return 'Not available';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
};

export default function TrafficHistory() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await api('/zap-history?start=0&count=500');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err) {
      setError(err.message || 'Failed to load traffic history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;

    return messages.filter((m) =>
      [
        m.url,
        m.method,
        m.statusCode,
        m.responseHeader,
        m.requestHeader,
        m.requestBody,
        m.responseBody,
      ]
        .map(display)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [messages, search]);

  return (
    <div className="traffic-history">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>HTTP Traffic History</h2>
            <p>Requests and responses captured by the ZAP proxy.</p>
          </div>

          <button className="text-button" onClick={loadHistory} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center mb-4">
          <input
            type="search"
            placeholder="Search URL, method, status, or content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
          <span className="record-count">
            {filtered.length} of {messages.length} requests
          </span>
        </div>

        {error && (
          <div className="notice notice-warning">
            {error}
            <button className="text-button" onClick={loadHistory}>
              Retry
            </button>
          </div>
        )}

        {loading && messages.length === 0 ? (
          <div className="notice">Loading traffic history…</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, index) => (
                  <tr key={m.id ?? index}>
                    <td className="primary-cell">{m.method || '—'}</td>
                    <td style={{ maxWidth: 420, wordBreak: 'break-word' }}>
                      {m.url || '—'}
                    </td>
                    <td>{m.statusCode ?? m.status ?? '—'}</td>
                    <td>
                      {m.timestamp
                        ? new Date(Number(m.timestamp)).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(m)}
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && !loading && (
                  <tr>
                    <td colSpan="5" className="empty-cell">
                      {messages.length
                        ? 'No matching traffic found.'
                        : 'No HTTP traffic captured yet. Browse your authorized test site through the ZAP proxy first.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="panel traffic-detail">
          <div className="panel-heading">
            <div>
              <h2>Traffic Details</h2>
              <p>{selected.method || 'HTTP'} · {selected.url || 'Unknown URL'}</p>
            </div>
            <button className="text-button" onClick={() => setSelected(null)}>
              Close ✕
            </button>
          </div>

          <h3>Request Headers</h3>
          <pre className="traffic-pre">{display(selected.requestHeader)}</pre>

          <h3>Request Body</h3>
          <pre className="traffic-pre">{display(selected.requestBody)}</pre>

          <h3>Response Status</h3>
          <pre className="traffic-pre">
            {display(selected.statusCode ?? selected.status)}
          </pre>

          <h3>Response Headers</h3>
          <pre className="traffic-pre">{display(selected.responseHeader)}</pre>

          <h3>Response Body</h3>
          <pre className="traffic-pre">{display(selected.responseBody)}</pre>
        </section>
      )}
    </div>
  );
}
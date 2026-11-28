
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, btnCls, ErrorMsg, Field, inputCls } from './ui.jsx';

const TYPES = ['web_app', 'api', 'network', 'host'];

export default function Targets() {
  const [targets, setTargets] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    target_url: '',
    target_type: 'web_app',
    authorized: false,
  });

  const load = useCallback(async () => {
    try {
      setTargets(await api('/targets'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function register(e) {
    e.preventDefault();

    if (!form.authorized) {
      setError('You must confirm that you are authorized to test this target.');
      return;
    }

    try {
      await api('/targets', {
        method: 'POST',
        body: form,
      });

      setForm({
        target_url: '',
        target_type: 'web_app',
        authorized: false,
      });

      setError('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <ErrorMsg message={error} />

      <form
        onSubmit={register}
        className="space-y-4 border border-line bg-surface p-4"
      >
        <div>
          <h2 className="font-semibold">Register Target</h2>
          <p className="mt-1 text-sm text-ink/60">
            Add an authorized asset to your testing workspace.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Field label="Target URL or Address">
              <input
                className={inputCls}
                value={form.target_url}
                onChange={(e) =>
                  setForm({ ...form, target_url: e.target.value })
                }
                placeholder="http://127.0.0.1:8080"
                required
              />
            </Field>
          </div>

          <Field label="Target Type">
            <select
              className={inputCls}
              value={form.target_type}
              onChange={(e) =>
                setForm({ ...form, target_type: e.target.value })
              }
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.authorized}
            onChange={(e) =>
              setForm({ ...form, authorized: e.target.checked })
            }
            required
          />
          <span>
            I confirm that I have permission to perform security testing
            on this target.
          </span>
        </label>

        <button className={btnCls}>
          Register Target
        </button>

        <p className="text-xs text-ink/60">
          Only localhost and 127.0.0.1 targets are currently permitted.
        </p>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Registered Targets</h2>
          <span className="text-sm text-ink/60">
            {targets.length} targets
          </span>
        </div>

        <div className="border border-line">
          {loading ? (
            <p className="p-4 text-sm text-ink/60">Loading targets...</p>
          ) : targets.length === 0 ? (
            <p className="p-4 text-sm text-ink/60">
              No registered targets yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="border-b border-line px-4 py-3">Target</th>
                  <th className="border-b border-line px-4 py-3">Type</th>
                  <th className="border-b border-line px-4 py-3">Authorization</th>
                  <th className="border-b border-line px-4 py-3">Registered</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {target.target_url}
                    </td>
                    <td className="px-4 py-3">
                      {target.target_type}
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={target.authorized ? 'Authorized' : 'Not authorized'} />
                    </td>
                    <td className="px-4 py-3">
                      {target.created_at
                        ? new Date(target.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export const inputCls =
  'w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent';
export const btnCls =
  'border border-accent bg-accent px-3 py-1.5 text-sm text-canvas hover:opacity-90 disabled:opacity-50';
export const btnGhostCls =
  'border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent hover:text-canvas disabled:opacity-50';

export function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function ErrorMsg({ message }) {
  return message ? (
    <p role="alert" className="border border-red-700 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

const SEV = {
  critical: 'bg-red-800 text-white',
  high: 'bg-red-600 text-white',
  medium: 'bg-amber-500 text-black',
  low: 'bg-yellow-200 text-black',
  info: 'bg-surface text-ink',
};
export function Badge({ value, kind }) {
  const cls = kind === 'severity' ? SEV[value] : 'bg-surface text-ink';
  return <span className={`inline-block px-2 py-0.5 text-xs font-semibold ${cls}`}>{value}</span>;
}

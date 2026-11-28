const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only these hosts may be registered as targets (matches the proposal's scope).
// Override in backend/.env: ALLOWED_TARGET_HOSTS=localhost,127.0.0.1
const ALLOWED_HOSTS = (process.env.ALLOWED_TARGET_HOSTS || 'dvwa,localhost,127.0.0.1')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 150 && EMAIL_REGEX.test(email.trim());
}

export function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

export function isValidTargetUrl(rawUrl) {
  return checkTargetScope(rawUrl).ok;
}

export function checkTargetScope(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length > 500) {
    return { ok: false, error: 'Invalid target URL' };
  }
  try {
    const parsed = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: 'Only http/https protocols are allowed' };
    }
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.includes(host)) {
      return { ok: false, error: `Host "${host}" is outside allowed scope (${ALLOWED_HOSTS.join(', ')})` };
    }
    return {
      ok: true,
      host,
      port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
      url: parsed.toString(),
    };
  } catch {
    return { ok: false, error: 'Malformed target URL' };
  }
}
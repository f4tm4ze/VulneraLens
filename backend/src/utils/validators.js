const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 150 && EMAIL_REGEX.test(email.trim());
}

export function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

export function isValidTargetUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length > 500) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();
    // Block cloud metadata, link-local and unspecified addresses
    if (
      host === '0.0.0.0' ||
      host === '[::]' ||
      host === 'metadata.google.internal' ||
      host.startsWith('169.254.')
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

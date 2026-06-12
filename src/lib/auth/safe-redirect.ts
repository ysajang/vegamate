/**
 * Validate a user-supplied post-auth redirect target.
 *
 * Open redirect is OWASP A03 (Injection). The `next` param is attacker-
 * controllable, so we follow the OWASP cheat-sheet rules: prefer a server-
 * mapped path, otherwise allow ONLY same-origin relative paths and reject
 * every known bypass — protocol-relative (`//`, `/\`), embedded schemes
 * (`/javascript:`...), and normalization tricks (`https:///host`, which
 * urlparse-style parsers treat as relative but the browser normalizes to an
 * absolute URL).
 *
 * Returns a guaranteed-safe relative path, or `fallback` when the input is
 * missing or fails any check (fail closed).
 */
export function safeNextPath(next: string | null | undefined, fallback = '/select'): string {
  if (!next || typeof next !== 'string') return fallback;

  let url = next.trim();

  // Decode percent-encoding so encoded payloads (e.g. %2F%2Fevil.com) are
  // evaluated as their decoded form. Bail if decoding throws (malformed).
  try {
    // Decode repeatedly to defeat double-encoding, capped to avoid loops.
    for (let i = 0; i < 3; i++) {
      const decoded = decodeURIComponent(url);
      if (decoded === url) break;
      url = decoded;
    }
  } catch {
    return fallback;
  }

  url = url.trim();

  // Must be a path rooted at '/', and not a scheme/host.
  if (!url.startsWith('/')) return fallback;

  // Protocol-relative: '//host' or '/\host' (browsers treat '\' as '/').
  if (url.startsWith('//') || url.startsWith('/\\')) return fallback;

  // Scheme smuggled into the path, e.g. '/javascript:alert(1)' or '/data:...'.
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(url)) return fallback;

  // Backslashes anywhere can be re-interpreted by the browser as '/'.
  if (url.includes('\\')) return fallback;

  // Control chars / whitespace that can break out of the path.
  if (/[\x00-\x1f\x7f]/.test(url)) return fallback;

  return url;
}

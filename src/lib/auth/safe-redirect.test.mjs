/**
 * Regression tests for safeNextPath — open-redirect guard for the post-auth
 * `next` param. Payloads drawn from OWASP / Hackviser open-redirect bypass
 * lists. Run: node --test src/lib/auth/safe-redirect.test.mjs
 *
 * Mirrors safe-redirect.ts (keep in sync) — the .ts can't import outside the
 * app runtime, but the rule set is the thing that regresses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

function safeNextPath(next, fallback = '/select') {
  if (!next || typeof next !== 'string') return fallback;
  let url = next.trim();
  try {
    for (let i = 0; i < 3; i++) {
      const decoded = decodeURIComponent(url);
      if (decoded === url) break;
      url = decoded;
    }
  } catch {
    return fallback;
  }
  url = url.trim();
  if (!url.startsWith('/')) return fallback;
  if (url.startsWith('//') || url.startsWith('/\\')) return fallback;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(url)) return fallback;
  if (url.includes('\\')) return fallback;
  if (/[\x00-\x1f\x7f]/.test(url)) return fallback;
  return url;
}

test('legit internal paths pass through', () => {
  assert.equal(safeNextPath('/chat/abc'), '/chat/abc');
  assert.equal(safeNextPath('/select'), '/select');
  assert.equal(safeNextPath('/gallery?tab=2'), '/gallery?tab=2');
});

test('missing/empty → fallback', () => {
  assert.equal(safeNextPath(null), '/select');
  assert.equal(safeNextPath(''), '/select');
  assert.equal(safeNextPath(undefined), '/select');
  assert.equal(safeNextPath('   '), '/select');
});

test('absolute & protocol-relative URLs → blocked', () => {
  assert.equal(safeNextPath('https://evil.com'), '/select');
  assert.equal(safeNextPath('http://evil.com'), '/select');
  assert.equal(safeNextPath('//evil.com'), '/select');
  assert.equal(safeNextPath('///evil.com'), '/select');
  assert.equal(safeNextPath('/\\evil.com'), '/select');   // backslash variant
  assert.equal(safeNextPath('evil.com'), '/select');      // no leading slash
});

test('scheme smuggled into path → blocked', () => {
  assert.equal(safeNextPath('/javascript:alert(1)'), '/select');
  assert.equal(safeNextPath('/data:text/html,<script>'), '/select');
});

test('encoded bypass payloads → blocked after decode', () => {
  assert.equal(safeNextPath('%2F%2Fevil.com'), '/select');       // //evil.com
  assert.equal(safeNextPath('%2f%2fevil.com'), '/select');
  assert.equal(safeNextPath('/%5Cevil.com'), '/select');         // /\evil.com
  assert.equal(safeNextPath('%2Fjavascript:alert(1)'), '/select');
});

test('control chars / whitespace breakouts → blocked', () => {
  assert.equal(safeNextPath('/foo\nhttp://evil'), '/select');
  assert.equal(safeNextPath('/foo\t/bar'), '/select');
});

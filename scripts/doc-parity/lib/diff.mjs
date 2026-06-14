/**
 * Minimal line-level diff helpers for parity-gate failure output. ASCII only
 * (CI logs + avoiding any non-ASCII glyph surprises).
 */

/** Normalize CRLF -> LF and ensure exactly one trailing newline. */
export function normalize(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
}

/** Returns a human-readable list of the first differing lines, or '' if equal. */
export function lineDiff(expected, actual, max = 25) {
  const e = normalize(expected).split('\n');
  const a = normalize(actual).split('\n');
  const n = Math.max(e.length, a.length);
  const out = [];
  for (let i = 0; i < n && out.length < max; i++) {
    if (e[i] !== a[i]) {
      out.push(`  line ${i + 1}:`);
      out.push(`    expected: ${JSON.stringify(e[i] ?? '<EOF>')}`);
      out.push(`    actual:   ${JSON.stringify(a[i] ?? '<EOF>')}`);
    }
  }
  if (n > 0 && out.length >= max) out.push('  ... (truncated)');
  return out.join('\n');
}

/** True when two strings are equal after normalization. */
export function equalNormalized(expected, actual) {
  return normalize(expected) === normalize(actual);
}

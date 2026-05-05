/**
 * File-system helpers with atomic + restrictive-permission semantics.
 *
 * Closes CodeQL js/insecure-temporary-file + js/file-system-race findings on
 * the memory adapters and compaction routines. The flagged patterns were:
 *   - existsSync(p) → writeFileSync(p, ...)  (TOCTOU race)
 *   - writeFileSync(p, ...) where p is dataflow-traced from os.tmpdir()
 *
 * Both are addressed by atomic create (flag:'wx') with mode 0o600.
 */
import {
  closeSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';

/**
 * Create a file ONLY if it doesn't already exist. Atomic, no TOCTOU.
 * Mode 0o600 — readable/writable by owner only. No-op if file exists.
 *
 * Use for "initialize this file once if missing" patterns previously written
 * as `if (!existsSync(p)) writeFileSync(p, content)`.
 */
export function safeCreateFile(path: string, content: string): void {
  try {
    writeFileSync(path, content, { flag: 'wx', mode: 0o600, encoding: 'utf8' });
  } catch (err) {
    // Already exists — fine. Not our problem.
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return;
    throw err;
  }
}

/**
 * Atomically replace a file's content via temp-write + rename.
 * Mode 0o600 on the temp file. The rename is atomic on POSIX, so readers
 * see either the old or the new content, never partial / torn.
 *
 * Use for "overwrite this file with new content" patterns previously written
 * as `writeFileSync(p, content, 'utf8')` where consumers assume in-place
 * update semantics.
 */
export function atomicWriteFile(path: string, content: string): void {
  const suffix = randomBytes(6).toString('hex');
  const tmp = `${path}.${process.pid}.${suffix}.tmp`;
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, content, 0, 'utf8');
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, path);
  } catch (err) {
    // Best-effort cleanup; rethrow original error.
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

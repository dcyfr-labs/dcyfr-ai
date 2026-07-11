/**
 * Tests for resolveLogRoot
 *
 * Guards the delegation log-root resolution order:
 *   explicit constructor option > DCYFR_LOG_DIR env > nearest package.json
 *   > clamped three-up fallback.
 *
 * Regression coverage for the fixed six-`..` walk that escaped the
 * repository and littered `logs/delegation/` dirs across ancestor
 * directories (src vs dist vs node_modules vs worktree layouts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { resolveLogRoot, LOG_DIR_ENV_VAR } from '../resolve-log-root.js';
import { SessionCheckpoint } from '../session-checkpoint.js';
import type { SessionState } from '../../types/agent-capabilities.js';

const makeState = (): SessionState => ({
  status: 'active',
  conversationMessages: [],
  lastActivity: new Date().toISOString(),
});

describe('resolveLogRoot', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dcyfr-log-root-test-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('env override', () => {
    it('DCYFR_LOG_DIR wins over package-root discovery', () => {
      const envDir = join(tmpDir, 'env-logs');
      vi.stubEnv(LOG_DIR_ENV_VAR, envDir);
      // Caller sits inside a real package (this repo) — env must still win.
      expect(resolveLogRoot(import.meta.url)).toBe(envDir);
    });

    it('ignores an empty / whitespace-only DCYFR_LOG_DIR', () => {
      vi.stubEnv(LOG_DIR_ENV_VAR, '   ');
      const root = resolveLogRoot(import.meta.url);
      expect(root).not.toBe('   ');
      expect(root.endsWith('logs')).toBe(true);
    });
  });

  describe('package-root discovery', () => {
    it('resolves <packageRoot>/logs from a nested module dir', () => {
      // Fake package: <tmp>/pkg/package.json with module at <tmp>/pkg/dist/ai/delegation/
      const pkgRoot = join(tmpDir, 'pkg');
      const nested = join(pkgRoot, 'dist', 'ai', 'delegation');
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(pkgRoot, 'package.json'), '{"name":"fake-pkg"}\n');

      const moduleUrl = pathToFileURL(join(nested, 'session-manager.js')).href;
      expect(resolveLogRoot(moduleUrl)).toBe(join(pkgRoot, 'logs'));
    });

    it('resolves this repo root when called from delegation source', () => {
      const root = resolveLogRoot(import.meta.url);
      // Nearest package.json above packages/ai/delegation/__tests__/ is the repo root.
      expect(existsSync(join(dirname(root), 'package.json'))).toBe(true);
      expect(root).toBe(join(dirname(root), 'logs'));
    });

    it('falls back to three ups when no package.json exists above', () => {
      // tmpdir ancestors have no package.json (unlike the old six-up walk,
      // this is clamped and never escapes past the module's own subtree).
      const nested = join(tmpDir, 'a', 'b', 'c');
      mkdirSync(nested, { recursive: true });

      const moduleUrl = pathToFileURL(join(nested, 'mod.js')).href;
      const root = resolveLogRoot(moduleUrl);
      const thisDir = dirname(fileURLToPath(moduleUrl));
      expect(root).toBe(join(thisDir, '..', '..', '..', 'logs'));
    });
  });

  describe('precedence with constructor options', () => {
    it('explicit config option beats DCYFR_LOG_DIR and package-root discovery', () => {
      const envDir = join(tmpDir, 'env-logs');
      const explicitDir = join(tmpDir, 'explicit-checkpoints');
      vi.stubEnv(LOG_DIR_ENV_VAR, envDir);

      const checkpoint = new SessionCheckpoint(explicitDir);
      checkpoint.create('sess-prec', 'c-prec', makeState(), 'manual', 1);

      // Written under the explicit dir, not under the env override.
      expect(checkpoint.loadLatest('sess-prec')).toBeDefined();
      expect(existsSync(explicitDir)).toBe(true);
      expect(existsSync(join(envDir, 'delegation', 'checkpoints'))).toBe(false);
    });

    it('SessionCheckpoint default lands under DCYFR_LOG_DIR when set', () => {
      const envDir = join(tmpDir, 'env-logs');
      vi.stubEnv(LOG_DIR_ENV_VAR, envDir);

      const checkpoint = new SessionCheckpoint();
      checkpoint.create('sess-env', 'c-env', makeState(), 'manual', 1);

      expect(existsSync(join(envDir, 'delegation', 'checkpoints'))).toBe(true);
    });
  });
});

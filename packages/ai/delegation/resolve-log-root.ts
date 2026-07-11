/**
 * DCYFR Delegation Log-Root Resolver
 * TLP:AMBER - Internal Use Only
 *
 * Resolves the base directory that delegation modules persist logs under
 * (session archives, checkpoints, dashboard reports).
 *
 * Resolution order (explicit constructor options at the call sites always
 * win — they never reach this helper):
 *   1. `DCYFR_LOG_DIR` env var — used verbatim as the log root.
 *   2. `<package-root>/logs`, where the package root is the nearest
 *      directory containing a `package.json` above the calling module.
 *   3. Fallback: `<module-dir>/../../../logs` (three levels up) if no
 *      `package.json` is found before the filesystem root.
 *
 * Why not a fixed `..` walk? The previous implementation walked SIX levels
 * up from `import.meta.url`, which is a pure function of where the module
 * file happens to sit (src `packages/ai/delegation/`, built
 * `dist/ai/delegation/`, installed `node_modules/@dcyfr/ai/dist/ai/…`,
 * git worktrees). In most layouts that escaped the repository entirely and
 * littered `logs/delegation/` directories across ancestor directories.
 * Anchoring on the owning package's `package.json` lands logs at
 * `<packageRoot>/logs/delegation/…` in every layout.
 *
 * @module delegation/resolve-log-root
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/** Environment variable that overrides the resolved log root. */
export const LOG_DIR_ENV_VAR = 'DCYFR_LOG_DIR';

/**
 * Find the nearest ancestor directory (starting at `startDir`, inclusive)
 * that contains a `package.json`. Stops at the filesystem root.
 *
 * @returns The package root, or `null` if none found.
 */
function findPackageRoot(startDir: string): string | null {
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      // Reached the filesystem root without finding a package.json.
      return null;
    }
    current = parent;
  }
}

/**
 * Resolve the log root for a delegation module.
 *
 * @param moduleUrl - The caller's `import.meta.url`.
 * @returns Absolute path to the directory delegation subpaths should be
 *   joined onto (e.g. `join(resolveLogRoot(import.meta.url), 'delegation',
 *   'sessions')`).
 */
export function resolveLogRoot(moduleUrl: string): string {
  const envDir = process.env[LOG_DIR_ENV_VAR]?.trim();
  if (envDir) {
    return envDir;
  }

  const thisDir = dirname(fileURLToPath(moduleUrl));
  const packageRoot = findPackageRoot(thisDir);
  if (packageRoot) {
    return join(packageRoot, 'logs');
  }

  // Clamped fallback: three levels up from the module directory.
  return join(thisDir, '..', '..', '..', 'logs');
}

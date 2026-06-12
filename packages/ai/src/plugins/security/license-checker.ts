/**
 * License Compliance Checker
 *
 * Validates plugin licenses against DCYFR-approved SPDX identifiers using
 * npm-license-checker or by parsing package.json directly.
 *
 * @module plugins/security/license-checker
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LicenseComplianceResult } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Approved & incompatible license lists
// ---------------------------------------------------------------------------

/** SPDX identifiers unconditionally approved for use in DCYFR plugins */
export const APPROVED_LICENSES = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
  'BlueOak-1.0.0',
]);

/** SPDX identifiers that are incompatible with Apache-2.0 workspace */
export const INCOMPATIBLE_LICENSES = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'SSPL-1.0',
  'BUSL-1.1',
]);

// ---------------------------------------------------------------------------
// npm-license-checker output shape
// ---------------------------------------------------------------------------

interface LicenseCheckerEntry {
  licenses?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * SPDX expressions are tiny; the cap bounds the split-regex backtracking on
 * a hostile third-party `licenses` string.
 */
const MAX_SPDX_LENGTH = 1024;

function normaliseSpdx(raw: string): string[] {
  // Handle compound: "MIT AND Apache-2.0" or "(MIT OR Apache-2.0)"
  return raw
    .slice(0, MAX_SPDX_LENGTH)
    .replaceAll(/[()]/g, '')
    .split(/\s+(?:AND|OR)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function analyseDetected(
  detected: string[],
): { incompatible: string[]; unknown: string[]; compliant: boolean } {
  const incompatible: string[] = [];
  const unknown: string[] = [];

  for (const lic of detected) {
    if (INCOMPATIBLE_LICENSES.has(lic)) {
      incompatible.push(lic);
    } else if (!APPROVED_LICENSES.has(lic)) {
      unknown.push(lic);
    }
  }

  const compliant = incompatible.length === 0 && detected.length > 0;
  return { incompatible, unknown, compliant };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function collectFromLicenseChecker(
  pluginPath: string,
  acc: Set<string>,
): Promise<void> {
  const { stdout } = await execFileAsync(
    'npx',
    ['license-checker', '--json', '--production'],
    { cwd: pluginPath },
  );
  const entries: Record<string, LicenseCheckerEntry> = JSON.parse(stdout);
  for (const entry of Object.values(entries)) {
    if (entry.licenses) {
      for (const lic of normaliseSpdx(entry.licenses)) acc.add(lic);
    }
  }
}

function collectFromPackageJson(
  pluginPath: string,
  acc: Set<string>,
): LicenseComplianceResult | undefined {
  const pkgPath = join(pluginPath, 'package.json');
  if (!existsSync(pkgPath)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { license?: string };
  if (pkg.license) {
    for (const lic of normaliseSpdx(pkg.license)) acc.add(lic);
  }
  return undefined;
}

/**
 * Check license compliance for a plugin directory.
 *
 * Tries `npx license-checker --json` first; falls back to reading
 * `package.json` directly when license-checker is unavailable.
 *
 * @param pluginPath Absolute path to the extracted plugin directory
 */
export async function checkLicenses(
  pluginPath: string,
): Promise<LicenseComplianceResult> {
  const allDetected = new Set<string>();

  try {
    await collectFromLicenseChecker(pluginPath, allDetected);
  } catch {
    try {
      collectFromPackageJson(pluginPath, allDetected);
    } catch {
      return {
        success: false,
        compliant: false,
        detected: [],
        incompatible: [],
        unknown: [],
        error: 'Could not parse package.json',
      };
    }
  }

  if (allDetected.size === 0) {
    return {
      success: true,
      compliant: false,
      detected: [],
      incompatible: [],
      unknown: ['UNLICENSED'],
      error: 'No license declared — required for official marketplace submission',
    };
  }

  const detected = [...allDetected];
  const { incompatible, unknown, compliant } = analyseDetected(detected);

  return { success: true, compliant, detected, incompatible, unknown };
}

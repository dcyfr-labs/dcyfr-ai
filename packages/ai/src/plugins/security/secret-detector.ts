/**
 * Secret Detector
 *
 * Checks plugin source code for hardcoded secrets using Gitleaks CLI.
 * Test fixtures in __tests__/fixtures/ are flagged as warnings, not blockers.
 *
 * @module plugins/security/secret-detector
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SecretDetectionResult, SecretLocation } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Gitleaks JSON output shape (subset)
// ---------------------------------------------------------------------------

interface GitleaksFinding {
  RuleID?: string;
  File?: string;
  StartLine?: number;
  Secret?: string;
  Match?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_FIXTURE_PATTERNS = [
  '__tests__/fixtures',
  'test/fixtures',
  'spec/fixtures',
  '__mocks__',
];

function isTestFixture(filePath: string): boolean {
  const normalised = filePath.replaceAll('\\', '/');
  return TEST_FIXTURE_PATTERNS.some((p) => normalised.includes(p));
}

function redact(secret: string): string {
  if (secret.length <= 8) return '******';
  return secret.slice(0, 4) + '****' + secret.slice(-4);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a plugin directory for hardcoded secrets using Gitleaks.
 *
 * @param pluginPath Absolute path to the extracted plugin directory
 */
export async function detectSecrets(
  pluginPath: string,
): Promise<SecretDetectionResult> {
  let gitleaksOutput: GitleaksFinding[] = [];
  let success = true;

  try {
    // --exit-code 0 forces gitleaks to exit 0 even when findings exist,
    // so execFileAsync always resolves. Capture stdout to parse findings.
    const { stdout } = await execFileAsync('gitleaks', [
      'detect',
      '--source',
      pluginPath,
      '--report-format',
      'json',
      '--report-path',
      '/dev/stdout',
      '--no-git',
      '--exit-code',
      '0', // do not exit non-zero on findings so we parse stdout cleanly
    ]);
    if (stdout.trim()) {
      try {
        gitleaksOutput = JSON.parse(stdout) as GitleaksFinding[];
      } catch {
        // Non-JSON output (e.g. error message) — treat as no findings
      }
    }
  } catch (error_) {
    // Gitleaks exits non-zero when findings exist; stdout still contains JSON
    const err = error_ as { stdout?: string; message?: string };
    if (err.stdout) {
      try {
        gitleaksOutput = JSON.parse(err.stdout) as GitleaksFinding[];
      } catch {
        success = false;
        return {
          success: false,
          found: false,
          locations: [],
          error: `Failed to parse Gitleaks output: ${String(error_)}`,
        };
      }
    } else {
      success = false;
      return {
        success: false,
        found: false,
        locations: [],
        error: `Gitleaks execution failed: ${String(error_)}`,
      };
    }
  }

  const locations: SecretLocation[] = gitleaksOutput.map((f) => ({
    file: f.File ?? 'unknown',
    line: f.StartLine ?? 0,
    ruleId: f.RuleID ?? 'unknown',
    redactedMatch: redact(f.Secret ?? f.Match ?? ''),
    inTestFixture: isTestFixture(f.File ?? ''),
  }));

  return {
    success,
    found: locations.length > 0,
    locations,
  };
}

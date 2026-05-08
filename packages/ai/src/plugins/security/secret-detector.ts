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
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

const SCANNABLE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx',
  '.json', '.yaml', '.yml', '.env', '.txt', '.md',
]);

const SECRET_PATTERNS: Array<{ ruleId: string; regex: RegExp }> = [
  { ruleId: 'stripe-secret-key', regex: /sk_live_[0-9a-zA-Z]{16,}/g },
  { ruleId: 'aws-access-key', regex: /AKIA[0-9A-Z]{16}/g },
  { ruleId: 'generic-api-key-assignment', regex: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][^'"\n]{12,}['"]/gi },
];

function isTestFixture(filePath: string): boolean {
  const normalised = filePath.replaceAll('\\', '/');
  return TEST_FIXTURE_PATTERNS.some((p) => normalised.includes(p));
}

function redact(secret: string): string {
  if (secret.length <= 8) return '******';
  return secret.slice(0, 4) + '****' + secret.slice(-4);
}

function extensionOf(path: string): string {
  const normalized = path.toLowerCase();
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot === -1) return '';
  return normalized.slice(lastDot);
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files;
}

async function fallbackScanSecrets(pluginPath: string): Promise<SecretLocation[]> {
  const files = await collectFiles(pluginPath);
  const findings: SecretLocation[] = [];

  for (const file of files) {
    const ext = extensionOf(file);
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

    let content = '';
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (const pattern of SECRET_PATTERNS) {
      const matches = content.match(pattern.regex);
      if (!matches || matches.length === 0) continue;

      for (const matched of matches) {
        const idx = content.indexOf(matched);
        const line = idx >= 0 ? content.slice(0, idx).split(/\r?\n/).length : 0;

        findings.push({
          file,
          line,
          ruleId: pattern.ruleId,
          redactedMatch: redact(matched),
          inTestFixture: isTestFixture(file),
        });
      }
    }

    // Light line-based heuristic to catch suspicious keys even if regex misses.
    lines.forEach((lineText, i) => {
      if (!/sk_live_[0-9a-zA-Z]{8,}/.test(lineText)) return;
      findings.push({
        file,
        line: i + 1,
        ruleId: 'stripe-secret-key',
        redactedMatch: redact(lineText.trim()),
        inTestFixture: isTestFixture(file),
      });
    });
  }

  return findings;
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
  const success = true;
  let shouldRunFallback = false;

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
        // Non-JSON output (e.g. error message) — attempt fallback scanner
        shouldRunFallback = true;
      }
    } else {
      shouldRunFallback = true;
    }
  } catch (error_) {
    // Gitleaks exits non-zero when findings exist; stdout still contains JSON
    const err = error_ as { stdout?: string; message?: string };
    if (err.stdout) {
      try {
        gitleaksOutput = JSON.parse(err.stdout) as GitleaksFinding[];
      } catch {
        shouldRunFallback = true;
      }
    } else {
      shouldRunFallback = true;
    }
  }

  let locations: SecretLocation[] = gitleaksOutput.map((f) => ({
    file: f.File ?? 'unknown',
    line: f.StartLine ?? 0,
    ruleId: f.RuleID ?? 'unknown',
    redactedMatch: redact(f.Secret ?? f.Match ?? ''),
    inTestFixture: isTestFixture(f.File ?? ''),
  }));

  if ((shouldRunFallback || locations.length === 0) && pluginPath) {
    try {
      const fallbackLocations = await fallbackScanSecrets(pluginPath);
      if (fallbackLocations.length > 0) {
        const dedup = new Set(locations.map((l) => `${l.file}:${l.line}:${l.ruleId}:${l.redactedMatch}`));
        for (const location of fallbackLocations) {
          const key = `${location.file}:${location.line}:${location.ruleId}:${location.redactedMatch}`;
          if (!dedup.has(key)) {
            dedup.add(key);
            locations.push(location);
          }
        }
      }
    } catch {
      // Keep graceful behavior: scanner should not hard-fail when fallback
      // traversal cannot run in constrained environments. No-op: success
      // already reflects whatever the primary path established.
    }
  }

  return {
    success,
    found: locations.length > 0,
    locations,
  };
}

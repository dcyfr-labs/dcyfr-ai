/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Plugin Security Scanner Unit Tests
 *
 * Tests for the plugin marketplace security scanning pipeline.
 * CLI tools (syft, grype, gitleaks, clamscan, cosign) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
}));

const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

// Helpers to configure mock behaviour
// IMPORTANT: execFileAsync may be called with optional options arg, so the
// callback may be at different positions. We find it by type.
function mockExecFileSuccess(stdout: string): void {
  (mockExecFile as any).mockImplementation((...args: any[]) => {
    const cb = args.find((a: unknown) => typeof a === 'function') as
      ((err: null, result: { stdout: string; stderr: string }) => void) | undefined;
    cb?.(null, { stdout, stderr: '' });
  });
}

function mockExecFileError(msg: string): void {
  (mockExecFile as any).mockImplementation((...args: any[]) => {
    const cb = args.find((a: unknown) => typeof a === 'function') as
      ((err: Error) => void) | undefined;
    cb?.(new Error(msg));
  });
}

// ---------------------------------------------------------------------------
// Imports under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { calculateTrustScore } from '../src/plugins/security/trust-score';
import { checkLicenses, APPROVED_LICENSES, INCOMPATIBLE_LICENSES } from '../src/plugins/security/license-checker';
import { scanVulnerabilities } from '../src/plugins/security/vulnerability-scanner';
import { generateSBOM } from '../src/plugins/security/sbom-generator';
import { detectSecrets } from '../src/plugins/security/secret-detector';
import { scanMalware } from '../src/plugins/security/malware-scanner';
import { verifySignature } from '../src/plugins/security/signature-verifier';
import { scanPlugin } from '../src/plugins/security/plugin-security-scanner';
import type {
  VulnerabilityScanResult,
  SecretDetectionResult,
  MalwareScanResult,
  CodeQualityResult,
  SBOMResult,
  SignatureVerificationResult,
  LicenseComplianceResult,
} from '../src/plugins/security/types';

// ---------------------------------------------------------------------------
// Trust Score
// ---------------------------------------------------------------------------

describe('calculateTrustScore', () => {
  const baseVulns: VulnerabilityScanResult = {
    success: true,
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 },
    findings: [],
    recommendation: 'approve',
  };
  const baseSecrets: SecretDetectionResult = { success: true, found: false, locations: [] };
  const baseMalware: MalwareScanResult = {
    success: true, detected: false, signatures: [], suspiciousPatterns: [],
  };
  const baseCQ: CodeQualityResult = { success: true, requiresManualReview: false, qualityGate: 'OK' };
  const baseSBOM: SBOMResult = {
    success: true, usedFallback: false, format: 'cyclonedx',
    components: [{ name: 'lodash', version: '4.17.21', ecosystem: 'npm' }],
  };
  const baseSig: SignatureVerificationResult = { success: true, verified: true };
  const baseLicense: LicenseComplianceResult = {
    success: true, compliant: true, detected: ['MIT'], incompatible: [], unknown: [],
  };

  it('returns 100% recommendation "approve" for a clean plugin', () => {
    const result = calculateTrustScore({
      vulns: baseVulns,
      secrets: baseSecrets,
      malware: baseMalware,
      codeQuality: baseCQ,
      sbom: baseSBOM,
      signature: baseSig,
      license: baseLicense,
      maintenance: { daysSinceLastCommit: 10, hasCiCd: true },
      community: { starRating: 5, ratingCount: 200 },
    });
    expect(result.overall).toBeGreaterThanOrEqual(80);
    expect(result.recommendation).toBe('approve');
  });

  it('penalises security dimension heavily for critical vulnerabilities', () => {
    const dirtyVulns: VulnerabilityScanResult = {
      ...baseVulns,
      vulnerabilities: { ...baseVulns.vulnerabilities, critical: 2 },
      recommendation: 'reject',
    };
    const result = calculateTrustScore({
      vulns: dirtyVulns,
      secrets: baseSecrets,
      malware: baseMalware,
      codeQuality: baseCQ,
      sbom: baseSBOM,
      signature: baseSig,
      license: baseLicense,
    });
    // 2 critical vulns → security=20; overall≈45 with neutral defaults → require-review or reject
    expect(['require-review', 'reject']).toContain(result.recommendation);
    expect(result.dimensions.security).toBeLessThan(40);
  });

  it('sets security dimension to 20 when malware detected (100 - 80 penalty)', () => {
    const dirtyMalware: MalwareScanResult = {
      success: true, detected: true,
      signatures: [{ file: 'lib/index.js', signatureName: 'Trojan.Agent', category: 'trojan' }],
      suspiciousPatterns: [],
    };
    const result = calculateTrustScore({
      vulns: baseVulns, secrets: baseSecrets,
      malware: dirtyMalware, codeQuality: baseCQ,
      sbom: baseSBOM, signature: baseSig, license: baseLicense,
    });
    // malware penalty = 80, so security = max(0, 100 - 80) = 20
    expect(result.dimensions.security).toBe(20);
    // Overall with neutral defaults: 20×0.4+50×0.3+60×0.2+100×0.1 = 45 → require-review
    expect(['require-review', 'reject']).toContain(result.recommendation);
  });

  it('penalises production secrets but not test fixture secrets', () => {
    const productionSecrets: SecretDetectionResult = {
      success: true, found: true,
      locations: [{ file: 'src/config.ts', line: 10, ruleId: 'generic-api-key', redactedMatch: 'abc****xyz', inTestFixture: false }],
    };
    const fixtureSecrets: SecretDetectionResult = {
      success: true, found: true,
      locations: [{ file: '__tests__/fixtures/mock-keys.ts', line: 5, ruleId: 'generic-api-key', redactedMatch: 'abc****xyz', inTestFixture: true }],
    };

    const resultProd = calculateTrustScore({
      vulns: baseVulns, secrets: productionSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: baseSig, license: baseLicense,
    });
    const resultFixture = calculateTrustScore({
      vulns: baseVulns, secrets: fixtureSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: baseSig, license: baseLicense,
    });

    expect(resultProd.dimensions.security).toBeLessThan(resultFixture.dimensions.security);
  });

  it('gives maintenance score 100 for commit within 30 days', () => {
    const result = calculateTrustScore({
      vulns: baseVulns, secrets: baseSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: baseSig, license: baseLicense,
      maintenance: { daysSinceLastCommit: 5 },
    });
    expect(result.dimensions.maintenance).toBe(100);
  });

  it('gives maintenance score 10 for stale commit (>365 days)', () => {
    const result = calculateTrustScore({
      vulns: baseVulns, secrets: baseSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: baseSig, license: baseLicense,
      maintenance: { daysSinceLastCommit: 400 },
    });
    expect(result.dimensions.maintenance).toBe(10);
  });

  it('gives maintenance score 0 for archived plugins', () => {
    const result = calculateTrustScore({
      vulns: baseVulns, secrets: baseSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: baseSig, license: baseLicense,
      maintenance: { isArchived: true },
    });
    expect(result.dimensions.maintenance).toBe(0);
  });

  it('signature verification adds transparency score', () => {
    const noSig: SignatureVerificationResult = { success: true, verified: false };
    const withSig: SignatureVerificationResult = { success: true, verified: true };

    const withSigResult = calculateTrustScore({
      vulns: baseVulns, secrets: baseSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: withSig, license: baseLicense,
    });
    const noSigResult = calculateTrustScore({
      vulns: baseVulns, secrets: baseSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: noSig, license: baseLicense,
    });
    expect(withSigResult.dimensions.transparency).toBeGreaterThan(noSigResult.dimensions.transparency);
  });

  it('includes rationale string in result', () => {
    const result = calculateTrustScore({
      vulns: baseVulns, secrets: baseSecrets, malware: baseMalware,
      codeQuality: baseCQ, sbom: baseSBOM, signature: baseSig, license: baseLicense,
    });
    expect(result.rationale).toContain('Overall trust score:');
  });
});

// ---------------------------------------------------------------------------
// License Checker
// ---------------------------------------------------------------------------

describe('checkLicenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('exports APPROVED_LICENSES containing MIT', () => {
    expect(APPROVED_LICENSES.has('MIT')).toBe(true);
  });

  it('exports INCOMPATIBLE_LICENSES containing GPL-3.0', () => {
    expect(INCOMPATIBLE_LICENSES.has('GPL-3.0')).toBe(true);
  });

  it('returns non-compliant for GPL plugin', async () => {
    const gplOutput = JSON.stringify({
      'my-plugin@1.0.0': { licenses: 'GPL-3.0' },
    });
    mockExecFileSuccess(gplOutput);

    const result = await checkLicenses('/some/path');
    expect(result.success).toBe(true);
    expect(result.incompatible).toContain('GPL-3.0');
    expect(result.compliant).toBe(false);
  });

  it('returns compliant for MIT plugin', async () => {
    const mitOutput = JSON.stringify({
      'my-plugin@1.0.0': { licenses: 'MIT' },
    });
    mockExecFileSuccess(mitOutput);

    const result = await checkLicenses('/some/path');
    expect(result.success).toBe(true);
    expect(result.compliant).toBe(true);
    expect(result.detected).toContain('MIT');
  });

  it('returns UNLICENSED when no license detected', async () => {
    // license-checker returns empty and package.json does not exist
    mockExecFileError('license-checker not found');
    mockExistsSync.mockReturnValue(false);

    const result = await checkLicenses('/some/path');
    expect(result.unknown).toContain('UNLICENSED');
    expect(result.compliant).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vulnerability Scanner
// ---------------------------------------------------------------------------

describe('scanVulnerabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('returns "approve" for clean scan (no vulnerabilities)', async () => {
    const grypeOutput = JSON.stringify({ matches: [] });
    mockExecFileSuccess(grypeOutput);

    const result = await scanVulnerabilities('/plugin/path');
    expect(result.success).toBe(true);
    expect(result.recommendation).toBe('approve');
    expect(result.vulnerabilities.critical).toBe(0);
  });

  it('returns "reject" when critical CVE found', async () => {
    const grypeOutput = JSON.stringify({
      matches: [
        {
          vulnerability: { id: 'CVE-2024-0001', severity: 'Critical', cvss: [{ metrics: { baseScore: 9.8 } }] },
          artifact: { name: 'lodash', version: '4.17.1' },
        },
      ],
    });
    mockExecFileSuccess(grypeOutput);

    const result = await scanVulnerabilities('/plugin/path');
    expect(result.recommendation).toBe('reject');
    expect(result.vulnerabilities.critical).toBe(1);
  });

  it('returns "approve-with-warnings" for high severity CVE', async () => {
    const grypeOutput = JSON.stringify({
      matches: [
        {
          vulnerability: {
            id: 'CVE-2024-0002', severity: 'High',
            cvss: [{ metrics: { baseScore: 8.1 } }],
            fix: { versions: ['4.17.21'] },
          },
          artifact: { name: 'lodash', version: '4.17.20' },
        },
      ],
    });
    mockExecFileSuccess(grypeOutput);

    const result = await scanVulnerabilities('/plugin/path');
    expect(result.recommendation).toBe('approve-with-warnings');
    expect(result.findings[0]?.fixedVersion).toBe('4.17.21');
  });

  it('suppresses findings listed in .grype-ignore.json', async () => {
    const grypeOutput = JSON.stringify({
      matches: [
        {
          vulnerability: { id: 'CVE-2024-9999', severity: 'Critical' },
          artifact: { name: 'pkg', version: '1.0.0' },
        },
      ],
    });
    mockExecFileSuccess(grypeOutput);

    // Simulate .grype-ignore.json present and containing the CVE
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ cve: 'CVE-2024-9999', reason: 'false positive' }]) as any,
    );
    mockExistsSync.mockReturnValue(true);

    const result = await scanVulnerabilities('/plugin/path');
    expect(result.findings[0]?.suppressed).toBe(true);
    expect(result.vulnerabilities.critical).toBe(0);
    expect(result.recommendation).toBe('approve');
  });

  it('returns error result when grype is unavailable', async () => {
    mockExecFileError('command not found: grype');

    const result = await scanVulnerabilities('/plugin/path');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/grype/);
  });
});

// ---------------------------------------------------------------------------
// SBOM Generator
// ---------------------------------------------------------------------------

describe('generateSBOM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdirSync.mockImplementation(() => undefined as any);
    mockWriteFileSync.mockImplementation(() => undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it('generates SBOM using syft when available', async () => {
    const syftOutput = JSON.stringify({
      components: [
        { name: 'express', version: '4.18.2', type: 'npm', purl: 'pkg:npm/express@4.18.2' },
      ],
    });
    mockExecFileSuccess(syftOutput);

    const result = await generateSBOM('my-plugin', '1.0.0', '/plugin/path');
    expect(result.success).toBe(true);
    expect(result.usedFallback).toBe(false);
    expect(result.format).toBe('cyclonedx');
    expect(result.components).toHaveLength(1);
    expect(result.components[0]?.name).toBe('express');
  });

  it('falls back to npm ls when syft unavailable', async () => {
    let callCount = 0;
    (mockExecFile as any).mockImplementation((...args: any[]) => {
      const cb = args.find((a: unknown) => typeof a === 'function') as
        ((...cbArgs: any[]) => void) | undefined;
      callCount++;
      if (callCount === 1) {
        // syft call fails
        const err = new Error('command not found: syft');
        cb?.(err);
      } else {
        // npm ls succeeds
        const npmOutput = JSON.stringify({
          name: 'my-plugin',
          version: '1.0.0',
          dependencies: {
            lodash: { version: '4.17.21' },
          },
        });
        cb?.(null, { stdout: npmOutput, stderr: '' });
      }
    });

    const result = await generateSBOM('my-plugin', '1.0.0', '/plugin/path');
    expect(result.success).toBe(true);
    expect(result.usedFallback).toBe(true);
    expect(result.format).toBe('npm-ls');
    expect(result.components.some((c: { name: string }) => c.name === 'lodash')).toBe(true);
  });

  it('returns failure when both syft and npm ls fail', async () => {
    mockExecFileError('all tools failed');

    const result = await generateSBOM('my-plugin', '1.0.0', '/plugin/path');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Secret Detector
// ---------------------------------------------------------------------------

describe('detectSecrets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // readdirSync returns empty by default (no scripts to scan)
  });

  it('returns found:false when gitleaks finds nothing', async () => {
    mockExecFileSuccess('');

    const result = await detectSecrets('/plugin/path');
    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
  });

  it('parses gitleaks findings from stdout on non-zero exit', async () => {
    const findings = [
      { RuleID: 'generic-api-key', File: 'src/config.ts', StartLine: 42, Secret: 'mySecretKey12345' },
    ];
    const err = new Error('gitleaks found secrets') as any;
    err.stdout = JSON.stringify(findings);

    (mockExecFile as any).mockImplementation(
      (_cmd: string, _args: string[], cb: (err: Error) => void) => {
        cb(err);
      },
    );

    const result = await detectSecrets('/plugin/path');
    expect(result.found).toBe(true);
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]?.ruleId).toBe('generic-api-key');
    expect(result.locations[0]?.inTestFixture).toBe(false);
  });

  it('flags test fixture files correctly', async () => {
    const findings = [
      { RuleID: 'generic-api-key', File: '__tests__/fixtures/mock-keys.ts', StartLine: 5, Secret: 'fixture-key-123' },
    ];
    const err = new Error('gitleaks found secrets') as any;
    err.stdout = JSON.stringify(findings);
    (mockExecFile as any).mockImplementation(
      (_cmd: string, _args: string[], cb: (err: Error) => void) => cb(err),
    );

    const result = await detectSecrets('/plugin/path');
    expect(result.locations[0]?.inTestFixture).toBe(true);
  });

  it('redacts secrets in output', async () => {
    const findings = [
      { RuleID: 'aws-access-key', File: 'src/auth.ts', StartLine: 1, Secret: 'AKIAIOSFODNN7EXAMPLE' },
    ];
    const err = new Error('found') as any;
    err.stdout = JSON.stringify(findings);
    (mockExecFile as any).mockImplementation(
      (_cmd: string, _args: string[], cb: (err: Error) => void) => cb(err),
    );

    const result = await detectSecrets('/plugin/path');
    expect(result.locations[0]?.redactedMatch).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.locations[0]?.redactedMatch).toMatch(/\*{4}/);
  });
});

// ---------------------------------------------------------------------------
// Malware Scanner
// ---------------------------------------------------------------------------

describe('scanMalware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReaddirSync.mockReturnValue([]);
  });

  it('returns detected:false for clean scan (exit code 0, no FOUND lines)', async () => {
    // clamscan exits 0 when clean; execFileAsync resolves
    (mockExecFile as any).mockImplementationOnce(
      (_cmd: string, _args: string[], cb: (err: null, result: { stdout: string; stderr: string }) => void) =>
        cb(null, { stdout: '', stderr: '' }),
    );

    const result = await scanMalware('/plugin/path');
    expect(result.success).toBe(true);
    expect(result.detected).toBe(false);
    expect(result.signatures).toHaveLength(0);
  });

  it('parses trojan signature from clamscan FOUND output (exit code 1)', async () => {
    // clamscan exits with code 1 when infections are found; the module's .catch() extracts stdout
    const clamStdout = '/plugin/lib/index.js: Trojan.Agent FOUND\n';
    const infectionErr: any = new Error('clamscan found 1 infected file');
    infectionErr.stdout = clamStdout;
    infectionErr.stderr = '';
    infectionErr.code = 1;
    (mockExecFile as any).mockImplementationOnce(
      (_cmd: string, _args: string[], cb: (err: Error) => void) => cb(infectionErr),
    );

    const result = await scanMalware('/plugin/path');
    expect(result.success).toBe(true);
    expect(result.detected).toBe(true);
    expect(result.signatures[0]?.category).toBe('trojan');
    expect(result.signatures[0]?.signatureName).toBe('Trojan.Agent');
  });

  it('gracefully degrades when clamscan is unavailable (returns detected:false)', async () => {
    // The malware-scanner uses .catch() to absorb all execFile errors, so when
    // clamscan is not installed the result is success:true, detected:false (graceful degradation)
    (mockExecFile as any).mockImplementationOnce(
      (...args: any[]) => {
        const cb = args.find((a: unknown) => typeof a === 'function') as
          ((err: Error) => void) | undefined;
        cb?.(new Error('command not found: clamscan'));
      },
    );

    const result = await scanMalware('/plugin/path');
    // The .catch() in malware-scanner absorbs the error and returns empty stdout
    expect(result.success).toBe(true);
    expect(result.detected).toBe(false);
    expect(result.signatures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Signature Verifier
// ---------------------------------------------------------------------------

describe('verifySignature', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns verified:true for valid signature', async () => {
    mockExecFileSuccess('Certificate fingerprint: AA:BB:CC\nSigned at: 2026-02-28T00:00:00Z');

    const result = await verifySignature('/artifact.tgz', '/keys/dcyfr.pub');
    expect(result.verified).toBe(true);
    expect(result.publicKeyFingerprint).toBe('AA:BB:CC');
    expect(result.signedAt).toBe('2026-02-28T00:00:00Z');
  });

  it('returns verified:false for invalid signature', async () => {
    mockExecFileError('signature verification failed');

    const result = await verifySignature('/artifact.tgz', '/keys/dcyfr.pub');
    expect(result.verified).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it('returns timedOut:true on timeout', async () => {
    const err = new Error('Timeout after 30000ms') as any;
    (mockExecFile as any).mockImplementation(
      (_cmd: string, _args: string[], cb: (err: Error) => void) => cb(err),
    );

    const result = await verifySignature('/artifact.tgz', '/keys/dcyfr.pub');
    expect(result.timedOut).toBe(true);
    expect(result.verified).toBe(false);
  });

  it('returns error for missing params', async () => {
    const result = await verifySignature('', '');
    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });
});

// ---------------------------------------------------------------------------
// Plugin Security Scanner (Orchestrator)
// ---------------------------------------------------------------------------

describe('scanPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockMkdirSync.mockImplementation(() => undefined as any);
    mockWriteFileSync.mockImplementation(() => undefined);
  });

  it('skips all scanners when skip flags set', async () => {
    const result = await scanPlugin({
      pluginId: 'my-plugin',
      version: '1.0.0',
      pluginPath: '/plugin/path',
      skip: {
        sbom: true, vulnerabilities: true, secrets: true,
        codeQuality: true, malware: true, signature: true, license: true,
      },
    });

    expect(result.pluginId).toBe('my-plugin');
    expect(result.version).toBe('1.0.0');
    expect(result.sbom.components).toHaveLength(0);
    expect(result.vulnerabilities.vulnerabilities.critical).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('includes scannedAt timestamp', async () => {
    const result = await scanPlugin({
      pluginId: 'my-plugin',
      version: '1.0.0',
      pluginPath: '/plugin/path',
      skip: { sbom: true, vulnerabilities: true, secrets: true, codeQuality: true, malware: true, signature: true, license: true },
    });

    expect(result.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('produces overall "reject" recommendation for critical vulnerability', async () => {
    // Set up grype to return critical CVE, all others clean
    const grypeOutput = JSON.stringify({
      matches: [{
        vulnerability: { id: 'CVE-2024-0001', severity: 'Critical', cvss: [{ metrics: { baseScore: 9.9 } }] },
        artifact: { name: 'pkg', version: '1.0.0' },
      }],
    });
    mockExecFileSuccess(grypeOutput);

    const result = await scanPlugin({
      pluginId: 'bad-plugin',
      version: '1.0.0',
      pluginPath: '/plugin/path',
      skip: { sbom: true, secrets: true, codeQuality: true, malware: true, signature: true, license: true },
    });

    expect(result.overallRecommendation).toBe('reject');
  });

  it('has trust score with all 4 dimensions', async () => {
    const result = await scanPlugin({
      pluginId: 'my-plugin',
      version: '1.0.0',
      pluginPath: '/plugin/path',
      skip: { sbom: true, vulnerabilities: true, secrets: true, codeQuality: true, malware: true, signature: true, license: true },
    });

    expect(result.trustScore.dimensions).toMatchObject({
      security: expect.any(Number),
      community: expect.any(Number),
      maintenance: expect.any(Number),
      transparency: expect.any(Number),
    });
    expect(result.trustScore.overall).toBeGreaterThanOrEqual(0);
    expect(result.trustScore.overall).toBeLessThanOrEqual(100);
  });
});

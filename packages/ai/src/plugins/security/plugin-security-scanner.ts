/**
 * Plugin Security Scanner Orchestrator
 *
 * Coordinates all security scanning tools (SBOM, vulnerabilities, secrets,
 * code quality, malware, signatures, licenses) in parallel and produces a
 * single consolidated PluginSecurityReport with an overall trust score.
 *
 * @module plugins/security/plugin-security-scanner
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { generateSBOM } from './sbom-generator.js';
import { scanVulnerabilities } from './vulnerability-scanner.js';
import { detectSecrets } from './secret-detector.js';
import { fetchCodeQuality } from './sonarcloud-client.js';
import { scanMalware } from './malware-scanner.js';
import { verifySignature } from './signature-verifier.js';
import { checkLicenses } from './license-checker.js';
import { calculateTrustScore } from './trust-score.js';
import type {
  PluginScanInput,
  PluginSecurityReport,
  SBOMResult,
  VulnerabilityScanResult,
  SecretDetectionResult,
  CodeQualityResult,
  MalwareScanResult,
  SignatureVerificationResult,
  LicenseComplianceResult,
} from './types.js';
import type { CommunityInput, MaintenanceInput } from './trust-score.js';

// ---------------------------------------------------------------------------
// Null-safe fallback results (used when a scanner is skipped)
// ---------------------------------------------------------------------------

const SKIPPED_SBOM: SBOMResult = {
  success: true,
  usedFallback: false,
  format: 'npm-ls',
  components: [],
};

const SKIPPED_VULNS: VulnerabilityScanResult = {
  success: true,
  vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 },
  findings: [],
  recommendation: 'approve',
};

const SKIPPED_SECRETS: SecretDetectionResult = {
  success: true,
  found: false,
  locations: [],
};

const SKIPPED_CODE_QUALITY: CodeQualityResult = {
  success: true,
  requiresManualReview: false,
  qualityGate: 'NONE',
};

const SKIPPED_MALWARE: MalwareScanResult = {
  success: true,
  detected: false,
  signatures: [],
  suspiciousPatterns: [],
};

const SKIPPED_SIGNATURE: SignatureVerificationResult = {
  success: true,
  verified: false,
};

const SKIPPED_LICENSE: LicenseComplianceResult = {
  success: true,
  compliant: true,
  detected: [],
  incompatible: [],
  unknown: [],
};

// ---------------------------------------------------------------------------
// Overall recommendation calculus
// ---------------------------------------------------------------------------

type Recommendation = PluginSecurityReport['overallRecommendation'];

const REC_RANK: Record<Recommendation, number> = {
  approve: 0,
  'approve-with-warnings': 1,
  'require-review': 2,
  reject: 3,
};

function mostRestrictive(...recs: Recommendation[]): Recommendation {
  return recs.reduce<Recommendation>(
    (acc, r) => (REC_RANK[r] > REC_RANK[acc] ? r : acc),
    'approve',
  );
}

function deriveOverallRecommendation(
  report: Omit<PluginSecurityReport, 'overallRecommendation' | 'trustScore' | 'durationMs'>,
): Recommendation {
  const recs: Recommendation[] = [
    report.vulnerabilities.recommendation,
    report.malware.detected ? 'reject' : 'approve',
    report.secrets.locations.some((l) => !l.inTestFixture) ? 'reject' : 'approve',
    report.codeQuality.requiresManualReview ? 'require-review' : 'approve',
    (report.license.incompatible.length > 0) ? 'approve-with-warnings' : 'approve',
  ];
  return mostRestrictive(...recs);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Optional context inputs not derived from scanning */
export interface ScanContext {
  /** SonarCloud project key (defaults to `dcyfr_<pluginId>`) */
  sonarcloudProjectKey?: string;
  /** Path to DCYFR cosign public key */
  cosignPublicKeyPath?: string;
  /** Community data from reputation DB */
  community?: CommunityInput;
  /** Maintenance data from reputation DB */
  maintenance?: MaintenanceInput;
}

/**
 * Run all security scans for a plugin and return a consolidated report.
 *
 * All scan phases run in parallel (except SBOM→vulnerability which is
 * sequential since Grype can consume the generated SBOM).
 *
 * @param input   Plugin scan parameters
 * @param context Optional external context (SonarCloud key, cosign key, etc.)
 */
export async function scanPlugin(
  input: PluginScanInput,
  context: ScanContext = {},
): Promise<PluginSecurityReport> {
  const startMs = Date.now();
  const skip = input.skip ?? {};

  // -------------------------------------------------------------------------
  // Phase A: SBOM (must complete before vulnerability scan)
  // -------------------------------------------------------------------------
  const sbom: SBOMResult = skip.sbom
    ? SKIPPED_SBOM
    : await generateSBOM(input.pluginId, input.version, input.pluginPath);

  // -------------------------------------------------------------------------
  // Phase B: All remaining scans run in parallel
  // -------------------------------------------------------------------------
  const sonarKey = context.sonarcloudProjectKey ?? `dcyfr_${input.pluginId}`;
  const cosignKey = context.cosignPublicKeyPath ?? '';
  const artifactPath = input.artifactPath ?? '';

  const [vulns, secrets, codeQuality, malware, signature, license] =
    await Promise.all([
      skip.vulnerabilities
        ? Promise.resolve(SKIPPED_VULNS)
        : scanVulnerabilities(input.pluginPath, sbom.storagePath),

      skip.secrets
        ? Promise.resolve(SKIPPED_SECRETS)
        : detectSecrets(input.pluginPath),

      skip.codeQuality
        ? Promise.resolve(SKIPPED_CODE_QUALITY)
        : fetchCodeQuality(sonarKey),

      skip.malware
        ? Promise.resolve(SKIPPED_MALWARE)
        : scanMalware(input.pluginPath),

      skip.signature || !artifactPath || !cosignKey
        ? Promise.resolve(SKIPPED_SIGNATURE)
        : verifySignature(artifactPath, cosignKey),

      skip.license
        ? Promise.resolve(SKIPPED_LICENSE)
        : checkLicenses(input.pluginPath),
    ]);

  // -------------------------------------------------------------------------
  // Phase C: Trust score + overall recommendation
  // -------------------------------------------------------------------------
  const trustScore = calculateTrustScore({
    vulns,
    secrets,
    malware,
    codeQuality,
    sbom,
    signature,
    license,
    maintenance: context.maintenance,
    community: context.community,
  });

  const partialReport = {
    pluginId: input.pluginId,
    version: input.version,
    scannedAt: new Date().toISOString(),
    sbom,
    vulnerabilities: vulns,
    secrets,
    codeQuality,
    malware,
    signature,
    license,
  };

  const overallRecommendation = mostRestrictive(
    trustScore.recommendation,
    deriveOverallRecommendation(partialReport),
  );

  return {
    ...partialReport,
    trustScore,
    overallRecommendation,
    durationMs: Date.now() - startMs,
  };
}

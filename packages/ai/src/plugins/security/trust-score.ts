/**
 * Trust Score Calculation Engine
 *
 * Computes a 4-dimension weighted trust score (0–100) for a plugin based on
 * security scan results, community data, maintenance activity, and transparency.
 *
 * Weights:
 *   - Security posture  40%
 *   - Community trust   30%
 *   - Maintenance       20%
 *   - Transparency      10%
 *
 * @module plugins/security/trust-score
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import type {
  TrustScore,
  TrustScoreDimensions,
  VulnerabilityScanResult,
  SecretDetectionResult,
  CodeQualityResult,
  MalwareScanResult,
  SignatureVerificationResult,
  LicenseComplianceResult,
  SBOMResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Weight constants
// ---------------------------------------------------------------------------

const WEIGHT_SECURITY = 0.4;
const WEIGHT_COMMUNITY = 0.3;
const WEIGHT_MAINTENANCE = 0.2;
const WEIGHT_TRANSPARENCY = 0.1;

// ---------------------------------------------------------------------------
// Security score (0–100)
// ---------------------------------------------------------------------------

/** Penalty per vulnerability by severity */
const VULN_PENALTIES = {
  critical: 40,
  high: 20,
  medium: 10,
  low: 5,
  negligible: 1,
  unknown: 3,
} as const;

function calcSecurityScore(
  vulns: VulnerabilityScanResult,
  secrets: SecretDetectionResult,
  malware: MalwareScanResult,
  codeQuality: CodeQualityResult,
): number {
  let score = 100;

  // Deduct for vulnerabilities
  const v = vulns.vulnerabilities;
  score -= Math.min(v.critical * VULN_PENALTIES.critical, 80);
  score -= Math.min(v.high * VULN_PENALTIES.high, 40);
  score -= Math.min(v.medium * VULN_PENALTIES.medium, 20);
  score -= Math.min(v.low * VULN_PENALTIES.low, 10);
  score -= Math.min(v.negligible * VULN_PENALTIES.negligible, 5);

  // Secrets: blocking secrets in production code are severe
  const productionSecrets = secrets.locations.filter((l) => !l.inTestFixture);
  score -= productionSecrets.length * 25;

  // Malware: immediate severe penalty
  if (malware.detected) score -= 80;
  score -= malware.suspiciousPatterns.length * 5;

  // Code quality
  if (codeQuality.metrics) {
    const { bugs, vulnerabilities: cqVulns, securityHotspots } = codeQuality.metrics;
    score -= bugs * 2;
    score -= cqVulns * 5;
    score -= securityHotspots * 3;
  }

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Transparency score (0–100)
// ---------------------------------------------------------------------------

function calcTransparencyScore(
  sbom: SBOMResult,
  signature: SignatureVerificationResult,
  license: LicenseComplianceResult,
): number {
  let score = 0;

  // SBOM present: +40
  if (sbom.success && sbom.components.length > 0) score += 40;
  else if (sbom.usedFallback && sbom.components.length > 0) score += 20;

  // Valid signature: +20 bonus / -20 penalty for absence
  if (signature.verified) score += 40;
  else score += 0; // neutral; allow rejection elsewhere

  // License declared and compliant: +20
  if (license.compliant) score += 20;
  else if (license.detected.length > 0) score += 10;

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Maintenance score (provided externally, default to 50)
// ---------------------------------------------------------------------------

/**
 * Inputs for the maintenance dimension.
 * This data typically comes from the reputation database (not scan results).
 */
export interface MaintenanceInput {
  /** Days since last commit (undefined = unknown) */
  daysSinceLastCommit?: number;
  /** Whether CI/CD is configured */
  hasCiCd?: boolean;
  /** Whether the repository is archived */
  isArchived?: boolean;
}

function calcMaintenanceScore(input: MaintenanceInput): number {
  if (input.isArchived) return 0;

  let score: number;

  if (input.daysSinceLastCommit === undefined) {
    score = 60; // unknown → neutral
  } else {
    const d = input.daysSinceLastCommit;
    if (d < 30) score = 100;
    else if (d < 90) score = 80;
    else if (d < 180) score = 60;
    else if (d < 365) score = 40;
    else score = 10;
  }

  if (input.hasCiCd) score = Math.min(100, score + 10);

  return score;
}

// ---------------------------------------------------------------------------
// Community score (provided externally, default to 50)
// ---------------------------------------------------------------------------

/**
 * Inputs for the community trust dimension.
 * This data typically comes from the reputation database or marketplace ratings.
 */
export interface CommunityInput {
  /** Weighted average star rating (0–5) */
  starRating?: number;
  /** Total number of ratings (higher count = more signal) */
  ratingCount?: number;
  /** Number of active incidents */
  activeIncidents?: number;
}

function calcCommunityScore(input: CommunityInput): number {
  if (input.activeIncidents && input.activeIncidents > 0) {
    return Math.max(0, 40 - input.activeIncidents * 20);
  }

  if (input.starRating === undefined || input.ratingCount === undefined) {
    return 50; // neutral: no community data yet
  }

  // Normalise star rating (0–5 → 0–100)
  const base = (input.starRating / 5) * 100;
  // Low rating count reduces confidence → nudge toward neutral
  const confidence = Math.min(1, input.ratingCount / 100);
  return Math.round(base * confidence + 50 * (1 - confidence));
}

// ---------------------------------------------------------------------------
// Recommendation thresholds
// ---------------------------------------------------------------------------

function deriveRecommendation(overall: number): TrustScore['recommendation'] {
  if (overall >= 80) return 'approve';
  if (overall >= 60) return 'approve-with-warnings';
  if (overall >= 40) return 'require-review';
  return 'reject';
}

function buildRationale(
  overall: number,
  dims: TrustScoreDimensions,
  rec: TrustScore['recommendation'],
): string {
  const parts: string[] = [`Overall trust score: ${overall}/100.`];
  parts.push(
    `Security ${dims.security}/100 (40%), Community ${dims.community}/100 (30%), ` +
    `Maintenance ${dims.maintenance}/100 (20%), Transparency ${dims.transparency}/100 (10%).`,
  );
  if (rec === 'approve') parts.push('Plugin meets all security requirements.');
  else if (rec === 'approve-with-warnings') parts.push('Plugin has minor issues — review warnings before installing.');
  else if (rec === 'require-review') parts.push('Plugin requires manual security team review before approval.');
  else parts.push('Plugin fails minimum security requirements and cannot be approved.');
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TrustScoreInput {
  vulns: VulnerabilityScanResult;
  secrets: SecretDetectionResult;
  malware: MalwareScanResult;
  codeQuality: CodeQualityResult;
  sbom: SBOMResult;
  signature: SignatureVerificationResult;
  license: LicenseComplianceResult;
  maintenance?: MaintenanceInput;
  community?: CommunityInput;
}

/**
 * Calculate the overall trust score for a plugin.
 */
export function calculateTrustScore(input: TrustScoreInput): TrustScore {
  const security = calcSecurityScore(
    input.vulns,
    input.secrets,
    input.malware,
    input.codeQuality,
  );
  const transparency = calcTransparencyScore(
    input.sbom,
    input.signature,
    input.license,
  );
  const maintenance = calcMaintenanceScore(input.maintenance ?? {});
  const community = calcCommunityScore(input.community ?? {});

  const overall = Math.round(
    security * WEIGHT_SECURITY +
    community * WEIGHT_COMMUNITY +
    maintenance * WEIGHT_MAINTENANCE +
    transparency * WEIGHT_TRANSPARENCY,
  );

  const dimensions: TrustScoreDimensions = {
    security,
    community,
    maintenance,
    transparency,
  };

  const recommendation = deriveRecommendation(overall);

  return {
    overall,
    dimensions,
    recommendation,
    rationale: buildRationale(overall, dimensions, recommendation),
  };
}

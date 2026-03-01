/**
 * Plugin Security Types
 *
 * Shared type definitions for the plugin marketplace security scanning pipeline.
 *
 * @module plugins/security/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// SBOM
// ---------------------------------------------------------------------------

/** A single dependency entry in a Software Bill of Materials */
export interface SBOMComponent {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** SPDX license identifier */
  license?: string;
  /** Common Platform Enumeration identifier */
  cpe?: string;
  /** Package URL */
  purl?: string;
  /** Ecosystem (npm, pypi, etc.) */
  ecosystem?: string;
}

/** Result of SBOM generation */
export interface SBOMResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Whether fallback (npm ls) was used instead of Syft */
  usedFallback: boolean;
  /** CycloneDX or SPDX format */
  format: 'cyclonedx' | 'spdx' | 'npm-ls';
  /** All discovered components */
  components: SBOMComponent[];
  /** Path where the SBOM was written */
  storagePath?: string;
  /** Error message if generation failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Vulnerability Scanning
// ---------------------------------------------------------------------------

/** CVE severity level */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'negligible' | 'unknown';

/** A single vulnerability finding */
export interface VulnerabilityFinding {
  /** CVE identifier */
  cveId: string;
  /** Numeric CVSS score */
  cvssScore: number;
  /** Severity level */
  severity: Severity;
  /** Affected package */
  packageName: string;
  /** Installed version */
  installedVersion: string;
  /** Fix version, if available */
  fixedVersion?: string;
  /** Summary description */
  description?: string;
  /** Whether this finding was marked as a false positive */
  suppressed?: boolean;
}

/** Aggregated vulnerability counts */
export interface VulnerabilityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  negligible: number;
  unknown: number;
}

/** Result of vulnerability scanning */
export interface VulnerabilityScanResult {
  success: boolean;
  vulnerabilities: VulnerabilityCounts;
  findings: VulnerabilityFinding[];
  /** Overall recommendation based on findings */
  recommendation: 'approve' | 'approve-with-warnings' | 'reject';
  error?: string;
}

// ---------------------------------------------------------------------------
// Secret Detection
// ---------------------------------------------------------------------------

/** Location of a detected secret */
export interface SecretLocation {
  file: string;
  line: number;
  /** Gitleaks rule ID */
  ruleId: string;
  /** Redacted match for audit log */
  redactedMatch: string;
  /** Whether this is in a test fixture (lower severity) */
  inTestFixture: boolean;
}

/** Result of secret detection */
export interface SecretDetectionResult {
  success: boolean;
  found: boolean;
  locations: SecretLocation[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Code Quality (SonarCloud)
// ---------------------------------------------------------------------------

/** SonarCloud code quality metrics */
export interface CodeQualityMetrics {
  bugs: number;
  vulnerabilities: number;
  securityHotspots: number;
  /** Code smell count */
  codeSmells: number;
  /** Maintainability rating (A-E) */
  maintainabilityRating: 'A' | 'B' | 'C' | 'D' | 'E' | 'unknown';
  /** Test coverage percentage */
  coverage?: number;
}

/** Result of SonarCloud analysis */
export interface CodeQualityResult {
  success: boolean;
  metrics?: CodeQualityMetrics;
  /** Whether this requires mandatory security review */
  requiresManualReview: boolean;
  /** Quality gate status */
  qualityGate: 'OK' | 'WARN' | 'ERROR' | 'NONE';
  error?: string;
}

// ---------------------------------------------------------------------------
// Malware Scanning (ClamAV)
// ---------------------------------------------------------------------------

/** A malware signature finding */
export interface MalwareSignature {
  file: string;
  signatureName: string;
  /** Detection category */
  category: 'virus' | 'trojan' | 'suspicious' | 'unknown';
}

/** Result of malware scanning */
export interface MalwareScanResult {
  success: boolean;
  detected: boolean;
  signatures: MalwareSignature[];
  /** Files with suspicious script patterns (e.g. curl|bash) */
  suspiciousPatterns: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Signature Verification (cosign)
// ---------------------------------------------------------------------------

/** Result of cryptographic signature verification */
export interface SignatureVerificationResult {
  success: boolean;
  verified: boolean;
  /** Public key fingerprint used for verification */
  publicKeyFingerprint?: string;
  /** Timestamp of the signature */
  signedAt?: string;
  /** Whether verification timed out */
  timedOut?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// License Compliance
// ---------------------------------------------------------------------------

/** License compliance analysis */
export interface LicenseComplianceResult {
  success: boolean;
  compliant: boolean;
  detected: string[];
  incompatible: string[];
  /** SPDX identifiers that were unknown / not recognised */
  unknown: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Trust Score
// ---------------------------------------------------------------------------

/** Dimension scores feeding into the overall trust score */
export interface TrustScoreDimensions {
  /** Security posture (40% weight) — based on scan results */
  security: number;
  /** Community trust (30% weight) — based on reputation/ratings */
  community: number;
  /** Maintenance quality (20% weight) — activity, update frequency */
  maintenance: number;
  /** Transparency (10% weight) — signature, SBOM, open source */
  transparency: number;
}

/** Overall plugin trust score (0–100) */
export interface TrustScore {
  overall: number;
  dimensions: TrustScoreDimensions;
  /** Recommended action based on score */
  recommendation: 'approve' | 'approve-with-warnings' | 'reject' | 'require-review';
  /** Human-readable explanation */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Composite: Full Security Scan Report
// ---------------------------------------------------------------------------

/** Input to the security scanner */
export interface PluginScanInput {
  /** Unique plugin identifier */
  pluginId: string;
  /** Semver version string */
  version: string;
  /** Absolute path to extracted plugin directory */
  pluginPath: string;
  /** Absolute path to main plugin archive/artifact */
  artifactPath?: string;
  /**
   * Whether to skip individual scanners (useful in testing or air-gapped
   * environments where CLI tools may not be available)
   */
  skip?: {
    sbom?: boolean;
    vulnerabilities?: boolean;
    secrets?: boolean;
    codeQuality?: boolean;
    malware?: boolean;
    signature?: boolean;
    license?: boolean;
  };
}

/** Aggregated security scan report for a plugin */
export interface PluginSecurityReport {
  pluginId: string;
  version: string;
  scannedAt: string;
  sbom: SBOMResult;
  vulnerabilities: VulnerabilityScanResult;
  secrets: SecretDetectionResult;
  codeQuality: CodeQualityResult;
  malware: MalwareScanResult;
  signature: SignatureVerificationResult;
  license: LicenseComplianceResult;
  trustScore: TrustScore;
  /** Overall recommendation (most restrictive across all scanners) */
  overallRecommendation: 'approve' | 'approve-with-warnings' | 'reject' | 'require-review';
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Plugin Security Module
 *
 * Enterprise-grade multi-layer security scanning pipeline for the DCYFR
 * plugin marketplace.
 *
 * @module plugins/security
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// Core orchestrator
export { scanPlugin } from './plugin-security-scanner.js';
export type { ScanContext } from './plugin-security-scanner.js';

// Individual scanners (for direct use or testing)
export { generateSBOM } from './sbom-generator.js';
export { scanVulnerabilities } from './vulnerability-scanner.js';
export { detectSecrets } from './secret-detector.js';
export { fetchCodeQuality } from './sonarcloud-client.js';
export { scanMalware } from './malware-scanner.js';
export { verifySignature } from './signature-verifier.js';
export { checkLicenses, APPROVED_LICENSES, INCOMPATIBLE_LICENSES } from './license-checker.js';
export { calculateTrustScore } from './trust-score.js';
export type { TrustScoreInput, MaintenanceInput, CommunityInput } from './trust-score.js';

// All types
export type {
  // SBOM
  SBOMComponent,
  SBOMResult,
  // Vulnerabilities
  Severity,
  VulnerabilityFinding,
  VulnerabilityCounts,
  VulnerabilityScanResult,
  // Secrets
  SecretLocation,
  SecretDetectionResult,
  // Code quality
  CodeQualityMetrics,
  CodeQualityResult,
  // Malware
  MalwareSignature,
  MalwareScanResult,
  // Signatures
  SignatureVerificationResult,
  // Licenses
  LicenseComplianceResult,
  // Trust score
  TrustScoreDimensions,
  TrustScore,
  // Scan input / report
  PluginScanInput,
  PluginSecurityReport,
} from './types.js';

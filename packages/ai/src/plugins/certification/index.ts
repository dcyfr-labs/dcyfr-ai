/**
 * Plugin Certification Program
 *
 * 3-tier certification system for the DCYFR plugin marketplace.
 *
 * @module plugins/certification
 */

export { CertificationManager, CertificationError } from './certification-manager.js';
export type { CertificationManagerConfig } from './certification-manager.js';
export {
  CERTIFICATION_AUDIT_CHECKLIST,
  CERTIFICATION_PRICING_USD_CENTS,
  CERTIFICATION_TIER_LABELS,
  CERTIFICATION_VALIDITY_DAYS,
  CERTIFICATION_SCHEMA_SQL,
} from './types.js';
export type {
  CertificationTier,
  CertificationStatus,
  CertificationBadge,
  AuditChecklistCategory,
  AuditChecklistItem,
  AuditRequest,
  AuditChecklistResult,
  PluginCertificationSummary,
} from './types.js';

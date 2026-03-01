/**
 * Plugin Certification Program — Type Definitions
 *
 * Defines the 3-tier certification program (Bronze / Silver / Gold),
 * badge system, audit checklist, and paid audit workflow.
 *
 * @module plugins/certification/types
 */

// ---------------------------------------------------------------------------
// Certification Tiers
// ---------------------------------------------------------------------------

/**
 * Bronze: Automated security scan pass (no critical/high CVEs, no secrets).
 * Silver: Bronze + human security audit by DCYFR team.
 * Gold:   Silver + third-party penetration test.
 */
export type CertificationTier = 'BRONZE' | 'SILVER' | 'GOLD';

/** Pricing for each tier in USD cents. */
export const CERTIFICATION_PRICING_USD_CENTS: Readonly<Record<CertificationTier, number>> = {
  BRONZE: 0,         // Free tier — automated only
  SILVER: 49900,     // $499 — human audit
  GOLD: 249900,      // $2,499 — pen test + human audit
} as const;

/** Human-readable tier names. */
export const CERTIFICATION_TIER_LABELS: Readonly<Record<CertificationTier, string>> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
} as const;

/** Validity period in days for each tier. */
export const CERTIFICATION_VALIDITY_DAYS: Readonly<Record<CertificationTier, number>> = {
  BRONZE: 90,   // 90 days — renew quarterly
  SILVER: 180,  // 6 months
  GOLD: 365,    // 1 year
} as const;

// ---------------------------------------------------------------------------
// Certification Status
// ---------------------------------------------------------------------------

export type CertificationStatus =
  | 'PENDING_PAYMENT'    // Audit requested, awaiting payment
  | 'PAYMENT_RECEIVED'   // Payment confirmed, queued for audit
  | 'IN_AUDIT'           // Audit actively in progress
  | 'CERTIFIED'          // Certification issued
  | 'EXPIRED'            // Certificate past validity date
  | 'REVOKED'            // Revoked due to discovered vulnerability or policy violation
  | 'FAILED';            // Did not pass audit requirements

// ---------------------------------------------------------------------------
// Certification Badge
// ---------------------------------------------------------------------------

/** A verifiable certification badge with expiration and metadata. */
export interface CertificationBadge {
  /** UUID for this badge issuance. */
  badge_id: string;
  /** Plugin identifier. */
  plugin_id: string;
  /** Plugin version at time of certification. */
  plugin_version: string;
  /** Certification tier achieved. */
  tier: CertificationTier;
  /** When the certification was issued (ISO 8601). */
  issued_at: string;
  /** When the certification expires (ISO 8601). */
  expires_at: string;
  /** Certifying authority (e.g. 'DCYFR Security Team'). */
  issued_by: string;
  /** Short verification URL for marketplace display. */
  verification_url: string;
  /** SHA-256 hash of the plugin bundle at certification time. */
  bundle_hash: string;
}

// ---------------------------------------------------------------------------
// Audit Checklist
// ---------------------------------------------------------------------------

/** Category grouping for audit checklist items. */
export type AuditChecklistCategory =
  | 'AUTOMATED_SCAN'
  | 'PERMISSION_REVIEW'
  | 'CODE_QUALITY'
  | 'SECURITY_MANUAL'
  | 'PENETRATION_TEST';

/** Single checklist item in a certification audit. */
export interface AuditChecklistItem {
  /** Unique item ID within the checklist (e.g. 'AUTO-001'). */
  item_id: string;
  /** Category for grouping in audit reports. */
  category: AuditChecklistCategory;
  /** Human-readable description of the check. */
  description: string;
  /** Which tiers require this item to pass. */
  required_for_tiers: CertificationTier[];
  /**
   * Whether this item is automated (run by scanner) or manual (requires auditor).
   */
  automated: boolean;
}

/**
 * Complete audit checklist defining all required checks per tier.
 */
export const CERTIFICATION_AUDIT_CHECKLIST: readonly AuditChecklistItem[] = [
  // --- Automated Scan (Bronze+) ---
  {
    item_id: 'AUTO-001',
    category: 'AUTOMATED_SCAN',
    description: 'No critical or high CVEs in dependency tree (via npm audit / Trivy scan)',
    required_for_tiers: ['BRONZE', 'SILVER', 'GOLD'],
    automated: true,
  },
  {
    item_id: 'AUTO-002',
    category: 'AUTOMATED_SCAN',
    description: 'No secrets or credentials detected in plugin bundle (via Gitleaks / TruffleHog)',
    required_for_tiers: ['BRONZE', 'SILVER', 'GOLD'],
    automated: true,
  },
  {
    item_id: 'AUTO-003',
    category: 'AUTOMATED_SCAN',
    description: 'Static analysis: no code injection patterns (eval, Function constructor, setTimeout with string)',
    required_for_tiers: ['BRONZE', 'SILVER', 'GOLD'],
    automated: true,
  },
  {
    item_id: 'AUTO-004',
    category: 'AUTOMATED_SCAN',
    description: 'SBOM generated and all dependencies declared with valid SPDX identifiers',
    required_for_tiers: ['BRONZE', 'SILVER', 'GOLD'],
    automated: true,
  },
  {
    item_id: 'AUTO-005',
    category: 'AUTOMATED_SCAN',
    description: 'Plugin sandbox test passes with Docker isolation (no escape attempts)',
    required_for_tiers: ['BRONZE', 'SILVER', 'GOLD'],
    automated: true,
  },
  // --- Permission Review (Bronze+) ---
  {
    item_id: 'PERM-001',
    category: 'PERMISSION_REVIEW',
    description: 'Declared permissions match observed runtime behavior (no undeclared network calls)',
    required_for_tiers: ['BRONZE', 'SILVER', 'GOLD'],
    automated: true,
  },
  {
    item_id: 'PERM-002',
    category: 'PERMISSION_REVIEW',
    description: 'Principle of least privilege: no excessive permissions requested',
    required_for_tiers: ['BRONZE', 'SILVER', 'GOLD'],
    automated: false,
  },
  // --- Code Quality (Silver+) ---
  {
    item_id: 'CODE-001',
    category: 'CODE_QUALITY',
    description: 'Source code review: no obfuscation, no dynamic require(), clean readable logic',
    required_for_tiers: ['SILVER', 'GOLD'],
    automated: false,
  },
  {
    item_id: 'CODE-002',
    category: 'CODE_QUALITY',
    description: 'Error handling: all failure paths handled gracefully (no unhandled promise rejections)',
    required_for_tiers: ['SILVER', 'GOLD'],
    automated: false,
  },
  {
    item_id: 'CODE-003',
    category: 'CODE_QUALITY',
    description: 'Test coverage ≥80% with meaningful assertions (no trivial tests to inflate coverage)',
    required_for_tiers: ['SILVER', 'GOLD'],
    automated: true,
  },
  // --- Security Manual (Silver+) ---
  {
    item_id: 'SEC-001',
    category: 'SECURITY_MANUAL',
    description: 'Human audit: input validation reviewed for injection risks',
    required_for_tiers: ['SILVER', 'GOLD'],
    automated: false,
  },
  {
    item_id: 'SEC-002',
    category: 'SECURITY_MANUAL',
    description: 'Human audit: data handling reviewed for PII risks and GDPR compliance',
    required_for_tiers: ['SILVER', 'GOLD'],
    automated: false,
  },
  {
    item_id: 'SEC-003',
    category: 'SECURITY_MANUAL',
    description: 'Human audit: supply chain reviewed (no suspicious fork or dependency substitution)',
    required_for_tiers: ['SILVER', 'GOLD'],
    automated: false,
  },
  // --- Penetration Test (Gold only) ---
  {
    item_id: 'PEN-001',
    category: 'PENETRATION_TEST',
    description: 'Third-party penetration test: sandbox escape attempt (documented, no successful escapes)',
    required_for_tiers: ['GOLD'],
    automated: false,
  },
  {
    item_id: 'PEN-002',
    category: 'PENETRATION_TEST',
    description: 'Third-party penetration test: privilege escalation attempts (all blocked)',
    required_for_tiers: ['GOLD'],
    automated: false,
  },
  {
    item_id: 'PEN-003',
    category: 'PENETRATION_TEST',
    description: 'Third-party penetration test: formal report submitted and accepted by DCYFR',
    required_for_tiers: ['GOLD'],
    automated: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Audit Request / Payment Workflow
// ---------------------------------------------------------------------------

/**
 * An audit request submitted by a plugin author, initiating the certification workflow.
 * Payment is modeled as a structured intent — the caller is responsible for
 * integrating with a payment provider (e.g. Stripe) and confirming payment before
 * calling `confirmPayment()`.
 */
export interface AuditRequest {
  /** UUID for this audit request. */
  request_id: string;
  /** Plugin being audited. */
  plugin_id: string;
  /** Plugin version at submission. */
  plugin_version: string;
  /** Tier being requested. */
  tier: CertificationTier;
  /** Plugin author / organization submitting the request. */
  submitted_by: string;
  /** When the request was submitted (ISO 8601). */
  submitted_at: string;
  /** Current status of this audit request. */
  status: CertificationStatus;
  /** Price in USD cents for this tier (0 for Bronze). */
  price_usd_cents: number;
  /** Payment provider reference ID (e.g. Stripe PaymentIntent ID). Null until payment initiated. */
  payment_reference_id: string | null;
  /** When payment was confirmed (ISO 8601). Null until confirmed. */
  payment_confirmed_at: string | null;
  /** Auditor assigned to this request. Null until assigned. */
  auditor: string | null;
  /** When the audit started (ISO 8601). Null until in-progress. */
  audit_started_at: string | null;
  /** When the audit completed (ISO 8601). Null until complete. */
  audit_completed_at: string | null;
  /** Array of checklist item IDs and their pass/fail outcome. */
  checklist_results: AuditChecklistResult[];
  /** Overall notes from the auditor. */
  auditor_notes: string | null;
  /** Badge issued upon successful certification. Null until CERTIFIED. */
  badge: CertificationBadge | null;
  /** Reason for failure or revocation, if applicable. */
  failure_reason: string | null;
}

/** Result for a single checklist item within an audit. */
export interface AuditChecklistResult {
  item_id: string;
  passed: boolean | null; // null = not yet evaluated
  notes: string | null;
  evaluated_at: string | null;
  evaluated_by: string | null; // 'automated' | auditor name
}

// ---------------------------------------------------------------------------
// Marketplace Integration
// ---------------------------------------------------------------------------

/** Certification status summary for marketplace plugin listings. */
export interface PluginCertificationSummary {
  plugin_id: string;
  is_certified: boolean;
  /** Highest achieved tier, or null if not certified. */
  highest_tier: CertificationTier | null;
  /** When certification expires, or null. */
  expires_at: string | null;
  /** Badge ID, or null if not certified. */
  badge_id: string | null;
  /** Whether certification is currently expired. */
  is_expired: boolean;
}

// ---------------------------------------------------------------------------
// SQL Schema
// ---------------------------------------------------------------------------

export const CERTIFICATION_SCHEMA_SQL = `
-- Plugin certification badges
CREATE TABLE IF NOT EXISTS plugin_certification_badges (
  badge_id        TEXT PRIMARY KEY,
  plugin_id       TEXT NOT NULL,
  plugin_version  TEXT NOT NULL,
  tier            TEXT NOT NULL CHECK (tier IN ('BRONZE', 'SILVER', 'GOLD')),
  issued_at       TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  issued_by       TEXT NOT NULL,
  verification_url TEXT NOT NULL,
  bundle_hash     TEXT NOT NULL
);

-- Audit requests and their lifecycle
CREATE TABLE IF NOT EXISTS plugin_audit_requests (
  request_id              TEXT PRIMARY KEY,
  plugin_id               TEXT NOT NULL,
  plugin_version          TEXT NOT NULL,
  tier                    TEXT NOT NULL CHECK (tier IN ('BRONZE', 'SILVER', 'GOLD')),
  submitted_by            TEXT NOT NULL,
  submitted_at            TEXT NOT NULL,
  status                  TEXT NOT NULL,
  price_usd_cents         INTEGER NOT NULL,
  payment_reference_id    TEXT,
  payment_confirmed_at    TEXT,
  auditor                 TEXT,
  audit_started_at        TEXT,
  audit_completed_at      TEXT,
  auditor_notes           TEXT,
  badge_id                TEXT REFERENCES plugin_certification_badges(badge_id),
  failure_reason          TEXT
);

-- Per-request checklist results
CREATE TABLE IF NOT EXISTS audit_checklist_results (
  id              TEXT PRIMARY KEY,
  request_id      TEXT NOT NULL REFERENCES plugin_audit_requests(request_id),
  item_id         TEXT NOT NULL,
  passed          INTEGER,  -- NULL=pending, 1=pass, 0=fail
  notes           TEXT,
  evaluated_at    TEXT,
  evaluated_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_badge_plugin_id ON plugin_certification_badges(plugin_id);
CREATE INDEX IF NOT EXISTS idx_audit_plugin_id ON plugin_audit_requests(plugin_id);
CREATE INDEX IF NOT EXISTS idx_audit_status    ON plugin_audit_requests(status);
`.trim();

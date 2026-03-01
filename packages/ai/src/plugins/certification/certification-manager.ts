/**
 * Plugin Certification Manager
 *
 * Orchestrates the full certification lifecycle:
 * - Accept audit request (Bronze is free and auto-approved)
 * - Confirm payment for paid tiers (Silver / Gold)
 * - Assign auditor and run checklist
 * - Issue certification badge with expiration
 * - Support marketplace listings query
 * - Revoke or expire badges
 *
 * @module plugins/certification/certification-manager
 */

import { randomUUID } from 'node:crypto';

import {
  CERTIFICATION_AUDIT_CHECKLIST,
  CERTIFICATION_PRICING_USD_CENTS,
  CERTIFICATION_VALIDITY_DAYS,
  type AuditChecklistResult,
  type AuditRequest,
  type CertificationBadge,
  type CertificationStatus,
  type CertificationTier,
  type PluginCertificationSummary,
} from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CertificationManagerConfig {
  /**
   * Base URL used to build badge verification links.
   * @default 'https://www.dcyfr.ai/plugins/certification'
   */
  verificationBaseUrl?: string;
  /**
   * Who issues the certificates — appears in the badge.
   * @default 'DCYFR Security Team'
   */
  issuingAuthority?: string;
  /**
   * Compute the bundle hash for a plugin at certification time.
   * Called with the plugin_id + version; defaults to a deterministic placeholder.
   * In production, replace with actual bundle integrity hash (e.g. SHA-256 of the tarball).
   */
  computeBundleHash?: (pluginId: string, version: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CertificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CertificationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// CertificationManager
// ---------------------------------------------------------------------------

/**
 * Manages the full plugin certification lifecycle.
 *
 * State is kept in-memory for testing; production implementations should
 * back this with a database (see CERTIFICATION_SCHEMA_SQL in types.ts).
 */
export class CertificationManager {
  private readonly requests = new Map<string, AuditRequest>();
  private readonly badges = new Map<string, CertificationBadge>();

  private readonly verificationBaseUrl: string;
  private readonly issuingAuthority: string;
  private readonly computeBundleHash: (pluginId: string, version: string) => Promise<string>;

  constructor(config: CertificationManagerConfig = {}) {
    this.verificationBaseUrl =
      config.verificationBaseUrl ?? 'https://www.dcyfr.ai/plugins/certification';
    this.issuingAuthority = config.issuingAuthority ?? 'DCYFR Security Team';
    this.computeBundleHash =
      config.computeBundleHash ??
      (async (pluginId: string, version: string) =>
        `sha256-placeholder-${pluginId}-${version}`);
  }

  // -------------------------------------------------------------------------
  // 17.1 / 17.3 — Submit audit request (free Bronze auto-approved; paid tiers await payment)
  // -------------------------------------------------------------------------

  /**
   * Submit a certification request for a plugin.
   *
   * Bronze: Immediately moves to `PAYMENT_RECEIVED` (free, no payment needed).
   * Silver/Gold: Moves to `PENDING_PAYMENT`; caller must supply payment_reference_id
   *              then call `confirmPayment()`.
   */
  submitAuditRequest(
    pluginId: string,
    version: string,
    tier: CertificationTier,
    submittedBy: string,
  ): AuditRequest {
    const requestId = randomUUID();
    const priceCents = CERTIFICATION_PRICING_USD_CENTS[tier];
    const now = new Date().toISOString();

    // Build checklist stubs for items required at this tier
    const checklistResults: AuditChecklistResult[] = CERTIFICATION_AUDIT_CHECKLIST.filter(
      (item) => item.required_for_tiers.includes(tier),
    ).map((item) => ({
      item_id: item.item_id,
      passed: null,
      notes: null,
      evaluated_at: null,
      evaluated_by: null,
    }));

    const request: AuditRequest = {
      request_id: requestId,
      plugin_id: pluginId,
      plugin_version: version,
      tier,
      submitted_by: submittedBy,
      submitted_at: now,
      // Bronze is free → skip payment step
      status: priceCents === 0 ? 'PAYMENT_RECEIVED' : 'PENDING_PAYMENT',
      price_usd_cents: priceCents,
      payment_reference_id: null,
      payment_confirmed_at: priceCents === 0 ? now : null,
      auditor: null,
      audit_started_at: null,
      audit_completed_at: null,
      checklist_results: checklistResults,
      auditor_notes: null,
      badge: null,
      failure_reason: null,
    };

    this.requests.set(requestId, request);
    return request;
  }

  // -------------------------------------------------------------------------
  // 17.3 — Confirm payment for paid tiers
  // -------------------------------------------------------------------------

  /**
   * Record payment confirmation.
   * Moves request from `PENDING_PAYMENT` → `PAYMENT_RECEIVED`.
   *
   * @param requestId  The audit request ID.
   * @param paymentRefId  Payment provider reference (e.g. Stripe PaymentIntent ID).
   */
  confirmPayment(requestId: string, paymentRefId: string): AuditRequest {
    const request = this.getRequestOrThrow(requestId);

    if (request.status !== 'PENDING_PAYMENT') {
      throw new CertificationError(
        `Request ${requestId} is not awaiting payment (status: ${request.status})`,
        'INVALID_STATUS',
      );
    }

    request.payment_reference_id = paymentRefId;
    request.payment_confirmed_at = new Date().toISOString();
    request.status = 'PAYMENT_RECEIVED';
    return request;
  }

  // -------------------------------------------------------------------------
  // 17.4 — Assign auditor and start audit
  // -------------------------------------------------------------------------

  /**
   * Assign an auditor and begin the audit.
   * Moves request from `PAYMENT_RECEIVED` → `IN_AUDIT`.
   */
  startAudit(requestId: string, auditor: string): AuditRequest {
    const request = this.getRequestOrThrow(requestId);

    if (request.status !== 'PAYMENT_RECEIVED') {
      throw new CertificationError(
        `Request ${requestId} is not ready to start audit (status: ${request.status})`,
        'INVALID_STATUS',
      );
    }

    request.auditor = auditor;
    request.audit_started_at = new Date().toISOString();
    request.status = 'IN_AUDIT';
    return request;
  }

  // -------------------------------------------------------------------------
  // 17.4 — Record individual checklist item results
  // -------------------------------------------------------------------------

  /**
   * Record the result for a single audit checklist item.
   */
  recordChecklistResult(
    requestId: string,
    itemId: string,
    passed: boolean,
    evaluatedBy: string,
    notes?: string,
  ): AuditRequest {
    const request = this.getRequestOrThrow(requestId);

    if (request.status !== 'IN_AUDIT') {
      throw new CertificationError(
        `Request ${requestId} is not IN_AUDIT (status: ${request.status})`,
        'INVALID_STATUS',
      );
    }

    const item = request.checklist_results.find((r) => r.item_id === itemId);
    if (!item) {
      throw new CertificationError(
        `Checklist item ${itemId} not found in request ${requestId}`,
        'CHECKLIST_ITEM_NOT_FOUND',
      );
    }

    item.passed = passed;
    item.notes = notes ?? null;
    item.evaluated_at = new Date().toISOString();
    item.evaluated_by = evaluatedBy;
    return request;
  }

  // -------------------------------------------------------------------------
  // 17.2 / 17.5 — Complete audit and issue badge (or fail)
  // -------------------------------------------------------------------------

  /**
   * Complete the audit.
   * - If all required checklist items passed → issue badge and move to `CERTIFIED`.
   * - If any required item failed → move to `FAILED`.
   */
  async completeAudit(requestId: string, auditorNotes?: string): Promise<AuditRequest> {
    const request = this.getRequestOrThrow(requestId);

    if (request.status !== 'IN_AUDIT') {
      throw new CertificationError(
        `Request ${requestId} is not IN_AUDIT (status: ${request.status})`,
        'INVALID_STATUS',
      );
    }

    // Verify all checklist items have been evaluated
    const unevaluated = request.checklist_results.filter((r) => r.passed === null);
    if (unevaluated.length > 0) {
      throw new CertificationError(
        `Audit incomplete: ${unevaluated.length} checklist items not yet evaluated (${unevaluated.map((r) => r.item_id).join(', ')})`,
        'AUDIT_INCOMPLETE',
      );
    }

    const failedItems = request.checklist_results.filter((r) => r.passed === false);
    request.audit_completed_at = new Date().toISOString();
    request.auditor_notes = auditorNotes ?? null;

    if (failedItems.length > 0) {
      request.status = 'FAILED';
      request.failure_reason = `Failed ${failedItems.length} checklist item(s): ${failedItems.map((r) => r.item_id).join(', ')}`;
      return request;
    }

    // All passed → issue badge
    const badge = await this.issueBadge(request);
    request.badge = badge;
    request.status = 'CERTIFIED';
    this.badges.set(badge.badge_id, badge);
    return request;
  }

  // -------------------------------------------------------------------------
  // 17.2 — Badge system (internal)
  // -------------------------------------------------------------------------

  private async issueBadge(request: AuditRequest): Promise<CertificationBadge> {
    const badgeId = randomUUID();
    const issuedAt = new Date();
    const validityDays = CERTIFICATION_VALIDITY_DAYS[request.tier];
    const expiresAt = new Date(issuedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);

    const bundleHash = await this.computeBundleHash(
      request.plugin_id,
      request.plugin_version,
    );

    return {
      badge_id: badgeId,
      plugin_id: request.plugin_id,
      plugin_version: request.plugin_version,
      tier: request.tier,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      issued_by: this.issuingAuthority,
      verification_url: `${this.verificationBaseUrl}/${badgeId}`,
      bundle_hash: bundleHash,
    };
  }

  // -------------------------------------------------------------------------
  // Badge expiration / revocation
  // -------------------------------------------------------------------------

  /**
   * Check whether a badge is currently valid (not expired, not revoked).
   */
  isBadgeValid(badgeId: string): boolean {
    const badge = this.badges.get(badgeId);
    if (!badge) return false;
    return new Date(badge.expires_at) > new Date();
  }

  /**
   * Revoke a certification badge by cancelling the associated request.
   * Moves the request to `REVOKED`.
   */
  revokeCertification(requestId: string, reason: string): AuditRequest {
    const request = this.getRequestOrThrow(requestId);

    if (request.status !== 'CERTIFIED') {
      throw new CertificationError(
        `Request ${requestId} is not CERTIFIED (status: ${request.status})`,
        'INVALID_STATUS',
      );
    }

    request.status = 'REVOKED';
    request.failure_reason = reason;

    // Remove badge from active index
    if (request.badge) {
      this.badges.delete(request.badge.badge_id);
    }

    return request;
  }

  // -------------------------------------------------------------------------
  // 17.5 — Marketplace listing: certification summary
  // -------------------------------------------------------------------------

  /**
   * Returns the current certification summary for a plugin (for marketplace display).
   * Returns the most recently certified, non-revoked request if one exists.
   */
  getPluginCertificationSummary(pluginId: string): PluginCertificationSummary {
    // Find all CERTIFIED requests for this plugin, sorted newest first
    const certified = Array.from(this.requests.values())
      .filter((r) => r.plugin_id === pluginId && r.status === 'CERTIFIED' && r.badge)
      .sort((a, b) =>
        new Date(b.audit_completed_at ?? 0).getTime() -
        new Date(a.audit_completed_at ?? 0).getTime(),
      );

    if (certified.length === 0) {
      return {
        plugin_id: pluginId,
        is_certified: false,
        highest_tier: null,
        expires_at: null,
        badge_id: null,
        is_expired: false,
      };
    }

    // Pick the highest tier among active (non-expired) certifications
    const tierOrder: CertificationTier[] = ['GOLD', 'SILVER', 'BRONZE'];
    let bestTier: CertificationTier | null = null;
    let bestBadgeId: string | null = null;
    let bestExpiresAt: string | null = null;
    let isExpired = true;

    for (const tier of tierOrder) {
      const req = certified.find((r) => r.tier === tier);
      if (req?.badge) {
        const expired = new Date(req.badge.expires_at) <= new Date();
        if (!expired) {
          bestTier = tier;
          bestBadgeId = req.badge.badge_id;
          bestExpiresAt = req.badge.expires_at;
          isExpired = false;
          break;
        } else if (!bestTier) {
          // All expired — still show the most recent
          bestTier = tier;
          bestBadgeId = req.badge.badge_id;
          bestExpiresAt = req.badge.expires_at;
          isExpired = true;
        }
      }
    }

    return {
      plugin_id: pluginId,
      is_certified: !isExpired,
      highest_tier: bestTier,
      expires_at: bestExpiresAt,
      badge_id: bestBadgeId,
      is_expired: isExpired,
    };
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  getRequest(requestId: string): AuditRequest | null {
    return this.requests.get(requestId) ?? null;
  }

  getRequestsByPlugin(pluginId: string): AuditRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.plugin_id === pluginId);
  }

  getRequestsByStatus(status: CertificationStatus): AuditRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === status);
  }

  getBadge(badgeId: string): CertificationBadge | null {
    return this.badges.get(badgeId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private getRequestOrThrow(requestId: string): AuditRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new CertificationError(
        `Audit request ${requestId} not found`,
        'REQUEST_NOT_FOUND',
      );
    }
    return request;
  }
}

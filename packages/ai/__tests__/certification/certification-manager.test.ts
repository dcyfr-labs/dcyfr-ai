/**
 * Phase 17 — Plugin Certification Program Tests
 *
 * Validates CertificationManager lifecycle: request submission, payment,
 * audit checklist, badge issuance/expiry/revocation, and marketplace summaries.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  CertificationManager,
  CertificationError,
} from '../../src/plugins/certification/certification-manager.js';
import {
  CERTIFICATION_AUDIT_CHECKLIST,
  CERTIFICATION_PRICING_USD_CENTS,
  CERTIFICATION_VALIDITY_DAYS,
  CERTIFICATION_TIER_LABELS,
  CERTIFICATION_SCHEMA_SQL,
} from '../../src/plugins/certification/types.js';
import type { CertificationTier } from '../../src/plugins/certification/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run all required checklist items for a request in one pass, all passing. */
async function runFullChecklist(
  manager: CertificationManager,
  requestId: string,
  pass = true,
  evaluatedBy = 'automated',
): Promise<void> {
  const request = manager.getRequest(requestId)!;
  for (const item of request.checklist_results) {
    manager.recordChecklistResult(requestId, item.item_id, pass, evaluatedBy);
  }
}

/** Helper to fully certify a plugin at a given tier. Returns the completed request. */
async function fullyCertify(
  manager: CertificationManager,
  pluginId: string,
  version: string,
  tier: CertificationTier,
) {
  const req = manager.submitAuditRequest(pluginId, version, tier, 'author@example.com');

  if (tier !== 'BRONZE') {
    manager.confirmPayment(req.request_id, `pi_${tier.toLowerCase()}_test`);
  }

  manager.startAudit(req.request_id, 'auditor@dcyfr.ai');
  await runFullChecklist(manager, req.request_id);
  return manager.completeAudit(req.request_id, 'All checks passed');
}

// ---------------------------------------------------------------------------
// Types / Constants
// ---------------------------------------------------------------------------

describe('CERTIFICATION_PRICING_USD_CENTS', () => {
  it('Bronze is free (0 cents)', () => {
    expect(CERTIFICATION_PRICING_USD_CENTS.BRONZE).toBe(0);
  });

  it('Silver costs $499', () => {
    expect(CERTIFICATION_PRICING_USD_CENTS.SILVER).toBe(49900);
  });

  it('Gold costs $2,499', () => {
    expect(CERTIFICATION_PRICING_USD_CENTS.GOLD).toBe(249900);
  });
});

describe('CERTIFICATION_VALIDITY_DAYS', () => {
  it('Bronze valid for 90 days', () => {
    expect(CERTIFICATION_VALIDITY_DAYS.BRONZE).toBe(90);
  });

  it('Silver valid for 180 days', () => {
    expect(CERTIFICATION_VALIDITY_DAYS.SILVER).toBe(180);
  });

  it('Gold valid for 365 days', () => {
    expect(CERTIFICATION_VALIDITY_DAYS.GOLD).toBe(365);
  });
});

describe('CERTIFICATION_TIER_LABELS', () => {
  it('has human-readable labels for all tiers', () => {
    expect(CERTIFICATION_TIER_LABELS.BRONZE).toBe('Bronze');
    expect(CERTIFICATION_TIER_LABELS.SILVER).toBe('Silver');
    expect(CERTIFICATION_TIER_LABELS.GOLD).toBe('Gold');
  });
});

describe('CERTIFICATION_AUDIT_CHECKLIST', () => {
  it('has items required for Bronze', () => {
    const bronzeItems = CERTIFICATION_AUDIT_CHECKLIST.filter((i) =>
      i.required_for_tiers.includes('BRONZE'),
    );
    expect(bronzeItems.length).toBeGreaterThan(0);
  });

  it('has more items required for Gold than Bronze', () => {
    const bronze = CERTIFICATION_AUDIT_CHECKLIST.filter((i) =>
      i.required_for_tiers.includes('BRONZE'),
    ).length;
    const gold = CERTIFICATION_AUDIT_CHECKLIST.filter((i) =>
      i.required_for_tiers.includes('GOLD'),
    ).length;
    expect(gold).toBeGreaterThan(bronze);
  });

  it('every item has a unique item_id', () => {
    const ids = CERTIFICATION_AUDIT_CHECKLIST.map((i) => i.item_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('contains all expected categories', () => {
    const categories = new Set(CERTIFICATION_AUDIT_CHECKLIST.map((i) => i.category));
    expect(categories).toContain('AUTOMATED_SCAN');
    expect(categories).toContain('PERMISSION_REVIEW');
    expect(categories).toContain('CODE_QUALITY');
    expect(categories).toContain('SECURITY_MANUAL');
    expect(categories).toContain('PENETRATION_TEST');
  });

  it('PENETRATION_TEST items are Gold-only', () => {
    const penItems = CERTIFICATION_AUDIT_CHECKLIST.filter(
      (i) => i.category === 'PENETRATION_TEST',
    );
    for (const item of penItems) {
      expect(item.required_for_tiers).toContain('GOLD');
      expect(item.required_for_tiers).not.toContain('BRONZE');
    }
  });
});

describe('CERTIFICATION_SCHEMA_SQL', () => {
  it('is a non-empty string', () => {
    expect(typeof CERTIFICATION_SCHEMA_SQL).toBe('string');
    expect(CERTIFICATION_SCHEMA_SQL.length).toBeGreaterThan(0);
  });

  it('creates 3 tables', () => {
    const matches = CERTIFICATION_SCHEMA_SQL.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];
    expect(matches.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// CertificationManager — Bronze (free auto-approved path)
// ---------------------------------------------------------------------------

describe('CertificationManager — Bronze path', () => {
  let manager: CertificationManager;

  beforeEach(() => {
    manager = new CertificationManager();
  });

  it('submitAuditRequest for Bronze → PAYMENT_RECEIVED (skips payment step)', () => {
    const req = manager.submitAuditRequest('plugin-x', '1.0.0', 'BRONZE', 'author@example.com');
    expect(req.status).toBe('PAYMENT_RECEIVED');
    expect(req.price_usd_cents).toBe(0);
    expect(req.payment_confirmed_at).not.toBeNull();
  });

  it('can start audit immediately after Bronze submission', () => {
    const req = manager.submitAuditRequest('plugin-x', '1.0.0', 'BRONZE', 'author@example.com');
    const updated = manager.startAudit(req.request_id, 'scanner-bot');
    expect(updated.status).toBe('IN_AUDIT');
    expect(updated.auditor).toBe('scanner-bot');
    expect(updated.audit_started_at).not.toBeNull();
  });

  it('checklist results are seeded with all Bronze-required items (passed=null)', () => {
    const req = manager.submitAuditRequest('plugin-x', '1.0.0', 'BRONZE', 'author@example.com');
    expect(req.checklist_results.length).toBeGreaterThan(0);
    for (const r of req.checklist_results) {
      expect(r.passed).toBeNull();
    }
    // None should be Gold-only items (PENETRATION_TEST)
    const penItemIds = CERTIFICATION_AUDIT_CHECKLIST.filter(
      (i) => i.category === 'PENETRATION_TEST',
    ).map((i) => i.item_id);
    for (const r of req.checklist_results) {
      expect(penItemIds).not.toContain(r.item_id);
    }
  });

  it('completeAudit when all items pass → status CERTIFIED + badge issued', async () => {
    const req = manager.submitAuditRequest('plugin-x', '1.0.0', 'BRONZE', 'author@example.com');
    manager.startAudit(req.request_id, 'bot');
    await runFullChecklist(manager, req.request_id);
    const completed = await manager.completeAudit(req.request_id, 'All clear');

    expect(completed.status).toBe('CERTIFIED');
    expect(completed.badge).not.toBeNull();
    expect(completed.badge?.tier).toBe('BRONZE');
    expect(completed.badge?.plugin_id).toBe('plugin-x');
    expect(completed.badge?.issued_by).toBe('DCYFR Security Team');
    expect(completed.badge?.verification_url).toContain('dcyfr.ai');
    expect(completed.badge?.bundle_hash).toBeTruthy();
  });

  it('badge expires_at is ~90 days from now', async () => {
    const req = manager.submitAuditRequest('plugin-x', '1.0.0', 'BRONZE', 'author@example.com');
    manager.startAudit(req.request_id, 'bot');
    await runFullChecklist(manager, req.request_id);
    const completed = await manager.completeAudit(req.request_id);

    const issued = new Date(completed.badge!.issued_at);
    const expires = new Date(completed.badge!.expires_at);
    const diffDays = (expires.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(90, 0);
  });

  it('completeAudit when any item fails → status FAILED + failure_reason set', async () => {
    const req = manager.submitAuditRequest('plugin-x', '1.0.0', 'BRONZE', 'author@example.com');
    manager.startAudit(req.request_id, 'bot');
    // Pass all except the first
    const items = [...req.checklist_results];
    manager.recordChecklistResult(req.request_id, items[0].item_id, false, 'bot', 'CVE found');
    for (const item of items.slice(1)) {
      manager.recordChecklistResult(req.request_id, item.item_id, true, 'bot');
    }
    const completed = await manager.completeAudit(req.request_id);

    expect(completed.status).toBe('FAILED');
    expect(completed.badge).toBeNull();
    expect(completed.failure_reason).toContain(items[0].item_id);
  });

  it('completeAudit throws if any checklist items are unevaluated', async () => {
    const req = manager.submitAuditRequest('plugin-x', '1.0.0', 'BRONZE', 'author@example.com');
    manager.startAudit(req.request_id, 'bot');
    // Do NOT evaluate any items
    await expect(manager.completeAudit(req.request_id)).rejects.toThrow(CertificationError);
  });
});

// ---------------------------------------------------------------------------
// CertificationManager — Silver paid path
// ---------------------------------------------------------------------------

describe('CertificationManager — Silver paid path', () => {
  let manager: CertificationManager;

  beforeEach(() => {
    manager = new CertificationManager();
  });

  it('submitAuditRequest for Silver → PENDING_PAYMENT', () => {
    const req = manager.submitAuditRequest('plugin-y', '1.0.0', 'SILVER', 'dev@example.com');
    expect(req.status).toBe('PENDING_PAYMENT');
    expect(req.price_usd_cents).toBe(49900);
    expect(req.payment_confirmed_at).toBeNull();
  });

  it('cannot start audit before confirming payment', () => {
    const req = manager.submitAuditRequest('plugin-y', '1.0.0', 'SILVER', 'dev@example.com');
    expect(() => manager.startAudit(req.request_id, 'auditor')).toThrow(CertificationError);
  });

  it('confirmPayment moves to PAYMENT_RECEIVED and records ref ID', () => {
    const req = manager.submitAuditRequest('plugin-y', '1.0.0', 'SILVER', 'dev@example.com');
    const updated = manager.confirmPayment(req.request_id, 'pi_test_abc123');
    expect(updated.status).toBe('PAYMENT_RECEIVED');
    expect(updated.payment_reference_id).toBe('pi_test_abc123');
    expect(updated.payment_confirmed_at).not.toBeNull();
  });

  it('confirmPayment on non-PENDING_PAYMENT request throws', () => {
    const req = manager.submitAuditRequest('plugin-y', '1.0.0', 'BRONZE', 'dev@example.com');
    // Bronze auto-proceeds, not pending payment
    expect(() => manager.confirmPayment(req.request_id, 'pi_test')).toThrow(CertificationError);
  });

  it('Silver badge expires in ~180 days', async () => {
    const completed = await fullyCertify(manager, 'plugin-s', '1.0.0', 'SILVER');
    const issued = new Date(completed.badge!.issued_at);
    const expires = new Date(completed.badge!.expires_at);
    const diffDays = (expires.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(180, 0);
  });

  it('Silver checklist includes CODE_QUALITY and SECURITY_MANUAL items', () => {
    const req = manager.submitAuditRequest('plugin-y', '2.0.0', 'SILVER', 'dev@example.com');
    const categories = new Set(
      req.checklist_results.map((r) => {
        const item = CERTIFICATION_AUDIT_CHECKLIST.find((c) => c.item_id === r.item_id);
        return item?.category;
      }),
    );
    expect(categories).toContain('CODE_QUALITY');
    expect(categories).toContain('SECURITY_MANUAL');
  });
});

// ---------------------------------------------------------------------------
// CertificationManager — Gold path
// ---------------------------------------------------------------------------

describe('CertificationManager — Gold path', () => {
  let manager: CertificationManager;

  beforeEach(() => {
    manager = new CertificationManager();
  });

  it('Gold badge expires in ~365 days', async () => {
    const completed = await fullyCertify(manager, 'plugin-g', '1.0.0', 'GOLD');
    const issued = new Date(completed.badge!.issued_at);
    const expires = new Date(completed.badge!.expires_at);
    const diffDays = (expires.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(365, 0);
  });

  it('Gold checklist includes PENETRATION_TEST items', () => {
    const req = manager.submitAuditRequest('plugin-g', '1.0.0', 'GOLD', 'firm@example.com');
    const penItems = req.checklist_results.filter((r) => r.item_id.startsWith('PEN-'));
    expect(penItems.length).toBeGreaterThan(0);
  });

  it('Gold price is $2,499', () => {
    const req = manager.submitAuditRequest('plugin-g', '1.0.0', 'GOLD', 'firm@example.com');
    expect(req.price_usd_cents).toBe(249900);
  });
});

// ---------------------------------------------------------------------------
// Badge validation + revocation
// ---------------------------------------------------------------------------

describe('Badge validation and revocation', () => {
  let manager: CertificationManager;

  beforeEach(() => {
    manager = new CertificationManager();
  });

  it('isBadgeValid returns true for a freshly issued badge', async () => {
    const completed = await fullyCertify(manager, 'plugin-v', '1.0.0', 'BRONZE');
    expect(completed.badge).not.toBeNull();
    expect(manager.isBadgeValid(completed.badge!.badge_id)).toBe(true);
  });

  it('isBadgeValid returns false for an unknown badge ID', () => {
    expect(manager.isBadgeValid('non-existent-badge-id')).toBe(false);
  });

  it('getBadge returns the badge by ID', async () => {
    const completed = await fullyCertify(manager, 'plugin-b', '2.0.0', 'BRONZE');
    const badge = manager.getBadge(completed.badge!.badge_id);
    expect(badge).not.toBeNull();
    expect(badge?.plugin_id).toBe('plugin-b');
    expect(badge?.tier).toBe('BRONZE');
  });

  it('revokeCertification moves request to REVOKED and removes badge from active index', async () => {
    const completed = await fullyCertify(manager, 'plugin-r', '1.0.0', 'SILVER');
    const badgeId = completed.badge!.badge_id;
    expect(manager.isBadgeValid(badgeId)).toBe(true);

    manager.revokeCertification(completed.request_id, 'Critical CVE discovered post-certification');

    const request = manager.getRequest(completed.request_id)!;
    expect(request.status).toBe('REVOKED');
    expect(request.failure_reason).toContain('CVE');
    expect(manager.isBadgeValid(badgeId)).toBe(false);
    expect(manager.getBadge(badgeId)).toBeNull();
  });

  it('revokeCertification throws if request is not CERTIFIED', async () => {
    const req = manager.submitAuditRequest('plugin-r2', '1.0.0', 'BRONZE', 'author@example.com');
    expect(() => manager.revokeCertification(req.request_id, 'test')).toThrow(CertificationError);
  });

  it('custom computeBundleHash is called and appears in badge', async () => {
    const customManager = new CertificationManager({
      computeBundleHash: async (id, ver) => `custom-hash-${id}-${ver}`,
    });
    const completed = await fullyCertify(customManager, 'custom-plugin', '3.0.0', 'BRONZE');
    expect(completed.badge?.bundle_hash).toBe('custom-hash-custom-plugin-3.0.0');
  });
});

// ---------------------------------------------------------------------------
// Marketplace summary
// ---------------------------------------------------------------------------

describe('getPluginCertificationSummary', () => {
  let manager: CertificationManager;

  beforeEach(() => {
    manager = new CertificationManager();
  });

  it('returns is_certified=false for a plugin with no requests', () => {
    const summary = manager.getPluginCertificationSummary('unknown-plugin');
    expect(summary.is_certified).toBe(false);
    expect(summary.highest_tier).toBeNull();
    expect(summary.badge_id).toBeNull();
    expect(summary.is_expired).toBe(false);
  });

  it('returns is_certified=true for a freshly certified plugin', async () => {
    await fullyCertify(manager, 'mkt-plugin', '1.0.0', 'BRONZE');
    const summary = manager.getPluginCertificationSummary('mkt-plugin');
    expect(summary.is_certified).toBe(true);
    expect(summary.highest_tier).toBe('BRONZE');
    expect(summary.badge_id).toBeTruthy();
    expect(summary.is_expired).toBe(false);
  });

  it('prefers highest tier (GOLD > SILVER > BRONZE)', async () => {
    // Certify Bronze then Gold
    await fullyCertify(manager, 'multi-tier', '1.0.0', 'BRONZE');
    await fullyCertify(manager, 'multi-tier', '1.0.0', 'GOLD');
    const summary = manager.getPluginCertificationSummary('multi-tier');
    expect(summary.highest_tier).toBe('GOLD');
  });

  it('returns is_certified=false after revocation', async () => {
    const completed = await fullyCertify(manager, 'revoked-plugin', '1.0.0', 'SILVER');
    manager.revokeCertification(completed.request_id, 'Policy violation');
    const summary = manager.getPluginCertificationSummary('revoked-plugin');
    expect(summary.is_certified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('CertificationManager — error handling', () => {
  let manager: CertificationManager;

  beforeEach(() => {
    manager = new CertificationManager();
  });

  it('getRequest returns null for unknown ID', () => {
    expect(manager.getRequest('does-not-exist')).toBeNull();
  });

  it('startAudit throws for unknown request ID', () => {
    expect(() => manager.startAudit('unknown-id', 'auditor')).toThrow(CertificationError);
  });

  it('recordChecklistResult throws for unknown request ID', () => {
    expect(() =>
      manager.recordChecklistResult('unknown-id', 'AUTO-001', true, 'bot'),
    ).toThrow(CertificationError);
  });

  it('recordChecklistResult throws for unknown item ID in a valid request', () => {
    const req = manager.submitAuditRequest('p', '1.0.0', 'BRONZE', 'a@b.com');
    manager.startAudit(req.request_id, 'bot');
    expect(() =>
      manager.recordChecklistResult(req.request_id, 'INVALID-ITEM-XYZ', true, 'bot'),
    ).toThrow(CertificationError);
  });

  it('recordChecklistResult throws when request is not IN_AUDIT', () => {
    const req = manager.submitAuditRequest('p', '1.0.0', 'BRONZE', 'a@b.com');
    // Not yet started
    const firstItem = req.checklist_results[0].item_id;
    expect(() =>
      manager.recordChecklistResult(req.request_id, firstItem, true, 'bot'),
    ).toThrow(CertificationError);
  });

  it('startAudit throws if called again when request is already IN_AUDIT', () => {
    const req = manager.submitAuditRequest('p', '1.0.0', 'BRONZE', 'a@b.com');
    manager.startAudit(req.request_id, 'bot');
    expect(() => manager.startAudit(req.request_id, 'bot2')).toThrow(CertificationError);
  });

  it('getRequestsByPlugin returns all requests for a plugin', async () => {
    manager.submitAuditRequest('multi', '1.0.0', 'BRONZE', 'a@b.com');
    manager.submitAuditRequest('multi', '2.0.0', 'BRONZE', 'a@b.com');
    const all = manager.getRequestsByPlugin('multi');
    expect(all).toHaveLength(2);
  });

  it('getRequestsByStatus returns filtered requests', async () => {
    manager.submitAuditRequest('s1', '1.0.0', 'BRONZE', 'a@b.com');
    manager.submitAuditRequest('s2', '1.0.0', 'SILVER', 'a@b.com');
    const pending = manager.getRequestsByStatus('PENDING_PAYMENT');
    expect(pending).toHaveLength(1);
    expect(pending[0].plugin_id).toBe('s2');
  });

  it('CertificationError has correct name and code', () => {
    const err = new CertificationError('test message', 'TEST_CODE');
    expect(err.name).toBe('CertificationError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof CertificationError).toBe(true);
  });
});

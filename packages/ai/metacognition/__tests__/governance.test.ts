/**
 * Governance guard tests — tasks 4.2 and 4.3
 * TLP:AMBER - Internal Use Only
 */

import { describe, it, expect } from 'vitest';
import {
  checkProductionPromotionPolicy,
  checkTlpRedGate,
  checkGovernance,
  assertGovernanceConfigValid,
} from '../governance.js';
import { DEFAULT_GOVERNANCE_CONFIG } from '../types.js';

// ---------------------------------------------------------------------------
// 4.2 — Production promotion guard
// ---------------------------------------------------------------------------

describe('checkProductionPromotionPolicy', () => {
  it('allows any policy for non_production scope', () => {
    expect(checkProductionPromotionPolicy(
      { scope: 'non_production', tlp_classification: 'GREEN' },
      'direct_inspection',
    )).toEqual({ allowed: true });
  });

  it('allows any policy for production_indirect scope', () => {
    expect(checkProductionPromotionPolicy(
      { scope: 'production_indirect', tlp_classification: 'GREEN' },
      'direct_inspection',
    )).toEqual({ allowed: true });
  });

  it('blocks direct_inspection for production_direct scope', () => {
    const result = checkProductionPromotionPolicy(
      { scope: 'production_direct', tlp_classification: 'GREEN' },
      'direct_inspection',
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.required).toBe('third_party_audit');
      expect(result.provided).toBe('direct_inspection');
    }
  });

  it('allows third_party_audit for production_direct scope', () => {
    expect(checkProductionPromotionPolicy(
      { scope: 'production_direct', tlp_classification: 'GREEN' },
      'third_party_audit',
    )).toEqual({ allowed: true });
  });

  it('allows cryptographic_proof for production_direct (stronger than required)', () => {
    expect(checkProductionPromotionPolicy(
      { scope: 'production_direct', tlp_classification: 'GREEN' },
      'cryptographic_proof',
    )).toEqual({ allowed: true });
  });

  it('allows human_required for production_direct (strongest)', () => {
    expect(checkProductionPromotionPolicy(
      { scope: 'production_direct', tlp_classification: 'GREEN' },
      'human_required',
    )).toEqual({ allowed: true });
  });
});

// ---------------------------------------------------------------------------
// 4.3 — TLP:RED hard gate
// ---------------------------------------------------------------------------

describe('checkTlpRedGate', () => {
  it('allows any policy for non-RED classifications', () => {
    for (const tlp of ['WHITE', 'GREEN', 'AMBER'] as const) {
      expect(checkTlpRedGate(
        { tlp_classification: tlp },
        'direct_inspection',
      )).toEqual({ allowed: true });
    }
  });

  it('blocks direct_inspection for TLP:RED', () => {
    const result = checkTlpRedGate({ tlp_classification: 'RED' }, 'direct_inspection');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.required).toBe('human_required');
      expect(result.provided).toBe('direct_inspection');
    }
  });

  it('blocks third_party_audit for TLP:RED', () => {
    const result = checkTlpRedGate({ tlp_classification: 'RED' }, 'third_party_audit');
    expect(result.allowed).toBe(false);
  });

  it('blocks cryptographic_proof for TLP:RED (only human_required accepted)', () => {
    const result = checkTlpRedGate({ tlp_classification: 'RED' }, 'cryptographic_proof');
    expect(result.allowed).toBe(false);
  });

  it('allows human_required for TLP:RED', () => {
    expect(checkTlpRedGate({ tlp_classification: 'RED' }, 'human_required')).toEqual({ allowed: true });
  });
});

// ---------------------------------------------------------------------------
// Composite guard
// ---------------------------------------------------------------------------

describe('checkGovernance', () => {
  it('TLP:RED wins over production_direct — requires human_required', () => {
    const result = checkGovernance(
      { scope: 'production_direct', tlp_classification: 'RED' },
      'third_party_audit',
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.required).toBe('human_required');
  });

  it('passes when TLP:GREEN + production_direct + third_party_audit', () => {
    expect(checkGovernance(
      { scope: 'production_direct', tlp_classification: 'GREEN' },
      'third_party_audit',
    )).toEqual({ allowed: true });
  });

  it('passes when TLP:RED + human_required', () => {
    expect(checkGovernance(
      { scope: 'non_production', tlp_classification: 'RED' },
      'human_required',
    )).toEqual({ allowed: true });
  });

  it('passes when non_production + GREEN + direct_inspection', () => {
    expect(checkGovernance(
      { scope: 'non_production', tlp_classification: 'GREEN' },
      'direct_inspection',
    )).toEqual({ allowed: true });
  });
});

// ---------------------------------------------------------------------------
// Governance config invariant
// ---------------------------------------------------------------------------

describe('assertGovernanceConfigValid', () => {
  it('does not throw for the default config', () => {
    expect(() => assertGovernanceConfigValid(DEFAULT_GOVERNANCE_CONFIG)).not.toThrow();
  });

  it('throws if production_direct_min_policy is too weak', () => {
    expect(() => assertGovernanceConfigValid({
      ...DEFAULT_GOVERNANCE_CONFIG,
      production_direct_min_policy: 'direct_inspection',
    })).toThrow('production_direct_min_policy');
  });

  it('throws if tlp_red_policy is not human_required', () => {
    expect(() => assertGovernanceConfigValid({
      ...DEFAULT_GOVERNANCE_CONFIG,
      tlp_red_policy: 'third_party_audit',
    })).toThrow('tlp_red_policy');
  });
});

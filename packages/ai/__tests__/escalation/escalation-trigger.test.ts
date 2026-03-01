/**
 * Escalation Trigger Tests
 *
 * TLP:AMBER - Internal Use Only
 *
 * @module __tests__/escalation/escalation-trigger.test.ts
 * @version 1.0.0
 * @date 2026-02-28
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EscalationTrigger,
} from '../../src/plugins/escalation/escalation-trigger';
import type { PluginMetrics } from '../../src/plugins/escalation/escalation-trigger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetrics(overrides: Partial<PluginMetrics> = {}): PluginMetrics {
  return {
    pluginId:      'alice/my-plugin',
    downloads:     150,
    averageRating: 4.5,
    ratingCount:   20,
    trustScore:    92,
    lastUpdated:   '2026-02-28T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('EscalationTrigger — defaults', () => {
  it('uses default thresholds', () => {
    const trigger = new EscalationTrigger();
    const t = trigger.getThresholds();
    expect(t.minDownloads).toBe(100);
    expect(t.minRating).toBe(4);
    expect(t.minRatingCount).toBe(5);
    expect(t.minTrustScore).toBe(85);
  });

  it('merges custom thresholds over defaults', () => {
    const trigger = new EscalationTrigger({ minDownloads: 50 });
    expect(trigger.getThresholds().minDownloads).toBe(50);
    expect(trigger.getThresholds().minRating).toBe(4); // default
  });
});

// ---------------------------------------------------------------------------
// evaluate() — eligibility checks
// ---------------------------------------------------------------------------

describe('EscalationTrigger.evaluate()', () => {
  let trigger: EscalationTrigger;

  beforeEach(() => { trigger = new EscalationTrigger(); });

  it('returns eligible=true when all thresholds met', () => {
    const result = trigger.evaluate(makeMetrics());
    expect(result.eligible).toBe(true);
    expect(result.checks.downloadsPass).toBe(true);
    expect(result.checks.ratingPass).toBe(true);
    expect(result.checks.ratingCountPass).toBe(true);
    expect(result.checks.trustScorePass).toBe(true);
  });

  it('returns eligible=false when downloads below threshold', () => {
    const result = trigger.evaluate(makeMetrics({ downloads: 50 }));
    expect(result.eligible).toBe(false);
    expect(result.checks.downloadsPass).toBe(false);
  });

  it('returns eligible=false when rating below threshold', () => {
    const result = trigger.evaluate(makeMetrics({ averageRating: 3.9 }));
    expect(result.eligible).toBe(false);
    expect(result.checks.ratingPass).toBe(false);
  });

  it('returns eligible=false when rating count below threshold', () => {
    const result = trigger.evaluate(makeMetrics({ ratingCount: 3 }));
    expect(result.eligible).toBe(false);
    expect(result.checks.ratingCountPass).toBe(false);
  });

  it('returns eligible=false when trust score below threshold', () => {
    const result = trigger.evaluate(makeMetrics({ trustScore: 70 }));
    expect(result.eligible).toBe(false);
    expect(result.checks.trustScorePass).toBe(false);
  });

  it('returns eligible=true at exact threshold boundaries', () => {
    const result = trigger.evaluate(makeMetrics({
      downloads:     100,
      averageRating: 4,
      ratingCount:   5,
      trustScore:    85,
    }));
    expect(result.eligible).toBe(true);
  });

  it('reports alreadyEscalated=false for new plugin', () => {
    const result = trigger.evaluate(makeMetrics());
    expect(result.alreadyEscalated).toBe(false);
  });

  it('reports alreadyEscalated=true after escalation', () => {
    trigger.escalate(makeMetrics());
    const result = trigger.evaluate(makeMetrics());
    expect(result.alreadyEscalated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// escalate()
// ---------------------------------------------------------------------------

describe('EscalationTrigger.escalate()', () => {
  let trigger: EscalationTrigger;

  beforeEach(() => { trigger = new EscalationTrigger(); });

  it('creates a record with pending status', () => {
    const record = trigger.escalate(makeMetrics());
    expect(record.status).toBe('pending');
    expect(record.pluginId).toBe('alice/my-plugin');
  });

  it('assigns sequential IDs', () => {
    const r1 = trigger.escalate(makeMetrics({ pluginId: 'a/p1' }));
    const r2 = trigger.escalate(makeMetrics({ pluginId: 'a/p2' }));
    expect(r1.id).not.toBe(r2.id);
    expect(r1.id).toMatch(/^esc-/);
    expect(r2.id).toMatch(/^esc-/);
  });

  it('stores a metrics snapshot', () => {
    const metrics = makeMetrics({ downloads: 200 });
    const record = trigger.escalate(metrics);
    expect(record.metricsSnapshot.downloads).toBe(200);
  });

  it('throws if plugin already has pending escalation', () => {
    trigger.escalate(makeMetrics());
    expect(() => trigger.escalate(makeMetrics())).toThrow(/already has a pending escalation/);
  });

  it('allows re-escalation after completion', () => {
    const r1 = trigger.escalate(makeMetrics());
    trigger.updateStatus(r1.id, 'completed');
    const r2 = trigger.escalate(makeMetrics());
    expect(r2.id).not.toBe(r1.id);
    expect(r2.status).toBe('pending');
  });

  it('sets triggeredAt as ISO-8601 string', () => {
    const record = trigger.escalate(makeMetrics());
    expect(() => new Date(record.triggeredAt)).not.toThrow();
    expect(record.triggeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// evaluateAndEscalate()
// ---------------------------------------------------------------------------

describe('EscalationTrigger.evaluateAndEscalate()', () => {
  let trigger: EscalationTrigger;

  beforeEach(() => { trigger = new EscalationTrigger(); });

  it('returns record when eligible and not already escalated', () => {
    const result = trigger.evaluateAndEscalate(makeMetrics());
    expect(result).not.toBeNull();
    expect(result?.status).toBe('pending');
  });

  it('returns null when metrics below threshold', () => {
    const result = trigger.evaluateAndEscalate(makeMetrics({ downloads: 10 }));
    expect(result).toBeNull();
  });

  it('returns null when already escalated', () => {
    trigger.escalate(makeMetrics());
    const result = trigger.evaluateAndEscalate(makeMetrics());
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateStatus()
// ---------------------------------------------------------------------------

describe('EscalationTrigger.updateStatus()', () => {
  let trigger: EscalationTrigger;

  beforeEach(() => { trigger = new EscalationTrigger(); });

  it('updates status to scheduled', () => {
    const r = trigger.escalate(makeMetrics());
    const updated = trigger.updateStatus(r.id, 'scheduled');
    expect(updated.status).toBe('scheduled');
  });

  it('stores notes and githubIssueUrl', () => {
    const r = trigger.escalate(makeMetrics());
    trigger.updateStatus(r.id, 'in_progress', 'Reviewing now', 'https://github.com/dcyfr/dcyfr-ai/issues/99');
    const fetched = trigger.getEscalation(r.id);
    expect(fetched?.notes).toBe('Reviewing now');
    expect(fetched?.githubIssueUrl).toBe('https://github.com/dcyfr/dcyfr-ai/issues/99');
  });

  it('throws for unknown escalation ID', () => {
    expect(() => trigger.updateStatus('esc-9999', 'completed')).toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

describe('EscalationTrigger queries', () => {
  let trigger: EscalationTrigger;

  beforeEach(() => { trigger = new EscalationTrigger(); });

  it('getPendingEscalations returns only pending', () => {
    const r1 = trigger.escalate(makeMetrics({ pluginId: 'a/p1' }));
    const r2 = trigger.escalate(makeMetrics({ pluginId: 'a/p2' }));
    trigger.updateStatus(r1.id, 'completed');
    const pending = trigger.getPendingEscalations();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(r2.id);
  });

  it('getAllEscalations returns all records', () => {
    trigger.escalate(makeMetrics({ pluginId: 'a/p1' }));
    trigger.escalate(makeMetrics({ pluginId: 'a/p2' }));
    expect(trigger.getAllEscalations()).toHaveLength(2);
  });

  it('getEscalation returns record by ID', () => {
    const r = trigger.escalate(makeMetrics());
    expect(trigger.getEscalation(r.id)?.pluginId).toBe('alice/my-plugin');
  });

  it('getEscalation returns undefined for unknown ID', () => {
    expect(trigger.getEscalation('esc-9999')).toBeUndefined();
  });

  it('hasPendingEscalation returns false for dismissed plugin', () => {
    const r = trigger.escalate(makeMetrics());
    trigger.updateStatus(r.id, 'dismissed');
    expect(trigger.hasPendingEscalation('alice/my-plugin')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onEscalation event subscription
// ---------------------------------------------------------------------------

describe('EscalationTrigger.onEscalation()', () => {
  let trigger: EscalationTrigger;

  beforeEach(() => { trigger = new EscalationTrigger(); });

  it('fires listener when escalation is created', () => {
    const listener = vi.fn();
    trigger.onEscalation(listener);
    const r = trigger.escalate(makeMetrics());
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(r);
  });

  it('does not fire listener after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = trigger.onEscalation(listener);
    unsub();
    trigger.escalate(makeMetrics());
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires multiple listeners', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    trigger.onEscalation(l1);
    trigger.onEscalation(l2);
    trigger.escalate(makeMetrics());
    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
  });
});

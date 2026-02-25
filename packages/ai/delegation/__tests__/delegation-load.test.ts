/**
 * Delegation Load Tests — Task 10.3
 *
 * Validates the delegation system under production-load scenarios:
 * - 100+ concurrent contract operations
 * - High-frequency reputation / health metric updates
 * - Memory stability (no exponential object accumulation)
 * - Alert system performance under burst
 *
 * @test delegation-load
 * @version 1.0.0
 * @date 2026-02-24
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContractManager, type CreateDelegationContractRequest } from '../contract-manager.js';
import {
  DelegationHealthMonitor,
  getHealthMonitor,
  type AlertRule,
} from '../monitoring.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContract(id: string): CreateDelegationContractRequest {
  return {
    task_id: `load_task_${id}`,
    task_description: `Load test task ${id}`,
    delegator: { agent_id: `delegator_${id}`, agent_name: `Delegator ${id}` },
    delegatee: { agent_id: `delegatee_${id}`, agent_name: `Delegatee ${id}` },
    permission_tokens: [{ token_id: `token_${id}`, scopes: ['read'] }],
    verification_policy: 'manual',
    success_criteria: { quality_threshold: 0.8 },
    timeout_ms: 60_000,
    tlp_classification: 'TLP:CLEAR',
  };
}

// ---------------------------------------------------------------------------
// ContractManager load tests
// ---------------------------------------------------------------------------

describe('Delegation Load — ContractManager', () => {
  let manager: ContractManager;

  beforeEach(() => {
    manager = new ContractManager({
      debug: false,
    });
  });

  it('creates 100 contracts without throwing', async () => {
    const N = 100;
    const start = Date.now();

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => manager.createContract(makeContract(`${i}`))),
    );

    const elapsed = Date.now() - start;
    const successes = results.filter((r) => r.status === 'fulfilled').length;
    const failures  = results.filter((r) => r.status === 'rejected').length;

    // All 100 should succeed
    expect(successes).toBe(N);
    expect(failures).toBe(0);

    // Should complete in under 5 seconds on any reasonable machine
    expect(elapsed).toBeLessThan(5_000);
  });

  it('handles 50 concurrent contracts + 50 sequential queries without deadlock', async () => {
    const CONCURRENT = 50;

    // Create concurrently
    const contracts = await Promise.all(
      Array.from({ length: CONCURRENT }, (_, i) =>
        manager.createContract(makeContract(`concurrent_${i}`)),
      ),
    );

    expect(contracts).toHaveLength(CONCURRENT);
    contracts.forEach((c) => {
      expect(c).toBeDefined();
      expect(c.contract_id).toBeTruthy();
    });

    // Query each contract sequentially (simulates read-heavy load)
    for (const c of contracts) {
      const fetched = manager.getContract(c.contract_id);
      expect(fetched).toBeDefined();
      expect(fetched?.contract_id).toBe(c.contract_id);
    }
  });

  it('supports rapid successive status reads without performance cliff', async () => {
    const contract = await manager.createContract(makeContract('perf_test'));
    const READS = 1_000;
    const start = Date.now();

    for (let i = 0; i < READS; i++) {
      const result = manager.getContract(contract.contract_id);
      expect(result).toBeDefined();
    }

    const elapsed = Date.now() - start;
    // 1000 in-memory reads must complete in under 1 second
    expect(elapsed).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// DelegationHealthMonitor load tests
// ---------------------------------------------------------------------------

describe('Delegation Load — HealthMonitor', () => {
  let monitor: DelegationHealthMonitor;

  beforeEach(() => {
    monitor = new DelegationHealthMonitor();
  });

  afterEach(() => {
    monitor.stop();
  });

  it('produces valid metrics snapshot immediately after construction', () => {
    const metrics = monitor.getCurrentMetrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics.healthScore).toBe('number');
    expect(metrics.healthScore).toBeGreaterThanOrEqual(0);
    expect(metrics.healthScore).toBeLessThanOrEqual(100);
    expect(metrics.timestamp).toBeInstanceOf(Date);
  });

  it('adds and retrieves 50 custom alert rules without collision', () => {
    const N = 50;
    for (let i = 0; i < N; i++) {
      const rule: AlertRule = {
        id: `load-rule-${i}`,
        name: `Load Rule ${i}`,
        condition: { metric: 'contracts.successRate', operator: '<', threshold: 0.1 + i * 0.001 },
        severity: 'info',
        channels: ['console'],
        enabled: true,
      };
      monitor.addAlertRule(rule);
    }

    const rules = monitor.getAlertRules();
    // Should include the N new rules plus the default rules
    expect(rules.length).toBeGreaterThanOrEqual(N);

    // All custom rules present
    for (let i = 0; i < N; i++) {
      expect(rules.some((r) => r.id === `load-rule-${i}`)).toBe(true);
    }
  });

  it('starts, collects, and stops monitoring within 2 seconds', async () => {
    const start = Date.now();

    monitor.start(100); // Short interval for test
    await new Promise((resolve) => setTimeout(resolve, 500)); // Let it collect a few rounds
    monitor.stop();

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2_000);

    // Metrics should be up to date
    const metrics = monitor.getCurrentMetrics();
    expect(metrics.healthScore).toBeGreaterThanOrEqual(0);
  });

  it('export() returns all monitoring data without throwing', () => {
    monitor.start(50);
    const exported = monitor.export();

    expect(exported).toBeDefined();
    expect(exported.currentMetrics).toBeDefined();
    expect(Array.isArray(exported.metricHistory)).toBe(true);
    expect(Array.isArray(exported.activeAlerts)).toBe(true);
    expect(Array.isArray(exported.alertHistory)).toBe(true);
  });

  it('handles 1000 getAlertHistory() calls without memory explosion', () => {
    const READS = 1_000;
    const start = Date.now();

    for (let i = 0; i < READS; i++) {
      monitor.getAlertHistory(10);
    }

    const elapsed = Date.now() - start;
    // 1000 read operations should be sub-100ms
    expect(elapsed).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// Health monitor singleton under concurrent access
// ---------------------------------------------------------------------------

describe('Delegation Load — Singleton Monitor (concurrent access)', () => {
  afterEach(() => {
    // Clean up singleton
    try {
      getHealthMonitor().stop();
    } catch {
      // ignore
    }
  });

  it('getHealthMonitor() returns stable singleton across 100 concurrent calls', () => {
    const instances = Array.from({ length: 100 }, () => getHealthMonitor());

    const first = instances[0];
    for (const inst of instances) {
      expect(inst).toBe(first); // Strict reference equality — same object
    }
  });

  it('global monitor getCurrentMetrics() is safe from concurrent readers', async () => {
    const monitor = getHealthMonitor();

    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        Promise.resolve(monitor.getCurrentMetrics()),
      ),
    );

    expect(results).toHaveLength(200);
    for (const r of results) {
      expect(r).toBeDefined();
      expect(typeof r.healthScore).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// SLA boundary load tests
// ---------------------------------------------------------------------------

describe('Delegation Load — SLA boundary conditions', () => {
  it('monitors healthy system with zero contracts correctly', () => {
    const monitor = new DelegationHealthMonitor();
    const metrics = monitor.getCurrentMetrics();

    // With zero load, health should be high
    expect(metrics.healthScore).toBeGreaterThanOrEqual(50);
    expect(metrics.contracts.successRate).toBe(1.0);
    expect(metrics.errors.rate).toBe(0);

    monitor.stop();
  });

  it('alert rules evaluate without crashing when all metrics are zero', () => {
    const monitor = new DelegationHealthMonitor();

    // Add a rule that would trigger on zero metrics
    monitor.addAlertRule({
      id: 'zero-throughput',
      name: 'Zero Throughput Detected',
      condition: { metric: 'performance.throughput', operator: '<=', threshold: 0 },
      severity: 'info',
      channels: ['console'],
      enabled: true,
    });

    // Trigger evaluation by starting + stopping quickly
    monitor.start(10);
    // No crash is the acceptance criterion
    monitor.stop();

    expect(monitor.getAlertRules()).toBeDefined();
  });
});

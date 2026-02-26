/**
 * Contract Manager Benchmark — Middleware Chain Latency
 * TLP:AMBER - Internal Use Only
 *
 * Measures the P99 latency overhead of `createContract()` with the full
 * security middleware chain enabled.  Target: P99 < 5ms.
 *
 * Run with: npx vitest run --reporter=verbose contract-manager.benchmark
 *
 * @test benchmark
 * @version 1.0.0
 * @date 2026-02-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DelegationContractManager } from '../../delegation/contract-manager.js';
import type { CreateDelegationContractRequest } from '../../delegation/contract-manager.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _taskSeq = 0;

function makeRequest(): CreateDelegationContractRequest {
  const seq = ++_taskSeq;
  return {
    task_id: `bench-task-${seq}`,
    task_description: 'Benchmark task — analyse data and produce a summary report of the findings',
    verification_policy: 'automated',
    success_criteria: { output_schema: { type: 'object' } },
    timeout_ms: 60_000,
    // Use a unique delegator per request so neither rate-limiting nor fan-out
    // limits interfere with the latency measurement.
    delegator: { agent_id: `bench-delegator-${seq}`, agent_name: 'Benchmark Delegator' },
    delegatee: { agent_id: `bench-delegatee-${seq}`, agent_name: 'Benchmark Delegatee' },
  };
}

/** Compute the Pn-th percentile of a sorted array of numbers. */
function percentile(sorted: number[], n: number): number {
  const idx = Math.ceil((n / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── Benchmark ───────────────────────────────────────────────────────────────

describe('Contract Manager — createContract() latency benchmark', () => {
  let manager: DelegationContractManager;

  beforeEach(() => {
    manager = new DelegationContractManager();
  });

  afterEach(() => manager.clearAll());

  it('P99 createContract() latency is under 5ms (warm path)', async () => {
    const WARMUP = 20;
    const ITERATIONS = 1_000;

    // Warm-up: JIT, SQLite page-cache, etc.
    for (let i = 0; i < WARMUP; i++) {
      await manager.createContract(makeRequest());
    }

    // Clear state after warm-up so the benchmark starts clean
    manager.clearAll();
    _taskSeq = 0;

    // Timed runs
    const timings: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      await manager.createContract(makeRequest());
      timings.push(performance.now() - t0);
    }

    // Sort ascending for percentile calculation
    timings.sort((a, b) => a - b);

    const p50 = percentile(timings, 50);
    const p95 = percentile(timings, 95);
    const p99 = percentile(timings, 99);
    const p999 = percentile(timings, 99.9);
    const min = timings[0];
    const max = timings[timings.length - 1];
    const mean = timings.reduce((s, v) => s + v, 0) / timings.length;

    console.log(
      `\n  Benchmark results (n=${ITERATIONS}):\n` +
      `    min  = ${min.toFixed(3)} ms\n` +
      `    mean = ${mean.toFixed(3)} ms\n` +
      `    p50  = ${p50.toFixed(3)} ms\n` +
      `    p95  = ${p95.toFixed(3)} ms\n` +
      `    p99  = ${p99.toFixed(3)} ms\n` +
      `    p999 = ${p999.toFixed(3)} ms\n` +
      `    max  = ${max.toFixed(3)} ms`,
    );

    // Gate: P99 must be under 5ms
    expect(p99, `P99 latency exceeds 5ms (got ${p99.toFixed(2)} ms)`).toBeLessThan(5);
  });
});

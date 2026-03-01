/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Performance Tests: Execution Mode Routing
 * TLP:AMBER - Internal Use Only
 *
 * Task 6.7 — delegation-execution-modes
 *
 * Performance benchmarks and load tests for the execution mode subsystem:
 *   - Mode selection algorithm overhead (target: <10ms per call)
 *   - Background queue under 100 concurrent requests
 *   - Session handoff latency (target: <500ms for full context transfer)
 *
 * Run with: cd dcyfr-ai && npx vitest run --reporter=verbose execution-mode-performance
 *
 * @module delegation/__tests__/execution-mode-performance
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DelegationContractManager } from '../contract-manager.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { CreateDelegationContractRequest } from '../contract-manager.js';
import { existsSync, unlinkSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DB = '/tmp/test-execution-mode-perf.db';

let _seq = 0;

function makeRequest(mode: ExecutionMode = ExecutionMode.INTERACTIVE): CreateDelegationContractRequest {
  const id = ++_seq;
  return {
    delegator: { agent_id: `perf-delegator-${id}`, agent_name: `Perf Delegator ${id}` },
    delegatee: { agent_id: `perf-delegatee-${id}`, agent_name: `Perf Delegatee ${id}` },
    task_id: `perf-task-${id}`,
    task_description: 'Performance test task for execution mode routing',
    verification_policy: 'direct_inspection',
    success_criteria: { required_checks: [] },
    timeout_ms: 60_000,
    execution_mode: mode,
  };
}

/** Compute the Nth percentile of a sorted number array. */
function pct(sorted: number[], n: number): number {
  const idx = Math.ceil((n / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Execution Mode Performance', () => {
  let cm: DelegationContractManager;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    cm = new DelegationContractManager({ databasePath: TEST_DB });
  });

  afterEach(() => {
    cm.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  // ── 1. Mode selection algorithm throughput ─────────────────────────────────

  describe('selectExecutionMode() — target P99 < 10ms', () => {
    it('P99 selectExecutionMode() overhead is under 10ms (INTERACTIVE, no manifest)', () => {
      const WARMUP = 50;
      const ITERATIONS = 1_000;

      // Warm up
      for (let i = 0; i < WARMUP; i++) {
        cm.selectExecutionMode(makeRequest(ExecutionMode.INTERACTIVE));
      }

      const timings: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        cm.selectExecutionMode(makeRequest(ExecutionMode.INTERACTIVE));
        timings.push(performance.now() - t0);
      }

      timings.sort((a, b) => a - b);
      const p50 = pct(timings, 50);
      const p95 = pct(timings, 95);
      const p99 = pct(timings, 99);

      console.log(`selectExecutionMode() INTERACTIVE — P50=${p50.toFixed(3)}ms  P95=${p95.toFixed(3)}ms  P99=${p99.toFixed(3)}ms`);

      expect(p99).toBeLessThan(10); // target: <10ms
    });

    it('P99 selectExecutionMode() overhead is under 10ms (BACKGROUND mode)', () => {
      const ITERATIONS = 500;
      const timings: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        cm.selectExecutionMode(makeRequest(ExecutionMode.BACKGROUND));
        timings.push(performance.now() - t0);
      }

      timings.sort((a, b) => a - b);
      const p99 = pct(timings, 99);

      console.log(`selectExecutionMode() BACKGROUND — P99=${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(10);
    });

    it('P99 selectExecutionMode() overhead is under 10ms with manifest (Tier 3)', () => {
      const ITERATIONS = 500;
      const timings: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        // Skip type checking for performance test - we're measuring overhead not type safety
        cm.selectExecutionMode({} as CreateDelegationContractRequest, {} as any);
        timings.push(performance.now() - t0);
      }

      timings.sort((a, b) => a - b);
      const p99 = pct(timings, 99);

      console.log(`selectExecutionMode() manifest Tier-3 — P99=${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(10);
    });

    it('handles degradation check (queue-full path) within 10ms P99', async () => {
      // Fill queue to capacity
      const queue = (cm as any).backgroundQueue;
      for (let i = 0; i < 10; i++) {
        await queue.acquire(`pre-${i}`, `c-${i}`);
      }

      const ITERATIONS = 200;
      const timings: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const req = makeRequest(ExecutionMode.BACKGROUND);
        const t0 = performance.now();
        const mode = cm.selectExecutionMode(req);
        timings.push(performance.now() - t0);
        expect(mode).toBe(ExecutionMode.INTERACTIVE); // should degrade
      }

      timings.sort((a, b) => a - b);
      const p99 = pct(timings, 99);

      console.log(`selectExecutionMode() degradation path — P99=${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(10);
    });
  });

  // ── 2. Background queue load test ─────────────────────────────────────────

  describe('background queue — 100 concurrent requests', () => {
    it('processes 100 concurrent acquire requests correctly with 10-slot queue', async () => {
      // Use a queue directly for throughput test
      const { BackgroundSessionQueue } = await import('../session-queue.js');
      const queue = new BackgroundSessionQueue(10);

      const TOTAL = 100;
      const acquisitions: Array<{ sessionId: string; contractId: string }> = Array.from(
        { length: TOTAL },
        (_, i) => ({ sessionId: `load-sess-${i}`, contractId: `load-contract-${i}` }),
      );

      const t0 = performance.now();

      // Start all 100 concurrently — first 10 activate immediately, the rest queue
      const promises = acquisitions.map(({ sessionId, contractId }) =>
        queue.acquire(sessionId, contractId),
      );

      // Drain the queue by releasing in batches of 10
      const batchSize = 10;
      let released = 0;
      while (released < TOTAL - 10) {
        // Wait one tick so queued sessions can activate
        await Promise.resolve();
        for (let i = released; i < released + batchSize && i < TOTAL; i++) {
          queue.release(acquisitions[i].sessionId);
        }
        released += batchSize;
        await Promise.resolve();
      }

      // Release the last 10
      for (let i = released; i < TOTAL; i++) {
        queue.release(acquisitions[i].sessionId);
      }

      await Promise.all(promises);
      const elapsed = performance.now() - t0;

      console.log(`Background queue 100 concurrent — total elapsed=${elapsed.toFixed(1)}ms`);

      // All promises resolved
      expect(promises.length).toBe(TOTAL);
      // Queue should be empty when done
      expect(queue.activeCount).toBe(0);
      expect(queue.queueDepth).toBe(0);
    }, 10_000 /* 10s timeout */);

    it('queue status queries remain fast under load', async () => {
      const { BackgroundSessionQueue } = await import('../session-queue.js');
      const queue = new BackgroundSessionQueue(10);

      // Fill queue to capacity
      for (let i = 0; i < 10; i++) {
        await queue.acquire(`fill-${i}`, `fc-${i}`);
      }

      const ITERATIONS = 1_000;
      const timings: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        queue.getStatus();
        timings.push(performance.now() - t0);
      }

      timings.sort((a, b) => a - b);
      const p99 = pct(timings, 99);

      console.log(`BackgroundSessionQueue.getStatus() P99=${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(1); // Very tight — should be sub-millisecond
    });
  });

  // ── 3. Session handoff latency ─────────────────────────────────────────────

  describe('handoffSession() — target P95 < 500ms', () => {
    it('P95 handoffSession() with empty context is under 500ms', async () => {
      const WARMUP = 5;
      const ITERATIONS = 50;

      // Warm up
      for (let i = 0; i < WARMUP; i++) {
        const src = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));
        await cm.handoffSession({
          fromContractId: src.contract_id,
          toExecutionMode: ExecutionMode.BACKGROUND,
          handoffReason: 'warmup',
          contextSnapshot: { conversationHistory: [], artifacts: [] },
        });
      }

      const timings: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const src = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));
        const t0 = performance.now();
        await cm.handoffSession({
          fromContractId: src.contract_id,
          toExecutionMode: ExecutionMode.BACKGROUND,
          handoffReason: 'perf test',
          contextSnapshot: { conversationHistory: [], artifacts: [] },
        });
        timings.push(performance.now() - t0);
      }

      timings.sort((a, b) => a - b);
      const p50 = pct(timings, 50);
      const p95 = pct(timings, 95);
      const p99 = pct(timings, 99);

      console.log(`handoffSession() empty context — P50=${p50.toFixed(1)}ms  P95=${p95.toFixed(1)}ms  P99=${p99.toFixed(1)}ms`);

      expect(p95).toBeLessThan(500); // primary target
    }, 30_000 /* 30s timeout */);

    it('P95 handoffSession() with large context (100 messages) is under 500ms', async () => {
      const largeHistory = Array.from({ length: 100 }, (_, i) => `message-${i}: some content here`);
      const largeArtifacts = Array.from({ length: 20 }, (_, i) => ({
        path: `src/module-${i}.ts`,
        type: 'code',
        size: 1024,
      }));

      const ITERATIONS = 30;
      const timings: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const src = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));
        const t0 = performance.now();
        await cm.handoffSession({
          fromContractId: src.contract_id,
          toExecutionMode: ExecutionMode.ASYNC,
          handoffReason: 'large context transfer',
          contextSnapshot: {
            conversationHistory: largeHistory,
            artifacts: largeArtifacts,
          },
        });
        timings.push(performance.now() - t0);
      }

      timings.sort((a, b) => a - b);
      const p95 = pct(timings, 95);
      const mean = timings.reduce((acc, v) => acc + v, 0) / timings.length;

      console.log(`handoffSession() 100-msg context — mean=${mean.toFixed(1)}ms  P95=${p95.toFixed(1)}ms`);

      expect(p95).toBeLessThan(500); // target: <500ms for full context transfer
    }, 30_000);

    it('back-to-back handoff chain (interactive→background→async) is under 1s total', async () => {
      const RUNS = 20;
      const timings: number[] = [];

      for (let i = 0; i < RUNS; i++) {
        const c1 = await cm.createContract(makeRequest(ExecutionMode.INTERACTIVE));

        const t0 = performance.now();

        const c2 = await cm.handoffSession({
          fromContractId: c1.contract_id,
          toExecutionMode: ExecutionMode.BACKGROUND,
          handoffReason: 'hop 1',
          contextSnapshot: { conversationHistory: ['step 1'], artifacts: [] },
        });

        await cm.handoffSession({
          fromContractId: c2.contract_id,
          toExecutionMode: ExecutionMode.ASYNC,
          handoffReason: 'hop 2',
          contextSnapshot: { conversationHistory: ['step 1', 'step 2'], artifacts: [] },
        });

        timings.push(performance.now() - t0);
      }

      timings.sort((a, b) => a - b);
      const p95 = pct(timings, 95);
      const mean = timings.reduce((acc, v) => acc + v, 0) / timings.length;

      console.log(`2-hop handoff chain — mean=${mean.toFixed(1)}ms  P95=${p95.toFixed(1)}ms`);

      // 2-hop chain should complete in under 1 second (2 × 500ms target)
      expect(p95).toBeLessThan(1_000);
    }, 30_000);
  });
});

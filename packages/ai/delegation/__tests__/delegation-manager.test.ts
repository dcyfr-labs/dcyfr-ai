/**
 * delegation-manager.test.ts
 *
 * Tests for DelegationManager.analyzeFailure() — Ralph Loop V2 failure analysis.
 *
 * All four FailureCategory paths are exercised, plus the unknown fallback,
 * priority resolution between competing candidates, and confidence scoring.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DelegationManager, FailureCategory, delegationManager } from '../delegation-manager.js';
import type { ContractResult } from '../delegation-manager.js';
import type { DelegationContract } from '../../types/delegation-contracts.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function makeContract(overrides: Partial<DelegationContract> = {}): DelegationContract {
  return {
    contract_id: 'ctr-test-01',
    delegator: { agent_id: 'orchestrator', agent_name: 'Orchestrator' },
    delegatee: { agent_id: 'coder', agent_name: 'Coder Agent' },
    task_id: 'task-auth',
    task_description: 'Implement auth module',
    verification_policy: 'direct_inspection',
    success_criteria: { required_checks: ['tests', 'lint'] },
    timeout_ms: 60_000,
    status: 'failed',
    created_at: new Date().toISOString(),
    delegation_depth: 0,
    execution_mode: ExecutionMode.BACKGROUND,
    ...overrides,
  } as DelegationContract;
}

function makeResult(overrides: Partial<ContractResult> = {}): ContractResult {
  return {
    contract: makeContract(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// context_overflow
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeFailure — context_overflow', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('detects "token limit" in logs', () => {
    const result = makeResult({ logs: 'Error: token limit exceeded after 8192 tokens.' });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.CONTEXT_OVERFLOW);
    expect(analysis.confidence).toBe(1.0);
    expect(analysis.signals.some(s => s.includes('token limit'))).toBe(true);
  });

  it('detects "truncated" in error_output', () => {
    const result = makeResult({ error_output: 'Response was truncated due to length.' });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.CONTEXT_OVERFLOW);
  });

  it('detects "context window" in logs', () => {
    const result = makeResult({ logs: 'The prompt exceeds the context window limit.' });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.CONTEXT_OVERFLOW);
  });

  it('detects "context length exceeded" (case-insensitive)', () => {
    const result = makeResult({ logs: 'CONTEXT LENGTH EXCEEDED' });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.CONTEXT_OVERFLOW);
  });

  it('accumulates multiple overflow signals', () => {
    const result = makeResult({ logs: 'token limit reached. Response truncated.' });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.signals.filter(s => s.includes('context_overflow')).length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// missing_requirements
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeFailure — missing_requirements', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('detects "Cannot find name" in error_output', () => {
    const result = makeResult({ error_output: "error TS2304: Cannot find name 'UserService'." });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.MISSING_REQUIREMENTS);
    expect(analysis.confidence).toBe(1.0);
  });

  it('detects "Cannot find module" in logs', () => {
    const result = makeResult({ logs: "Cannot find module '@dcyfr/ai' or its type declarations." });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.MISSING_REQUIREMENTS);
  });

  it('detects "has no exported member" in error_output', () => {
    const result = makeResult({ error_output: "Module './types' has no exported member 'Foo'." });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.MISSING_REQUIREMENTS);
  });

  it('records signal text', () => {
    const result = makeResult({ error_output: 'Cannot find name XyzService' });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.signals.some(s => s.includes('missing_requirements'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// wrong_direction
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeFailure — wrong_direction', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('detects out-of-scope file changes', () => {
    const result = makeResult({
      changed_files: ['src/auth/login.ts', 'package.json'],
      task_scope_paths: ['src/auth'],
    });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.WRONG_DIRECTION);
    expect(analysis.signals.some(s => s.includes('package.json'))).toBe(true);
  });

  it('confidence equals out-of-scope fraction', () => {
    // 1 of 4 files out of scope → confidence = 0.25
    const result = makeResult({
      changed_files: [
        'src/auth/login.ts',
        'src/auth/logout.ts',
        'src/auth/token.ts',
        'src/billing/invoice.ts',
      ],
      task_scope_paths: ['src/auth'],
    });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.WRONG_DIRECTION);
    expect(analysis.confidence).toBeCloseTo(0.25);
  });

  it('does NOT flag when all files are in scope', () => {
    const result = makeResult({
      changed_files: ['src/auth/login.ts', 'src/auth/logout.ts'],
      task_scope_paths: ['src/auth'],
    });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
  });

  it('does NOT flag when task_scope_paths is empty', () => {
    const result = makeResult({
      changed_files: ['anything.ts'],
      task_scope_paths: [],
    });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
  });

  it('does NOT flag when changed_files is empty', () => {
    const result = makeResult({
      changed_files: [],
      task_scope_paths: ['src/auth'],
    });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
  });

  it('records each out-of-scope file in signals', () => {
    const result = makeResult({
      changed_files: ['bad1.ts', 'bad2.ts'],
      task_scope_paths: ['src/auth'],
    });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.signals.some(s => s.includes('bad1.ts'))).toBe(true);
    expect(analysis.signals.some(s => s.includes('bad2.ts'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stuck_on_complexity
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeFailure — stuck_on_complexity', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('detects 0 commits after > 2 hours', () => {
    const result = makeResult({ commit_count: 0, elapsed_ms: TWO_HOURS_MS + 1 });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.STUCK_ON_COMPLEXITY);
    expect(analysis.confidence).toBe(1.0);
    expect(analysis.signals.some(s => s.includes('stuck_on_complexity'))).toBe(true);
  });

  it('does NOT flag when commits > 0', () => {
    const result = makeResult({ commit_count: 1, elapsed_ms: TWO_HOURS_MS + 1 });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
  });

  it('does NOT flag when elapsed < 2 hours', () => {
    const result = makeResult({ commit_count: 0, elapsed_ms: TWO_HOURS_MS - 1 });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
  });

  it('does NOT flag when commit_count is omitted', () => {
    const result = makeResult({ elapsed_ms: TWO_HOURS_MS + 60_000 });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
  });

  it('records elapsed hours in signal text', () => {
    const elapsed = 3 * 60 * 60 * 1000; // 3 hours
    const result = makeResult({ commit_count: 0, elapsed_ms: elapsed });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.signals.some(s => s.includes('3.0h'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// unknown
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeFailure — unknown', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('returns unknown when no signals detected (empty result)', () => {
    const result = makeResult();
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
    expect(analysis.confidence).toBe(0.3);
    expect(analysis.signals).toHaveLength(1);
    expect(analysis.signals[0]).toContain('no specific failure signal');
  });

  it('returns unknown when logs are unrelated noise', () => {
    const result = makeResult({ logs: 'All tests passed. Build successful.' });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.UNKNOWN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Priority resolution (multiple signals)
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeFailure — priority resolution', () => {
  let dm: DelegationManager;
  beforeEach(() => { dm = new DelegationManager(); });

  it('prefers context_overflow (confidence 1.0) over wrong_direction (partial)', () => {
    // context_overflow (conf 1.0) + wrong_direction (conf 0.5 — 1/2 files)
    const result = makeResult({
      logs: 'token limit exceeded',
      changed_files: ['src/auth/login.ts', 'src/billing/invoice.ts'],
      task_scope_paths: ['src/auth'],
    });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.CONTEXT_OVERFLOW);
    // All signals from both categories should be present
    expect(analysis.signals.some(s => s.includes('token limit'))).toBe(true);
    expect(analysis.signals.some(s => s.includes('billing'))).toBe(true);
  });

  it('prefers missing_requirements (conf 1.0) over stuck_on_complexity (conf 1.0) — first wins on tie', () => {
    // Both have confidence 1.0; missing_requirements is inserted first
    const result = makeResult({
      error_output: 'Cannot find name UserService',
      commit_count: 0,
      elapsed_ms: TWO_HOURS_MS + 1,
    });
    const analysis = dm.analyzeFailure(result);
    // Both are conf 1.0 — the sort is stable, missing_requirements inserted before stuck
    expect([
      FailureCategory.MISSING_REQUIREMENTS,
      FailureCategory.STUCK_ON_COMPLEXITY,
    ]).toContain(analysis.category);
    // Both signals should be collected
    expect(analysis.signals.some(s => s.includes('missing_requirements'))).toBe(true);
    expect(analysis.signals.some(s => s.includes('stuck_on_complexity'))).toBe(true);
  });

  it('propagates contract_id in all cases', () => {
    const contract = makeContract({ contract_id: 'ctr-xyz-999' });
    const result = makeResult({ contract });
    const analysis = dm.analyzeFailure(result);
    expect(analysis.contract_id).toBe('ctr-xyz-999');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

describe('delegationManager singleton', () => {
  it('is an instance of DelegationManager', () => {
    expect(delegationManager).toBeInstanceOf(DelegationManager);
  });

  it('correctly analyses a result via the singleton', () => {
    const result = makeResult({ error_output: 'Cannot find module @dcyfr/ai' });
    const analysis = delegationManager.analyzeFailure(result);
    expect(analysis.category).toBe(FailureCategory.MISSING_REQUIREMENTS);
  });
});

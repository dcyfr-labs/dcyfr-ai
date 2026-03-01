/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for MCP delegation-monitor session mode tools
 * Phase 6.7 — delegation-execution-modes
 */
import { describe, it, expect } from 'vitest';
import { ExecutionMode } from '../../types/agent-capabilities.js';

// We test the StubContractManager logic extracted inline here
// (rather than spinning up a full MCP server process)

/** Minimal equivalent of StubContractManager for isolated unit testing. */
class TestSessionContractManager {
  private contracts: Map<string, any> = new Map();
  private sessions: Map<string, any[]> = new Map();

  addContract(id: string, mode: ExecutionMode): void {
    this.contracts.set(id, { id, executionMode: mode });
  }

  querySessionsByMode(mode: ExecutionMode, limit = 10): { sessions: any[]; mode: string; count: number } {
    const result: any[] = [];
    for (const [contractId, entries] of this.sessions.entries()) {
      for (const s of entries) {
        if (s.executionMode === mode) {
          result.push({ contractId, ...s });
        }
      }
    }
    const sliced = result.slice(0, limit);
    return { sessions: sliced, mode, count: sliced.length };
  }

  addSession(contractId: string, sessionId: string, mode: ExecutionMode): void {
    const existing = this.sessions.get(contractId) ?? [];
    existing.push({ sessionId, executionMode: mode });
    this.sessions.set(contractId, existing);
  }

  getSessionHandoffHistory(sessionId: string): { handoffs: any[] } {
    const handoffs: any[] = [];
    for (const [, entries] of this.sessions.entries()) {
      for (const s of entries) {
        if (s.sessionId === sessionId && s.handoffHistory) {
          handoffs.push(...s.handoffHistory);
        }
      }
    }
    return { handoffs };
  }

  triggerSessionHandoff(params: {
    fromContractId: string;
    toMode: ExecutionMode;
    reason: string;
    authToken?: string;
    requiredToken?: string;
  }): { newContractId: string; fromContractId: string; toMode: string } {
    if (params.requiredToken && params.authToken !== params.requiredToken) {
      throw new Error('UNAUTHORIZED');
    }
    const newContractId = `new-contract-${Date.now()}`;
    this.contracts.set(newContractId, {
      id: newContractId,
      executionMode: params.toMode,
      parentContractId: params.fromContractId,
    });
    return {
      newContractId,
      fromContractId: params.fromContractId,
      toMode: params.toMode,
    };
  }
}

describe('MCP delegation-monitor session mode tools', () => {
  describe('querySessionsByMode', () => {
    it('filters sessions by execution mode', () => {
      const mgr = new TestSessionContractManager();
      mgr.addSession('c1', 's1', ExecutionMode.INTERACTIVE);
      mgr.addSession('c2', 's2', ExecutionMode.BACKGROUND);
      mgr.addSession('c3', 's3', ExecutionMode.INTERACTIVE);

      const result = mgr.querySessionsByMode(ExecutionMode.INTERACTIVE);
      expect(result.count).toBe(2);
      expect(result.sessions.every((s) => s.executionMode === ExecutionMode.INTERACTIVE)).toBe(true);
    });

    it('returns empty when no sessions match the mode', () => {
      const mgr = new TestSessionContractManager();
      mgr.addSession('c1', 's1', ExecutionMode.INTERACTIVE);

      const result = mgr.querySessionsByMode(ExecutionMode.ASYNC);
      expect(result.count).toBe(0);
      expect(result.sessions).toHaveLength(0);
    });

    it('respects the limit parameter', () => {
      const mgr = new TestSessionContractManager();
      for (let i = 0; i < 20; i++) {
        mgr.addSession(`c${i}`, `s${i}`, ExecutionMode.BACKGROUND);
      }
      const result = mgr.querySessionsByMode(ExecutionMode.BACKGROUND, 5);
      expect(result.count).toBe(5);
    });
  });

  describe('getSessionHandoffHistory', () => {
    it('returns empty handoffs for a session with no history', () => {
      const mgr = new TestSessionContractManager();
      mgr.addSession('c1', 's1', ExecutionMode.INTERACTIVE);

      const result = mgr.getSessionHandoffHistory('s1');
      expect(result.handoffs).toHaveLength(0);
    });

    it('returns handoff records when present', () => {
      const mgr = new TestSessionContractManager();
      const history = [
        { fromMode: ExecutionMode.INTERACTIVE, toMode: ExecutionMode.BACKGROUND, at: new Date().toISOString() },
      ];
      const existing: any[] = [];
      existing.push({ sessionId: 's1', executionMode: ExecutionMode.INTERACTIVE, handoffHistory: history });
      (mgr as any).sessions.set('c1', existing);

      const result = mgr.getSessionHandoffHistory('s1');
      expect(result.handoffs).toHaveLength(1);
      expect(result.handoffs[0].fromMode).toBe(ExecutionMode.INTERACTIVE);
    });
  });

  describe('triggerSessionHandoff', () => {
    it('creates a linked contract in the target mode', () => {
      const mgr = new TestSessionContractManager();
      mgr.addContract('c1', ExecutionMode.INTERACTIVE);

      const result = mgr.triggerSessionHandoff({
        fromContractId: 'c1',
        toMode: ExecutionMode.BACKGROUND,
        reason: 'switching modes',
      });

      expect(result.newContractId).toBeDefined();
      expect(result.fromContractId).toBe('c1');
      expect(result.toMode).toBe(ExecutionMode.BACKGROUND);
    });

    it('throws UNAUTHORIZED when auth token does not match', () => {
      const mgr = new TestSessionContractManager();
      mgr.addContract('c1', ExecutionMode.INTERACTIVE);

      expect(() =>
        mgr.triggerSessionHandoff({
          fromContractId: 'c1',
          toMode: ExecutionMode.BACKGROUND,
          reason: 'test',
          authToken: 'wrong-token',
          requiredToken: 'correct-token',
        }),
      ).toThrow('UNAUTHORIZED');
    });

    it('allows handoff when no auth token required', () => {
      const mgr = new TestSessionContractManager();
      mgr.addContract('c1', ExecutionMode.INTERACTIVE);

      const result = mgr.triggerSessionHandoff({
        fromContractId: 'c1',
        toMode: ExecutionMode.ASYNC,
        reason: 'no token needed',
      });

      expect(result.newContractId).toBeDefined();
    });
  });
});

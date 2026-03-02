/**
 * Integration tests for Session Handoff Chain (v3.0 protocol)
 * Task 7.3 — cowork-inspired-improvements
 *
 * Validates that handoff context propagates correctly through delegation chains:
 * - 2-contract chain: contract A → contract B (with handoff context)
 * - 3-contract chain: contract A → B → C (transitive handoff)
 * - Edge cases: empty snapshots, missing optional fields, unregistered source sessions
 *
 * The v3.0 protocol registers each new session with a `handoffContext` that
 * references the prior contract's snapshotted state. The SessionManager stores
 * this context on the `ManagedSession.handoffContext` field.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../session-manager.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { DelegationContract } from '../../types/delegation-contracts.js';
import type { SessionState } from '../../types/agent-capabilities.js';

type HandoffContext = NonNullable<DelegationContract['handoff_context']>;
type ConversationEntry = { role: string; content: string; timestamp: string };
type ArtifactEntry = { type: string; content: string; url?: string };

let _sessionCounter = 0;
const makeSessionId = (): string => `test-session-${++_sessionCounter}-${Date.now()}`;

const makeState = (): SessionState => ({
  status: 'active',
  conversationMessages: [],
  lastActivity: new Date().toISOString(),
});

const makeHandoff = (overrides: Partial<HandoffContext> = {}): HandoffContext => ({
  source_contract_id: 'contract-source',
  timestamp: new Date().toISOString(),
  conversation_snapshot: [],
  artifact_snapshot: [],
  context_summary: 'Test handoff context',
  ...overrides,
});

describe('Session Handoff Chain (v3.0 protocol)', () => {
  let manager: SessionManager;

  beforeEach(() => {
    // Disable auto-flush timer for deterministic tests
    manager = new SessionManager({ flushIntervalMs: 0 });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Two-contract handoff chain', () => {
    it('should preserve conversation_snapshot across handoff', () => {
      const snapshot: ConversationEntry[] = [
        { role: 'user', content: 'initial request', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'initial response', timestamp: new Date().toISOString() },
      ];
      const handoff = makeHandoff({ conversation_snapshot: snapshot });

      // Contract A: interactive session completes, hands off to B
      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      // Archive A to mark it as completed (handed-off)
      manager.archive(sidA);

      // Contract B: background session inherits handoff context from A
      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoff);

      const sessionB = manager.get(sidB);
      expect(sessionB).toBeDefined();
      const restored = sessionB?.handoffContext?.conversation_snapshot as ConversationEntry[] | undefined;
      expect(restored).toHaveLength(2);
      expect(restored?.[0]?.content).toBe('initial request');
      expect(restored?.[1]?.content).toBe('initial response');
    });

    it('should preserve artifact_snapshot across handoff', () => {
      const artifacts: ArtifactEntry[] = [
        { type: 'file', content: 'src/index.ts', url: 'file:///src/index.ts' },
      ];
      const handoff = makeHandoff({ artifact_snapshot: artifacts });

      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sidA);

      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.ASYNC, makeState(), handoff);

      const sessionB = manager.get(sidB);
      const restoredArtifacts = sessionB?.handoffContext?.artifact_snapshot as ArtifactEntry[] | undefined;
      expect(restoredArtifacts).toHaveLength(1);
      expect(restoredArtifacts?.[0]?.type).toBe('file');
      expect(restoredArtifacts?.[0]?.url).toBe('file:///src/index.ts');
    });

    it('should store handoffContext on destination session', () => {
      const handoff = makeHandoff({ source_contract_id: 'contract-a' });

      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sidA);

      const sidB = makeSessionId();
      const sessionB = manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoff);

      expect(sessionB.handoffContext).toBeDefined();
      expect(sessionB.handoffContext?.source_contract_id).toBe('contract-a');
    });

    it('should copy context_summary to destination session', () => {
      const summary = 'Completed authentication module, next: write tests';
      const handoff = makeHandoff({ context_summary: summary });

      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sidA);

      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoff);

      const sessionB = manager.get(sidB);
      expect(sessionB?.handoffContext?.context_summary).toBe(summary);
    });

    it('should NOT carry handoff context when none is provided', () => {
      const sid = makeSessionId();
      const session = manager.register(sid, 'contract-standalone', ExecutionMode.INTERACTIVE, makeState());
      expect(session.handoffContext).toBeUndefined();
    });
  });

  describe('Three-contract handoff chain (A → B → C)', () => {
    it('should propagate snapshot all the way through the chain', () => {
      const snapshot: ConversationEntry[] = [
        { role: 'user', content: 'original task', timestamp: new Date().toISOString() },
      ];

      // -- A (interactive) archives and produces handoff for B --
      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sidA);
      const handoffAB = makeHandoff({ conversation_snapshot: snapshot, source_contract_id: 'contract-a' });

      // -- B (background) starts with A's context, then hands off to C --
      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoffAB);
      manager.archive(sidB);
      const handoffBC = makeHandoff({
        conversation_snapshot: snapshot,
        source_contract_id: 'contract-b',
        context_summary: 'Intermediate progress',
      });

      // -- C (async) starts with B's context --
      const sidC = makeSessionId();
      manager.register(sidC, 'contract-c', ExecutionMode.ASYNC, makeState(), handoffBC);

      const sessionC = manager.get(sidC);
      expect(sessionC).toBeDefined();
      const finalSnapshot = sessionC?.handoffContext?.conversation_snapshot as ConversationEntry[] | undefined;
      expect(finalSnapshot).toHaveLength(1);
      expect(finalSnapshot?.[0]?.content).toBe('original task');
      expect(sessionC?.handoffContext?.context_summary).toBe('Intermediate progress');
    });

    it('should track source_contract_id at each hop independently', () => {
      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sidA);
      const handoffAB = makeHandoff({ source_contract_id: 'contract-a' });

      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoffAB);
      manager.archive(sidB);
      const handoffBC = makeHandoff({ source_contract_id: 'contract-b' });

      const sidC = makeSessionId();
      manager.register(sidC, 'contract-c', ExecutionMode.ASYNC, makeState(), handoffBC);

      // B received from A
      const archivedB = manager.get(sidB);
      // C received from B
      const sessionC = manager.get(sidC);

      // After archive, session is removed from in-memory store
      expect(archivedB).toBeUndefined();
      expect(sessionC?.handoffContext?.source_contract_id).toBe('contract-b');
    });

    it('should keep C lifecycle active while A and B are archived', () => {
      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      const handoffAB = makeHandoff({ source_contract_id: 'contract-a' });
      manager.archive(sidA);

      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoffAB);
      const handoffBC = makeHandoff({ source_contract_id: 'contract-b' });
      manager.archive(sidB);

      const sidC = makeSessionId();
      manager.register(sidC, 'contract-c', ExecutionMode.ASYNC, makeState(), handoffBC);

      // A and B are archived (removed from in-memory store)
      expect(manager.get(sidA)).toBeUndefined();
      expect(manager.get(sidB)).toBeUndefined();
      // C is still active in memory
      expect(manager.get(sidC)?.lifeCycle).toBe('active');
    });
  });

  describe('Handoff edge cases', () => {
    it('should handle handoff with empty snapshot arrays', () => {
      const handoff = makeHandoff({ conversation_snapshot: [], artifact_snapshot: [] });

      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sidA);

      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoff);

      const sessionB = manager.get(sidB);
      expect(sessionB?.handoffContext?.conversation_snapshot).toEqual([]);
      expect(sessionB?.handoffContext?.artifact_snapshot).toEqual([]);
    });

    it('should handle handoff with no context_summary (optional field)', () => {
      const handoff: HandoffContext = {
        source_contract_id: 'contract-a',
        timestamp: new Date().toISOString(),
      };

      const sidA = makeSessionId();
      manager.register(sidA, 'contract-a', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sidA);

      const sidB = makeSessionId();
      manager.register(sidB, 'contract-b', ExecutionMode.BACKGROUND, makeState(), handoff);

      const sessionB = manager.get(sidB);
      expect(sessionB?.handoffContext?.context_summary).toBeUndefined();
      expect(sessionB?.handoffContext?.source_contract_id).toBe('contract-a');
    });

    it('should allow registering different modes in the same chain', () => {
      const handoffAB = makeHandoff({ source_contract_id: 'c-a' });
      const handoffBC = makeHandoff({ source_contract_id: 'c-b' });

      const sidA = makeSessionId();
      manager.register(sidA, 'c-a', ExecutionMode.INTERACTIVE, makeState());

      const sidB = makeSessionId();
      manager.register(sidB, 'c-b', ExecutionMode.BACKGROUND, makeState(), handoffAB);

      const sidC = makeSessionId();
      manager.register(sidC, 'c-c', ExecutionMode.ASYNC, makeState(), handoffBC);

      expect(manager.get(sidA)?.executionMode).toBe(ExecutionMode.INTERACTIVE);
      expect(manager.get(sidB)?.executionMode).toBe(ExecutionMode.BACKGROUND);
      expect(manager.get(sidC)?.executionMode).toBe(ExecutionMode.ASYNC);
    });

    it('should throw _requireSession when looking up archived (removed) session', () => {
      const sid = makeSessionId();
      manager.register(sid, 'contract-x', ExecutionMode.INTERACTIVE, makeState());
      manager.archive(sid);

      // After archive, session is removed from in-memory store
      expect(manager.get(sid)).toBeUndefined();
      // updateState on an archived (removed) session should throw
      expect(() => manager.updateState(sid, {})).toThrow('Session not found');
    });
  });
});

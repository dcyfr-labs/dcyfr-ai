/**
 * Tests for ExecutionModeDashboard
 * Phase 6.6 — delegation-execution-modes
 */
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { ExecutionModeDashboard } from '../execution-mode-dashboard.js';
import { ExecutionMode } from '../../types/agent-capabilities.js';
import type { DashboardInput } from '../execution-mode-dashboard.js';
import type { BackgroundQueueStatus } from '../session-queue.js';

const makeQueueStatus = (): BackgroundQueueStatus => ({
  activeCount: 2,
  remainingCapacity: 8,
  atCapacity: false,
  activeSessionIds: ['s1', 's2'],
  queuedSessionIds: [],
});

const makeInput = (overrides: Partial<DashboardInput> = {}): DashboardInput => ({
  queueStatus: makeQueueStatus(),
  activeByMode: {
    [ExecutionMode.INTERACTIVE]: ['s1', 's2'],
    [ExecutionMode.BACKGROUND]: ['s3'],
    [ExecutionMode.ASYNC]: [],
  },
  ...overrides,
});

describe('ExecutionModeDashboard', () => {
  describe('buildReport() — no-persist', () => {
    const dashboard = new ExecutionModeDashboard();

    it('returns a report with correct structure', () => {
      const report = dashboard.buildReport(makeInput(), '2026-02-25');
      expect(report.date).toBe('2026-02-25');
      expect(report.generatedAt).toBeDefined();
      expect(typeof report.generatedAt).toBe('string');
      expect(report.modes).toBeDefined();
      expect(report.backgroundQueueSnapshot).toBeDefined();
      expect(report.topAgentsByMode).toBeDefined();
      expect(report.config).toBeDefined();
    });

    it('populates per-mode active session counts', () => {
      const input = makeInput();
      const report = dashboard.buildReport(input, '2026-02-25');

      expect(report.modes[ExecutionMode.INTERACTIVE].activeSessions).toBe(2);
      expect(report.modes[ExecutionMode.BACKGROUND].activeSessions).toBe(1);
      expect(report.modes[ExecutionMode.ASYNC].activeSessions).toBe(0);
    });

    it('zero stats when no archived sessions provided', () => {
      const report = dashboard.buildReport(makeInput(), '2026-02-25');
      expect(report.modes[ExecutionMode.INTERACTIVE].archivedToday).toBe(0);
      expect(report.modes[ExecutionMode.INTERACTIVE].avgDurationMs).toBe(0);
    });

    it('computes archivedToday and avgDurationMs', () => {
      const input = makeInput({
        archivedTodayByMode: {
          [ExecutionMode.INTERACTIVE]: [{ durationMs: 1000 }, { durationMs: 3000 }],
          [ExecutionMode.BACKGROUND]: [],
          [ExecutionMode.ASYNC]: [],
        },
      });
      const report = dashboard.buildReport(input, '2026-02-25');
      expect(report.modes[ExecutionMode.INTERACTIVE].archivedToday).toBe(2);
      expect(report.modes[ExecutionMode.INTERACTIVE].avgDurationMs).toBe(2000);
    });

    it('tracks handoff events by mode', () => {
      const input = makeInput({
        handoffEvents: [
          { fromMode: ExecutionMode.INTERACTIVE, toMode: ExecutionMode.BACKGROUND, success: true },
          { fromMode: ExecutionMode.INTERACTIVE, toMode: ExecutionMode.ASYNC, success: false },
          { fromMode: ExecutionMode.BACKGROUND, toMode: ExecutionMode.ASYNC, success: true },
        ],
      });
      const report = dashboard.buildReport(input, '2026-02-25');

      expect(report.modes[ExecutionMode.INTERACTIVE].handoffsOut).toBe(2);
      expect(report.modes[ExecutionMode.BACKGROUND].handoffsIn).toBe(1);
      expect(report.modes[ExecutionMode.ASYNC].handoffsIn).toBe(2);
      // INTERACTIVE: 1/2 success = 0.5
      expect(report.modes[ExecutionMode.INTERACTIVE].handoffSuccessRate).toBeCloseTo(0.5);
    });

    it('populates backgroundQueueSnapshot from input', () => {
      const qs = makeQueueStatus();
      const report = dashboard.buildReport(makeInput({ queueStatus: qs }), '2026-02-25');
      expect(report.backgroundQueueSnapshot).toEqual(qs);
    });

    it('uses today`s date when no date override provided', () => {
      const report = dashboard.buildReport(makeInput());
      const today = new Date().toISOString().slice(0, 10);
      expect(report.date).toBe(today);
    });

    it('populates topAgentsByMode from getAdjustedScore', () => {
      const adjustedScore = {
        agentId: 'test-agent',
        executionMode: ExecutionMode.INTERACTIVE,
        adjustedScore: 0.85,
        dimensions: { reliability: 0.8, speed: 0.9, quality: 0.85, security: 0.7 },
        appliedWeights: { reliability: 0.35, speed: 0.4, quality: 0.15, security: 0.1 },
        decayFactor: 1.0,
        effectiveScore: 0.85,
        computedAt: new Date().toISOString(),
      };
      const input = makeInput({
        agentIds: ['test-agent'],
        getAdjustedScore: () => adjustedScore,
      });
      const report = dashboard.buildReport(input, '2026-02-25');
      expect(report.topAgentsByMode[ExecutionMode.INTERACTIVE]).toHaveLength(1);
      expect(report.topAgentsByMode[ExecutionMode.INTERACTIVE][0].agentId).toBe('test-agent');
    });
  });

  describe('generateReport() — with disk write', () => {
    it('writes report JSON to disk at expected path', () => {
      const dir = join(tmpdir(), `dcyfr-test-dashboard-${Date.now()}`);
      const dashboard = new ExecutionModeDashboard(dir);
      const report = dashboard.generateReport(makeInput(), '2026-02-25');

      const path = dashboard.reportPath('2026-02-25');
      expect(existsSync(path)).toBe(true);

      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      expect(parsed.date).toBe('2026-02-25');
      expect(parsed.modes).toBeDefined();
      expect(parsed).toEqual(report);
    });
  });

  describe('reportPath()', () => {
    it('returns path ending in YYYY-MM-DD.execution-modes.json', () => {
      const dashboard = new ExecutionModeDashboard('/tmp/test-reports');
      const path = dashboard.reportPath('2026-02-25');
      expect(path).toContain('2026-02-25.execution-modes.json');
    });
  });
});

/**
 * Execution Mode Performance Dashboard Data Source
 * TLP:AMBER - Internal Use Only
 *
 * Aggregates per-execution-mode delegation metrics and writes a daily
 * report to `logs/delegation/reports/YYYY-MM-DD.execution-modes.json`.
 *
 * Includes:
 *   - Per-mode session counts (active / archived today)
 *   - Average completion time per mode
 *   - Handoff counts and success rates
 *   - Background queue utilisation
 *   - Per-mode reputation distribution for top agents
 *
 * @module delegation/execution-mode-dashboard
 * @version 1.0.0
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ExecutionMode } from '../types/agent-capabilities.js';
import type { BackgroundQueueStatus } from './session-queue.js';
import type { ModeAdjustedScore } from '../reputation/execution-mode-reputation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Per-mode stats captured in the daily report. */
export interface PerModeStats {
  /** How many sessions are currently active in this mode. */
  activeSessions: number;
  /** How many sessions were archived (completed) today. */
  archivedToday: number;
  /** How many handoffs originated from this mode today. */
  handoffsOut: number;
  /** How many handoffs landed in this mode today. */
  handoffsIn: number;
  /** Average session duration in milliseconds (archived today). */
  avgDurationMs: number;
  /** Handoff success rate (0–1): handoffs that resulted in successful completion. */
  handoffSuccessRate: number;
}

/** Top-agent entry in the dashboard. */
export interface TopAgentEntry {
  agentId: string;
  mode: ExecutionMode;
  effectiveScore: number;
  adjustedScore: number;
  decayFactor: number;
}

/** Full dashboard report payload. */
export interface ExecutionModeDashboardReport {
  /** ISO 8601 date string: YYYY-MM-DD */
  date: string;
  /** ISO 8601 generation timestamp */
  generatedAt: string;
  /** Per-mode statistics */
  modes: Record<ExecutionMode, PerModeStats>;
  /** Background queue snapshot at report generation time */
  backgroundQueueSnapshot: BackgroundQueueStatus;
  /** Top 10 agents per mode by adjusted reputation score */
  topAgentsByMode: Record<ExecutionMode, TopAgentEntry[]>;
  /** Metadata / config for consumers */
  config: {
    reportVersion: string;
    decayPer30Days: number;
    modeWeights: Record<
      ExecutionMode,
      { reliability: number; speed: number; quality: number; security: number }
    >;
  };
}

/** Input contract/session data used to compute the report. */
export interface DashboardInput {
  /** Background queue status snapshot. */
  queueStatus: BackgroundQueueStatus;
  /** Per-mode active session counts. */
  activeByMode: Record<ExecutionMode, string[]>;
  /** Per-mode archive events for today. */
  archivedTodayByMode?: Record<ExecutionMode, Array<{ durationMs?: number }>>;
  /** Handoff events for today. */
  handoffEvents?: Array<{
    fromMode: ExecutionMode;
    toMode: ExecutionMode;
    success: boolean;
  }>;
  /** Agent IDs to include in top-agents section. */
  agentIds?: string[];
  /** Optional reputation adjuster function for top-agents computation. */
  getAdjustedScore?: (agentId: string, mode: ExecutionMode) => ModeAdjustedScore | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// ExecutionModeDashboard
// ─────────────────────────────────────────────────────────────────────────────

/** SCORE_DECAY_PER_30_DAYS constant (mirrored from execution-mode-reputation). */
const DECAY_PER_30_DAYS = 0.05;

/** Default mode weights (mirrored to avoid circular import). */
const DEFAULT_MODE_WEIGHTS = {
  [ExecutionMode.INTERACTIVE]: { reliability: 0.35, speed: 0.40, quality: 0.15, security: 0.10 },
  [ExecutionMode.BACKGROUND]: { reliability: 0.50, speed: 0.15, quality: 0.25, security: 0.10 },
  [ExecutionMode.ASYNC]:       { reliability: 0.45, speed: 0.10, quality: 0.30, security: 0.15 },
};

const EMPTY_MODE_STATS: PerModeStats = {
  activeSessions: 0,
  archivedToday: 0,
  handoffsOut: 0,
  handoffsIn: 0,
  avgDurationMs: 0,
  handoffSuccessRate: 0,
};

export class ExecutionModeDashboard {
  private readonly reportBaseDir: string;

  constructor(reportBaseDir?: string) {
    if (reportBaseDir) {
      this.reportBaseDir = reportBaseDir;
    } else {
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const workspaceRoot = join(thisDir, '..', '..', '..', '..', '..', '..');
      this.reportBaseDir = join(workspaceRoot, 'logs', 'delegation', 'reports');
    }
  }

  // ─────────────── Public API ───────────────────

  /**
   * Generate and persist the daily dashboard report.
   *
   * @returns The generated report (also written to disk).
   */
  generateReport(input: DashboardInput, dateOverride?: string): ExecutionModeDashboardReport {
    const date = dateOverride ?? new Date().toISOString().slice(0, 10);
    const report = this._buildReport(input, date);
    this._persist(report, date);
    return report;
  }

  /**
   * Build the report without persisting (useful for testing).
   */
  buildReport(input: DashboardInput, dateOverride?: string): ExecutionModeDashboardReport {
    const date = dateOverride ?? new Date().toISOString().slice(0, 10);
    return this._buildReport(input, date);
  }

  /**
   * Return the absolute file path for a given date's report.
   */
  reportPath(date: string): string {
    return join(this.reportBaseDir, `${date}.execution-modes.json`);
  }

  // ─────────────── Private ──────────────────────

  private _buildReport(input: DashboardInput, date: string): ExecutionModeDashboardReport {
    const modes = [ExecutionMode.INTERACTIVE, ExecutionMode.BACKGROUND, ExecutionMode.ASYNC] as const;

    const modeStats: Record<ExecutionMode, PerModeStats> = {
      [ExecutionMode.INTERACTIVE]: { ...EMPTY_MODE_STATS },
      [ExecutionMode.BACKGROUND]:  { ...EMPTY_MODE_STATS },
      [ExecutionMode.ASYNC]:       { ...EMPTY_MODE_STATS },
    };

    // Active session counts
    for (const mode of modes) {
      modeStats[mode].activeSessions = input.activeByMode[mode]?.length ?? 0;
    }

    // Archived today stats
    if (input.archivedTodayByMode) {
      for (const mode of modes) {
        const archived = input.archivedTodayByMode[mode] ?? [];
        modeStats[mode].archivedToday = archived.length;
        if (archived.length > 0) {
          const totalMs = archived.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
          modeStats[mode].avgDurationMs = Math.round(totalMs / archived.length);
        }
      }
    }

    // Handoff events
    if (input.handoffEvents) {
      const handoffCountsOut: Record<ExecutionMode, number> = {
        [ExecutionMode.INTERACTIVE]: 0,
        [ExecutionMode.BACKGROUND]: 0,
        [ExecutionMode.ASYNC]: 0,
      };
      const handoffSuccessOut: Record<ExecutionMode, number> = { ...handoffCountsOut };

      for (const event of input.handoffEvents) {
        modeStats[event.fromMode].handoffsOut += 1;
        modeStats[event.toMode].handoffsIn += 1;
        handoffCountsOut[event.fromMode] += 1;
        if (event.success) handoffSuccessOut[event.fromMode] += 1;
      }

      for (const mode of modes) {
        const total = handoffCountsOut[mode];
        modeStats[mode].handoffSuccessRate = total > 0
          ? handoffSuccessOut[mode] / total
          : 0;
      }
    }

    // Top agents by mode
    const topAgentsByMode: Record<ExecutionMode, TopAgentEntry[]> = {
      [ExecutionMode.INTERACTIVE]: [],
      [ExecutionMode.BACKGROUND]: [],
      [ExecutionMode.ASYNC]: [],
    };
    if (input.getAdjustedScore && input.agentIds) {
      for (const mode of modes) {
        const scored = input.agentIds
          .map((id) => {
            const s = input.getAdjustedScore!(id, mode);
            if (!s) return null;
            return {
              agentId: id,
              mode,
              effectiveScore: s.effectiveScore,
              adjustedScore: s.adjustedScore,
              decayFactor: s.decayFactor,
            } satisfies TopAgentEntry;
          })
          .filter((x): x is TopAgentEntry => x !== null);

        scored.sort((a, b) => b.effectiveScore - a.effectiveScore);
        topAgentsByMode[mode] = scored.slice(0, 10);
      }
    }

    return {
      date,
      generatedAt: new Date().toISOString(),
      modes: modeStats,
      backgroundQueueSnapshot: input.queueStatus,
      topAgentsByMode,
      config: {
        reportVersion: '1.0.0',
        decayPer30Days: DECAY_PER_30_DAYS,
        modeWeights: DEFAULT_MODE_WEIGHTS,
      },
    };
  }

  private _persist(report: ExecutionModeDashboardReport, date: string): void {
    mkdirSync(this.reportBaseDir, { recursive: true });
    writeFileSync(this.reportPath(date), JSON.stringify(report, null, 2), 'utf8');
  }
}

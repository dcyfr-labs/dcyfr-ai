/**
 * Behavior Baseline Profiler
 *
 * Maintains per-plugin rolling statistical baselines using Welford's online
 * algorithm. Tracks mean and standard deviation for each behavioral metric
 * without storing raw samples.
 *
 * @module plugins/anomaly/behavior-baseline
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import type {
  PluginBaseline,
  PluginMetricSample,
  BehaviorMetric,
} from './types.js';
import { BEHAVIOR_METRICS } from './types.js';

// ---------------------------------------------------------------------------
// Internal state shape (same fields as PluginBaseline without ISO strings)
// ---------------------------------------------------------------------------

interface BaselineState {
  mean: number;
  /** M2 accumulator for Welford's algorithm (variance * n). */
  m2: number;
  sample_count: number;
  last_updated: string;
}

type PluginStateMap = Map<BehaviorMetric, BaselineState>;

// ---------------------------------------------------------------------------
// BehaviorBaseline
// ---------------------------------------------------------------------------

/**
 * In-memory behavior baseline store.
 *
 * Uses Welford's online algorithm for numerically stable computation of
 * rolling mean and standard deviation without retaining raw sample history.
 *
 * @example
 * ```ts
 * const baseline = new BehaviorBaseline();
 * baseline.updateBaseline({ plugin_id: 'my-plugin', run_id: 'r1',
 *   measured_at: new Date().toISOString(), filesystem_ops: 120,
 *   network_requests: 5, cpu_percent: 30, memory_mb: 80 });
 *
 * const sigma = baseline.getStdDevsFromMean('my-plugin', 'filesystem_ops', 900);
 * // returns null when < MIN_SAMPLES, or a numeric z-score otherwise
 * ```
 */
export class BehaviorBaseline {
  /**
   * Minimum samples required before std-dev comparisons are meaningful.
   * Below this threshold, `getStdDevsFromMean` returns null.
   */
  static readonly MIN_SAMPLES = 5;

  /** plugin_id → metric → running stats */
  private readonly store = new Map<string, PluginStateMap>();

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Incorporate a new sample into all four metric baselines for the plugin.
   * Safe to call on the very first observation — initialises state automatically.
   */
  updateBaseline(sample: PluginMetricSample): void {
    const pluginMap = this.getOrCreatePluginMap(sample.plugin_id);
    const now = sample.measured_at;

    for (const metric of BEHAVIOR_METRICS) {
      const value = sample[metric];
      const state = pluginMap.get(metric) ?? { mean: 0, m2: 0, sample_count: 0, last_updated: now };
      pluginMap.set(metric, this.welfordUpdate(state, value, now));
    }

    this.store.set(sample.plugin_id, pluginMap);
  }

  /**
   * Retrieve the current baseline for a specific plugin + metric.
   * Returns `null` if no observations have been made yet.
   */
  getBaseline(pluginId: string, metric: BehaviorMetric): PluginBaseline | null {
    const state = this.store.get(pluginId)?.get(metric);
    if (!state || state.sample_count === 0) return null;

    return {
      plugin_id: pluginId,
      metric,
      mean: state.mean,
      std_dev: this.deriveStdDev(state),
      sample_count: state.sample_count,
      last_updated: state.last_updated,
    };
  }

  /**
   * Calculate how many standard deviations `value` is from the baseline mean.
   *
   * Returns `null` when:
   * - No baseline exists for this plugin + metric.
   * - Sample count is below `MIN_SAMPLES` (baseline not yet reliable).
   * - The standard deviation is 0 or effectively zero (constant metric) —
   *   returns `null` to avoid false spikes on perfectly stable plugins.
   */
  getStdDevsFromMean(pluginId: string, metric: BehaviorMetric, value: number): number | null {
    const state = this.store.get(pluginId)?.get(metric);
    if (!state || state.sample_count < BehaviorBaseline.MIN_SAMPLES) return null;

    const stdDev = this.deriveStdDev(state);
    if (stdDev < 1e-10) return null; // constant metric — no meaningful z-score

    return (value - state.mean) / stdDev;
  }

  /**
   * Return all baselines for a given plugin.
   * Useful for serialisation or debugging.
   */
  getAllBaselines(pluginId: string): PluginBaseline[] {
    const pluginMap = this.store.get(pluginId);
    if (!pluginMap) return [];

    const baselines: PluginBaseline[] = [];
    for (const metric of BEHAVIOR_METRICS) {
      const state = pluginMap.get(metric);
      if (state && state.sample_count > 0) {
        baselines.push({
          plugin_id: pluginId,
          metric,
          mean: state.mean,
          std_dev: this.deriveStdDev(state),
          sample_count: state.sample_count,
          last_updated: state.last_updated,
        });
      }
    }
    return baselines;
  }

  /**
   * Reset all baselines for a plugin. Used when a plugin is re-certified or
   * after a version bump that changes expected behaviour.
   */
  resetBaseline(pluginId: string): void {
    this.store.delete(pluginId);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private getOrCreatePluginMap(pluginId: string): PluginStateMap {
    const existing = this.store.get(pluginId);
    if (existing) return existing;
    const map: PluginStateMap = new Map();
    this.store.set(pluginId, map);
    return map;
  }

  /**
   * Welford's online algorithm — single-pass update of mean and M2.
   *
   * @see https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
   */
  private welfordUpdate(state: BaselineState, newValue: number, now: string): BaselineState {
    const n = state.sample_count + 1;
    const delta = newValue - state.mean;
    const newMean = state.mean + delta / n;
    const delta2 = newValue - newMean;
    const newM2 = state.m2 + delta * delta2;

    return {
      mean: newMean,
      m2: newM2,
      sample_count: n,
      last_updated: now,
    };
  }

  /** Population standard deviation derived from M2 accumulator. */
  private deriveStdDev(state: BaselineState): number {
    if (state.sample_count < 2) return 0;
    return Math.sqrt(state.m2 / state.sample_count);
  }
}

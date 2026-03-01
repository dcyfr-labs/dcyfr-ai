/**
 * Anomaly Detector
 *
 * Pure detection logic: compares a single PluginMetricSample against
 * established baselines and returns any detected anomalies.
 *
 * No side-effects — simply accepts a sample and returns a list of anomalies.
 *
 * @module plugins/anomaly/anomaly-detector
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { randomUUID } from 'node:crypto';
import type {
  PluginMetricSample,
  BehaviorMetric,
  AnomalyType,
  AnomalySeverity,
  DetectedAnomaly,
} from './types.js';
import type { BehaviorBaseline } from './behavior-baseline.js';

// ---------------------------------------------------------------------------
// Metric → AnomalyType mapping
// ---------------------------------------------------------------------------

const METRIC_TO_ANOMALY_TYPE: Record<BehaviorMetric, AnomalyType> = {
  filesystem_ops:  'filesystem_spike',
  network_requests:'network_spike',
  cpu_percent:     'cpu_spike',
  memory_mb:       'memory_spike',
};

// ---------------------------------------------------------------------------
// AnomalyDetector
// ---------------------------------------------------------------------------

/** Configuration for the AnomalyDetector. */
export interface AnomalyDetectorConfig {
  /**
   * Number of standard deviations above the mean at which anomalies are
   * flagged as WARNING. Values below this threshold are considered normal.
   * @default 2
   */
  warningSigmaThreshold: number;

  /**
   * Number of standard deviations above the mean at which anomalies are
   * classified as CRITICAL (eligible for auto-suspension).
   * @default 3
   */
  criticalSigmaThreshold: number;
}

const DEFAULT_DETECTOR_CONFIG: AnomalyDetectorConfig = {
  warningSigmaThreshold:  2,
  criticalSigmaThreshold: 3,
};

/**
 * Compares a PluginMetricSample against an established BehaviorBaseline and
 * returns all anomalies found.
 *
 * @example
 * ```ts
 * const detector = new AnomalyDetector({ criticalSigmaThreshold: 3 });
 * const anomalies = detector.detectAnomalies(sample, baseline);
 * const criticals = anomalies.filter(a => a.severity === 'CRITICAL');
 * ```
 */
export class AnomalyDetector {
  private readonly config: AnomalyDetectorConfig;

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Analyse a single metric sample against baseline stats.
   * Returns an array of anomalies (may be empty if all metrics are normal).
   */
  detectAnomalies(
    sample: PluginMetricSample,
    baseline: BehaviorBaseline,
  ): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];
    const now = new Date().toISOString();

    for (const metric of Object.keys(METRIC_TO_ANOMALY_TYPE) as BehaviorMetric[]) {
      const anomaly = this.checkMetric(sample, metric, baseline, now);
      if (anomaly) anomalies.push(anomaly);
    }

    return anomalies;
  }

  /**
   * Returns true if an anomaly qualifies for auto-suspension.
   * Currently: severity === CRITICAL.
   */
  isSevere(anomaly: DetectedAnomaly): boolean {
    return anomaly.severity === 'CRITICAL';
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private checkMetric(
    sample: PluginMetricSample,
    metric: BehaviorMetric,
    baseline: BehaviorBaseline,
    detectedAt: string,
  ): DetectedAnomaly | null {
    const value = sample[metric];
    const stdDevsFromMean = baseline.getStdDevsFromMean(sample.plugin_id, metric, value);

    // No baseline or insufficient samples — cannot detect anomalies yet
    if (stdDevsFromMean === null) return null;

    // Only flag spikes (positive deviations), not unusually low values
    if (stdDevsFromMean < this.config.warningSigmaThreshold) return null;

    const baselineStats = baseline.getBaseline(sample.plugin_id, metric);
    if (!baselineStats) return null;

    const severity = this.classifySeverity(stdDevsFromMean);

    return {
      id: randomUUID(),
      plugin_id: sample.plugin_id,
      run_id: sample.run_id,
      anomaly_type: METRIC_TO_ANOMALY_TYPE[metric],
      metric_value: value,
      baseline_mean: baselineStats.mean,
      baseline_std_dev: baselineStats.std_dev,
      std_devs_from_mean: stdDevsFromMean,
      severity,
      detected_at: detectedAt,
    };
  }

  private classifySeverity(stdDevsFromMean: number): AnomalySeverity {
    return stdDevsFromMean >= this.config.criticalSigmaThreshold ? 'CRITICAL' : 'WARNING';
  }
}

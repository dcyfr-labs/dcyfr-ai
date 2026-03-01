/**
 * Plugin Behavioral Anomaly Detection
 *
 * Exports the full anomaly detection pipeline for plugin behavioral monitoring.
 *
 * @module plugins/anomaly
 */

export { BehaviorBaseline } from './behavior-baseline.js';
export { AnomalyDetector } from './anomaly-detector.js';
export type { AnomalyDetectorConfig } from './anomaly-detector.js';
export { AnomalyMonitor } from './anomaly-monitor.js';
export type {
  AnomalyMonitorConfig,
  ResolveOptions,
  AnomalyStats,
} from './anomaly-monitor.js';
export { ANOMALY_SCHEMA_SQL, BEHAVIOR_METRICS } from './types.js';
export type {
  PluginMetricSample,
  BehaviorMetric,
  PluginBaseline,
  AnomalyType,
  AnomalySeverity,
  DetectedAnomaly,
  ReviewStatus,
  AnomalyReviewItem,
  AnomalyMonitorResult,
  AnomalyAxiomPayload,
  AnomalyAxiomLogger,
} from './types.js';

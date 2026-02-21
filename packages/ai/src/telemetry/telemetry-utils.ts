/**
 * DCYFR Telemetry Utilities and Helpers
 * TLP:AMBER - Internal Use Only
 * 
 * Utility functions for telemetry event analysis, correlation, and reporting.
 * 
 * @module telemetry/telemetry-utils
 * @version 1.0.0
 * @date 2026-02-13
 */

import type {
  DelegationTelemetryEvent,
  DelegationChainCorrelation,
  DelegationPerformanceMetrics,
  TelemetryQueryFilter,
} from './delegation-telemetry';

/**
 * Delegation chain analysis result
 */
export interface DelegationChainAnalysis {
  /** Root delegation ID */
  root_delegation_id: string;
  
  /** Total contracts in chain */
  total_contracts: number;
  
  /** Chain depth (longest path) */
  max_depth: number;
  
  /** Chain participants */
  participants: string[];
  
  /** Chain duration (ms) */
  total_duration_ms: number;
  
  /** Chain success rate */
  success_rate: number;
  
  /** Performance summary */
  performance_summary: {
    avg_execution_time_ms: number;
    avg_negotiation_time_ms: number;
    total_retries: number;
    avg_confidence: number;
  };
  
  /** Chain status distribution */
  status_distribution: Record<string, number>;
  
  /** Timeline of events */
  timeline: Array<{
    timestamp: string;
    event_type: string;
    contract_id: string;
    agent_id: string;
    depth: number;
  }>;
}

/**
 * Performance summary for a time period
 */
export interface PerformanceSummary {
  /** Time period */
  period: {
    start_time: string;
    end_time: string;
    duration_ms: number;
  };
  
  /** Total events processed */
  total_events: number;
  
  /** Event type distribution */
  event_types: Record<string, number>;
  
  /** Agent performance */
  agent_performance: Record<string, {
    total_contracts: number;
    success_rate: number;
    avg_execution_time_ms: number;
    avg_confidence: number;
  }>;
  
  /** Overall metrics */
  overall_metrics: {
    avg_chain_depth: number;
    avg_chain_duration_ms: number;
    total_firebreaks_triggered: number;
    most_common_failure_reason: string;
  };
  
  /** Resource utilization */
  resource_utilization: {
    avg_memory_mb: number;
    avg_cpu_time_ms: number;
    total_network_calls: number;
  };
}

/**
 * Analyze delegation chain from telemetry events
 */
export function analyzeDelegationChain(
  events: DelegationTelemetryEvent[],
  rootDelegationId: string
): DelegationChainAnalysis {
  // Filter events for this chain
  const chainEvents = events.filter(
    event => event.chain_correlation.root_delegation_id === rootDelegationId
  );
  
  if (chainEvents.length === 0) {
    throw new Error(`No events found for delegation chain: ${rootDelegationId}`);
  }
  
  // Sort events by timestamp
  chainEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Calculate basic metrics
  const contractIds = new Set(chainEvents.map(e => e.contract_id));
  const participants = new Set(chainEvents.map(e => e.agent_id));
  const maxDepth = Math.max(...chainEvents.map(e => e.chain_correlation.chain_depth));
  
  // Calculate durations (prefer explicit chain lifecycle timestamps when available)
  const startedTimes = chainEvents
    .map(e => e.chain_correlation.chain_started_at)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map(t => new Date(t).getTime())
    .filter(ms => Number.isFinite(ms));
  const completedTimes = chainEvents
    .map(e => e.chain_correlation.chain_completed_at)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map(t => new Date(t).getTime())
    .filter(ms => Number.isFinite(ms));

  const eventStart = new Date(chainEvents[0].timestamp).getTime();
  const eventEnd = new Date(chainEvents[chainEvents.length - 1].timestamp).getTime();
  const startTimeMs = startedTimes.length > 0 ? Math.min(...startedTimes) : eventStart;
  const endTimeMs = completedTimes.length > 0 ? Math.max(...completedTimes) : eventEnd;
  const totalDurationMs = Math.max(0, endTimeMs - startTimeMs);
  
  // Calculate success rate
  const completionEvents = chainEvents.filter(e => 
    e.event_type === 'delegation_completed' || e.event_type === 'delegation_failed'
  );
  const successfulEvents = chainEvents.filter(e => e.event_type === 'delegation_completed');
  const successRate = completionEvents.length > 0 ? 
    successfulEvents.length / completionEvents.length : 0;
  
  // Calculate performance summary
  const performanceEvents = chainEvents.filter(e => e.performance_metrics);
  const performanceSummary = {
    avg_execution_time_ms: calculateAverage(
      performanceEvents.map(e => e.performance_metrics!.execution_time_ms)
    ),
    avg_negotiation_time_ms: calculateAverage(
      performanceEvents.map(e => e.performance_metrics!.contract_negotiation_time_ms)
    ),
    total_retries: performanceEvents.reduce((sum, e) => 
      sum + (e.performance_metrics!.quality_metrics.retry_count || 0), 0
    ),
    avg_confidence: calculateAverage(
      performanceEvents.map(e => e.performance_metrics!.quality_metrics.confidence_level)
    ),
  };
  
  // Status distribution
  const statusDistribution: Record<string, number> = {};
  chainEvents.forEach(event => {
    const status = event.chain_correlation.chain_status;
    statusDistribution[status] = (statusDistribution[status] || 0) + 1;
  });
  
  // Build timeline
  const timeline = chainEvents.map(event => ({
    timestamp: event.timestamp,
    event_type: event.event_type,
    contract_id: event.contract_id,
    agent_id: event.agent_id,
    depth: event.chain_correlation.chain_depth,
  }));
  
  return {
    root_delegation_id: rootDelegationId,
    total_contracts: contractIds.size,
    max_depth: maxDepth,
    participants: Array.from(participants),
    total_duration_ms: totalDurationMs,
    success_rate: successRate,
    performance_summary: performanceSummary,
    status_distribution: statusDistribution,
    timeline,
  };
}

/**
 * Generate performance summary for a time period
 */
export function generatePerformanceSummary(
  events: DelegationTelemetryEvent[],
  startTime: Date,
  endTime: Date
): PerformanceSummary {
  // Filter events in time range
  const periodEvents = events.filter(event => {
    const eventTime = new Date(event.timestamp);
    return eventTime >= startTime && eventTime <= endTime;
  });
  
  // Event type distribution
  const eventTypes: Record<string, number> = {};
  periodEvents.forEach(event => {
    eventTypes[event.event_type] = (eventTypes[event.event_type] || 0) + 1;
  });
  
  // Agent performance analysis
  const agentPerformance: Record<string, any> = {};
  const agentGroups = groupBy(periodEvents, event => event.agent_id);
  
  for (const [agentId, agentEvents] of Object.entries(agentGroups)) {
    const contractEvents = agentEvents.filter(e => e.event_type.includes('contract'));
    const completionEvents = agentEvents.filter(e => 
      e.event_type === 'delegation_completed' || e.event_type === 'delegation_failed'
    );
    const successfulEvents = agentEvents.filter(e => e.event_type === 'delegation_completed');
    const performanceEvents = agentEvents.filter(e => e.performance_metrics);
    
    agentPerformance[agentId] = {
      total_contracts: new Set(contractEvents.map(e => e.contract_id)).size,
      success_rate: completionEvents.length > 0 ? 
        successfulEvents.length / completionEvents.length : 0,
      avg_execution_time_ms: calculateAverage(
        performanceEvents.map(e => e.performance_metrics!.execution_time_ms)
      ),
      avg_confidence: calculateAverage(
        performanceEvents.map(e => e.performance_metrics!.quality_metrics.confidence_level)
      ),
    };
  }
  
  // Overall metrics
  const chainDepths = periodEvents.map(e => e.chain_correlation.chain_depth);
  const chainDurations = periodEvents.map(e => e.chain_correlation.chain_completed_at ? 
    new Date(e.chain_correlation.chain_completed_at).getTime() - 
    new Date(e.chain_correlation.chain_started_at).getTime() : 0
  ).filter(d => d > 0);
  
  const firebreakEvents = periodEvents.filter(e => e.event_type === 'delegation_firebreak_triggered');
  const failedEvents = periodEvents.filter(e => e.event_type === 'delegation_failed');
  const failureReasons = failedEvents.map(e => e.event_data.completion_reason).filter(r => typeof r === 'string');
  const mostCommonFailure: string = String(getMostFrequent(failureReasons) || 'unknown');
  
  // Resource utilization
  const resourceEvents = periodEvents.filter(e => e.performance_metrics?.resource_utilization);
  const avgMemory = calculateAverage(
    resourceEvents.map(e => e.performance_metrics!.resource_utilization.peak_memory_mb)
  );
  const avgCpuTime = calculateAverage(
    resourceEvents.map(e => e.performance_metrics!.resource_utilization.cpu_time_ms)
  );
  const totalNetworkCalls = resourceEvents.reduce(
    (sum, e) => sum + e.performance_metrics!.resource_utilization.network_calls, 0
  );
  
  return {
    period: {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_ms: endTime.getTime() - startTime.getTime(),
    },
    total_events: periodEvents.length,
    event_types: eventTypes,
    agent_performance: agentPerformance,
    overall_metrics: {
      avg_chain_depth: calculateAverage(chainDepths),
      avg_chain_duration_ms: calculateAverage(chainDurations),
      total_firebreaks_triggered: firebreakEvents.length,
      most_common_failure_reason: mostCommonFailure,
    },
    resource_utilization: {
      avg_memory_mb: avgMemory,
      avg_cpu_time_ms: avgCpuTime,
      total_network_calls: totalNetworkCalls,
    },
  };
}

/**
 * Find delegation chains with anomalies
 */
type ChainAnomaly = {
  chain_id: string;
  anomaly_type: 'excessive_depth' | 'excessive_duration' | 'low_success_rate' | 'excessive_retries';
  severity: 'warning' | 'critical';
  details: Record<string, unknown>;
};

type AnomalyThresholds = {
  max_depth_threshold: number;
  max_duration_threshold_ms: number;
  min_success_rate_threshold: number;
  max_retry_threshold: number;
};

function checkChainForAnomalies(rootId: string, analysis: ReturnType<typeof analyzeDelegationChain>, thresholds: AnomalyThresholds): ChainAnomaly[] {
  const anomalies: ChainAnomaly[] = [];

  if (analysis.max_depth > thresholds.max_depth_threshold) {
    anomalies.push({
      chain_id: rootId, anomaly_type: 'excessive_depth',
      severity: analysis.max_depth >= thresholds.max_depth_threshold * 1.5 ? 'critical' : 'warning',
      details: { actual_depth: analysis.max_depth, threshold: thresholds.max_depth_threshold, participants: analysis.participants },
    });
  }
  if (analysis.total_duration_ms > thresholds.max_duration_threshold_ms) {
    anomalies.push({
      chain_id: rootId, anomaly_type: 'excessive_duration',
      severity: analysis.total_duration_ms >= thresholds.max_duration_threshold_ms * 2 ? 'critical' : 'warning',
      details: { actual_duration_ms: analysis.total_duration_ms, threshold_duration_ms: thresholds.max_duration_threshold_ms, avg_execution_time_ms: analysis.performance_summary.avg_execution_time_ms },
    });
  }
  if (analysis.success_rate < thresholds.min_success_rate_threshold) {
    anomalies.push({
      chain_id: rootId, anomaly_type: 'low_success_rate',
      severity: analysis.success_rate <= thresholds.min_success_rate_threshold * 0.5 ? 'critical' : 'warning',
      details: { actual_success_rate: analysis.success_rate, threshold_success_rate: thresholds.min_success_rate_threshold, total_contracts: analysis.total_contracts },
    });
  }
  if (analysis.performance_summary.total_retries > thresholds.max_retry_threshold) {
    anomalies.push({
      chain_id: rootId, anomaly_type: 'excessive_retries',
      severity: analysis.performance_summary.total_retries >= thresholds.max_retry_threshold * 2 ? 'critical' : 'warning',
      details: { actual_retries: analysis.performance_summary.total_retries, threshold_retries: thresholds.max_retry_threshold, avg_confidence: analysis.performance_summary.avg_confidence },
    });
  }
  return anomalies;
}

export function findChainAnomalies(
  events: DelegationTelemetryEvent[],
  options: {
    max_depth_threshold?: number;
    max_duration_threshold_ms?: number;
    min_success_rate_threshold?: number;
    max_retry_threshold?: number;
  } = {}
): ChainAnomaly[] {
  const thresholds: AnomalyThresholds = {
    max_depth_threshold: 10,
    max_duration_threshold_ms: 300000, // 5 minutes
    min_success_rate_threshold: 0.8,
    max_retry_threshold: 5,
    ...options,
  };
  
  const anomalies: ChainAnomaly[] = [];
  const chainGroups = groupBy(events, event => event.chain_correlation.root_delegation_id);
  
  for (const [rootId, _chainEvents] of Object.entries(chainGroups)) {
    const analysis = analyzeDelegationChain(events, rootId);
    anomalies.push(...checkChainForAnomalies(rootId, analysis, thresholds));
  }
  
  return anomalies;
}

/**
 * Generate telemetry query filter for common use cases
 */
export function createTelemetryFilter(options: {
  agent_id?: string;
  time_range?: { start: Date; end: Date };
  event_types?: string[];
  chain_id?: string;
  severity_levels?: string[];
  limit?: number;
}): TelemetryQueryFilter {
  const filter: TelemetryQueryFilter = {};
  
  if (options.agent_id) filter.agent_id = options.agent_id;
  if (options.time_range) {
    filter.start_time = options.time_range.start;
    filter.end_time = options.time_range.end;
  }
  if (options.event_types) filter.event_type = options.event_types as any;
  if (options.chain_id) {
    filter.chain_correlation = { root_delegation_id: options.chain_id };
  }
  if (options.severity_levels) filter.severity = options.severity_levels as any;
  if (options.limit) filter.limit = options.limit;
  
  return filter;
}

// Utility functions

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

function getMostFrequent<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  
  const counts: Record<string, number> = {};
  for (const item of array) {
    const key = String(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  
  let maxCount = 0;
  let mostFrequent: T | undefined;
  for (const [key, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = array.find(item => String(item) === key);
    }
  }
  
  return mostFrequent;
}
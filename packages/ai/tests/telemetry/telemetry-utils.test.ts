/**
 * DCYFR Telemetry Utilities Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Tests for telemetry analysis, chain correlation, performance summarization,
 * and anomaly detection utilities.
 * 
 * @module tests/telemetry/telemetry-utils.test
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeDelegationChain,
  generatePerformanceSummary,
  findChainAnomalies,
  createTelemetryFilter,
} from '../../src/telemetry/telemetry-utils';
import type {
  DelegationTelemetryEvent,
  DelegationChainCorrelation,
  DelegationPerformanceMetrics,
} from '../../src/telemetry';

// Test data creation helpers
function createMockTelemetryEvent(
  eventType: string,
  contractId: string,
  chainCorrelation: Partial<DelegationChainCorrelation>,
  performanceMetrics?: Partial<DelegationPerformanceMetrics>
): DelegationTelemetryEvent {
  const baseTime = Date.now();
  
  return {
    event_id: `event-${Math.random().toString(36).substr(2, 9)}`,
    event_type: eventType as any,
    timestamp: new Date(baseTime + Math.random() * 60000).toISOString(),
    agent_id: `agent-${Math.random().toString(36).substr(2, 5)}`,
    contract_id: contractId,
    chain_correlation: {
      root_delegation_id: 'root-001',
      chain_depth: 0,
      total_chain_contracts: 1,
      chain_participants: ['agent-001'],
      chain_started_at: new Date(baseTime).toISOString(),
      chain_status: 'active',
      ...chainCorrelation,
    } as DelegationChainCorrelation,
    event_data: {},
    severity: 'info',
    performance_metrics: performanceMetrics ? {
      contract_negotiation_time_ms: 1000,
      execution_time_ms: 5000,
      verification_time_ms: 500,
      total_lifecycle_time_ms: 6500,
      resource_utilization: {
        peak_memory_mb: 128,
        cpu_time_ms: 4500,
        network_calls: 3,
        disk_io_bytes: 1024,
      },
      quality_metrics: {
        success_rate: 1.0,
        verification_score: 0.9,
        confidence_level: 0.85,
        retry_count: 0,
      },
      ...performanceMetrics,
    } as DelegationPerformanceMetrics : undefined,
  };
}

function createChainEvents(rootId: string, depth: number, contractsPerLevel = 2): DelegationTelemetryEvent[] {
  const events: DelegationTelemetryEvent[] = [];
  let contractCounter = 0;
  
  function createLevelEvents(currentDepth: number, parentId?: string): void {
    if (currentDepth > depth) return;
    
    for (let i = 0; i < contractsPerLevel; i++) {
      const contractId = `contract-${++contractCounter}`;
      const agentId = `agent-${currentDepth}-${i}`;
      
      const chainCorrelation: Partial<DelegationChainCorrelation> = {
        root_delegation_id: rootId,
        parent_delegation_id: parentId,
        chain_depth: currentDepth,
        total_chain_contracts: Math.pow(contractsPerLevel, depth + 1),
        chain_participants: [`agent-${currentDepth}-${i}`],
      };
      
      // Contract created
      events.push(createMockTelemetryEvent(
        'delegation_contract_created',
        contractId,
        chainCorrelation
      ));
      
      // Progress update
      events.push(createMockTelemetryEvent(
        'delegation_progress',
        contractId,
        chainCorrelation
      ));
      
      // Completion (success rate based on depth)
      const success = Math.random() > (currentDepth * 0.1); // Deeper chains more likely to fail
      const completionEvent = success ? 'delegation_completed' : 'delegation_failed';
      
      events.push(createMockTelemetryEvent(
        completionEvent,
        contractId,
        {
          ...chainCorrelation,
          chain_status: success ? 'completed' : 'failed',
          chain_completed_at: new Date(Date.now() + 10000).toISOString(),
        },
        {
          execution_time_ms: 3000 + (currentDepth * 1000), // Deeper tasks take longer
          quality_metrics: {
            success_rate: success ? 1.0 : 0.0,
            confidence_level: Math.max(0.1, 0.9 - (currentDepth * 0.1)),
            retry_count: currentDepth, // More retries at deeper levels
          },
        }
      ));
      
      // Create next level
      createLevelEvents(currentDepth + 1, contractId);
    }
  }
  
  createLevelEvents(0);
  return events;
}

describe('analyzeDelegationChain', () => {
  it('should analyze a simple delegation chain correctly', () => {
    const rootId = 'root-simple';
    const events = [
      createMockTelemetryEvent('delegation_contract_created', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 0,
        total_chain_contracts: 1,
      }),
      createMockTelemetryEvent('delegation_progress', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 0,
      }),
      createMockTelemetryEvent('delegation_completed', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 0,
        chain_status: 'completed',
        chain_completed_at: new Date().toISOString(),
      }, {
        quality_metrics: { success_rate: 1.0, confidence_level: 0.9, retry_count: 0 },
      }),
    ];
    
    const analysis = analyzeDelegationChain(events, rootId);
    
    expect(analysis.root_delegation_id).toBe(rootId);
    expect(analysis.total_contracts).toBe(1);
    expect(analysis.max_depth).toBe(0);
    expect(analysis.success_rate).toBe(1.0);
    expect(analysis.timeline).toHaveLength(3);
    expect(analysis.performance_summary.total_retries).toBe(0);
    expect(analysis.performance_summary.avg_confidence).toBe(0.9);
  });
  
  it('should analyze a complex multi-level chain', () => {
    const rootId = 'root-complex';
    const events = createChainEvents(rootId, 2, 2); // 2 levels, 2 contracts per level
    
    const analysis = analyzeDelegationChain(events, rootId);
    
    expect(analysis.root_delegation_id).toBe(rootId);
    expect(analysis.max_depth).toBe(2);
    expect(analysis.total_contracts).toBeGreaterThan(2);
    expect(analysis.participants.length).toBeGreaterThan(1);
    expect(analysis.total_duration_ms).toBeGreaterThan(0);
    expect(analysis.timeline.length).toBeGreaterThan(6); // Multiple events per contract
    
    // Performance summary should be calculated
    expect(analysis.performance_summary.avg_execution_time_ms).toBeGreaterThan(0);
    expect(analysis.performance_summary.total_retries).toBeGreaterThanOrEqual(0);
    expect(analysis.performance_summary.avg_confidence).toBeGreaterThan(0);
    
    // Status distribution should exist
    expect(Object.keys(analysis.status_distribution).length).toBeGreaterThan(0);
  });
  
  it('should handle chains with failures correctly', () => {
    const rootId = 'root-failures';
    const events = [
      createMockTelemetryEvent('delegation_contract_created', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 0,
      }),
      createMockTelemetryEvent('delegation_failed', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 0,
        chain_status: 'failed',
      }, {
        quality_metrics: { success_rate: 0.0, confidence_level: 0.1, retry_count: 3 },
      }),
      createMockTelemetryEvent('delegation_contract_created', 'contract-2', {
        root_delegation_id: rootId,
        chain_depth: 0,
      }),
      createMockTelemetryEvent('delegation_completed', 'contract-2', {
        root_delegation_id: rootId,
        chain_depth: 0,
        chain_status: 'completed',
      }, {
        quality_metrics: { success_rate: 1.0, confidence_level: 0.8, retry_count: 1 },
      }),
    ];
    
    const analysis = analyzeDelegationChain(events, rootId);
    
    expect(analysis.success_rate).toBe(0.5); // 1 success out of 2 completion events
    expect(analysis.performance_summary.total_retries).toBe(4); // 3 + 1
    expect(analysis.performance_summary.avg_confidence).toBe(0.45); // (0.1 + 0.8) / 2
  });
  
  it('should throw error for unknown chain ID', () => {
    const events = [
      createMockTelemetryEvent('delegation_contract_created', 'contract-1', {
        root_delegation_id: 'different-root',
        chain_depth: 0,
      }),
    ];
    
    expect(() => {
      analyzeDelegationChain(events, 'unknown-root');
    }).toThrow('No events found for delegation chain: unknown-root');
  });
});

describe('generatePerformanceSummary', () => {
  it('should generate summary for a time period', () => {
    const startTime = new Date('2026-02-13T10:00:00Z');
    const endTime = new Date('2026-02-13T11:00:00Z');
    
    const events: DelegationTelemetryEvent[] = [
      // Events within time range
      {
        ...createMockTelemetryEvent('delegation_contract_created', 'contract-1', {}),
        timestamp: '2026-02-13T10:15:00Z',
        agent_id: 'agent-alpha',
      },
      {
        ...createMockTelemetryEvent('delegation_completed', 'contract-1', {}),
        timestamp: '2026-02-13T10:30:00Z',
        agent_id: 'agent-alpha',
        performance_metrics: {
          contract_negotiation_time_ms: 1000,
          execution_time_ms: 5000,
          verification_time_ms: 500,
          total_lifecycle_time_ms: 6500,
          resource_utilization: {
            peak_memory_mb: 128,
            cpu_time_ms: 4500,
            network_calls: 3,
            disk_io_bytes: 1024,
          },
          quality_metrics: {
            success_rate: 1.0,
            verification_score: 0.9,
            confidence_level: 0.85,
            retry_count: 0,
          },
        },
      },
      {
        ...createMockTelemetryEvent('delegation_firebreak_triggered', 'contract-2', {}),
        timestamp: '2026-02-13T10:45:00Z',
        agent_id: 'agent-beta',
      },
      // Event outside time range (should be ignored)
      {
        ...createMockTelemetryEvent('delegation_contract_created', 'contract-3', {}),
        timestamp: '2026-02-13T12:00:00Z',
        agent_id: 'agent-gamma',
      },
    ];
    
    const summary = generatePerformanceSummary(events, startTime, endTime);
    
    expect(summary.period.start_time).toBe('2026-02-13T10:00:00.000Z');
    expect(summary.period.end_time).toBe('2026-02-13T11:00:00.000Z');
    expect(summary.period.duration_ms).toBe(3600000); // 1 hour
    
    expect(summary.total_events).toBe(3); // Excludes event outside time range
    
    // Event type distribution
    expect(summary.event_types['delegation_contract_created']).toBe(1);
    expect(summary.event_types['delegation_completed']).toBe(1);
    expect(summary.event_types['delegation_firebreak_triggered']).toBe(1);
    
    // Agent performance
    expect(summary.agent_performance['agent-alpha']).toBeDefined();
    expect(summary.agent_performance['agent-alpha'].success_rate).toBe(1.0);
    expect(summary.agent_performance['agent-alpha'].avg_execution_time_ms).toBe(5000);
    expect(summary.agent_performance['agent-alpha'].avg_confidence).toBe(0.85);
    
    expect(summary.agent_performance['agent-beta']).toBeDefined();
    
    // Overall metrics
    expect(summary.overall_metrics.total_firebreaks_triggered).toBe(1);
    
    // Resource utilization
    expect(summary.resource_utilization.avg_memory_mb).toBe(128);
    expect(summary.resource_utilization.avg_cpu_time_ms).toBe(4500);
    expect(summary.resource_utilization.total_network_calls).toBe(3);
  });
  
  it('should handle empty time periods', () => {
    const startTime = new Date('2026-02-13T10:00:00Z');
    const endTime = new Date('2026-02-13T11:00:00Z');
    const events: DelegationTelemetryEvent[] = [];
    
    const summary = generatePerformanceSummary(events, startTime, endTime);
    
    expect(summary.total_events).toBe(0);
    expect(Object.keys(summary.event_types)).toHaveLength(0);
    expect(Object.keys(summary.agent_performance)).toHaveLength(0);
    expect(summary.overall_metrics.total_firebreaks_triggered).toBe(0);
  });
});

describe('findChainAnomalies', () => {
  it('should detect excessive depth anomalies', () => {
    const rootId = 'root-deep';
    const events = createChainEvents(rootId, 15, 1); // Very deep chain (depth 15)
    
    const anomalies = findChainAnomalies(events, {
      max_depth_threshold: 10,
    });
    
    const depthAnomaly = anomalies.find(a => a.anomaly_type === 'excessive_depth');
    expect(depthAnomaly).toBeDefined();
    expect(depthAnomaly!.chain_id).toBe(rootId);
    expect(depthAnomaly!.severity).toBe('critical'); // 15 > 10 * 1.5
    expect(depthAnomaly!.details.actual_depth).toBe(15);
  });
  
  it('should detect excessive duration anomalies', () => {
    const rootId = 'root-slow';
    const longDurationEvents = [
      createMockTelemetryEvent('delegation_contract_created', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 0,
        chain_started_at: new Date('2026-02-13T10:00:00Z').toISOString(),
      }),
      createMockTelemetryEvent('delegation_completed', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 0,
        chain_status: 'completed',
        chain_completed_at: new Date('2026-02-13T11:00:00Z').toISOString(), // 1 hour duration
      }),
    ];
    
    const anomalies = findChainAnomalies(longDurationEvents, {
      max_duration_threshold_ms: 300000, // 5 minutes
    });
    
    const durationAnomaly = anomalies.find(a => a.anomaly_type === 'excessive_duration');
    expect(durationAnomaly).toBeDefined();
    expect(durationAnomaly!.chain_id).toBe(rootId);
    expect(durationAnomaly!.severity).toBe('critical'); // 3600000ms > 300000ms * 2
  });
  
  it('should detect low success rate anomalies', () => {
    const rootId = 'root-failing';
    const failingEvents = [
      createMockTelemetryEvent('delegation_contract_created', 'contract-1', {
        root_delegation_id: rootId,
      }),
      createMockTelemetryEvent('delegation_failed', 'contract-1', {
        root_delegation_id: rootId,
        chain_status: 'failed',
      }),
      createMockTelemetryEvent('delegation_contract_created', 'contract-2', {
        root_delegation_id: rootId,
      }),
      createMockTelemetryEvent('delegation_failed', 'contract-2', {
        root_delegation_id: rootId,
        chain_status: 'failed',
      }),
    ];
    
    const anomalies = findChainAnomalies(failingEvents, {
      min_success_rate_threshold: 0.8,
    });
    
    const successAnomaly = anomalies.find(a => a.anomaly_type === 'low_success_rate');
    expect(successAnomaly).toBeDefined();
    expect(successAnomaly!.chain_id).toBe(rootId);
    expect(successAnomaly!.severity).toBe('critical'); // 0% < 0.8 * 0.5
  });
  
  it('should detect excessive retries anomalies', () => {
    const rootId = 'root-retries';
    const retryEvents = [
      createMockTelemetryEvent('delegation_contract_created', 'contract-1', {
        root_delegation_id: rootId,
      }),
      createMockTelemetryEvent('delegation_completed', 'contract-1', {
        root_delegation_id: rootId,
        chain_status: 'completed',
      }, {
        quality_metrics: {
          retry_count: 10, // Excessive retries
          success_rate: 1.0,
          confidence_level: 0.5,
        },
      }),
    ];
    
    const anomalies = findChainAnomalies(retryEvents, {
      max_retry_threshold: 5,
    });
    
    const retryAnomaly = anomalies.find(a => a.anomaly_type === 'excessive_retries');
    expect(retryAnomaly).toBeDefined();
    expect(retryAnomaly!.chain_id).toBe(rootId);
    expect(retryAnomaly!.severity).toBe('critical'); // 10 > 5 * 2
  });
  
  it('should return empty array for healthy chains', () => {
    const rootId = 'root-healthy';
    const healthyEvents = [
      createMockTelemetryEvent('delegation_contract_created', 'contract-1', {
        root_delegation_id: rootId,
        chain_depth: 1, // Normal depth
      }),
      createMockTelemetryEvent('delegation_completed', 'contract-1', {
        root_delegation_id: rootId,
        chain_status: 'completed',
      }, {
        quality_metrics: {
          retry_count: 1, // Normal retries
          success_rate: 1.0, // Good success rate
          confidence_level: 0.9, // High confidence
        },
      }),
    ];
    
    const anomalies = findChainAnomalies(healthyEvents);
    expect(anomalies).toHaveLength(0);
  });
});

describe('createTelemetryFilter', () => {
  it('should create filter with agent ID', () => {
    const filter = createTelemetryFilter({
      agent_id: 'test-agent',
    });
    
    expect(filter.agent_id).toBe('test-agent');
  });
  
  it('should create filter with time range', () => {
    const start = new Date('2026-02-13T10:00:00Z');
    const end = new Date('2026-02-13T11:00:00Z');
    
    const filter = createTelemetryFilter({
      time_range: { start, end },
    });
    
    expect(filter.start_time).toBe(start);
    expect(filter.end_time).toBe(end);
  });
  
  it('should create filter with event types', () => {
    const filter = createTelemetryFilter({
      event_types: ['delegation_contract_created', 'delegation_completed'],
    });
    
    expect(filter.event_type).toEqual(['delegation_contract_created', 'delegation_completed']);
  });
  
  it('should create filter with chain correlation', () => {
    const filter = createTelemetryFilter({
      chain_id: 'root-123',
    });
    
    expect(filter.chain_correlation).toEqual({
      root_delegation_id: 'root-123',
    });
  });
  
  it('should create filter with all options', () => {
    const start = new Date('2026-02-13T10:00:00Z');
    const end = new Date('2026-02-13T11:00:00Z');
    
    const filter = createTelemetryFilter({
      agent_id: 'test-agent',
      time_range: { start, end },
      event_types: ['delegation_progress'],
      chain_id: 'root-456',
      severity_levels: ['warning', 'error'],
      limit: 100,
    });
    
    expect(filter.agent_id).toBe('test-agent');
    expect(filter.start_time).toBe(start);
    expect(filter.end_time).toBe(end);
    expect(filter.event_type).toEqual(['delegation_progress']);
    expect(filter.chain_correlation).toEqual({ root_delegation_id: 'root-456' });
    expect(filter.severity).toEqual(['warning', 'error']);
    expect(filter.limit).toBe(100);
  });
  
  it('should create empty filter with no options', () => {
    const filter = createTelemetryFilter({});
    
    expect(Object.keys(filter)).toHaveLength(0);
  });
});
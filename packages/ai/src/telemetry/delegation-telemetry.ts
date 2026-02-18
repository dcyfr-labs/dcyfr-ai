/**
 * DCYFR Delegation Telemetry System
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive telemetry system for tracking delegation contracts, chain
 * correlation, performance metrics, and event streaming for DCYFR AI agents.
 * 
 * @module telemetry/delegation-telemetry
 * @version 1.0.0
 * @date 2026-02-13
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { DelegationContract } from '../types/delegation-contracts';
import type { TaskExecutionContext, TaskExecutionResult } from '../runtime/agent-runtime';

/**
 * Delegation telemetry event types
 */
export type DelegationTelemetryEventType = 
  | 'delegation_contract_created'
  | 'delegation_contract_accepted'
  | 'delegation_contract_rejected'
  | 'delegation_progress'
  | 'delegation_completed'
  | 'delegation_failed'
  | 'delegation_chain_created'
  | 'delegation_chain_updated'
  | 'delegation_performance_measured'
  | 'delegation_escalation'
  | 'delegation_firebreak_triggered';

/**
 * Performance metrics for delegation tracking
 */
export interface DelegationPerformanceMetrics {
  /** Contract creation to acceptance time (ms) */
  contract_negotiation_time_ms: number;
  
  /** Task execution time (ms) */
  execution_time_ms: number;
  
  /** Verification time (ms) */
  verification_time_ms?: number;
  
  /** Total delegation lifecycle time (ms) */
  total_lifecycle_time_ms: number;
  
  /** Resource utilization */
  resource_utilization: {
    peak_memory_mb: number;
    cpu_time_ms: number;
    network_calls: number;
    disk_io_bytes: number;
  };
  
  /** Quality metrics */
  quality_metrics: {
    success_rate: number;
    verification_score?: number;
    confidence_level: number;
    retry_count: number;
  };
}

/**
 * Delegation chain correlation information
 */
export interface DelegationChainCorrelation {
  /** Root delegation ID (top-level contract) */
  root_delegation_id: string;
  
  /** Parent delegation ID (immediate parent) */
  parent_delegation_id?: string;
  
  /** Chain depth (0 = root) */
  chain_depth: number;
  
  /** Total contracts in chain */
  total_chain_contracts: number;
  
  /** Chain participants (agent IDs) */
  chain_participants: string[];
  
  /** Chain start timestamp */
  chain_started_at: string;
  
  /** Chain completion timestamp */
  chain_completed_at?: string;
  
  /** Chain status */
  chain_status: 'active' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Delegation telemetry event base structure
 */
export interface DelegationTelemetryEvent {
  /** Unique event ID */
  event_id: string;
  
  /** Event type */
  event_type: DelegationTelemetryEventType;
  
  /** Event timestamp */
  timestamp: string;
  
  /** Agent that generated the event */
  agent_id: string;
  
  /** Delegation contract ID */
  contract_id: string;
  
  /** Task execution ID */
  execution_id?: string;
  
  /** Chain correlation */
  chain_correlation: DelegationChainCorrelation;
  
  /** Event-specific data */
  event_data: Record<string, unknown>;
  
  /** Performance metrics (when applicable) */
  performance_metrics?: DelegationPerformanceMetrics;
  
  /** Event severity level */
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  
  /** Additional metadata */
  metadata?: {
    user_agent?: string;
    session_id?: string;
    correlation_id?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

/**
 * Contract creation event details
 */
export interface ContractCreatedEventData {
  contract: DelegationContract;
  delegator_agent: string;
  delegatee_agent: string;
  estimated_completion_ms?: number;
  priority_score: number;
}

/**
 * Contract progress event details
 */
export interface ContractProgressEventData {
  progress_percentage: number;
  current_phase: 'negotiation' | 'execution' | 'verification' | 'completion';
  elapsed_time_ms: number;
  estimated_remaining_ms?: number;
  intermediate_results?: unknown;
  checkpoints_completed: string[];
}

/**
 * Contract completion event details
 */
export interface ContractCompletionEventData {
  success: boolean;
  result?: unknown;
  verification_result?: {
    verified: boolean;
    quality_score: number;
    verification_method: string;
  };
  final_metrics: DelegationPerformanceMetrics;
  completion_reason: 'success' | 'timeout' | 'failure' | 'cancelled';
}

/**
 * Firebreak triggered event details
 */
export interface FirebreakTriggeredEventData {
  firebreak_type: 'max_depth' | 'tlp_escalation' | 'human_review' | 'timeout' | 'resource_limit';
  trigger_threshold: number;
  actual_value: number;
  action_taken: 'block' | 'escalate' | 'notify' | 'require_approval';
  escalation_target?: string;
}

/**
 * Telemetry sink interface for pluggable backends
 */
export interface TelemetrySink {
  /** Sink name/identifier */
  name: string;
  
  /** Write event to sink */
  writeEvent(event: DelegationTelemetryEvent): Promise<void>;
  
  /** Query events from sink (optional) */
  queryEvents?(filter: TelemetryQueryFilter): Promise<DelegationTelemetryEvent[]>;
  
  /** Get sink health status */
  getHealth(): Promise<{ healthy: boolean; message?: string }>;
  
  /** Close sink connection */
  close(): Promise<void>;
}

/**
 * Telemetry query filter
 */
export interface TelemetryQueryFilter {
  agent_id?: string;
  contract_id?: string;
  event_type?: DelegationTelemetryEventType | DelegationTelemetryEventType[];
  severity?: ('debug' | 'info' | 'warning' | 'error' | 'critical')[];
  start_time?: Date;
  end_time?: Date;
  chain_correlation?: {
    root_delegation_id?: string;
    chain_depth?: number;
  };
  limit?: number;
}

/**
 * Delegation telemetry engine configuration
 */
export interface DelegationTelemetryConfig {
  /** Agent ID for correlation */
  agent_id: string;
  
  /** Enable/disable telemetry collection */
  enabled: boolean;
  
  /** Telemetry sinks (console, file, database, etc.) */
  sinks: TelemetrySink[];
  
  /** Buffer size for batching events */
  buffer_size?: number;
  
  /** Buffer flush interval (ms) */
  flush_interval_ms?: number;
  
  /** Event sampling rate (0-1, 1 = all events) */
  sampling_rate?: number;
  
  /** Minimum severity level to emit */
  min_severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  
  /** Maximum events to store in memory */
  max_events_in_memory?: number;
  
  /** Enable performance tracking */
  enable_performance_tracking?: boolean;
  
  /** Enable chain correlation */
  enable_chain_correlation?: boolean;
}

/**
 * Console telemetry sink (default implementation)
 */
export class ConsoleTelemetrySink implements TelemetrySink {
  public readonly name = 'console';
  
  async writeEvent(event: DelegationTelemetryEvent): Promise<void> {
    console.log(`[TELEMETRY] ${event.timestamp} [${event.severity.toUpperCase()}] ${event.event_type}`, {
      agent_id: event.agent_id,
      contract_id: event.contract_id,
      execution_id: event.execution_id,
      chain_depth: event.chain_correlation.chain_depth,
      data: event.event_data,
    });
  }
  
  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }
  
  async close(): Promise<void> {
    // No cleanup needed for console sink
  }
}

/**
 * In-memory telemetry sink for testing and debugging
 */
export class InMemoryTelemetrySink implements TelemetrySink {
  public readonly name = 'memory';
  private events: DelegationTelemetryEvent[] = [];
  private maxEvents: number;
  
  constructor(maxEvents = 1000) {
    this.maxEvents = maxEvents;
  }
  
  async writeEvent(event: DelegationTelemetryEvent): Promise<void> {
    this.events.push(event);
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }
  
  async queryEvents(filter: TelemetryQueryFilter): Promise<DelegationTelemetryEvent[]> {
    let filteredEvents = [...this.events];
    
    if (filter.agent_id) {
      filteredEvents = filteredEvents.filter(e => e.agent_id === filter.agent_id);
    }
    
    if (filter.contract_id) {
      filteredEvents = filteredEvents.filter(e => e.contract_id === filter.contract_id);
    }
    
    if (filter.event_type) {
      const types = Array.isArray(filter.event_type) ? filter.event_type : [filter.event_type];
      filteredEvents = filteredEvents.filter(e => types.includes(e.event_type));
    }
    
    if (filter.severity) {
      filteredEvents = filteredEvents.filter(e => filter.severity!.includes(e.severity));
    }
    
    if (filter.start_time) {
      filteredEvents = filteredEvents.filter(e => new Date(e.timestamp) >= filter.start_time!);
    }
    
    if (filter.end_time) {
      filteredEvents = filteredEvents.filter(e => new Date(e.timestamp) <= filter.end_time!);
    }
    
    if (filter.chain_correlation?.root_delegation_id) {
      filteredEvents = filteredEvents.filter(e => 
        e.chain_correlation.root_delegation_id === filter.chain_correlation!.root_delegation_id
      );
    }
    
    if (filter.chain_correlation?.chain_depth !== undefined) {
      filteredEvents = filteredEvents.filter(e => 
        e.chain_correlation.chain_depth === filter.chain_correlation!.chain_depth
      );
    }
    
    if (filter.limit) {
      filteredEvents = filteredEvents.slice(0, filter.limit);
    }
    
    return filteredEvents;
  }
  
  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: `${this.events.length}/${this.maxEvents} events stored` };
  }
  
  async close(): Promise<void> {
    this.events = [];
  }
  
  /** Get all events for testing */
  getAllEvents(): DelegationTelemetryEvent[] {
    return [...this.events];
  }
  
  /** Clear all events */
  clear(): void {
    this.events = [];
  }
}

/**
 * Main delegation telemetry engine
 */
export class DelegationTelemetryEngine extends EventEmitter {
  private config: DelegationTelemetryConfig;
  private eventBuffer: DelegationTelemetryEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private chainRegistry = new Map<string, DelegationChainCorrelation>();
  
  constructor(config: DelegationTelemetryConfig) {
    super();
    this.config = {
      buffer_size: 100,
      flush_interval_ms: 5000,
      sampling_rate: 1.0,
      min_severity: 'info',
      max_events_in_memory: 10000,
      enable_performance_tracking: true,
      enable_chain_correlation: true,
      ...config,
    };
    
    // Start periodic buffer flush
    if (this.config.flush_interval_ms! > 0) {
      this.flushTimer = setInterval(() => {
        this.flushBuffer();
      }, this.config.flush_interval_ms);
    }
  }
  
  /**
   * Create a delegation contract telemetry event
   */
  async logContractCreated(
    contract: DelegationContract,
    delegatorAgent: string,
    delegateeAgent: string,
    chainCorrelation?: Partial<DelegationChainCorrelation>
  ): Promise<void> {
    const correlation = this.createOrUpdateChainCorrelation(
      contract.contract_id,
      chainCorrelation
    );
    
    const eventData: ContractCreatedEventData = {
      contract,
      delegator_agent: delegatorAgent,
      delegatee_agent: delegateeAgent,
      estimated_completion_ms: contract.metadata?.estimated_duration_ms,
      priority_score: contract.priority || 5,
    };
    
    await this.emitEvent({
      event_type: 'delegation_contract_created',
      contract_id: contract.contract_id,
      chain_correlation: correlation,
      event_data: eventData as unknown as Record<string, unknown>,
      severity: 'info',
    });
  }
  
  /**
   * Log delegation progress update
   */
  async logDelegationProgress(
    contractId: string,
    executionId: string,
    progressPercentage: number,
    currentPhase: 'negotiation' | 'execution' | 'verification' | 'completion',
    elapsedTimeMs: number,
    estimatedRemainingMs?: number,
    intermediateResults?: unknown
  ): Promise<void> {
    const correlation = this.chainRegistry.get(contractId);
    if (!correlation) {
      console.warn(`[DelegationTelemetry] No chain correlation found for contract ${contractId}`);
      return;
    }
    
    const eventData: ContractProgressEventData = {
      progress_percentage: progressPercentage,
      current_phase: currentPhase,
      elapsed_time_ms: elapsedTimeMs,
      estimated_remaining_ms: estimatedRemainingMs,
      intermediate_results: intermediateResults,
      checkpoints_completed: this.getCompletedCheckpoints(currentPhase, progressPercentage),
    };
    
    await this.emitEvent({
      event_type: 'delegation_progress',
      contract_id: contractId,
      execution_id: executionId,
      chain_correlation: correlation,
      event_data: eventData as unknown as Record<string, unknown>,
      severity: 'info',
    });
  }
  
  /**
   * Log delegation completion
   */
  async logDelegationCompleted(
    contractId: string,
    executionId: string,
    result: TaskExecutionResult,
    performanceMetrics: DelegationPerformanceMetrics
  ): Promise<void> {
    const correlation = this.chainRegistry.get(contractId);
    if (!correlation) {
      console.warn(`[DelegationTelemetry] No chain correlation found for contract ${contractId}`);
      return;
    }
    
    // Update chain completion status
    correlation.chain_completed_at = new Date().toISOString();
    correlation.chain_status = result.success ? 'completed' : 'failed';
    this.chainRegistry.set(contractId, correlation);
    
    const eventData: ContractCompletionEventData = {
      success: result.success,
      result: result.output,
      verification_result: result.verification ? {
        verified: result.verification.verified,
        quality_score: result.verification.quality_score || 0,
        verification_method: result.verification.verification_method,
      } : undefined,
      final_metrics: performanceMetrics,
      completion_reason: result.success ? 'success' : 
        (result.error?.type.includes('timeout') ? 'timeout' : 'failure'),
    };
    
    await this.emitEvent({
      event_type: result.success ? 'delegation_completed' : 'delegation_failed',
      contract_id: contractId,
      execution_id: executionId,
      chain_correlation: correlation,
      event_data: eventData as unknown as Record<string, unknown>,
      performance_metrics: performanceMetrics,
      severity: result.success ? 'info' : 'warning',
    });
  }
  
  /**
   * Log firebreak trigger event
   */
  async logFirebreakTriggered(
    contractId: string,
    firebreakType: string,
    triggerThreshold: number,
    actualValue: number,
    actionTaken: string,
    escalationTarget?: string
  ): Promise<void> {
    const correlation = this.chainRegistry.get(contractId);
    if (!correlation) {
      console.warn(`[DelegationTelemetry] No chain correlation found for contract ${contractId}`);
      return;
    }
    
    const eventData: FirebreakTriggeredEventData = {
      firebreak_type: firebreakType as any,
      trigger_threshold: triggerThreshold,
      actual_value: actualValue,
      action_taken: actionTaken as any,
      escalation_target: escalationTarget,
    };
    
    await this.emitEvent({
      event_type: 'delegation_firebreak_triggered',
      contract_id: contractId,
      chain_correlation: correlation,
      event_data: eventData as unknown as Record<string, unknown>,
      severity: 'warning',
    });
  }
  
  /**
   * Get telemetry events matching filter
   */
  async queryEvents(filter: TelemetryQueryFilter): Promise<DelegationTelemetryEvent[]> {
    const allResults: DelegationTelemetryEvent[] = [];
    
    // Query all sinks that support querying
    for (const sink of this.config.sinks) {
      if (sink.queryEvents) {
        try {
          const results = await sink.queryEvents(filter);
          allResults.push(...results);
        } catch (error) {
          console.error(`[DelegationTelemetry] Error querying sink ${sink.name}:`, error);
        }
      }
    }
    
    // Sort by timestamp and apply limit
    allResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (filter.limit) {
      return allResults.slice(0, filter.limit);
    }
    
    return allResults;
  }
  
  /**
   * Get chain correlation information
   */
  getChainCorrelation(contractId: string): DelegationChainCorrelation | undefined {
    return this.chainRegistry.get(contractId);
  }
  
  /**
   * Get all chain correlations
   */
  getAllChainCorrelations(): Map<string, DelegationChainCorrelation> {
    return new Map(this.chainRegistry);
  }
  
  /**
   * Flush event buffer to sinks
   */
  async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;
    
    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];
    
    // Write to all sinks in parallel
    const writePromises = this.config.sinks.map(async (sink) => {
      try {
        for (const event of eventsToFlush) {
          await sink.writeEvent(event);
        }
      } catch (error) {
        console.error(`[DelegationTelemetry] Error writing to sink ${sink.name}:`, error);
      }
    });
    
    await Promise.allSettled(writePromises);
    this.emit('events_flushed', eventsToFlush.length);
  }
  
  /**
   * Close telemetry engine and cleanup
   */
  async close(): Promise<void> {
    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Flush remaining events
    await this.flushBuffer();
    
    // Close all sinks
    const closePromises = this.config.sinks.map(sink => sink.close());
    await Promise.allSettled(closePromises);
    
    // Clear registry
    this.chainRegistry.clear();
    
    this.emit('telemetry_closed');
  }
  
  // Private methods
  
  private async emitEvent(eventData: Partial<DelegationTelemetryEvent>): Promise<void> {
    if (!this.config.enabled) return;
    
    // Apply sampling
    if (this.config.sampling_rate! < 1 && Math.random() > this.config.sampling_rate!) {
      return;
    }
    
    // Check severity filter
    const severityLevels = ['debug', 'info', 'warning', 'error', 'critical'];
    const minSeverityIndex = severityLevels.indexOf(this.config.min_severity!);
    const eventSeverityIndex = severityLevels.indexOf(eventData.severity!);
    
    if (eventSeverityIndex < minSeverityIndex) return;
    
    const event: DelegationTelemetryEvent = {
      ...eventData as DelegationTelemetryEvent,
      event_id: randomUUID(),
      timestamp: new Date().toISOString(),
      agent_id: this.config.agent_id,
    };
    
    // Add to buffer
    this.eventBuffer.push(event);
    
    // Emit event to listeners
    this.emit('telemetry_event', event);

    // Immediate flush mode for tests and low-latency integrations
    if (this.config.flush_interval_ms === 0) {
      await this.flushBuffer();
      return;
    }
    
    // Flush if buffer is full
    if (this.eventBuffer.length >= this.config.buffer_size!) {
      await this.flushBuffer();
    }
  }
  
  private createOrUpdateChainCorrelation(
    contractId: string,
    partial?: Partial<DelegationChainCorrelation>
  ): DelegationChainCorrelation {
    const existing = this.chainRegistry.get(contractId);
    
    if (existing) {
      const updated = { ...existing, ...partial };
      this.chainRegistry.set(contractId, updated);
      return updated;
    }
    
    const correlation: DelegationChainCorrelation = {
      root_delegation_id: partial?.root_delegation_id || contractId,
      parent_delegation_id: partial?.parent_delegation_id,
      chain_depth: partial?.chain_depth || 0,
      total_chain_contracts: partial?.total_chain_contracts || 1,
      chain_participants: partial?.chain_participants || [this.config.agent_id],
      chain_started_at: partial?.chain_started_at || new Date().toISOString(),
      chain_status: partial?.chain_status || 'active',
      ...partial,
    };
    
    this.chainRegistry.set(contractId, correlation);
    return correlation;
  }
  
  private checkpointThresholds: Record<string, Array<{ threshold: number; name: string }>> = {
    negotiation: [
      { threshold: 25, name: 'contract_validation' },
      { threshold: 50, name: 'capability_assessment' },
      { threshold: 75, name: 'resource_allocation' },
      { threshold: 100, name: 'contract_accepted' },
    ],
    execution: [
      { threshold: 25, name: 'task_started' },
      { threshold: 50, name: 'halfway_milestone' },
      { threshold: 75, name: 'near_completion' },
      { threshold: 100, name: 'task_completed' },
    ],
    verification: [
      { threshold: 50, name: 'output_validated' },
      { threshold: 100, name: 'verification_complete' },
    ],
    completion: [
      { threshold: 100, name: 'delegation_finalized' },
    ],
  };

  private getCompletedCheckpoints(
    phase: string,
    progressPercentage: number
  ): string[] {
    const thresholds = this.checkpointThresholds[phase] ?? [];
    return thresholds
      .filter(({ threshold }) => progressPercentage >= threshold)
      .map(({ name }) => name);
  }
}

export default DelegationTelemetryEngine;
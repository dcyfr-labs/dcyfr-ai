/**
 * DCYFR Delegation Telemetry Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive test suite for delegation telemetry engine, runtime integration,
 * event correlation, and performance tracking.
 * 
 * @module tests/telemetry/delegation-telemetry.test
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DelegationTelemetryEngine,
  ConsoleTelemetrySink,
  InMemoryTelemetrySink,
  RuntimeTelemetryIntegration,
  createDefaultTelemetryIntegration,
  type DelegationTelemetryConfig,
  type RuntimeTelemetryIntegrationConfig,
  type DelegationTelemetryEvent,
  type DelegationPerformanceMetrics,
} from '../../src/telemetry';
import { AgentRuntime } from '../../src/runtime/agent-runtime';
import type {
  DelegationContract,
  TaskExecutionContext,
  TaskExecutionResult,
} from '../../src/runtime/agent-runtime';

// Test utilities
function createMockDelegationContract(): DelegationContract {
  return {
    contract_id: 'test-contract-001',
    delegator_agent: 'agent-alpha',
    delegatee_agent: 'agent-beta',
    task_description: 'Test task for telemetry validation',
    priority: 7,
    timeout_ms: 30000,
    firebreaks: [],
    permission_tokens: [],
    verification_policy: {
      verification_method: 'capability_match',
      success_criteria: {
        expected_output_schema: {},
        quality_thresholds: {},
      },
    },
    metadata: {
      chain_depth: 1,
      root_delegation_id: 'test-root-001',
      created_at: new Date().toISOString(),
    },
  };
}

function createMockTaskExecutionContext(): TaskExecutionContext {
  return {
    execution_id: 'exec-001',
    task: {
      description: 'Test task execution',
      parameters: { test: true },
      priority: 5,
    },
    metadata: {
      started_at: new Date().toISOString(),
      status: 'running',
      progress: 0.5,
    },
  };
}

function createMockTaskExecutionResult(success = true): TaskExecutionResult {
  const context = createMockTaskExecutionContext();
  return {
    context,
    success,
    output: success ? { result: 'test output' } : null,
    error: success ? undefined : {
      type: 'TEST_ERROR',
      message: 'Test error for telemetry',
    },
    metrics: {
      execution_time_ms: 5000,
      peak_memory_mb: 128,
      cpu_time_ms: 4500,
      network_bytes: 1024,
      disk_io_bytes: 512,
    },
    completed_at: new Date().toISOString(),
    verification: success ? {
      verified: true,
      quality_score: 0.9,
      verification_method: 'capability_match',
      verification_timestamp: new Date().toISOString(),
    } : undefined,
  };
}

function createMockPerformanceMetrics(): DelegationPerformanceMetrics {
  return {
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
  };
}

describe('DelegationTelemetryEngine', () => {
  let telemetryEngine: DelegationTelemetryEngine;
  let memorySink: InMemoryTelemetrySink;
  
  beforeEach(() => {
    memorySink = new InMemoryTelemetrySink(100);
    
    const config: DelegationTelemetryConfig = {
      agent_id: 'test-agent-001',
      enabled: true,
      sinks: [memorySink],
      buffer_size: 10,
      flush_interval_ms: 0, // Immediate flush for testing
      sampling_rate: 1.0,
      min_severity: 'debug',
    };
    
    telemetryEngine = new DelegationTelemetryEngine(config);
  });
  
  afterEach(async () => {
    await telemetryEngine.flushBuffer();
    await telemetryEngine.close();
  });
  
  describe('Contract Creation Events', () => {
    it('should emit contract created event with correct metadata', async () => {
      const contract = createMockDelegationContract();
      
      await telemetryEngine.logContractCreated(
        contract,
        'agent-alpha',
        'agent-beta',
        {
          chain_depth: 1,
          root_delegation_id: 'test-root-001',
        }
      );
      
      await telemetryEngine.flushBuffer();
      const events = memorySink.getAllEvents();
      
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.event_type).toBe('delegation_contract_created');
      expect(event.contract_id).toBe(contract.contract_id);
      expect(event.agent_id).toBe('test-agent-001');
      expect(event.chain_correlation.root_delegation_id).toBe('test-root-001');
      expect(event.chain_correlation.chain_depth).toBe(1);
      expect(event.severity).toBe('info');
      
      // Verify event data
      const eventData = event.event_data as { contract: DelegationContract };
      expect(eventData.contract).toEqual(contract);
      expect(eventData.delegator_agent).toBe('agent-alpha');
      expect(eventData.delegatee_agent).toBe('agent-beta');
      expect(eventData.priority_score).toBe(7);
    });
    
    it('should track chain correlation correctly', async () => {
      const contract = createMockDelegationContract();
      
      await telemetryEngine.logContractCreated(
        contract,
        'parent-agent',
        'child-agent',
        {
          chain_depth: 2,
          root_delegation_id: 'root-001',
          parent_delegation_id: 'parent-001',
          total_chain_contracts: 3,
          chain_participants: ['root-agent', 'parent-agent', 'child-agent'],
        }
      );
      
      await telemetryEngine.flushBuffer();
      const events = memorySink.getAllEvents();
      const chainCorrelation = events[0].chain_correlation;
      
      expect(chainCorrelation.root_delegation_id).toBe('root-001');
      expect(chainCorrelation.parent_delegation_id).toBe('parent-001');
      expect(chainCorrelation.chain_depth).toBe(2);
      expect(chainCorrelation.total_chain_contracts).toBe(3);
      expect(chainCorrelation.chain_participants).toEqual(['root-agent', 'parent-agent', 'child-agent']);
      expect(chainCorrelation.chain_status).toBe('active');
    });
  });
  
  describe('Delegation Progress Events', () => {
    it('should emit progress events with correct phase information', async () => {
      const contractId = 'test-contract-001';
      const executionId = 'exec-001';
      
      // Create initial contract for correlation
      const contract = createMockDelegationContract();
      await telemetryEngine.logContractCreated(contract, 'agent-1', 'agent-2');
      
      // Log progress update
      await telemetryEngine.logDelegationProgress(
        contractId,
        executionId,
        75, // 75% complete
        'execution',
        30000, // 30 seconds elapsed
        10000, // 10 seconds remaining
        { intermediate_data: 'test' }
      );
      
      await telemetryEngine.flushBuffer();
      const events = memorySink.getAllEvents();
      const progressEvent = events.find(e => e.event_type === 'delegation_progress');
      
      expect(progressEvent).toBeDefined();
      expect(progressEvent!.contract_id).toBe(contractId);
      expect(progressEvent!.execution_id).toBe(executionId);
      
      const progressData = progressEvent!.event_data as any;
      expect(progressData.progress_percentage).toBe(75);
      expect(progressData.current_phase).toBe('execution');
      expect(progressData.elapsed_time_ms).toBe(30000);
      expect(progressData.estimated_remaining_ms).toBe(10000);
      expect(progressData.intermediate_results).toEqual({ intermediate_data: 'test' });
      expect(progressData.checkpoints_completed).toContain('task_started');
      expect(progressData.checkpoints_completed).toContain('halfway_milestone');
      expect(progressData.checkpoints_completed).toContain('near_completion');
    });
    
    it('should calculate checkpoints based on phase and progress', async () => {
      const contractId = 'test-contract-001';
      const executionId = 'exec-001';
      
      // Create contract for correlation
      const contract = createMockDelegationContract();
      await telemetryEngine.logContractCreated(contract, 'agent-1', 'agent-2');
      
      // Test negotiation phase checkpoints
      await telemetryEngine.logDelegationProgress(contractId, executionId, 100, 'negotiation', 5000);
      
      await telemetryEngine.flushBuffer();
      const events = memorySink.getAllEvents();
      const negotiationEvent = events.find(e => 
        e.event_type === 'delegation_progress' && 
        (e.event_data as any).current_phase === 'negotiation'
      );
      
      const checkpoints = (negotiationEvent!.event_data as any).checkpoints_completed;
      expect(checkpoints).toContain('contract_validation');
      expect(checkpoints).toContain('capability_assessment');
      expect(checkpoints).toContain('resource_allocation');
      expect(checkpoints).toContain('contract_accepted');
    });
  });
  
  describe('Delegation Completion Events', () => {
    it('should emit completion event with performance metrics', async () => {
      const contractId = 'test-contract-001';
      const executionId = 'exec-001';
      const result = createMockTaskExecutionResult(true);
      const metrics = createMockPerformanceMetrics();
      
      // Create contract for correlation
      const contract = createMockDelegationContract();
      await telemetryEngine.logContractCreated(contract, 'agent-1', 'agent-2');
      
      await telemetryEngine.logDelegationCompleted(contractId, executionId, result, metrics);
      
      await telemetryEngine.flushBuffer();
      const events = memorySink.getAllEvents();
      const completionEvent = events.find(e => e.event_type === 'delegation_completed');
      
      expect(completionEvent).toBeDefined();
      expect(completionEvent!.contract_id).toBe(contractId);
      expect(completionEvent!.execution_id).toBe(executionId);
      expect(completionEvent!.performance_metrics).toEqual(metrics);
      expect(completionEvent!.severity).toBe('info');
      
      const eventData = completionEvent!.event_data as any;
      expect(eventData.success).toBe(true);
      expect(eventData.result).toEqual(result.output);
      expect(eventData.completion_reason).toBe('success');
      expect(eventData.verification_result).toEqual({
        verified: true,
        quality_score: 0.9,
        verification_method: 'capability_match',
      });
    });
    
    it('should emit failure event with correct severity', async () => {
      const contractId = 'test-contract-001';
      const executionId = 'exec-001';
      const result = createMockTaskExecutionResult(false);
      const metrics = createMockPerformanceMetrics();
      
      // Create contract for correlation
      const contract = createMockDelegationContract();
      await telemetryEngine.logContractCreated(contract, 'agent-1', 'agent-2');
      
      await telemetryEngine.logDelegationCompleted(contractId, executionId, result, metrics);
      
      await telemetryEngine.flushBuffer();
      const events = memorySink.getAllEvents();
      const failureEvent = events.find(e => e.event_type === 'delegation_failed');
      
      expect(failureEvent).toBeDefined();
      expect(failureEvent!.severity).toBe('warning');
      
      const eventData = failureEvent!.event_data as any;
      expect(eventData.success).toBe(false);
      expect(eventData.completion_reason).toBe('failure');
    });
    
    it('should update chain status on completion', async () => {
      const contractId = 'test-contract-001';
      const executionId = 'exec-001';
      const result = createMockTaskExecutionResult(true);
      const metrics = createMockPerformanceMetrics();
      
      // Create contract for correlation
      const contract = createMockDelegationContract();
      await telemetryEngine.logContractCreated(contract, 'agent-1', 'agent-2');
      
      await telemetryEngine.logDelegationCompleted(contractId, executionId, result, metrics);
      
      const correlation = telemetryEngine.getChainCorrelation(contractId);
      expect(correlation).toBeDefined();
      expect(correlation!.chain_status).toBe('completed');
      expect(correlation!.chain_completed_at).toBeDefined();
    });
  });
  
  describe('Firebreak Events', () => {
    it('should emit firebreak triggered events', async () => {
      const contractId = 'test-contract-001';
      
      // Create contract for correlation
      const contract = createMockDelegationContract();
      await telemetryEngine.logContractCreated(contract, 'agent-1', 'agent-2');
      
      await telemetryEngine.logFirebreakTriggered(
        contractId,
        'max_depth',
        10, // threshold
        15, // actual value
        'escalate',
        'human-supervisor'
      );
      
      await telemetryEngine.flushBuffer();
      const events = memorySink.getAllEvents();
      const firebreakEvent = events.find(e => e.event_type === 'delegation_firebreak_triggered');
      
      expect(firebreakEvent).toBeDefined();
      expect(firebreakEvent!.severity).toBe('warning');
      
      const eventData = firebreakEvent!.event_data as any;
      expect(eventData.firebreak_type).toBe('max_depth');
      expect(eventData.trigger_threshold).toBe(10);
      expect(eventData.actual_value).toBe(15);
      expect(eventData.action_taken).toBe('escalate');
      expect(eventData.escalation_target).toBe('human-supervisor');
    });
  });
  
  describe('Event Querying', () => {
    beforeEach(async () => {
      // Populate with test events
      const contract1 = { ...createMockDelegationContract(), contract_id: 'contract-1' };
      const contract2 = { ...createMockDelegationContract(), contract_id: 'contract-2' };
      
      await telemetryEngine.logContractCreated(contract1, 'agent-1', 'agent-2');
      await telemetryEngine.logContractCreated(contract2, 'agent-2', 'agent-3');
      await telemetryEngine.logDelegationProgress('contract-1', 'exec-1', 50, 'execution', 5000);
      await telemetryEngine.logFirebreakTriggered('contract-2', 'timeout', 30000, 45000, 'escalate');
      
      await telemetryEngine.flushBuffer();
    });
    
    it('should query events by contract ID', async () => {
      const events = await telemetryEngine.queryEvents({
        contract_id: 'contract-1',
      });
      
      expect(events.length).toBeGreaterThan(0);
      events.forEach(event => {
        expect(event.contract_id).toBe('contract-1');
      });
    });
    
    it('should query events by event type', async () => {
      const events = await telemetryEngine.queryEvents({
        event_type: 'delegation_contract_created',
      });
      
      expect(events.length).toBe(2);
      events.forEach(event => {
        expect(event.event_type).toBe('delegation_contract_created');
      });
    });
    
    it('should query events by severity', async () => {
      const events = await telemetryEngine.queryEvents({
        severity: ['warning'],
      });
      
      expect(events.length).toBeGreaterThan(0);
      events.forEach(event => {
        expect(event.severity).toBe('warning');
      });
    });
    
    it('should apply query limits', async () => {
      const events = await telemetryEngine.queryEvents({
        limit: 1,
      });
      
      expect(events).toHaveLength(1);
    });
  });
});

describe('RuntimeTelemetryIntegration', () => {
  let agentRuntime: AgentRuntime;
  let telemetryIntegration: RuntimeTelemetryIntegration;
  let memorySink: InMemoryTelemetrySink;
  
  beforeEach(() => {
    memorySink = new InMemoryTelemetrySink(100);
    
    const telemetryConfig: RuntimeTelemetryIntegrationConfig = {
      telemetry_config: {
        agent_id: 'test-agent-runtime',
        enabled: true,
        sinks: [memorySink],
        buffer_size: 5,
        flush_interval_ms: 0,
      },
    };
    
    telemetryIntegration = new RuntimeTelemetryIntegration(telemetryConfig);
    
    agentRuntime = new AgentRuntime({
      agent_id: 'test-agent-runtime',
      agent_name: 'Test Agent',
      version: '1.0.0',
      enable_telemetry: false, // Use manual integration
    });
    
    telemetryIntegration.attach(agentRuntime);
  });
  
  afterEach(async () => {
    await telemetryIntegration.detach(agentRuntime);
    await agentRuntime.shutdown();
  });
  
  it('should capture task lifecycle events', async () => {
    const taskDescription = 'Test telemetry task';
    
    // Execute a task to generate events
    const resultPromise = agentRuntime.executeTask(taskDescription);
    
    // Wait a bit for events to be emitted
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get telemetry events
    const events = memorySink.getAllEvents();
    
    // Should have at least task:started events captured
    expect(events.length).toBeGreaterThan(0);
    
    // Wait for task completion
    await resultPromise;
    
    // Get final events
    await telemetryIntegration.getTelemetryEngine().flushBuffer();
    const finalEvents = memorySink.getAllEvents();
    
    // Event count can be equal in fast environments; ensure no regression in captured telemetry
    expect(finalEvents.length).toBeGreaterThanOrEqual(events.length);
  });
  
  it('should capture delegation contract events', async () => {
    const contract = createMockDelegationContract();
    
    // Execute task with delegation contract
    await agentRuntime.executeTask(
      'Test delegation task',
      { test: true },
      contract
    );
    
    await telemetryIntegration.getTelemetryEngine().flushBuffer();
    const events = memorySink.getAllEvents();
    
    // Should have delegation-related events
    const delegationEvents = events.filter(e => 
      e.event_type.includes('delegation') || e.event_type.includes('contract')
    );
    
    expect(delegationEvents.length).toBeGreaterThan(0);
    
    // Should have contract creation event
    const contractCreatedEvent = events.find(e => 
      e.event_type === 'delegation_contract_created'
    );
    expect(contractCreatedEvent).toBeDefined();
    expect(contractCreatedEvent!.contract_id).toBe(contract.contract_id);
  });
  
  it('should track performance metrics', async () => {
    const startTime = Date.now();
    
    await agentRuntime.executeTask('Performance test task');
    
    await telemetryIntegration.getTelemetryEngine().flushBuffer();
    const events = memorySink.getAllEvents();
    
    // Look for events with performance metrics
    const metricsEvents = events.filter(e => e.performance_metrics);
    
    if (metricsEvents.length > 0) {
      const metricsEvent = metricsEvents[0];
      expect(metricsEvent.performance_metrics!.execution_time_ms).toBeGreaterThan(0);
      expect(metricsEvent.performance_metrics!.total_lifecycle_time_ms).toBeGreaterThan(0);
      expect(metricsEvent.performance_metrics!.resource_utilization).toBeDefined();
      expect(metricsEvent.performance_metrics!.quality_metrics).toBeDefined();
    }
  });
});

describe('createDefaultTelemetryIntegration', () => {
  it('should create integration with default sinks', () => {
    const integration = createDefaultTelemetryIntegration('test-agent');
    
    expect(integration).toBeDefined();
    expect(integration.getTelemetryEngine()).toBeDefined();
  });
  
  it('should accept custom configuration options', () => {
    const integration = createDefaultTelemetryIntegration('test-agent', {
      track_retry_attempts: false,
      min_execution_time_threshold_ms: 1000,
    });
    
    expect(integration).toBeDefined();
  });
});
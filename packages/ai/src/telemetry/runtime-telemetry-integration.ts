/**
 * DCYFR Agent Runtime Telemetry Integration
 * TLP:AMBER - Internal Use Only
 * 
 * Integration layer that connects the AgentRuntime's EventEmitter system
 * with the DelegationTelemetryEngine for comprehensive delegation monitoring.
 * 
 * @module telemetry/runtime-telemetry-integration
 * @version 1.0.0
 * @date 2026-02-13
 */

import type { AgentRuntime } from '../runtime/agent-runtime';
import { DelegationTelemetryEngine } from './delegation-telemetry';
import type { DelegationTelemetryConfig, DelegationPerformanceMetrics } from './delegation-telemetry';
import type { DelegationContract } from '../types/delegation-contracts';
import type { TaskExecutionContext, TaskExecutionResult } from '../runtime/agent-runtime';

/**
 * Runtime telemetry integration configuration
 */
export interface RuntimeTelemetryIntegrationConfig {
  /** Telemetry engine configuration */
  telemetry_config: DelegationTelemetryConfig;
  
  /** Track task execution metrics */
  track_task_metrics?: boolean;
  
  /** Track delegation contract lifecycle */
  track_delegation_lifecycle?: boolean;
  
  /** Track resource utilization */
  track_resource_utilization?: boolean;
  
  /** Track retry attempts */
  track_retry_attempts?: boolean;
  
  /** Minimum execution time to track (ms) */
  min_execution_time_threshold_ms?: number;
}

/**
 * Task execution tracker for performance metrics
 */
class TaskExecutionTracker {
  private tasks = new Map<string, {
    start_time: number;
    contract_id?: string;
    context: TaskExecutionContext;
    checkpoints: Array<{
      name: string;
      timestamp: number;
      progress: number;
    }>;
  }>();
  
  startTask(executionId: string, context: TaskExecutionContext, contractId?: string): void {
    this.tasks.set(executionId, {
      start_time: Date.now(),
      contract_id: contractId,
      context,
      checkpoints: [],
    });
  }
  
  addCheckpoint(executionId: string, name: string, progress: number): void {
    const task = this.tasks.get(executionId);
    if (task) {
      task.checkpoints.push({
        name,
        timestamp: Date.now(),
        progress,
      });
    }
  }
  
  completeTask(executionId: string, result: TaskExecutionResult): DelegationPerformanceMetrics | null {
    const task = this.tasks.get(executionId);
    if (!task) return null;
    
    const endTime = Date.now();
    const totalTime = endTime - task.start_time;
    
    // Calculate phase times from checkpoints
    let negotiationTime = 0;
    let executionTime = result.metrics.execution_time_ms || totalTime;
    let verificationTime = 0;
    
    if (task.checkpoints.length > 0) {
      const executionStart = task.checkpoints.find(cp => cp.name === 'task_started')?.timestamp || task.start_time;
      const executionEnd = task.checkpoints.find(cp => cp.name === 'task_completed')?.timestamp || endTime;
      const verificationStart = task.checkpoints.find(cp => cp.name === 'verification_started')?.timestamp;
      const verificationEnd = task.checkpoints.find(cp => cp.name === 'verification_complete')?.timestamp;
      
      negotiationTime = executionStart - task.start_time;
      executionTime = executionEnd - executionStart;
      if (verificationStart && verificationEnd) {
        verificationTime = verificationEnd - verificationStart;
      }
    }
    
    const metrics: DelegationPerformanceMetrics = {
      contract_negotiation_time_ms: negotiationTime,
      execution_time_ms: executionTime,
      verification_time_ms: verificationTime,
      total_lifecycle_time_ms: totalTime,
      resource_utilization: {
        peak_memory_mb: result.metrics.peak_memory_mb || this.estimateMemoryUsage(),
        cpu_time_ms: result.metrics.cpu_time_ms || executionTime,
        network_calls: this.countNetworkCalls(task.context),
        disk_io_bytes: result.metrics.disk_io_bytes || 0,
      },
      quality_metrics: {
        success_rate: result.success ? 1.0 : 0.0,
        verification_score: result.verification?.quality_score,
        confidence_level: 0.5, // Default since confidence_score is not available
        retry_count: 0, // Would need to track retries separately
      },
    };
    
    this.tasks.delete(executionId);
    return metrics;
  }
  
  private estimateMemoryUsage(): number {
    // Rough estimate - would be better with process.memoryUsage()
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }
  
  private countNetworkCalls(context: TaskExecutionContext): number {
    // Count tools that might make network calls
    const networkTools = ['web_search', 'api_call', 'fetch', 'http_request'];
    const toolCalls = ((context.task.parameters?.tool_calls as Array<{ name?: string }> | undefined) ?? []);
    return toolCalls.filter(tool => 
      networkTools.some(netTool => (tool.name || '').includes(netTool))
    ).length;
  }
}

/**
 * Contract lifecycle tracker
 */
class ContractLifecycleTracker {
  private contracts = new Map<string, {
    contract: DelegationContract;
    created_at: number;
    delegator_agent: string;
    delegatee_agent: string;
    status: 'created' | 'accepted' | 'rejected' | 'executing' | 'completed' | 'failed';
    execution_id?: string;
  }>();
  
  trackContractCreated(
    contract: DelegationContract,
    delegatorAgent: string,
    delegateeAgent: string
  ): void {
    this.contracts.set(contract.contract_id, {
      contract,
      created_at: Date.now(),
      delegator_agent: delegatorAgent,
      delegatee_agent: delegateeAgent,
      status: 'created',
    });
  }
  
  trackContractAccepted(contractId: string, executionId: string): void {
    const contract = this.contracts.get(contractId);
    if (contract) {
      contract.status = 'accepted';
      contract.execution_id = executionId;
      this.contracts.set(contractId, contract);
    }
  }
  
  trackContractRejected(contractId: string): void {
    const contract = this.contracts.get(contractId);
    if (contract) {
      contract.status = 'rejected';
      this.contracts.set(contractId, contract);
    }
  }
  
  trackContractExecuting(contractId: string): void {
    const contract = this.contracts.get(contractId);
    if (contract) {
      contract.status = 'executing';
      this.contracts.set(contractId, contract);
    }
  }
  
  trackContractCompleted(contractId: string, success: boolean): void {
    const contract = this.contracts.get(contractId);
    if (contract) {
      contract.status = success ? 'completed' : 'failed';
      this.contracts.set(contractId, contract);
    }
  }
  
  getContract(contractId: string) {
    return this.contracts.get(contractId);
  }
  
  getAllContracts(): Map<string, any> {
    return new Map(this.contracts);
  }
}

/**
 * Runtime telemetry integration class
 */
export class RuntimeTelemetryIntegration {
  private telemetryEngine: DelegationTelemetryEngine;
  private config: RuntimeTelemetryIntegrationConfig;
  private taskTracker = new TaskExecutionTracker();
  private contractTracker = new ContractLifecycleTracker();
  private isAttached = false;
  
  constructor(config: RuntimeTelemetryIntegrationConfig) {
    this.config = {
      track_task_metrics: true,
      track_delegation_lifecycle: true,
      track_resource_utilization: true,
      track_retry_attempts: true,
      min_execution_time_threshold_ms: 100,
      ...config,
    };
    
    this.telemetryEngine = new DelegationTelemetryEngine(this.config.telemetry_config);
  }
  
  /**
   * Attach telemetry to an AgentRuntime instance
   */
  attach(runtime: AgentRuntime): void {
    if (this.isAttached) {
      console.warn('[RuntimeTelemetryIntegration] Already attached to a runtime');
      return;
    }
    
    this.isAttached = true;
    
    // Listen to all runtime events and emit telemetry
    this.setupEventListeners(runtime);
    
    console.log(`[RuntimeTelemetryIntegration] Attached to agent runtime: ${runtime.getAgentInfo().agent_id}`);
  }
  
  /**
   * Detach telemetry from runtime
   */
  async detach(runtime: AgentRuntime): Promise<void> {
    if (!this.isAttached) return;
    
    // Remove all event listeners
    runtime.removeAllListeners();
    
    // Close telemetry engine
    await this.telemetryEngine.close();
    
    this.isAttached = false;
    console.log('[RuntimeTelemetryIntegration] Detached from agent runtime');
  }
  
  /**
   * Get telemetry engine for direct access
   */
  getTelemetryEngine(): DelegationTelemetryEngine {
    return this.telemetryEngine;
  }
  
  /**
   * Query telemetry events
   */
  async queryEvents(filter: any): Promise<any[]> {
    return this.telemetryEngine.queryEvents(filter);
  }
  
  // Private methods
  
  private setupEventListeners(runtime: AgentRuntime): void {
    // Task lifecycle events
    if (this.config.track_task_metrics) {
      runtime.on('task:started', (context: TaskExecutionContext) => {
        const contractId = this.findContractIdForContext(context);
        this.taskTracker.startTask(context.execution_id, context, contractId);
      });
      
      runtime.on('task:progress', (context: TaskExecutionContext, progress: number) => {
        this.taskTracker.addCheckpoint(
          context.execution_id,
          `progress_${Math.round(progress * 100)}`,
          progress
        );
        
        // Emit progress telemetry
        if (this.config.track_delegation_lifecycle) {
          const contractId = this.findContractIdForContext(context);
          if (contractId) {
            const elapsedTime = Date.now() - new Date(context.metadata.started_at).getTime();
            this.telemetryEngine.logDelegationProgress(
              contractId,
              context.execution_id,
              progress * 100,
              'execution',
              elapsedTime,
              undefined
            );
          }
        }
      });
      
      runtime.on('task:completed', async (context: TaskExecutionContext, result: TaskExecutionResult) => {
        const metrics = this.taskTracker.completeTask(context.execution_id, result);
        
        if (metrics && this.config.track_delegation_lifecycle) {
          const contractId = this.findContractIdForContext(context);
          if (contractId) {
            this.contractTracker.trackContractCompleted(contractId, result.success);
            await this.telemetryEngine.logDelegationCompleted(
              contractId,
              context.execution_id,
              result,
              metrics
            );
          }
        }
      });
      
      runtime.on('task:failed', async (context: TaskExecutionContext, error: any) => {
        const result: TaskExecutionResult = {
          context: context,
          success: false,
          output: null,
          error: error,
          metrics: {
            execution_time_ms: Date.now() - new Date(context.metadata.started_at).getTime(),
            peak_memory_mb: 64,
            cpu_time_ms: 1000,
          },
          completed_at: new Date().toISOString(),
        };
        
        const metrics = this.taskTracker.completeTask(context.execution_id, result);
        
        if (metrics && this.config.track_delegation_lifecycle) {
          const contractId = this.findContractIdForContext(context);
          if (contractId) {
            this.contractTracker.trackContractCompleted(contractId, false);
            await this.telemetryEngine.logDelegationCompleted(
              contractId,
              context.execution_id,
              result,
              metrics
            );
          }
        }
      });
    }
    
    // Delegation contract events
    if (this.config.track_delegation_lifecycle) {
      runtime.on('delegation:contract:received', async (contract: DelegationContract) => {
        // Note: We need to infer delegator/delegatee from context
        const delegatorAgent = (contract.metadata?.delegator_agent as string) || 'unknown';
        const delegateeAgent = runtime.getAgentInfo().agent_id;
        
        this.contractTracker.trackContractCreated(contract, delegatorAgent, delegateeAgent);
        
        await this.telemetryEngine.logContractCreated(
          contract,
          delegatorAgent,
          delegateeAgent,
          {
            chain_depth: (contract.metadata?.chain_depth as number) || 0,
            root_delegation_id: (contract.metadata?.root_delegation_id as string) || contract.contract_id,
            parent_delegation_id: contract.metadata?.parent_delegation_id as string | undefined,
          }
        );
      });
      
      runtime.on('delegation:contract:accepted', (contract: DelegationContract, executionId: string) => {
        this.contractTracker.trackContractAccepted(contract.contract_id, executionId);
        this.taskTracker.addCheckpoint(executionId, 'contract_accepted', 0);
      });
      
      runtime.on('delegation:contract:rejected', (contract: DelegationContract, reason: string) => {
        this.contractTracker.trackContractRejected(contract.contract_id);
      });
    }
    
    // Retry events
    if (this.config.track_retry_attempts) {
      runtime.on('task:retry:attempt', (context: TaskExecutionContext, attempt: number) => {
        this.taskTracker.addCheckpoint(
          context.execution_id,
          `retry_attempt_${attempt}`,
          0 // Retry doesn't change progress
        );
      });
      
      runtime.on('task:retry:exhausted', (context: TaskExecutionContext) => {
        this.taskTracker.addCheckpoint(
          context.execution_id,
          'retry_exhausted',
          0
        );
      });
    }
    
    // Resource limit events
    runtime.on('resource:limit:exceeded', async (context: TaskExecutionContext, resourceType: string, limit: number, actual: number) => {
      const contractId = this.findContractIdForContext(context);
      if (contractId) {
        await this.telemetryEngine.logFirebreakTriggered(
          contractId,
          'resource_limit',
          limit,
          actual,
          'escalate'
        );
      }
    });
    
    // Capability assessment events
    runtime.on('capability:assessed', (context: TaskExecutionContext, assessment: any) => {
      this.taskTracker.addCheckpoint(
        context.execution_id,
        'capability_assessed',
        0.1 // Early in negotiation phase
      );
    });
    
    runtime.on('confidence:updated', (context: TaskExecutionContext, confidence: number) => {
      this.taskTracker.addCheckpoint(
        context.execution_id,
        `confidence_${confidence}`,
        0.2 // During assessment phase
      );
    });
  }
  
  private findContractIdForContext(context: TaskExecutionContext): string | undefined {
    // Try direct delegated contract reference
    if (context.delegation_contract?.contract_id) {
      return context.delegation_contract.contract_id;
    }
    
    // Try to find contract ID from task description or parameters
    if (context.task.description) {
      const match = context.task.description.match(/contract[_-]id[:\s]+([a-zA-Z0-9-]+)/i);
      if (match) return match[1];
    }
    
    // Look in all tracked contracts for matching execution context
    for (const [contractId, contract] of Array.from(this.contractTracker.getAllContracts().entries())) {
      if (contract.execution_id === context.execution_id) {
        return contractId;
      }
    }
    
    return undefined;
  }
}

/**
 * Create a default telemetry integration with console and memory sinks
 */
export function createDefaultTelemetryIntegration(
  agentId: string,
  options?: Partial<RuntimeTelemetryIntegrationConfig>
): RuntimeTelemetryIntegration {
  const { ConsoleTelemetrySink, InMemoryTelemetrySink } = require('./delegation-telemetry');
  
  const config: RuntimeTelemetryIntegrationConfig = {
    telemetry_config: {
      agent_id: agentId,
      enabled: true,
      sinks: [
        new ConsoleTelemetrySink(),
        new InMemoryTelemetrySink(1000),
      ],
      buffer_size: 50,
      flush_interval_ms: 3000,
      sampling_rate: 1.0,
      min_severity: 'info',
      enable_performance_tracking: true,
      enable_chain_correlation: true,
    },
    ...options,
  };
  
  return new RuntimeTelemetryIntegration(config);
}

export default RuntimeTelemetryIntegration;
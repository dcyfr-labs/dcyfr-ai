/**
 * DCYFR Agent Runtime with Delegation Support
 * TLP:AMBER - Internal Use Only
 * 
 * Agent runtime engine supporting delegation contract execution, capability
 * self-assessment, and confidence tracking. Integrates with DCYFR delegation
 * framework for intelligent task assignment and verification.
 * 
 * @module runtime/agent-runtime
 * @version 1.0.0
 * @date 2026-02-13
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  DelegationContract,
  DelegationContractStatus,
  VerificationPolicy,
  SuccessCriteria,
  VerificationResult,
  DelegationAgent,
  PermissionToken,
  Firebreak,
  RetryPolicy,
  ReputationRequirements,
  ContractAcceptanceDecision,
} from '../types/delegation-contracts';
import type {
  AgentCapability,
  AgentCapabilityManifest,
  ResourceRequirements,
} from '../types/agent-capabilities';
import {
  RuntimeTelemetryIntegration,
  createDefaultTelemetryIntegration,
  type RuntimeTelemetryIntegrationConfig,
  type DelegationTelemetryConfig,
} from '../telemetry';
import {
  VerificationIntegration,
  type ParsedVerificationResult,
  type MultiModalVerificationReport,
} from '../verification/parser-integration';
import type {
  VerificationOutputFormat,
  FormattedVerificationOutput,
} from '../verification/output-formatter';

/**
 * Task execution context with delegation information
 */
export interface TaskExecutionContext {
  /** Unique task execution ID */
  execution_id: string;
  
  /** Task being executed */
  task: {
    /** Task description */
    description: string;
    
    /** Task parameters */
    parameters?: Record<string, unknown>;
    
    /** Expected output format */
    output_schema?: Record<string, unknown>;
    
    /** Task priority (1-10, 10 = highest) */
    priority?: number;
  };
  
  /** Associated delegation contract (if delegated task) */
  delegation_contract?: DelegationContract;
  
  /** Parent execution ID (for sub-tasks) */
  parent_execution_id?: string;
  
  /** Execution metadata */
  metadata: {
    /** Execution start timestamp */
    started_at: string;
    
    /** Estimated completion time */
    estimated_completion_ms?: number;
    
    /** Current execution status */
    status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
    
    /** Resource usage tracking */
    resource_usage?: {
      memory_mb?: number;
      cpu_percent?: number;
      network_bytes?: number;
      disk_bytes?: number;
    };
    
    /** Progress tracking (0-1 scale) */
    progress?: number;
  };
}

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  /** Execution context */
  context: TaskExecutionContext;
  
  /** Whether task completed successfully */
  success: boolean;
  
  /** Task output */
  output?: unknown;
  
  /** Error information (if failed) */
  error?: {
    /** Error type */
    type: string;
    
    /** Error message */
    message: string;
    
    /** Error details */
    details?: Record<string, unknown>;
    
    /** Stack trace (if available) */
    stack?: string;
  };
  
  /** Execution metrics */
  metrics: {
    /** Total execution time in milliseconds */
    execution_time_ms: number;
    
    /** Peak memory usage in MB */
    peak_memory_mb?: number;
    
    /** Total CPU time in milliseconds */
    cpu_time_ms?: number;
    
    /** Network bytes transferred */
    network_bytes?: number;
    
    /** Disk I/O bytes */
    disk_io_bytes?: number;
  };
  
  /** Task verification result (if verification required) */
  verification?: VerificationResult;
  
  /** Formatted verification outputs (if verification formatting enabled) */
  verification_outputs?: FormattedVerificationOutput[];
  
  /** Multi-modal verification report (if verification formatting enabled) */
  verification_report?: MultiModalVerificationReport;
  
  /** Completion timestamp */
  completed_at: string;
}

/**
 * Capability self-assessment result
 */
export interface CapabilitySelfAssessment {
  /** Capability being assessed */
  capability_id: string;
  
  /** Current confidence level (0-1 scale) */
  confidence_level: number;
  
  /** Assessment timestamp */
  assessed_at: string;
  
  /** Factors affecting confidence */
  confidence_factors: {
    /** Recent success rate */
    recent_success_rate?: number;
    
    /** Task complexity handled */
    max_complexity_handled?: number;
    
    /** Resource efficiency */
    resource_efficiency?: number;
    
    /** User feedback score */
    user_feedback_score?: number;
    
    /** Peer comparison */
    peer_comparison_percentile?: number;
  };
  
  /** Assessment reasoning */
  reasoning?: string;
  
  /** Recommended capability updates */
  recommendations?: {
    /** Suggested confidence adjustment */
    confidence_adjustment?: number;
    
    /** Areas for improvement */
    improvement_areas?: string[];
    
    /** Training recommendations */
    training_recommendations?: string[];
  };
}

/**
 * Agent runtime configuration
 */
export interface AgentRuntimeConfig {
  /** Agent identification */
  agent_id: string;
  
  /** Agent display name */
  agent_name: string;
  
  /** Agent version */
  version: string;
  
  /** Maximum concurrent tasks */
  max_concurrent_tasks?: number;
  
  /** Default task timeout in milliseconds */
  default_timeout_ms?: number;
  
  /** Resource limits */
  resource_limits?: {
    memory_mb?: number;
    cpu_percent?: number;
    disk_mb?: number;
    network_mbps?: number;
  };
  
  /** Capability manifest */
  capabilities?: AgentCapabilityManifest;
  
  /** Enable telemetry */
  enable_telemetry?: boolean;
  
  /** Telemetry configuration (auto-configured if not provided) */
  telemetry_config?: Partial<RuntimeTelemetryIntegrationConfig>;
  
  /** Enable verification output formatting */
  enable_verification_formatting?: boolean;
  
  /** Verification output formats to generate automatically */
  verification_auto_formats?: VerificationOutputFormat[];
  
  /** Maximum verification output size in bytes */
  max_verification_output_bytes?: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Agent runtime events
 */
export interface AgentRuntimeEvents {
  'task:started': (context: TaskExecutionContext) => void;
  'task:progress': (context: TaskExecutionContext, progress: number) => void;
  'task:completed': (result: TaskExecutionResult) => void;
  'task:failed': (result: TaskExecutionResult) => void;
  'delegation:contract:received': (contract: DelegationContract) => void;
  'delegation:contract:accepted': (contract: DelegationContract) => void;
  'delegation:contract:rejected': (contract: DelegationContract, reason: string) => void;
  'capability:assessed': (assessment: CapabilitySelfAssessment) => void;
  'confidence:updated': (capability_id: string, old_confidence: number, new_confidence: number) => void;
  'resource:limit:exceeded': (resource: string, usage: number, limit: number) => void;
}

/**
 * DCYFR Agent Runtime
 * 
 * Core runtime for AI agents with delegation support, capability tracking,
 * and intelligent task execution.
 */
export class AgentRuntime extends EventEmitter {
  private config: AgentRuntimeConfig;
  private currentTasks: Map<string, TaskExecutionContext> = new Map();
  private taskHistory: TaskExecutionResult[] = [];
  private capabilityAssessments: Map<string, CapabilitySelfAssessment[]> = new Map();
  private confidenceHistory: Map<string, Array<{ confidence: number, timestamp: string }>> = new Map();
  private telemetryIntegration?: RuntimeTelemetryIntegration;
  private verificationIntegration?: VerificationIntegration;
  
  constructor(config: AgentRuntimeConfig) {
    super();
    this.config = {
      max_concurrent_tasks: 5,
      default_timeout_ms: 300000, // 5 minutes default
      enable_telemetry: true,
      enable_verification_formatting: true,
      verification_auto_formats: ['json', 'markdown'],
      max_verification_output_bytes: 1024 * 1024, // 1MB default
      debug: false,
      ...config,
    };
    
    // Initialize capability tracking
    this.initializeCapabilityTracking();
    
    // Initialize telemetry integration if enabled
    this.initializeTelemetry();
    
    // Initialize verification integration if enabled
    this.initializeVerificationIntegration();
    
    if (this.config.debug) {
      console.log(`[AgentRuntime] Initialized agent: ${this.config.agent_id}`);
    }
  }
  
  /**
   * Get agent information
   */
  getAgentInfo(): DelegationAgent {
    return {
      agent_id: this.config.agent_id,
      agent_name: this.config.agent_name,
      version: this.config.version,
      capabilities: this.config.capabilities?.capabilities || [],
      reputation_score: this.calculateCurrentReputation(),
      current_workload: this.currentTasks.size,
      max_concurrent_tasks: this.config.max_concurrent_tasks || 5,
    };
  }
  
  /**
   * Execute a task with optional delegation context
   */
  async executeTask(
    taskDescription: string,
    taskParameters?: Record<string, unknown>,
    delegationContract?: DelegationContract
  ): Promise<TaskExecutionResult> {
    // Check concurrent task limit
    if (this.currentTasks.size >= (this.config.max_concurrent_tasks || 5)) {
      throw new Error('Maximum concurrent task limit reached');
    }
    
    // Create execution context
    const context: TaskExecutionContext = {
      execution_id: randomUUID(),
      task: {
        description: taskDescription,
        parameters: taskParameters,
        priority: delegationContract?.priority || 5,
      },
      delegation_contract: delegationContract,
      metadata: {
        started_at: new Date().toISOString(),
        status: 'pending',
        progress: 0,
      },
    };
    
    // Add timeout from delegation contract or default
    const timeout = delegationContract?.timeout_ms || this.config.default_timeout_ms || 300000;
    context.metadata.estimated_completion_ms = timeout;
    
    this.currentTasks.set(context.execution_id, context);
    this.emit('task:started', context);
    
    if (delegationContract) {
      this.emit('delegation:contract:received', delegationContract);
    }
    
    try {
      // Validate delegation contract constraints
      if (delegationContract) {
        await this.validateDelegationContract(delegationContract);
        this.emit('delegation:contract:accepted', delegationContract);
      }
      
      // Execute the task with retry support
      const result = await this.performTaskExecutionWithRetry(context, timeout, delegationContract?.retry_policy);
      
      // Verify result if required
      if (delegationContract?.verification_policy) {
        result.verification = await this.performVerification(result, delegationContract);
      }
      
      // Update task history and capabilities
      this.taskHistory.push(result);
      this.updateCapabilitiesFromExecution(result);
      
      this.currentTasks.delete(context.execution_id);
      this.emit('task:completed', result);
      
      if (this.config.debug) {
        console.log(`[AgentRuntime] Task completed: ${context.execution_id}`);
      }
      
      return result;
      
    } catch (error) {
      const result: TaskExecutionResult = {
        context: { ...context, metadata: { ...context.metadata, status: 'failed' } },
        success: false,
        error: {
          type: error.constructor.name,
          message: error.message,
          stack: error.stack,
        },
        metrics: {
          execution_time_ms: Date.now() - new Date(context.metadata.started_at).getTime(),
        },
        completed_at: new Date().toISOString(),
      };
      
      this.taskHistory.push(result);
      this.currentTasks.delete(context.execution_id);
      this.emit('task:failed', result);
      
      if (this.config.debug) {
        console.error(`[AgentRuntime] Task failed: ${context.execution_id}`, error);
      }
      
      throw error;
    }
  }
  
  /**
   * Perform capability self-assessment
   */
  async performCapabilitySelfAssessment(capabilityId?: string): Promise<CapabilitySelfAssessment[]> {
    const capabilities = this.config.capabilities?.capabilities || [];
    const assessments: CapabilitySelfAssessment[] = [];
    
    const capabilitiesToAssess = capabilityId 
      ? capabilities.filter(c => c.capability_id === capabilityId)
      : capabilities;
    
    for (const capability of capabilitiesToAssess) {
      const assessment = await this.assessCapability(capability);
      assessments.push(assessment);
      
      // Store assessment
      const history = this.capabilityAssessments.get(capability.capability_id) || [];
      history.push(assessment);
      this.capabilityAssessments.set(capability.capability_id, history);
      
      // Update confidence if significantly different
      const confidenceDiff = Math.abs(assessment.confidence_level - capability.confidence_level);
      if (confidenceDiff > 0.1) { // 10% threshold
        const oldConfidence = capability.confidence_level;
        capability.confidence_level = assessment.confidence_level;
        
        this.updateConfidenceHistory(capability.capability_id, assessment.confidence_level);
        this.emit('confidence:updated', capability.capability_id, oldConfidence, assessment.confidence_level);
      }
      
      this.emit('capability:assessed', assessment);
    }
    
    return assessments;
  }
  
  /**
   * Get current task status
   */
  getCurrentTasks(): TaskExecutionContext[] {
    return Array.from(this.currentTasks.values());
  }
  
  /**
   * Get task execution history
   */
  getTaskHistory(limit?: number): TaskExecutionResult[] {
    return limit ? this.taskHistory.slice(-limit) : [...this.taskHistory];
  }
  
  /**
   * Get capability confidence history
   */
  getConfidenceHistory(capabilityId: string): Array<{ confidence: number, timestamp: string }> {
    return this.confidenceHistory.get(capabilityId) || [];
  }
  
  /**
   * Get current capability manifest
   */
  getCapabilityManifest(): AgentCapabilityManifest | undefined {
    return this.config.capabilities;
  }
  
  /**
   * Update capability manifest
   */
  updateCapabilityManifest(manifest: AgentCapabilityManifest): void {
    this.config.capabilities = manifest;
    
    if (this.config.debug) {
      console.log(`[AgentRuntime] Updated capability manifest for ${this.config.agent_id}`);
    }
  }
  
  /**
   * Generate verification outputs for a task execution result
   * 
   * @param result Task execution result to generate verification outputs for
   * @param contract Delegation contract with verification requirements
   * @param formats Optional additional output formats to generate
   * @returns Parsed verification result with multi-modal outputs
   */
  async generateVerificationOutputs(
    result: TaskExecutionResult,
    contract: DelegationContract,
    formats?: VerificationOutputFormat[]
  ): Promise<ParsedVerificationResult | null> {
    if (!this.verificationIntegration) {
      if (this.config.debug) {
        console.warn('[AgentRuntime] Verification integration not initialized');
      }
      return null;
    }
    
    try {
      const verificationResult = await this.verificationIntegration.processTaskResult(
        result,
        contract,
        { formats, validate_strict: true }
      );
      
      return verificationResult.parsedResult;
    } catch (error) {
      console.error('[AgentRuntime] Failed to generate verification outputs:', error);
      return null;
    }
  }
  
  /**
   * Generate multi-modal verification report for a task execution result
   * 
   * @param result Task execution result to generate report for
   * @param contract Delegation contract with verification requirements
   * @param formats Optional output formats to include
   * @returns Multi-modal verification report
   */
  async generateVerificationReport(
    result: TaskExecutionResult,
    contract: DelegationContract,
    formats?: VerificationOutputFormat[]
  ): Promise<MultiModalVerificationReport | null> {
    if (!this.verificationIntegration) {
      if (this.config.debug) {
        console.warn('[AgentRuntime] Verification integration not initialized');
      }
      return null;
    }
    
    try {
      const verificationResult = await this.verificationIntegration.processTaskResult(
        result,
        contract,
        { formats, validate_strict: true }
      );
      
      return verificationResult.multiModalReport;
    } catch (error) {
      console.error('[AgentRuntime] Failed to generate verification report:', error);
      return null;
    }
  }
  
  /**
   * Get supported verification output formats
   * 
   * @returns Array of supported verification output formats
   */
  getSupportedVerificationFormats(): VerificationOutputFormat[] {
    return this.verificationIntegration?.getAvailableFormats() || [];
  }
  
  /**
   * Check if verification output formatting is enabled
   * 
   * @returns True if verification integration is initialized and enabled
   */
  isVerificationFormattingEnabled(): boolean {
    return !!this.verificationIntegration && !!this.config.enable_verification_formatting;
  }
  
  /**
   * Check if agent can accept delegation contract with comprehensive validation
   */
  async canAcceptDelegationContract(contract: DelegationContract): Promise<ContractAcceptanceDecision> {
    const assessment = {
      capability_match: 0,
      resource_availability: 0,
      workload_capacity: 0,
      reputation_compliance: false,
      firebreak_compliance: false,
    };
    
    // Check concurrent task limit
    if (this.currentTasks.size >= (this.config.max_concurrent_tasks || 5)) {
      return { 
        can_accept: false, 
        reason: 'Maximum concurrent tasks reached',
        confidence: 0,
        assessment 
      };
    }
    
    assessment.workload_capacity = 1 - (this.currentTasks.size / (this.config.max_concurrent_tasks || 5));
    
    // Check reputation requirements
    if (contract.reputation_requirements) {
      const reputationCheck = this.checkReputationRequirements(contract.reputation_requirements);
      if (!reputationCheck.meets_requirements) {
        return { 
          can_accept: false, 
          reason: `Reputation requirements not met: ${reputationCheck.reason}`,
          confidence: 0,
          assessment: { ...assessment, reputation_compliance: false }
        };
      }
      assessment.reputation_compliance = true;
    } else {
      assessment.reputation_compliance = true;
    }
    
    // Check permission tokens (if required)
    if (contract.permission_token) {
      const permissionCheck = this.validatePermissionToken(contract.permission_token);
      if (!permissionCheck.valid) {
        return { 
          can_accept: false, 
          reason: `Permission validation failed: ${permissionCheck.reason}`,
          confidence: 0,
          assessment 
        };
      }
    }
    
    // Check firebreak constraints
    if (contract.firebreaks && contract.firebreaks.length > 0) {
      const firebreakCheck = this.validateFirebreaks(contract.firebreaks, contract);
      if (!firebreakCheck.compliant) {
        return { 
          can_accept: false, 
          reason: `Firebreak violation: ${firebreakCheck.reason}`,
          confidence: 0,
          assessment: { ...assessment, firebreak_compliance: false }
        };
      }
      assessment.firebreak_compliance = true;
    } else {
      assessment.firebreak_compliance = true;
    }
    
    // Check resource requirements
    if (contract.resource_requirements) {
      const resourceCheck = this.checkResourceRequirements(contract.resource_requirements);
      if (!resourceCheck.canMeet) {
        return { 
          can_accept: false, 
          reason: `Insufficient resources: ${resourceCheck.reason}`,
          confidence: 0,
          assessment 
        };
      }
      assessment.resource_availability = resourceCheck.availability_score || 1;
    } else {
      assessment.resource_availability = 1;
    }
    
    // Check capability requirements
    if (contract.required_capabilities && contract.required_capabilities.length > 0) {
      const capabilityCheck = this.checkCapabilityRequirements(contract.required_capabilities);
      if (!capabilityCheck.canMeet) {
        return { 
          can_accept: false, 
          reason: `Capability mismatch: ${capabilityCheck.reason}`,
          confidence: 0,
          assessment 
        };
      }
      assessment.capability_match = capabilityCheck.match_score || 1;
    } else {
      assessment.capability_match = 0.8; // Default for tasks without specific requirements
    }
    
    // Check timeout feasibility
    const estimatedTime = this.estimateTaskTime(contract.task_description || contract.metadata?.task_categories?.join(' ') || '');
    if (contract.timeout_ms && estimatedTime > contract.timeout_ms) {
      return { 
        can_accept: false, 
        reason: `Task may exceed timeout (estimated: ${estimatedTime}ms, limit: ${contract.timeout_ms}ms)`,
        confidence: 0,
        assessment 
      };
    }
    
    // Calculate overall confidence
    const confidence = this.calculateAcceptanceConfidence(assessment, contract);
    
    return { 
      can_accept: true, 
      confidence,
      estimated_completion_ms: estimatedTime,
      assessment
    };
  }
  
  /**
   * Shutdown the runtime gracefully
   */
  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log(`[AgentRuntime] Shutting down agent: ${this.config.agent_id}`);
    }
    
    // Wait for current tasks to complete or timeout
    const shutdownPromises = Array.from(this.currentTasks.values()).map(async (context) => {
      // Mark task as timeout
      context.metadata.status = 'timeout';
    });
    
    await Promise.allSettled(shutdownPromises);
    
    // Clear task tracking
    this.currentTasks.clear();
    
    this.emit('shutdown');
  }
  
  // Private methods
  
  private initializeCapabilityTracking(): void {
    if (this.config.capabilities?.capabilities) {
      for (const capability of this.config.capabilities.capabilities) {
        this.updateConfidenceHistory(capability.capability_id, capability.confidence_level);
      }
    }
  }
  
  private async validateDelegationContract(contract: DelegationContract): Promise<void> {
    // Validate contract format
    if (!contract.task_id || !contract.delegator_agent_id || !contract.delegatee_agent_id) {
      throw new Error('Invalid delegation contract: missing required fields');
    }
    
    // Check if we're the correct delegatee
    if (contract.delegatee_agent_id !== this.config.agent_id) {
      throw new Error(`Contract delegated to ${contract.delegatee_agent_id} but runtime is ${this.config.agent_id}`);
    }
    
    // Validate verification policy
    const validPolicies: VerificationPolicy[] = ['direct_inspection', 'third_party_audit', 'cryptographic_proof', 'human_required'];
    if (!validPolicies.includes(contract.verification_policy)) {
      throw new Error(`Invalid verification policy: ${contract.verification_policy}`);
    }
  }
  
  private async performTaskExecution(context: TaskExecutionContext, timeout: number): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    context.metadata.status = 'running';
    
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        context.metadata.status = 'timeout';
        reject(new Error(`Task execution timeout after ${timeout}ms`));
      }, timeout);
      
      // Simulate task execution (in real implementation, this would call actual task logic)
      this.simulateTaskExecution(context)
        .then(output => {
          clearTimeout(timeoutHandle);
          const endTime = Date.now();
          
          const result: TaskExecutionResult = {
            context: { ...context, metadata: { ...context.metadata, status: 'completed', progress: 1 } },
            success: true,
            output,
            metrics: {
              execution_time_ms: endTime - startTime,
              peak_memory_mb: this.getCurrentMemoryUsage(),
              cpu_time_ms: endTime - startTime, // Simplified
            },
            completed_at: new Date().toISOString(),
          };
          
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }
  
  private async performTaskExecutionWithRetry(
    context: TaskExecutionContext, 
    timeout: number, 
    retryPolicy?: RetryPolicy
  ): Promise<TaskExecutionResult> {
    const maxRetries = retryPolicy?.max_retries || 0;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Apply retry delay
          const delay = this.calculateRetryDelay(attempt, retryPolicy);
          if (delay > 0) {
            this.emit('task:retry:delay', context, attempt, delay);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        // Log retry attempt
        if (attempt > 0) {
          this.emit('task:retry:attempt', context, attempt);
          if (this.config.debug) {
            console.log(`[AgentRuntime] Retry attempt ${attempt}/${maxRetries} for task ${context.execution_id}`);
          }
        }
        
        // Perform the actual task execution
        const result = await this.performTaskExecution(context, timeout);
        
        if (attempt > 0) {
          this.emit('task:retry:success', context, attempt);
        }
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        // Check if error qualifies for retry
        if (attempt < maxRetries && this.shouldRetryError(error as Error, retryPolicy)) {
          this.emit('task:retry:error', context, attempt, error);
          continue; // Try again
        } else {
          // Final failure or non-retryable error
          if (attempt > 0) {
            this.emit('task:retry:exhausted', context, attempt);
          }
          throw error;
        }
      }
    }
    
    // Should not reach here, but throw last error if we do
    throw lastError || new Error('Unknown retry error');
  }
  
  private calculateRetryDelay(attempt: number, retryPolicy?: RetryPolicy): number {
    if (!retryPolicy) return 0;
    
    const baseDelay = retryPolicy.initial_delay_ms || 1000;
    const maxDelay = retryPolicy.max_delay_ms || 30000;
    
    let delay: number;
    
    switch (retryPolicy.backoff_strategy) {
      case 'linear':
        delay = baseDelay * attempt;
        break;
        
      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt - 1);
        break;
        
      case 'none':
      default:
        delay = baseDelay;
        break;
    }
    
    return Math.min(delay, maxDelay);
  }
  
  private shouldRetryError(error: Error, retryPolicy?: RetryPolicy): boolean {
    if (!retryPolicy || !retryPolicy.retry_conditions) {
      // Default: retry on timeout and network errors
      return error.message.includes('timeout') || 
             error.message.includes('network') ||
             error.message.includes('ECONNRESET') ||
             error.message.includes('ENOTFOUND');
    }
    
    const conditions = retryPolicy.retry_conditions;
    
    for (const condition of conditions) {
      switch (condition) {
        case 'timeout':
          if (error.message.includes('timeout')) return true;
          break;
          
        case 'network_error':
          if (error.message.includes('network') || 
              error.message.includes('ECONNRESET') || 
              error.message.includes('ENOTFOUND')) return true;
          break;
          
        case 'resource_unavailable':
          if (error.message.includes('resource') || 
              error.message.includes('limit') ||
              error.message.includes('capacity')) return true;
          break;
      }
    }
    
    return false;
  }
  
  private async simulateTaskExecution(context: TaskExecutionContext): Promise<unknown> {
    // Simulate progressive task execution with progress updates
    const steps = 5;
    
    for (let i = 1; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
      context.metadata.progress = i / steps;
      this.emit('task:progress', context, context.metadata.progress);
    }
    
    // Return simulated output based on task description
    return {
      task_id: context.task.description,
      result: `Task completed: ${context.task.description}`,
      execution_id: context.execution_id,
      timestamp: new Date().toISOString(),
    };
  }
  
  private async performVerification(result: TaskExecutionResult, contract: DelegationContract): Promise<VerificationResult> {
    // Perform basic verification based on policy
    const verificationResult: VerificationResult = {
      verified: result.success,
      verified_at: new Date().toISOString(),
      verified_by: this.config.agent_id,
      verification_method: contract.verification_policy,
      quality_score: result.success ? 0.85 : 0.0,
      findings: {
        passed_checks: result.success ? ['output_exists', 'format_valid'] : [],
        failed_checks: result.success ? [] : ['task_failed'],
        warnings: [],
      },
    };
    
    // Generate verification output formatting if enabled
    if (this.verificationIntegration) {
      try {
        const verificationOutputResult = await this.verificationIntegration.processTaskResult(
          result,
          contract,
          {
            formats: this.config.verification_auto_formats,
            validate_strict: true,
          }
        );
        
        // Add formatted outputs to result
        result.verification_outputs = verificationOutputResult.parsedResult.formatted_outputs;
        result.verification_report = verificationOutputResult.multiModalReport;
        
        // Update verification result with compliance information
        if (verificationOutputResult.validation && !verificationOutputResult.validation.valid) {
          verificationResult.verified = false;
          verificationResult.quality_score = Math.max(0, verificationResult.quality_score - 0.2);
          verificationResult.findings.warnings.push(
            ...verificationOutputResult.validation.issues.map(issue => issue.message)
          );
        }
        
        // Include compliance score in verification details
        verificationResult.verification_details = JSON.stringify({
          compliance_score: verificationOutputResult.parsedResult.compliance_analysis.compliance_score,
          formats_generated: verificationOutputResult.parsedResult.formatted_outputs.map(o => o.format),
          validation_summary: verificationOutputResult.validation?.summary,
        });
        
        if (this.config.debug) {
          console.log(`[AgentRuntime] Generated ${verificationOutputResult.parsedResult.formatted_outputs.length} verification output formats`);
        }
      } catch (error) {
        console.error('[AgentRuntime] Failed to generate verification outputs:', error);
        // Add warning but don't fail verification
        verificationResult.findings.warnings.push('Failed to generate verification output formatting');
      }
    }
    
    return verificationResult;
  }
  
  private async assessCapability(capability: AgentCapability): Promise<CapabilitySelfAssessment> {
    // Calculate confidence factors from task history
    const recentTasks = this.getRecentTasksForCapability(capability.capability_id);
    const successRate = this.calculateSuccessRate(recentTasks);
    const avgExecutionTime = this.calculateAverageExecutionTime(recentTasks);
    
    // Adjust confidence based on recent performance
    let adjustedConfidence = capability.confidence_level;
    
    if (successRate !== null) {
      // Adjust based on success rate
      if (successRate > 0.9) {
        adjustedConfidence = Math.min(1.0, adjustedConfidence + 0.05);
      } else if (successRate < 0.7) {
        adjustedConfidence = Math.max(0.1, adjustedConfidence - 0.1);
      }
    }
    
    const assessment: CapabilitySelfAssessment = {
      capability_id: capability.capability_id,
      confidence_level: adjustedConfidence,
      assessed_at: new Date().toISOString(),
      confidence_factors: {
        recent_success_rate: successRate,
        resource_efficiency: this.calculateResourceEfficiency(recentTasks),
      },
      reasoning: `Assessment based on ${recentTasks.length} recent tasks`,
      recommendations: {
        confidence_adjustment: adjustedConfidence - capability.confidence_level,
        improvement_areas: successRate && successRate < 0.8 ? ['error_handling', 'edge_cases'] : [],
      },
    };
    
    return assessment;
  }
  
  private updateCapabilitiesFromExecution(result: TaskExecutionResult): void {
    // Update capability statistics based on execution result
    if (this.config.capabilities?.capabilities) {
      for (const capability of this.config.capabilities.capabilities) {
        if (this.taskMatchesCapability(result.context.task.description, capability)) {
          capability.successful_completions += result.success ? 1 : 0;
          capability.success_rate = this.calculateCapabilitySuccessRate(capability.capability_id);
          
          if (result.metrics.execution_time_ms) {
            capability.completion_time_estimate_ms = this.calculateAverageCompletionTime(capability.capability_id);
          }
        }
      }
    }
  }
  
  private taskMatchesCapability(taskDescription: string, capability: AgentCapability): boolean {
    // Simple pattern matching (in real implementation, this would be more sophisticated)
    if (capability.supported_patterns) {
      for (const pattern of capability.supported_patterns) {
        if (new RegExp(pattern, 'i').test(taskDescription)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  private getRecentTasksForCapability(capabilityId: string): TaskExecutionResult[] {
    return this.taskHistory
      .filter(result => this.taskMatchesCapabilityId(result, capabilityId))
      .slice(-10); // Last 10 tasks
  }
  
  private taskMatchesCapabilityId(result: TaskExecutionResult, capabilityId: string): boolean {
    // Match task to capability (simplified)
    const capability = this.config.capabilities?.capabilities.find(c => c.capability_id === capabilityId);
    return capability ? this.taskMatchesCapability(result.context.task.description, capability) : false;
  }
  
  private calculateSuccessRate(tasks: TaskExecutionResult[]): number | null {
    if (tasks.length === 0) return null;
    const successCount = tasks.filter(task => task.success).length;
    return successCount / tasks.length;
  }
  
  private calculateAverageExecutionTime(tasks: TaskExecutionResult[]): number | null {
    if (tasks.length === 0) return null;
    const totalTime = tasks.reduce((sum, task) => sum + task.metrics.execution_time_ms, 0);
    return totalTime / tasks.length;
  }
  
  private calculateResourceEfficiency(tasks: TaskExecutionResult[]): number | null {
    if (tasks.length === 0) return null;
    // Simplified efficiency calculation based on execution time vs estimated time
    return 0.8; // Placeholder
  }
  
  private calculateCurrentReputation(): number {
    if (this.taskHistory.length === 0) return 0.5; // Default
    
    const recentTasks = this.taskHistory.slice(-20);
    const successRate = this.calculateSuccessRate(recentTasks) || 0.5;
    const avgQuality = this.calculateAverageQuality(recentTasks);
    
    return (successRate * 0.7) + (avgQuality * 0.3);
  }
  
  private calculateAverageQuality(tasks: TaskExecutionResult[]): number {
    const qualityScores = tasks
      .filter(task => task.verification?.quality_score !== undefined)
      .map(task => task.verification!.quality_score!);
    
    if (qualityScores.length === 0) return 0.5;
    
    return qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
  }
  
  private calculateCapabilitySuccessRate(capabilityId: string): number {
    const tasks = this.getRecentTasksForCapability(capabilityId);
    return this.calculateSuccessRate(tasks) || 0.5;
  }
  
  private calculateAverageCompletionTime(capabilityId: string): number {
    const tasks = this.getRecentTasksForCapability(capabilityId);
    return this.calculateAverageExecutionTime(tasks) || 60000; // Default 1 minute
  }
  
  private updateConfidenceHistory(capabilityId: string, confidence: number): void {
    const history = this.confidenceHistory.get(capabilityId) || [];
    history.push({
      confidence,
      timestamp: new Date().toISOString(),
    });
    
    // Keep only last 50 entries
    if (history.length > 50) {
      history.shift();
    }
    
    this.confidenceHistory.set(capabilityId, history);
  }
  
  private checkResourceRequirements(requirements: ResourceRequirements): { canMeet: boolean, reason?: string, availability_score?: number } {
    const limits = this.config.resource_limits;
    if (!limits) return { canMeet: true, availability_score: 1 };
    
    if (requirements.memory_mb && limits.memory_mb && requirements.memory_mb > limits.memory_mb) {
      return { canMeet: false, reason: `Memory requirement ${requirements.memory_mb}MB exceeds limit ${limits.memory_mb}MB` };
    }
    
    if (requirements.cpu_cores && limits.cpu_percent && (requirements.cpu_cores * 100) > limits.cpu_percent) {
      return { canMeet: false, reason: `CPU requirement ${requirements.cpu_cores * 100}% exceeds limit ${limits.cpu_percent}%` };
    }
    
    // Calculate availability score based on resource utilization
    let score = 1;
    if (requirements.memory_mb && limits.memory_mb) {
      score *= (1 - requirements.memory_mb / limits.memory_mb);
    }
    if (requirements.cpu_cores && limits.cpu_percent) {
      score *= (1 - (requirements.cpu_cores * 100) / limits.cpu_percent);
    }
    
    return { canMeet: true, availability_score: Math.max(0, score) };
  }
  
  private checkCapabilityRequirements(requiredCapabilities: string[]): { canMeet: boolean, reason?: string, match_score?: number } {
    const myCapabilities = this.config.capabilities?.capabilities.map(c => c.capability_id) || [];
    const myCapabilityMap = new Map(this.config.capabilities?.capabilities.map(c => [c.capability_id, c]) || []);
    
    let totalConfidence = 0;
    let matchedCount = 0;
    
    for (const required of requiredCapabilities) {
      if (!myCapabilities.includes(required)) {
        return { canMeet: false, reason: `Missing required capability: ${required}` };
      }
      
      const capability = myCapabilityMap.get(required);
      if (capability) {
        totalConfidence += capability.confidence_level;
        matchedCount++;
      }
    }
    
    const matchScore = matchedCount > 0 ? totalConfidence / matchedCount : 0;
    return { canMeet: true, match_score: matchScore };
  }
  
  private checkReputationRequirements(requirements: ReputationRequirements): { meets_requirements: boolean, reason?: string } {
    const currentReputation = this.calculateCurrentReputation();
    const taskHistory = this.getTaskHistory();
    const successfulTasks = taskHistory.filter(task => task.success).length;
    
    if (requirements.min_security_score && currentReputation < requirements.min_security_score) {
      return { 
        meets_requirements: false, 
        reason: `Security score ${currentReputation.toFixed(2)} below required ${requirements.min_security_score}` 
      };
    }
    
    if (requirements.min_tasks_completed && successfulTasks < requirements.min_tasks_completed) {
      return { 
        meets_requirements: false, 
        reason: `Completed tasks ${successfulTasks} below required ${requirements.min_tasks_completed}` 
      };
    }
    
    if (requirements.min_confidence_score && this.config.capabilities) {
      const avgConfidence = this.config.capabilities.overall_confidence;
      if (avgConfidence < requirements.min_confidence_score) {
        return { 
          meets_requirements: false, 
          reason: `Confidence ${avgConfidence.toFixed(2)} below required ${requirements.min_confidence_score}` 
        };
      }
    }
    
    if (requirements.max_consecutive_failures) {
      const recentFailures = this.calculateConsecutiveFailures();
      if (recentFailures > requirements.max_consecutive_failures) {
        return { 
          meets_requirements: false, 
          reason: `Consecutive failures ${recentFailures} exceeds limit ${requirements.max_consecutive_failures}` 
        };
      }
    }
    
    if (requirements.required_specializations && this.config.capabilities) {
      const mySpecializations = this.config.capabilities.specializations || [];
      const missingSpecs = requirements.required_specializations.filter(spec => 
        !mySpecializations.includes(spec)
      );
      if (missingSpecs.length > 0) {
        return { 
          meets_requirements: false, 
          reason: `Missing required specializations: ${missingSpecs.join(', ')}` 
        };
      }
    }
    
    return { meets_requirements: true };
  }
  
  private validatePermissionToken(token: PermissionToken): { valid: boolean, reason?: string } {
    // Check token expiration
    if (token.expires_at) {
      const expiryTime = new Date(token.expires_at).getTime();
      const currentTime = Date.now();
      if (currentTime > expiryTime) {
        return { valid: false, reason: `Permission token expired at ${token.expires_at}` };
      }
    }
    
    // Validate required scopes (placeholder - would need agent-specific scope requirements)
    if (token.scopes.length === 0) {
      return { valid: false, reason: 'Permission token has no scopes' };
    }
    
    // Validate required actions (placeholder)
    if (token.actions.length === 0) {
      return { valid: false, reason: 'Permission token has no allowed actions' };
    }
    
    // Validate resources (placeholder)
    if (token.resources.length === 0) {
      return { valid: false, reason: 'Permission token has no accessible resources' };
    }
    
    return { valid: true };
  }
  
  private validateFirebreaks(firebreaks: Firebreak[], contract: DelegationContract): { compliant: boolean, reason?: string } {
    for (const firebreak of firebreaks) {
      switch (firebreak.type) {
        case 'max_depth':
          const currentDepth = contract.metadata?.delegation_depth || 0;
          if (firebreak.threshold && currentDepth >= firebreak.threshold) {
            return { 
              compliant: false, 
              reason: `Delegation depth ${currentDepth} exceeds firebreak limit ${firebreak.threshold}` 
            };
          }
          break;
          
        case 'tlp_escalation':
          // Check if task would escalate TLP level beyond firebreak
          const currentTLP = contract.tlp_classification || 'TLP:CLEAR';
          const isEscalation = this.isTLPEscalation(currentTLP, firebreak);
          if (isEscalation) {
            return { 
              compliant: false, 
              reason: `TLP escalation beyond firebreak: ${currentTLP}` 
            };
          }
          break;
          
        case 'timeout':
          const estimatedTime = this.estimateTaskTime(contract.task_description || '');
          if (firebreak.threshold && estimatedTime > firebreak.threshold) {
            return { 
              compliant: false, 
              reason: `Estimated time ${estimatedTime}ms exceeds firebreak limit ${firebreak.threshold}ms` 
            };
          }
          break;
          
        case 'resource_limit':
          if (contract.resource_requirements) {
            const resourceCheck = this.checkFirebreakResourceLimits(contract.resource_requirements, firebreak);
            if (!resourceCheck.compliant) {
              return resourceCheck;
            }
          }
          break;
          
        case 'human_review':
          // If human review required, reject automatic acceptance
          if (firebreak.action === 'require_approval') {
            return { 
              compliant: false, 
              reason: 'Human review firebreak requires manual approval' 
            };
          }
          break;
      }
    }
    
    return { compliant: true };
  }
  
  private isTLPEscalation(currentTLP: string, firebreak: Firebreak): boolean {
    const tlpLevels = { 'TLP:CLEAR': 0, 'TLP:GREEN': 1, 'TLP:AMBER': 2, 'TLP:RED': 3 };
    const currentLevel = tlpLevels[currentTLP as keyof typeof tlpLevels] || 0;
    const maxLevel = firebreak.threshold || 0;
    return currentLevel > maxLevel;
  }
  
  private checkFirebreakResourceLimits(requirements: any, firebreak: Firebreak): { compliant: boolean, reason?: string } {
    if (requirements.memory_mb && firebreak.threshold && requirements.memory_mb > firebreak.threshold) {
      return { 
        compliant: false, 
        reason: `Memory requirement ${requirements.memory_mb}MB exceeds firebreak limit ${firebreak.threshold}MB` 
      };
    }
    return { compliant: true };
  }
  
  private calculateAcceptanceConfidence(assessment: any, contract: DelegationContract): number {
    // Weight factors based on importance
    const weights = {
      capability_match: 0.3,
      resource_availability: 0.2,
      workload_capacity: 0.2,
      reputation_compliance: 0.15,
      firebreak_compliance: 0.15,
    };
    
    let confidence = 0;
    confidence += assessment.capability_match * weights.capability_match;
    confidence += assessment.resource_availability * weights.resource_availability;
    confidence += assessment.workload_capacity * weights.workload_capacity;
    confidence += (assessment.reputation_compliance ? 1 : 0) * weights.reputation_compliance;
    confidence += (assessment.firebreak_compliance ? 1 : 0) * weights.firebreak_compliance;
    
    // Apply penalty for high complexity or tight deadlines
    if (contract.metadata?.estimated_complexity && contract.metadata.estimated_complexity > 7) {
      confidence *= 0.9; // 10% penalty for high complexity
    }
    
    if (contract.timeout_ms) {
      const estimatedTime = this.estimateTaskTime(contract.task_description || '');
      const timeRatio = estimatedTime / contract.timeout_ms;
      if (timeRatio > 0.8) {
        confidence *= (1 - (timeRatio - 0.8) * 2); // Penalty for tight deadlines
      }
    }
    
    return Math.max(0, Math.min(1, confidence));
  }
  
  private calculateConsecutiveFailures(): number {
    const recentTasks = this.getTaskHistory(10); // Last 10 tasks
    let consecutiveFailures = 0;
    
    // Count failures from the end until we hit a success
    for (let i = recentTasks.length - 1; i >= 0; i--) {
      if (!recentTasks[i].success) {
        consecutiveFailures++;
      } else {
        break;
      }
    }
    
    return consecutiveFailures;
  }
  
  private estimateTaskTime(taskDescription: string): number {
    // Simple estimation based on task description length and complexity
    const baseTime = 5000; // 5 seconds base for reasonable task estimates
    const complexityBonus = Math.min(taskDescription.length * 50, 15000); // Max 15 seconds additional
    
    // Check for complexity keywords that might indicate longer tasks
    const complexKeywords = ['complex', 'comprehensive', 'detailed', 'enterprise', 'full'];
    const isComplex = complexKeywords.some(keyword => 
      taskDescription.toLowerCase().includes(keyword)
    );
    
    const complexityMultiplier = isComplex ? 2 : 1;
    return (baseTime + complexityBonus) * complexityMultiplier;
  }
  
  private getCurrentMemoryUsage(): number {
    // In a real implementation, this would get actual memory usage
    return Math.random() * 100; // Simulated memory usage in MB
  }
  
  /**
   * Initialize telemetry integration
   */
  private initializeTelemetry(): void {
    if (!this.config.enable_telemetry) {
      if (this.config.debug) {
        console.log('[AgentRuntime] Telemetry disabled');
      }
      return;
    }
    
    try {
      // Create telemetry integration with default or custom configuration
      if (this.config.telemetry_config) {
        this.telemetryIntegration = new RuntimeTelemetryIntegration({
          telemetry_config: {
            agent_id: this.config.agent_id,
            enabled: true,
            sinks: [], // Will be populated by createDefaultTelemetryIntegration
            ...this.config.telemetry_config.telemetry_config,
          },
          ...this.config.telemetry_config,
        });
      } else {
        // Use default telemetry integration
        this.telemetryIntegration = createDefaultTelemetryIntegration(
          this.config.agent_id,
          {
            track_task_metrics: true,
            track_delegation_lifecycle: true,
            track_resource_utilization: true,
            track_retry_attempts: true,
          }
        );
      }
      
      // Attach telemetry to this runtime instance
      this.telemetryIntegration.attach(this);
      
      if (this.config.debug) {
        console.log('[AgentRuntime] Telemetry integration initialized');
      }
    } catch (error) {
      console.error('[AgentRuntime] Failed to initialize telemetry:', error);
      // Continue without telemetry rather than failing completely
    }
  }
  
  /**
   * Initialize verification integration
   */
  private initializeVerificationIntegration(): void {
    if (!this.config.enable_verification_formatting) {
      if (this.config.debug) {
        console.log('[AgentRuntime] Verification formatting disabled');
      }
      return;
    }
    
    try {
      this.verificationIntegration = new VerificationIntegration({
        strict_validation: true,
        auto_generate_formats: this.config.verification_auto_formats || ['json', 'markdown'],
        default_formatter_config: {
          include_content_hash: true,
          include_debug_info: this.config.debug || false,
          max_content_size_bytes: this.config.max_verification_output_bytes || 1024 * 1024,
          metadata_options: {
            include_timing_data: true,
            include_resource_usage: true,
            include_error_details: true,
            include_contract_metadata: true,
          },
        },
      });
      
      if (this.config.debug) {
        console.log('[AgentRuntime] Verification integration initialized');
      }
    } catch (error) {
      console.error('[AgentRuntime] Failed to initialize verification integration:', error);
      // Continue without verification formatting rather than failing completely
    }
  }
  
  /**
   * Get telemetry integration (for external access)
   */
  getTelemetryIntegration(): RuntimeTelemetryIntegration | undefined {
    return this.telemetryIntegration;
  }
  
  /**
   * Query telemetry events
   */
  async queryTelemetryEvents(filter: any): Promise<any[]> {
    if (!this.telemetryIntegration) {
      throw new Error('Telemetry is not enabled');
    }
    
    return this.telemetryIntegration.queryEvents(filter);
  }
  
  /**
   * Shutdown runtime and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log('[AgentRuntime] Shutting down...');
    }
    
    // Cancel all running tasks
    for (const [executionId, context] of this.currentTasks) {
      context.metadata.status = 'failed';
      this.emit('task:failed', {
        context,
        success: false,
        output: null,
        error: {
          type: 'SHUTDOWN_ERROR',
          message: 'Runtime shutdown while task was executing',
          timestamp: new Date().toISOString(),
        },
        confidence_score: 0,
        execution_time_ms: Date.now() - new Date(context.metadata.started_at).getTime(),
      } as TaskExecutionResult);
    }
    
    // Clear all tasks
    this.currentTasks.clear();
    
    // Cleanup telemetry integration
    if (this.telemetryIntegration) {
      try {
        await this.telemetryIntegration.detach(this);
      } catch (error) {
        console.error('[AgentRuntime] Error during telemetry cleanup:', error);
      }
    }
    
    // Remove all event listeners
    this.removeAllListeners();
    
    if (this.config.debug) {
      console.log('[AgentRuntime] Shutdown complete');
    }
  }
}

export default AgentRuntime;
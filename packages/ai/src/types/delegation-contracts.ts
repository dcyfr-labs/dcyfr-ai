/**
 * Delegation Contract Types for DCYFR AI Framework
 * TLP:CLEAR
 * 
 * Core types and interfaces for delegation contracts supporting intelligent
 * task assignment, permission validation, firebreak enforcement, and
 * verification policies.
 * 
 * @module types/delegation-contracts
 * @version 1.0.0
 * @date 2026-02-13
 */

/**
 * TLP (Traffic Light Protocol) classification levels
 */
export type TLPLevel = 'TLP:RED' | 'TLP:AMBER' | 'TLP:GREEN' | 'TLP:CLEAR';

/**
 * Verification policy for task completion validation
 */
export type VerificationPolicy = 
  | 'none'
  | 'direct_inspection' 
  | 'third_party_audit'
  | 'cryptographic_proof'
  | 'human_required';

/**
 * Delegation contract status tracking
 */
export type DelegationContractStatus = 
  | 'pending' 
  | 'accepted' 
  | 'rejected' 
  | 'active' 
  | 'completed' 
  | 'failed' 
  | 'timeout' 
  | 'cancelled';

/**
 * Agent information for delegation tracking
 */
export interface DelegationAgent {
  agent_id: string;
  agent_name: string;
  version?: string;
  reputation_score?: number;
  current_workload?: number;
  max_concurrent_tasks?: number;
  capabilities?: string[];
  last_active?: string;
}

/**
 * Permission token for resource access control
 */
export interface PermissionToken {
  /** Unique token identifier */
  token_id: string;
  
  /** Permission scopes (e.g., 'read', 'write', 'execute') */
  scopes: string[];
  
  /** Allowed actions (e.g., 'create_file', 'run_command') */
  actions: string[];
  
  /** Resource URIs this token grants access to */
  resources: string[];
  
  /** Token expiration timestamp */
  expires_at?: string;
  
  /** Token issuer information */
  issued_by?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Firebreak safety mechanism for delegation chains
 */
export interface Firebreak {
  /** Type of firebreak condition */
  type: 'max_depth' | 'tlp_escalation' | 'human_review' | 'timeout' | 'resource_limit';
  
  /** Threshold value for triggering (context-dependent) */
  threshold?: number;
  
  /** Action to take when firebreak triggers */
  action: 'block' | 'escalate' | 'notify' | 'require_approval' | 'terminate';
  
  /** Human-readable reason for this firebreak */
  reason?: string;
  
  /** Metadata for action execution */
  action_metadata?: Record<string, unknown>;
}

/**
 * Retry policy for failed task execution
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  max_retries?: number;
  
  /** Backoff strategy between retries */
  backoff_strategy?: 'none' | 'linear' | 'exponential';
  
  /** Initial delay before first retry (milliseconds) */
  initial_delay_ms?: number;
  
  /** Maximum delay between retries (milliseconds) */
  max_delay_ms?: number;
  
  /** Conditions that should trigger retries */
  retry_conditions?: ('timeout' | 'network_error' | 'resource_unavailable')[];
}

/**
 * Reputation requirements for delegation acceptance
 */
export interface ReputationRequirements {
  /** Minimum security/trust score */
  min_security_score?: number;
  
  /** Minimum number of successfully completed tasks */
  min_tasks_completed?: number;
  
  /** Minimum confidence score for relevant capabilities */
  min_confidence_score?: number;
  
  /** Maximum allowed consecutive failures */
  max_consecutive_failures?: number;
  
  /** Required agent specializations */
  required_specializations?: string[];
}

/**
 * Success criteria for task completion validation
 */
export interface SuccessCriteria {
  /** Required validation checks to pass */
  required_checks?: string[];
  
  /** Expected output schema/structure */
  output_schema?: Record<string, unknown>;
  
  /** Performance requirements (execution time, resource usage) */
  performance_requirements?: {
    max_execution_time_ms?: number;
    max_memory_mb?: number;
    max_cpu_percent?: number;
  };
  
  /** Minimum quality threshold (0-1) */
  quality_threshold?: number;
  
  /** Required output formats/types */
  output_formats?: string[];
  
  /** Validation functions or criteria */
  validation_criteria?: string[];
}

/**
 * Verification result for completed tasks
 */
export interface VerificationResult {
  /** Whether verification passed */
  verified: boolean;
  
  /** Verification method used */
  verification_method: VerificationPolicy;
  
  /** Agent/system that performed verification */
  verified_by: string;
  
  /** Verification timestamp */
  verified_at: string;
  
  /** Quality score if applicable (0-1) */
  quality_score?: number;
  
  /** Verification findings and issues */
  findings?: string[];
  
  /** Verification details, errors, or feedback */
  verification_details?: string;
  
  /** Any verification artifacts (logs, signatures, etc.) */
  artifacts?: Record<string, unknown>;
}

/**
 * Complete delegation contract specification
 * 
 * Defines the terms, constraints, and requirements for delegating a task
 * from one agent to another, including security, verification, and
 * quality requirements.
 */
export interface DelegationContract {
  /** Unique contract identifier */
  contract_id: string;
  
  /** Source task identifier */
  task_id: string;
  
  /** Agent delegating the task */
  delegator: DelegationAgent;
  
  /** Agent receiving the delegation */
  delegatee: DelegationAgent;
  
  /** Delegator agent ID (convenience accessor) */
  delegator_agent_id: string;
  
  /** Delegatee agent ID (convenience accessor) */
  delegatee_agent_id: string;
  
  /** Human-readable task description */
  task_description?: string;
  
  /** Required verification policy for completion */
  verification_policy: VerificationPolicy;
  
  /** Traffic Light Protocol classification */
  tlp_classification?: TLPLevel;
  
  /** Criteria for determining successful completion */
  success_criteria: SuccessCriteria;
  
  /** Maximum time allowed for task completion (milliseconds) */
  timeout_ms?: number;
  
  /** Contract creation timestamp */
  created_at: string;
  
  /** Current contract status */
  status: DelegationContractStatus;
  
  /** Contract activation timestamp */
  activated_at?: string;
  
  /** Contract completion timestamp */
  completed_at?: string;
  
  /** Permission token for resource access */
  permission_token?: PermissionToken;
  
  /** Safety firebreaks for delegation chain protection */
  firebreaks?: Firebreak[];
  
  /** Retry policy for failed attempts */
  retry_policy?: RetryPolicy;
  
  /** Reputation requirements for delegatee acceptance */
  reputation_requirements?: ReputationRequirements;
  
  /** Parent contract ID (for multi-hop delegation chains) */
  parent_contract_id?: string;
  
  /** Depth in delegation chain (0 = top-level) */
  delegation_depth?: number;
  
  /** Required capabilities for task completion */
  required_capabilities?: {
    capability_id: string;
    min_confidence?: number;
  }[];
  
  /** 
   * Whether the delegatee must verify context sufficiency before acting.
   * When true, the delegatee agent must perform a ContextSufficiencyAssessment
   * and achieve minimum_context_confidence before proceeding with implementation.
   * Prevents assumption-based decision making that leads to dead-end implementations.
   */
  context_verification_required?: boolean;
  
  /**
   * Minimum confidence score (0-1) the delegatee must achieve in their
   * context sufficiency assessment before proceeding. Defaults to 0.7.
   * Higher values enforce stricter context gathering requirements.
   */
  minimum_context_confidence?: number;
  
  /** Resource requirements for task execution */
  resource_requirements?: {
    memory_mb?: number;
    cpu_cores?: number;
    disk_space_mb?: number;
    network_bandwidth_mbps?: number;
  };
  
  /** Task priority level (1-10, 10 = highest) */
  priority?: number;
  
  /** Additional metadata and context */
  metadata?: {
    /** Estimated task complexity (1-10) */
    estimated_complexity?: number;
    
    /** Estimated duration in milliseconds */
    estimated_duration_ms?: number;
    
    /** Whether task requires production system access */
    requires_production_access?: boolean;
    
    /** Delegation chain depth (for firebreak enforcement) */
    delegation_depth?: number;
    
    /** Parent contract ID if this is a sub-delegation */
    parent_contract_id?: string;
    
    /** Task categories/tags for matching */
    task_categories?: string[];
    
    /** Additional context fields */
    [key: string]: unknown;
  };
  
  /** Contract completion information (when status is completed/failed) */
  completion?: {
    /** Completion timestamp */
    completed_at: string;
    
    /** Whether task was successful */
    success: boolean;
    
    /** Task completion result/output */
    result?: unknown;
    
    /** Error information if failed */
    error?: {
      error_type: string;
      error_message: string;
      error_details?: Record<string, unknown>;
    };
    
    /** Verification result */
    verification?: VerificationResult;
    
    /** Final reputation impact */
    reputation_delta?: number;
    
    /** Execution metrics */
    metrics?: {
      execution_time_ms: number;
      peak_memory_mb: number;
      cpu_time_ms: number;
      network_bytes_sent: number;
      network_bytes_received: number;
    };
  };
  
  /** Verification result (top-level accessor) */
  verification_result?: VerificationResult;
  
  /** Failure timestamp (when status becomes failed) */
  failed_at?: string;
}

/**
 * Contract acceptance decision with reasoning
 */
export interface ContractAcceptanceDecision {
  /** Whether the contract can be accepted */
  can_accept: boolean;
  
  /** Human-readable reason for acceptance/rejection */
  reason?: string;
  
  /** Confidence in ability to complete task (0-1) */
  confidence?: number;
  
  /** Estimated completion time in milliseconds */
  estimated_completion_ms?: number;
  
  /** Any modifications proposed to the contract */
  proposed_modifications?: Partial<DelegationContract>;
  
  /** Detailed assessment factors */
  assessment?: {
    capability_match: number;
    resource_availability: number;
    workload_capacity: number;
    reputation_compliance: boolean;
    firebreak_compliance: boolean;
  };
}

// All types are already exported individually as named exports above.
// No default export needed - consumers should use named imports:
// import type { DelegationContract, SuccessCriteria, ... } from './delegation-contracts.js';
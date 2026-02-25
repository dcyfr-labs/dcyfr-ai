/**
 * DCYFR Delegation Contract Types
 * TLP:AMBER - Internal Use Only
 * 
 * Type definitions for intelligent AI delegation framework based on
 * DeepMind's "Towards Scalable Oversight with Recursive Reward Modeling"
 * and DAI principles.
 * 
 * @module delegation-contracts
 * @version 1.0.0
 * @date 2026-02-13
 */

import type { PermissionToken } from './permission-tokens';
import type { ExecutionMode, SessionState, SessionHandoff } from './agent-capabilities';

/**
 * Verification policy types for delegation contracts
 * 
 * - direct_inspection: Human/agent directly reviews delegated work
 * - third_party_audit: Independent agent validates results
 * - cryptographic_proof: Cryptographic verification of outputs
 * - human_required: Mandatory human review (TLP:AMBER/RED)
 */
export type VerificationPolicy =
  | 'direct_inspection'
  | 'third_party_audit'
  | 'cryptographic_proof'
  | 'human_required';

/**
 * Delegation contract status lifecycle
 */
export type DelegationContractStatus =
  | 'pending'      // Contract created, not yet active
  | 'active'       // Contract accepted, work in progress
  | 'completed'    // Successfully completed and verified
  | 'failed'       // Work failed verification
  | 'timeout'      // Exceeded timeout deadline
  | 'cancelled'    // Contract cancelled by delegator
  | 'revoked';     // Contract revoked (system/security)

/**
 * Success criteria for delegation verification
 */
export interface SuccessCriteria {
  /** Minimum quality threshold (0.0 to 1.0) */
  quality_threshold?: number;
  
  /** Required verification checks */
  required_checks?: string[];
  
  /** Expected output format/schema */
  output_schema?: Record<string, unknown>;
  
  /** Performance requirements */
  performance_requirements?: {
    max_completion_time_ms?: number;
    max_resource_usage?: Record<string, number>;
  };
  
  /** Custom success predicates */
  custom_criteria?: Record<string, unknown>;
}

/**
 * Verification result from contract execution
 */
export interface VerificationResult {
  /** Whether verification passed */
  verified: boolean;
  
  /** Verification timestamp */
  verified_at: string;
  
  /** Verifying agent/human identifier */
  verified_by: string;
  
  /** Verification method used */
  verification_method: VerificationPolicy;
  
  /** Detailed verification findings */
  findings?: {
    passed_checks?: string[];
    failed_checks?: string[];
    warnings?: string[];
  };
  
  /** Quality score assigned (0.0 to 1.0) */
  quality_score?: number;
  
  /** Additional verification metadata */
  metadata?: Record<string, unknown>;
}

/**
 * TLP classification levels — shared across delegation & security modules.
 */
export type TLPLevel = 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';

/**
 * Authenticated agent — extends DelegationAgent with optional HMAC-SHA256
 * identity proof fields.  All fields are optional for backward compatibility;
 * auth is enforced when the `security_middleware` feature flag is enabled.
 * @since 1.2.0
 */
export interface AuthenticatedAgent extends DelegationAgent {
  /** HMAC-SHA256 hex token over (agent_id + ':' + timestamp_ms) */
  auth_token?: string;
  /** ISO 8601 timestamp used as the HMAC message component */
  auth_timestamp?: string;
  /** Registered key identifier used to look up the signing secret */
  key_id?: string;
}

/**
 * Structured task content for content-policy evaluation.
 * Supplied alongside task_description when the `content_security`
 * feature flag is enabled.
 * @since 1.2.0
 */
export interface TaskContent {
  /** Primary instruction text sent to the delegatee */
  instruction: string;
  /** Optional system/context prompt prepended to instruction */
  context?: string;
  /** Content policy strictness — defaults to 'standard' */
  content_policy?: 'strict' | 'standard' | 'permissive';
}

/**
 * Agent identification in delegation context
 */
export interface DelegationAgent {
  /** Unique agent identifier */
  agent_id: string;
  
  /** Human-readable agent name */
  agent_name: string;
  
  /** Agent's confidence in handling this task (0.0 to 1.0) */
  confidence_level?: number;
  
  /** Estimated completion time (milliseconds) */
  estimated_completion_time_ms?: number;
}

/**
 * Delegation Contract
 * 
 * Formal contract between delegating agent and delegated agent,
 * including verification policies, success criteria, and permission boundaries.
 */
export interface DelegationContract {
  /** Unique contract identifier */
  contract_id: string;
  
  /** Agent delegating the task */
  delegator: DelegationAgent;
  
  /** Agent receiving the delegation */
  delegatee: DelegationAgent;
  
  /** Task identification */
  task_id: string;
  
  /** Human-readable task description */
  task_description: string;
  
  /** Verification policy to use */
  verification_policy: VerificationPolicy;
  
  /** Success criteria for verification */
  success_criteria: SuccessCriteria;
  
  /** Maximum time allowed for completion (milliseconds) */
  timeout_ms: number;
  
  /** Priority level (1=highest, 5=lowest, default=3) */
  priority?: number;
  
  /** Permission tokens granted for this delegation */
  permission_tokens?: PermissionToken[];
  
  /** Contract status */
  status: DelegationContractStatus;
  
  /** Contract creation timestamp (ISO 8601) */
  created_at: string;
  
  /** Contract activation timestamp */
  activated_at?: string;
  
  /** Contract completion timestamp */
  completed_at?: string;
  
  /** Verification result (if completed) */
  verification_result?: VerificationResult;
  
  /** Parent contract ID (for multi-hop delegation) */
  parent_contract_id?: string;
  
  /** Depth in delegation chain (0 = top-level) */
  delegation_depth: number;
  
  /** TLP classification for this delegation */
  tlp_classification?: TLPLevel;

  /**
   * Agent ID of the original top-level delegator (root of the chain).
   * Populated automatically on sub-delegations for blast-radius tracking.
   * @since 1.2.0
   */
  root_delegator_id?: string;

  /**
   * ISO 8601 timestamp of the last heartbeat for active contracts.
   * Updated periodically by ContractTimeoutWatchdog.
   * @since 1.2.0
   */
  last_heartbeat_at?: string;
  
  /**
   * Execution mode for this delegation contract.
   * Defaults to `ExecutionMode.INTERACTIVE` when not specified.
   * @since 1.1.0
   */
  execution_mode?: ExecutionMode;

  /**
   * Session identifier shared across all contracts in a delegation session.
   * Populated for BACKGROUND and ASYNC mode contracts.
   * @since 1.1.0
   */
  session_id?: string;

  /**
   * Current runtime state of the delegation session.
   * Includes conversation snapshot, worktree path, and PR number.
   * @since 1.1.0
   */
  session_state?: SessionState;

  /**
   * Ordered history of mode transitions for this contract's session.
   * Appended on each handoff.
   * @since 1.1.0
   */
  handoff_history?: SessionHandoff[];

  /** Additional contract metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delegation chain information
 * Tracks the lineage of delegation from root to leaf
 */
export interface DelegationChain {
  /** Chain identifier */
  chain_id: string;
  
  /** Ordered list of contracts from root to current */
  contracts: DelegationContract[];
  
  /** Total depth of chain */
  depth: number;
  
  /** Whether chain has loops (should be false) */
  has_loops: boolean;
  
  /** Liability firebreak points (accountability boundaries) */
  firebreak_contracts?: string[];
  
  /** Chain creation timestamp */
  created_at: string;
}

/**
 * Delegation contract creation request
 */
export interface CreateDelegationContractRequest {
  /** Delegating agent */
  delegator: DelegationAgent;
  
  /** Agent to delegate to */
  delegatee: DelegationAgent;
  
  /** Task details */
  task_id: string;
  task_description: string;
  
  /** Verification requirements */
  verification_policy: VerificationPolicy;
  success_criteria: SuccessCriteria;
  
  /** Timeout in milliseconds */
  timeout_ms: number;
  
  /** Optional permission tokens */
  permission_tokens?: PermissionToken[];
  
  /** Optional parent contract (for sub-delegation) */
  parent_contract_id?: string;
  
  /** Optional TLP classification */
  tlp_classification?: TLPLevel;
  
  /**
   * Requested execution mode for this contract.
   * Defaults to `ExecutionMode.INTERACTIVE` when omitted.
   * @since 1.1.0
   */
  execution_mode?: ExecutionMode;

  /**
   * Session identifier to associate this contract with an existing session.
   * When omitted a new session ID is generated for BACKGROUND / ASYNC modes.
   * @since 1.1.0
   */
  session_id?: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delegation contract update request
 */
export interface UpdateDelegationContractRequest {
  /** Contract to update */
  contract_id: string;
  
  /** New status */
  status?: DelegationContractStatus;
  
  /** Verification result (if completed) */
  verification_result?: VerificationResult;
  
  /** Updated metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delegation contract query options
 */
export interface DelegationContractQuery {
  /** Filter by delegator agent */
  delegator_id?: string;
  
  /** Filter by delegatee agent */
  delegatee_id?: string;
  
  /** Filter by task */
  task_id?: string;
  
  /** Filter by status */
  status?: DelegationContractStatus | DelegationContractStatus[];
  
  /** Filter by depth */
  delegation_depth?: number;
  
  /** Filter by parent contract */
  parent_contract_id?: string;
  
  /** Limit results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
  
  /** Sort by field */
  sort_by?: 'created_at' | 'completed_at' | 'timeout_ms';
  
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

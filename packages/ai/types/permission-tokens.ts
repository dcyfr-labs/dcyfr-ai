/**
 * DCYFR Permission Token Types
 * TLP:AMBER - Internal Use Only
 * 
 * Type definitions for hierarchical permission tokens with attenuation.
 * Implements least-privilege access control for delegation chains.
 * 
 * @module permission-tokens
 * @version 1.0.0
 * @date 2026-02-13
 */

/**
 * Permission scope levels
 * Hierarchical scopes use dot notation (e.g., "workspace.read.code")
 */
export type PermissionScope = string;

/**
 * Permission action types
 */
export type PermissionAction =
  | 'read'           // Read access
  | 'write'          // Write/modify access
  | 'execute'        // Execute/run access
  | 'delete'         // Delete access
  | 'create'         // Create new resources
  | 'manage'         // Full management access
  | 'delegate';      // Can further delegate permissions

/**
 * Resource types that can be protected by permissions
 */
export type ProtectedResourceType =
  | 'file'           // File system resources
  | 'directory'      // Directory resources
  | 'code'           // Code/source files
  | 'config'         // Configuration files
  | 'secret'         // Secrets and credentials
  | 'data'           // Data resources
  | 'api'            // API endpoints
  | 'service'        // External services
  | 'agent'          // Other agents
  | 'workspace'      // Workspace-level resources
  | 'project'        // Project-level resources
  | 'package';       // Package/module resources

/**
 * Permission constraint types
 */
export interface PermissionConstraint {
  /** Type of constraint */
  type: 'time' | 'count' | 'rate' | 'size' | 'custom';
  
  /** Constraint parameters */
  parameters: Record<string, unknown>;
  
  /** Human-readable constraint description */
  description?: string;
}

/**
 * Time-based permission constraint
 */
export interface TimeConstraint extends PermissionConstraint {
  type: 'time';
  parameters: {
    /** Start time (ISO 8601) */
    start_time?: string;
    
    /** End time (ISO 8601) */
    end_time?: string;
    
    /** Duration in milliseconds */
    duration_ms?: number;
    
    /** Allowed time windows */
    allowed_windows?: Array<{
      start: string;
      end: string;
    }>;
  };
}

/**
 * Count-based permission constraint
 */
export interface CountConstraint extends PermissionConstraint {
  type: 'count';
  parameters: {
    /** Maximum number of uses */
    max_uses: number;
    
    /** Current use count */
    current_uses?: number;
  };
}

/**
 * Rate-based permission constraint
 */
export interface RateConstraint extends PermissionConstraint {
  type: 'rate';
  parameters: {
    /** Maximum operations per window */
    max_operations: number;
    
    /** Time window in milliseconds */
    window_ms: number;
    
    /** Current operations in window */
    current_operations?: number;
    
    /** Window start time */
    window_start?: string;
  };
}

/**
 * Size-based permission constraint
 */
export interface SizeConstraint extends PermissionConstraint {
  type: 'size';
  parameters: {
    /** Maximum size in bytes */
    max_size_bytes: number;
    
    /** Applies to individual operations or cumulative */
    cumulative?: boolean;
  };
}

/**
 * Permission revocation condition
 */
export interface RevocationCondition {
  /** Condition type */
  type: 'on_failure' | 'on_timeout' | 'on_security_event' | 'on_task_complete' | 'manual' | 'custom';
  
  /** Condition parameters */
  parameters?: Record<string, unknown>;
  
  /** Whether this condition triggers automatic revocation */
  auto_revoke: boolean;
  
  /** Human-readable description */
  description?: string;
}

/**
 * Permission grant record
 * Tracks who granted permission and when
 */
export interface PermissionGrant {
  /** Who granted this permission */
  granted_by: string;
  
  /** When permission was granted */
  granted_at: string;
  
  /** Why permission was granted */
  reason?: string;
  
  /** Reference to authorization source (contract, policy, etc.) */
  authorization_source?: string;
}

/**
 * Permission usage record
 * Tracks usage of permission tokens
 */
export interface PermissionUsage {
  /** Unique usage event ID */
  usage_id: string;
  
  /** When permission was used */
  used_at: string;
  
  /** Who used the permission */
  used_by: string;
  
  /** What action was performed */
  action: PermissionAction;
  
  /** Resource accessed */
  resource: string;
  
  /** Result of the operation */
  result: 'success' | 'failure' | 'denied';
  
  /** Additional usage metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Permission token status
 */
export type PermissionTokenStatus =
  | 'active'         // Token is active and valid
  | 'expired'        // Token has expired
  | 'revoked'        // Token was revoked
  | 'suspended'      // Temporarily suspended
  | 'exhausted';     // Usage limits exhausted

/**
 * Permission Token
 * Hierarchical permission token with attenuation support
 */
export interface PermissionToken {
  /** Unique token identifier */
  token_id: string;
  
  /** Token version */
  version: string;
  
  /** Token status */
  status: PermissionTokenStatus;
  
  /** Holder of this token (agent_id) */
  holder: string;
  
  /** Issuer of this token (agent_id) */
  issuer: string;
  
  /** Permission scopes granted (hierarchical) */
  scopes: PermissionScope[];
  
  /** Allowed actions */
  actions: PermissionAction[];
  
  /** Resource types this token grants access to */
  resource_types: ProtectedResourceType[];
  
  /** Specific resources (paths, IDs, etc.) */
  resources?: string[];
  
  /** Resource patterns (glob, regex) */
  resource_patterns?: string[];
  
  /** Token constraints */
  constraints?: PermissionConstraint[];
  
  /** Revocation conditions */
  revocation_conditions?: RevocationCondition[];
  
  /** Token expiration timestamp (ISO 8601) */
  expires_at?: string;
  
  /** Whether this token can be further delegated */
  delegatable: boolean;
  
  /** Maximum delegation depth allowed from this token */
  max_delegation_depth: number;
  
  /** Current delegation depth (0 = original token) */
  delegation_depth: number;
  
  /** Parent token ID (for attenuation tracking) */
  parent_token_id?: string;
  
  /** Child token IDs (tokens attenuated from this one) */
  child_token_ids?: string[];
  
  /** Grant record */
  grant: PermissionGrant;
  
  /** Usage history */
  usage_history?: PermissionUsage[];
  
  /** Token metadata */
  metadata?: Record<string, unknown>;
  
  /** Token creation timestamp */
  created_at: string;
  
  /** Last usage timestamp */
  last_used_at?: string;
  
  /** Revocation timestamp */
  revoked_at?: string;
  
  /** Revocation reason */
  revocation_reason?: string;
}

/**
 * Permission attenuation request
 * Request to create an attenuated (reduced-scope) child token
 */
export interface AttenuatePermissionRequest {
  /** Parent token to attenuate */
  parent_token_id: string;
  
  /** New token holder */
  new_holder: string;
  
  /** Reduced scopes (must be subset of parent) */
  scopes: PermissionScope[];
  
  /** Reduced actions (must be subset of parent) */
  actions?: PermissionAction[];
  
  /** Reduced resources (must be subset of parent) */
  resources?: string[];
  
  /** Additional constraints (additive only) */
  additional_constraints?: PermissionConstraint[];
  
  /** Additional revocation conditions (additive only) */
  additional_revocation_conditions?: RevocationCondition[];
  
  /** Whether attenuated token can be further delegated */
  delegatable?: boolean;
  
  /** Expiration time (cannot exceed parent expiration) */
  expires_at?: string;
  
  /** Reason for attenuation */
  reason?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Permission token creation request
 */
export interface CreatePermissionTokenRequest {
  /** Token holder (agent_id) */
  holder: string;
  
  /** Token issuer (agent_id) */
  issuer: string;
  
  /** Permission scopes */
  scopes: PermissionScope[];
  
  /** Allowed actions */
  actions: PermissionAction[];
  
  /** Resource types */
  resource_types: ProtectedResourceType[];
  
  /** Specific resources */
  resources?: string[];
  
  /** Resource patterns */
  resource_patterns?: string[];
  
  /** Constraints */
  constraints?: PermissionConstraint[];
  
  /** Revocation conditions */
  revocation_conditions?: RevocationCondition[];
  
  /** Expiration time */
  expires_at?: string;
  
  /** Whether token can be delegated */
  delegatable: boolean;
  
  /** Maximum delegation depth */
  max_delegation_depth?: number;
  
  /** Grant reason */
  grant_reason?: string;
  
  /** Authorization source */
  authorization_source?: string;
  
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Permission token validation request
 */
export interface ValidatePermissionTokenRequest {
  /** Token to validate */
  token_id: string;
  
  /** Requested action */
  action: PermissionAction;
  
  /** Resource being accessed */
  resource: string;
  
  /** Resource type */
  resource_type: ProtectedResourceType;
  
  /** Additional context for validation */
  context?: Record<string, unknown>;
}

/**
 * Permission token validation result
 */
export interface PermissionTokenValidationResult {
  /** Whether permission is granted */
  granted: boolean;
  
  /** Token that was validated */
  token_id: string;
  
  /** Validation timestamp */
  validated_at: string;
  
  /** Reasons for denial (if not granted) */
  denial_reasons?: string[];
  
  /** Active constraints */
  active_constraints?: PermissionConstraint[];
  
  /** Remaining usage (if count-limited) */
  remaining_uses?: number;
  
  /** Time until expiration */
  time_until_expiration_ms?: number;
  
  /** Validation metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Permission token revocation request
 */
export interface RevokePermissionTokenRequest {
  /** Token to revoke */
  token_id: string;
  
  /** Who is revoking the token */
  revoked_by: string;
  
  /** Reason for revocation */
  reason: string;
  
  /** Whether to cascade revoke child tokens */
  cascade?: boolean;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Permission token query options
 */
export interface PermissionTokenQuery {
  /** Filter by holder */
  holder?: string;
  
  /** Filter by issuer */
  issuer?: string;
  
  /** Filter by status */
  status?: PermissionTokenStatus | PermissionTokenStatus[];
  
  /** Filter by scope */
  scopes?: PermissionScope[];
  
  /** Filter by action */
  actions?: PermissionAction[];
  
  /** Filter by resource type */
  resource_types?: ProtectedResourceType[];
  
  /** Filter by delegation depth */
  delegation_depth?: number;
  
  /** Only delegatable tokens */
  delegatable_only?: boolean;
  
  /** Include expired tokens */
  include_expired?: boolean;
  
  /** Include revoked tokens */
  include_revoked?: boolean;
  
  /** Limit results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
  
  /** Sort by field */
  sort_by?: 'created_at' | 'expires_at' | 'last_used_at';
  
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

/**
 * Permission scope hierarchy
 * Defines hierarchical relationships between scopes
 */
export interface PermissionScopeHierarchy {
  /** Scope name */
  scope: PermissionScope;
  
  /** Parent scope */
  parent?: PermissionScope;
  
  /** Child scopes */
  children?: PermissionScope[];
  
  /** Implied actions for this scope */
  implied_actions?: PermissionAction[];
  
  /** Description */
  description?: string;
}

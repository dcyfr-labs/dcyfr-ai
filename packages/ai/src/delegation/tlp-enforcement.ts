/**
 * TLP Classification Enforcement for DCYFR Delegation Framework
 * TLP:AMBER - Internal Use Only
 * 
 * Implements Traffic Light Protocol classification enforcement to ensure
 * delegation contracts respect security boundaries and agent clearance levels.
 * 
 * Security Features:
 * - Agent clearance verification for TLP-classified tasks
 * - Delegation blocking for insufficient clearance levels
 * - Audit trail of TLP-related access attempts and denials
 * 
 * @module delegation/tlp-enforcement
 * @version 1.0.0
 * @date 2026-02-14
 */

import type { TLPLevel, DelegationContract } from '../types/delegation-contracts.js';

/**
 * Agent clearance levels for TLP classification access
 */
export interface AgentClearance {
  /** Agent identifier */
  agent_id: string;
  
  /** Agent display name */
  agent_name: string;
  
  /** Maximum TLP level this agent is cleared to handle */
  max_tlp_level: TLPLevel;
  
  /** Clearance issued date */
  issued_at: string;
  
  /** Clearance expiration date (optional) */
  expires_at?: string;
  
  /** Clearance issuing authority */
  issued_by: string;
  
  /** Additional restrictions */
  restrictions?: string[];
  
  /** Clearance metadata */
  metadata?: {
    /** Security background check completed */
    background_check?: boolean;
    
    /** Training completion date */
    training_completed?: string;
    
    /** Last audit date */
    last_audit?: string;
    
    /** Previous clearance violations */
    violation_count?: number;
  };
}

/**
 * TLP enforcement result
 */
export interface TLPEnforcementResult {
  /** Whether delegation is allowed */
  allowed: boolean;
  
  /** Reason for the decision */
  reason: string;
  
  /** Required clearance level for the task */
  required_clearance: TLPLevel;
  
  /** Agent's actual clearance level */
  agent_clearance?: TLPLevel;
  
  /** Enforcement action taken */
  action: 'allow' | 'block' | 'escalate' | 'audit_log';
  
  /** Additional context */
  metadata?: {
    /** Enforcement rule that applied */
    rule_applied?: string;
    
    /** Escalation required */
    escalation_required?: boolean;
    
    /** Audit logging performed */
    audit_logged?: boolean;
  };
}

/**
 * TLP hierarchy levels (highest to lowest security)
 */
const TLP_HIERARCHY: Record<TLPLevel, number> = {
  'TLP:RED': 4,
  'TLP:AMBER': 3,
  'TLP:GREEN': 2,
  'TLP:CLEAR': 1,
};

/**
 * Default agent clearances for DCYFR workspace agents
 * These represent the security clearance levels for known agents
 */
export const DEFAULT_AGENT_CLEARANCES: AgentClearance[] = [
  // Administrative and security agents (highest clearance)
  {
    agent_id: 'security-engineer',
    agent_name: 'Security Engineer',
    max_tlp_level: 'TLP:RED',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      background_check: true,
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  {
    agent_id: 'DCYFR-WORKSPACE',
    agent_name: 'DCYFR Workspace Agent',
    max_tlp_level: 'TLP:RED',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      background_check: true,
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  {
    agent_id: 'architecture-reviewer',
    agent_name: 'Architecture Reviewer',
    max_tlp_level: 'TLP:AMBER',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      background_check: true,
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  
  // Development agents (moderate clearance)
  {
    agent_id: 'fullstack-developer',
    agent_name: 'Fullstack Developer',
    max_tlp_level: 'TLP:AMBER',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      background_check: true,
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  {
    agent_id: 'typescript-pro',
    agent_name: 'TypeScript Expert',
    max_tlp_level: 'TLP:GREEN',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      background_check: true,
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  {
    agent_id: 'devops-engineer',
    agent_name: 'DevOps Engineer',
    max_tlp_level: 'TLP:AMBER',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      background_check: true,
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  
  // General purpose agents (limited clearance)
  {
    agent_id: 'test-engineer',
    agent_name: 'Test Engineer',
    max_tlp_level: 'TLP:GREEN',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  {
    agent_id: 'documentation-expert',
    agent_name: 'Documentation Expert',
    max_tlp_level: 'TLP:GREEN',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  {
    agent_id: 'performance-profiler',
    agent_name: 'Performance Profiler',
    max_tlp_level: 'TLP:GREEN',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
  {
    agent_id: 'quick-fix',
    agent_name: 'Quick Fix Agent',
    max_tlp_level: 'TLP:CLEAR',
    issued_at: '2026-02-14T00:00:00Z',
    issued_by: 'DCYFR Security Team',
    metadata: {
      training_completed: '2026-01-15',
      violation_count: 0,
    },
  },
];

/**
 * TLP Classification Enforcement Engine
 */
export class TLPEnforcementEngine {
  private agentClearances: Map<string, AgentClearance> = new Map();
  private auditLog: Array<{
    timestamp: string;
    agent_id: string;
    action: string;
    tlp_level?: TLPLevel;
    contract_id?: string;
    decision: 'allow' | 'block' | 'escalate';
    reason: string;
  }> = [];

  constructor(clearances?: AgentClearance[]) {
    // Load default clearances
    for (const clearance of DEFAULT_AGENT_CLEARANCES) {
      this.agentClearances.set(clearance.agent_id, clearance);
    }
    
    // Load additional clearances if provided
    if (clearances) {
      for (const clearance of clearances) {
        this.agentClearances.set(clearance.agent_id, clearance);
      }
    }
  }

  /**
   * Add or update agent clearance
   */
  setAgentClearance(clearance: AgentClearance): void {
    this.agentClearances.set(clearance.agent_id, clearance);
    
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      agent_id: clearance.agent_id,
      action: 'clearance_updated',
      decision: 'allow',
      reason: `Clearance updated: ${clearance.max_tlp_level}`,
    });
  }

  /**
   * Get agent clearance level
   */
  getAgentClearance(agentId: string): AgentClearance | null {
    return this.agentClearances.get(agentId) || null;
  }

  /**
   * Check if agent has sufficient clearance for TLP level
   */
  hasRequiredClearance(agentId: string, requiredTLP: TLPLevel): boolean {
    const clearance = this.agentClearances.get(agentId);
    
    if (!clearance) {
      return false; // No clearance = no access
    }
    
    // Check if clearance is expired
    if (clearance.expires_at && new Date(clearance.expires_at) < new Date()) {
      return false;
    }
    
    // Check TLP hierarchy (agent must have same or higher clearance)
    const agentLevel = TLP_HIERARCHY[clearance.max_tlp_level];
    const requiredLevel = TLP_HIERARCHY[requiredTLP];
    
    return agentLevel >= requiredLevel;
  }

  /**
   * Enforce TLP classification for delegation contract
   */
  enforceTLPClassification(contract: DelegationContract): TLPEnforcementResult {
    const contractTLP = contract.tlp_classification || 'TLP:CLEAR';
    const delegateeId = contract.delegatee_agent_id;
    
    // For TLP:CLEAR, no enforcement needed
    if (contractTLP === 'TLP:CLEAR') {
      this.logAccessAttempt(delegateeId, 'delegation', contractTLP, contract.contract_id, 'allow', 'TLP:CLEAR allows all agents');
      
      return {
        allowed: true,
        reason: 'TLP:CLEAR classification allows all agents',
        required_clearance: contractTLP,
        action: 'allow',
        metadata: {
          rule_applied: 'TLP_CLEAR_ALLOWALL',
          audit_logged: true,
        },
      };
    }
    
    // Check agent clearance for higher TLP levels
    const clearance = this.getAgentClearance(delegateeId);
    
    if (!clearance) {
      this.logAccessAttempt(delegateeId, 'delegation', contractTLP, contract.contract_id, 'block', 'Agent has no security clearance');
      
      return {
        allowed: false,
        reason: `Agent ${delegateeId} has no security clearance for ${contractTLP} tasks`,
        required_clearance: contractTLP,
        action: 'block',
        metadata: {
          rule_applied: 'NO_CLEARANCE_BLOCK',
          audit_logged: true,
        },
      };
    }
    
    // Check if agent has sufficient clearance
    const hasClearance = this.hasRequiredClearance(delegateeId, contractTLP);
    
    if (!hasClearance) {
      this.logAccessAttempt(delegateeId, 'delegation', contractTLP, contract.contract_id, 'block', `Insufficient clearance: ${clearance.max_tlp_level} < ${contractTLP}`);
      
      return {
        allowed: false,
        reason: `Agent ${delegateeId} clearance level ${clearance.max_tlp_level} insufficient for ${contractTLP} task`,
        required_clearance: contractTLP,
        agent_clearance: clearance.max_tlp_level,
        action: 'block',
        metadata: {
          rule_applied: 'INSUFFICIENT_CLEARANCE_BLOCK',
          audit_logged: true,
        },
      };
    }
    
    // Agent has sufficient clearance
    this.logAccessAttempt(delegateeId, 'delegation', contractTLP, contract.contract_id, 'allow', `Agent clearance ${clearance.max_tlp_level} sufficient`);
    
    return {
      allowed: true,
      reason: `Agent ${delegateeId} has sufficient clearance (${clearance.max_tlp_level}) for ${contractTLP} task`,
      required_clearance: contractTLP,
      agent_clearance: clearance.max_tlp_level,
      action: 'allow',
      metadata: {
        rule_applied: 'SUFFICIENT_CLEARANCE_ALLOW',
        audit_logged: true,
      },
    };
  }

  /**
   * Log access attempt for audit trail
   */
  private logAccessAttempt(
    agentId: string,
    action: string,
    tlpLevel: TLPLevel,
    contractId: string,
    decision: 'allow' | 'block' | 'escalate',
    reason: string
  ): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      agent_id: agentId,
      action,
      tlp_level: tlpLevel,
      contract_id: contractId,
      decision,
      reason,
    });

    // Log to console in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔒 TLP Enforcement: ${decision.toUpperCase()} ${agentId} → ${tlpLevel} (${reason})`);
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(options?: {
    agentId?: string;
    tlpLevel?: TLPLevel;
    decision?: 'allow' | 'block' | 'escalate';
    since?: string;
    limit?: number;
  }): Array<typeof this.auditLog[0]> {
    let filtered = [...this.auditLog];
    
    if (options?.agentId) {
      filtered = filtered.filter(entry => entry.agent_id === options.agentId);
    }
    
    if (options?.tlpLevel) {
      filtered = filtered.filter(entry => entry.tlp_level === options.tlpLevel);
    }
    
    if (options?.decision) {
      filtered = filtered.filter(entry => entry.decision === options.decision);
    }
    
    if (options?.since) {
      const sinceDate = new Date(options.since);
      filtered = filtered.filter(entry => new Date(entry.timestamp) >= sinceDate);
    }
    
    // Sort by timestamp descending (most recent first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  }

  /**
   * Get clearance statistics
   */
  getClearanceStats(): {
    total_agents: number;
    clearance_distribution: Record<TLPLevel, number>;
    expired_clearances: number;
    total_access_attempts: number;
    blocked_attempts: number;
    allowed_attempts: number;
  } {
    const now = new Date();
    const distribution: Record<TLPLevel, number> = {
      'TLP:RED': 0,
      'TLP:AMBER': 0,
      'TLP:GREEN': 0,
      'TLP:CLEAR': 0,
    };
    
    let expiredCount = 0;
    
    for (const clearance of this.agentClearances.values()) {
      distribution[clearance.max_tlp_level]++;
      
      if (clearance.expires_at && new Date(clearance.expires_at) < now) {
        expiredCount++;
      }
    }
    
    const blockedAttempts = this.auditLog.filter(entry => entry.decision === 'block').length;
    const allowedAttempts = this.auditLog.filter(entry => entry.decision === 'allow').length;
    
    return {
      total_agents: this.agentClearances.size,
      clearance_distribution: distribution,
      expired_clearances: expiredCount,
      total_access_attempts: this.auditLog.length,
      blocked_attempts: blockedAttempts,
      allowed_attempts: allowedAttempts,
    };
  }

  /**
   * Validate delegation contract against TLP enforcement
   * Throws error if delegation is not allowed
   */
  validateDelegationContract(contract: DelegationContract): void {
    const enforcement = this.enforceTLPClassification(contract);
    
    if (!enforcement.allowed) {
      throw new Error(`TLP Enforcement Violation: ${enforcement.reason}`);
    }
  }

  /**
   * Check if delegation is allowed based on TLP classifications
   * Lightweight method for testing - returns boolean result
   */
  canDelegate(params: {
    delegator_tlp: TLPLevel;
    delegatee_tlp: TLPLevel;
    task_tlp?: TLPLevel;
    work_tlp?: TLPLevel;
  }): { allowed: boolean; reason: string; violations?: string[] } {
    const taskTLP = params.work_tlp || params.task_tlp || params.delegator_tlp;
    
    // TLP:CLEAR can delegate to anyone
    if (taskTLP === 'TLP:CLEAR') {
      return { allowed: true, reason: 'TLP:CLEAR allows all delegations' };
    }
    
    // Check if delegatee has sufficient clearance
    const delegateeTLP = params.delegatee_tlp;
    const taskLevel = TLP_HIERARCHY[taskTLP];
    const delegateeLevel = TLP_HIERARCHY[delegateeTLP];
    
    // Delegatee must have same or higher clearance
    if (delegateeLevel >= taskLevel) {
      return {
        allowed: true,
        reason: `Delegatee clearance ${delegateeTLP} sufficient for ${taskTLP} task`,
      };
    }
    
    return {
      allowed: false,
      reason: `Delegatee clearance ${delegateeTLP} insufficient for ${taskTLP} task`,
      violations: [`TLP classification violation: ${taskTLP} work cannot be delegated to ${delegateeTLP} agent`],
    };
  }
}

// Export singleton instance for global use
export const tlpEnforcement = new TLPEnforcementEngine();
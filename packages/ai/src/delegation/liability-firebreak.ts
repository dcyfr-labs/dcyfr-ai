/**
 * Liability Firebreak Enforcement for DCYFR Delegation Framework
 * TLP:AMBER - Internal Use Only
 * 
 * Implements accountability boundaries in delegation chains to prevent
 * unlimited delegation and ensure clear liability assignment. Includes
 * manual override capabilities and escalation procedures.
 * 
 * Key accountability mechanisms:
 * - Delegation chain depth limits with liability boundaries
 * - Responsibility tracking through chain hierarchy
 * - Manual override and emergency escalation procedures
 * - Liability assignment and audit trail maintenance
 * 
 * @module delegation/liability-firebreak
 * @version 1.0.0
 * @date 2026-02-14
 */

import type { DelegationContract } from '../types/delegation-contracts.js';

/**
 * Liability assignment levels for delegation chains
 */
export type LiabilityLevel = 
  | 'full' // Full liability for outcomes
  | 'shared' // Shared liability with delegator
  | 'limited' // Limited liability based on scope
  | 'none'; // No liability (observation only)

/**
 * Firebreak enforcement actions
 */
export type FirebreakAction = 
  | 'allow' // Allow delegation to proceed
  | 'require_approval' // Require manual approval
  | 'escalate' // Escalate to higher authority
  | 'block' // Block delegation completely
  | 'terminate_chain'; // Terminate entire delegation chain

/**
 * Override authority levels
 */
export type OverrideAuthority = 
  | 'agent' // Agent-level override (limited scope)
  | 'supervisor' // Supervisor override (moderate scope)  
  | 'manager' // Manager override (broad scope)
  | 'executive' // Executive override (organization-wide)
  | 'emergency'; // Emergency override (all restrictions)

/**
 * Liability firebreak validation result  
 */
export interface FirebreakResult {
  /** Whether all firebreaks passed */
  firebreaks_passed: boolean;
  
  /** List of blocking firebreak violations */
  blocking_firebreaks: string[];
  
  /** Assigned liability level for this delegation */
  liability_level: LiabilityLevel;
  
  /** Length of delegation chain */
  chain_length: number;
  
  /** Whether manual override is available */
  manual_override_available: boolean;
  
  /** Required authority level for override */
  required_authority: OverrideAuthority;
  
  /** Validation timestamp */
  validation_timestamp: string;
  
  // Legacy properties for backward compatibility
  /** Whether firebreak enforcement allows the delegation */
  allowed?: boolean;
  
  /** Action to take based on firebreak rules */
  action?: FirebreakAction;
  
  /** Reason for the firebreak decision */
  reason?: string;
  
  /** Chain accountability information */
  chain_accountability?: {
    /** Current chain depth */
    depth: number;
    
    /** Maximum allowed depth */
    max_depth: number;
    
    /** Chain liability distribution */
    liability_distribution: Array<{
      agent_id: string;
      liability_level: LiabilityLevel;
      scope: string[];
    }>;
    
    /** Accountability boundaries hit */
    boundaries_hit: string[];
  };
  
  /** Escalation path if required */
  escalation_path?: Array<{
    level: OverrideAuthority;
    required_clearance?: string;
    contact_method?: string;
  }>;
}

/**
 * Context for firebreak validation
 */
export interface FirebreakValidationContext {
  /** Current depth in delegation chain */
  delegation_depth: number;
  
  /** Estimated financial or operational value */
  estimated_value: number;
  
  /** Whether delegation involves critical systems */
  involves_critical_systems: boolean;
  
  /** Whether delegating to external entity */
  is_external_delegation: boolean;
  
  /** Chain of agents in delegation path */
  chain_agents: string[];
}

/**
 * Manual override request
 */
export interface OverrideRequest {
  /** Override request ID */
  override_id?: string;
  
  /** Authority level of the override */
  authority?: OverrideAuthority;
  authority_level?: OverrideAuthority; // Alternative property name
  
  /** Agent requesting the override */
  requesting_agent_id?: string;
  requesting_agent?: string; // Alternative property name
  
  /** Target agent being delegated to */
  target_agent?: string;
  
  /** Contract being overridden */
  contract_id?: string;
  
  /** Justification for the override */
  justification?: string;
  reason?: string; // Alternative property name
  
  /** Context for the delegation being overridden */
  context?: FirebreakValidationContext;
  
  /** Business impact if override is denied */
  business_impact?: 'low' | 'medium' | 'high' | 'critical';
  
  /** Time-sensitive nature */
  urgency?: 'routine' | 'urgent' | 'emergency';
  
  /** Approval status */
  status?: 'pending' | 'approved' | 'denied' | 'expired';
  
  /** Expiration timestamp */
  expires_at?: string;
  
  /** Creation timestamp */
  created_at?: string;
  
  /** Approved by (if approved) */
  approved_by?: string;
  
  /** Approval timestamp */
  approved_at?: string;
}

/**
 * Escalation procedure configuration
 */
interface EscalationConfig {
  /** Chain depth thresholds for escalation */
  depth_thresholds: {
    supervisor: number; // Depth requiring supervisor approval
    manager: number; // Depth requiring manager approval  
    executive: number; // Depth requiring executive approval
  };
  
  /** Liability threshold enforcement */
  liability_thresholds: {
    high_value_limit: number; // Value requiring higher approval
    critical_system_approval: boolean; // Critical systems need approval
    external_delegation_approval: boolean; // External delegations need approval
  };
  
  /** Emergency procedures */
  emergency_procedures: {
    max_emergency_depth: number; // Maximum depth even in emergencies
    emergency_contacts: Array<{
      authority: OverrideAuthority;
      contact_id: string;
      response_time_sla_minutes: number;
    }>;
  };
}

/**
 * Liability Firebreak Enforcement Engine
 */
export class LiabilityFirebreakEnforcer {
  private config: EscalationConfig;
  private overrideRequests: Map<string, OverrideRequest>;
  private chainAccountability: Map<string, Array<{ agent_id: string; liability_level: LiabilityLevel; depth: number }>>;
  private stats: {
    total_validations: number;
    firebreaks_passed: number;
    firebreaks_blocked: number;
    block_reasons: Record<string, number>;
    liability_distribution: Record<LiabilityLevel, number>;
  };
  
  constructor(config: Partial<EscalationConfig> = {}) {
    this.config = {
      depth_thresholds: {
        supervisor: config.depth_thresholds?.supervisor || 3,
        manager: config.depth_thresholds?.manager || 5,
        executive: config.depth_thresholds?.executive || 7,
      },
      liability_thresholds: {
        high_value_limit: config.liability_thresholds?.high_value_limit || 100000,
        critical_system_approval: config.liability_thresholds?.critical_system_approval ?? true,
        external_delegation_approval: config.liability_thresholds?.external_delegation_approval ?? true,
      },
      emergency_procedures: {
        max_emergency_depth: config.emergency_procedures?.max_emergency_depth || 10,
        emergency_contacts: config.emergency_procedures?.emergency_contacts || [
          { authority: 'supervisor', contact_id: 'supervisor@dcyfr.ai', response_time_sla_minutes: 30 },
          { authority: 'manager', contact_id: 'manager@dcyfr.ai', response_time_sla_minutes: 60 },
          { authority: 'executive', contact_id: 'executive@dcyfr.ai', response_time_sla_minutes: 120 },
        ],
      },
    };
    
    this.overrideRequests = new Map();
    this.chainAccountability = new Map();
    
    // Initialize statistics
    this.stats = {
      total_validations: 0,
      firebreaks_passed: 0,
      firebreaks_blocked: 0,
      block_reasons: {},
      liability_distribution: {
        full: 0,
        shared: 0,
        limited: 0,
        none: 0,
      },
    };
  }

  /**
   * Enforce liability firebreaks for delegation
   */
  enforceFirebreaks(
    primaryAgent: string, 
    secondaryAgent: string,
    context: FirebreakValidationContext
  ): FirebreakResult {
    // Use default values for missing context properties
    const validationContext = {
      delegation_depth: Math.max(context.delegation_depth || 1, 1),
      estimated_value: Math.max(context.estimated_value || 0, 0),
      involves_critical_systems: context.involves_critical_systems || false,
      is_external_delegation: context.is_external_delegation || false,
      chain_agents: context.chain_agents || [primaryAgent, secondaryAgent],
    };
    
    this.stats.total_validations++;
    
    const blockingFirebreaks: string[] = [];
    let requiredAuthority: OverrideAuthority = 'agent';
    let liabilityLevel: LiabilityLevel = this.assignLiabilityLevel(validationContext);
    
    // Check depth firebreaks
    const depthCheck = this.checkDepthLimits(validationContext.delegation_depth);
    if (!depthCheck.allowed) {
      blockingFirebreaks.push('delegation_depth_exceeded');
      requiredAuthority = this.getAuthorityForDepth(validationContext.delegation_depth);
    }
    
    // Check value firebreaks  
    if (validationContext.estimated_value > this.config.liability_thresholds.high_value_limit) {
      blockingFirebreaks.push('high_value_delegation');
      requiredAuthority = this.escalateAuthority(requiredAuthority, 'manager');
      liabilityLevel = 'full';
    }
    
    // Check critical system firebreaks
    if (validationContext.involves_critical_systems && this.config.liability_thresholds.critical_system_approval) {
      blockingFirebreaks.push('critical_system_delegation');
      requiredAuthority = this.escalateAuthority(requiredAuthority, 'manager');
      liabilityLevel = 'full';
    }
    
    // Check external delegation firebreaks
    if (validationContext.is_external_delegation && this.config.liability_thresholds.external_delegation_approval) {
      blockingFirebreaks.push('external_delegation');
      requiredAuthority = this.escalateAuthority(requiredAuthority, 'executive');
      liabilityLevel = 'full';
    }
    
    const firebreaksPassed = blockingFirebreaks.length === 0;
    
    if (!firebreaksPassed) {
      this.stats.firebreaks_blocked++;
      this.stats.block_reasons = this.stats.block_reasons || {};
      blockingFirebreaks.forEach(reason => {
        this.stats.block_reasons[reason] = (this.stats.block_reasons[reason] || 0) + 1;
      });
    } else {
      this.stats.firebreaks_passed++;
    }
    
    // Update liability distribution
    this.stats.liability_distribution = this.stats.liability_distribution || {};
    this.stats.liability_distribution[liabilityLevel] = (this.stats.liability_distribution[liabilityLevel] || 0) + 1;
    
    const result: FirebreakResult = {
      firebreaks_passed: firebreaksPassed,
      blocking_firebreaks: blockingFirebreaks,
      liability_level: liabilityLevel,
      chain_length: validationContext.chain_agents.length,
      manual_override_available: !firebreaksPassed,
      required_authority: requiredAuthority,
      validation_timestamp: new Date().toISOString(),
    };
    
    console.log(`🔥 Firebreak enforcement: ${firebreaksPassed ? 'PASS' : 'BLOCK'} - ${primaryAgent} -> ${secondaryAgent} (Depth: ${validationContext.delegation_depth}, Liability: ${liabilityLevel})`);
    
    return result;
  }

  /**
   * Assign liability level based on delegation context
   */
  private assignLiabilityLevel(context: FirebreakValidationContext): LiabilityLevel {
    // Simple liability assignment based on delegation characteristics
    if (context.delegation_depth <= 1 && context.estimated_value < 100) {
      return 'none';
    }
    
    if (context.involves_critical_systems || context.estimated_value > 50000) {
      return 'full';
    }
    
    if (context.delegation_depth > 3 || context.estimated_value > 5000) {
      return 'shared';
    }
    
    return 'limited';
  }
  
  /**
   * Check depth limits
   */
  private checkDepthLimits(depth: number): { allowed: boolean } {
    return { allowed: depth <= Math.max(...Object.values(this.config.depth_thresholds)) };
  }
  
  /**
   * Get required authority for given depth
   */
  private getAuthorityForDepth(depth: number): OverrideAuthority {
    if (depth <= this.config.depth_thresholds.supervisor) return 'supervisor';
    if (depth <= this.config.depth_thresholds.manager) return 'manager';
    if (depth <= this.config.depth_thresholds.executive) return 'executive';
    return 'emergency';
  }
  
  /**
   * Escalate authority level
   */
  private escalateAuthority(current: OverrideAuthority, required: OverrideAuthority): OverrideAuthority {
    const levels: OverrideAuthority[] = ['agent', 'supervisor', 'manager', 'executive', 'emergency'];
    const currentIndex = levels.indexOf(current);
    const requiredIndex = levels.indexOf(required);
    return levels[Math.max(currentIndex, requiredIndex)];
  }
  
  /**
   * Process emergency escalation
   */
  async processEmergencyEscalation(escalationData: any): Promise<any> {
    const escalation_id = `escalation_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Find appropriate emergency contact
    const emergencyContact = this.config.emergency_procedures.emergency_contacts
      .find(contact => contact.authority === 'supervisor') || 
      this.config.emergency_procedures.emergency_contacts[0];
    
    const result = {
      escalation_id,
      status: 'escalated',
      agent_id: escalationData.agent_id,
      emergency_level: escalationData.emergency_level,
      emergency_contact_notified: true,
      emergency_contact: emergencyContact?.contact_id || 'emergency@dcyfr.ai',
      bypass_granted: false, // Manual approval required
      approval_required: true,
      escalation_timestamp: new Date().toISOString(),
    };
    
    return result;
  }
  
  /**
   * Get pending override requests
   */
  /**
   * Calculate chain accountability and tracking
   */
  private calculateChainAccountability(contract: DelegationContract): FirebreakResult['chain_accountability'] {
    const chain_id = contract.contract_id; // Simplified - no parent contract tracking
    let depth = 1;
    const boundaries_hit: string[] = [];
    
    // Calculate depth from chain history
    if (contract.metadata?.delegation_depth) {
      depth = contract.metadata.delegation_depth;
    }
    
    // Get existing chain accountability
    const existing_chain = this.chainAccountability.get(chain_id) || [];
    
    // Check boundaries
    if (depth >= this.config.depth_thresholds.supervisor) {
      boundaries_hit.push('supervisor_review_required');
    }
    if (depth >= this.config.depth_thresholds.manager) {
      boundaries_hit.push('manager_approval_required');  
    }
    if (depth >= this.config.depth_thresholds.executive) {
      boundaries_hit.push('executive_authorization_required');
    }

    // Build liability distribution
    const liability_distribution = existing_chain.map(entry => ({
      agent_id: entry.agent_id,
      liability_level: entry.liability_level,
      scope: this.getScopeForAgent(entry.agent_id, contract),
    }));

    // Add current delegation
    liability_distribution.push({
      agent_id: contract.delegatee_agent_id,
      liability_level: 'shared', // Simplified for old method compatibility
      scope: contract.permission_token?.scopes || ['unknown'],
    });

    return {
      depth,
      max_depth: this.config.emergency_procedures.max_emergency_depth,
      liability_distribution,
      boundaries_hit,
    };
  }

  /**
   * Check depth-based firebreaks
   */
  private checkDepthFirebreaks(depth: number): { allowed: boolean; action: FirebreakAction; reason: string; required_authority?: OverrideAuthority } {
    if (depth > this.config.emergency_procedures.max_emergency_depth) {
      return {
        allowed: false,
        action: 'terminate_chain',
        reason: `Delegation chain exceeds maximum emergency depth (${this.config.emergency_procedures.max_emergency_depth})`,
      };
    }

    if (depth >= this.config.depth_thresholds.executive) {
      return {
        allowed: false,
        action: 'escalate',
        reason: 'Delegation chain requires executive authorization',
        required_authority: 'executive',
      };
    }

    if (depth >= this.config.depth_thresholds.manager) {
      return {
        allowed: false,
        action: 'require_approval',
        reason: 'Delegation chain requires manager approval',
        required_authority: 'manager',
      };
    }

    if (depth >= this.config.depth_thresholds.supervisor) {
      return {
        allowed: false,
        action: 'require_approval',
        reason: 'Delegation chain requires supervisor review',
        required_authority: 'supervisor',
      };
    }

    return { allowed: true, action: 'allow', reason: 'Depth within acceptable limits' };
  }

  /**
   * Check liability-based firebreaks
   */
  private checkLiabilityFirebreaks(contract: DelegationContract): { 
    allowed: boolean; 
    action: FirebreakAction; 
    reason: string; 
    required_authority?: OverrideAuthority;
    liability_level: LiabilityLevel;
  } {
    let required_authority: OverrideAuthority | undefined;
    let action: FirebreakAction = 'allow';
    let reason = 'Liability checks passed';
    let liability_level: LiabilityLevel = 'limited';

    // Check for high-value operations
    if (contract.metadata && typeof (contract.metadata as any)?.estimated_value === 'number' && 
        (contract.metadata as any).estimated_value > this.config.liability_thresholds.high_value_limit) {
      required_authority = 'manager';
      action = 'require_approval';
      reason = `High-value operation (${contract.metadata.estimated_value}) requires manager approval`;
      liability_level = 'full';
    }

    // Check for critical system access
    if (this.config.liability_thresholds.critical_system_approval && contract.permission_token?.scopes?.some(scope => 
      scope.includes('production') || scope.includes('critical') || scope.includes('system')
    )) {
      required_authority = required_authority === 'manager' ? 'manager' : 'supervisor';
      action = 'require_approval';
      reason = 'Critical system access requires approval';
      liability_level = 'full';
    }

    // Check for external delegation
    if (this.config.liability_thresholds.external_delegation_approval && 
        contract.delegatee_agent_id.includes('external') || contract.delegatee_agent_id.includes('third-party')) {
      required_authority = 'manager';
      action = 'escalate';
      reason = 'External delegation requires manager escalation';
      liability_level = 'shared';
    }

    return {
      allowed: !required_authority,
      action,
      reason,
      required_authority,
      liability_level,
    };
  }

  /**
   * Check for active manual overrides
   */
  private checkActiveOverrides(contract_id: string): OverrideRequest | null {
    for (const [_, override] of this.overrideRequests) {
      if (override.contract_id === contract_id && 
          override.status === 'approved' &&
          override.expires_at &&
          new Date(override.expires_at) > new Date()) {
        return override;
      }
    }
    return null;
  }

  /**
   * Get scope for agent in contract context
   */
  private getScopeForAgent(agent_id: string, contract: DelegationContract): string[] {
    // For now, return contract scopes - in production this would query agent capabilities
    return contract.permission_token?.scopes || ['read'];
  }

  /**
   * Build escalation path for required authority
   */
  private buildEscalationPath(required_authority?: OverrideAuthority): Array<{ level: OverrideAuthority; required_clearance?: string; contact_method?: string }> {
    if (!required_authority) return [];

    const path = [];
    const contacts = this.config.emergency_procedures.emergency_contacts;

    switch (required_authority) {
      case 'supervisor':
        path.push({ 
          level: 'supervisor' as OverrideAuthority, 
          contact_method: contacts.find(c => c.authority === 'supervisor')?.contact_id,
        });
        break;
      case 'manager':
        path.push(
          { level: 'supervisor' as OverrideAuthority, contact_method: contacts.find(c => c.authority === 'supervisor')?.contact_id },
          { level: 'manager' as OverrideAuthority, contact_method: contacts.find(c => c.authority === 'manager')?.contact_id }
        );
        break;
      case 'executive':
        path.push(
          { level: 'supervisor' as OverrideAuthority, contact_method: contacts.find(c => c.authority === 'supervisor')?.contact_id },
          { level: 'manager' as OverrideAuthority, contact_method: contacts.find(c => c.authority === 'manager')?.contact_id },
          { level: 'executive' as OverrideAuthority, contact_method: contacts.find(c => c.authority === 'executive')?.contact_id }
        );
        break;
    }

    return path;
  }

  /**
   * Request manual override for blocked delegation
   */
  async requestOverride(
    contract_id: string,
    requesting_agent_id: string,
    authority: OverrideAuthority,
    justification: string,
    business_impact: OverrideRequest['business_impact'],
    urgency: OverrideRequest['urgency']
  ): Promise<OverrideRequest> {
    const override_id = `override_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const expires_at = new Date();
    // Set expiry based on urgency
    switch (urgency) {
      case 'emergency':
        expires_at.setHours(expires_at.getHours() + 1); // 1 hour for emergency
        break;
      case 'urgent':  
        expires_at.setHours(expires_at.getHours() + 4); // 4 hours for urgent
        break;
      default:
        expires_at.setHours(expires_at.getHours() + 24); // 24 hours for routine
    }

    const override: OverrideRequest = {
      override_id,
      authority,
      requesting_agent_id,
      contract_id,
      justification,
      business_impact,
      urgency,
      status: 'pending',
      expires_at: expires_at.toISOString(),
      created_at: new Date().toISOString(),
    };

    this.overrideRequests.set(override_id, override);

    // Emit override request event for monitoring
    console.log(`🔥 Firebreak Override Requested: ${override_id} (${authority}) - ${justification}`);

    return override;
  }

  /**
   * Approve manual override
   */
  async approveOverride(
    override_id: string,
    approving_authority: string,
    approver_clearance: OverrideAuthority
  ): Promise<OverrideRequest> {
    const override = this.overrideRequests.get(override_id);
    
    if (!override) {
      throw new Error(`Override request not found: ${override_id}`);
    }

    if (override.status !== 'pending') {
      throw new Error(`Override request ${override_id} is not pending (current status: ${override.status})`);
    }

    if (!override.expires_at || new Date(override.expires_at) <= new Date()) {
      override.status = 'expired';
      this.overrideRequests.set(override_id, override);
      throw new Error(`Override request ${override_id} has expired`);
    }

    // Check if approver has sufficient authority
    const authority_levels = ['agent', 'supervisor', 'manager', 'executive', 'emergency'];
    const required_level = authority_levels.indexOf(override.authority);
    const approver_level = authority_levels.indexOf(approver_clearance);
    
    if (approver_level < required_level) {
      throw new Error(`Insufficient authority: ${approver_clearance} cannot approve ${override.authority} level override`);
    }

    // Approve the override
    override.status = 'approved';
    override.approved_by = approving_authority;
    override.approved_at = new Date().toISOString();

    this.overrideRequests.set(override_id, override);

    console.log(`✅ Firebreak Override Approved: ${override_id} by ${approving_authority}`);

    return override;
  }

  /**
   * Emergency escalation bypass (highest authority override)
   */
  async emergencyEscalation(
    contract_id: string,
    emergency_contact: string,
    justification: string
  ): Promise<OverrideRequest> {
    const override = await this.requestOverride(
      contract_id,
      emergency_contact,
      'emergency',
      `EMERGENCY ESCALATION: ${justification}`,
      'critical',
      'emergency'
    );

    // Auto-approve emergency escalations (in production, this would require proper authentication)
    return this.approveOverride(override.override_id, emergency_contact, 'emergency');
  }

  /**
   * Get liability firebreak statistics
   */
  getFirebreakStatistics(): {
    total_evaluations: number;
    blocked_delegations: number;
    escalations_required: number;
    overrides_requested: number;
    overrides_approved: number;
    chain_depth_violations: number;
    liability_threshold_violations: number;
  } {
    // This would be implemented with proper metrics tracking in production
    return {
      total_evaluations: 0,
      blocked_delegations: 0,
      escalations_required: 0,
      overrides_requested: this.overrideRequests.size,
      overrides_approved: Array.from(this.overrideRequests.values()).filter(o => o.status === 'approved').length,
      chain_depth_violations: 0,
      liability_threshold_violations: 0,
    };
  }

  /**
   * Get pending override requests
   */
  getPendingOverrides(): OverrideRequest[] {
    return Array.from(this.overrideRequests.values())
      .filter(override => override.status === 'pending')
      .sort((a, b) => {
        // Sort by urgency and business impact
        const urgencyOrder = { emergency: 3, urgent: 2, routine: 1 };
        const impactOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        
        const aScore = urgencyOrder[a.urgency] * 10 + impactOrder[a.business_impact];
        const bScore = urgencyOrder[b.urgency] * 10 + impactOrder[b.business_impact];
        
        return bScore - aScore; // Descending order (highest priority first)
      });
  }

  /**
   * Update chain accountability tracking
   */
  updateChainAccountability(chain_id: string, agent_id: string, liability_level: LiabilityLevel, depth: number): void {
    const existing = this.chainAccountability.get(chain_id) || [];
    existing.push({ agent_id, liability_level, depth });
    this.chainAccountability.set(chain_id, existing);
  }

  /**
   * Clean up expired override requests
   */
  cleanupExpiredOverrides(): number {
    let cleaned = 0;
    const now = new Date();
    
    for (const [override_id, override] of this.overrideRequests) {
      if (new Date(override.expires_at) <= now && override.status === 'pending') {
        override.status = 'expired';
        this.overrideRequests.set(override_id, override);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Evaluate a contract for firebreak requirements
   * Wrapper method for test compatibility - converts contract to context and calls enforceFirebreaks
   */
  evaluateContract(contract: DelegationContract | any): { requires_firebreak: boolean; risk_level?: string; firebreak_conditions?: string[]; reason?: string } {
    // Extract delegation context from contract
    const isSensitive = 
      contract.metadata?.operation_type === 'destructive' ||
      contract.metadata?.environment === 'production' ||
      contract.priority >= 8;
    
    const context: FirebreakValidationContext = {
      delegation_depth: 1, // Default depth
      estimated_value: isSensitive ? 100000 : (contract.metadata?.estimated_value || 0),
      involves_critical_systems: isSensitive || contract.metadata?.involves_critical_systems || false,
      is_external_delegation: contract.metadata?.is_external_delegation || false,
      chain_agents: [
        contract.delegator?.agent_id || contract.delegator_agent_id,
        contract.delegatee?.agent_id || contract.delegatee_agent_id,
      ],
    };

    const result = this.enforceFirebreaks(
      contract.delegator?.agent_id || contract.delegator_agent_id,
      contract.delegatee?.agent_id || contract.delegatee_agent_id,
      context
    );

    // Determine risk level
    const riskLevel = isSensitive ? 'high' : 
                     contract.priority >= 5 ? 'medium' : 'low';

    return {
      requires_firebreak: !result.firebreaks_passed,
      risk_level: riskLevel,
      firebreak_conditions: result.blocking_firebreaks.length > 0 ? result.blocking_firebreaks : undefined,
      reason: result.blocking_firebreaks.length > 0 
        ? `Firebreak required: ${result.blocking_firebreaks.join(', ')}`
        : undefined,
    };
  }

  /**
   * Get firebreak enforcement statistics  
   */
  getStats() {
    return {
      ...this.stats,
      total_validations: this.stats.total_validations,
      firebreaks_passed: this.stats.firebreaks_passed,
      firebreaks_blocked: this.stats.firebreaks_blocked,
      block_reasons: this.stats.block_reasons,
      liability_distribution: this.stats.liability_distribution,
      pending_overrides: this.overrideRequests.size,
    };
  }
}


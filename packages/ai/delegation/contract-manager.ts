/**
 * Delegation Contract Manager
 * TLP:CLEAR
 * 
 * Manages CRUD operations for delegation contracts with status tracking,
 * validation, and telemetry integration.
 * 
 * @module delegation/contract-manager
 * @version 1.0.0
 * @date 2026-02-13
 */

import { EventEmitter } from 'events';
import type {
  DelegationContract,
  DelegationContractStatus,
  VerificationResult,
} from '../src/types/delegation-contracts.js';
import { TLPEnforcementEngine } from '../src/delegation/tlp-enforcement.js';
import { SecurityThreatValidator } from '../src/delegation/security-threat-model.js';
import type { ThreatDetectionResult } from '../src/delegation/security-threat-model.js';
import { LiabilityFirebreakEnforcer } from '../src/delegation/liability-firebreak.js';
import type { FirebreakResult, OverrideRequest } from '../src/delegation/liability-firebreak.js';

/**
 * Contract manager configuration
 */
export interface ContractManagerConfig {
  /** Whether to enable automatic contract cleanup */
  auto_cleanup?: boolean;
  
  /** Time to retain completed contracts (milliseconds) */
  retention_period_ms?: number;
  
  /** Maximum number of contracts to keep in memory */
  max_contracts?: number;
  
  /** Enable telemetry integration */
  enable_telemetry?: boolean;
  
  /** Enable TLP classification enforcement */
  enable_tlp_enforcement?: boolean;
}

/**
 * Contract query filters
 */
export interface ContractQuery {
  /** Filter by contract IDs */
  contract_ids?: string[];
  
  /** Filter by task ID */
  task_id?: string;
  
  /** Filter by delegator agent */
  delegator_agent_id?: string;
  
  /** Filter by delegatee agent */
  delegatee_agent_id?: string;
  
  /** Filter by contract status */
  status?: DelegationContractStatus | DelegationContractStatus[];
  
  /** Filter by parent contract ID (for chain tracking) */
  parent_contract_id?: string;
  
  /** Filter by TLP classification */
  tlp_classification?: string;
  
  /** Filter by creation time range */
  created_after?: string;
  created_before?: string;
  
  /** Limit number of results */
  limit?: number;
  
  /** Sort by field */
  sort_by?: 'created_at' | 'priority' | 'timeout_ms';
  
  /** Sort order */
  sort_order?: 'asc' | 'desc';
}

/**
 * Contract update data
 */
export interface ContractUpdate {
  /** Update contract status */
  status?: DelegationContractStatus;
  
  /** Update verification result */
  verification_result?: VerificationResult;
  
  /** Update metadata */
  metadata?: Record<string, unknown>;
  
  /** Update completion timestamp */
  completed_at?: string;
  
  /** Update activation timestamp */
  activated_at?: string;
}

/**
 * Delegation Contract Manager
 * 
 * Provides comprehensive contract lifecycle management including creation,
 * updates, queries, and validation. Integrates with telemetry system for
 * monitoring and provides event-driven notifications.
 */
export class ContractManager extends EventEmitter {
  private contracts: Map<string, DelegationContract>;
  private config: Required<ContractManagerConfig>;
  private tlpEnforcement: TLPEnforcementEngine;
  private threatValidator: SecurityThreatValidator;
  private firebreakEnforcer: LiabilityFirebreakEnforcer;
  
  constructor(config: ContractManagerConfig = {}) {
    super();
    
    this.config = {
      auto_cleanup: config.auto_cleanup ?? false,
      retention_period_ms: config.retention_period_ms ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      max_contracts: config.max_contracts ?? 10000,
      enable_telemetry: config.enable_telemetry ?? true,
      enable_tlp_enforcement: config.enable_tlp_enforcement ?? true,
    };
    
    // Initialize TLP enforcement engine
    this.tlpEnforcement = new TLPEnforcementEngine();
    
    // Initialize security threat validator
    this.threatValidator = new SecurityThreatValidator({
      max_chain_depth: 5,
      max_contracts_per_hour: 50,
      reputation_gaming_threshold: 0.1,
      anomaly_detection_window_hours: 24,
      permission_escalation_detection: true,
    });
    
    // Initialize liability firebreak enforcer
    this.firebreakEnforcer = new LiabilityFirebreakEnforcer({
      depth_thresholds: {
        supervisor: 3,
        manager: 5,
        executive: 7,
      },
      liability_thresholds: {
        high_value_limit: 100000,
        critical_system_approval: true,
        external_delegation_approval: true,
      },
      emergency_procedures: {
        max_emergency_depth: 10,
        emergency_contacts: [
          { authority: 'supervisor', contact_id: 'supervisor@dcyfr.ai', response_time_sla_minutes: 30 },
          { authority: 'manager', contact_id: 'manager@dcyfr.ai', response_time_sla_minutes: 60 },
          { authority: 'executive', contact_id: 'executive@dcyfr.ai', response_time_sla_minutes: 120 },
        ],
      },
    });
    
    this.contracts = new Map();
    
    // Set up automatic cleanup if enabled
    if (this.config.auto_cleanup) {
      this.scheduleCleanup();
    }
  }
  
  /**
   * Create a new delegation contract
   */
  async createContract(
    partialContract: Omit<DelegationContract, 'created_at' | 'status'> | DelegationContract
  ): Promise<DelegationContract> {
    // Generate contract ID if not provided
    const contract_id = (partialContract as any).contract_id || `contract_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Build complete contract
    const contract: DelegationContract = {
      ...partialContract,
      contract_id,
      created_at: (partialContract as any).created_at || new Date().toISOString(),
      status: (partialContract as any).status || 'pending',
    } as DelegationContract;
    
    // Validate contract (includes TLP enforcement and security threat detection)
    await this.validateContract(contract);
    
    // Check capacity
    if (this.contracts.size >= this.config.max_contracts) {
      throw new Error(
        `Contract manager at capacity: ${this.config.max_contracts} contracts`
      );
    }
    
    // Store contract
    this.contracts.set(contract_id, contract);
    
    // Emit events
    this.emit('contract:created', contract);
    
    if (this.config.enable_telemetry) {
      this.emit('telemetry:contract_created', {
        contract_id,
        task_id: contract.task_id,
        delegator: contract.delegator.agent_id,
        delegatee: contract.delegatee.agent_id,
        tlp: contract.tlp_classification,
        verification_policy: contract.verification_policy,
        timestamp: contract.created_at,
      });
    }
    
    return contract;
  }
  
  /**
   * Get a contract by ID
   */
  getContract(contract_id: string): DelegationContract | undefined {
    return this.contracts.get(contract_id);
  }
  
  /**
   * Query contracts with filters
   */
  queryContracts(query: ContractQuery = {}): DelegationContract[] {
    let results = Array.from(this.contracts.values());
    
    // Apply filters
    if (query.contract_ids) {
      const idSet = new Set(query.contract_ids);
      results = results.filter((c) => idSet.has(c.contract_id));
    }
    
    if (query.task_id) {
      results = results.filter((c) => c.task_id === query.task_id);
    }
    
    if (query.delegator_agent_id) {
      results = results.filter((c) => c.delegator.agent_id === query.delegator_agent_id);
    }
    
    if (query.delegatee_agent_id) {
      results = results.filter((c) => c.delegatee.agent_id === query.delegatee_agent_id);
    }
    
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      results = results.filter((c) => statuses.includes(c.status));
    }
    
    if (query.tlp_classification) {
      results = results.filter((c) => c.tlp_classification === query.tlp_classification);
    }
    
    if (query.parent_contract_id) {
      results = results.filter((c) => c.metadata?.parent_contract_id === query.parent_contract_id);
    }
    
    if (query.created_after) {
      results = results.filter((c) => c.created_at >= query.created_after!);
    }
    
    if (query.created_before) {
      results = results.filter((c) => c.created_at <= query.created_before!);
    }
    
    // Apply sorting
    if (query.sort_by) {
      const sortOrder = query.sort_order === 'desc' ? -1 : 1;
      
      results.sort((a, b) => {
        const field = query.sort_by!;
        const aVal = field === 'created_at' ? a.created_at : 
                    (a.timeout_ms ?? Infinity);
        const bVal = field === 'created_at' ? b.created_at :
                    (b.timeout_ms ?? Infinity);
        
        return aVal < bVal ? -sortOrder : aVal > bVal ? sortOrder : 0;
      });
    }
    
    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }
  
  /**
   * Update a contract
   */
  async updateContract(
    contract_id: string,
    update: ContractUpdate
  ): Promise<DelegationContract> {
    const contract = this.contracts.get(contract_id);
    
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    // Apply updates
    if (update.status) {
      contract.status = update.status;
    }
    
    if (update.verification_result) {
      contract.verification_result = update.verification_result;
    }
    
    if (update.completed_at) {
      contract.completed_at = update.completed_at;
    }
    
    if (update.activated_at) {
      contract.activated_at = update.activated_at;
    }
    
    if (update.metadata) {
      contract.metadata = { ...contract.metadata, ...update.metadata };
    }
    
    // Update stored contract
    this.contracts.set(contract_id, contract);
    
    // Emit events
    this.emit('contract:updated', contract);
    
    if (this.config.enable_telemetry) {
      this.emit('telemetry:contract_updated', {
        contract_id,
        status: contract.status,
        update_type: Object.keys(update),
        timestamp: new Date().toISOString(),
      });
    }
    
    return contract;
  }
  
  /**
   * Update contract status
   */
  async updateStatus(
    contract_id: string,
    status: DelegationContractStatus
  ): Promise<DelegationContract> {
    return this.updateContract(contract_id, { status });
  }
  
  /**
   * Mark contract as completed
   */
  async completeContract(
    contract_id: string,
    result: unknown,
    verification?: VerificationResult
  ): Promise<DelegationContract> {
    const contract = this.contracts.get(contract_id);
    
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    const completed_at = new Date().toISOString();
    const verification_result = verification ? {
      ...verification,
      verified_at: completed_at,
      verified: true,
    } : undefined;
    
    return this.updateContract(contract_id, {
      status: 'completed',
      completed_at,
      verification_result,
    });
  }
  
  /**
   * Mark contract as failed
   */
  async failContract(
    contract_id: string,
    error: { error_type: string; error_message: string; error_details?: Record<string, unknown> }
  ): Promise<DelegationContract> {
    const contract = this.contracts.get(contract_id);
    
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    const completed_at = new Date().toISOString();
    const verification_result: VerificationResult = {
      verified: false,
      verified_at: completed_at,
      verified_by: 'system',
      verification_method: 'direct_inspection',
      findings: [error.error_message],
      verification_details: JSON.stringify({
        error_type: error.error_type,
        error_details: error.error_details,
      }),
    };
    
    return this.updateContract(contract_id, {
      status: 'failed',
      completed_at,
      verification_result,
    });
  }
  
  /**
   * Delete a contract
   */
  async deleteContract(contract_id: string): Promise<boolean> {
    const deleted = this.contracts.delete(contract_id);
    
    if (deleted) {
      this.emit('contract:deleted', { contract_id });
      
      if (this.config.enable_telemetry) {
        this.emit('telemetry:contract_deleted', {
          contract_id,
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    return deleted;
  }
  
  /**
   * Get contract statistics
   */
  getStats(): {
    total: number;
    by_status: Record<DelegationContractStatus, number>;
    by_tlp: Record<string, number>;
    memory_usage_bytes: number;
  } {
    const stats = {
      total: this.contracts.size,
      by_status: {} as Record<DelegationContractStatus, number>,
      by_tlp: {} as Record<string, number>,
      memory_usage_bytes: 0,
    };
    
    // Count by status and TLP
    for (const contract of this.contracts.values()) {
      // Status counts
      stats.by_status[contract.status] = (stats.by_status[contract.status] || 0) + 1;
      
      // TLP counts
      const tlp = contract.tlp_classification || 'unknown';
      stats.by_tlp[tlp] = (stats.by_tlp[tlp] || 0) + 1;
      
      // Rough memory estimate
      stats.memory_usage_bytes += JSON.stringify(contract).length;
    }
    
    return stats;
  }
  
  /**
   * Clean up old completed contracts
   */
  cleanup(): number {
    const cutoffTime = Date.now() - this.config.retention_period_ms;
    const cutoffDate = new Date(cutoffTime).toISOString();
    
    let deletedCount = 0;
    
    for (const [contract_id, contract] of this.contracts.entries()) {
      // Only clean up completed or failed contracts
      if ((contract.status === 'completed' || contract.status === 'failed') &&
          contract.completed_at &&
          contract.completed_at < cutoffDate) {
        this.contracts.delete(contract_id);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      this.emit('contracts:cleaned', { deleted_count: deletedCount });
    }
    
    return deletedCount;
  }
  
  /**
   * Validate contract data including TLP classification enforcement and security threat detection
   */
  private async validateContract(contract: DelegationContract): Promise<void> {
    // Required fields
    if (!contract.task_id) {
      throw new Error('Contract must have task_id');
    }
    
    if (!contract.delegator || !contract.delegator.agent_id) {
      throw new Error('Contract must have delegator with valid agent_id');
    }
    
    if (!contract.delegatee || !contract.delegatee.agent_id) {
      throw new Error('Contract must have delegatee with valid agent_id');
    }
    
    if (!contract.verification_policy) {
      throw new Error('Contract must have verification_policy');
    }
    
    if (!contract.success_criteria) {
      throw new Error('Contract must have success_criteria');
    }
    
    // Validate timeout
    if (contract.timeout_ms !== undefined && contract.timeout_ms <= 0) {
      throw new Error('Contract timeout_ms must be positive');
    }
    
    // Security Threat Model Validation (Task 6.2)
    const threatResult = await this.threatValidator.validateDelegationSecurity(contract);
    
    if (threatResult.threat_detected) {
      // Emit security threat event for monitoring
      this.emit('security_threat_detected', {
        contract_id: contract.contract_id,
        threat_type: threatResult.threat_type,
        severity: threatResult.severity,
        action: threatResult.action,
        description: threatResult.description,
        evidence: threatResult.evidence,
        confidence: threatResult.confidence,
        timestamp: new Date().toISOString()
      });
      
      // Take appropriate action based on threat level
      switch (threatResult.action) {
        case 'block':
          throw new Error(
            `Security threat detected: ${threatResult.description} ` +
            `(${threatResult.threat_type}, ${threatResult.severity})`
          );
        
        case 'terminate_chain':
          // For delegation chains, terminate the entire chain
          throw new Error(
            `Critical security threat requiring chain termination: ${threatResult.description} ` +
            `(${threatResult.threat_type}, ${threatResult.severity})`
          );
        
        case 'escalate':
          // Log as high priority but allow contract creation with monitoring
          console.error(
            `⚠️  Security threat requires escalation: ${threatResult.description} ` +
            `(Contract: ${contract.contract_id})`
          );
          break;
        
        case 'warn':
          // Log warning but allow contract creation
          console.warn(
            `⚠️  Security threat warning: ${threatResult.description} ` +
            `(Contract: ${contract.contract_id})`
          );
          break;
        
        case 'allow':
        default:
          // Threat detected but action is to allow - just log
          console.info(
            `ℹ️  Security threat noted but allowed: ${threatResult.description} ` +
            `(Contract: ${contract.contract_id})`
          );
          break;
      }
    }
    
    // TLP Classification Enforcement (Task 6.1)
    if (this.config.enable_tlp_enforcement) {
      const tlpResult = this.tlpEnforcement.enforceTLPClassification(contract);
      
      if (!tlpResult.allowed) {
        throw new Error(
          `TLP enforcement violation: ${tlpResult.reason}. ` +
          `Required clearance: ${tlpResult.required_clearance}, ` +
          `Agent clearance: ${tlpResult.agent_clearance || 'none'}`
        );
      }
      
      // Emit TLP validation event for monitoring
      this.emit('tlp_validation', {
        contract_id: contract.contract_id,
        agent_id: contract.delegatee.agent_id,
        tlp_classification: contract.tlp_classification,
        enforcement_result: tlpResult,
        timestamp: new Date().toISOString()
      });
    }
    
    // Liability Firebreak Enforcement (Task 6.3)
    const firebreakResult = this.firebreakEnforcer.enforceFirebreaks(
      contract.delegator.agent_id,
      contract.delegatee.agent_id, 
      {
        delegation_depth: (contract.metadata?.delegation_depth as number) || 1,
        estimated_value: (contract.metadata?.estimated_value as number) || 0,
        involves_critical_systems: (contract.metadata?.involves_critical_systems as boolean) || false,
        is_external_delegation: (contract.metadata?.is_external_delegation as boolean) || false,
        chain_agents: (contract.metadata?.chain_agents as string[]) || [contract.delegator.agent_id, contract.delegatee.agent_id],
      }
    );
    
    if (!firebreakResult.firebreaks_passed) {
      // Emit firebreak violation event for monitoring  
      this.emit('firebreak_violation', {
        contract_id: contract.contract_id,
        delegator: contract.delegator.agent_id,
        delegatee: contract.delegatee.agent_id,
        blocking_firebreaks: firebreakResult.blocking_firebreaks,
        liability_level: firebreakResult.liability_level,
        manual_override_available: firebreakResult.manual_override_available,
        required_authority: firebreakResult.required_authority,
        timestamp: new Date().toISOString()
      });
      
      throw new Error(
        `Liability firebreak violation: ${firebreakResult.blocking_firebreaks.join(', ')}. ` +
        `Liability level: ${firebreakResult.liability_level}. ` +
        `Manual override available: ${firebreakResult.manual_override_available} ` +
        `(Required authority: ${firebreakResult.required_authority})`
      );
    }
    
    // Log successful firebreak validation
    this.emit('firebreak_validation', {
      contract_id: contract.contract_id,  
      delegator: contract.delegator.agent_id,
      delegatee: contract.delegatee.agent_id,
      liability_level: firebreakResult.liability_level,
      chain_length: firebreakResult.chain_length,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Schedule periodic cleanup
   */
  private scheduleCleanup(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }
  
  /**
   * Get all contracts (for debugging/testing)
   */
  getAllContracts(): DelegationContract[] {
    return Array.from(this.contracts.values());
  }
  
  /**
   * Get contract count
   */
  getContractCount(): number {
    return this.contracts.size;
  }

  /**
   * Get security threat validation statistics
   */
  getSecurityThreatStatistics() {
    return this.threatValidator.getThreatStatistics();
  }

  /**
   * Get recent security threat detections
   */
  getRecentSecurityThreats(limit = 10): ThreatDetectionResult[] {
    return this.threatValidator.getRecentThreats(limit);
  }

  /**
   * Get comprehensive security status including threat statistics and TLP enforcement status
   */
  getSecurityStatus() {
    const threatStats = this.threatValidator.getThreatStatistics();
    const recentThreats = this.threatValidator.getRecentThreats(5);
    
    return {
      tlp_enforcement_enabled: this.config.enable_tlp_enforcement,
      security_threat_validation_enabled: true,
      contract_security_summary: {
        total_contracts: this.contracts.size,
        security_validations_performed: threatStats.total_validations,
        threats_detected: threatStats.threats_detected,
        threat_detection_rate: threatStats.total_validations > 0 
          ? (threatStats.threats_detected / threatStats.total_validations * 100).toFixed(1) + '%'
          : '0%',
        threat_types: threatStats.threat_types,
        severity_distribution: threatStats.severity_distribution,
        action_distribution: threatStats.action_distribution,
      },
      recent_security_events: recentThreats.map(threat => ({
        threat_type: threat.threat_type,
        severity: threat.severity,
        action: threat.action,
        confidence: threat.confidence,
        description: threat.description.substring(0, 100) + (threat.description.length > 100 ? '...' : ''),
      })),
      security_recommendations: this.generateSecurityRecommendations(threatStats, recentThreats),
    };
  }

  /**
   * Generate security recommendations based on threat patterns
   */
  private generateSecurityRecommendations(
    stats: ReturnType<SecurityThreatValidator['getThreatStatistics']>,
    recentThreats: ThreatDetectionResult[]
  ): string[] {
    const recommendations = [];
    
    // High threat detection rate
    if (stats.total_validations > 10 && stats.threats_detected / stats.total_validations > 0.2) {
      recommendations.push('High threat detection rate detected - consider reviewing agent access patterns');
    }
    
    // Permission escalation concerns
    if (stats.threat_types['permission_escalation'] > 0) {
      recommendations.push('Permission escalation attempts detected - review agent privilege assignments');
    }
    
    // Reputation gaming concerns
    if (stats.threat_types['reputation_gaming'] > 0) {
      recommendations.push('Reputation gaming patterns detected - audit agent delegation relationships');
    }
    
    // Abuse pattern concerns
    if (stats.threat_types['abuse_pattern'] > 0) {
      recommendations.push('Delegation abuse patterns detected - consider implementing rate limiting');
    }
    
    // Critical severity threats
    if (stats.severity_distribution['critical'] > 0) {
      recommendations.push('Critical security threats detected - immediate security review recommended');
    }
    
    // Recent escalations
    const recentEscalations = recentThreats.filter(t => t.action === 'escalate').length;
    if (recentEscalations > 2) {
      recommendations.push('Multiple recent security escalations - review security policies');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Security posture appears healthy - continue monitoring');
    }
    
    return recommendations;
  }
  
  /**
   * Request manual override for a blocked contract due to firebreak violations
   */
  async requestFirebreakOverride(overrideRequest: OverrideRequest): Promise<any> {
    const overrideResult = await this.firebreakEnforcer.requestOverride(
      overrideRequest.contract_id || 'unknown_contract',
      overrideRequest.requesting_agent_id || overrideRequest.requesting_agent || 'unknown_agent',
      overrideRequest.authority || overrideRequest.authority_level || 'supervisor',
      overrideRequest.justification || overrideRequest.reason || 'Manual override requested',
      overrideRequest.business_impact || 'medium',
      overrideRequest.urgency || 'routine'
    );
    
    // Emit override request event for monitoring
    this.emit('firebreak_override_requested', {
      override_id: overrideResult.override_id,
      requesting_agent: overrideRequest.requesting_agent,
      required_authority: overrideRequest.authority_level,
      reason: overrideRequest.reason,
      timestamp: new Date().toISOString()
    });
    
    return overrideResult;
  }
  
  /**
   * Process emergency escalation for critical delegation chains
   */
  async processEmergencyEscalation(escalationData: any): Promise<any> {
    const escalationResult = await this.firebreakEnforcer.processEmergencyEscalation(escalationData);
    
    // Emit emergency escalation event for monitoring
    this.emit('emergency_escalation', {
      escalation_id: escalationResult.escalation_id,
      agent_id: escalationData.agent_id,
      emergency_level: escalationData.emergency_level,
      bypass_granted: escalationResult.bypass_granted,
      timestamp: new Date().toISOString()
    });
    
    return escalationResult;
  }
  
  /**
   * Get firebreak enforcement statistics
   */
  getFirebreakStats(): any {
    return this.firebreakEnforcer.getStats();
  }
  
  /**
   * Get pending override requests
   */
  getPendingOverrides(): any[] {
    return this.firebreakEnforcer.getPendingOverrides();
  }
  
  /**
   * Get comprehensive security status including TLP, threats, and firebreaks
   */
  getComprehensiveSecurityStatus() {
    const threatStats = this.threatValidator.getThreatStatistics();
    const recentThreats = this.threatValidator.getRecentThreats(5);
    const firebreakStats = this.firebreakEnforcer.getStats();
    
    return {
      tlp_enforcement_enabled: this.config.enable_tlp_enforcement,
      security_threat_validation_enabled: true,
      liability_firebreak_enforcement_enabled: true,
      contract_security_summary: {
        total_contracts: this.contracts.size,
        security_validations_performed: threatStats.total_validations,
        threats_detected: threatStats.threats_detected,
        firebreaks_blocked: firebreakStats.firebreaks_blocked || 0,
        manual_overrides_pending: firebreakStats.pending_overrides || 0,
        threat_detection_rate: threatStats.total_validations > 0 
          ? (threatStats.threats_detected / threatStats.total_validations * 100).toFixed(1) + '%'
          : '0%',
        firebreak_block_rate: firebreakStats.total_validations > 0
          ? ((firebreakStats.firebreaks_blocked || 0) / firebreakStats.total_validations * 100).toFixed(1) + '%'
          : '0%',
        threat_types: threatStats.threat_types,
        severity_distribution: threatStats.severity_distribution,
        action_distribution: threatStats.action_distribution,
        liability_distribution: firebreakStats.liability_distribution || {},
      },
      recent_security_events: recentThreats.map(threat => ({
        threat_type: threat.threat_type,
        severity: threat.severity,
        action: threat.action,
        confidence: threat.confidence,
        description: threat.description.substring(0, 100) + (threat.description.length > 100 ? '...' : ''),
      })),
      pending_overrides: this.getPendingOverrides(),
      security_recommendations: this.generateSecurityRecommendations(threatStats, recentThreats),
    };
  }

  /**
   * Update contract status (alias for updateStatus for test compatibility)
   */
  async updateContractStatus(
    contract_id: string,
    status: DelegationContractStatus,
    options?: Record<string, unknown>
  ): Promise<DelegationContract> {
    const contract = this.contracts.get(contract_id);
    
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    // Set timestamp fields based on status
    const now = new Date().toISOString();
    const updates: Partial<DelegationContract> = { status };
    
    if (status === 'active') {
      updates.activated_at = now;
    } else if (status === 'completed') {
      updates.completed_at = now;
    } else if (status === 'failed') {
      updates.completed_at = now;
    }
    
    // Merge additional options (like verification_result, etc.)
    if (options) {
      Object.assign(updates, options);
    }
    
    // Apply updates to contract
    const updatedContract = {
      ...contract,
      ...updates,
      updated_at: now,
    };
    
    this.contracts.set(contract_id, updatedContract);
    this.emit('contract:updated', updatedContract);
    
    return updatedContract;
  }

  /**
   * Cancel a contract with a reason
   */
  async cancelContract(
    contract_id: string,
    reason: string
  ): Promise<DelegationContract> {
    const contract = this.contracts.get(contract_id);
    
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    const cancelled_at = new Date().toISOString();
    
    return this.updateContract(contract_id, {
      status: 'failed',
      completed_at: cancelled_at,
      metadata: {
        ...contract.metadata,
        cancellation_reason: reason,
        cancelled_at,
      },
    });
  }

  /**
   * Clear all contracts (for testing)
   */
  async clearAll(): Promise<void> {
    this.contracts.clear();
  }
}

export default ContractManager;

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
} from '../types/delegation-contracts';

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
  
  constructor(config: ContractManagerConfig = {}) {
    super();
    
    this.config = {
      auto_cleanup: config.auto_cleanup ?? false,
      retention_period_ms: config.retention_period_ms ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      max_contracts: config.max_contracts ?? 10000,
      enable_telemetry: config.enable_telemetry ?? true,
    };
    
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
    partialContract: Omit<DelegationContract, 'contract_id' | 'created_at' | 'status'>
  ): Promise<DelegationContract> {
    // Generate contract ID
    const contract_id = `contract_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Build complete contract
    const contract: DelegationContract = {
      ...partialContract,
      contract_id,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    
    // Validate contract
    this.validateContract(contract);
    
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
      results = results.filter((c) => c.parent_contract_id === query.parent_contract_id);
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
      findings: {
        failed_checks: [error.error_message],
      },
      metadata: {
        error_type: error.error_type,
        error_details: error.error_details,
      },
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
   * Validate contract data
   */
  private validateContract(contract: DelegationContract): void {
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
   * Clear all contracts (for testing)
   */
  clearAll(): void {
    this.contracts.clear();
    this.emit('contracts:cleared');
  }
  
  /**
   * Get contract count
   */
  getContractCount(): number {
    return this.contracts.size;
  }
}

export default ContractManager;

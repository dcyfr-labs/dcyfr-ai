/**
 * DCYFR Delegation Contract Manager
 * TLP:CLEAR
 * 
 * Manages delegation contracts with database persistence, event emission,
 * and lifecycle tracking.
 * 
 * @module delegation/contract-manager
 * @version 1.0.0
 * @date 2026-02-15
 */

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import type {
  DelegationContract,
  DelegationAgent,
  VerificationResult,
  DelegationContractStatus,
  SuccessCriteria,
  VerificationPolicy,
} from '../types/delegation-contracts.js';

/**
 * Contract creation request
 */
export interface CreateDelegationContractRequest {
  delegator: DelegationAgent;
  delegatee: DelegationAgent;
  task_id: string;
  task_description: string;
  verification_policy: string;
  success_criteria: SuccessCriteria;
  timeout_ms: number;
  permission_tokens?: Array<{
    token_id: string;
    scopes: string[];
    delegatable?: boolean;
    max_delegation_depth?: number;
  }>;
  parent_contract_id?: string;
  tlp_classification?: string;
}

/**
 * Contract query options
 */
export interface ContractQueryOptions {
  delegator_agent_id?: string;
  delegatee_agent_id?: string;
  task_id?: string;
  status?: DelegationContractStatus | DelegationContractStatus[];
  delegation_depth?: number;
  parent_contract_id?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Contract statistics
 */
export interface ContractStatistics {
  total_contracts: number;
  active_contracts: number;
  completed_contracts: number;
  failed_contracts: number;
  average_completion_time_ms?: number;
  success_rate?: number;
}

/**
 * Configuration for DelegationContractManager
 */
export interface DelegationContractManagerConfig {
  databasePath?: string;
  maxDelegationDepth?: number;
  debug?: boolean;
}

/**
 * DelegationContractManager - Core delegation contract lifecycle management
 */
export class DelegationContractManager extends EventEmitter {
  private db: Database.Database;
  private maxDelegationDepth: number;
  private debug: boolean;

  constructor(config: DelegationContractManagerConfig = {}) {
    super();
    
    this.maxDelegationDepth = config.maxDelegationDepth ?? 5;
    this.debug = config.debug ?? false;
    
    const dbPath = config.databasePath ?? ':memory:';
    this.db = new Database(dbPath);
    
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS delegation_contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id TEXT NOT NULL UNIQUE,
        delegator_agent_id TEXT NOT NULL,
        delegator_agent_name TEXT NOT NULL,
        delegatee_agent_id TEXT NOT NULL,
        delegatee_agent_name TEXT NOT NULL,
        task_id TEXT NOT NULL,
        task_description TEXT NOT NULL,
        verification_policy TEXT NOT NULL,
        success_criteria TEXT NOT NULL,
        timeout_ms INTEGER NOT NULL,
        permission_tokens TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        activated_at TEXT,
        completed_at TEXT,
        failed_at TEXT,
        verification_result TEXT,
        parent_contract_id TEXT,
        delegation_depth INTEGER DEFAULT 0,
        tlp_classification TEXT,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_delegator ON delegation_contracts(delegator_agent_id);
      CREATE INDEX IF NOT EXISTS idx_delegatee ON delegation_contracts(delegatee_agent_id);
      CREATE INDEX IF NOT EXISTS idx_status ON delegation_contracts(status);
      CREATE INDEX IF NOT EXISTS idx_task_id ON delegation_contracts(task_id);
      CREATE INDEX IF NOT EXISTS idx_parent ON delegation_contracts(parent_contract_id);
    `);
  }

  /**
   * Create a new delegation contract
   */
  async createContract(request: CreateDelegationContractRequest): Promise<DelegationContract> {
    const contract_id = `contract-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const created_at = new Date().toISOString();
    
    // Calculate delegation depth
    let delegation_depth = 0;
    if (request.parent_contract_id) {
      const parent = this.getContractById(request.parent_contract_id);
      if (parent) {
        delegation_depth = (parent.delegation_depth ?? 0) + 1;
        
        // Check max depth
        if (delegation_depth > this.maxDelegationDepth) {
          throw new Error(
            `Delegation depth ${delegation_depth} exceeds maximum ${this.maxDelegationDepth}`
          );
        }
      }
    }
    
    // Insert contract
    const stmt = this.db.prepare(`
      INSERT INTO delegation_contracts (
        contract_id, delegator_agent_id, delegator_agent_name,
        delegatee_agent_id, delegatee_agent_name,
        task_id, task_description, verification_policy,
        success_criteria, timeout_ms, permission_tokens,
        parent_contract_id, delegation_depth, tlp_classification,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      contract_id,
      request.delegator.agent_id,
      request.delegator.agent_name,
      request.delegatee.agent_id,
      request.delegatee.agent_name,
      request.task_id,
      request.task_description,
      request.verification_policy,
      JSON.stringify(request.success_criteria),
      request.timeout_ms,
      request.permission_tokens ? JSON.stringify(request.permission_tokens) : null,
      request.parent_contract_id ?? null,
      delegation_depth,
      request.tlp_classification ?? 'TLP:CLEAR',
      'pending',
      created_at
    );
    
    const contract = this.getContractById(contract_id)!;
    
    // Emit event
    this.emit('contract_created', contract);
    
    if (this.debug) {
      console.log(`[ContractManager] Created contract ${contract_id}`);
    }
    
    return contract;
  }

  /**

  /**
   * Query contracts with filters
   */
  queryContracts(options: ContractQueryOptions = {}): DelegationContract[] {
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (options.delegator_agent_id) {
      conditions.push('delegator_agent_id = ?');
      params.push(options.delegator_agent_id);
    }
    
    if (options.delegatee_agent_id) {
      conditions.push('delegatee_agent_id = ?');
      params.push(options.delegatee_agent_id);
    }
    
    if (options.task_id) {
      conditions.push('task_id = ?');
      params.push(options.task_id);
    }
    
    if (options.status) {
      if (Array.isArray(options.status)) {
        const placeholders = options.status.map(() => '?').join(',');
        conditions.push(`status IN (${placeholders})`);
        params.push(...options.status);
      } else {
        conditions.push('status = ?');
        params.push(options.status);
      }
    }
    
    if (options.delegation_depth !== undefined) {
      conditions.push('delegation_depth = ?');
      params.push(options.delegation_depth);
    }
    
    if (options.parent_contract_id) {
      conditions.push('parent_contract_id = ?');
      params.push(options.parent_contract_id);
    }
    
    let query = 'SELECT * FROM delegation_contracts';
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Sorting
    if (options.sort_by) {
      query += ` ORDER BY ${options.sort_by} ${options.sort_order === 'asc' ? 'ASC' : 'DESC'}`;
    }
    
    // Pagination
    if (options.limit !== undefined) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    if (options.offset !== undefined) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
    
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToContract(row));
  }

  /**
   * Update contract status and metadata
   */
  async updateContract(
    contract_id: string,
    updates: {
      status?: DelegationContractStatus;
      activated_at?: string;
      completed_at?: string;
      failed_at?: string;
      verification_result?: VerificationResult;
    }
  ): Promise<DelegationContract> {
    const fields: string[] = [];
    const params: any[] = [];
    
    if (updates.status) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    
    if (updates.activated_at) {
      fields.push('activated_at = ?');
      params.push(updates.activated_at);
    }
    
    if (updates.completed_at) {
      fields.push('completed_at = ?');
      params.push(updates.completed_at);
      
      // Emit completion event
      const contract = this.getContractById(contract_id);
      if (contract) {
        this.emit('contract_completed', contract);
      }
    }
    
    if (updates.failed_at) {
      fields.push('failed_at = ?');
      params.push(updates.failed_at);
    }
    
    if (updates.verification_result) {
      fields.push('verification_result = ?');
      params.push(JSON.stringify(updates.verification_result));
    }
    
    params.push(contract_id);
    
    const query = `UPDATE delegation_contracts SET ${fields.join(', ')} WHERE contract_id = ?`;
    this.db.prepare(query).run(...params);
    
    const contract = this.getContractById(contract_id);
    if (!contract) {
      throw new Error(`Contract ${contract_id} not found after update`);
    }
    
    return contract;
  }

  /**
   * Soft delete a contract
   */
  async deleteContract(contract_id: string): Promise<void> {
    const contract = this.getContractById(contract_id);
    if (!contract) {
      throw new Error(`Contract ${contract_id} not found`);
    }
    
    this.updateContract(contract_id, {
      status: 'failed' as DelegationContractStatus,
    });
  }

  /**
   * Get a single contract by ID
   */
  getContract(contract_id: string): DelegationContract | null {
    const row = this.db
      .prepare('SELECT * FROM delegation_contracts WHERE contract_id = ?')
      .get(contract_id);
    
    return row ? this.rowToContract(row) : null;
  }

  /**
   * Get contract by ID (alias for getContract)
   */
  getContractById(contract_id: string): DelegationContract | null {
    return this.getContract(contract_id);
  }

  /**
   * Get active contracts for an agent
   */
  getActiveContracts(agent_id: string): DelegationContract[] {
    return this.queryContracts({
      delegatee_agent_id: agent_id,
      status: ['pending', 'active'],
    });
  }

  /**
   * Get contract statistics
   */
  getStatistics(agent_id?: string): ContractStatistics {
    let query = `
      SELECT
        COUNT(*) as total_contracts,
        SUM(CASE WHEN status IN ('active', 'pending') THEN 1 ELSE 0 END) as active_contracts,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_contracts,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_contracts
      FROM delegation_contracts
    `;
    
    const params: any[] = [];
    if (agent_id) {
      query += ' WHERE delegatee_agent_id = ?';
      params.push(agent_id);
    }
    
    const stats = this.db.prepare(query).get(...params) as any;
    
    return {
      total_contracts: stats.total_contracts || 0,
      active_contracts: stats.active_contracts || 0,
      completed_contracts: stats.completed_contracts || 0,
      failed_contracts: stats.failed_contracts || 0,
      success_rate: stats.total_contracts > 0
        ? stats.completed_contracts / stats.total_contracts
        : 0,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Clear all contracts (for testing)
   */
  clearAll(): void {
    this.db.prepare('DELETE FROM delegation_contracts').run();
    this.db.prepare('DELETE FROM reputation_audit_log').run();
  }

  /**
   * Convert database row to DelegationContract
   */
  private rowToContract(row: any): DelegationContract {
    return {
      contract_id: row.contract_id,
      delegator: {
        agent_id: row.delegator_agent_id,
        agent_name: row.delegator_agent_name,
      },
      delegatee: {
        agent_id: row.delegatee_agent_id,
        agent_name: row.delegatee_agent_name,
      },
      task_id: row.task_id,
      task_description: row.task_description,
      verification_policy: row.verification_policy as VerificationPolicy,
      success_criteria: JSON.parse(row.success_criteria),
      timeout_ms: row.timeout_ms,
      permission_tokens: row.permission_tokens ? JSON.parse(row.permission_tokens) : undefined,
      status: row.status as DelegationContractStatus,
      created_at: row.created_at,
      activated_at: row.activated_at ?? undefined,
      completed_at: row.completed_at ?? undefined,
      verification_result: row.verification_result ? JSON.parse(row.verification_result) : undefined,
      parent_contract_id: row.parent_contract_id ?? undefined,
      delegation_depth: row.delegation_depth ?? 0,
      tlp_classification: row.tlp_classification ?? 'CLEAR',
    };
  }
}

// Export aliases for backward compatibility
export { DelegationContractManager as ContractManager };
export type { DelegationContractManagerConfig as ContractManagerConfig };
export type { CreateDelegationContractRequest as ContractUpdate };
export type { ContractQueryOptions as ContractQuery };

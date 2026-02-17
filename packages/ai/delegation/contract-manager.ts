/**
 * DCYFR Delegation Contract Manager
 * TLP:CLEAR
 * 
 * Manages delegation contracts with database persistence, event emission,
 * and lifecycle tracking.
 * 
 * @module delegation/contract-manager
 * @version 1.1.0
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
  contract_id?: string;  // Optional: allow explicit contract ID for testing
  delegator: DelegationAgent;
  delegatee: DelegationAgent;
  task_id: string;
  task_description: string;
  verification_policy: string;
  success_criteria: SuccessCriteria;
  timeout_ms: number;
  priority?: number;  // 1=highest, 5=lowest, default=3
  permission_tokens?: Array<{
    token_id: string;
    scopes: string[];
    delegatable?: boolean;
    max_delegation_depth?: number;
  }>;
  parent_contract_id?: string;
  tlp_classification?: string;
  status?: DelegationContractStatus;  // Optional: for testing, default='pending'
  created_at?: string;  // Optional: for testing, default=now
}

/**
 * Contract query options - supports both full and short field aliases
 */
export interface ContractQueryOptions {
  delegator_agent_id?: string;
  delegatee_agent_id?: string;
  /** Alias for delegator_agent_id */
  delegator_id?: string;
  /** Alias for delegatee_agent_id */
  delegatee_id?: string;
  task_id?: string;
  status?: DelegationContractStatus | DelegationContractStatus[];
  priority?: number;
  delegation_depth?: number;
  parent_contract_id?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'updated_at' | 'completed_at' | 'timeout_ms' | 'priority';
  sort_order?: 'asc' | 'desc';
}

/**
 * Contract update options - single object with contract_id
 */
export interface ContractUpdateOptions {
  contract_id: string;
  status?: DelegationContractStatus;
  activated_at?: string;
  completed_at?: string;
  verification_result?: VerificationResult;
  metadata?: Record<string, any>;
}

/**
 * Contract statistics
 */
export interface ContractStatistics {
  total: number;
  active: number;
  completed: number;
  failed: number;
  average_completion_time_ms?: number;
  success_rate: number;
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
  /** In-memory agent name cache (DB may not store names) */
  private agentNames: Map<string, string> = new Map();

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
        delegatee_agent_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        task_description TEXT NOT NULL,
        verification_policy TEXT NOT NULL,
        success_criteria TEXT NOT NULL,
        timeout_ms INTEGER NOT NULL,
        permission_tokens TEXT,
        priority INTEGER DEFAULT 3,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        activated_at TEXT,
        completed_at TEXT,
        verification_result TEXT,
        parent_contract_id TEXT,
        delegation_depth INTEGER DEFAULT 0,
        tlp_classification TEXT
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
    // Use explicit contract_id if provided (for testing), otherwise generate
    const contract_id = request.contract_id || `contract-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const created_at = request.created_at || new Date().toISOString();
    const status = request.status || 'pending';
    
    // Cache agent names for later retrieval
    this.agentNames.set(request.delegator.agent_id, request.delegator.agent_name);
    this.agentNames.set(request.delegatee.agent_id, request.delegatee.agent_name);
    
    // Calculate delegation depth
    let delegation_depth = 0;
    if (request.parent_contract_id) {
      const parent = this.getContractById(request.parent_contract_id);
      if (parent) {
        delegation_depth = (parent.delegation_depth ?? 0) + 1;
      }
    }
    
    // Validate max delegation depth
    if (delegation_depth >= this.maxDelegationDepth) {
      throw new Error(`Maximum delegation depth exceeded (max: ${this.maxDelegationDepth}, attempted: ${delegation_depth})`);
    }
    
    // Insert contract
    const stmt = this.db.prepare(`
      INSERT INTO delegation_contracts (
        contract_id, delegator_agent_id, delegatee_agent_id,
        task_id, task_description, verification_policy,
        success_criteria, timeout_ms, priority, permission_tokens,
        metadata, parent_contract_id, delegation_depth, tlp_classification,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      contract_id,
      request.delegator.agent_id,
      request.delegatee.agent_id,
      request.task_id,
      request.task_description,
      request.verification_policy,
      JSON.stringify(request.success_criteria),
      request.timeout_ms,
      request.priority ?? 3,
      request.permission_tokens ? JSON.stringify(request.permission_tokens) : null,
      null,  // metadata initially null
      request.parent_contract_id ?? null,
      delegation_depth,
      request.tlp_classification ?? 'TLP:CLEAR',
      status,
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
   * Query contracts with filters
   */
  queryContracts(options: ContractQueryOptions = {}): DelegationContract[] {
    const conditions: string[] = [];
    const params: any[] = [];
    
    // Support both full and short aliases for agent IDs
    const delegatorId = options.delegator_agent_id ?? options.delegator_id;
    const delegateeId = options.delegatee_agent_id ?? options.delegatee_id;
    
    if (delegatorId) {
      conditions.push('delegator_agent_id = ?');
      params.push(delegatorId);
    }
    
    if (delegateeId) {
      conditions.push('delegatee_agent_id = ?');
      params.push(delegateeId);
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
    
    if (options.priority !== undefined) {
      conditions.push('priority = ?');
      params.push(options.priority);
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
      if (options.limit === undefined) {
        // SQLite requires LIMIT before OFFSET
        query += ' LIMIT -1';
      }
      query += ' OFFSET ?';
      params.push(options.offset);
    }
    
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToContract(row));
  }

  /**
   * Update contract status and metadata.
   * Accepts a single object with contract_id and fields to update.
   * Automatically sets activated_at when status='active' and completed_at when status='completed'.
   */
  async updateContract(
    updates: ContractUpdateOptions
  ): Promise<DelegationContract> {
    const { contract_id } = updates;
    
    // Verify contract exists
    const existing = this.getContractById(contract_id);
    if (!existing) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    const fields: string[] = [];
    const params: any[] = [];
    
    if (updates.status) {
      fields.push('status = ?');
      params.push(updates.status);
      
      // Auto-set timestamps based on status
      if (updates.status === 'active' && !updates.activated_at) {
        fields.push('activated_at = ?');
        params.push(new Date().toISOString());
      }
      
      if ((updates.status === 'completed' || updates.status === 'revoked') && !updates.completed_at) {
        fields.push('completed_at = ?');
        params.push(new Date().toISOString());
      }
    }
    
    if (updates.activated_at) {
      fields.push('activated_at = ?');
      params.push(updates.activated_at);
    }
    
    if (updates.completed_at) {
      fields.push('completed_at = ?');
      params.push(updates.completed_at);
    }
    
    if (updates.verification_result) {
      fields.push('verification_result = ?');
      params.push(JSON.stringify(updates.verification_result));
    }
    
    if (updates.metadata) {
      fields.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }
    
    if (fields.length === 0) {
      return existing;
    }
    
    params.push(contract_id);
    
    const query = `UPDATE delegation_contracts SET ${fields.join(', ')} WHERE contract_id = ?`;
    this.db.prepare(query).run(...params);
    
    const contract = this.getContractById(contract_id);
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    // Emit events based on status
    if (updates.status === 'completed') {
      this.emit('contract_completed', contract);
    }
    
    if (this.debug) {
      console.log(`[ContractManager] Updated contract ${contract_id}: status=${updates.status}`);
    }
    
    return contract;
  }

  /**
   * Soft delete (revoke) a contract
   */
  async deleteContract(contract_id: string, reason?: string): Promise<void> {
    const contract = this.getContractById(contract_id);
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    await this.updateContract({
      contract_id,
      status: 'revoked' as DelegationContractStatus,
    });
    
    if (this.debug) {
      console.log(`[ContractManager] Deleted contract ${contract_id}: ${reason ?? 'no reason'}`);
    }
  }

  /**
   * Update contract status (convenience method)
   */
  async updateContractStatus(
    contract_id: string,
    status: DelegationContractStatus,
    options?: { metadata?: Record<string, any>; verification_result?: VerificationResult }
  ): Promise<DelegationContract> {
    const updates: ContractUpdateOptions = { contract_id, status };
    
    // Add verification_result if provided
    if (options?.verification_result) {
      updates.verification_result = options.verification_result;
    }
    
    // Merge metadata if provided
    if (options?.metadata) {
      // Get existing contract to merge metadata
      const existing = this.getContractById(contract_id);
      const existingMetadata = existing?.metadata || {};
      updates.metadata = { ...existingMetadata, ...options.metadata };
    }
    
    return this.updateContract(updates);
  }

  /**
   * Cancel a contract (convenience method for cancellation)
   */
  async cancelContract(contract_id: string, reason?: string): Promise<void> {
    const contract = this.getContractById(contract_id);
    if (!contract) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    await this.updateContract({
      contract_id,
      status: 'cancelled' as DelegationContractStatus,
      metadata: reason ? { cancellation_reason: reason } : undefined,
    });
    
    if (this.debug) {
      console.log(`[ContractManager] Cancelled contract ${contract_id}: ${reason ?? 'no reason'}`);
    }
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
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('active', 'pending') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM delegation_contracts
    `;
    
    const params: any[] = [];
    if (agent_id) {
      query += ' WHERE delegatee_agent_id = ?';
      params.push(agent_id);
    }
    
    const stats = this.db.prepare(query).get(...params) as any;
    
    const total = stats.total || 0;
    const completed = stats.completed || 0;
    const failed = stats.failed || 0;
    const decidedTotal = completed + failed;
    
    return {
      total,
      active: stats.active || 0,
      completed,
      failed,
      success_rate: decidedTotal > 0
        ? completed / decidedTotal
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
    // Safely attempt to clear audit log if it exists
    try {
      this.db.prepare('DELETE FROM reputation_audit_log').run();
    } catch {
      // Table may not exist
    }
  }

  /**
   * Convert database row to DelegationContract
   */
  private rowToContract(row: any): DelegationContract {
    return {
      contract_id: row.contract_id,
      delegator: {
        agent_id: row.delegator_agent_id,
        agent_name: this.agentNames.get(row.delegator_agent_id) ?? row.delegator_agent_id,
      },
      delegatee: {
        agent_id: row.delegatee_agent_id,
        agent_name: this.agentNames.get(row.delegatee_agent_id) ?? row.delegatee_agent_id,
      },
      task_id: row.task_id,
      task_description: row.task_description,
      verification_policy: row.verification_policy as VerificationPolicy,
      success_criteria: JSON.parse(row.success_criteria),
      timeout_ms: row.timeout_ms,
      priority: row.priority,
      permission_tokens: row.permission_tokens ? JSON.parse(row.permission_tokens) : undefined,
      status: row.status as DelegationContractStatus,
      created_at: row.created_at,
      activated_at: row.activated_at ?? undefined,
      completed_at: row.completed_at ?? undefined,
      verification_result: row.verification_result ? JSON.parse(row.verification_result) : undefined,
      parent_contract_id: row.parent_contract_id ?? undefined,
      delegation_depth: row.delegation_depth ?? 0,
      tlp_classification: row.tlp_classification ?? 'CLEAR',
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    };
  }
}

// Export aliases for backward compatibility
export { DelegationContractManager as ContractManager };
export type { DelegationContractManagerConfig as ContractManagerConfig };
export type { CreateDelegationContractRequest as ContractUpdate };
export type { ContractQueryOptions as ContractQuery };

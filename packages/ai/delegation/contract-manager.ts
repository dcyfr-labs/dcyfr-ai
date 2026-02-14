/**
 * DCYFR Delegation Contract Manager
 * TLP:AMBER - Internal Use Only
 * 
 * Manages delegation contract lifecycle: create, read, update, delete operations.
 * Integrates with SQLite reputation database for persistent storage.
 * 
 * @module delegation/contract-manager
 * @version 1.0.0
 * @date 2026-02-13
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  DelegationContract,
  DelegationContractStatus,
  CreateDelegationContractRequest,
  UpdateDelegationContractRequest,
  DelegationContractQuery,
  VerificationResult,
  DelegationAgent,
} from '../types/delegation-contracts';

/**
 * Contract Manager Configuration
 */
export interface ContractManagerConfig {
  /** Path to SQLite database */
  databasePath: string;
  
  /** Maximum delegation depth allowed */
  maxDelegationDepth?: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Delegation Contract Manager
 * 
 * Provides CRUD operations for delegation contracts with SQLite persistence.
 */
export class DelegationContractManager {
  private db: Database.Database;
  private config: ContractManagerConfig;
  
  constructor(config: ContractManagerConfig) {
    this.config = {
      maxDelegationDepth: 5,
      debug: false,
      ...config,
    };
    
    this.db = new Database(this.config.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTables();
  }
  
  /**
   * Ensure database tables exist
   */
  private ensureTables(): void {
    // Tables are created by schema.sql during database initialization
    // This method validates they exist
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('delegation_contracts', 'reputation_audit_log')
    `).all();
    
    if (tables.length < 2) {
      throw new Error('Database schema incomplete. Run delegation-reputation.schema.sql first.');
    }
  }
  
  /**
   * Create a new delegation contract
   */
  async createContract(request: CreateDelegationContractRequest): Promise<DelegationContract> {
    const now = new Date().toISOString();
    const contractId = randomUUID();
    
    // Calculate delegation depth
    let delegationDepth = 0;
    if (request.parent_contract_id) {
      const parent = await this.getContract(request.parent_contract_id);
      if (!parent) {
        throw new Error(`Parent contract not found: ${request.parent_contract_id}`);
      }
      delegationDepth = parent.delegation_depth + 1;
      
      if (delegationDepth >= (this.config.maxDelegationDepth ?? 5)) {
        throw new Error(`Maximum delegation depth exceeded: ${delegationDepth}`);
      }
    }
    
    const contract: DelegationContract = {
      contract_id: contractId,
      delegator: request.delegator,
      delegatee: request.delegatee,
      task_id: request.task_id,
      task_description: request.task_description,
      verification_policy: request.verification_policy,
      success_criteria: request.success_criteria,
      timeout_ms: request.timeout_ms,
      permission_tokens: request.permission_tokens,
      status: 'pending',
      created_at: now,
      delegation_depth: delegationDepth,
      parent_contract_id: request.parent_contract_id,
      tlp_classification: request.tlp_classification,
      metadata: request.metadata,
    };
    
    // Insert into database
    const stmt = this.db.prepare(`
      INSERT INTO delegation_contracts (
        contract_id, delegator_agent_id, delegatee_agent_id,
        task_id, task_description, verification_policy,
        success_criteria, timeout_ms, permission_tokens,
        status, created_at, delegation_depth, parent_contract_id, tlp_classification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      contract.contract_id,
      contract.delegator.agent_id,
      contract.delegatee.agent_id,
      contract.task_id,
      contract.task_description,
      contract.verification_policy,
      JSON.stringify(contract.success_criteria),
      contract.timeout_ms,
      contract.permission_tokens ? JSON.stringify(contract.permission_tokens) : null,
      contract.status,
      contract.created_at,
      contract.delegation_depth,
      contract.parent_contract_id ?? null,
      contract.tlp_classification ?? null
    );
    
    // Log audit event
    await this.logAuditEvent({
      event_type: 'delegation_created',
      agent_id: contract.delegator.agent_id,
      agent_name: contract.delegator.agent_name,
      event_data: {
        contract_id: contract.contract_id,
        delegatee: contract.delegatee.agent_id,
        task_id: contract.task_id,
      },
      delegation_contract_id: contract.contract_id,
    });
    
    if (this.config.debug) {
      console.log(`[ContractManager] Created contract: ${contract.contract_id}`);
    }
    
    return contract;
  }
  
  /**
   * Get a contract by ID
   */
  async getContract(contractId: string): Promise<DelegationContract | null> {
    const row = this.db.prepare(`
      SELECT * FROM delegation_contracts WHERE contract_id = ?
    `).get(contractId) as any;
    
    if (!row) {
      return null;
    }
    
    return this.rowToContract(row);
  }
  
  /**
   * Update a contract
   */
  async updateContract(request: UpdateDelegationContractRequest): Promise<DelegationContract> {
    const existing = await this.getContract(request.contract_id);
    if (!existing) {
      throw new Error(`Contract not found: ${request.contract_id}`);
    }
    
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];
    
    if (request.status) {
      updates.push('status = ?');
      values.push(request.status);
      
      // Handle status-specific timestamps
      if (request.status === 'active' && !existing.activated_at) {
        updates.push('activated_at = ?');
        values.push(now);
      } else if (['completed', 'failed', 'timeout', 'revoked'].includes(request.status)) {
        updates.push('completed_at = ?');
        values.push(now);
      }
    }
    
    if (request.verification_result) {
      updates.push('verification_result = ?');
      values.push(JSON.stringify(request.verification_result));
    }
    
    if (updates.length === 0) {
      return existing; // No changes
    }
    
    values.push(request.contract_id);
    
    const stmt = this.db.prepare(`
      UPDATE delegation_contracts 
      SET ${updates.join(', ')}
      WHERE contract_id = ?
    `);
    
    stmt.run(...values);
    
    // Log audit event
    await this.logAuditEvent({
      event_type: 'delegation_verified',
      agent_id: existing.delegatee.agent_id,
      agent_name: existing.delegatee.agent_name,
      event_data: {
        contract_id: request.contract_id,
        old_status: existing.status,
        new_status: request.status,
        verification_result: request.verification_result,
      },
      delegation_contract_id: request.contract_id,
    });
    
    if (this.config.debug) {
      console.log(`[ContractManager] Updated contract: ${request.contract_id}`);
    }
    
    return await this.getContract(request.contract_id) as DelegationContract;
  }
  
  /**
   * Query contracts with filtering
   */
  async queryContracts(query: DelegationContractQuery): Promise<DelegationContract[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    
    if (query.delegator_id) {
      conditions.push('delegator_agent_id = ?');
      values.push(query.delegator_id);
    }
    
    if (query.delegatee_id) {
      conditions.push('delegatee_agent_id = ?');
      values.push(query.delegatee_id);
    }
    
    if (query.task_id) {
      conditions.push('task_id = ?');
      values.push(query.task_id);
    }
    
    if (query.status) {
      if (Array.isArray(query.status)) {
        conditions.push(`status IN (${query.status.map(() => '?').join(', ')})`);
        values.push(...query.status);
      } else {
        conditions.push('status = ?');
        values.push(query.status);
      }
    }
    
    if (query.delegation_depth !== undefined) {
      conditions.push('delegation_depth = ?');
      values.push(query.delegation_depth);
    }
    
    if (query.parent_contract_id) {
      conditions.push('parent_contract_id = ?');
      values.push(query.parent_contract_id);
    }
    
    let sql = 'SELECT * FROM delegation_contracts';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Sorting
    const sortBy = query.sort_by ?? 'created_at';
    const sortOrder = query.sort_order ?? 'desc';
    sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
    
    // Pagination - OFFSET requires LIMIT in SQLite
    if (query.limit || query.offset) {
      sql += ' LIMIT ?';
      values.push(query.limit ?? 999999); // Large default limit if only offset is specified
      
      if (query.offset) {
        sql += ' OFFSET ?';
        values.push(query.offset);
      }
    }
    
    const rows = this.db.prepare(sql).all(...values) as any[];
    return rows.map(row => this.rowToContract(row));
  }
  
  /**
   * Delete a contract (soft delete by marking as revoked)
   */
  async deleteContract(contractId: string, reason?: string): Promise<void> {
    const contract = await this.getContract(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }
    
    const now = new Date().toISOString();
    
    this.db.prepare(`
      UPDATE delegation_contracts 
      SET status = 'revoked', completed_at = ?
      WHERE contract_id = ?
    `).run(now, contractId);
    
    // Log audit event
    await this.logAuditEvent({
      event_type: 'delegation_verified',
      agent_id: contract.delegator.agent_id,
      agent_name: contract.delegator.agent_name,
      event_data: {
        contract_id: contractId,
        reason: reason ?? 'Contract revoked',
        old_status: contract.status,
        new_status: 'revoked',
      },
      delegation_contract_id: contractId,
    });
    
    if (this.config.debug) {
      console.log(`[ContractManager] Deleted contract: ${contractId}`);
    }
  }
  
  /**
   * Get active contracts for an agent
   */
  async getActiveContracts(agentId: string): Promise<DelegationContract[]> {
    return this.queryContracts({
      delegatee_id: agentId,
      status: ['pending', 'active'],
    });
  }
  
  /**
   * Get contract statistics
   */
  async getStatistics(agentId?: string): Promise<ContractStatistics> {
    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout,
        SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revoked
      FROM delegation_contracts
    `;
    
    const values: any[] = [];
    if (agentId) {
      sql += ' WHERE delegatee_agent_id = ?';
      values.push(agentId);
    }
    
    const row = this.db.prepare(sql).get(...values) as any;
    
    return {
      total: row.total,
      pending: row.pending,
      active: row.active,
      completed: row.completed,
      failed: row.failed,
      timeout: row.timeout,
      revoked: row.revoked,
      success_rate: row.completed > 0 ? row.completed / (row.completed + row.failed + row.timeout) : 0,
    };
  }
  
  /**
   * Log audit event
   */
  private async logAuditEvent(event: {
    event_type: string;
    agent_id: string;
    agent_name: string;
    event_data: Record<string, any>;
    delegation_contract_id?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const eventId = randomUUID();
    
    this.db.prepare(`
      INSERT INTO reputation_audit_log (
        event_id, event_type, timestamp, agent_id, agent_name,
        event_data, delegation_contract_id, source_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      event.event_type,
      now,
      event.agent_id,
      event.agent_name,
      JSON.stringify(event.event_data),
      event.delegation_contract_id ?? null,
      'dcyfr-ai'
    );
  }
  
  /**
   * Convert database row to DelegationContract
   */
  private rowToContract(row: any): DelegationContract {
    const delegator: DelegationAgent = {
      agent_id: row.delegator_agent_id,
      agent_name: row.delegator_agent_id, // TODO: Fetch from agent registry
    };
    
    const delegatee: DelegationAgent = {
      agent_id: row.delegatee_agent_id,
      agent_name: row.delegatee_agent_id, // TODO: Fetch from agent registry
    };
    
    return {
      contract_id: row.contract_id,
      delegator,
      delegatee,
      task_id: row.task_id,
      task_description: row.task_description,
      verification_policy: row.verification_policy,
      success_criteria: JSON.parse(row.success_criteria),
      timeout_ms: row.timeout_ms,
      permission_tokens: row.permission_tokens ? JSON.parse(row.permission_tokens) : undefined,
      status: row.status,
      created_at: row.created_at,
      activated_at: row.activated_at ?? undefined,
      completed_at: row.completed_at ?? undefined,
      verification_result: row.verification_result ? JSON.parse(row.verification_result) : undefined,
      parent_contract_id: row.parent_contract_id ?? undefined,
      delegation_depth: row.delegation_depth,
      tlp_classification: row.tlp_classification ?? undefined,
    };
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Contract statistics
 */
export interface ContractStatistics {
  total: number;
  pending: number;
  active: number;
  completed: number;
  failed: number;
  timeout: number;
  revoked: number;
  success_rate: number;
}

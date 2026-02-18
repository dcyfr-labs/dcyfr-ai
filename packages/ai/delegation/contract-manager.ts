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
  private securityThreatEvents: Array<Record<string, any>> = [];
  private securityValidationCount = 0;
  private securityThreatCount = 0;

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

  /** Normalize agents from legacy or current request shapes */
  private normalizeContractAgents(
    request: CreateDelegationContractRequest,
    legacyRequest: Record<string, any>,
  ): { delegator: DelegationAgent; delegatee: DelegationAgent } {
    const delegator = request.delegator || {
      agent_id: legacyRequest?.delegator_agent_id || legacyRequest?.delegator?.agent_id || 'delegator-agent',
      agent_name: legacyRequest?.delegator?.agent_name || legacyRequest?.delegator?.agent_id || 'Delegator Agent',
      capabilities: legacyRequest?.delegator?.capabilities,
    };
    const delegatee = request.delegatee || {
      agent_id: legacyRequest?.delegatee_agent_id || legacyRequest?.delegatee?.agent_id || 'delegatee-agent',
      agent_name: legacyRequest?.delegatee?.agent_name || legacyRequest?.delegatee?.agent_id || 'Delegatee Agent',
      capabilities: legacyRequest?.delegatee?.capabilities,
    };
    return { delegator, delegatee };
  }

  /** Normalize verification policy from legacy/current values */
  private normalizeVerificationPolicy(raw: string): string {
    if (raw === 'manual') return 'human_required';
    if (raw === 'automated' || raw === 'capability_match') return 'direct_inspection';
    return raw;
  }

  /** Run security validation, emit threat event and throw if a threat is detected */
  private validateContractSecurity(
    request: CreateDelegationContractRequest,
    legacyRequest: Record<string, any>,
    normalizedPermissionTokens: Array<{ token_id: string; scopes: string[]; delegatable?: boolean; max_delegation_depth?: number }> | undefined,
  ): void {
    this.securityValidationCount++;
    const threat = this.detectSecurityThreat({
      permission_token: legacyRequest?.permission_token,
      permission_tokens: normalizedPermissionTokens,
      resource_requirements: legacyRequest?.resource_requirements,
      metadata: legacyRequest?.metadata,
      tlp_classification: request.tlp_classification || legacyRequest?.tlp_classification,
    });
    if (threat) {
      this.securityThreatCount++;
      const threatEvent = {
        contract_id: request.contract_id || request.task_id || `preflight-${Date.now()}`,
        threat_detected: true,
        threat_type: threat.threat_type,
        severity: threat.severity,
        description: threat.description,
        action: threat.action,
        timestamp: new Date().toISOString(),
      };
      this.securityThreatEvents.push(threatEvent);
      this.emit('security_threat_detected', threatEvent);
      throw new Error(`Security threat detected: ${threat.threat_type}`);
    }
  }

  /**
   * Create a new delegation contract
   */
  async createContract(request: CreateDelegationContractRequest): Promise<DelegationContract> {
    const legacyRequest = request as unknown as Record<string, any>;

    const { delegator: normalizedDelegator, delegatee: normalizedDelegatee } =
      this.normalizeContractAgents(request, legacyRequest);

    const normalizedTaskDescription = request.task_description || legacyRequest?.description || request.task_id || 'Delegated task';
    const normalizedTimeout = request.timeout_ms ?? legacyRequest?.timeout_ms ?? 30000;
    const normalizedSuccessCriteria = Array.isArray(request.success_criteria)
      ? { required_checks: request.success_criteria }
      : (request.success_criteria || {});

    const rawVerificationPolicy = request.verification_policy || legacyRequest?.verification_policy || 'direct_inspection';
    const normalizedVerificationPolicy = this.normalizeVerificationPolicy(rawVerificationPolicy);

    const normalizedPermissionTokens = request.permission_tokens ||
      (legacyRequest?.permission_token
        ? [{
            token_id: legacyRequest.permission_token.token_id,
            scopes: legacyRequest.permission_token.scopes || [],
            delegatable: legacyRequest.permission_token.delegatable,
            max_delegation_depth: legacyRequest.permission_token.max_delegation_depth,
          }]
        : undefined);

    this.validateContractSecurity(request, legacyRequest, normalizedPermissionTokens);

    // Use explicit contract_id if provided (for testing), otherwise generate
    const contract_id = request.contract_id || `contract-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const created_at = request.created_at || new Date().toISOString();
    const status = request.status || 'pending';
    
    // Cache agent names for later retrieval
    this.agentNames.set(normalizedDelegator.agent_id, normalizedDelegator.agent_name);
    this.agentNames.set(normalizedDelegatee.agent_id, normalizedDelegatee.agent_name);
    
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
      normalizedDelegator.agent_id,
      normalizedDelegatee.agent_id,
      request.task_id,
      normalizedTaskDescription,
      normalizedVerificationPolicy,
      JSON.stringify(normalizedSuccessCriteria),
      normalizedTimeout,
      request.priority ?? 3,
      normalizedPermissionTokens ? JSON.stringify(normalizedPermissionTokens) : null,
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
  /** Build WHERE clause and params from query options */
  private buildQueryFromOptions(options: ContractQueryOptions): { query: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    const delegatorId = options.delegator_agent_id ?? options.delegator_id;
    const delegateeId = options.delegatee_agent_id ?? options.delegatee_id;

    if (delegatorId) { conditions.push('delegator_agent_id = ?'); params.push(delegatorId); }
    if (delegateeId) { conditions.push('delegatee_agent_id = ?'); params.push(delegateeId); }
    if (options.task_id) { conditions.push('task_id = ?'); params.push(options.task_id); }

    if (options.status) {
      if (Array.isArray(options.status)) {
        conditions.push(`status IN (${options.status.map(() => '?').join(',')})`);
        params.push(...options.status);
      } else {
        conditions.push('status = ?');
        params.push(options.status);
      }
    }

    if (options.delegation_depth !== undefined) { conditions.push('delegation_depth = ?'); params.push(options.delegation_depth); }
    if (options.parent_contract_id) { conditions.push('parent_contract_id = ?'); params.push(options.parent_contract_id); }
    if (options.priority !== undefined) { conditions.push('priority = ?'); params.push(options.priority); }

    let query = 'SELECT * FROM delegation_contracts';
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    if (options.sort_by) query += ` ORDER BY ${options.sort_by} ${options.sort_order === 'asc' ? 'ASC' : 'DESC'}`;

    if (options.limit !== undefined) { query += ' LIMIT ?'; params.push(options.limit); }
    if (options.offset !== undefined) {
      if (options.limit === undefined) query += ' LIMIT -1';
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    return { query, params };
  }

  queryContracts(options: ContractQueryOptions = {}): DelegationContract[] {
    const { query, params } = this.buildQueryFromOptions(options);
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToContract(row));
  }

  /** Build SQL fields/params for an updateContract call */
  private buildUpdateFields(updates: ContractUpdateOptions): { fields: string[]; params: any[] } {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.status) {
      fields.push('status = ?');
      params.push(updates.status);
      if (updates.status === 'active' && !updates.activated_at) {
        fields.push('activated_at = ?');
        params.push(new Date().toISOString());
      }
      if ((updates.status === 'completed' || updates.status === 'revoked') && !updates.completed_at) {
        fields.push('completed_at = ?');
        params.push(new Date().toISOString());
      }
    }

    if (updates.activated_at) { fields.push('activated_at = ?'); params.push(updates.activated_at); }
    if (updates.completed_at) { fields.push('completed_at = ?'); params.push(updates.completed_at); }
    if (updates.verification_result) { fields.push('verification_result = ?'); params.push(JSON.stringify(updates.verification_result)); }
    if (updates.metadata) { fields.push('metadata = ?'); params.push(JSON.stringify(updates.metadata)); }

    return { fields, params };
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
    
    const existing = this.getContractById(contract_id);
    if (!existing) {
      throw new Error(`Contract not found: ${contract_id}`);
    }
    
    const { fields, params } = this.buildUpdateFields(updates);
    
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
   * Get total contract count (legacy compatibility helper)
   */
  getContractCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM delegation_contracts').get() as { count: number };
    return row?.count ?? 0;
  }

  /**
   * Get security threat statistics (legacy compatibility helper)
   */
  getSecurityThreatStatistics(): {
    total_validations: number;
    threats_detected: number;
    threat_types: Record<string, number>;
    severity_distribution: Record<string, number>;
    action_distribution: Record<string, number>;
  } {
    const threat_types: Record<string, number> = {};
    const severity_distribution: Record<string, number> = {};
    const action_distribution: Record<string, number> = {};

    for (const threat of this.securityThreatEvents) {
      const type = String(threat.threat_type || 'unknown');
      const severity = String(threat.severity || 'warning');
      const action = String(threat.action || 'block');

      threat_types[type] = (threat_types[type] || 0) + 1;
      severity_distribution[severity] = (severity_distribution[severity] || 0) + 1;
      action_distribution[action] = (action_distribution[action] || 0) + 1;
    }

    return {
      total_validations: this.securityValidationCount,
      threats_detected: this.securityThreatCount,
      threat_types,
      severity_distribution,
      action_distribution,
    };
  }

  /**
   * Get recent security threats (legacy compatibility helper)
   */
  getRecentSecurityThreats(limit = 10): Array<Record<string, any>> {
    return this.securityThreatEvents.slice(-limit).reverse();
  }

  /** Build security recommendations based on threat statistics */
  private buildSecurityRecommendations(stats: ReturnType<typeof this.getSecurityThreatStatistics>, threatRate: number): string[] {
    const recommendations: string[] = [];
    if (stats.threats_detected > 0) {
      recommendations.push('Review and audit blocked delegation contracts for threat patterns.');
    }
    if (threatRate > 0.25) {
      recommendations.push('Threat detection rate is elevated; consider tightening delegation policies.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Maintain periodic security review of delegation contracts and policies.');
    }
    return recommendations;
  }

  /**
   * Get security status summary (legacy compatibility helper)
   */
  getSecurityStatus(): {
    tlp_enforcement_enabled: boolean;
    security_threat_validation_enabled: boolean;
    contract_security_summary: Record<string, any>;
    recent_security_events: Array<Record<string, any>>;
    security_recommendations: string[];
  } {
    const stats = this.getSecurityThreatStatistics();
    const totalContracts = this.getContractCount();
    const threatRate = stats.total_validations > 0 ? stats.threats_detected / stats.total_validations : 0;

    return {
      tlp_enforcement_enabled: true,
      security_threat_validation_enabled: true,
      contract_security_summary: {
        total_contracts: totalContracts,
        security_validations_performed: stats.total_validations,
        threats_detected: stats.threats_detected,
        threat_detection_rate: threatRate,
        threat_types: stats.threat_types,
        severity_distribution: stats.severity_distribution,
        action_distribution: stats.action_distribution,
      },
      recent_security_events: this.getRecentSecurityThreats(10),
      security_recommendations: this.buildSecurityRecommendations(stats, threatRate),
    };
  }

  private detectSecurityThreat(input: {
    permission_token?: any;
    permission_tokens?: any[];
    resource_requirements?: any;
    metadata?: Record<string, any>;
    tlp_classification?: string;
  }): { threat_type: string; severity: 'warning' | 'critical'; description: string; action: 'block' | 'notify' } | null {
    const scopes = new Set<string>();
    const actions = new Set<string>();

    if (input.permission_token) {
      for (const scope of input.permission_token.scopes || []) scopes.add(String(scope).toLowerCase());
      for (const action of input.permission_token.actions || []) actions.add(String(action).toLowerCase());
    }

    for (const token of input.permission_tokens || []) {
      for (const scope of token?.scopes || []) scopes.add(String(scope).toLowerCase());
      for (const action of token?.actions || []) actions.add(String(action).toLowerCase());
    }

    const joined = `${Array.from(scopes).join(' ')} ${Array.from(actions).join(' ')}`;
    const hasCriticalPermission = /(root|admin|execute|delete|modify_system|system_admin|root_access|execute_arbitrary)/i.test(joined);
    if (hasCriticalPermission) {
      return {
        threat_type: 'permission_escalation',
        severity: 'critical',
        description: 'Detected high-risk permission scopes or actions.',
        action: 'block',
      };
    }

    const depth = Number(input.metadata?.delegation_depth ?? 0);
    if (Number.isFinite(depth) && depth >= 6) {
      return {
        threat_type: 'permission_escalation',
        severity: 'critical',
        description: 'Delegation chain depth exceeds safe limits.',
        action: 'block',
      };
    }

    const memory = Number(input.resource_requirements?.memory_mb ?? 0);
    const cpu = Number(input.resource_requirements?.cpu_cores ?? 0);
    const disk = Number(input.resource_requirements?.disk_space_mb ?? 0);
    if ((Number.isFinite(memory) && memory > 8192) || (Number.isFinite(cpu) && cpu > 8) || (Number.isFinite(disk) && disk > 512000)) {
      return {
        threat_type: 'abuse_pattern',
        severity: 'critical',
        description: 'Resource requirements indicate possible abuse or exhaustion attempt.',
        action: 'block',
      };
    }

    if (input.tlp_classification === 'TLP:RED' && hasCriticalPermission) {
      return {
        threat_type: 'permission_escalation',
        severity: 'critical',
        description: 'High-sensitivity contract with excessive permissions.',
        action: 'block',
      };
    }

    return null;
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

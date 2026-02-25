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
import { ExecutionMode } from '../types/agent-capabilities.js';
import type { AgentCapabilityManifest, SessionHandoff, SessionHandoffRequest } from '../types/agent-capabilities.js';
import { BackgroundSessionQueue, MAX_BACKGROUND_SESSIONS } from './session-queue.js';
import { SessionCheckpoint } from './session-checkpoint.js';
import { SessionManager } from './session-manager.js';
import type { CapabilityRegistry } from './capability-registry.js';

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
  /**
   * Execution mode for this contract.
   * Defaults to `ExecutionMode.INTERACTIVE` when omitted.
   * @since 1.1.0
   */
  execution_mode?: ExecutionMode;
  /**
   * Session identifier to associate with an existing session.
   * Populated automatically for BACKGROUND / ASYNC modes when absent.
   * @since 1.1.0
   */
  session_id?: string;
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
  /** Optional registry used by selectExecutionMode() for manifest lookups. */
  capabilityRegistry?: CapabilityRegistry;
  /** Override base directory for session archives (defaults to logs/delegation/sessions). */
  sessionArchiveDir?: string;
  /** Override checkpoint directory (defaults to logs/delegation/checkpoints). */
  checkpointDir?: string;
  /** Maximum concurrent background sessions (defaults to MAX_BACKGROUND_SESSIONS = 10). */
  maxBackgroundSessions?: number;
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
  /** Optional registry for manifest-based mode selection. */
  private readonly capabilityRegistry?: CapabilityRegistry;
  /** Background session slot management. */
  private readonly backgroundQueue: BackgroundSessionQueue;
  /** Session lifecycle tracking. */
  private readonly sessionManager: SessionManager;
  /** Checkpoint persistence. */
  private readonly checkpoint: SessionCheckpoint;

  constructor(config: DelegationContractManagerConfig = {}) {
    super();
    
    this.maxDelegationDepth = config.maxDelegationDepth ?? 5;
    this.debug = config.debug ?? false;
    this.capabilityRegistry = config.capabilityRegistry;
    
    this.backgroundQueue = new BackgroundSessionQueue(
      config.maxBackgroundSessions ?? MAX_BACKGROUND_SESSIONS,
    );
    this.sessionManager = new SessionManager({
      archiveBaseDir: config.sessionArchiveDir,
      flushIntervalMs: 60_000,
    });
    this.checkpoint = new SessionCheckpoint(config.checkpointDir);
    
    // Forward background queue status events upstream
    this.backgroundQueue.on('status', (status) => {
      this.emit('background_queue_status', status);
    });
    
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
    type LegacyContractFields = { 
      description?: string; 
      timeout_ms?: number;
      permission_token?: string | string[] | {
        token_id?: string;
        scopes?: string[];
        delegatable?: boolean;
        max_delegation_depth?: number;
      };
      verification_policy?: string;
    };
    const legacyRequest = request as typeof request & LegacyContractFields;

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
      (legacyRequest?.permission_token && typeof legacyRequest.permission_token === 'object' && !Array.isArray(legacyRequest.permission_token)
        ? [{
            token_id: legacyRequest.permission_token.token_id ?? '',
            scopes: legacyRequest.permission_token.scopes || [],
            delegatable: legacyRequest.permission_token.delegatable ?? false,
            max_delegation_depth: legacyRequest.permission_token.max_delegation_depth ?? 0,
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
    
    // Store execution mode and session ID in metadata (backward-compatible, no schema migration needed)
    const executionMode = request.execution_mode ?? ExecutionMode.INTERACTIVE;
    const sessionId = request.session_id ?? (
      executionMode !== ExecutionMode.INTERACTIVE
        ? `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        : undefined
    );
    const initialMetadata: Record<string, unknown> = {};
    if (executionMode !== ExecutionMode.INTERACTIVE) {
      initialMetadata['execution_mode'] = executionMode;
    }
    if (sessionId) {
      initialMetadata['session_id'] = sessionId;
    }

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
      Object.keys(initialMetadata).length > 0 ? JSON.stringify(initialMetadata) : null,
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
  /** Add status condition (array or single value) */
  private addStatusCondition(
    status: ContractQueryOptions['status'],
    conditions: string[],
    params: any[]
  ): void {
    if (!status) return;
    if (Array.isArray(status)) {
      conditions.push(`status IN (${status.map(() => '?').join(',')})`);
      params.push(...status);
    } else {
      conditions.push('status = ?');
      params.push(status);
    }
  }

  /** Append ORDER BY / LIMIT / OFFSET clauses */
  private appendQueryTail(
    query: string,
    options: ContractQueryOptions,
    params: any[]
  ): string {
    if (options.sort_by) {
      query += ` ORDER BY ${options.sort_by} ${options.sort_order === 'asc' ? 'ASC' : 'DESC'}`;
    }
    if (options.limit !== undefined) { query += ' LIMIT ?'; params.push(options.limit); }
    if (options.offset !== undefined) {
      if (options.limit === undefined) query += ' LIMIT -1';
      query += ' OFFSET ?';
      params.push(options.offset);
    }
    return query;
  }

  /** Build WHERE clause and params from query options */
  private buildQueryFromOptions(options: ContractQueryOptions): { query: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    const delegatorId = options.delegator_agent_id ?? options.delegator_id;
    const delegateeId = options.delegatee_agent_id ?? options.delegatee_id;

    if (delegatorId) { conditions.push('delegator_agent_id = ?'); params.push(delegatorId); }
    if (delegateeId) { conditions.push('delegatee_agent_id = ?'); params.push(delegateeId); }
    if (options.task_id) { conditions.push('task_id = ?'); params.push(options.task_id); }

    this.addStatusCondition(options.status, conditions, params);

    if (options.delegation_depth !== undefined) { conditions.push('delegation_depth = ?'); params.push(options.delegation_depth); }
    if (options.parent_contract_id) { conditions.push('parent_contract_id = ?'); params.push(options.parent_contract_id); }
    if (options.priority !== undefined) { conditions.push('priority = ?'); params.push(options.priority); }

    let query = 'SELECT * FROM delegation_contracts';
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query = this.appendQueryTail(query, options, params);

    return { query, params };
  }

  queryContracts(options: ContractQueryOptions = {}): DelegationContract[] {
    const { query, params } = this.buildQueryFromOptions(options);
    type ContractRow = Record<string, unknown>; const rows = this.db.prepare(query).all(...params) as ContractRow[];
    return rows.map(row => this.rowToContract(row as Parameters<typeof this.rowToContract>[0]));
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
    
    type StatsRow = Record<string, unknown>; const stats = this.db.prepare(query).get(...params) as StatsRow | undefined;
    
    const total = (stats?.total as number | undefined) || 0;
    const completed = (stats?.completed as number | undefined) || 0;
    const failed = (stats?.failed as number | undefined) || 0;
    const decidedTotal = completed + failed;
    
    return {
      total,
      active: (stats?.active as number | undefined) || 0,
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
    const { scopes, actions } = this.collectScopesAndActions(input);
    const joined = `${Array.from(scopes).join(' ')} ${Array.from(actions).join(' ')}`;
    const hasCriticalPermission = /(root|admin|execute|delete|modify_system|system_admin|root_access|execute_arbitrary)/i.test(joined);
    if (hasCriticalPermission) {
      return { threat_type: 'permission_escalation', severity: 'critical', description: 'Detected high-risk permission scopes or actions.', action: 'block' };
    }

    const depth = Number(input.metadata?.delegation_depth ?? 0);
    if (Number.isFinite(depth) && depth >= 6) {
      return { threat_type: 'permission_escalation', severity: 'critical', description: 'Delegation chain depth exceeds safe limits.', action: 'block' };
    }

    if (this.isExcessiveResourceRequirement(input.resource_requirements)) {
      return { threat_type: 'abuse_pattern', severity: 'critical', description: 'Resource requirements indicate possible abuse or exhaustion attempt.', action: 'block' };
    }

    if (input.tlp_classification === 'TLP:RED' && hasCriticalPermission) {
      return { threat_type: 'permission_escalation', severity: 'critical', description: 'High-sensitivity contract with excessive permissions.', action: 'block' };
    }

    return null;
  }

  /** @private Collect all scopes and actions from permission tokens */
  private collectScopesAndActions(input: { permission_token?: any; permission_tokens?: any[] }): { scopes: Set<string>; actions: Set<string> } {
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
    return { scopes, actions };
  }

  /** @private Check if resource requirements exceed safe thresholds */
  private isExcessiveResourceRequirement(requirements: any): boolean {
    const memory = Number(requirements?.memory_mb ?? 0);
    const cpu = Number(requirements?.cpu_cores ?? 0);
    const disk = Number(requirements?.disk_space_mb ?? 0);
    return (Number.isFinite(memory) && memory > 8192)
      || (Number.isFinite(cpu) && cpu > 8)
      || (Number.isFinite(disk) && disk > 512000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Execution Mode: Phase 3 – Selection, Lifecycle Hooks, Handoff
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Select the execution mode for a delegation request using a 4-tier priority:
   *
   * 1. **Explicit** — `request.execution_mode` field (highest priority)
   * 2. **OpenSpec hint** — `request.metadata?.openspec_execution_mode`
   * 3. **Agent manifest preference** — `delegateeManifest.preferred_execution_mode`
   * 4. **Default** — `ExecutionMode.INTERACTIVE`
   *
   * In addition, the selected mode must be in the agent's `supported_execution_modes`
   * (when declared), and background mode requires available queue capacity.
   *
   * @returns The resolved `ExecutionMode`.
   */
  selectExecutionMode(
    request: CreateDelegationContractRequest & { metadata?: Record<string, unknown> },
    delegateeManifest?: AgentCapabilityManifest,
  ): ExecutionMode {
    const supportedModes: Set<ExecutionMode> | undefined =
      delegateeManifest?.supported_execution_modes
        ? new Set(delegateeManifest.supported_execution_modes)
        : undefined; // undefined ⇒ all modes assumed supported (backward compat)

    const supportsMode = (m: ExecutionMode): boolean =>
      supportedModes === undefined || supportedModes.has(m);

    // Tier 1: Explicit override
    if (request.execution_mode && supportsMode(request.execution_mode)) {
      return this._applyQueueGuard(request.execution_mode);
    }

    // Tier 2: OpenSpec hint stored in metadata
    const openspecHint =
      (request as any).metadata?.openspec_execution_mode as ExecutionMode | undefined;
    if (openspecHint && Object.values(ExecutionMode).includes(openspecHint) && supportsMode(openspecHint)) {
      return this._applyQueueGuard(openspecHint);
    }

    // Tier 3: Agent manifest preference
    const manifestPref = delegateeManifest?.preferred_execution_mode;
    if (manifestPref && supportsMode(manifestPref)) {
      return this._applyQueueGuard(manifestPref);
    }

    // Tier 4: Default
    return ExecutionMode.INTERACTIVE;
  }

  /**
   * Degrade BACKGROUND → INTERACTIVE when the queue is at capacity.
   * @private
   */
  private _applyQueueGuard(mode: ExecutionMode): ExecutionMode {
    if (mode === ExecutionMode.BACKGROUND && !this.backgroundQueue.hasCapacity()) {
      this.emit('background_queue_full', this.backgroundQueue.getStatus());
      return ExecutionMode.INTERACTIVE;
    }
    return mode;
  }

  /**
   * Get the current background session queue status.
   */
  getBackgroundQueueStatus() {
    return this.backgroundQueue.getStatus();
  }

  /**
   * Expose the session manager for external lifecycle queries.
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Expose the session checkpoint manager.
   */
  getCheckpoint(): SessionCheckpoint {
    return this.checkpoint;
  }

  // ─────────── Lifecycle Hooks ───────────

  /**
   * **Phase 3.2 / 3.4** — Must be called after creating a BACKGROUND contract.
   * - Acquires a background queue slot (waits if at capacity)
   * - Registers the session in the session manager
   * - Optionally records the worktree path returned by `worktree-coordinator`
   *
   * Emits: `session.created`
   */
  async beforeBackgroundExecution(
    contractId: string,
    sessionId: string,
    worktreePath?: string,
  ): Promise<void> {
    // Acquire queue slot
    await this.backgroundQueue.acquire(sessionId, contractId);

    // Register session
    const sessionState = {
      status: 'active' as const,
      conversationMessages: [],
      lastActivity: new Date().toISOString(),
      ...(worktreePath !== undefined && { worktreePath }),
    };
    this.sessionManager.register(sessionId, contractId, ExecutionMode.BACKGROUND, sessionState);
    this.emit('session.created', { sessionId, contractId, mode: ExecutionMode.BACKGROUND, worktreePath });
  }

  /**
   * **Phase 3.2 / 3.4** — Must be called when a BACKGROUND contract completes.
   * - Releases the background queue slot
   * - Archives the session
   *
   * Emits: `session.archived`
   */
  afterBackgroundExecution(contractId: string, sessionId: string): void {
    this.backgroundQueue.release(sessionId);
    try {
      this.sessionManager.archive(sessionId);
    } catch {
      // Session may have already been archived via handoff — safe to ignore
    }
    this.emit('session.archived', { sessionId, contractId, mode: ExecutionMode.BACKGROUND });
  }

  /**
   * **Phase 3.5** — Must be called after creating an ASYNC contract.
   * - Registers the session in the session manager
   * - Optionally records the feature branch name
   *
   * Emits: `session.created`
   */
  beforeAsyncExecution(
    contractId: string,
    sessionId: string,
    branchName?: string,
  ): void {
    const sessionState = {
      status: 'active' as const,
      conversationMessages: [],
      lastActivity: new Date().toISOString(),
    };
    this.sessionManager.register(sessionId, contractId, ExecutionMode.ASYNC, sessionState);
    this.emit('session.created', { sessionId, contractId, mode: ExecutionMode.ASYNC, branchName });
  }

  /**
   * **Phase 3.5** — Must be called when an ASYNC contract completes.
   * - Archives the session
   * - Optionally records the PR number in session metadata before archiving
   *
   * Emits: `session.archived`
   */
  afterAsyncExecution(
    contractId: string,
    sessionId: string,
    prNumber?: number,
  ): void {
    // Record PR number in session state before archiving
    if (prNumber !== undefined) {
      try {
        this.sessionManager.updateState(sessionId, { prNumber });
      } catch {
        // Session may not be registered — no-op
      }
    }
    try {
      this.sessionManager.archive(sessionId);
    } catch {
      // Already archived — safe to ignore
    }
    this.emit('session.archived', { sessionId, contractId, mode: ExecutionMode.ASYNC, prNumber });
  }

  // ─────────── Session Handoff ───────────

  /**
   * **Phase 3.6** — Perform an atomic session handoff between execution modes.
   *
   * Steps (all-or-nothing; rolls back on failure):
   *  1. Create a `pre-handoff` checkpoint of the current session state
   *  2. Create a new contract in the target execution mode
   *  3. Archive the original session
   *  4. Emit `session.handoff`
   *
   * @param request - Source contract ID, target mode, context snapshot, and reason
   * @returns The newly created contract (in the target mode)
   * @throws If the source contract does not exist or the new contract cannot be created
   */
  async handoffSession(
    request: SessionHandoffRequest & {
      /** Optional: extra fields forwarded to the new contract. */
      newContractOverrides?: Partial<CreateDelegationContractRequest>;
    },
  ): Promise<DelegationContract> {
    const { fromContractId, toExecutionMode, contextSnapshot, handoffReason } = request;

    // 1. Load source contract
    const sourceContract = this.getContractById(fromContractId);
    if (!sourceContract) {
      throw new Error(`handoffSession: source contract not found: ${fromContractId}`);
    }

    const fromSessionId = sourceContract.session_id;
    const fromMode = sourceContract.execution_mode ?? ExecutionMode.INTERACTIVE;

    // 2. Checkpoint current state before handoff
    const messageCount = Array.isArray(contextSnapshot?.conversationHistory)
      ? contextSnapshot.conversationHistory.length
      : 0;
    let checkpointId: string | undefined;
    if (fromSessionId) {
      try {
        const sessionState = {
          status: 'active' as const,
          conversationMessages: contextSnapshot?.conversationHistory ?? [],
          lastActivity: new Date().toISOString(),
        };
        const cp = this.checkpoint.create(
          fromSessionId,
          fromContractId,
          sessionState,
          'pre-handoff',
          messageCount,
          { toMode: toExecutionMode, reason: handoffReason },
        );
        checkpointId = cp.id;
      } catch {
        // Non-fatal — continue with handoff
      }
    }

    // 3. Create new contract in the target mode
    let newContract: DelegationContract;
    try {
      newContract = await this.createContract({
        delegator: sourceContract.delegator,
        delegatee: sourceContract.delegatee,
        task_id: `${sourceContract.task_id}-handoff-${Date.now()}`,
        task_description: sourceContract.task_description,
        verification_policy: sourceContract.verification_policy,
        success_criteria: sourceContract.success_criteria,
        timeout_ms: sourceContract.timeout_ms,
        priority: sourceContract.priority,
        parent_contract_id: fromContractId,
        tlp_classification: sourceContract.tlp_classification,
        execution_mode: toExecutionMode,
        ...(request.newContractOverrides ?? {}),
      });
    } catch (err) {
      // Rollback: restore source contract to active (it was never changed)
      throw new Error(
        `handoffSession: failed to create target contract — ${(err as Error).message}`,
      );
    }

    // 4. Archive original session
    if (fromSessionId) {
      try {
        this.sessionManager.archive(fromSessionId);
        if (fromMode === ExecutionMode.BACKGROUND) {
          this.backgroundQueue.release(fromSessionId);
        }
      } catch {
        // Already archived — safe to ignore
      }
    }

    // 5. Record handoff history and emit event
    const handoffRecord: SessionHandoff = {
      fromContractId,
      toContractId: newContract.contract_id,
      fromMode,
      toMode: toExecutionMode,
      handoffReason,
      handoffAt: new Date().toISOString(),
      contextSnapshot: {
        conversationHistory: contextSnapshot?.conversationHistory ?? [],
        artifacts: contextSnapshot?.artifacts ?? [],
        checkpointId,
      },
    };
    this.emit('session.handoff', handoffRecord);

    return newContract;
  }

  /**
   * Convert database row to DelegationContract
   */
  private rowToContract(row: any): DelegationContract {
    const metadata: Record<string, unknown> = row.metadata ? JSON.parse(row.metadata) : {};

    // Recover execution_mode / session_id stored in metadata (backward-compatible)
    const executionMode = (metadata['execution_mode'] as ExecutionMode | undefined)
      ?? ExecutionMode.INTERACTIVE;
    const sessionId = metadata['session_id'] as string | undefined;

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
      execution_mode: executionMode,
      session_id: sessionId,
      metadata,
    };
  }
}

// Export aliases for backward compatibility
export { DelegationContractManager as ContractManager };
export type { DelegationContractManagerConfig as ContractManagerConfig };
export type { CreateDelegationContractRequest as ContractUpdate };
export type { ContractQueryOptions as ContractQuery };

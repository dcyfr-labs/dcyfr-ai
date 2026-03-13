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
import { SecurityMiddlewareChain } from './security-middleware-chain.js';
import { IdentityMiddleware } from './middleware/identity-middleware.js';
import { TLPMiddleware } from './middleware/tlp-middleware.js';
import { ThreatValidatorMiddleware } from './middleware/threat-validator-middleware.js';
import { RateLimiterMiddleware, type RateLimiterOptions } from './middleware/rate-limiter-middleware.js';
import { ChainDepthMiddleware } from './middleware/chain-depth-middleware.js';
import { ContentPolicyMiddleware } from './middleware/content-policy-middleware.js';
import { PermissionsMiddleware } from './middleware/permissions-middleware.js';
import { ReputationMiddleware } from './middleware/reputation-middleware.js';
import { CircuitBreaker, CircuitBreakerMiddleware } from './circuit-breaker.js';
import { ContractTimeoutWatchdog } from './timeout-watchdog.js';
import { AgentRegistry } from './agent-registry.js';
import { BlastRadiusTracker } from './blast-radius-tracker.js';
import type { SecurityContext } from '../types/security-middleware.js';
import { TLPEnforcementEngine } from '../src/delegation/tlp-enforcement.js';
import type { AgentClearance } from '../src/delegation/tlp-enforcement.js';
import { ReputationEngine } from '../reputation/reputation-engine.js';
import { DelegationHealthMonitor } from './monitoring.js';
import { FeatureFlagMiddleware } from './middleware/feature-flag-middleware.js';
import { ChainTrackerMiddleware } from './middleware/chain-tracker-middleware.js';
import { ResourceLimiterMiddleware } from './middleware/resource-limiter-middleware.js';
import { FeatureFlagManager, DEFAULT_FEATURE_FLAGS } from './feature-flags.js';

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

  /**
   * Handoff context from a prior completed contract to carry into this one.
   * Stored in contract metadata under `handoff_context` key.
   * @since 3.0.0
   */
  handoff_context?: {
    source_contract_id: string;
    timestamp: string;
    conversation_snapshot?: unknown[];
    artifact_snapshot?: unknown[];
    context_summary?: string;
  };

  /**
   * When true, the executing agent must obtain explicit user confirmation
   * before executing the primary action.
   * @since 3.0.0
   */
  requires_confirmation?: boolean;
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
  /** Optional caller agent ID — when set, ownership is verified before applying the update. */
  caller_id?: string;
  status?: DelegationContractStatus;
  activated_at?: string;
  completed_at?: string;
  verification_result?: VerificationResult;
  metadata?: Record<string, unknown>;
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
  /**
   * Optional agent identity registry.  When provided, enables IdentityMiddleware
   * which enforces HMAC-token verification for delegator/delegatee on every createContract.
   */
  agentRegistry?: AgentRegistry;
  /**
   * Additional TLP clearances to seed into the TLPEnforcementEngine at startup.
   * Useful in tests and custom deployments where agents not in DEFAULT_AGENT_CLEARANCES
   * require access to AMBER/GREEN/RED classified contracts.
   */
  additionalTLPClearances?: AgentClearance[];
  /**
   * Optional ReputationEngine instance.  When provided, enables:
   *  - ReputationMiddleware (7.1): blocks low-reputation agents on TLP:AMBER+ tasks
   *  - Security violation penalty (7.2): reduces security_score when a threat is detected
   */
  reputationEngine?: ReputationEngine;
  /**
   * Optional DelegationHealthMonitor instance.  When provided, the manager wires
   * a live contract data provider so that collectMetrics() returns real counts (8.1).
   */
  healthMonitor?: DelegationHealthMonitor;
  /**
   * Optional rate-limiter overrides.  Useful in tests to set a lower `maxOps`
   * and shorter `windowMs` to verify rate-limiting without hitting 50 ops/hour.
   */
  rateLimiterOptions?: RateLimiterOptions;
  /**
   * Optional FeatureFlagManager instance.  When provided, the FeatureFlagMiddleware
   * uses this instance to check `delegation_enabled` kill-switch.  Defaults to the
   * global singleton from getFeatureFlagManager().
   */
  featureFlagManager?: FeatureFlagManager;
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
  private securityThreatEvents: Array<Record<string, unknown>> = [];
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
  /** Pluggable security middleware chain — evaluated on every createContract. */
  private readonly securityChain: SecurityMiddlewareChain;
  /** Chain depth + fan-out middleware (also manages fan-out counters). */
  private readonly chainDepthMiddleware: ChainDepthMiddleware;
  /** Circuit breaker state machine for per-agent failure tracking. */
  private readonly circuitBreaker: CircuitBreaker;
  /** Periodic contract timeout watchdog. */
  private readonly watchdog: ContractTimeoutWatchdog;
  /** Optional agent identity registry (enables IdentityMiddleware). */
  private readonly agentRegistry?: AgentRegistry;
  /** Blast-radius limiter — caps contract-creation rate per root delegator tree. */
  private readonly blastRadiusTracker: BlastRadiusTracker;
  /** Optional reputation engine (enables ReputationMiddleware + security penalties). */
  private readonly reputationEngine?: ReputationEngine;
  /** Optional health monitor wired to live contract stats (8.1). */
  private readonly healthMonitor?: DelegationHealthMonitor;

  constructor(config: DelegationContractManagerConfig = {}) {
    super();
    
    this.maxDelegationDepth = config.maxDelegationDepth ?? 5;
    this.debug = config.debug ?? false;
    this.capabilityRegistry = config.capabilityRegistry;
    this.agentRegistry = config.agentRegistry;
    this.reputationEngine = config.reputationEngine;

    // 8.1: Wire health monitor to live contract data
    this.healthMonitor = config.healthMonitor;
    if (this.healthMonitor) {
      this.healthMonitor.setContractDataProvider(() => this.getStatistics());
    }
    
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

    // ── Security middleware chain ──────────────────────────────────────────
    this.blastRadiusTracker = new BlastRadiusTracker();
    this.chainDepthMiddleware = new ChainDepthMiddleware({ maxDepth: this.maxDelegationDepth });
    this.circuitBreaker = new CircuitBreaker();
    this.watchdog = new ContractTimeoutWatchdog();

    this.securityChain = new SecurityMiddlewareChain();
    // 1.3: FeatureFlagMiddleware — kill-switch, must be first in chain.
    // When no featureFlagManager is provided, create a local instance with
    // delegation_enabled=true so existing consumers work out of the box.
    const flagManager = config.featureFlagManager ?? new FeatureFlagManager({
      ...DEFAULT_FEATURE_FLAGS,
      delegation_enabled: true,
    });
    this.securityChain.use(new FeatureFlagMiddleware(flagManager));
    if (this.agentRegistry) {
      this.securityChain.use(new IdentityMiddleware(this.agentRegistry));
    }
    // Build TLP engine with any caller-supplied extra clearances
    const tlpEngine = new TLPEnforcementEngine();
    if (config.additionalTLPClearances) {
      for (const c of config.additionalTLPClearances) {
        tlpEngine.setAgentClearance(c);
      }
    }
    this.securityChain.use(new TLPMiddleware(tlpEngine));
    this.securityChain.use(this.chainDepthMiddleware);
    this.securityChain.use(new ThreatValidatorMiddleware());
    this.securityChain.use(new RateLimiterMiddleware(config.rateLimiterOptions));
    this.securityChain.use(new ContentPolicyMiddleware());
    this.securityChain.use(new PermissionsMiddleware((parentContractId) => {
      const parent = this.getContractById(parentContractId);
      return parent?.permission_tokens ?? null;
    }));
    // 7.1: ReputationMiddleware — block low-reputation agents on TLP:AMBER+ tasks
    if (this.reputationEngine) {
      this.securityChain.use(new ReputationMiddleware(this.reputationEngine));
    }
    this.securityChain.use(new CircuitBreakerMiddleware(this.circuitBreaker));
    // 3.4: ChainTrackerMiddleware — loop detection and depth validation (create-only)
    this.securityChain.use(new ChainTrackerMiddleware(this, { maxChainDepth: this.maxDelegationDepth }));
    // 4.3: ResourceLimiterMiddleware — aggregate resource cap (create-only)
    this.securityChain.use(new ResourceLimiterMiddleware(
      () => this.queryContracts({ status: 'active' }),
    ));

    // Forward chain events upstream for observability
    this.securityChain.on('security_warning', (ev) => this.emit('security_warning', ev));
    this.securityChain.on('security_blocked', (ev) => this.emit('security_blocked', ev));
    this.securityChain.on('chain_evaluated', (ev) => this.emit('chain_evaluated', ev));

    // Forward watchdog timeout events and update contract status
    this.watchdog.on('contract_timeout', (ev) => {
      this.emit('contract_timeout', ev);
      try {
        void this.updateContract({ contract_id: ev.contract_id, status: 'timeout' as DelegationContractStatus });
      } catch { /* contract may have already completed/been removed */ }
    });

    // Forward circuit breaker open → circuit_breaker_tripped (8.4)
    this.circuitBreaker.on('circuit_opened', (ev: { agent_id: string; failure_count: number }) => {
      this.emit('circuit_breaker_tripped', { agent_id: ev.agent_id, failure_count: ev.failure_count });
    });

    // 7.2: Security violation penalty — penalise delegatee reputation on threat detection
    if (this.reputationEngine) {
      const reputationEngine = this.reputationEngine;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.on('security_threat_detected', (ev: Record<string, any>) => {
        const contract = ev.contract_id ? this.getContractById(ev.contract_id) : undefined;
        if (!contract?.delegatee?.agent_id) return;
        void reputationEngine.updateReputation({
          contract_id: ev.contract_id ?? 'unknown',
          agent_id: contract.delegatee.agent_id,
          agent_name: contract.delegatee.agent_name ?? contract.delegatee.agent_id,
          task_id: contract.task_id ?? 'unknown',
          success: false,
          completion_time_ms: 0,
          security_violations: 1,
        });
      });
    }

    this.watchdog.start();
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  /**
   * 5.3 Sanitize task description text — strip null bytes and Unicode direction
   * override characters while preserving legitimate Unicode (emoji, CJK, etc.).
   */
  private sanitizeTaskDescription(text: string): string {
    return text
      // Remove null bytes
      .replace(/\0/g, '')
      // Remove Unicode direction override characters (U+202A–U+202E, U+2066–U+2069)
      .replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
  }

  /**
   * 6.2: Walk the parent chain to find the root delegator agent_id.
   * Falls back to the provided delegator ID if no traceable parent exists.
   */
  private getRootDelegatorId(
    parentContractId: string | null,
    fallbackDelegatorId: string,
  ): string {
    if (!parentContractId) {
      return fallbackDelegatorId;
    }
    // Walk up the chain (guard against cycles with a depth cap)
    let current = this.getContractById(parentContractId);
    for (let i = 0; i < 20 && current; i++) {
      if (!current.parent_contract_id) {
        return current.delegator.agent_id;
      }
      current = this.getContractById(current.parent_contract_id);
    }
    return fallbackDelegatorId;
  }

  /** Run security validation, emit threat event and throw if a threat is detected */
  private async validateContractSecurity(
    request: CreateDelegationContractRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    legacyRequest: Record<string, any>,
    normalizedPermissionTokens: Array<{ token_id: string; scopes: string[]; delegatable?: boolean; max_delegation_depth?: number }> | undefined,
  ): Promise<void> {
    this.securityValidationCount++;

    // 2.6: Validate PermissionToken holder/issuer identity binding
    if (normalizedPermissionTokens) {
      for (const token of normalizedPermissionTokens) {
        const t = token as typeof token & { holder?: string; issuer?: string };
        if (t.holder !== undefined && t.holder !== request.delegatee.agent_id) {
          throw new Error(
            `Permission token '${token.token_id}': holder '${t.holder}' does not match delegatee '${request.delegatee.agent_id}'`,
          );
        }
        if (t.issuer !== undefined && t.issuer !== request.delegator.agent_id) {
          throw new Error(
            `Permission token '${token.token_id}': issuer '${t.issuer}' does not match delegator '${request.delegator.agent_id}'`,
          );
        }
      }
    }

    // ── Pre-flight threat guards ───────────────────────────────────────────
    // These three checks mirror the behaviour of the original detectSecurityThreat()
    // whose private helpers were removed in task 1.6.  We keep them as inline
    // pre-chain guards because the SecurityMiddlewareChain cannot (a) access
    // permission_token.scopes from the array form, (b) evaluate resource
    // requirements outside the DelegationContract type, or (c) guarantee the
    // same risk-score thresholds as the original contract-level checks.

    // Guard 1: critical permission scopes / actions → permission_escalation
    {
      const allScopes = new Set<string>();
      const allActions = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacyPt = (legacyRequest as any)?.permission_token;
      if (legacyPt && typeof legacyPt === 'object' && !Array.isArray(legacyPt)) {
        for (const s of legacyPt.scopes ?? []) allScopes.add(String(s).toLowerCase());
        for (const a of legacyPt.actions ?? []) allActions.add(String(a).toLowerCase());
      }
      for (const token of normalizedPermissionTokens ?? []) {
        for (const s of (token as any).scopes ?? []) allScopes.add(String(s).toLowerCase()); // eslint-disable-line @typescript-eslint/no-explicit-any
        for (const a of (token as any).actions ?? []) allActions.add(String(a).toLowerCase()); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      const joined = `${Array.from(allScopes).join(' ')} ${Array.from(allActions).join(' ')}`;
      if (/(root|admin|execute|delete|modify_system|system_admin|root_access|execute_arbitrary)/i.test(joined)) {
        this.securityThreatCount++;
        const te = { contract_id: request.contract_id || `preflight-${Date.now()}`, threat_detected: true, threat_type: 'permission_escalation', severity: 'critical' as const, description: 'Detected high-risk permission scopes or actions.', action: 'block', timestamp: new Date().toISOString() };
        this.securityThreatEvents.push(te);
        this.emit('security_threat_detected', te);
        throw new Error('Security threat detected: permission_escalation');
      }
    }

    // Guard 2: excessive delegation depth in metadata → permission_escalation
    {
      const depth = Number(legacyRequest?.metadata?.delegation_depth ?? 0);
      if (Number.isFinite(depth) && depth >= 6) {
        this.securityThreatCount++;
        const te = { contract_id: request.contract_id || `preflight-${Date.now()}`, threat_detected: true, threat_type: 'permission_escalation', severity: 'critical' as const, description: 'Delegation chain depth exceeds safe limits.', action: 'block', timestamp: new Date().toISOString() };
        this.securityThreatEvents.push(te);
        this.emit('security_threat_detected', te);
        throw new Error('Security threat detected: permission_escalation');
      }
    }

    // Guard 3: excessive per-contract resource requirements → abuse_pattern
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rr = (legacyRequest as any)?.resource_requirements;
      const memory = Number(rr?.memory_mb ?? 0);
      const cpu    = Number(rr?.cpu_cores   ?? 0);
      const disk   = Number(rr?.disk_space_mb ?? 0);
      if ((Number.isFinite(memory) && memory > 8192) || (Number.isFinite(cpu) && cpu > 8) || (Number.isFinite(disk) && disk > 512000)) {
        this.securityThreatCount++;
        const te = { contract_id: request.contract_id || `preflight-${Date.now()}`, threat_detected: true, threat_type: 'abuse_pattern', severity: 'critical' as const, description: 'Resource requirements indicate possible abuse or exhaustion attempt.', action: 'block', timestamp: new Date().toISOString() };
        this.securityThreatEvents.push(te);
        this.emit('security_threat_detected', te);
        throw new Error('Security threat detected: abuse_pattern');
      }
    }

    // ── SecurityMiddlewareChain ────────────────────────────────────────────
    const rawTlp = request.tlp_classification || legacyRequest?.tlp_classification;
    const tlpLevel = rawTlp ? rawTlp.replace('TLP:', '') : undefined;
    const context: SecurityContext = {
      operation: 'create',
      contract: {
        contract_id: request.contract_id,
        delegator: request.delegator,
        delegatee: request.delegatee,
        delegation_depth: 0,
        tlp_classification: tlpLevel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        permission_tokens: normalizedPermissionTokens as any,
        parent_contract_id: request.parent_contract_id,
        // Expose these fields so ThreatValidatorMiddleware can run its full checks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(legacyRequest?.resource_requirements ? { resource_requirements: legacyRequest.resource_requirements as any } : {}),
        metadata: legacyRequest?.metadata,
      },
      // Provide auth fields so IdentityMiddleware can verify signatures
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delegator_auth: request.delegator as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delegatee_auth: request.delegatee as any,
      task_content: legacyRequest.task_content ??
        (request.task_description ? { instruction: request.task_description } : undefined),
      metadata: legacyRequest?.metadata,
      timestamp_ms: Date.now(),
      // Enable core security gates by default; callers may override via metadata
      feature_flags: {
        security_monitoring: true,
        chain_tracking: true,
        identity_auth: !!(this.agentRegistry),
        content_security: true,
        reputation_tracking: !!(this.reputationEngine),
        ...(legacyRequest.feature_flags ?? {}),
      },
    };

    const chainResult = await this.securityChain.evaluate(context);
    if (chainResult.action === 'block') {
      this.securityThreatCount++;
      const bv = chainResult.blocking_verdict!;
      const threatEvent = {
        contract_id: request.contract_id || request.task_id || `preflight-${Date.now()}`,
        threat_detected: true,
        threat_type: bv.threat_type ?? 'security_chain_block',
        severity: bv.severity ?? 'critical',
        description: bv.reason ?? 'Security middleware chain blocked this contract.',
        action: 'block',
        timestamp: new Date().toISOString(),
        blocked_by: chainResult.blocked_by,
        evidence: bv.evidence,
      };
      this.securityThreatEvents.push(threatEvent);
      this.emit('security_threat_detected', threatEvent);
      throw new Error(`Security threat detected: ${bv.threat_type ?? 'security_chain_block'}`);
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

    const normalizedTaskDescription = this.sanitizeTaskDescription(
      request.task_description || legacyRequest?.description || request.task_id || 'Delegated task'
    );
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

    await this.validateContractSecurity(request, legacyRequest, normalizedPermissionTokens);

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
    
    // 6.2: Blast radius check — cap contract-creation rate per root delegator tree
    const rootDelegatorId = this.getRootDelegatorId(
      request.parent_contract_id ?? null,
      normalizedDelegator.agent_id,
    );
    const blastCheck = this.blastRadiusTracker.check(rootDelegatorId);
    if (!blastCheck.allowed) {
      throw new Error(
        `Blast radius limit exceeded for root delegator '${rootDelegatorId}': ` +
        `${blastCheck.currentCount}/${blastCheck.limit} contracts in the current window`,
      );
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
    const initialMetadata: Record<string, unknown> = {
      // 8.4: always persist execution_mode so DelegationContract.execution_mode is never derived from default
      execution_mode: executionMode,
    };
    if (sessionId) {
      initialMetadata['session_id'] = sessionId;
    }
    // v3.0.0: persist handoff_context and requires_confirmation in metadata
    if (request.handoff_context !== undefined) {
      initialMetadata['handoff_context'] = request.handoff_context;
    }
    if (request.requires_confirmation !== undefined) {
      initialMetadata['requires_confirmation'] = request.requires_confirmation;
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

    // 6.2: Record contract in blast radius tracker
    this.blastRadiusTracker.record(rootDelegatorId);

    // Track fan-out counter for the delegator
    if (request.parent_contract_id) {
      this.chainDepthMiddleware.incrementFanOut(normalizedDelegator.agent_id);
    }

    // Register contract with timeout watchdog
    this.watchdog.track({
      contract_id,
      created_at,
      timeout_ms: normalizedTimeout,
      status,
    });
    
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
    params: unknown[]
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
    params: unknown[]
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
  private buildQueryFromOptions(options: ContractQueryOptions): { query: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

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
  private buildUpdateFields(updates: ContractUpdateOptions): { fields: string[]; params: unknown[] } {
    const fields: string[] = [];
    const params: unknown[] = [];

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

    // 2.4: Caller ownership check
    if (updates.caller_id) {
      const isOwner =
        existing.delegator.agent_id === updates.caller_id ||
        existing.delegatee.agent_id === updates.caller_id;
      if (!isOwner) {
        throw new Error(
          `Unauthorized: agent '${updates.caller_id}' is not the delegator or delegatee of contract '${contract_id}'`,
        );
      }
    }

    // 1.5: Run security chain (FeatureFlags + Identity) for update operations.
    // Heavy create-only middleware (TLP, ThreatValidator, etc.) are skipped via appliesTo.
    const updateContext: SecurityContext = {
      operation: 'update',
      contract: {
        contract_id: existing.contract_id,
        delegator: existing.delegator,
        delegatee: existing.delegatee,
      },
      timestamp_ms: Date.now(),
      feature_flags: { identity_auth: !!(this.agentRegistry) },
    };
    const updateResult = await this.securityChain.evaluate(updateContext);
    if (updateResult.action === 'block') {
      const bv = updateResult.blocking_verdict!;
      throw new Error(`Security check failed for contract update: ${bv.reason ?? bv.threat_type}`);
    }

    // 5.1: State machine — once a contract reaches a terminal state it cannot be changed
    const terminalStates = new Set(['completed', 'failed', 'cancelled', 'revoked', 'timeout']);
    if (updates.status && terminalStates.has(existing.status)) {
      throw new Error(
        `Invalid state transition: ${existing.status} → ${updates.status} (terminal state cannot be changed)`,
      );
    }

    // 4.6: Non-empty output validation — reject completion without verification_result
    if (updates.status === 'completed' && !updates.verification_result) {
      throw new Error('Cannot complete contract without verification_result');
    }

    // 6.5: Quarantine on failed verification or quality below threshold
    if (updates.status === 'completed' && updates.verification_result) {
      const vr = updates.verification_result;
      const qualityFail = typeof vr.quality_score === 'number' && vr.quality_score < 0.7;
      if (vr.verified === false || qualityFail) {
        const quarantineReason = vr.verified === false ? 'verification_failed' : 'quality_below_threshold';
        return this.updateContract({
          contract_id,
          status: 'failed' as DelegationContractStatus,
          verification_result: vr,
          metadata: { ...(existing.metadata ?? {}), quarantined: true, quarantine_reason: quarantineReason },
        });
      }
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
    } else if (updates.status === 'failed') {
      this.emit('contract_failed', contract);
    } else if (updates.status === 'revoked') {
      this.emit('contract_revoked', contract);
    } else if (updates.status === 'cancelled') {
      this.emit('contract_cancelled', contract);
    } else if (updates.status === 'timeout') {
      this.emit('contract_timeout_fired', contract);
    }

    // 6.3: Cascading revocation — when a contract is revoked, revoke all non-terminal children
    if (updates.status === 'revoked') {
      const terminalSet = new Set(['completed', 'failed', 'cancelled', 'revoked', 'timeout']);
      const children = this.queryContracts({ parent_contract_id: contract_id });
      for (const child of children) {
        if (!terminalSet.has(child.status)) {
          await this.updateContract({ contract_id: child.contract_id, status: 'revoked' as DelegationContractStatus });
        }
      }
    }

    // On terminal status: release fan-out slot + untrack from watchdog
    const terminalStatuses = ['completed', 'failed', 'cancelled', 'revoked', 'timeout'];
    if (updates.status && terminalStatuses.includes(updates.status)) {
      if (contract.parent_contract_id) {
        this.chainDepthMiddleware.decrementFanOut(contract.delegator.agent_id);
      }
      this.watchdog.untrack(contract_id);
      // Record circuit breaker outcome
      if (updates.status === 'completed') {
        this.circuitBreaker.recordSuccess(contract.delegatee.agent_id);
      } else if (updates.status === 'failed') {
        this.circuitBreaker.recordFailure(contract.delegatee.agent_id);
      }

      // 1.4.6: Container outcome -> reputation update (success/failure)
      if (
        this.reputationEngine
        && (updates.status === 'completed' || updates.status === 'failed')
      ) {
        const mergedMetadata = {
          ...(existing.metadata ?? {}),
          ...(updates.metadata ?? {}),
        };
        const isContainerExecution =
          mergedMetadata.execution_environment === 'container'
          || Boolean(mergedMetadata.container_handle);

        if (isContainerExecution) {
          const completionTimeMsRaw = mergedMetadata.container_execution_time_ms;
          const completionTimeMs =
            typeof completionTimeMsRaw === 'number' && Number.isFinite(completionTimeMsRaw)
              ? completionTimeMsRaw
              : 0;

          void this.reputationEngine.updateReputation({
            contract_id: contract.contract_id,
            agent_id: contract.delegatee.agent_id,
            agent_name: contract.delegatee.agent_name,
            task_id: contract.task_id,
            success: updates.status === 'completed',
            completion_time_ms: completionTimeMs,
            metadata: {
              execution_environment: 'container',
              timed_out: mergedMetadata.timed_out,
              container_exit_code: mergedMetadata.container_exit_code,
            },
          });
        }
      }
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
    options?: { metadata?: Record<string, unknown>; verification_result?: VerificationResult }
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
   * Send a heartbeat for a long-running active contract.
   * Extends the timeout watchdog deadline by `heartbeatGraceMs` (default 30 s).
   * The contract's `last_heartbeat_at` is recorded in metadata.
   *
   * @param contract_id - The active contract to keep alive.
   */
  async heartbeat(contract_id: string): Promise<void> {
    const contract = this.getContractById(contract_id);
    if (!contract) throw new Error(`Contract not found: ${contract_id}`);
    if (contract.status !== 'active') throw new Error(`Contract ${contract_id} is not active (status: ${contract.status})`);

    const now = new Date().toISOString();
    const metadata = { ...(contract.metadata ?? {}), last_heartbeat_at: now };
    await this.updateContract({ contract_id, metadata });
    this.watchdog.heartbeat(contract_id);
  }

  /**
   * Get a single contract by ID
   */
  getContract(contract_id: string): DelegationContract | null {
    const row = this.db
      .prepare('SELECT * FROM delegation_contracts WHERE contract_id = ?')
      .get(contract_id);
    
    return row ? this.rowToContract(row as Parameters<typeof this.rowToContract>[0]) : null;
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

  // ── Container execution helpers (Phase 4.0.0 — autonomous-agent-containers) ──

  /**
   * Attach a container handle to a contract and transition it to 'active'.
   *
   * Called by AgentContainerDispatcher after ContainerExecutionBackend.provision()
   * returns. Stores the handle in contract metadata so any agent or monitoring
   * tool can retrieve it via getContainerStatus().
   *
   * @param contractId  - The delegation contract to update.
   * @param handle      - Serialisable reference to the provisioned container.
   * @since 4.0.0 (autonomous-agent-containers)
   */
  dispatchToContainer(
    contractId: string,
    handle: {
      containerId: string;
      containerName: string;
      startedAt: string;
      backendType: string;
    },
  ): void {
    const existing = this.getContractById(contractId);
    const sessionId = existing?.session_id
      ?? (existing?.metadata?.session_id as string | undefined);

    this.updateContract({
      contract_id: contractId,
      status: 'active',
      activated_at: new Date().toISOString(),
      metadata: {
        container_handle: handle,
        execution_environment: 'container',
      },
    });

    if (sessionId) {
      try {
        this.sessionManager.updateState(sessionId, { containerHandle: handle });
      } catch {
        // Session may not exist yet; contract metadata remains source of truth.
      }
    }

    this.emit('container_dispatched', { contractId, handle });
  }

  /**
   * Return the container handle stored on a contract, or null if the
   * contract is not a container-execution contract.
   *
   * @param contractId - ID of the delegation contract.
   * @since 4.0.0 (autonomous-agent-containers)
   */
  getContainerStatus(contractId: string): {
    containerId: string;
    containerName: string;
    startedAt: string;
    backendType: string;
    contractStatus: string;
  } | null {
    const contract = this.getContractById(contractId);
    if (!contract) return null;

    const handle = contract.metadata?.container_handle as
      | { containerId: string; containerName: string; startedAt: string; backendType: string }
      | undefined;

    if (!handle) return null;

    return {
      containerId: handle.containerId,
      containerName: handle.containerName,
      startedAt: handle.startedAt,
      backendType: handle.backendType,
      contractStatus: contract.status,
    };
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
    
    const params: unknown[] = [];
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
  getRecentSecurityThreats(limit = 10): Array<Record<string, unknown>> {
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
    contract_security_summary: Record<string, unknown>;
    recent_security_events: Array<Record<string, unknown>>;
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
    const supportedModes: Set<ExecutionMode> =
      delegateeManifest
        ? new Set(delegateeManifest.supported_execution_modes) // 8.5: always present
        : new Set(Object.values(ExecutionMode)); // no manifest — all modes allowed

    const supportsMode = (m: ExecutionMode): boolean => supportedModes.has(m);

    // Tier 1: Explicit override
    if (request.execution_mode && supportsMode(request.execution_mode)) {
      return this._applyQueueGuard(request.execution_mode);
    }

    // Tier 2: OpenSpec hint stored in metadata
    const openspecHint =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
   * 7.3 — Rank a list of candidate agent IDs by their reputation reliability_score,
   * highest first. Falls back to the original order when the reputation engine is
   * unavailable or when `featureFlags.reputation_tracking === false`.
   */
  async rankCandidatesByReputation(
    agentIds: string[],
    featureFlags?: Record<string, boolean>,
  ): Promise<string[]> {
    if (!this.reputationEngine || featureFlags?.reputation_tracking === false) {
      return agentIds;
    }
    const scored = await Promise.all(
      agentIds.map(async (id) => {
        const rep = await this.reputationEngine!.getReputation(id);
        return { id, score: rep?.reliability_score ?? 0.5 };
      }),
    );
    return scored.sort((a, b) => b.score - a.score).map((e) => e.id);
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

  /**
   * 8.1 — Expose the optional health monitor so callers can start/stop monitoring
   * and retrieve live metrics.
   */
  getHealthMonitor(): DelegationHealthMonitor | undefined {
    return this.healthMonitor;
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

    // Persist session_id into contract metadata so handoffSession can resolve it
    try {
      const existing = this.getContractById(contractId);
      if (existing) {
        const updatedMetadata = { ...existing.metadata, session_id: sessionId };
        await this.updateContract({ contract_id: contractId, metadata: updatedMetadata });
      }
    } catch {
      // Non-fatal — handoff will fall back gracefully
    }

    // Register session
    const sessionState = {
      status: 'active' as const,
      conversationMessages: [],
      lastActivity: new Date().toISOString(),
      ...(worktreePath !== undefined && { worktreePath }),
    };
    // v3.0.0: Pass handoff_context from contract to session
    const contract = this.getContractById(contractId);
    const handoffContext = contract?.handoff_context;
    this.sessionManager.register(sessionId, contractId, ExecutionMode.BACKGROUND, sessionState, handoffContext);
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
    // v3.0.0: Pass handoff_context from contract to session
    const contract = this.getContractById(contractId);
    const handoffContext = contract?.handoff_context;
    this.sessionManager.register(sessionId, contractId, ExecutionMode.ASYNC, sessionState, handoffContext);
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
      /** Optional caller agent ID — when set, only the delegatee of the source contract may initiate the handoff. */
      caller_id?: string;
    },
  ): Promise<DelegationContract> {
    const { fromContractId, toExecutionMode, contextSnapshot, handoffReason } = request;

    // 1. Load source contract
    const sourceContract = this.getContractById(fromContractId);
    if (!sourceContract) {
      throw new Error(`handoffSession: source contract not found: ${fromContractId}`);
    }

    // 2.5: Delegatee ownership check — only the delegatee may initiate a handoff
    if (request.caller_id && sourceContract.delegatee.agent_id !== request.caller_id) {
      throw new Error(
        `Unauthorized: only delegatee '${sourceContract.delegatee.agent_id}' can initiate handoff from '${fromContractId}'`,
      );
    }

    // 1.5: Run security chain (FeatureFlags + Identity) for handoff operations.
    // Heavy create-only middleware are skipped via appliesTo.
    const handoffCtx: SecurityContext = {
      operation: 'handoff',
      contract: {
        contract_id: sourceContract.contract_id,
        delegator: sourceContract.delegator,
        delegatee: sourceContract.delegatee,
      },
      timestamp_ms: Date.now(),
      feature_flags: { identity_auth: !!(this.agentRegistry) },
    };
    const handoffResult = await this.securityChain.evaluate(handoffCtx);
    if (handoffResult.action === 'block') {
      const bv = handoffResult.blocking_verdict!;
      throw new Error(`Security check failed for handoff: ${bv.reason ?? bv.threat_type}`);
    }

    const fromSessionId = sourceContract.session_id
      ?? this.sessionManager.getActiveSessionForContract(fromContractId)?.sessionId;
    const fromMode = sourceContract.execution_mode; // 8.4: always present, no fallback needed

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToContract(row: Record<string, any>): DelegationContract {
    const metadata: Record<string, unknown> = row.metadata ? JSON.parse(row.metadata) : {};

    // Recover execution_mode / session_id stored in metadata (backward-compatible)
    const executionMode = (metadata['execution_mode'] as ExecutionMode | undefined)
      ?? ExecutionMode.INTERACTIVE;
    const sessionId = metadata['session_id'] as string | undefined;
    // v3.0.0: recover handoff_context and requires_confirmation
    const handoffContext = metadata['handoff_context'] as DelegationContract['handoff_context'] | undefined;
    const requiresConfirmation = metadata['requires_confirmation'] as boolean | undefined;

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
      ...(handoffContext !== undefined && { handoff_context: handoffContext }),
      ...(requiresConfirmation !== undefined && { requires_confirmation: requiresConfirmation }),
      metadata,
    };
  }
}

// Export aliases for backward compatibility
export { DelegationContractManager as ContractManager };
export type { DelegationContractManagerConfig as ContractManagerConfig };
export type { CreateDelegationContractRequest as ContractUpdate };
export type { ContractQueryOptions as ContractQuery };

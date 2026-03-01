/**
 * DCYFR Autonomous Agent Session Manager
 * TLP:AMBER - Internal Use Only
 *
 * Manages autonomous agent sessions with:
 *   - Isolated DCYFRMemory instances per session (namespaced storage)
 *   - Trust-level tool policies (full/sandboxed/readonly)
 *   - Session lifecycle metadata (createdAt, lastActiveAt, messageCount, etc.)
 *   - Delegation security middleware integration (TLP + rate limiting)
 *   - Shared knowledge base overlay (read-only memory merged at query time)
 *
 * This is distinct from the delegation SessionManager (packages/ai/delegation/session-manager.ts)
 * which tracks delegation contract lifecycle. This module manages autonomous agent
 * runtime sessions — where agents run independently with memory, tools, and context.
 *
 * @module session/session-manager
 * @version 1.0.0
 * @date 2026-03-01
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { DCYFRMemory, MemorySearchResult, MemoryContext, Memory } from '../../memory/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Trust level determines what tools a session can access */
export type TrustLevel = 'full' | 'sandboxed' | 'readonly';

/** Tool policy mode — maps to trust level enforcement */
export type ToolPolicyMode = 'allow_all' | 'allowlist' | 'readonly';

/**
 * Tool definition for policy enforcement
 */
export interface SessionTool {
  /** Tool name */
  name: string;
  /** Whether this tool performs write operations */
  isWrite?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool policy for a session — determines which tools can be executed
 */
export interface ToolPolicy {
  /** Policy mode */
  mode: ToolPolicyMode;
  /** Allowlisted tool names (used when mode is 'allowlist') */
  allowlist?: string[];
  /** Denylisted tool names (always blocked regardless of mode) */
  denylist?: string[];
}

/**
 * Session configuration provided at creation time
 */
export interface SessionConfig {
  /** Agent ID that owns this session */
  agentId: string;
  /** Trust level for tool access control */
  trustLevel?: TrustLevel;
  /** Optional user ID associated with this session */
  userId?: string;
  /** Platform the session originates from */
  platform?: string;
  /** Custom allowlisted write tools for sandboxed mode */
  sandboxedWriteAllowlist?: string[];
  /** Memory factory — creates isolated DCYFRMemory for this session */
  memoryFactory?: (sessionId: string, agentId: string) => DCYFRMemory;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Session TTL in milliseconds (0 = no expiry) */
  ttlMs?: number;
  /** TLP classification for security middleware integration */
  tlpClassification?: string;
}

/**
 * Session lifecycle state
 */
export type SessionLifecycle = 'active' | 'suspended' | 'destroyed';

/**
 * Full session object managed by SessionManager
 */
export interface ManagedAgentSession {
  /** Unique session ID */
  id: string;
  /** Agent ID that owns this session */
  agentId: string;
  /** Current lifecycle state */
  lifecycle: SessionLifecycle;
  /** Trust level for tool access */
  trustLevel: TrustLevel;
  /** Tool policy derived from trust level */
  toolPolicy: ToolPolicy;
  /** Isolated DCYFRMemory for this session */
  memory?: DCYFRMemory;
  /** Session metadata */
  metadata: SessionMetadata;
  /** Creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActiveAt: Date;
  /** Message count in this session */
  messageCount: number;
  /** Optional user ID */
  userId?: string;
  /** Platform identifier */
  platform?: string;
  /** TLP classification */
  tlpClassification?: string;
  /** Session expiry time (null = no expiry) */
  expiresAt: Date | null;
}

/**
 * Session metadata — custom key/value pairs
 */
export interface SessionMetadata {
  /** Custom metadata entries */
  [key: string]: unknown;
}

/**
 * Query filter for finding sessions
 */
export interface SessionQuery {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by user ID */
  userId?: string;
  /** Filter by platform */
  platform?: string;
  /** Filter by lifecycle state */
  lifecycle?: SessionLifecycle;
  /** Filter by trust level */
  trustLevel?: TrustLevel;
  /** Filter by custom metadata key/value */
  metadata?: Record<string, unknown>;
}

/**
 * Options for finding idle sessions
 */
export interface IdleQueryOptions {
  /** Minutes of inactivity to consider idle */
  idleMinutes: number;
  /** Only check sessions with this lifecycle */
  lifecycle?: SessionLifecycle;
}

/**
 * Security middleware evaluation result
 */
export interface SecurityEvaluation {
  /** Whether the session creation is allowed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** Downgraded trust level (if clearance is insufficient) */
  downgradedTrustLevel?: TrustLevel;
}

/**
 * Pluggable security middleware for session creation
 */
export interface SessionSecurityMiddleware {
  /** Evaluate whether a session creation is allowed */
  evaluate(config: SessionConfig, sessionId: string): Promise<SecurityEvaluation>;
}

/**
 * Shared knowledge base overlay configuration
 */
export interface SharedKnowledgeBase {
  /** The read-only memory backing the shared knowledge */
  memory: DCYFRMemory;
  /** Namespace for the shared knowledge */
  namespace?: string;
}

/**
 * Memory overlay that merges session-specific and shared knowledge results
 */
export class OverlayMemory implements Partial<DCYFRMemory> {
  constructor(
    private readonly sessionMemory: DCYFRMemory,
    private readonly sharedMemory: DCYFRMemory,
    private readonly sharedNamespace: string = 'shared',
  ) {}

  /**
   * Search both session and shared memory, deduplicate by content, merge results
   */
  async searchUserMemories(
    userId: string,
    query: string,
    limit: number = 3,
  ): Promise<MemorySearchResult[]> {
    const [sessionResults, sharedResults] = await Promise.all([
      this.sessionMemory.searchUserMemories(userId, query, limit),
      this.sharedMemory.searchUserMemories(this.sharedNamespace, query, limit),
    ]);

    // Merge and deduplicate — session results take priority
    const seen = new Set<string>();
    const merged: MemorySearchResult[] = [];

    for (const result of sessionResults) {
      seen.add(result.content);
      merged.push(result);
    }

    for (const result of sharedResults) {
      if (!seen.has(result.content)) {
        seen.add(result.content);
        merged.push({ ...result, metadata: { ...result.metadata, source: 'shared' } });
      }
    }

    // Sort by relevance descending, take top limit
    return merged
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * Search agent memories across session and shared
   */
  async searchAgentMemories(
    agentId: string,
    query: string,
    limit: number = 3,
  ): Promise<MemorySearchResult[]> {
    const [sessionResults, sharedResults] = await Promise.all([
      this.sessionMemory.searchAgentMemories(agentId, query, limit),
      this.sharedMemory.searchAgentMemories(this.sharedNamespace, query, limit),
    ]);

    const seen = new Set<string>();
    const merged: MemorySearchResult[] = [];

    for (const result of sessionResults) {
      seen.add(result.content);
      merged.push(result);
    }

    for (const result of sharedResults) {
      if (!seen.has(result.content)) {
        seen.add(result.content);
        merged.push({ ...result, metadata: { ...result.metadata, source: 'shared' } });
      }
    }

    return merged
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * Session context merges session + shared
   */
  async getSessionContext(sessionId: string): Promise<string> {
    const [sessionCtx, sharedCtx] = await Promise.all([
      this.sessionMemory.getSessionContext(sessionId),
      this.sharedMemory.getSessionContext(this.sharedNamespace),
    ]);

    const parts: string[] = [];
    if (sessionCtx) parts.push(sessionCtx);
    if (sharedCtx) parts.push(`[Shared Knowledge]\n${sharedCtx}`);
    return parts.join('\n\n');
  }

  /** Writes go to session memory only */
  async addUserMemory(userId: string, message: string, context?: MemoryContext): Promise<string> {
    return this.sessionMemory.addUserMemory(userId, message, context);
  }

  async addAgentMemory(agentId: string, sessionId: string, state: Record<string, unknown>): Promise<string> {
    return this.sessionMemory.addAgentMemory(agentId, sessionId, state);
  }

  async addSessionMemory(sessionId: string, message: string, ttl?: number): Promise<string> {
    return this.sessionMemory.addSessionMemory(sessionId, message, ttl);
  }

  async getUserMemories(userId: string, topic?: string): Promise<Memory[]> {
    return this.sessionMemory.getUserMemories(userId, topic);
  }

  async getAgentState(agentId: string, sessionId: string): Promise<Record<string, unknown> | null> {
    return this.sessionMemory.getAgentState(agentId, sessionId);
  }

  async deleteUserMemories(userId: string): Promise<void> {
    return this.sessionMemory.deleteUserMemories(userId);
  }

  async deleteSessionMemories(sessionId: string): Promise<void> {
    return this.sessionMemory.deleteSessionMemories(sessionId);
  }

  /** Get the underlying session memory */
  getSessionMemory(): DCYFRMemory {
    return this.sessionMemory;
  }

  /** Get the underlying shared memory */
  getSharedMemory(): DCYFRMemory {
    return this.sharedMemory;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trust Level → Tool Policy mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map trust level to tool policy
 */
export function trustLevelToPolicy(
  trustLevel: TrustLevel,
  sandboxedWriteAllowlist?: string[],
): ToolPolicy {
  switch (trustLevel) {
    case 'full':
      return { mode: 'allow_all' };
    case 'sandboxed':
      return {
        mode: 'allowlist',
        allowlist: sandboxedWriteAllowlist ?? [],
      };
    case 'readonly':
      return { mode: 'readonly' };
    default:
      return { mode: 'readonly' };
  }
}

/**
 * Check if a tool is allowed by the given policy
 */
export function isToolAllowed(
  tool: SessionTool,
  policy: ToolPolicy,
): boolean {
  // Denylist always blocks
  if (policy.denylist?.includes(tool.name)) {
    return false;
  }

  switch (policy.mode) {
    case 'allow_all':
      return true;
    case 'readonly':
      return !tool.isWrite;
    case 'allowlist':
      // Read tools always allowed; write tools only if explicitly allowlisted
      if (!tool.isWrite) return true;
      return policy.allowlist?.includes(tool.name) ?? false;
    default:
      return false;
  }
}

/**
 * Error thrown when a tool execution violates trust level policy
 */
export class TrustLevelViolation extends Error {
  public readonly toolName: string;
  public readonly trustLevel: TrustLevel;
  public readonly policyMode: ToolPolicyMode;

  constructor(toolName: string, trustLevel: TrustLevel, policyMode: ToolPolicyMode) {
    super(
      `Tool '${toolName}' blocked by trust level '${trustLevel}' ` +
      `(policy: ${policyMode}). Write access denied.`
    );
    this.name = 'TrustLevelViolation';
    this.toolName = toolName;
    this.trustLevel = trustLevel;
    this.policyMode = policyMode;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for SessionManager
 */
export interface SessionManagerConfig {
  /** Default trust level for new sessions */
  defaultTrustLevel?: TrustLevel;
  /** Default session TTL in milliseconds (0 = no expiry) */
  defaultTtlMs?: number;
  /** Security middleware chain evaluated on session creation */
  securityMiddleware?: SessionSecurityMiddleware[];
  /** Shared knowledge base accessible to all sessions */
  sharedKnowledgeBase?: SharedKnowledgeBase;
  /** Maximum concurrent sessions (0 = unlimited) */
  maxSessions?: number;
}

/**
 * Autonomous Agent Session Manager
 *
 * Manages sessions for autonomous agents with isolated memory, trust-level
 * tool policies, and security middleware integration.
 *
 * Emits:
 *   - `session:created`   — New session created
 *   - `session:suspended` — Session suspended
 *   - `session:resumed`   — Session resumed from suspension
 *   - `session:destroyed` — Session destroyed and cleaned up
 *   - `session:active`    — Session had activity (touch)
 *   - `session:expired`   — Session expired by TTL
 *   - `tool:blocked`      — Tool execution blocked by policy
 */
export class SessionManager extends EventEmitter {
  private readonly sessions = new Map<string, ManagedAgentSession>();
  private readonly config: Required<Omit<SessionManagerConfig, 'securityMiddleware' | 'sharedKnowledgeBase'>>;
  private readonly securityMiddleware: SessionSecurityMiddleware[];
  private readonly sharedKnowledgeBase?: SharedKnowledgeBase;
  private expiryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SessionManagerConfig = {}) {
    super();
    this.config = {
      defaultTrustLevel: config.defaultTrustLevel ?? 'sandboxed',
      defaultTtlMs: config.defaultTtlMs ?? 0,
      maxSessions: config.maxSessions ?? 0,
    };
    this.securityMiddleware = config.securityMiddleware ?? [];
    this.sharedKnowledgeBase = config.sharedKnowledgeBase;

    // Start expiry checker every 60s if any TTL is configured
    if (this.config.defaultTtlMs > 0) {
      this._startExpiryChecker();
    }
  }

  // ─────────────── Session Lifecycle ───────────────

  /**
   * Create a new autonomous agent session.
   *
   * Runs security middleware chain before creation.
   * Creates isolated DCYFRMemory if memoryFactory provided.
   * Applies shared knowledge base overlay if configured.
   *
   * @throws Error if security middleware blocks creation
   * @throws Error if max sessions limit reached
   */
  async create(sessionConfig: SessionConfig): Promise<ManagedAgentSession> {
    const sessionId = randomUUID();

    // Check max sessions limit
    if (this.config.maxSessions > 0 && this.sessions.size >= this.config.maxSessions) {
      throw new Error(
        `Maximum session limit (${this.config.maxSessions}) reached. ` +
        `Destroy existing sessions before creating new ones.`
      );
    }

    // Determine initial trust level
    let trustLevel = sessionConfig.trustLevel ?? this.config.defaultTrustLevel;

    // Run security middleware chain
    for (const middleware of this.securityMiddleware) {
      const evaluation = await middleware.evaluate(sessionConfig, sessionId);
      if (!evaluation.allowed) {
        throw new Error(
          `Session creation blocked by security middleware: ${evaluation.reason ?? 'Unknown reason'}`
        );
      }
      // Apply trust level downgrade if middleware recommends it
      if (evaluation.downgradedTrustLevel) {
        trustLevel = evaluation.downgradedTrustLevel;
      }
    }

    // Build tool policy from trust level
    const toolPolicy = trustLevelToPolicy(trustLevel, sessionConfig.sandboxedWriteAllowlist);

    // Create isolated memory if factory provided
    let memory: DCYFRMemory | undefined;
    if (sessionConfig.memoryFactory) {
      const sessionMemory = sessionConfig.memoryFactory(sessionId, sessionConfig.agentId);

      // Wrap with shared knowledge base overlay if configured
      if (this.sharedKnowledgeBase) {
        memory = new OverlayMemory(
          sessionMemory,
          this.sharedKnowledgeBase.memory,
          this.sharedKnowledgeBase.namespace,
        ) as unknown as DCYFRMemory;
      } else {
        memory = sessionMemory;
      }
    }

    const now = new Date();
    const ttlMs = sessionConfig.ttlMs ?? this.config.defaultTtlMs;

    // Start expiry checker if this is the first session with TTL
    if (ttlMs > 0 && !this.expiryTimer) {
      this._startExpiryChecker();
    }

    const session: ManagedAgentSession = {
      id: sessionId,
      agentId: sessionConfig.agentId,
      lifecycle: 'active',
      trustLevel,
      toolPolicy,
      memory,
      metadata: { ...(sessionConfig.metadata ?? {}) },
      createdAt: now,
      lastActiveAt: now,
      messageCount: 0,
      userId: sessionConfig.userId,
      platform: sessionConfig.platform,
      tlpClassification: sessionConfig.tlpClassification,
      expiresAt: ttlMs > 0 ? new Date(now.getTime() + ttlMs) : null,
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', session);
    return session;
  }

  /**
   * Get a session by ID. Returns undefined if not found or destroyed.
   */
  get(sessionId: string): ManagedAgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Find sessions matching query criteria
   */
  find(query: SessionQuery): ManagedAgentSession[] {
    let results = Array.from(this.sessions.values());

    if (query.agentId !== undefined) {
      results = results.filter(s => s.agentId === query.agentId);
    }
    if (query.userId !== undefined) {
      results = results.filter(s => s.userId === query.userId);
    }
    if (query.platform !== undefined) {
      results = results.filter(s => s.platform === query.platform);
    }
    if (query.lifecycle !== undefined) {
      results = results.filter(s => s.lifecycle === query.lifecycle);
    }
    if (query.trustLevel !== undefined) {
      results = results.filter(s => s.trustLevel === query.trustLevel);
    }
    if (query.metadata) {
      for (const [key, value] of Object.entries(query.metadata)) {
        results = results.filter(s => s.metadata[key] === value);
      }
    }

    return results;
  }

  /**
   * Find idle sessions — sessions that haven't had activity for N minutes
   */
  findIdle(options: IdleQueryOptions): ManagedAgentSession[] {
    const cutoff = new Date(Date.now() - options.idleMinutes * 60_000);
    let results = Array.from(this.sessions.values())
      .filter(s => s.lastActiveAt < cutoff);

    if (options.lifecycle !== undefined) {
      results = results.filter(s => s.lifecycle === options.lifecycle);
    }

    return results;
  }

  /**
   * Suspend a session — pauses activity but preserves memory and state.
   * Suspended sessions can be resumed.
   */
  suspend(sessionId: string): ManagedAgentSession {
    const session = this._requireSession(sessionId);
    if (session.lifecycle === 'destroyed') {
      throw new Error(`Cannot suspend destroyed session ${sessionId}`);
    }
    session.lifecycle = 'suspended';
    session.lastActiveAt = new Date();
    this.emit('session:suspended', session);
    return session;
  }

  /**
   * Resume a suspended session — returns it to active state.
   */
  resume(sessionId: string): ManagedAgentSession {
    const session = this._requireSession(sessionId);
    if (session.lifecycle !== 'suspended') {
      throw new Error(`Cannot resume session ${sessionId} — lifecycle is '${session.lifecycle}', expected 'suspended'`);
    }
    session.lifecycle = 'active';
    session.lastActiveAt = new Date();
    this.emit('session:resumed', session);
    return session;
  }

  /**
   * Destroy a session — cleans up memory and removes from store.
   * Destroyed sessions cannot be resumed.
   */
  async destroy(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return; // Already gone — idempotent

    session.lifecycle = 'destroyed';

    // Cleanup session memory
    if (session.memory) {
      try {
        await session.memory.deleteSessionMemories(sessionId);
      } catch {
        // Non-fatal — session is removed regardless
      }
    }

    this.sessions.delete(sessionId);
    this.emit('session:destroyed', session);
  }

  /**
   * Touch a session — updates lastActiveAt and increments messageCount
   */
  touch(sessionId: string): ManagedAgentSession {
    const session = this._requireSession(sessionId);
    if (session.lifecycle !== 'active') {
      throw new Error(`Cannot touch session ${sessionId} — lifecycle is '${session.lifecycle}'`);
    }
    session.lastActiveAt = new Date();
    session.messageCount += 1;
    this.emit('session:active', session);
    return session;
  }

  // ─────────────── Tool Policy Enforcement ───────────────

  /**
   * Check if a tool is allowed in a session.
   * Does NOT throw — use executeTool for enforcement.
   */
  isToolAllowed(sessionId: string, tool: SessionTool): boolean {
    const session = this._requireSession(sessionId);
    return isToolAllowed(tool, session.toolPolicy);
  }

  /**
   * Enforce tool policy — throws TrustLevelViolation if tool is blocked.
   * Call this before executing any tool in a session context.
   */
  enforceToolPolicy(sessionId: string, tool: SessionTool): void {
    const session = this._requireSession(sessionId);
    if (!isToolAllowed(tool, session.toolPolicy)) {
      const violation = new TrustLevelViolation(
        tool.name,
        session.trustLevel,
        session.toolPolicy.mode,
      );
      this.emit('tool:blocked', { sessionId, tool, violation });
      throw violation;
    }
  }

  /**
   * Update the trust level for a session (and regenerate tool policy)
   */
  setTrustLevel(
    sessionId: string,
    trustLevel: TrustLevel,
    sandboxedWriteAllowlist?: string[],
  ): ManagedAgentSession {
    const session = this._requireSession(sessionId);
    session.trustLevel = trustLevel;
    session.toolPolicy = trustLevelToPolicy(trustLevel, sandboxedWriteAllowlist);
    session.lastActiveAt = new Date();
    return session;
  }

  // ─────────────── Metadata ───────────────

  /**
   * Update session metadata (merge with existing)
   */
  updateMetadata(
    sessionId: string,
    metadata: Record<string, unknown>,
  ): ManagedAgentSession {
    const session = this._requireSession(sessionId);
    session.metadata = { ...session.metadata, ...metadata };
    session.lastActiveAt = new Date();
    return session;
  }

  /**
   * Get session metadata
   */
  getMetadata(sessionId: string): SessionMetadata {
    const session = this._requireSession(sessionId);
    return { ...session.metadata };
  }

  // ─────────────── Memory Access ───────────────

  /**
   * Get the memory instance for a session.
   * If shared knowledge base is configured, returns overlay memory.
   */
  getMemory(sessionId: string): DCYFRMemory | undefined {
    const session = this._requireSession(sessionId);
    return session.memory;
  }

  // ─────────────── Queries ───────────────

  /**
   * Get all active sessions
   */
  getActiveSessions(): ManagedAgentSession[] {
    return this.find({ lifecycle: 'active' });
  }

  /**
   * Get total session count (all lifecycles)
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Get sessions grouped by agent
   */
  getSessionsByAgent(): Map<string, ManagedAgentSession[]> {
    const grouped = new Map<string, ManagedAgentSession[]>();
    for (const session of this.sessions.values()) {
      const existing = grouped.get(session.agentId) ?? [];
      existing.push(session);
      grouped.set(session.agentId, existing);
    }
    return grouped;
  }

  // ─────────────── Cleanup ───────────────

  /**
   * Destroy all expired sessions
   */
  async destroyExpired(): Promise<number> {
    const now = new Date();
    let destroyed = 0;

    for (const session of this.sessions.values()) {
      if (session.expiresAt && session.expiresAt <= now) {
        this.emit('session:expired', session);
        await this.destroy(session.id);
        destroyed++;
      }
    }

    return destroyed;
  }

  /**
   * Destroy all sessions and stop timers
   */
  async destroyAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.destroy(id);
    }
    this._stopExpiryChecker();
  }

  /**
   * Stop the expiry checker and release resources
   */
  dispose(): void {
    this._stopExpiryChecker();
    this.removeAllListeners();
  }

  // ─────────────── Private ───────────────

  private _requireSession(sessionId: string): ManagedAgentSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private _startExpiryChecker(): void {
    if (this.expiryTimer) return;
    this.expiryTimer = setInterval(() => {
      void this.destroyExpired();
    }, 60_000);
    if (typeof this.expiryTimer.unref === 'function') {
      this.expiryTimer.unref();
    }
  }

  private _stopExpiryChecker(): void {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Middleware Adapters (Task 6.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TLP-based security middleware for session creation.
 * Wraps the delegation TLPMiddleware pattern for autonomous sessions.
 *
 * When agent TLP clearance is insufficient for the requested session's
 * TLP classification, auto-downgrades the trust level instead of blocking.
 */
export class TLPSessionMiddleware implements SessionSecurityMiddleware {
  private readonly clearanceMap: Map<string, number>;

  constructor(
    /** Map of agent IDs to their TLP clearance levels */
    private readonly agentClearances: Record<string, string> = {},
  ) {
    this.clearanceMap = new Map([
      ['CLEAR', 0],
      ['GREEN', 1],
      ['AMBER', 2],
      ['RED', 3],
    ]);
  }

  async evaluate(config: SessionConfig, _sessionId: string): Promise<SecurityEvaluation> {
    const tlp = config.tlpClassification;
    if (!tlp) return { allowed: true };

    const agentClearance = this.agentClearances[config.agentId];
    if (!agentClearance) {
      // Unknown agent — downgrade to readonly
      return {
        allowed: true,
        downgradedTrustLevel: 'readonly',
      };
    }

    const requiredLevel = this.clearanceMap.get(tlp.replace('TLP:', '')) ?? 0;
    const agentLevel = this.clearanceMap.get(agentClearance.replace('TLP:', '')) ?? 0;

    if (agentLevel >= requiredLevel) {
      return { allowed: true };
    }

    // Insufficient clearance — downgrade trust level
    const downgrade: TrustLevel = agentLevel <= 0 ? 'readonly' : 'sandboxed';
    return {
      allowed: true,
      downgradedTrustLevel: downgrade,
    };
  }
}

/**
 * Rate limiter middleware for session creation.
 * Limits how many sessions an agent/user can create per window.
 */
export class RateLimiterSessionMiddleware implements SessionSecurityMiddleware {
  private readonly windows = new Map<string, number[]>();

  constructor(
    private readonly maxSessions: number = 10,
    private readonly windowMs: number = 3_600_000, // 1 hour
  ) {}

  async evaluate(config: SessionConfig, _sessionId: string): Promise<SecurityEvaluation> {
    const key = config.userId ?? config.agentId;
    const now = Date.now();
    const cutoff = now - this.windowMs;

    const timestamps = this.windows.get(key) ?? [];
    const fresh = timestamps.filter(t => t > cutoff);

    if (fresh.length >= this.maxSessions) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${key} has created ${fresh.length} sessions ` +
          `in the last ${this.windowMs / 1000}s (limit: ${this.maxSessions})`,
      };
    }

    fresh.push(now);
    this.windows.set(key, fresh);
    return { allowed: true };
  }

  /** Exposed for testing */
  getWindowCount(key: string, nowMs = Date.now()): number {
    const cutoff = nowMs - this.windowMs;
    return (this.windows.get(key) ?? []).filter(t => t > cutoff).length;
  }
}

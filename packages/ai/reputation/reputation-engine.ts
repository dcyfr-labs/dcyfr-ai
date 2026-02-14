/**
 * DCYFR Reputation Engine
 * TLP:AMBER - Internal Use Only
 * 
 * Multi-dimensional reputation scoring for AI agents based on delegation outcomes.
 * Tracks reliability, speed, quality, and security metrics.
 * 
 * @module ai/reputation/reputation-engine
 * @version 1.0.0
 * @date 2026-02-13
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Reputation engine configuration
 */
export interface ReputationEngineConfig {
  /** Path to SQLite database */
  databasePath: string;
  
  /** Weight for reliability score (default: 0.4) */
  reliabilityWeight?: number;
  
  /** Weight for speed score (default: 0.2) */
  speedWeight?: number;
  
  /** Weight for quality score (default: 0.3) */
  qualityWeight?: number;
  
  /** Weight for security score (default: 0.1) */
  securityWeight?: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Agent reputation record
 */
export interface AgentReputation {
  agent_id: string;
  agent_name: string;
  confidence_score: number;
  reliability_score: number;
  speed_score: number;
  quality_score: number;
  security_score: number;
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  success_rate: number;
  avg_completion_time_ms: number | null;
  min_completion_time_ms: number | null;
  max_completion_time_ms: number | null;
  first_seen_at: string;
  last_updated_at: string;
  last_task_at: string | null;
}

/**
 * Task outcome for reputation updates
 */
export interface TaskOutcome {
  /** Contract ID */
  contract_id: string;
  
  /** Agent ID */
  agent_id: string;
  
  /** Agent name */
  agent_name: string;
  
  /** Task ID */
  task_id: string;
  
  /** Success (true) or failure (false) */
  success: boolean;
  
  /** Task completion time in milliseconds */
  completion_time_ms: number;
  
  /** Quality score (0.0-1.0) */
  quality_score?: number;
  
  /** Security violations detected */
  security_violations?: number;
  
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Reputation query options
 */
export interface ReputationQueryOptions {
  /** Minimum confidence score threshold */
  min_confidence?: number;
  
  /** Minimum success rate threshold (0.0-1.0) */
  min_success_rate?: number;
  
  /** Sort by field */
  sort_by?: 'confidence_score' | 'reliability_score' | 'speed_score' | 'quality_score' | 'security_score' | 'success_rate';
  
  /** Sort order */
  sort_order?: 'asc' | 'desc';
  
  /** Limit results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Reputation audit event
 */
export interface ReputationAuditEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  event_data: Record<string, any>;
  task_id?: string;
  delegation_contract_id?: string;
  source_system: string;
}

/**
 * Reputation Engine
 * 
 * Manages multi-dimensional reputation scoring for AI agents.
 */
export class ReputationEngine {
  private db: Database.Database;
  private config: Required<ReputationEngineConfig>;
  
  constructor(config: ReputationEngineConfig) {
    this.db = new Database(config.databasePath);
    this.config = {
      databasePath: config.databasePath,
      reliabilityWeight: config.reliabilityWeight ?? 0.4,
      speedWeight: config.speedWeight ?? 0.2,
      qualityWeight: config.qualityWeight ?? 0.3,
      securityWeight: config.securityWeight ?? 0.1,
      debug: config.debug ?? false,
    };
    
    // Validate weights sum to 1.0
    const totalWeight = this.config.reliabilityWeight + 
                       this.config.speedWeight + 
                       this.config.qualityWeight + 
                       this.config.securityWeight;
    
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Reputation weights must sum to 1.0, got ${totalWeight}`);
    }
  }
  
  /**
   * Update agent reputation based on task outcome
   */
  async updateReputation(outcome: TaskOutcome): Promise<AgentReputation> {
    const existing = await this.getReputation(outcome.agent_id);
    
    if (existing) {
      return this.updateExistingReputation(existing, outcome);
    } else {
      return this.createInitialReputation(outcome);
    }
  }
  
  /**
   * Get agent reputation
   */
  async getReputation(agentId: string): Promise<AgentReputation | null> {
    const row = this.db.prepare(`
      SELECT * FROM agent_reputation WHERE agent_id = ?
    `).get(agentId) as any;
    
    if (!row) {
      return null;
    }
    
    return this.rowToReputation(row);
  }
  
  /**
   * Query agents by reputation criteria
   */
  async queryReputation(options: ReputationQueryOptions = {}): Promise<AgentReputation[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (options.min_confidence !== undefined) {
      conditions.push('confidence_score >= ?');
      params.push(options.min_confidence);
    }
    
    if (options.min_success_rate !== undefined) {
      conditions.push('success_rate >= ?');
      params.push(options.min_success_rate);
    }
    
    let sql = 'SELECT * FROM agent_reputation';
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    const sortBy = options.sort_by ?? 'confidence_score';
    const sortOrder = options.sort_order ?? 'desc';
    sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
    
    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      
      if (options.offset !== undefined) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToReputation(row));
  }
  
  /**
   * Get reputation audit log for an agent
   */
  async getAuditLog(agentId: string, limit: number = 100): Promise<ReputationAuditEvent[]> {
    const rows = this.db.prepare(`
      SELECT * FROM reputation_audit_log
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(agentId, limit) as any[];
    
    return rows.map(row => ({
      event_id: row.event_id,
      event_type: row.event_type,
      timestamp: row.timestamp,
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      event_data: JSON.parse(row.event_data),
      task_id: row.task_id ?? undefined,
      delegation_contract_id: row.delegation_contract_id ?? undefined,
      source_system: row.source_system,
    }));
  }
  
  /**
   * Reset agent reputation (for testing or cleanup)
   */
  async resetReputation(agentId: string): Promise<void> {
    this.db.prepare(`DELETE FROM agent_reputation WHERE agent_id = ?`).run(agentId);
    
    await this.logAuditEvent({
      event_type: 'reputation_reset',
      agent_id: agentId,
      agent_name: agentId,
      event_data: { reason: 'manual_reset' },
    });
    
    if (this.config.debug) {
      console.log(`[ReputationEngine] Reset reputation for agent: ${agentId}`);
    }
  }
  
  /**
   * Create initial reputation for new agent
   */
  private async createInitialReputation(outcome: TaskOutcome): Promise<AgentReputation> {
    const now = new Date().toISOString();
    
    // Calculate initial scores
    const reliabilityScore = outcome.success ? 1.0 : 0.0;
    const speedScore = this.calculateSpeedScore(outcome.completion_time_ms);
    const qualityScore = outcome.quality_score ?? (outcome.success ? 0.8 : 0.2);
    const securityScore = outcome.security_violations ? Math.max(0, 1.0 - outcome.security_violations * 0.2) : 1.0;
    
    const confidenceScore = this.calculateConfidenceScore({
      reliabilityScore,
      speedScore,
      qualityScore,
      securityScore,
    });
    
    const stmt = this.db.prepare(`
      INSERT INTO agent_reputation (
        agent_id, agent_name, confidence_score,
        reliability_score, speed_score, quality_score, security_score,
        total_tasks, successful_tasks, failed_tasks,
        avg_completion_time_ms, min_completion_time_ms, max_completion_time_ms,
        first_seen_at, last_updated_at, last_task_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      outcome.agent_id,
      outcome.agent_name,
      confidenceScore,
      reliabilityScore,
      speedScore,
      qualityScore,
      securityScore,
      1, // total_tasks
      outcome.success ? 1 : 0,
      outcome.success ? 0 : 1,
      outcome.completion_time_ms,
      outcome.completion_time_ms,
      outcome.completion_time_ms,
      now,
      now,
      now
    );
    
    await this.logAuditEvent({
      event_type: 'reputation_created',
      agent_id: outcome.agent_id,
      agent_name: outcome.agent_name,
      event_data: {
        initial_confidence: confidenceScore,
        task_id: outcome.task_id,
        success: outcome.success,
      },
      task_id: outcome.task_id,
      delegation_contract_id: outcome.contract_id,
    });
    
    if (this.config.debug) {
      console.log(`[ReputationEngine] Created reputation for agent: ${outcome.agent_id}, confidence: ${confidenceScore.toFixed(3)}`);
    }
    
    return (await this.getReputation(outcome.agent_id))!;
  }
  
  /**
   * Update existing agent reputation
   */
  private async updateExistingReputation(existing: AgentReputation, outcome: TaskOutcome): Promise<AgentReputation> {
    const now = new Date().toISOString();
    
    // Update task counts
    const totalTasks = existing.total_tasks + 1;
    const successfulTasks = existing.successful_tasks + (outcome.success ? 1 : 0);
    const failedTasks = existing.failed_tasks + (outcome.success ? 0 : 1);
    
    // Calculate new scores using exponential moving average (alpha = 0.3 for recent bias)
    const alpha = 0.3;
    const reliabilityScore = existing.reliability_score * (1 - alpha) + (outcome.success ? 1.0 : 0.0) * alpha;
    const speedScore = existing.speed_score * (1 - alpha) + this.calculateSpeedScore(outcome.completion_time_ms) * alpha;
    const qualityScore = existing.quality_score * (1 - alpha) + (outcome.quality_score ?? (outcome.success ? 0.8 : 0.2)) * alpha;
    const securityScore = existing.security_score * (1 - alpha) + 
                         (outcome.security_violations ? Math.max(0, 1.0 - outcome.security_violations * 0.2) : 1.0) * alpha;
    
    const confidenceScore = this.calculateConfidenceScore({
      reliabilityScore,
      speedScore,
      qualityScore,
      securityScore,
    });
    
    // Update completion time statistics
    const avgCompletionTime = existing.avg_completion_time_ms 
      ? (existing.avg_completion_time_ms * existing.total_tasks + outcome.completion_time_ms) / totalTasks
      : outcome.completion_time_ms;
    
    const minCompletionTime = existing.min_completion_time_ms
      ? Math.min(existing.min_completion_time_ms, outcome.completion_time_ms)
      : outcome.completion_time_ms;
    
    const maxCompletionTime = existing.max_completion_time_ms
      ? Math.max(existing.max_completion_time_ms, outcome.completion_time_ms)
      : outcome.completion_time_ms;
    
    const stmt = this.db.prepare(`
      UPDATE agent_reputation
      SET confidence_score = ?,
          reliability_score = ?,
          speed_score = ?,
          quality_score = ?,
          security_score = ?,
          total_tasks = ?,
          successful_tasks = ?,
          failed_tasks = ?,
          avg_completion_time_ms = ?,
          min_completion_time_ms = ?,
          max_completion_time_ms = ?,
          last_updated_at = ?,
          last_task_at = ?
      WHERE agent_id = ?
    `);
    
    stmt.run(
      confidenceScore,
      reliabilityScore,
      speedScore,
      qualityScore,
      securityScore,
      totalTasks,
      successfulTasks,
      failedTasks,
      avgCompletionTime,
      minCompletionTime,
      maxCompletionTime,
      now,
      now,
      outcome.agent_id
    );
    
    await this.logAuditEvent({
      event_type: 'reputation_updated',
      agent_id: outcome.agent_id,
      agent_name: outcome.agent_name,
      event_data: {
        previous_confidence: existing.confidence_score,
        new_confidence: confidenceScore,
        task_id: outcome.task_id,
        success: outcome.success,
        delta: confidenceScore - existing.confidence_score,
      },
      task_id: outcome.task_id,
      delegation_contract_id: outcome.contract_id,
    });
    
    if (this.config.debug) {
      console.log(`[ReputationEngine] Updated reputation for agent: ${outcome.agent_id}, confidence: ${existing.confidence_score.toFixed(3)} → ${confidenceScore.toFixed(3)}`);
    }
    
    return (await this.getReputation(outcome.agent_id))!;
  }
  
  /**
   * Calculate speed score based on completion time
   * 
   * Assumes:
   * - < 1 second = 1.0 (excellent)
   * - < 5 seconds = 0.9 (very good)
   * - < 30 seconds = 0.7 (good)
   * - < 2 minutes = 0.5 (acceptable)
   * - > 2 minutes = 0.3 (slow)
   */
  private calculateSpeedScore(completionTimeMs: number): number {
    if (completionTimeMs < 1000) return 1.0;
    if (completionTimeMs < 5000) return 0.9;
    if (completionTimeMs < 30000) return 0.7;
    if (completionTimeMs < 120000) return 0.5;
    return 0.3;
  }
  
  /**
   * Calculate overall confidence score from dimensional scores
   */
  private calculateConfidenceScore(scores: {
    reliabilityScore: number;
    speedScore: number;
    qualityScore: number;
    securityScore: number;
  }): number {
    return (
      scores.reliabilityScore * this.config.reliabilityWeight +
      scores.speedScore * this.config.speedWeight +
      scores.qualityScore * this.config.qualityWeight +
      scores.securityScore * this.config.securityWeight
    );
  }
  
  /**
   * Log audit event
   */
  private async logAuditEvent(event: Omit<ReputationAuditEvent, 'event_id' | 'timestamp' | 'source_system'>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO reputation_audit_log (
        event_id, event_type, timestamp, agent_id, agent_name,
        event_data, task_id, delegation_contract_id, source_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      randomUUID(),
      event.event_type,
      new Date().toISOString(),
      event.agent_id,
      event.agent_name,
      JSON.stringify(event.event_data),
      event.task_id ?? null,
      event.delegation_contract_id ?? null,
      'dcyfr-ai'
    );
  }
  
  /**
   * Convert database row to AgentReputation
   */
  private rowToReputation(row: any): AgentReputation {
    return {
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      confidence_score: row.confidence_score,
      reliability_score: row.reliability_score,
      speed_score: row.speed_score,
      quality_score: row.quality_score,
      security_score: row.security_score,
      total_tasks: row.total_tasks,
      successful_tasks: row.successful_tasks,
      failed_tasks: row.failed_tasks,
      success_rate: row.success_rate,
      avg_completion_time_ms: row.avg_completion_time_ms ?? null,
      min_completion_time_ms: row.min_completion_time_ms ?? null,
      max_completion_time_ms: row.max_completion_time_ms ?? null,
      first_seen_at: row.first_seen_at,
      last_updated_at: row.last_updated_at,
      last_task_at: row.last_task_at ?? null,
    };
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

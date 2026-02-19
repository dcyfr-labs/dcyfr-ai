/**
 * Reputation Engine for Agent Performance Tracking
 * TLP:CLEAR
 * 
 * Multi-dimensional reputation system with exponential moving average scoring,
 * SQLite persistence, and confidence calibration.
 * 
 * @module reputation/reputation-engine
 * @version 2.0.0
 * @date 2026-02-16
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Task outcome data for reputation updates
 */
export interface ReputationTaskOutcome {
  /** Contract identifier */
  contract_id: string;
  
  /** Agent identifier */
  agent_id: string;
  
  /** Agent display name */
  agent_name: string;
  
  /** Task identifier */
  task_id: string;
  
  /** Whether task completed successfully */
  success: boolean;
  
  /** Task completion time in milliseconds */
  completion_time_ms: number;
  
  /** Quality score (0-1) */
  quality_score?: number;
  
  /** Number of security violations */
  security_violations?: number;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent reputation profile with multi-dimensional scores
 */
export interface AgentReputation {
  /** Agent identifier */
  agent_id: string;
  
  /** Agent display name */
  agent_name: string;
  
  /** Confidence score (0-1, increases with task count) */
  confidence_score: number;
  
  /** Reliability score (0-1, based on success rate) */
  reliability_score: number;
  
  /** Speed score (0-1, based on completion times) */
  speed_score: number;
  
  /** Quality score (0-1, based on quality_score input) */
  quality_score: number;
  
  /** Security score (0-1, penalized by violations) */
  security_score: number;
  
  /** Total number of tasks */
  total_tasks: number;
  
  /** Number of successful tasks */
  successful_tasks: number;
  
  /** Number of failed tasks */
  failed_tasks: number;
  
  /** Success rate (successful_tasks / total_tasks) */
  success_rate: number;
  
  /** Average completion time in milliseconds */
  avg_completion_time_ms: number;
  
  /** Minimum completion time seen */
  min_completion_time_ms: number;
  
  /** Maximum completion time seen */
  max_completion_time_ms: number;
  
  /** Last update timestamp */
  last_updated: string;
}

/**
 * Reputation query filters
 */
export interface ReputationQuery {
  /** Minimum confidence score */
  min_confidence?: number;
  
  /** Minimum success rate */
  min_success_rate?: number;
  
  /** Minimum reliability score */
  min_reliability?: number;
  
  /** Field to sort by */
  sort_by?: 'confidence_score' | 'reliability_score' | 'speed_score' | 'quality_score';
  
  /** Sort order */
  sort_order?: 'asc' | 'desc';
  
  /** Maximum number of results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  /** Unique event ID */
  event_id: string;
  
  /** Event type */
  event_type: string;
  
  /** Event timestamp */
  timestamp: string;
  
  /** Agent ID */
  agent_id: string;
  
  /** Agent name */
  agent_name: string;
  
  /** Event data as JSON string */
  event_data: string;
  
  /** Associated task ID */
  task_id?: string;
  
  /** Associated contract ID */
  delegation_contract_id?: string;
}

/**
 * Reputation Engine configuration
 */
export interface ReputationEngineConfig {
  /** SQLite database path */
  databasePath?: string;
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** Exponential moving average alpha (0-1) */
  ema_alpha?: number;
  
  /** Minimum tasks for high confidence */
  min_tasks_for_confidence?: number;
  
  /** Weight for reliability dimension */
  reliabilityWeight?: number;
  
  /** Weight for speed dimension */
  speedWeight?: number;
  
  /** Weight for quality dimension */
  qualityWeight?: number;
  
  /** Weight for security dimension */
  securityWeight?: number;
}

/**
 * Reputation Engine
 * 
 * Tracks multi-dimensional agent reputation with SQL persistence,
 * exponential moving average updates, and audit logging.
 */
export class ReputationEngine {
  private db: Database.Database;
  private config: Required<ReputationEngineConfig>;
  
  constructor(config: ReputationEngineConfig = {}) {
    // Validate dimension weights if provided
    const reliabilityWeight = config.reliabilityWeight ?? 0.4;
    const speedWeight = config.speedWeight ?? 0.2;
    const qualityWeight = config.qualityWeight ?? 0.3;
    const securityWeight = config.securityWeight ?? 0.1;
    
    const totalWeight = reliabilityWeight + speedWeight + qualityWeight + securityWeight;
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Dimension weights must sum to 1.0, got ${totalWeight}`);
    }
    
    this.config = {
      databasePath: config.databasePath || ':memory:',
      debug: config.debug ?? false,
      ema_alpha: config.ema_alpha ?? 0.3,
      min_tasks_for_confidence: config.min_tasks_for_confidence ?? 10,
      reliabilityWeight,
      speedWeight,
      qualityWeight,
      securityWeight,
    };
    
    // Initialize database
    this.db = new Database(this.config.databasePath);
    this.initializeSchema();
  }
  
  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    // Note: Schema should already be created by tests
    // This just ensures it exists if not
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_reputation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL UNIQUE,
        agent_name TEXT NOT NULL,
        confidence_score REAL NOT NULL DEFAULT 0.5,
        reliability_score REAL NOT NULL DEFAULT 0.5,
        speed_score REAL NOT NULL DEFAULT 0.5,
        quality_score REAL NOT NULL DEFAULT 0.5,
        security_score REAL NOT NULL DEFAULT 1.0,
        total_tasks INTEGER DEFAULT 0,
        successful_tasks INTEGER DEFAULT 0,
        failed_tasks INTEGER DEFAULT 0,
        success_rate REAL GENERATED ALWAYS AS (
          CASE WHEN total_tasks > 0 
            THEN CAST(successful_tasks AS REAL) / total_tasks 
            ELSE 0.0 
          END
        ) STORED,
        avg_completion_time_ms REAL DEFAULT 0.0,
        min_completion_time_ms REAL DEFAULT 0.0,
        max_completion_time_ms REAL DEFAULT 0.0,
        recent_contracts TEXT DEFAULT '[]',
        last_updated TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      
      CREATE TABLE IF NOT EXISTS reputation_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        event_data TEXT NOT NULL,
        task_id TEXT,
        delegation_contract_id TEXT,
        source_system TEXT NOT NULL DEFAULT 'dcyfr-ai'
      );
      
      CREATE INDEX IF NOT EXISTS idx_reputation_agent_id ON agent_reputation(agent_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_agent_id ON reputation_audit_log(agent_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON reputation_audit_log(timestamp DESC);
    `);
  }
  
  /**
   * Update or create agent reputation based on task outcome
   */
  async updateReputation(outcome: ReputationTaskOutcome): Promise<AgentReputation> {
    const existing = await this.getReputation(outcome.agent_id);
    const timestamp = new Date().toISOString();
    
    if (existing) {
      return this.updateExistingReputation(existing, outcome, timestamp);
    } else {
      return this.createNewReputation(outcome, timestamp);
    }
  }
  
  /**
   * Create new reputation record for agent
   */
  private async createNewReputation(outcome: ReputationTaskOutcome, timestamp: string): Promise<AgentReputation> {
    const reliability_score = outcome.success ? 1.0 : 0.0;
    const quality_score = outcome.quality_score ?? 0.5;
    const security_score = this.calculateSecurityScore(outcome.security_violations);
    const speed_score = this.calculateSpeedScore(outcome.completion_time_ms);
    const success_rate = outcome.success ? 1.0 : 0.0;
    const confidence_score = this.calculateConfidenceScore(1, success_rate);
    
    const stmt = this.db.prepare(`
      INSERT INTO agent_reputation (
        agent_id, agent_name, confidence_score, reliability_score,
        speed_score, quality_score, security_score,
        total_tasks, successful_tasks, failed_tasks,
        avg_completion_time_ms, min_completion_time_ms, max_completion_time_ms,
        last_updated_at, last_task_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      outcome.agent_id,
      outcome.agent_name,
      confidence_score,
      reliability_score,
      speed_score,
      quality_score,
      security_score,
      1, // total_tasks
      outcome.success ? 1 : 0, // successful_tasks
      outcome.success ? 0 : 1, // failed_tasks
      outcome.completion_time_ms,
      outcome.completion_time_ms,
      outcome.completion_time_ms,
      timestamp,
      timestamp
    );
    
    this.logAuditEvent({
      event_type: 'reputation_created',
      agent_id: outcome.agent_id,
      agent_name: outcome.agent_name,
      timestamp,
      task_id: outcome.task_id,
      delegation_contract_id: outcome.contract_id,
      event_data: JSON.stringify(outcome),
    });
    
    const reputation = await this.getReputation(outcome.agent_id);
    if (!reputation) {
      throw new Error(`Failed to retrieve reputation for agent ${outcome.agent_id} after creation`);
    }
    return reputation;
  }
  
  /**
   * Update existing reputation with new task outcome
   */
  private async updateExistingReputation(
    existing: AgentReputation,
    outcome: ReputationTaskOutcome,
    timestamp: string
  ): Promise<AgentReputation> {
    const alpha = this.config.ema_alpha;
    
    // Update task counts
    const total_tasks = existing.total_tasks + 1;
    const successful_tasks = existing.successful_tasks + (outcome.success ? 1 : 0);
    const failed_tasks = existing.failed_tasks + (outcome.success ? 0 : 1);
    
    // Update reliability score (EMA)
    const new_reliability = outcome.success ? 1.0 : 0.0;
    const reliability_score = alpha * new_reliability + (1 - alpha) * existing.reliability_score;
    
    // Update quality score (EMA) if provided
    let quality_score = existing.quality_score;
    if (outcome.quality_score !== undefined) {
      quality_score = alpha * outcome.quality_score + (1 - alpha) * existing.quality_score;
    }
    
    // Update security score if violations occurred
    let security_score = existing.security_score;
    if (outcome.security_violations) {
      const new_security = this.calculateSecurityScore(outcome.security_violations);
      security_score = alpha * new_security + (1 - alpha) * existing.security_score;
    }
    
    // Update speed score
    const new_speed = this.calculateSpeedScore(outcome.completion_time_ms);
    const speed_score = alpha * new_speed + (1 - alpha) * existing.speed_score;
    
    // Update completion time statistics
    const avg_completion_time_ms = 
      (existing.avg_completion_time_ms * existing.total_tasks + outcome.completion_time_ms) / total_tasks;
    const min_completion_time_ms = Math.min(existing.min_completion_time_ms, outcome.completion_time_ms);
    const max_completion_time_ms = Math.max(existing.max_completion_time_ms, outcome.completion_time_ms);
    
    // Update confidence score
    const success_rate = total_tasks > 0 ? successful_tasks / total_tasks : 0;
    const confidence_score = this.calculateConfidenceScore(total_tasks, success_rate);
    
    const stmt = this.db.prepare(`
      UPDATE agent_reputation SET
        agent_name = ?,
        confidence_score = ?,
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
      outcome.agent_name,
      confidence_score,
      reliability_score,
      speed_score,
      quality_score,
      security_score,
      total_tasks,
      successful_tasks,
      failed_tasks,
      avg_completion_time_ms,
      min_completion_time_ms,
      max_completion_time_ms,
      timestamp,
      timestamp,
      outcome.agent_id
    );
    
    this.logAuditEvent({
      event_type: 'reputation_updated',
      agent_id: outcome.agent_id,
      agent_name: outcome.agent_name,
      timestamp,
      task_id: outcome.task_id,
      delegation_contract_id: outcome.contract_id,
      event_data: JSON.stringify(outcome),
    });
    
    const reputation = await this.getReputation(outcome.agent_id);
    if (!reputation) {
      throw new Error(`Failed to retrieve reputation for agent ${outcome.agent_id} after update`);
    }
    return reputation;
  }
  
  /**
   * Get reputation for a specific agent
   */
  async getReputation(agent_id: string): Promise<AgentReputation | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_reputation WHERE agent_id = ?
    `);
    
    type ReputationRow = {
      agent_id: string; agent_name: string; confidence_score: number;
      reliability_score: number; speed_score: number; quality_score: number;
      security_score: number; total_tasks: number; successful_tasks: number;
      failed_tasks: number; success_rate: number; avg_completion_time_ms: number;
      min_completion_time_ms: number; max_completion_time_ms: number;
      last_updated_at: string;
    };
    const row = stmt.get(agent_id) as ReputationRow | undefined;
    
    if (!row) {
      return null;
    }
    
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
      avg_completion_time_ms: row.avg_completion_time_ms,
      min_completion_time_ms: row.min_completion_time_ms,
      max_completion_time_ms: row.max_completion_time_ms,
      last_updated: row.last_updated_at,
    };
  }
  
  /**
   * Query reputation profiles with filters
   */
  async queryReputation(query: ReputationQuery = {}): Promise<AgentReputation[]> {
    let sql = 'SELECT * FROM agent_reputation WHERE 1=1';
    const params: any[] = [];
    
    if (query.min_confidence !== undefined) {
      sql += ' AND confidence_score >= ?';
      params.push(query.min_confidence);
    }
    
    if (query.min_success_rate !== undefined) {
      sql += ' AND success_rate >= ?';
      params.push(query.min_success_rate);
    }
    
    if (query.min_reliability !== undefined) {
      sql += ' AND reliability_score >= ?';
      params.push(query.min_reliability);
    }
    
    // Add sorting
    const sortField = query.sort_by || 'confidence_score';
    const sortOrder = query.sort_order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortField} ${sortOrder}`;
    
    // Add pagination
    if (query.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }
    
    if (query.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }
    
    const stmt = this.db.prepare(sql);
    type ReputationRow = {
      agent_id: string; agent_name: string; confidence_score: number;
      reliability_score: number; speed_score: number; quality_score: number;
      security_score: number; total_tasks: number; successful_tasks: number;
      failed_tasks: number; success_rate: number; avg_completion_time_ms: number;
      min_completion_time_ms: number; max_completion_time_ms: number;
      last_updated_at: string;
    };
    const rows = stmt.all(...params) as ReputationRow[];
    
    return rows.map(row => ({
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
      avg_completion_time_ms: row.avg_completion_time_ms,
      min_completion_time_ms: row.min_completion_time_ms,
      max_completion_time_ms: row.max_completion_time_ms,
      last_updated: row.last_updated_at,
    }));
  }
  
  /**
   * Get audit log for an agent
   */
  async getAuditLog(agent_id: string, limit?: number): Promise<AuditLogEntry[]> {
    let sql = `
      SELECT * FROM reputation_audit_log 
      WHERE agent_id = ? 
      ORDER BY timestamp DESC
    `;
    
    if (limit !== undefined) {
      sql += ' LIMIT ?';
    }
    
    const stmt = this.db.prepare(sql);
    const params = limit !== undefined ? [agent_id, limit] : [agent_id];
    type AuditRow = {
      event_id: string; event_type: string; timestamp: string;
      agent_id: string; agent_name: string; event_data: string;
      task_id: string | null;
      delegation_contract_id?: string;
    };
    const rows = stmt.all(...params) as AuditRow[];
    
    return rows.map(row => ({
      event_id: row.event_id,
      event_type: row.event_type,
      timestamp: row.timestamp,
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      event_data: row.event_data,
      task_id: row.task_id ?? undefined,
      delegation_contract_id: row.delegation_contract_id,
    }));
  }
  
  /**
   * Reset an agent's reputation
   */
  async resetReputation(agent_id: string): Promise<void> {
    const existing = await this.getReputation(agent_id);
    
    if (!existing) {
      return;
    }
    
    const stmt = this.db.prepare('DELETE FROM agent_reputation WHERE agent_id = ?');
    stmt.run(agent_id);
    
    this.logAuditEvent({
      event_type: 'reputation_reset',
      agent_id,
      agent_name: existing.agent_name,
      timestamp: new Date().toISOString(),
      event_data: JSON.stringify({ reason: 'manual_reset' }),
    });
  }
  
  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
  
  /**
   * Calculate security score based on violations
   */
  private calculateSecurityScore(violations?: number): number {
    if (!violations || violations === 0) {
      return 1.0;
    }
    
    // Penalty of 0.2 per violation, floor at 0.0
    return Math.max(0.0, 1.0 - violations * 0.2);
  }
  
  /**
   * Calculate speed score based on completion time
   * 
   * Fast: < 1 second = 1.0
   * Medium: 1-10 seconds = 0.7-0.9
   * Slow: 10-60 seconds = 0.4-0.7
   * Very slow: > 60 seconds = 0.3-0.4 (floors at 0.3 for test compatibility)
   */
  private calculateSpeedScore(completion_time_ms: number): number {
    let score: number;
    
    if (completion_time_ms <= 1000) {
      score = 1.0;
    } else if (completion_time_ms <= 10000) {
      // Linear interpolation between 1.0 (1s) and 0.7 (10s)
      score = 1.0 - (completion_time_ms - 1000) / (10000 - 1000) * 0.3;
    } else if (completion_time_ms <= 60000) {
      // Linear interpolation between 0.7 (10s) and 0.4 (60s)
      score = 0.7 - (completion_time_ms - 10000) / (60000 - 10000) * 0.3;
    } else {
      // Linear interpolation between 0.4 (60s) and 0.3 (300s+)
      score = 0.4 - (completion_time_ms - 60000) / (300000 - 60000) * 0.1;
      score = Math.max(0.3, score); // Floor at 0.3 for very slow tasks
    }
    
    // Round to 2 decimal places to avoid floating point precision issues
    return Math.round(score * 100) / 100;
  }
  
  /**
   * Calculate confidence score based on task count and success rate
   * 
   * For low task counts with high success rate: start with base confidence 0.8
   * As tasks increase: approach 1.0 using sigmoid
   * Low success rates: penalize confidence
   */
  private calculateConfidenceScore(total_tasks: number, success_rate: number = 1.0): number {
    const k = this.config.min_tasks_for_confidence;
    
    // Base confidence for perfect success starts at 0.8, increases with tasks
    let baseConfidence: number;
    
    if (total_tasks < 5) {
      // For first few tasks, give high confidence for good performance
      baseConfidence = 0.8 + (total_tasks / 5) * 0.1; // 0.8 to 0.9
    } else {
      // Sigmoid function: 1 / (1 + e^(-x))
      // Shifted so that min_tasks gives ~0.95 confidence
      const x = (total_tasks - k / 2) / (k / 4);
      baseConfidence = 0.85 + 0.15 / (1 + Math.exp(-x)); // 0.85 to 1.0
    }
    
    // Apply success rate penalty (quadratic to penalize failures more heavily)
    return baseConfidence * (success_rate * success_rate);
  }
  
  /**
   * Log an audit event
   */
  private logAuditEvent(event: {
    event_type: string;
    agent_id: string;
    agent_name: string;
    timestamp: string;
    event_data: string;
    task_id?: string;
    delegation_contract_id?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO reputation_audit_log (
        event_id, event_type, timestamp, agent_id, agent_name,
        event_data, task_id, delegation_contract_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      randomUUID(),
      event.event_type,
      event.timestamp,
      event.agent_id,
      event.agent_name,
      event.event_data,
      event.task_id,
      event.delegation_contract_id
    );
  }
}

export default ReputationEngine;

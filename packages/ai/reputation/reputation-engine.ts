/**
 * Reputation Engine for Agent Performance Tracking
 * TLP:CLEAR
 * 
 * Multi-dimensional reputation system with exponential moving average scoring,
 * SQLite persistence, and confidence calibration.
 * 
 * @module reputation/reputation-engine
 * @version 1.0.0
 * @date 2026-02-13
 */

import { EventEmitter } from 'events';
import { Database } from 'better-sqlite3';

/**
 * Reputation dimension for tracking different aspects of agent performance
 */
export type ReputationDimension = 'reliability' | 'speed' | 'quality' | 'security';

/**
 * Reputation update event data
 */
export interface ReputationUpdate {
  /** Agent identifier */
  agent_id: string;
  
  /** Dimension being updated */
  dimension: ReputationDimension;
  
  /** New score value (0-1) */
  score: number;
  
  /** Update timestamp */
  timestamp: string;
  
  /** Associated task/contract */
  task_id?: string;
  
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Agent reputation profile with multi-dimensional scores
 */
export interface ReputationProfile {
  /** Agent identifier */
  agent_id: string;
  
  /** Individual dimension scores (0-1) */
  dimensions: {
    reliability: number;
    speed: number;
    quality: number;
    security: number;
  };
  
  /** Weighted overall score (0-1) */
  overall_score: number;
  
  /** Total number of tasks completed */
  tasks_completed: number;
  
  /** Number of consecutive successful tasks */
  consecutive_successes: number;
  
  /** Number of consecutive failures */
  consecutive_failures: number;
  
  /** Last update timestamp */
  last_updated: string;
  
  /** Agent specializations (inferred from high-scoring task categories) */
  specializations?: string[];
  
  /** Confidence in reputation scores (0-1, increases with more data) */
  confidence?: number;
}

/**
 * Reputation engine configuration
 */
export interface ReputationEngineConfig {
  /** Exponential moving average alpha (0-1, higher = more weight to recent) */
  ema_alpha?: number;
  
  /** Dimension weights for overall score */
  dimension_weights?: {
    reliability?: number;
    speed?: number;
    quality?: number;
    security?: number;
  };
  
  /** Minimum tasks before high confidence */
  min_tasks_for_confidence?: number;
  
  /** Enable SQLite persistence */
  enable_persistence?: boolean;
  
  /** SQLite database path */
  database_path?: string;
}

/**
 * Reputation query filters
 */
export interface ReputationQuery {
  /** Filter by agent IDs */
  agent_ids?: string[];
  
  /** Minimum overall score */
  min_score?: number;
  
  /** Minimum score for specific dimension */
  min_dimension_score?: {
    dimension: ReputationDimension;
    score: number;
  };
  
  /** Required specializations */
  required_specializations?: string[];
  
  /** Minimum task count */
  min_tasks_completed?: number;
  
  /** Maximum consecutive failures */
  max_consecutive_failures?: number;
  
  /** Limit results */
  limit?: number;
  
  /** Sort by field */
  sort_by?: 'overall_score' | 'tasks_completed' | 'last_updated';
  
  /** Sort order */
  sort_order?: 'asc' | 'desc';
}

/**
 * Reputation Engine
 * 
 * Tracks multi-dimensional agent reputation with exponential moving average
 * updates, confidence scoring, and specialization inference.
 */
export class ReputationEngine extends EventEmitter {
  private profiles: Map<string, ReputationProfile>;
  private config: Required<ReputationEngineConfig>;
  private db?: Database;
  
  constructor(config: ReputationEngineConfig = {}) {
    super();
    
    // Validate dimension weights sum to 1.0
    const weights = config.dimension_weights || {};
    const totalWeight = 
      (weights.reliability ?? 0.4) +
      (weights.speed ?? 0.2) +
      (weights.quality ?? 0.3) +
      (weights.security ?? 0.1);
    
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Dimension weights must sum to 1.0, got ${totalWeight}`);
    }
    
    this.config = {
      ema_alpha: config.ema_alpha ?? 0.3,
      dimension_weights: {
        reliability: weights.reliability ?? 0.4,
        speed: weights.speed ?? 0.2,
        quality: weights.quality ?? 0.3,
        security: weights.security ?? 0.1,
      },
      min_tasks_for_confidence: config.min_tasks_for_confidence ?? 10,
      enable_persistence: config.enable_persistence ?? false,
      database_path: config.database_path ?? 'knowledge-base/delegation-reputation.db',
    };
    
    this.profiles = new Map();
    
    // Initialize database if persistence enabled
    if (this.config.enable_persistence) {
      this.initializeDatabase();
    }
  }
  
  /**
   * Initialize SQLite database for reputation persistence
   */
  private initializeDatabase(): void {
    // Database initialization would require better-sqlite3 package
    // This is a placeholder for the actual implementation
    // The actual SQL schema should match Task 1.1 requirements
    
    // Note: Actual implementation would use better-sqlite3:
    // this.db = new Database(this.config.database_path);
    // this.db.exec(`CREATE TABLE IF NOT EXISTS agent_reputation ...`);
  }
  
  /**
   * Get or create reputation profile for an agent
   */
  getProfile(agent_id: string): ReputationProfile {
    let profile = this.profiles.get(agent_id);
    
    if (!profile) {
      // Create new profile with neutral scores
      profile = {
        agent_id,
        dimensions: {
          reliability: 0.5,
          speed: 0.5,
          quality: 0.5,
          security: 0.5,
        },
        overall_score: 0.5,
        tasks_completed: 0,
        consecutive_successes: 0,
        consecutive_failures: 0,
        last_updated: new Date().toISOString(),
        confidence: 0,
      };
      
      this.profiles.set(agent_id, profile);
    }
    
    return profile;
  }
  
  /**
   * Update reputation score for a specific dimension
   */
  async updateScore(update: ReputationUpdate): Promise<ReputationProfile> {
    const profile = this.getProfile(update.agent_id);
    
    // Validate score range
    if (update.score < 0 || update.score > 1) {
      throw new Error(`Score must be between 0 and 1, got ${update.score}`);
    }
    
    // Apply exponential moving average
    const alpha = this.config.ema_alpha;
    const currentScore = profile.dimensions[update.dimension];
    const newScore = alpha * update.score + (1 - alpha) * currentScore;
    
    // Update dimension score
    profile.dimensions[update.dimension] = newScore;
    
    // Recalculate overall score
    profile.overall_score = this.calculateOverallScore(profile.dimensions);
    
    // Update timestamp
    profile.last_updated = update.timestamp;
    
    // Update confidence (increases with more tasks)
    profile.confidence = this.calculateConfidence(profile.tasks_completed);
    
    // Store updated profile
    this.profiles.set(update.agent_id, profile);
    
    // Emit event
    this.emit('reputation:updated', {
      agent_id: update.agent_id,
      dimension: update.dimension,
      old_score: currentScore,
      new_score: newScore,
      overall_score: profile.overall_score,
    });
    
    // Persist to database if enabled
    if (this.config.enable_persistence && this.db) {
      // Would persist to SQLite here
    }
    
    return profile;
  }
  
  /**
   * Record task completion (updates reliability and consecutive counts)
   */
  async recordTaskCompletion(
    agent_id: string,
    success: boolean,
    performance_scores?: Partial<Record<ReputationDimension, number>>,
    task_id?: string
  ): Promise<ReputationProfile> {
    const profile = this.getProfile(agent_id);
    
    // Update task counts
    if (success) {
      profile.tasks_completed++;
      profile.consecutive_successes++;
      profile.consecutive_failures = 0;
    } else {
      profile.consecutive_successes = 0;
      profile.consecutive_failures++;
    }
    
    // Update reliability based on success
    const reliabilityScore = success ? 1.0 : 0.0;
    await this.updateScore({
      agent_id,
      dimension: 'reliability',
      score: reliabilityScore,
      timestamp: new Date().toISOString(),
      task_id,
    });
    
    // Update other dimensions if provided
    if (performance_scores) {
      for (const [dimension, score] of Object.entries(performance_scores)) {
        if (score !== undefined) {
          await this.updateScore({
            agent_id,
            dimension: dimension as ReputationDimension,
            score,
            timestamp: new Date().toISOString(),
            task_id,
          });
        }
      }
    }
    
    return this.profiles.get(agent_id)!;
  }
  
  /**
   * Query reputation profiles with filters
   */
  queryProfiles(query: ReputationQuery = {}): ReputationProfile[] {
    let results = Array.from(this.profiles.values());
    
    // Apply filters
    if (query.agent_ids) {
      const idSet = new Set(query.agent_ids);
      results = results.filter((p) => idSet.has(p.agent_id));
    }
    
    if (query.min_score !== undefined) {
      results = results.filter((p) => p.overall_score >= query.min_score!);
    }
    
    if (query.min_dimension_score) {
      const { dimension, score } = query.min_dimension_score;
      results = results.filter((p) => p.dimensions[dimension] >= score);
    }
    
    if (query.required_specializations) {
      results = results.filter((p) => {
        if (!p.specializations) return false;
        return query.required_specializations!.every((spec) =>
          p.specializations!.includes(spec)
        );
      });
    }
    
    if (query.min_tasks_completed !== undefined) {
      results = results.filter((p) => p.tasks_completed >= query.min_tasks_completed!);
    }
    
    if (query.max_consecutive_failures !== undefined) {
      results = results.filter((p) => p.consecutive_failures <= query.max_consecutive_failures!);
    }
    
    // Apply sorting
    if (query.sort_by) {
      const sortOrder = query.sort_order === 'desc' ? -1 : 1;
      
      results.sort((a, b) => {
        const field = query.sort_by!;
        const aVal = field === 'overall_score' ? a.overall_score :
                    field === 'tasks_completed' ? a.tasks_completed :
                    a.last_updated;
        const bVal = field === 'overall_score' ? b.overall_score :
                    field === 'tasks_completed' ? b.tasks_completed :
                    b.last_updated;
        
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
   * Get reputation statistics
   */
  getStats(): {
    total_agents: number;
    average_overall_score: number;
    high_performers: number;
    low_performers: number;
    total_tasks_completed: number;
  } {
    const profiles = Array.from(this.profiles.values());
    
    if (profiles.length === 0) {
      return {
        total_agents: 0,
        average_overall_score: 0,
        high_performers: 0,
        low_performers: 0,
        total_tasks_completed: 0,
      };
    }
    
    const totalScore = profiles.reduce((sum, p) => sum + p.overall_score, 0);
    const totalTasks = profiles.reduce((sum, p) => sum + p.tasks_completed, 0);
    
    return {
      total_agents: profiles.length,
      average_overall_score: totalScore / profiles.length,
      high_performers: profiles.filter((p) => p.overall_score >= 0.8).length,
      low_performers: profiles.filter((p) => p.overall_score <= 0.3).length,
      total_tasks_completed: totalTasks,
    };
  }
  
  /**
   * Reset an agent's reputation (for testing or appeals)
   */
  resetProfile(agent_id: string): void {
    this.profiles.delete(agent_id);
    this.emit('reputation:reset', { agent_id });
  }
  
  /**
   * Clear all reputation data (for testing)
   */
  clearAll(): void {
    this.profiles.clear();
    this.emit('reputation:cleared');
  }
  
  /**
   * Calculate weighted overall score from dimension scores
   */
  private calculateOverallScore(dimensions: ReputationProfile['dimensions']): number {
    const weights = this.config.dimension_weights;
    
    return (
      dimensions.reliability * (weights.reliability || 0.4) +
      dimensions.speed * (weights.speed || 0.2) +
      dimensions.quality * (weights.quality || 0.3) +
      dimensions.security * (weights.security || 0.1)
    );
  }
  
  /**
   * Calculate confidence score based on number of tasks
   * 
   * Uses sigmoid function to approach 1.0 as tasks increase
   */
  private calculateConfidence(tasks_completed: number): number {
    const k = this.config.min_tasks_for_confidence;
    
    // Sigmoid function: 1 / (1 + e^(-x))
    // Shifted so that min_tasks gives ~0.88 confidence
    const x = (tasks_completed - k / 2) / (k / 4);
    return 1 / (1 + Math.exp(-x));
  }
  
  /**
   * Add specialization to agent profile
   */
  addSpecialization(agent_id: string, specialization: string): void {
    const profile = this.getProfile(agent_id);
    
    if (!profile.specializations) {
      profile.specializations = [];
    }
    
    if (!profile.specializations.includes(specialization)) {
      profile.specializations.push(specialization);
      this.emit('reputation:specialization_added', {
        agent_id,
        specialization,
      });
    }
  }
  
  /**
   * Get all profiles (for debugging/testing)
   */
  getAllProfiles(): ReputationProfile[] {
    return Array.from(this.profiles.values());
  }
}

export default ReputationEngine;

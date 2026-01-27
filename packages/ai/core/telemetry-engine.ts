/**
 * Telemetry Engine
 * 
 * Tracks agent usage, quality metrics, costs, and performance across all AI providers.
 * Provides data-driven insights for optimizing agent allocation and cost management.
 * 
 * @module @dcyfr/ai/core/telemetry-engine
 * @example
 * ```typescript
 * import { TelemetryEngine } from '@dcyfr/ai/core/telemetry-engine';
 * 
 * const telemetry = new TelemetryEngine({ storage: 'memory' });
 * 
 * // Start tracking a task
 * const session = telemetry.startSession('claude', {
 *   taskType: 'feature',
 *   description: 'Implement dark mode',
 * });
 * 
 * // Record metrics
 * session.recordMetric('tokenCompliance', 0.98);
 * session.recordValidation('typescript', 'pass');
 * 
 * // End session
 * const result = session.end('success');
 * ```
 */

import type {
  AgentType,
  TaskType,
  TaskOutcome,
  ValidationStatus,
  StorageAdapter,
  StorageType,
} from '../types';

import type {
  TelemetrySession,
  TelemetryMetrics,
  ViolationRecord,
  HandoffRecord,
  AgentStats,
  ComparisonStats,
  HandoffPatterns,
} from '../types/telemetry';

import { createStorageAdapter } from '../utils/storage';

/**
 * Telemetry Session Manager - handles individual sessions
 */
export class TelemetrySessionManager {
  private session: TelemetrySession;
  private startTime: number;
  private storage: StorageAdapter;

  constructor(
    sessionId: string,
    agent: AgentType,
    taskType: TaskType,
    taskDescription: string,
    storage: StorageAdapter
  ) {
    this.storage = storage;
    this.startTime = Date.now();
    this.session = {
      sessionId,
      agent,
      taskType,
      taskDescription,
      startTime: new Date(),
      metrics: {
        tokenCompliance: 0,
        testPassRate: 0,
        lintViolations: 0,
        typeErrors: 0,
        executionTime: 0,
        tokensUsed: 0,
        filesModified: 0,
        linesChanged: 0,
        validations: {
          typescript: 'pending',
          eslint: 'pending',
          tests: 'pending',
          designTokens: 'pending',
          security: 'pending',
        },
      },
      violations: [],
      handoffs: [],
      cost: {
        provider: agent,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        currency: 'USD',
      },
    };
  }

  /**
   * Record a metric value
   */
  recordMetric(
    metric: keyof Omit<TelemetryMetrics, 'validations'>,
    value: number
  ): void {
    this.session.metrics[metric] = value;
  }

  /**
   * Record validation status
   */
  recordValidation(
    validation: string,
    status: ValidationStatus
  ): void {
    this.session.metrics.validations[validation] = status;
  }

  /**
   * Record a violation
   */
  recordViolation(violation: Omit<ViolationRecord, 'timestamp'>): void {
    this.session.violations.push({
      timestamp: new Date(),
      ...violation,
    });

    // Update violation counts
    if (violation.type === 'eslint') {
      this.session.metrics.lintViolations++;
    } else if (violation.type === 'typescript') {
      this.session.metrics.typeErrors++;
    }
  }

  /**
   * Record a handoff to another agent
   */
  recordHandoff(handoff: Omit<HandoffRecord, 'timestamp' | 'fromAgent'>): void {
    this.session.handoffs.push({
      timestamp: new Date(),
      fromAgent: this.session.agent,
      ...handoff,
    });
  }

  /**
   * Update cost estimate
   */
  updateCost(inputTokens: number, outputTokens: number): void {
    this.session.cost.inputTokens += inputTokens;
    this.session.cost.outputTokens += outputTokens;

    // Calculate cost based on provider
    const costPerMillionTokens = this.getCostPerMillionTokens(this.session.agent);
    const totalTokens = inputTokens + outputTokens;
    this.session.cost.estimatedCost += (totalTokens / 1_000_000) * costPerMillionTokens;

    // Update tokens used metric
    this.session.metrics.tokensUsed = totalTokens;
  }

  private getCostPerMillionTokens(agent: AgentType): number {
    const costs: Record<AgentType, number> = {
      claude: 15, // $15 per 1M tokens (Sonnet 3.5)
      copilot: 0.1, // Included in subscription
      groq: 0, // Free tier
      ollama: 0, // Local
    };
    return costs[agent];
  }

  /**
   * End the session and return final metrics
   */
  async end(outcome: TaskOutcome): Promise<TelemetrySession> {
    this.session.endTime = new Date();
    this.session.outcome = outcome;
    this.session.metrics.executionTime = Date.now() - this.startTime;

    // Save to storage
    await this.saveToStorage();

    return this.session;
  }

  /**
   * Get current session data
   */
  getSession(): TelemetrySession {
    return { ...this.session };
  }

  private async saveToStorage(): Promise<void> {
    try {
      // Get existing sessions
      const sessions = await this.storage.get<TelemetrySession[]>('telemetry-sessions') || [];
      
      // Add current session
      sessions.push(this.session);
      
      // Save back
      await this.storage.set('telemetry-sessions', sessions);
    } catch (error) {
      console.error('Failed to save telemetry session:', error);
    }
  }
}

/**
 * Main Telemetry Engine
 */
export class TelemetryEngine {
  private activeSessions: Map<string, TelemetrySessionManager>;
  private storage: StorageAdapter;

  constructor(options?: { storage?: StorageType | StorageAdapter; basePath?: string }) {
    this.activeSessions = new Map();
    
    // Initialize storage
    if (options?.storage) {
      if (typeof options.storage === 'string') {
        this.storage = createStorageAdapter(options.storage, { basePath: options.basePath });
      } else {
        this.storage = options.storage;
      }
    } else {
      this.storage = createStorageAdapter('memory');
    }
  }

  /**
   * Start a new telemetry session
   */
  startSession(
    agent: AgentType,
    options: {
      taskType: TaskType;
      description: string;
    }
  ): TelemetrySessionManager {
    const sessionId = this.generateSessionId();
    const session = new TelemetrySessionManager(
      sessionId,
      agent,
      options.taskType,
      options.description,
      this.storage
    );

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Get an active session
   */
  getSession(sessionId: string): TelemetrySessionManager | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, outcome: TaskOutcome): Promise<TelemetrySession | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const result = await session.end(outcome);
    this.activeSessions.delete(sessionId);
    return result;
  }

  /**
   * Get statistics for a specific agent
   */
  async getAgentStats(agent: AgentType, period = '30d'): Promise<AgentStats> {
    const sessions = await this.getSessionsForPeriod(agent, period);

    const totalSessions = sessions.length;
    if (totalSessions === 0) {
      return this.getEmptyStats(agent, period);
    }

    const totalTime = sessions.reduce((sum, s) => sum + s.metrics.executionTime, 0);
    const averageSessionTime = totalTime / totalSessions;

    const outcomes = {
      success: sessions.filter(s => s.outcome === 'success').length,
      escalated: sessions.filter(s => s.outcome === 'escalated').length,
      failed: sessions.filter(s => s.outcome === 'failed').length,
      partial: sessions.filter(s => s.outcome === 'partial').length,
    };

    const quality = {
      averageTokenCompliance:
        sessions.reduce((sum, s) => sum + s.metrics.tokenCompliance, 0) / totalSessions,
      averageTestPassRate:
        sessions.reduce((sum, s) => sum + s.metrics.testPassRate, 0) / totalSessions,
      totalViolations: sessions.reduce((sum, s) => sum + s.violations.length, 0),
      violationsFixed: sessions.reduce(
        (sum, s) => sum + s.violations.filter(v => v.fixed).length,
        0
      ),
    };

    const performance = {
      averageExecutionTime: averageSessionTime,
      totalTokensUsed: sessions.reduce((sum, s) => sum + s.metrics.tokensUsed, 0),
      averageFilesModified:
        sessions.reduce((sum, s) => sum + s.metrics.filesModified, 0) / totalSessions,
    };

    const cost = {
      totalCost: sessions.reduce((sum, s) => sum + s.cost.estimatedCost, 0),
      averageCostPerSession:
        sessions.reduce((sum, s) => sum + s.cost.estimatedCost, 0) / totalSessions,
      costByTaskType: this.calculateCostByTaskType(sessions),
    };

    const taskTypes = sessions.reduce(
      (acc, s) => {
        acc[s.taskType] = (acc[s.taskType] || 0) + 1;
        return acc;
      },
      {} as Record<TaskType, number>
    );

    return {
      agent,
      period,
      totalSessions,
      totalTime,
      averageSessionTime,
      outcomes,
      quality,
      performance,
      cost,
      taskTypes,
    };
  }

  /**
   * Compare stats across all agents
   */
  async compareAgents(period = '30d'): Promise<ComparisonStats> {
    const agents: AgentType[] = ['claude', 'copilot', 'groq', 'ollama'];
    const stats: Record<AgentType, AgentStats> = {} as Record<AgentType, AgentStats>;

    for (const agent of agents) {
      stats[agent] = await this.getAgentStats(agent, period);
    }

    const recommendations = this.generateRecommendations(stats);

    return {
      period,
      agents: stats,
      recommendations,
    };
  }

  /**
   * Get handoff patterns
   */
  async getHandoffPatterns(period = '30d'): Promise<HandoffPatterns> {
    const sessions = await this.getAllSessionsForPeriod(period);
    const allHandoffs = sessions.flatMap(s => s.handoffs);

    const totalHandoffs = allHandoffs.length;

    const byReason = allHandoffs.reduce(
      (acc, h) => {
        acc[h.reason] = (acc[h.reason] || 0) + 1;
        return acc;
      },
      {} as Record<HandoffRecord['reason'], number>
    );

    const paths: Record<string, number> = {};
    allHandoffs.forEach(h => {
      const path = `${h.fromAgent} → ${h.toAgent}`;
      paths[path] = (paths[path] || 0) + 1;
    });

    const mostCommonPath =
      Object.entries(paths).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

    const automaticVsManual = {
      automatic: allHandoffs.filter(h => h.automatic).length,
      manual: allHandoffs.filter(h => !h.automatic).length,
    };

    return {
      totalHandoffs,
      byReason,
      mostCommonPath,
      automaticVsManual,
    };
  }

  private generateSessionId(): string {
    // Session IDs are for internal tracking only, not security-critical
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getSessionsForPeriod(
    agent: AgentType,
    period: string
  ): Promise<TelemetrySession[]> {
    const allSessions = await this.storage.get<TelemetrySession[]>('telemetry-sessions') || [];
    const cutoffDate = this.getPeriodCutoffDate(period);

    return allSessions.filter(
      s => s.agent === agent && new Date(s.startTime) >= cutoffDate
    );
  }

  private async getAllSessionsForPeriod(period: string): Promise<TelemetrySession[]> {
    const allSessions = await this.storage.get<TelemetrySession[]>('telemetry-sessions') || [];
    const cutoffDate = this.getPeriodCutoffDate(period);

    return allSessions.filter(s => new Date(s.startTime) >= cutoffDate);
  }

  private getPeriodCutoffDate(period: string): Date {
    const now = new Date();
    const match = period.match(/(\d+)([dhm])/);

    if (!match) return new Date(0); // All time

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
      case 'h':
        return new Date(now.getTime() - value * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() - value * 60 * 1000);
      default:
        return new Date(0);
    }
  }

  private calculateCostByTaskType(sessions: TelemetrySession[]): Record<TaskType, number> {
    return sessions.reduce(
      (acc, s) => {
        acc[s.taskType] = (acc[s.taskType] || 0) + s.cost.estimatedCost;
        return acc;
      },
      {} as Record<TaskType, number>
    );
  }

  private generateRecommendations(stats: Record<AgentType, AgentStats>): string[] {
    const recommendations: string[] = [];

    // Find agents with actual data
    const activeAgents = Object.entries(stats).filter(([, s]) => s.totalSessions > 0);
    
    if (activeAgents.length === 0) {
      return ['No sessions recorded yet. Start using the framework to get recommendations.'];
    }

    // Analyze quality metrics
    const bestQuality = activeAgents.sort(
      (a, b) => b[1].quality.averageTokenCompliance - a[1].quality.averageTokenCompliance
    )[0];

    if (bestQuality) {
      recommendations.push(
        `Use ${bestQuality[0]} for highest quality work (${(bestQuality[1].quality.averageTokenCompliance * 100).toFixed(1)}% token compliance)`
      );
    }

    // Analyze cost efficiency
    const freeAgents = activeAgents.filter(([, s]) => s.cost.totalCost === 0);

    if (freeAgents.length > 0) {
      recommendations.push(
        `Use ${freeAgents.map(([agent]) => agent).join(' or ')} for cost optimization (free tier)`
      );
    }

    return recommendations;
  }

  private getEmptyStats(agent: AgentType, period: string): AgentStats {
    return {
      agent,
      period,
      totalSessions: 0,
      totalTime: 0,
      averageSessionTime: 0,
      outcomes: { success: 0, escalated: 0, failed: 0, partial: 0 },
      quality: {
        averageTokenCompliance: 0,
        averageTestPassRate: 0,
        totalViolations: 0,
        violationsFixed: 0,
      },
      performance: {
        averageExecutionTime: 0,
        totalTokensUsed: 0,
        averageFilesModified: 0,
      },
      cost: {
        totalCost: 0,
        averageCostPerSession: 0,
        costByTaskType: {} as Record<TaskType, number>,
      },
      taskTypes: {} as Record<TaskType, number>,
    };
  }
}

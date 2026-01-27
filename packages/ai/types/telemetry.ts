/**
 * Telemetry-specific type definitions
 * @module @dcyfr/ai/types/telemetry
 */

import type { AgentType, TaskType, TaskOutcome, ValidationStatus } from './index';

/**
 * Telemetry metrics collected during a session
 */
export interface TelemetryMetrics {
  // Quality Metrics
  tokenCompliance: number; // 0-1 (% using design tokens)
  testPassRate: number; // 0-1 (% tests passing)
  lintViolations: number; // Count of ESLint violations
  typeErrors: number; // Count of TypeScript errors

  // Performance Metrics
  executionTime: number; // ms
  tokensUsed: number; // API tokens consumed
  filesModified: number; // Number of files changed
  linesChanged: number; // Total lines added/removed

  // Validation Status
  validations: Record<string, ValidationStatus>;
}

/**
 * Violation record for quality issues
 */
export interface ViolationRecord {
  timestamp: Date;
  type: "design-token" | "eslint" | "typescript" | "test" | "security" | "custom";
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
  fixed: boolean;
}

/**
 * Handoff record when switching agents
 */
export interface HandoffRecord {
  timestamp: Date;
  fromAgent: AgentType;
  toAgent: AgentType;
  reason: "rate-limit" | "quality" | "manual" | "cost-optimization" | "offline" | "error";
  automatic: boolean;
}

/**
 * Complete telemetry session data
 */
export interface TelemetrySession {
  sessionId: string;
  agent: AgentType;
  taskType: TaskType;
  taskDescription: string;
  startTime: Date;
  endTime?: Date;
  outcome?: TaskOutcome;
  metrics: TelemetryMetrics;
  violations: ViolationRecord[];
  handoffs: HandoffRecord[];
  cost: {
    provider: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    currency: "USD" | "EUR" | "GBP";
  };
}

/**
 * Aggregated statistics for an agent
 */
export interface AgentStats {
  agent: AgentType;
  period: string; // e.g., '30d', '7d', 'all-time'
  totalSessions: number;
  totalTime: number; // ms
  averageSessionTime: number; // ms
  outcomes: {
    success: number;
    escalated: number;
    failed: number;
    partial: number;
  };
  quality: {
    averageTokenCompliance: number;
    averageTestPassRate: number;
    totalViolations: number;
    violationsFixed: number;
  };
  performance: {
    averageExecutionTime: number;
    totalTokensUsed: number;
    averageFilesModified: number;
  };
  cost: {
    totalCost: number;
    averageCostPerSession: number;
    costByTaskType: Record<TaskType, number>;
  };
  taskTypes: Record<TaskType, number>;
}

/**
 * Comparison statistics across agents
 */
export interface ComparisonStats {
  period: string;
  agents: Record<AgentType, AgentStats>;
  recommendations: string[];
}

/**
 * Handoff pattern analytics
 */
export interface HandoffPatterns {
  totalHandoffs: number;
  byReason: Record<HandoffRecord["reason"], number>;
  mostCommonPath: string;
  automaticVsManual: { automatic: number; manual: number };
}

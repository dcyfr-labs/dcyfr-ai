/**
 * Enhanced Agent Capability Detection System
 * TLP:CLEAR
 * 
 * Builds upon the base CapabilityDetector with dynamic learning, performance
 * tracking, and integration with delegation and MCP systems for intelligent
 * capability management and validation.
 * 
 * @version 1.0.0
 * @date 2026-02-14
 * @module dcyfr-ai/enhanced-capability-detection
 */

import { EventEmitter } from 'events';
import { CapabilityBootstrap, CapabilityDetector } from './capability-bootstrap.js';
import { CapabilityRegistry } from './capability-registry.js';
import { MCPAutoConfiguration } from './mcp-auto-configuration.js';

import type { AgentSource, BootstrapResult, CapabilityDetectionConfig } from './capability-bootstrap.js';
import type { AgentCapabilityManifest, AgentCapability } from './types/agent-capabilities.js';
import type { DelegationContract } from './types/delegation-contracts.js';

/**
 * Capability performance metrics
 */
export interface CapabilityPerformanceMetrics {
  /**
   * Capability identifier
   */
  capabilityId: string;
  
  /**
   * Agent identifier
   */
  agentId: string;
  
  /**
   * Total executions of this capability
   */
  totalExecutions: number;
  
  /**
   * Successful executions
   */
  successfulExecutions: number;
  
  /**
   * Average execution time (milliseconds)
   */
  averageExecutionTime: number;
  
  /**
   * Success rate (0-1)
   */
  successRate: number;
  
  /**
   * Current confidence level
   */
  confidenceLevel: number;
  
  /**
   * Last execution timestamp
   */
  lastExecutionAt: Date;
  
  /**
   * Performance trend ('improving' | 'stable' | 'declining')
   */
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * Dynamic capability learning result
 */
export interface CapabilityLearningResult {
  /**
   * agent identifier
   */
  agentId: string;
  
  /**
   * Newly discovered capabilities
   */
  discoveredCapabilities: string[];
  
  /**
   * Confidence updates applied
   */
  confidenceUpdates: Array<{
    capabilityId: string;
    oldConfidence: number;
    newConfidence: number;
    reason: string;
  }>;
  
  /**
   * Performance insights
   */
  performanceInsights: string[];
  
  /**
   * Recommendations for improvement
   */
  recommendations: string[];
}

/**
 * Enhanced detection configuration
 */
export interface EnhancedDetectionConfig extends CapabilityDetectionConfig {
  /**
   * Enable dynamic learning from delegation outcomes
   */
  enableDynamicLearning?: boolean;
  
  /**
   * Enable real-time confidence updates
   */
  enableConfidenceUpdates?: boolean;
  
  /**
   * Confidence adjustment rate (0-1, smaller = more conservative)
   */
  confidenceAdjustmentRate?: number;
  
  /**
   * Minimum executions required for trend analysis
   */
  minExecutionsForTrend?: number;
  
  /**
   * Enable capability performance tracking
   */
  enablePerformanceTracking?: boolean;
  
  /**
   * Enable MCP integration for capability validation
   */
  enableMCPIntegration?: boolean;
  
  /**
   * Workspace root for MCP auto-configuration
   */
  workspaceRoot?: string;
}

/**
 * Enhanced Agent Capability Detection System
 * 
 * Provides intelligent capability detection with dynamic learning,
 * performance tracking, and integration with delegation workflows.
 */
export class EnhancedCapabilityDetection extends EventEmitter {
  private bootstrap: CapabilityBootstrap;
  private registry: CapabilityRegistry;
  private mcpAutoConfig?: MCPAutoConfiguration;
  private config: Required<EnhancedDetectionConfig>;
  private performanceMetrics: Map<string, CapabilityPerformanceMetrics> = new Map();
  private learningHistory: Map<string, CapabilityLearningResult[]> = new Map();

  constructor(config?: EnhancedDetectionConfig) {
    super();
    
    this.config = {
      // Base detection config
      minimumKeywordMatches: config?.minimumKeywordMatches ?? 2,
      fuzzyMatching: config?.fuzzyMatching ?? true,
      customKeywordMappings: config?.customKeywordMappings ?? {},
      mandatoryCapabilities: config?.mandatoryCapabilities ?? ['pattern_enforcement'],
      agentTier: config?.agentTier ?? 'generic',
      
      // Enhanced config
      enableDynamicLearning: config?.enableDynamicLearning ?? true,
      enableConfidenceUpdates: config?.enableConfidenceUpdates ?? true, 
      confidenceAdjustmentRate: config?.confidenceAdjustmentRate ?? 0.1,
      minExecutionsForTrend: config?.minExecutionsForTrend ?? 5,
      enablePerformanceTracking: config?.enablePerformanceTracking ?? true,
      enableMCPIntegration: config?.enableMCPIntegration ?? true,
      workspaceRoot: config?.workspaceRoot ?? process.cwd(),
    };

    this.bootstrap = new CapabilityBootstrap(this.config);
    this.registry = new CapabilityRegistry();

    // Initialize MCP integration if enabled
    if (this.config.enableMCPIntegration && this.config.workspaceRoot) {
      this.mcpAutoConfig = new MCPAutoConfiguration({
        workspaceRoot: this.config.workspaceRoot,
        autoStartServers: true,
        healthMonitoring: true,
      });
    }

    this.setupEventHandlers();
  }

  /**
   * Setup inter-system event handlers
   */
  private setupEventHandlers(): void {
    // Registry events for capability tracking
    this.registry.on('manifest_registered', ({ agentId, manifest }) => {
      this.initializePerformanceMetrics(agentId, manifest);
      
      if (this.mcpAutoConfig) {
        this.mcpAutoConfig.registerAgent(manifest);
      }
      
      this.emit('agent_capability_detected', { agentId, manifest });
    });
  }

  /**
   * Detect and register agent capabilities with enhanced analysis
   */
  async detectAndRegisterCapabilities(
    source: AgentSource,
    agentId?: string
  ): Promise<{
    bootstrapResult: BootstrapResult;
    performanceBaseline: CapabilityPerformanceMetrics[];
    mcpRecommendations?: string[];
  }> {
    // Step 1: Bootstrap capability detection
    const bootstrapResult = await this.bootstrap.bootstrap(source);
    
    // Step 2: Register with registry
    await this.registry.registerManifest(bootstrapResult.manifest);
    
    // Step 3: Initialize performance tracking
    const performanceBaseline = this.initializePerformanceMetrics(
      bootstrapResult.agentId, 
      bootstrapResult.manifest
    );
    
    // Step 4: Get MCP recommendations if integration enabled
    let mcpRecommendations: string[] = [];
    if (this.mcpAutoConfig) {
      const configResult = await this.mcpAutoConfig.reconfigureServers();
      mcpRecommendations = configResult.recommendations
        .filter(rec => rec.type === 'required' || rec.type === 'recommended')
        .map(rec => `${rec.serverName}: ${rec.explanation}`);
    }

    this.emit('capability_detection_complete', {
      agentId: bootstrapResult.agentId,
      detectedCapabilities: bootstrapResult.detectedCapabilities.length,
      mcpServersConfigured: mcpRecommendations.length,
    });

    return {
      bootstrapResult,
      performanceBaseline,
      mcpRecommendations,
    };
  }

  /**
   * Learn from delegation contract completion
   */
  async learnFromDelegation(contract: DelegationContract): Promise<CapabilityLearningResult | null> {
    if (!this.config.enableDynamicLearning) {
      return null;
    }

    const learningResult: CapabilityLearningResult = {
      agentId: contract.delegatee_agent_id,
      discoveredCapabilities: [],
      confidenceUpdates: [],
      performanceInsights: [],
      recommendations: [],
    };

    // Update performance metrics
    if (this.config.enablePerformanceTracking) {
      await this.updatePerformanceMetrics(contract);
    }

    // Update confidence based on success/failure
    if (this.config.enableConfidenceUpdates && contract.verification_result) {
      const confidenceUpdates = await this.updateConfidenceFromOutcome(contract);
      learningResult.confidenceUpdates = confidenceUpdates;
    }

    // Analyze performance trends
    const performanceInsights = this.analyzePerformanceTrends(contract.delegatee_agent_id);
    learningResult.performanceInsights = performanceInsights;

    // Generate improvement recommendations
    const recommendations = this.generateImprovementRecommendations(contract.delegatee_agent_id);
    learningResult.recommendations = recommendations;

    // Store learning result
    const agentHistory = this.learningHistory.get(contract.delegatee_agent_id) || [];
    agentHistory.push(learningResult);
    this.learningHistory.set(contract.delegatee_agent_id, agentHistory);

    this.emit('capability_learning_complete', { 
      contractId: contract.contract_id,
      agentId: contract.delegatee_agent_id,
      learningResult 
    });

    return learningResult;
  }

  /**
   * Get comprehensive capability analysis for an agent
   */
  async getCapabilityAnalysis(agentId: string): Promise<{
    manifest: AgentCapabilityManifest | null;
    performanceMetrics: CapabilityPerformanceMetrics[];
    learningHistory: CapabilityLearningResult[];
    recommendations: string[];
    mcpServerStatus?: Array<{ name: string; healthy: boolean }>;
  }> {
    const manifest = this.registry.getManifest(agentId) || null;
    const performanceMetrics = this.getAgentPerformanceMetrics(agentId);
    const learningHistory = this.learningHistory.get(agentId) || [];
    const recommendations = this.generateImprovementRecommendations(agentId);

    let mcpServerStatus: Array<{ name: string; healthy: boolean }> = [];
    if (this.mcpAutoConfig) {
      const healthResults = await this.mcpAutoConfig.healthCheckServers();
      mcpServerStatus = Array.from(healthResults.entries()).map(([name, healthy]) => ({
        name,
        healthy,
      }));
    }

    return {
      manifest,
      performanceMetrics,
      learningHistory,
      recommendations,
      mcpServerStatus: mcpServerStatus.length > 0 ? mcpServerStatus : undefined,
    };
  }

  /**
   * Re-evaluate agent capabilities based on performance data
   */
  async reevaluateCapabilities(agentId: string): Promise<{
    updatedManifest: AgentCapabilityManifest | null;
    changes: Array<{
      capabilityId: string;
      changeType: 'confidence_increase' | 'confidence_decrease' | 'capability_added' | 'capability_removed';
      previousValue?: number;
      newValue?: number;
      reason: string;
    }>;
  }> {
    const manifest = await this.registry.getManifest(agentId);
    if (!manifest) {
      return { updatedManifest: null, changes: [] };
    }

    const changes: Array<{
      capabilityId: string;
      changeType: 'confidence_increase' | 'confidence_decrease' | 'capability_added' | 'capability_removed';
      previousValue?: number;
      newValue?: number;
      reason: string;
    }> = [];

    const updatedCapabilities = manifest.capabilities.map(capability => {
      const performanceMetric = this.performanceMetrics.get(
        `${agentId}:${capability.capability_id}`
      );

      if (performanceMetric && performanceMetric.totalExecutions >= this.config.minExecutionsForTrend) {
        // Adjust confidence based on success rate
        const targetConfidence = this.calculateTargetConfidence(performanceMetric);
        const confidenceDiff = targetConfidence - capability.confidence_level;
        
        if (Math.abs(confidenceDiff) > 0.05) { // 5% threshold for changes
          const newConfidence = capability.confidence_level + 
            (confidenceDiff * this.config.confidenceAdjustmentRate);
          
          changes.push({
            capabilityId: capability.capability_id,
            changeType: confidenceDiff > 0 ? 'confidence_increase' : 'confidence_decrease',
            previousValue: capability.confidence_level,
            newValue: newConfidence,
            reason: `Based on ${performanceMetric.totalExecutions} executions with ${(performanceMetric.successRate * 100).toFixed(1)}% success rate`,
          });

          return {
            ...capability,
            confidence_level: Math.max(0.1, Math.min(0.98, newConfidence)),
          };
        }
      }

      return capability;
    });

    const updatedManifest: AgentCapabilityManifest = {
      ...manifest,
      capabilities: updatedCapabilities,
      overall_confidence: this.calculateOverallConfidence(updatedCapabilities),
      updated_at: new Date().toISOString(),
    };

    if (changes.length > 0) {
      await this.registry.updateManifest(agentId, updatedManifest);
    }

    return { updatedManifest, changes };
  }

  /**
   * Initialize performance metrics for new agent
   */
  private initializePerformanceMetrics(
    agentId: string,
    manifest: AgentCapabilityManifest
  ): CapabilityPerformanceMetrics[] {
    const metrics: CapabilityPerformanceMetrics[] = [];

    for (const capability of manifest.capabilities) {
      const metricKey = `${agentId}:${capability.capability_id}`;
      const metric: CapabilityPerformanceMetrics = {
        capabilityId: capability.capability_id,
        agentId,
        totalExecutions: 0,
        successfulExecutions: 0,
        averageExecutionTime: capability.completion_time_estimate_ms || 60000,
        successRate: 0,
        confidenceLevel: capability.confidence_level,
        lastExecutionAt: new Date(),
        trend: 'stable',
      };

      this.performanceMetrics.set(metricKey, metric);
      metrics.push(metric);
    }

    return metrics;
  }

  /**
   * Update performance metrics based on delegation outcome
   */
  private async updatePerformanceMetrics(contract: DelegationContract): Promise<void> {
    for (const requiredCapability of (contract.required_capabilities || [])) {
      const capId = typeof requiredCapability === 'string' ? requiredCapability : requiredCapability.capability_id;
      const metricKey = `${contract.delegatee_agent_id}:${capId}`;
      const metric = this.performanceMetrics.get(metricKey);

      if (metric) {
        metric.totalExecutions += 1;
        if (contract.status === 'completed' && contract.verification_result?.verified) {
          metric.successfulExecutions += 1;
        }

        metric.successRate = metric.totalExecutions > 0 
          ? metric.successfulExecutions / metric.totalExecutions 
          : 0;

        // Update execution time if available
        if (contract.completed_at && contract.activated_at) {
          const executionTime = new Date(contract.completed_at).getTime() - 
                               new Date(contract.activated_at).getTime();
          metric.averageExecutionTime = (metric.averageExecutionTime + executionTime) / 2;
        }

        metric.lastExecutionAt = new Date();

        // Update trend analysis
        if (metric.totalExecutions >= this.config.minExecutionsForTrend) {
          metric.trend = this.calculateTrend(metric);
        }

        this.performanceMetrics.set(metricKey, metric);
      }
    }
  }

  /**
   * Update confidence based on delegation outcome
   */
  private async updateConfidenceFromOutcome(
    contract: DelegationContract
  ): Promise<Array<{ capabilityId: string; oldConfidence: number; newConfidence: number; reason: string }>> {
    const updates: Array<{ capabilityId: string; oldConfidence: number; newConfidence: number; reason: string }> = [];
    const manifest = await this.registry.getManifest(contract.delegatee_agent_id);
    
    if (!manifest) return updates;

    const updatedCapabilities = manifest.capabilities.map(capability => {
      const wasUsed = (contract.required_capabilities || []).some(req => {
        const reqId = typeof req === 'string' ? req : req.capability_id;
        return reqId === capability.capability_id;
      });

      if (wasUsed) {
        const oldConfidence = capability.confidence_level;
        let adjustment = 0;
        let reason = '';

        if (contract.status === 'completed' && contract.verification_result?.verified) {
          adjustment = this.config.confidenceAdjustmentRate * 0.5; // Small positive adjustment
          reason = 'Successful task completion';
        } else if (contract.status === 'failed') {
          adjustment = -this.config.confidenceAdjustmentRate * 0.3; // Small negative adjustment
          reason = 'Task failure';
        }

        if (adjustment !== 0) {
          const newConfidence = Math.max(0.1, Math.min(0.98, oldConfidence + adjustment));
          
          updates.push({
            capabilityId: capability.capability_id,
            oldConfidence,
            newConfidence,
            reason,
          });

          return { ...capability, confidence_level: newConfidence };
        }
      }

      return capability;
    });

    if (updates.length > 0) {
      await this.registry.updateManifest(contract.delegatee_agent_id, {
        capabilities: updatedCapabilities,
      });
    }

    return updates;
  }

  /**
   * Analyze performance trends for an agent
   */
  private analyzePerformanceTrends(agentId: string): string[] {
    const insights: string[] = [];
    const agentMetrics = this.getAgentPerformanceMetrics(agentId);

    for (const metric of agentMetrics) {
      if (metric.totalExecutions < this.config.minExecutionsForTrend) {
        continue;
      }

      switch (metric.trend) {
        case 'improving':
          insights.push(`${metric.capabilityId}: Performance improving (${(metric.successRate * 100).toFixed(1)}% success rate)`);
          break;
        case 'declining':
          insights.push(`${metric.capabilityId}: Performance declining (${(metric.successRate * 100).toFixed(1)}% success rate)`);
          break;
        case 'stable':
          if (metric.successRate >= 0.9) {
            insights.push(`${metric.capabilityId}: Excellent stable performance (${(metric.successRate * 100).toFixed(1)}% success rate)`);
          }
          break;
      }
    }

    return insights;
  }

  /**
   * Generate improvement recommendations for an agent
   */
  private generateImprovementRecommendations(agentId: string): string[] {
    const recommendations: string[] = [];
    const agentMetrics = this.getAgentPerformanceMetrics(agentId);

    for (const metric of agentMetrics) {
      if (metric.successRate < 0.7 && metric.totalExecutions >= this.config.minExecutionsForTrend) {
        recommendations.push(`Consider additional training for ${metric.capabilityId} (current success rate: ${(metric.successRate * 100).toFixed(1)}%)`);
      }

      if (metric.averageExecutionTime > metric.averageExecutionTime * 2) {
        recommendations.push(`${metric.capabilityId} taking longer than expected - investigate performance bottlenecks`);
      }

      if (metric.trend === 'declining') {
        recommendations.push(`${metric.capabilityId} performance declining - review recent changes or provide additional guidance`);
      }
    }

    return recommendations;
  }

  /**
   * Get performance metrics for a specific agent
   */
  private getAgentPerformanceMetrics(agentId: string): CapabilityPerformanceMetrics[] {
    const metrics: CapabilityPerformanceMetrics[] = [];
    
    for (const [key, metric] of this.performanceMetrics.entries()) {
      if (key.startsWith(`${agentId}:`)) {
        metrics.push(metric);
      }
    }

    return metrics;
  }

  /**
   * Calculate target confidence based on performance
   */
  private calculateTargetConfidence(metric: CapabilityPerformanceMetrics): number {
    // Base confidence on success rate with adjustments for execution count
    const baseConfidence = metric.successRate;
    
    // Confidence increases with more data points (up to 95% max)
    const experienceBoost = Math.min(0.1, metric.totalExecutions * 0.01);
    
    return Math.min(0.95, baseConfidence + experienceBoost);
  }

  /**
   * Calculate performance trend
   */
  private calculateTrend(metric: CapabilityPerformanceMetrics): 'improving' | 'stable' | 'declining' {
    // Simple trend analysis based on recent performance vs overall average
    // In a real implementation, this would analyze a sliding window of recent executions
    
    const currentConfidence = metric.confidenceLevel;
    const performanceBased = metric.successRate;
    const diff = performanceBased - currentConfidence;

    if (diff > 0.1) return 'improving';
    if (diff < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Calculate overall confidence from individual capabilities
   */
  private calculateOverallConfidence(capabilities: AgentCapability[]): number {
    if (capabilities.length === 0) return 0;
    
    const totalConfidence = capabilities.reduce((sum, cap) => sum + cap.confidence_level, 0);
    return totalConfidence / capabilities.length;
  }

  /**
   * Get system-wide capability metrics
   */
  async getSystemMetrics(): Promise<{
    totalAgents: number;
    totalCapabilities: number;
    averageSuccessRate: number;
    topPerformingCapabilities: Array<{ capabilityId: string; successRate: number }>;
  }> {
    const allManifests = await this.registry.listManifests();
    const allMetrics = Array.from(this.performanceMetrics.values());
    
    const totalSuccessRate = allMetrics.reduce((sum, metric) => sum + metric.successRate, 0);
    const averageSuccessRate = allMetrics.length > 0 ? totalSuccessRate / allMetrics.length : 0;
    
    const capabilityPerformance = new Map<string, { totalRate: number; count: number }>();
    
    for (const metric of allMetrics) {
      const current = capabilityPerformance.get(metric.capabilityId) || { totalRate: 0, count: 0 };
      current.totalRate += metric.successRate;
      current.count += 1;
      capabilityPerformance.set(metric.capabilityId, current);
    }

    const topPerformingCapabilities = Array.from(capabilityPerformance.entries())
      .map(([capabilityId, data]) => ({
        capabilityId,
        successRate: data.totalRate / data.count,
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 10);

    return {
      totalAgents: allManifests.length,
      totalCapabilities: capabilityPerformance.size,
      averageSuccessRate,
      topPerformingCapabilities,
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.removeAllListeners();
    
    if (this.mcpAutoConfig) {
      await this.mcpAutoConfig.shutdown();
    }
  }
}

/**
 * Factory function for enhanced capability detection
 */
export function createEnhancedCapabilityDetection(
  config?: EnhancedDetectionConfig
): EnhancedCapabilityDetection {
  return new EnhancedCapabilityDetection(config);
}

export default EnhancedCapabilityDetection;
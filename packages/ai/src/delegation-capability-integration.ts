/**
 * DCYFR Delegation-Capability Integration Layer
 * TLP:CLEAR
 * 
 * Integrates the capability bootstrap system with the delegation engine for
 * automated agent capability discovery, registration, and intelligent delegation.
 * 
 * @version 1.0.0
 * @date 2026-02-14
 * @module dcyfr-ai/delegation-capability-integration
 */

import { EventEmitter } from 'events';
import { CapabilityBootstrap } from './capability-bootstrap.js';
import { CapabilityRegistry } from './capability-registry.js';
import { ContractManager } from '../delegation/contract-manager.js';
import { DelegationChainTracker } from '../delegation/chain-tracker.js';

import type { AgentSource, BootstrapResult, CapabilityDetectionConfig } from './capability-bootstrap.js';
import type { AgentCapabilityManifest, DelegationCapability, DelegationRecommendation } from './types/agent-capabilities.js';
import type { DelegationContract, SuccessCriteria } from './types/delegation-contracts.js';

/**
 * Integration configuration
 */
export interface DelegationCapabilityConfig {
  /**
   * Capability detection configuration
   */
  capabilityDetection?: CapabilityDetectionConfig;
  
  /**
   * Automatic agent registration on capability detection
   */
  autoRegisterAgents?: boolean;
  
  /**
   * Minimum confidence threshold for delegation
   */
  minimumDelegationConfidence?: number;
  
  /**
   * Maximum delegation chain depth
   */
  maxChainDepth?: number;
  
  /**
   * Enable automatic capability validation
   */
  enableCapabilityValidation?: boolean;
  
  /**
   * Telemetry and monitoring configuration
   */
  enableTelemetry?: boolean;
}

/**
 * Agent onboarding result
 */
export interface AgentOnboardingResult {
  /**
   * Agent identifier
   */
  agentId: string;
  
  /**
   * Bootstrap result with detected capabilities
   */
  bootstrapResult: BootstrapResult;
  
  /**
   * Whether agent was successfully registered
   */
  registered: boolean;
  
  /**
   * Registration errors if any
   */
  errors?: string[];
  
  /**
   * Suggested improvements
   */
  suggestions: string[];
}

/**
 * Delegation recommendation result
 */
/**
 * Delegation and Capability Integration System
 * 
 * Provides end-to-end integration between capability detection,
 * agent registration, and intelligent delegation workflows.
 */
export class DelegationCapabilityIntegration extends EventEmitter {
  private bootstrap: CapabilityBootstrap;
  private registry: CapabilityRegistry;
  private contractManager: ContractManager;
  private chainTracker: DelegationChainTracker;
  private config: DelegationCapabilityConfig;

  constructor(config: DelegationCapabilityConfig = {}) {
    super();
    
    this.config = {
      autoRegisterAgents: true,
      minimumDelegationConfidence: 0.7,
      maxChainDepth: 10,
      enableCapabilityValidation: true,
      enableTelemetry: true,
      ...config,
    };
    
    // Initialize core components
    this.bootstrap = new CapabilityBootstrap(this.config.capabilityDetection);
    this.registry = new CapabilityRegistry();
    this.contractManager = new ContractManager({
      debug: this.config.enableTelemetry,
    });
    this.chainTracker = new DelegationChainTracker(this.contractManager, {
      maxChainDepth: this.config.maxChainDepth,
      debug: false,
    });
    
    this.setupEventHandlers();
  }

  /**
   * Setup inter-component event handlers
   */
  private setupEventHandlers(): void {
    // Registry events
    this.registry.on('manifest_registered', ({ agentId, manifest }) => {
      this.emit('agent_onboarded', { agentId, manifest });
    });

    // Contract events
    this.contractManager.on('contract_created', (contract: DelegationContract) => {
      this.emit('delegation_created', { contractId: contract.contract_id });
    });

    // Capability validation events
    if (this.config.enableCapabilityValidation) {
      this.contractManager.on('contract_completed', (contract: DelegationContract) => {
        this.updateCapabilityConfidence(contract);
      });
    }
  }

  /**
   * Onboard a new agent with automatic capability detection and registration
   */
  async onboardAgent(source: AgentSource, agentId?: string): Promise<AgentOnboardingResult> {
    try {
      // Step 1: Bootstrap capability detection
      const bootstrapResult = await this.bootstrap.bootstrap(source);
      
      const result: AgentOnboardingResult = {
        agentId: bootstrapResult.agentId,
        bootstrapResult,
        registered: false,
        suggestions: bootstrapResult.suggestions,
      };

      // Step 2: Auto-register if enabled
      if (this.config.autoRegisterAgents) {
        try {
          this.registry.registerManifest(bootstrapResult.manifest);
          result.registered = true;
          
          this.emit('agent_onboarded', {
            agentId: bootstrapResult.agentId,
            manifest: bootstrapResult.manifest,
            detectedCapabilities: bootstrapResult.detectedCapabilities,
          });
        } catch (error) {
          result.errors = [`Registration failed: ${error instanceof Error ? error.message : String(error)}`];
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Agent onboarding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find optimal agent for task delegation based on capabilities
   */
  async findOptimalAgent(requiredCapabilities: DelegationCapability[]): Promise<DelegationRecommendation[]> {
    const matches = this.registry.findMatches({
      required_capabilities: requiredCapabilities.map(cap => cap.capability_id),
      min_confidence: this.config.minimumDelegationConfidence,
    });

    const recommendations: DelegationRecommendation[] = [];

    for (const match of matches) {
      const manifest = this.registry.getManifest(match.agent_id);
      if (!manifest) continue;

      // Calculate workload factor based on active contracts
      const activeContracts = this.contractManager.queryContracts({
        delegatee_agent_id: match.agent_id,
        status: ['active', 'pending'],
      });
      const workloadFactor = Math.min(1, activeContracts.length / 5); // Assume 5 is max capacity

      // Estimate completion time based on capability estimates
      const estimatedTime = match.estimated_completion_time_ms;

      recommendations.push({
        agent_id: match.agent_id,
        agent_name: manifest.agent_name,
        matched_capabilities: [match],
        recommendation_score: match.match_score,
        recommendation_reasons: match.match_reasons,
        estimated_completion_time_ms: estimatedTime,
        availability: match.availability,
        warnings: match.warnings,
        confidence: match.match_score,
      });
    }

    // Sort by recommendation score
    return recommendations.sort((a, b) => b.recommendation_score - a.recommendation_score);
  }

  /**
   * Create delegation contract with capability-based agent assignment
   */
  async createDelegationContract(
    taskDescription: string,
    requiredCapabilities: DelegationCapability[],
    delegatorAgentId: string,
    options: {
      priority?: number;
      timeout_ms?: number;
      max_chart_depth?: number;
      tlp_classification?: string;
    } = {}
  ): Promise<{ contractId: string; assignedAgent: string; recommendation: DelegationRecommendation }> {
    // Step 1: Find optimal agent
    const recommendations = await this.findOptimalAgent(requiredCapabilities);
    
    if (recommendations.length === 0) {
      throw new Error('No suitable agents found for required capabilities');
    }

    const bestAgent = recommendations[0];
    
    // Step 2: Create delegation contract
    const contract: Omit<DelegationContract, 'contract_id' | 'created_at'> = {
      task_id: `task-${Date.now()}`,
      delegator: {
        agent_id: delegatorAgentId,
        agent_name: delegatorAgentId, // TODO: Get actual name from registry
      },
      delegatee: {
        agent_id: bestAgent.agent_id,
        agent_name: bestAgent.agent_name,
      },
      delegator_agent_id: delegatorAgentId,
      delegatee_agent_id: bestAgent.agent_id,
      task_description: taskDescription,
      verification_policy: 'direct_inspection',
      tlp_classification: (options.tlp_classification as any) || 'TLP:CLEAR',
      success_criteria: {
        quality_threshold: 0.8,
        required_checks: ['completeness', 'verification'],
      },
      required_capabilities: requiredCapabilities.map(cap => ({
        capability_id: cap.capability_id,
        min_confidence: cap.min_confidence || 0.7,
      })),
      priority: options.priority || 5,
      timeout_ms: options.timeout_ms || bestAgent.estimated_completion_time_ms * 1.5,
      status: 'pending',
      metadata: {
        delegation_depth: options.max_chart_depth || 1,
        agent_selection: {
          match_confidence: bestAgent.recommendation_score,
          estimated_completion: bestAgent.estimated_completion_time_ms,
          selection_time: new Date().toISOString(),
        },
      },
    };

    const createdContract = await this.contractManager.createContract(contract as any);

    this.emit('delegation_contract_created', {
      contractId: createdContract.contract_id,
      assignedAgent: bestAgent.agent_id,
      requiredCapabilities,
      recommendation: bestAgent,
    });

    return {
      contractId: createdContract.contract_id,
      assignedAgent: bestAgent.agent_id,
      recommendation: bestAgent,
    };
  }

  /**
   * Batch onboard multiple agents from a directory or list of sources
   */
  async batchOnboardAgents(sources: AgentSource[]): Promise<AgentOnboardingResult[]> {
    const results: AgentOnboardingResult[] = [];
    const concurrencyLimit = 5;
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < sources.length; i += concurrencyLimit) {
      const batch = sources.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.allSettled(
        batch.map(source => this.onboardAgent(source))
      );
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            agentId: 'unknown',
            bootstrapResult: null as any,
            registered: false,
            errors: [`Batch onboarding failed: ${result.reason.message}`],
            suggestions: ['Check agent source format and try individual onboarding'],
          });
        }
      }
    }

    this.emit('batch_onboarding_complete', { totalAgents: sources.length, results });
    return results;
  }

  /**
   * Get delegation chain analysis for a contract
   */
  async analyzeDelegationChain(contractId: string): Promise<{
    analysis: any;
    recommendations: string[];
  }> {
    const analysis = await this.chainTracker.buildChain(contractId);
    const chainAnalysis = await this.chainTracker.analyzeChain(contractId);
    
    const recommendations: string[] = [];
    
    if (!chainAnalysis) {
      return { analysis, recommendations };
    }
    
    if ((chainAnalysis.depth ?? 0) > (this.config.maxChainDepth ?? 10) * 0.8) {
      recommendations.push('Chain depth approaching limit - consider direct assignment');
    }
    
    if (chainAnalysis.has_loops) {
      recommendations.push('Delegation loops detected - review chain logic');
    }
    
    if ((chainAnalysis.firebreak_contracts?.length ?? 0) === 0 && (chainAnalysis.depth ?? 0) > 3) {
      recommendations.push('Consider adding liability firebreaks for deep chains');
    }

    return { analysis: chainAnalysis, recommendations };
  }

  /**
   * Update capability confidence based on successful completions
   */
  private async updateCapabilityConfidence(contract: DelegationContract): Promise<void> {
    if (contract.status !== 'completed' || !contract.verification_result?.verified) {
      return;
    }

    const manifest = this.registry.getManifest(contract.delegatee_agent_id);
    if (!manifest) return;

    const updatedCapabilities = manifest.capabilities.map(capability => {
      // Check if this capability was used in the contract
      const wasUsed = (contract.required_capabilities || []).some(req => {
        const reqId = typeof req === 'string' ? req : req.capability_id;
        return reqId === capability.capability_id;
      });

      if (wasUsed) {
        // Increase confidence slightly on successful completion
        const confidenceBoost = 0.02; // Small incremental increase
        return {
          ...capability,
          confidence_level: Math.min(0.98, capability.confidence_level + confidenceBoost),
        };
      }

      return capability;
    });

    this.registry.updateManifest(contract.delegatee_agent_id, {
      capabilities: updatedCapabilities,
    });

    this.emit('capability_confidence_updated', {
      agentId: contract.delegatee_agent_id,
      contractId: contract.contract_id,
    });
  }

  /**
   * Generate recommendation reasons for UI display
   */
  private generateRecommendationReasons(
    match: any,
    manifest: AgentCapabilityManifest
  ): string[] {
    const reasons: string[] = [];
    
    if (match.total_score >= 0.9) {
      reasons.push('Excellent capability match');
    } else if (match.total_score >= 0.7) {
      reasons.push('Good capability match');
    }
    
    if ((manifest.overall_confidence ?? 0) >= 0.9) {
      reasons.push('High proven success rate');
    }
    
    if (manifest.specializations && manifest.specializations.length > 0) {
      reasons.push(`Specialized in: ${manifest.specializations.join(', ')}`);
    }

    return reasons;
  }

  /**
   * Get system health and metrics
   */
  async getSystemMetrics(): Promise<{
    totalAgents: number;
    activeContracts: number;
    averageConfidence: number;
    topCapabilities: Array<{ capability: string; agentCount: number }>;
  }> {
    const allManifests = this.registry.listManifests();
    const activeContracts = this.contractManager.queryContracts({
      status: ['active', 'pending'],
    });

    const capabilityCount = new Map<string, number>();
    let totalConfidence = 0;

    for (const manifest of allManifests) {
      totalConfidence += manifest.overall_confidence || 0;
      
      for (const capability of manifest.capabilities) {
        capabilityCount.set(
          capability.capability_id,
          (capabilityCount.get(capability.capability_id) || 0) + 1
        );
      }
    }

    const topCapabilities = Array.from(capabilityCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([capability, agentCount]) => ({ capability, agentCount }));

    return {
      totalAgents: allManifests.length,
      activeContracts: activeContracts.length,
      averageConfidence: allManifests.length > 0 ? totalConfidence / allManifests.length : 0,
      topCapabilities,
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.removeAllListeners();
    this.contractManager.clearAll();
  }
}

/**
 * Factory function for creating integration system with defaults
 */
export function createDelegationCapabilityIntegration(
  config?: DelegationCapabilityConfig
): DelegationCapabilityIntegration {
  return new DelegationCapabilityIntegration(config);
}

/**
 * Export integration system as default
 */
export default DelegationCapabilityIntegration;
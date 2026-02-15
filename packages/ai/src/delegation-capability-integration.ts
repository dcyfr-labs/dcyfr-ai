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
import type { AgentCapabilityManifest, DelegationCapability } from './types/agent-capabilities.js';
import type { DelegationContract } from './types/delegation-contracts.js';

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
export interface DelegationRecommendation {
  /**
   * Recommended agent ID for delegation
   */
  agentId: string;
  
  /**
   * Agent name
   */
  agentName: string;
  
  /**
   * Match confidence (0-1)
   */
  matchConfidence: number;
  
  /**
   * Matching capabilities
   */
  matchingCapabilities: string[];
  
  /**
   * Estimated completion time (milliseconds)
   */
  estimatedCompletionTime: number;
  
  /**
   * Current workload factor (0-1, higher = busier)
   */
  workloadFactor: number;
  
  /**
   * Reasons for recommendation
   */
  reasons: string[];
}

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
      enable_telemetry: this.config.enableTelemetry,
      enable_tlp_enforcement: true,
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
      const bootstrapResult = await this.bootstrap.bootstrap(source, agentId);
      
      const result: AgentOnboardingResult = {
        agentId: bootstrapResult.agentId,
        bootstrapResult,
        registered: false,
        suggestions: bootstrapResult.suggestions,
      };

      // Step 2: Auto-register if enabled
      if (this.config.autoRegisterAgents) {
        try {
          await this.registry.registerManifest(bootstrapResult.manifest);
          result.registered = true;
          
          this.emit('agent_onboarded', {
            agentId: bootstrapResult.agentId,
            manifest: bootstrapResult.manifest,
            detectedCapabilities: bootstrapResult.detectedCapabilities,
          });
        } catch (error) {
          result.errors = [`Registration failed: ${error.message}`];
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Agent onboarding failed: ${error.message}`);
    }
  }

  /**
   * Find optimal agent for task delegation based on capabilities
   */
  async findOptimalAgent(requiredCapabilities: DelegationCapability[]): Promise<DelegationRecommendation[]> {
    const matches = await this.registry.findMatches({
      capabilities: requiredCapabilities,
      require_all: false,
      min_confidence: this.config.minimumDelegationConfidence,
    });

    const recommendations: DelegationRecommendation[] = [];

    for (const match of matches) {
      const manifest = await this.registry.getManifest(match.agent_id);
      if (!manifest) continue;

      // Calculate workload factor based on active contracts
      const activeContracts = await this.contractManager.queryContracts({
        delegatee_agent_id: match.agent_id,
        status: ['active', 'pending'],
      });
      const workloadFactor = Math.min(1, activeContracts.length / 5); // Assume 5 is max capacity

      // Estimate completion time based on capability estimates
      const estimatedTime = match.matching_capabilities.reduce((total, cap) => {
        const capability = manifest.capabilities.find(c => c.capability_id === cap.capability_id);
        return total + (capability?.completion_time_estimate_ms || 60000);
      }, 0);

      recommendations.push({
        agentId: match.agent_id,
        agentName: manifest.agent_name,
        matchConfidence: match.total_score,
        matchingCapabilities: match.matching_capabilities.map(c => c.capability_id),
        estimatedCompletionTime: estimatedTime,
        workloadFactor,
        reasons: this.generateRecommendationReasons(match, manifest),
      });
    }

    // Sort by match confidence and workload
    return recommendations.sort((a, b) => {
      const scoreA = a.matchConfidence * (1 - a.workloadFactor * 0.3);
      const scoreB = b.matchConfidence * (1 - b.workloadFactor * 0.3);
      return scoreB - scoreA;
    });
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
      delegator_agent_id: delegatorAgentId,
      delegatee_agent_id: bestAgent.agentId,
      task_description: taskDescription,
      required_capabilities: requiredCapabilities,
      priority: options.priority || 5,
      timeout_ms: options.timeout_ms || bestAgent.estimatedCompletionTime * 1.5,
      max_chain_depth: options.max_chart_depth || this.config.maxChainDepth,
      tlp_classification: options.tlp_classification || 'TLP:CLEAR',
      status: 'pending',
      metadata: {
        agent_selection: {
          match_confidence: bestAgent.matchConfidence,
          workload_factor: bestAgent.workloadFactor,
          estimated_completion: bestAgent.estimatedCompletionTime,
          selection_time: new Date().toISOString(),
        },
      },
    };

    const contractId = await this.contractManager.createContract(contract);

    this.emit('delegation_contract_created', {
      contractId,
      assignedAgent: bestAgent.agentId,
      requiredCapabilities,
      recommendation: bestAgent,
    });

    return {
      contractId,
      assignedAgent: bestAgent.agentId,
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
    const chainAnalysis = await this.chainTracker.analyzeChain(analysis);
    
    const recommendations: string[] = [];
    
    if (chainAnalysis.depth > this.config.maxChainDepth * 0.8) {
      recommendations.push('Chain depth approaching limit - consider direct assignment');
    }
    
    if (chainAnalysis.has_loops) {
      recommendations.push('Delegation loops detected - review chain logic');
    }
    
    if (chainAnalysis.firebreak_contracts.length === 0 && chainAnalysis.depth > 3) {
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

    const manifest = await this.registry.getManifest(contract.delegatee_agent_id);
    if (!manifest) return;

    const updatedCapabilities = manifest.capabilities.map(capability => {
      // Check if this capability was used in the contract
      const wasUsed = contract.required_capabilities.some(
        req => req.capability_id === capability.capability_id
      );

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

    await this.registry.updateManifest(contract.delegatee_agent_id, {
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
    
    if (manifest.overall_confidence >= 0.9) {
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
    const allManifests = await this.registry.listManifests();
    const activeContracts = await this.contractManager.queryContracts({
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
    await this.contractManager.clearAll();
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
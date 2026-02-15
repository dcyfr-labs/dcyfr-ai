/**
 * DCYFR Delegation Chain Tracker
 * TLP:AMBER - Internal Use Only
 * 
 * Tracks multi-hop delegation chains with loop detection and liability firebreaks.
 * Implements accountability boundaries to prevent unlimited delegation depth.
 * 
 * @module delegation/chain-tracker
 * @version 1.0.0
 * @date 2026-02-13
 */

import type { DelegationContract, DelegationChain } from '../types/delegation-contracts';
import type { ContractManager } from './contract-manager';

/**
 * Chain tracker configuration
 */
export interface ChainTrackerConfig {
  /** Maximum allowed chain depth */
  maxChainDepth?: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Chain analysis result
 */
export interface ChainAnalysisResult {
  /** Whether the chain is valid */
  valid: boolean;
  
  /** Chain depth */
  depth: number;
  
  /** Whether loops were detected */
  has_loops: boolean;
  
  /** Loop details if any */
  loops?: ChainLoop[];
  
  /** Liability firebreak contracts */
  firebreak_contracts: string[];
  
  /** All contracts in the chain */
  contract_ids: string[];
  
  /** Validation errors */
  errors?: string[];
  
  /** Warnings */
  warnings?: string[];
}

/**
 * Loop detection result
 */
export interface ChainLoop {
  /** Contracts involved in the loop */
  contracts: string[];
  
  /** Loop entry point */
  entry_contract_id: string;
  
  /** Loop description */
  description: string;
}

/**
 * Delegation Chain Tracker
 * 
 * Builds and analyzes delegation chains with loop detection and firebreak identification.
 */
export class DelegationChainTracker {
  private config: ChainTrackerConfig;
  private contractManager: ContractManager;
  
  constructor(contractManager: ContractManager, config: ChainTrackerConfig = {}) {
    this.contractManager = contractManager;
    this.config = {
      maxChainDepth: 10,
      debug: false,
      ...config,
    };
  }
  
  /**
   * Build a delegation chain from a contract
   */
  async buildChain(contractId: string): Promise<DelegationChain> {
    const chain: DelegationContract[] = [];
    const visited = new Set<string>();
    let current = await this.contractManager.getContract(contractId);
    
    if (!current) {
      throw new Error(`Contract not found: ${contractId}`);
    }
    
    // Build chain from leaf to root
    while (current) {
      if (visited.has(current.contract_id)) {
        // Loop detected
        break;
      }
      
      chain.unshift(current); // Add to beginning (root to leaf order)
      visited.add(current.contract_id);
      
      if (current.parent_contract_id) {
        current = await this.contractManager.getContract(current.parent_contract_id);
      } else {
        break; // Reached root
      }
    }
    
    const hasLoops = await this.detectLoops(chain);
    const firebreakContracts = this.identifyFirebreaks(chain);
    
    return {
      chain_id: `chain-${contractId}`,
      contracts: chain,
      depth: chain.length,
      has_loops: hasLoops,
      firebreak_contracts: firebreakContracts,
      created_at: new Date().toISOString(),
    };
  }
  
  /**
   * Analyze a delegation chain for validity
   */
  async analyzeChain(contractId: string): Promise<ChainAnalysisResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const contractIds: string[] = [];
    
    try {
      const chain = await this.buildChain(contractId);
      
      // Track all contract IDs
      chain.contracts.forEach(c => contractIds.push(c.contract_id));
      
      // Check max depth
      if (chain.depth > (this.config.maxChainDepth ?? 10)) {
        errors.push(`Chain depth ${chain.depth} exceeds maximum ${this.config.maxChainDepth}`);
      }
      
      // Detect loops
      const loops = await this.findLoops(chain.contracts);
      const hasLoops = loops.length > 0;
      
      if (hasLoops) {
        errors.push(`Chain contains ${loops.length} loop(s)`);
      }
      
      // Identify firebreaks
      const firebreakContracts = this.identifyFirebreaks(chain.contracts);
      
      // Validate delegation depth consistency
      for (let i = 0; i < chain.contracts.length; i++) {
        const contract = chain.contracts[i];
        if (contract.delegation_depth !== i) {
          warnings.push(
            `Contract ${contract.contract_id} has incorrect depth ${contract.delegation_depth}, expected ${i}`
          );
        }
      }
      
      // Check for permission attenuation
      const permissionViolations = this.checkPermissionAttenuation(chain.contracts);
      if (permissionViolations.length > 0) {
        warnings.push(...permissionViolations);
      }
      
      if (this.config.debug) {
        console.log(`[ChainTracker] Analyzed chain ${chain.chain_id}: depth=${chain.depth}, loops=${hasLoops}, firebreaks=${firebreakContracts.length}`);
      }
      
      return {
        valid: errors.length === 0,
        depth: chain.depth,
        has_loops: hasLoops,
        loops: hasLoops ? loops : undefined,
        firebreak_contracts: firebreakContracts,
        contract_ids: contractIds,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        depth: 0,
        has_loops: false,
        firebreak_contracts: [],
        contract_ids: contractIds,
        errors: [errorMessage],
      };
    }
  }
  
  /**
   * Detect if a chain contains loops
   */
  private async detectLoops(contracts: DelegationContract[]): Promise<boolean> {
    const seen = new Set<string>();
    
    for (const contract of contracts) {
      if (seen.has(contract.contract_id)) {
        return true; // Loop detected
      }
      seen.add(contract.contract_id);
    }
    
    return false;
  }
  
  /**
   * Find all loops in a chain
   */
  private async findLoops(contracts: DelegationContract[]): Promise<ChainLoop[]> {
    const loops: ChainLoop[] = [];
    const agentsSeen = new Map<string, number>(); // agent_id -> first occurrence index
    
    for (let i = 0; i < contracts.length; i++) {
      const contract = contracts[i];
      const delegatee = contract.delegatee.agent_id;
      
      // Check if this delegatee has already appeared as a delegator or delegatee earlier in the chain
      if (agentsSeen.has(delegatee)) {
        // Loop detected - agent is reappearing
        const loopStart = agentsSeen.get(delegatee)!;
        const loopContracts = contracts.slice(loopStart, i + 1).map(c => c.contract_id);
        
        loops.push({
          contracts: loopContracts,
          entry_contract_id: contracts[loopStart].contract_id,
          description: `Agent loop detected: ${delegatee} reappears in delegation chain`,
        });
      }
      
      // Track both delegator and delegatee
      agentsSeen.set(contract.delegator.agent_id, i);
      agentsSeen.set(delegatee, i);
    }
    
    return loops;
  }
  
  /**
   * Identify liability firebreak contracts
   * 
   * Firebreaks are accountability boundaries where delegation chains
   * should have heightened verification or require human approval.
   */
  private identifyFirebreaks(contracts: DelegationContract[]): string[] {
    const firebreaks: string[] = [];
    
    for (let i = 0; i < contracts.length; i++) {
      const contract = contracts[i];
      
      // Criteria for firebreaks:
      // 1. Human verification required
      if (contract.verification_policy === 'human_required') {
        firebreaks.push(contract.contract_id);
        continue;
      }
      
      // 2. TLP:AMBER or TLP:RED classification
      if (contract.tlp_classification === 'AMBER' || contract.tlp_classification === 'RED') {
        firebreaks.push(contract.contract_id);
        continue;
      }
      
      // 3. Depth threshold (every 3rd level)
      if (contract.delegation_depth > 0 && contract.delegation_depth % 3 === 0) {
        firebreaks.push(contract.contract_id);
        continue;
      }
      
      // 4. Critical verification policies
      if (contract.verification_policy === 'cryptographic_proof') {
        firebreaks.push(contract.contract_id);
        continue;
      }
    }
    
    return firebreaks;
  }
  
  /**
   * Check for proper permission attenuation in chain
   * 
   * Permissions should only decrease (or stay the same) as delegation depth increases.
   */
  private checkPermissionAttenuation(contracts: DelegationContract[]): string[] {
    const violations: string[] = [];
    
    for (let i = 1; i < contracts.length; i++) {
      const parent = contracts[i - 1];
      const child = contracts[i];
      
      // Check if child has more permissions than parent
      if (parent.permission_tokens && child.permission_tokens) {
        const parentScopes = new Set(
          parent.permission_tokens.flatMap(t => t.scopes)
        );
        const childScopes = child.permission_tokens.flatMap(t => t.scopes);
        
        for (const scope of childScopes) {
          // Check if child scope is more permissive than any parent scope
          let foundParentScope = false;
          for (const parentScope of parentScopes) {
            if (scope.startsWith(parentScope) || scope === parentScope) {
              foundParentScope = true;
              break;
            }
          }
          
          if (!foundParentScope) {
            violations.push(
              `Contract ${child.contract_id} has scope '${scope}' not granted by parent ${parent.contract_id}`
            );
          }
        }
      }
    }
    
    return violations;
  }
  
  /**
   * Get all descendant contracts from a given contract
   */
  async getDescendants(contractId: string): Promise<DelegationContract[]> {
    const descendants: DelegationContract[] = [];
    const queue: string[] = [contractId];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      if (visited.has(currentId)) {
        continue; // Skip visited to prevent infinite loops
      }
      visited.add(currentId);
      
      // Find all contracts that have this as parent
      const children = await this.contractManager.queryContracts({
        parent_contract_id: currentId,
      });
      
      descendants.push(...children);
      queue.push(...children.map((c: DelegationContract) => c.contract_id));
    }
    
    return descendants;
  }
  
  /**
   * Get all ancestor contracts from a given contract
   */
  async getAncestors(contractId: string): Promise<DelegationContract[]> {
    const ancestors: DelegationContract[] = [];
    const visited = new Set<string>();
    let current = await this.contractManager.getContract(contractId);
    
    while (current && current.parent_contract_id) {
      if (visited.has(current.parent_contract_id)) {
        break; // Loop detected
      }
      visited.add(current.parent_contract_id);
      
      const parent = await this.contractManager.getContract(current.parent_contract_id);
      if (parent) {
        ancestors.unshift(parent); // Add to beginning (root to current order)
        current = parent;
      } else {
        break;
      }
    }
    
    return ancestors;
  }
  
  /**
   * Validate that adding a new child contract won't create loops
   */
  async validateNewChild(parentId: string, childContractData: { delegatee: { agent_id: string } }): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    // Get parent contract
    const parent = await this.contractManager.getContract(parentId);
    if (!parent) {
      return { valid: false, reason: 'Parent contract not found' };
    }
    
    // Check if delegatee is in parent chain (would create loop)
    const ancestors = await this.getAncestors(parentId);
    const ancestorAgents = new Set([
      parent.delegator.agent_id,
      parent.delegatee.agent_id,
      ...ancestors.map(a => a.delegator.agent_id),
      ...ancestors.map(a => a.delegatee.agent_id),
    ]);
    
    if (ancestorAgents.has(childContractData.delegatee.agent_id)) {
      return {
        valid: false,
        reason: `Agent ${childContractData.delegatee.agent_id} is already in the delegation chain, would create a loop`,
      };
    }
    
    // Check depth limit
    const newDepth = parent.delegation_depth + 1;
    if (newDepth >= (this.config.maxChainDepth ?? 10)) {
      return {
        valid: false,
        reason: `New child would exceed maximum chain depth ${this.config.maxChainDepth}`,
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Get chain statistics
   */
  async getChainStatistics(contractId: string): Promise<ChainStatistics> {
    const chain = await this.buildChain(contractId);
    const descendants = await this.getDescendants(contractId);
    
    const totalContracts = chain.contracts.length + descendants.length;
    const maxDepth = Math.max(
      chain.depth,
      ...descendants.map(d => d.delegation_depth)
    );
    
    const uniqueAgents = new Set([
      ...chain.contracts.flatMap(c => [c.delegator.agent_id, c.delegatee.agent_id]),
      ...descendants.flatMap(d => [d.delegator.agent_id, d.delegatee.agent_id]),
    ]);
    
    // Count firebreaks in chain
    const chainFirebreaks = chain.firebreak_contracts?.length ?? 0;
    
    // Count firebreaks in descendants
    const descendantFirebreaks = this.identifyFirebreaks(descendants);
    
    const totalFirebreaks = chainFirebreaks + descendantFirebreaks.length;
    
    return {
      total_contracts: totalContracts,
      chain_depth: chain.depth,
      max_depth: maxDepth,
      unique_agents: uniqueAgents.size,
      firebreak_count: totalFirebreaks,
      has_loops: chain.has_loops,
    };
  }
}

/**
 * Chain statistics
 */
export interface ChainStatistics {
  /** Total contracts in chain and descendants */
  total_contracts: number;
  
  /** Direct chain depth */
  chain_depth: number;
  
  /** Maximum depth including all descendants */
  max_depth: number;
  
  /** Number of unique agents involved */
  unique_agents: number;
  
  /** Number of firebreak contracts */
  firebreak_count: number;
  
  /** Whether chain has loops */
  has_loops: boolean;
}

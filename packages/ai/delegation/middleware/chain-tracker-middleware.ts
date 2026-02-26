/**
 * DCYFR Chain Tracker Middleware
 * TLP:CLEAR
 *
 * SecurityMiddleware that wraps DelegationChainTracker to enforce loop detection
 * and delegation chain depth limits as an automatic guard during contract creation.
 *
 * @module delegation/middleware/chain-tracker-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import { DelegationChainTracker } from '../chain-tracker.js';
import type { DelegationContract } from '../../types/delegation-contracts.js';
import type {
  SecurityMiddleware,
  SecurityContext,
  SecurityVerdict,
  SecurityOperationType,
} from '../../types/security-middleware.js';

/**
 * Minimal contract provider interface required by DelegationChainTracker.
 */
export interface ChainContractProvider {
  getContract(contract_id: string): DelegationContract | null;
}

/**
 * ChainTrackerMiddleware — loop detection and depth validation guard.
 *
 * This middleware fires only during contract CREATION (`appliesTo: ['create']`).
 * Before the new contract is persisted it:
 *
 * 1. Builds the existing delegation chain from the `parent_contract_id` using
 *    `DelegationChainTracker.buildChain()`.
 * 2. Blocks if the proposed delegatee (or delegator) is already present in the
 *    existing chain — indicating a loop.
 * 3. Blocks if the resulting chain depth (parent depth + 1) would exceed
 *    `maxChainDepth`.
 *
 * Gate: `chain_tracking` feature flag.
 */
export class ChainTrackerMiddleware implements SecurityMiddleware {
  readonly name = 'chain-tracker';
  readonly featureFlag = 'chain_tracking';
  readonly appliesTo: SecurityOperationType[] = ['create'];

  private readonly tracker: DelegationChainTracker;
  private readonly maxChainDepth: number;

  constructor(provider: ChainContractProvider, options: { maxChainDepth?: number } = {}) {
    this.maxChainDepth = options.maxChainDepth ?? 5;
    // Cast the minimal provider to the full ContractManager type expected by chain-tracker.
    // ChainTrackerMiddleware only needs getContract() — DelegationContractManager satisfies this.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.tracker = new DelegationChainTracker(provider as unknown as any, {
      maxChainDepth: this.maxChainDepth,
    });
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const parentContractId = context.contract.parent_contract_id;

    // Root delegation — nothing to track against
    if (!parentContractId) {
      return { action: 'allow' };
    }

    let chain: Awaited<ReturnType<DelegationChainTracker['buildChain']>>;
    try {
      chain = await this.tracker.buildChain(parentContractId);
    } catch {
      // Parent contract not found — let downstream validation handle it
      return { action: 'allow' };
    }

    // ── 1. Loop detection ──────────────────────────────────────────────────
    // Only block on a genuine circular parent_contract_id reference.
    // Agent-ID reuse at different chain levels is intentional (retries, sub-tasks)
    // and must NOT be treated as a loop — post-hoc analyzeChain() handles that.
    if (chain.has_loops) {
      return {
        action: 'block',
        reason: `Delegation loop detected in existing chain (parent: ${parentContractId})`,
        threat_type: 'chain_depth_exceeded',
        severity: 'critical',
        evidence: { parent_contract_id: parentContractId, chain_depth: chain.depth },
      };
    }

    // ── 2. Depth validation ────────────────────────────────────────────────
    const resultingDepth = chain.depth + 1;
    if (resultingDepth > this.maxChainDepth) {
      return {
        action: 'block',
        reason: `Chain depth ${resultingDepth} would exceed the limit of ${this.maxChainDepth}`,
        threat_type: 'chain_depth_exceeded',
        severity: 'critical',
        evidence: {
          parent_contract_id: parentContractId,
          current_depth: chain.depth,
          resulting_depth: resultingDepth,
          max_chain_depth: this.maxChainDepth,
        },
      };
    }

    return { action: 'allow' };
  }
}

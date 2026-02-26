/**
 * DCYFR Resource Limiter Middleware
 * TLP:CLEAR
 *
 * SecurityMiddleware that tracks aggregate resource usage across all active
 * contracts and blocks new contracts that would exceed system-level capacity
 * thresholds.
 *
 * @module delegation/middleware/resource-limiter-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { DelegationContract } from '../../types/delegation-contracts.js';
import type {
  SecurityMiddleware,
  SecurityContext,
  SecurityVerdict,
  SecurityOperationType,
} from '../../types/security-middleware.js';

/** Resource usage snapshot for a single contract */
export interface ContractResources {
  cpu_cores: number;
  memory_mb: number;
}

/** System-level capacity thresholds */
export interface ResourceThresholds {
  /** Maximum aggregate CPU cores across all active contracts */
  maxCpuCores?: number;
  /** Maximum aggregate memory in MB across all active contracts */
  maxMemoryMb?: number;
}

const DEFAULT_THRESHOLDS: Required<ResourceThresholds> = {
  maxCpuCores: 128,
  maxMemoryMb: 32_768,
};

/**
 * Extract resource requirements from a contract's metadata.
 * Falls back to zeros when the field is absent or malformed.
 */
function extractResources(contract: DelegationContract): ContractResources {
  const rr = (contract.metadata as Record<string, unknown> | undefined)?.resource_requirements as Record<string, unknown> | undefined;
  return {
    cpu_cores: Number(rr?.cpu_cores ?? 0) || 0,
    memory_mb: Number(rr?.memory_mb ?? 0) || 0,
  };
}

/**
 * Extract resource requirements from the SecurityContext's metadata field
 * (propagated from `legacyRequest.resource_requirements` by the contract manager).
 */
function extractContextResources(context: SecurityContext): ContractResources {
  const rr = (context.metadata as Record<string, unknown> | undefined)?.resource_requirements as Record<string, unknown> | undefined;
  return {
    cpu_cores: Number(rr?.cpu_cores ?? 0) || 0,
    memory_mb: Number(rr?.memory_mb ?? 0) || 0,
  };
}

/**
 * ResourceLimiterMiddleware — system-level resource cap enforcer.
 *
 * On every contract creation (`appliesTo: ['create']`) it:
 *
 * 1. Fetches the current active contracts via the supplied callback.
 * 2. Sums their aggregate CPU cores and memory usage.
 * 3. Adds the proposed new contract's resource request (from `context.metadata`).
 * 4. Blocks if the resulting aggregate would exceed either threshold.
 *
 * Contracts without declared resource requirements contribute zero to aggregates,
 * so they always pass through (task validation: "contracts without resources pass
 * through").
 *
 * Gate: `security_monitoring` feature flag.
 */
export class ResourceLimiterMiddleware implements SecurityMiddleware {
  readonly name = 'resource-limiter';
  readonly featureFlag = 'security_monitoring';
  readonly appliesTo: SecurityOperationType[] = ['create'];

  private readonly getActiveContracts: () => DelegationContract[];
  private readonly thresholds: Required<ResourceThresholds>;

  constructor(
    getActiveContracts: () => DelegationContract[],
    thresholds: ResourceThresholds = {},
  ) {
    this.getActiveContracts = getActiveContracts;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const proposed = extractContextResources(context);

    // If proposed contract declares no resources, fast-path allow
    if (proposed.cpu_cores === 0 && proposed.memory_mb === 0) {
      return { action: 'allow' };
    }

    // Aggregate active contract resource consumption
    let aggregateCpu = 0;
    let aggregateMemory = 0;
    for (const contract of this.getActiveContracts()) {
      const r = extractResources(contract);
      aggregateCpu += r.cpu_cores;
      aggregateMemory += r.memory_mb;
    }

    const totalCpu = aggregateCpu + proposed.cpu_cores;
    const totalMemory = aggregateMemory + proposed.memory_mb;

    if (totalCpu > this.thresholds.maxCpuCores) {
      return {
        action: 'block',
        reason: `Aggregate CPU would reach ${totalCpu} cores, exceeding the system limit of ${this.thresholds.maxCpuCores}`,
        threat_type: 'resource_exhaustion',
        severity: 'critical',
        evidence: {
          aggregate_cpu_cores: aggregateCpu,
          proposed_cpu_cores: proposed.cpu_cores,
          total_cpu_cores: totalCpu,
          max_cpu_cores: this.thresholds.maxCpuCores,
        },
      };
    }

    if (totalMemory > this.thresholds.maxMemoryMb) {
      return {
        action: 'block',
        reason: `Aggregate memory would reach ${totalMemory} MB, exceeding the system limit of ${this.thresholds.maxMemoryMb} MB`,
        threat_type: 'resource_exhaustion',
        severity: 'critical',
        evidence: {
          aggregate_memory_mb: aggregateMemory,
          proposed_memory_mb: proposed.memory_mb,
          total_memory_mb: totalMemory,
          max_memory_mb: this.thresholds.maxMemoryMb,
        },
      };
    }

    return { action: 'allow' };
  }
}

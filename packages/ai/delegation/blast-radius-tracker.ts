/**
 * DCYFR Blast Radius Tracker
 * TLP:CLEAR
 *
 * Tracks contract-creation rate per root-delegator delegation tree and enforces
 * a configurable cap (default 100 contracts / hour).  Each delegation tree is
 * identified by its root delegator agent_id and counted independently.
 *
 * @module delegation/blast-radius-tracker
 * @version 1.0.0
 * @date 2026-02-24
 */

export interface BlastRadiusTrackerConfig {
  /** Maximum contracts allowed per root delegator within the time window. Default: 100 */
  maxContractsPerWindow?: number;
  /** Time window in milliseconds. Default: 3_600_000 (1 hour) */
  windowMs?: number;
}

export interface BlastRadiusCheckResult {
  /** Whether the contract creation is allowed */
  allowed: boolean;
  /** The root delegator agent_id that was checked */
  rootDelegatorId: string;
  /** Number of contracts already counted in the current window */
  currentCount: number;
  /** Maximum allowed */
  limit: number;
}

/**
 * BlastRadiusTracker — per-tree contract-rate limiter.
 *
 * Each call to `record()` stamps a creation timestamp for the given root delegator.
 * `check()` counts how many stamps fall within the rolling window and returns
 * whether a new contract is allowed.
 *
 * Prunes expired timestamps on every `record()` call to bound memory usage.
 */
export class BlastRadiusTracker {
  private readonly maxContracts: number;
  private readonly windowMs: number;

  /** Map from root delegator agent_id → array of creation timestamps (ms since epoch) */
  private readonly trees: Map<string, number[]> = new Map();

  constructor(config: BlastRadiusTrackerConfig = {}) {
    this.maxContracts = config.maxContractsPerWindow ?? 100;
    this.windowMs = config.windowMs ?? 3_600_000; // 1 hour
  }

  /**
   * Check whether a new contract creation is allowed for the given root delegator.
   *
   * Does NOT record the attempt — call `record()` after the contract is persisted.
   */
  check(rootDelegatorId: string): BlastRadiusCheckResult {
    const now = Date.now();
    const timestamps = this.getActiveTimestamps(rootDelegatorId, now);

    return {
      allowed: timestamps.length < this.maxContracts,
      rootDelegatorId,
      currentCount: timestamps.length,
      limit: this.maxContracts,
    };
  }

  /**
   * Record a new contract creation for the given root delegator.
   * Also prunes expired timestamps from the window.
   */
  record(rootDelegatorId: string, timestampMs?: number): void {
    const now = timestampMs ?? Date.now();
    // Prune expired entries first
    const active = this.getActiveTimestamps(rootDelegatorId, now);
    active.push(now);
    this.trees.set(rootDelegatorId, active);
  }

  /**
   * Return the current count of contracts in the window for the given root delegator.
   */
  getCount(rootDelegatorId: string): number {
    return this.getActiveTimestamps(rootDelegatorId, Date.now()).length;
  }

  /**
   * Reset tracking for a specific root delegator (for testing).
   */
  reset(rootDelegatorId?: string): void {
    if (rootDelegatorId) {
      this.trees.delete(rootDelegatorId);
    } else {
      this.trees.clear();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getActiveTimestamps(rootDelegatorId: string, now: number): number[] {
    const cutoff = now - this.windowMs;
    const all = this.trees.get(rootDelegatorId) ?? [];
    return all.filter((ts) => ts > cutoff);
  }
}

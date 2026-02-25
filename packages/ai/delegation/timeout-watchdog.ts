/**
 * Contract Timeout Watchdog
 * TLP:AMBER - Internal Use Only
 *
 * Design decision D3: Periodic watchdog model.
 * Scans all active contracts on a configurable interval and fires timeout events
 * for contracts whose `timeout_ms` has elapsed.  Also exposes `heartbeat()` so
 * long-running delegations can extend their deadline.
 *
 * @module delegation/timeout-watchdog
 * @version 1.0.0
 * @date 2026-02-24
 */

import { EventEmitter } from 'events';

export interface WatchdogConfig {
  /** How often the watchdog ticks. Default: 30 000 ms */
  intervalMs?: number;
  /** Grace period added to a heartbeat. Default: 30 000 ms */
  heartbeatGraceMs?: number;
}

export interface WatchdogContract {
  contract_id: string;
  created_at: string;
  timeout_ms: number;
  last_heartbeat_at?: string;
  status: string;
}

export interface TimeoutEvent {
  contract_id: string;
  created_at: string;
  timeout_ms: number;
  elapsed_ms: number;
}

/**
 * ContractTimeoutWatchdog emits:
 *   - `contract_timeout`  when a contract's deadline has passed
 *   - `heartbeat_updated` when heartbeat() extends a deadline
 *   - `watchdog_tick`     on every scan cycle (for observability)
 */
export class ContractTimeoutWatchdog extends EventEmitter {
  private readonly intervalMs: number;
  private readonly heartbeatGraceMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Contracts registered for timeout monitoring */
  private readonly tracked = new Map<string, WatchdogContract>();
  /** Per-contract extended deadline (heartbeat grants extra time) */
  private readonly extendedDeadlines = new Map<string, number>();

  constructor(config: WatchdogConfig = {}) {
    super();
    this.intervalMs = config.intervalMs ?? 30_000;
    this.heartbeatGraceMs = config.heartbeatGraceMs ?? 30_000;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    // Use unref() if available (Node.js) so watchdog doesn't block process exit
    if (this.timer && typeof (this.timer as NodeJS.Timeout).unref === 'function') {
      (this.timer as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Contract tracking
  // ──────────────────────────────────────────────────────────────────────────

  track(contract: WatchdogContract): void {
    this.tracked.set(contract.contract_id, contract);
  }

  untrack(contractId: string): void {
    this.tracked.delete(contractId);
    this.extendedDeadlines.delete(contractId);
  }

  /**
   * Extend the deadline for a contract by `heartbeatGraceMs`.
   * Called by the contract-manager's heartbeat endpoint.
   */
  heartbeat(contractId: string): void {
    const extended = Date.now() + this.heartbeatGraceMs;
    this.extendedDeadlines.set(contractId, extended);
    this.emit('heartbeat_updated', { contract_id: contractId, extended_until: new Date(extended).toISOString() });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal tick
  // ──────────────────────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();
    const expired: TimeoutEvent[] = [];

    for (const contract of this.tracked.values()) {
      if (contract.status !== 'active') continue;

      const extendedDeadline = this.extendedDeadlines.get(contract.contract_id);
      const baseline = new Date(contract.created_at).getTime() + contract.timeout_ms;
      const deadline = extendedDeadline !== undefined ? Math.max(baseline, extendedDeadline) : baseline;

      if (now > deadline) {
        expired.push({
          contract_id: contract.contract_id,
          created_at: contract.created_at,
          timeout_ms: contract.timeout_ms,
          elapsed_ms: now - new Date(contract.created_at).getTime(),
        });
      }
    }

    this.emit('watchdog_tick', { checked: this.tracked.size, expired: expired.length, timestamp_ms: now });

    for (const ev of expired) {
      // Untrack before emitting so re-entrant calls don't double-fire
      this.untrack(ev.contract_id);
      this.emit('contract_timeout', ev);
    }
  }
}

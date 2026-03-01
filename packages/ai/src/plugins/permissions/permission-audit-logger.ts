/**
 * Permission Audit Logger
 *
 * Logs permission events to Axiom (when configured) or to
 * stdout/stderr as a fallback. Used by the enforcer and validator
 * to create an immutable audit trail for each plugin execution.
 *
 * @module plugins/permissions/permission-audit-logger
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import type { PermissionAuditEvent } from './types.js';

/** Configuration for PermissionAuditLogger */
export interface PermissionAuditLoggerConfig {
  /** Axiom dataset name. Defaults to `AXIOM_DATASET` env var. */
  axiomDataset?: string;
  /** Axiom API token. Defaults to `AXIOM_TOKEN` env var. */
  axiomToken?: string;
  /** When true, always log to stdout regardless of Axiom config. Default false. */
  alwaysConsole?: boolean;
}

/** Result of a log call (used for testing) */
export interface AuditLogResult {
  /** Where the event was dispatched */
  destination: 'axiom' | 'stdout' | 'stderr';
  /** Whether the dispatch succeeded */
  success: boolean;
  /** Error message, if any */
  error?: string;
}

const AXIOM_INGEST_URL = 'https://api.axiom.co/v1/datasets';

/**
 * Formats an audit event as a compact JSONL line for stdout/stderr.
 */
function formatForConsole(event: PermissionAuditEvent): string {
  return JSON.stringify({
    timestamp: event.timestamp,
    eventType: event.eventType,
    pluginId: event.pluginId,
    category: event.category,
    action: event.action,
    resource: event.resource,
    granted: event.granted,
    reason: event.reason,
  });
}

/**
 * Logs permission audit events to Axiom or stdout.
 *
 * @example
 * ```ts
 * const logger = new PermissionAuditLogger({ axiomDataset: 'dcyfr-plugins' });
 * await logger.log({
 *   timestamp: new Date().toISOString(),
 *   eventType: 'permission_granted',
 *   pluginId: 'my-plugin',
 *   pluginVersion: '1.0.0',
 *   category: 'filesystem',
 *   action: 'read',
 *   resource: '/src/index.ts',
 *   granted: true,
 * });
 * ```
 */
export class PermissionAuditLogger {
  private readonly dataset: string | undefined;
  private readonly token: string | undefined;
  private readonly alwaysConsole: boolean;

  constructor(config?: PermissionAuditLoggerConfig) {
    this.dataset =
      config?.axiomDataset ?? process.env['AXIOM_DATASET'];
    this.token =
      config?.axiomToken ?? process.env['AXIOM_TOKEN'];
    this.alwaysConsole = config?.alwaysConsole ?? false;
  }

  /**
   * Whether Axiom is configured and events will be sent there.
   */
  get isAxiomEnabled(): boolean {
    return Boolean(this.dataset && this.token);
  }

  /**
   * Log a single permission audit event.
   * Returns a result object describing where the event was sent.
   */
  async log(event: PermissionAuditEvent): Promise<AuditLogResult> {
    if (this.alwaysConsole) {
      this.writeToConsole(event);
    }

    if (this.isAxiomEnabled) {
      return this.sendToAxiom(event);
    }

    if (!this.alwaysConsole) {
      this.writeToConsole(event);
    }

    return { destination: 'stdout', success: true };
  }

  /**
   * Log multiple events in a single batch request (Axiom supports this).
   */
  async logBatch(events: PermissionAuditEvent[]): Promise<AuditLogResult[]> {
    if (events.length === 0) return [];

    if (this.alwaysConsole) {
      for (const ev of events) this.writeToConsole(ev);
    }

    if (this.isAxiomEnabled) {
      return this.sendBatchToAxiom(events);
    }

    if (!this.alwaysConsole) {
      for (const ev of events) this.writeToConsole(ev);
    }

    return events.map(() => ({ destination: 'stdout' as const, success: true }));
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private writeToConsole(event: PermissionAuditEvent): void {
    const line = formatForConsole(event);
    if (event.granted) {
      process.stdout.write(`${line}\n`);
    } else {
      process.stderr.write(`${line}\n`);
    }
  }

  private async sendToAxiom(event: PermissionAuditEvent): Promise<AuditLogResult> {
    try {
      const url = `${AXIOM_INGEST_URL}/${this.dataset}/ingest`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/x-ndjson',
        },
        body: JSON.stringify(event) + '\n',
      });

      if (!resp.ok) {
        const err = `Axiom ingest failed: ${resp.status} ${resp.statusText}`;
        process.stderr.write(`[PermissionAuditLogger] ${err}\n`);
        // Fall back to console when Axiom rejects
        this.writeToConsole(event);
        return { destination: 'axiom', success: false, error: err };
      }

      return { destination: 'axiom', success: true };
    } catch (error_) {
      const msg =
        error_ instanceof Error ? error_.message : String(error_);
      process.stderr.write(`[PermissionAuditLogger] Axiom fetch error: ${msg}\n`);
      this.writeToConsole(event);
      return { destination: 'axiom', success: false, error: msg };
    }
  }

  private async sendBatchToAxiom(
    events: PermissionAuditEvent[],
  ): Promise<AuditLogResult[]> {
    try {
      const url = `${AXIOM_INGEST_URL}/${this.dataset}/ingest`;
      const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/x-ndjson',
        },
        body,
      });

      if (!resp.ok) {
        const err = `Axiom batch ingest failed: ${resp.status} ${resp.statusText}`;
        process.stderr.write(`[PermissionAuditLogger] ${err}\n`);
        for (const ev of events) this.writeToConsole(ev);
        return events.map(() => ({
          destination: 'axiom' as const,
          success: false,
          error: err,
        }));
      }

      return events.map(() => ({ destination: 'axiom' as const, success: true }));
    } catch (error_) {
      const msg =
        error_ instanceof Error ? error_.message : String(error_);
      process.stderr.write(`[PermissionAuditLogger] Axiom batch fetch error: ${msg}\n`);
      for (const ev of events) this.writeToConsole(ev);
      return events.map(() => ({
        destination: 'axiom' as const,
        success: false,
        error: msg,
      }));
    }
  }
}

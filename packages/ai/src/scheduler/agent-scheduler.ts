/**
 * DCYFR Agent Scheduler
 * TLP:AMBER - Internal Use Only
 *
 * Provides time-based, webhook-based, and event-based task scheduling for
 * autonomous agents. Features:
 *   - Cron-style scheduling with built-in cron expression parser
 *   - Webhook endpoints with secret-based authentication
 *   - Event subscription with payload filtering
 *   - Heartbeat health checks with quiet hours
 *   - Telemetry integration (started/completed/failed events)
 *   - All scheduled tasks default to readonly trust level
 *
 * @module scheduler/agent-scheduler
 * @version 1.0.0
 * @date 2026-03-01
 */

import { EventEmitter } from 'node:events';
import { randomUUID, timingSafeEqual } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Trust levels for scheduled tasks */
export type SchedulerTrustLevel = 'full' | 'sandboxed' | 'readonly';

/**
 * Configuration for a scheduled task
 */
export interface ScheduledTaskConfig {
  /** Human-readable name for the task */
  name: string;
  /** Task description passed to AgentRuntime */
  description: string;
  /** Agent ID to execute the task */
  agentId?: string;
  /** Trust level — defaults to 'readonly' */
  trustLevel?: SchedulerTrustLevel;
  /** Custom metadata passed to task execution */
  metadata?: Record<string, unknown>;
  /** Maximum execution time in ms (0 = no limit) */
  timeoutMs?: number;
  /** Whether to retry on failure */
  retryOnFailure?: boolean;
  /** Maximum retry count */
  maxRetries?: number;
}

/**
 * A registered cron schedule
 */
export interface CronJob {
  /** Unique job ID */
  id: string;
  /** Cron expression (5-field: min hour dom month dow) */
  cronExpr: string;
  /** Task configuration */
  taskConfig: ScheduledTaskConfig;
  /** Whether the job is active */
  active: boolean;
  /** Last run timestamp */
  lastRunAt?: Date;
  /** Next scheduled run */
  nextRunAt?: Date;
  /** Run count */
  runCount: number;
  /** Error count */
  errorCount: number;
}

/**
 * A registered webhook
 */
export interface WebhookEndpoint {
  /** Unique webhook ID */
  id: string;
  /** Route path */
  route: string;
  /** Task template to execute on trigger */
  taskTemplate: ScheduledTaskConfig;
  /** Secret for validation */
  secret: string;
  /** Whether the webhook is active */
  active: boolean;
  /** Trigger count */
  triggerCount: number;
}

/**
 * A registered event subscription
 */
export interface EventSubscription {
  /** Unique subscription ID */
  id: string;
  /** Event name to listen for */
  eventName: string;
  /** Filter function for event payload */
  filter?: (payload: unknown) => boolean;
  /** Task config to execute on matching event */
  taskConfig: ScheduledTaskConfig;
  /** Whether the subscription is active */
  active: boolean;
  /** Trigger count */
  triggerCount: number;
}

/**
 * Health check function
 */
export type HealthCheckFn = () => Promise<HealthCheckResult> | HealthCheckResult;

/**
 * Result of a single health check
 */
export interface HealthCheckResult {
  /** Check name */
  name: string;
  /** Whether the check passed */
  healthy: boolean;
  /** Optional details */
  details?: string;
  /** Check duration in ms */
  durationMs?: number;
}

/**
 * Aggregated health report
 */
export interface HealthReport {
  /** Overall health status */
  healthy: boolean;
  /** Timestamp of the report */
  timestamp: Date;
  /** Individual check results */
  checks: HealthCheckResult[];
  /** Total healthy checks */
  healthyCount: number;
  /** Total unhealthy checks */
  unhealthyCount: number;
}

/**
 * Quiet hours configuration
 */
export interface QuietHours {
  /** Start hour (0-23) */
  startHour: number;
  /** End hour (0-23) */
  endHour: number;
  /** Timezone offset in hours (default: 0 / UTC) */
  timezoneOffsetHours?: number;
}

/**
 * Heartbeat configuration
 */
export interface HeartbeatConfig {
  /** Check interval in ms */
  intervalMs: number;
  /** Health check functions */
  checks: HealthCheckFn[];
  /** Quiet hours — suppress during these hours */
  quietHours?: QuietHours;
}

/**
 * Task executor function — called when a scheduled task fires
 */
export type TaskExecutor = (
  taskConfig: ScheduledTaskConfig,
  context: TaskExecutionContext,
) => Promise<TaskExecutionResult>;

/**
 * Context passed to task executor
 */
export interface TaskExecutionContext {
  /** Execution ID */
  executionId: string;
  /** Trigger source */
  trigger: 'cron' | 'webhook' | 'event' | 'manual';
  /** Trigger details */
  triggerId: string;
  /** Webhook payload (if triggered by webhook) */
  webhookPayload?: unknown;
  /** Event payload (if triggered by event) */
  eventPayload?: unknown;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Result of a task execution
 */
export interface TaskExecutionResult {
  /** Whether the task succeeded */
  success: boolean;
  /** Result data */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Telemetry event emitted by the scheduler
 */
export interface SchedulerTelemetryEvent {
  /** Event type */
  type: 'scheduler.task.started' | 'scheduler.task.completed' | 'scheduler.task.failed' |
    'scheduler.heartbeat' | 'scheduler.webhook.received';
  /** Event data */
  data: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Webhook request shape
 */
export interface WebhookRequest {
  /** Route path */
  route: string;
  /** Request body/payload */
  body: unknown;
  /** Headers including X-Webhook-Secret */
  headers: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Parser (lightweight, built-in)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a range of values to the set
 */
function addRange(values: Set<number>, start: number, end: number, step = 1): void {
  for (let i = start; i <= end; i += step) values.add(i);
}

/**
 * Parse a step expression (range/step format)
 */
function parseStepPart(range: string, stepStr: string, min: number, max: number, values: Set<number>): void {
  const step = Number.parseInt(stepStr, 10);
  let start = min;
  let end = max;
  if (range !== '*') {
    const parsed = parseRangeBounds(range);
    start = parsed.start;
    end = parsed.end ?? max;
  }
  addRange(values, start, end, step);
}

/**
 * Parse range bounds from a string (e.g., "1-10" → { start: 1, end: 10 })
 */
function parseRangeBounds(s: string): { start: number; end?: number } {
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    return { start: a, end: b };
  }
  return { start: Number.parseInt(s, 10) };
}

/**
 * Parse a single comma-separated part of a cron field
 */
function parseCronPart(part: string, min: number, max: number, values: Set<number>): void {
  if (part === '*') {
    addRange(values, min, max);
  } else if (part.includes('/')) {
    const [range, stepStr] = part.split('/');
    parseStepPart(range, stepStr, min, max, values);
  } else if (part.includes('-')) {
    const { start, end } = parseRangeBounds(part);
    addRange(values, start, end ?? max);
  } else {
    values.add(Number.parseInt(part, 10));
  }
}

/**
 * Parse a cron field into a set of matching values
 * Supports: *, N, N-M, N/step, asterisk/step, comma-separated
 */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    parseCronPart(part, min, max, values);
  }
  return values;
}

/**
 * Check if a Date matches a 5-field cron expression
 * Format: minute hour day-of-month month day-of-week
 */
export function matchesCron(cronExpr: string, date: Date): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  const [minField, hourField, domField, monthField, dowField] = fields;

  const minute = parseCronField(minField, 0, 59);
  const hour = parseCronField(hourField, 0, 23);
  const dom = parseCronField(domField, 1, 31);
  const month = parseCronField(monthField, 1, 12);
  const dow = parseCronField(dowField, 0, 6);

  return (
    minute.has(date.getMinutes()) &&
    hour.has(date.getHours()) &&
    dom.has(date.getDate()) &&
    month.has(date.getMonth() + 1) &&
    dow.has(date.getDay())
  );
}

/**
 * Calculate next matching time for a cron expression (within 48 hours)
 */
export function nextCronMatch(cronExpr: string, after: Date = new Date()): Date | null {
  const check = new Date(after);
  // Round up to next minute
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  // Search up to 48 hours ahead
  const maxCheck = new Date(check.getTime() + 48 * 60 * 60_000);

  while (check <= maxCheck) {
    if (matchesCron(cronExpr, check)) {
      return check;
    }
    check.setMinutes(check.getMinutes() + 1);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentScheduler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for AgentScheduler
 */
export interface AgentSchedulerConfig {
  /** Task executor function */
  executor?: TaskExecutor;
  /** Cron check interval in ms (default: 60000 = 1 minute) */
  cronCheckIntervalMs?: number;
  /** Default trust level for scheduled tasks */
  defaultTrustLevel?: SchedulerTrustLevel;
}

/**
 * Agent Scheduler
 *
 * Provides cron, webhook, and event-based task scheduling for autonomous agents.
 *
 * Emits:
 *   - `scheduler.task.started` — Task execution started
 *   - `scheduler.task.completed` — Task execution completed successfully
 *   - `scheduler.task.failed` — Task execution failed
 *   - `scheduler.heartbeat` — Heartbeat health report generated
 *   - `scheduler.webhook.received` — Webhook request received
 */
export class AgentScheduler extends EventEmitter {
  private readonly cronJobs = new Map<string, CronJob>();
  private readonly webhooks = new Map<string, WebhookEndpoint>();
  private readonly subscriptions = new Map<string, EventSubscription>();
  private readonly executor: TaskExecutor;
  private readonly cronCheckIntervalMs: number;
  private readonly defaultTrustLevel: SchedulerTrustLevel;

  private cronTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatConfig: HeartbeatConfig | null = null;
  private running = false;

  constructor(config: AgentSchedulerConfig = {}) {
    super();
    this.executor = config.executor ?? defaultExecutor;
    this.cronCheckIntervalMs = config.cronCheckIntervalMs ?? 60_000;
    this.defaultTrustLevel = config.defaultTrustLevel ?? 'readonly';
  }

  // ─────────────── Cron Scheduling ───────────────

  /**
   * Schedule a recurring task using a cron expression.
   *
   * @param cronExpr - 5-field cron expression (minute hour dom month dow)
   * @param taskConfig - Task configuration
   * @returns Job ID
   */
  schedule(cronExpr: string, taskConfig: ScheduledTaskConfig): string {
    // Validate cron expression
    try {
      matchesCron(cronExpr, new Date());
    } catch (e) {
      throw new Error(`Invalid cron expression '${cronExpr}': ${(e as Error).message}`);
    }

    const id = randomUUID();
    const job: CronJob = {
      id,
      cronExpr,
      taskConfig: {
        ...taskConfig,
        trustLevel: taskConfig.trustLevel ?? this.defaultTrustLevel,
      },
      active: true,
      nextRunAt: nextCronMatch(cronExpr) ?? undefined,
      runCount: 0,
      errorCount: 0,
    };

    this.cronJobs.set(id, job);

    // Start cron timer if not already running
    if (!this.cronTimer && this.running) {
      this._startCronTimer();
    }

    return id;
  }

  /**
   * Remove a cron job
   */
  unschedule(jobId: string): boolean {
    return this.cronJobs.delete(jobId);
  }

  /**
   * Get all registered cron jobs
   */
  getJobs(): CronJob[] {
    return Array.from(this.cronJobs.values());
  }

  /**
   * Get a specific cron job
   */
  getJob(jobId: string): CronJob | undefined {
    return this.cronJobs.get(jobId);
  }

  // ─────────────── Webhooks ───────────────

  /**
   * Register a webhook endpoint.
   *
   * @param route - Route path (e.g., '/webhook/deploy')
   * @param taskTemplate - Task config template (payload merged at trigger time)
   * @param secret - Secret for X-Webhook-Secret header validation
   * @returns Webhook ID
   */
  webhook(route: string, taskTemplate: ScheduledTaskConfig, secret: string): string {
    if (!secret || secret.length < 8) {
      throw new Error('Webhook secret must be at least 8 characters');
    }

    const id = randomUUID();
    const endpoint: WebhookEndpoint = {
      id,
      route,
      taskTemplate: {
        ...taskTemplate,
        trustLevel: taskTemplate.trustLevel ?? this.defaultTrustLevel,
      },
      secret,
      active: true,
      triggerCount: 0,
    };

    this.webhooks.set(id, endpoint);
    return id;
  }

  /**
   * Handle an incoming webhook request.
   * Validates X-Webhook-Secret header and triggers the associated task.
   *
   * @param request - Webhook request
   * @returns Task execution result
   * @throws Error if route not found or secret invalid
   */
  async handleWebhook(request: WebhookRequest): Promise<TaskExecutionResult> {
    // Find matching webhook
    const endpoint = Array.from(this.webhooks.values()).find(
      w => w.route === request.route && w.active
    );

    if (!endpoint) {
      throw new Error(`No active webhook registered for route: ${request.route}`);
    }

    // Validate secret
    const providedSecret = request.headers['x-webhook-secret'] ?? request.headers['X-Webhook-Secret'];
    if (!providedSecret) {
      throw new Error('Missing X-Webhook-Secret header');
    }

    if (!safeCompare(providedSecret, endpoint.secret)) {
      throw new Error('Invalid webhook secret');
    }

    endpoint.triggerCount++;

    this.emit('scheduler.webhook.received', {
      type: 'scheduler.webhook.received',
      data: {
        webhookId: endpoint.id,
        route: endpoint.route,
        triggerCount: endpoint.triggerCount,
      },
      timestamp: new Date(),
    });

    // Execute task
    return this._executeTask(endpoint.taskTemplate, {
      trigger: 'webhook',
      triggerId: endpoint.id,
      webhookPayload: request.body,
    });
  }

  /**
   * Remove a webhook
   */
  removeWebhook(webhookId: string): boolean {
    return this.webhooks.delete(webhookId);
  }

  /**
   * Get all registered webhooks
   */
  getWebhooks(): WebhookEndpoint[] {
    return Array.from(this.webhooks.values());
  }

  // ─────────────── Event Subscriptions ───────────────

  /**
   * Subscribe to a runtime event. When the event fires and passes the filter,
   * the associated task is executed.
   *
   * @param eventName - Event to listen for
   * @param filter - Optional filter function on event payload
   * @param taskConfig - Task configuration
   * @returns Subscription ID
   */
  subscribe(
    eventName: string,
    filter: ((payload: unknown) => boolean) | null,
    taskConfig: ScheduledTaskConfig,
  ): string {
    const id = randomUUID();
    const sub: EventSubscription = {
      id,
      eventName,
      filter: filter ?? undefined,
      taskConfig: {
        ...taskConfig,
        trustLevel: taskConfig.trustLevel ?? this.defaultTrustLevel,
      },
      active: true,
      triggerCount: 0,
    };

    this.subscriptions.set(id, sub);
    return id;
  }

  /**
   * Emit an event to the scheduler. All matching subscriptions will be triggered.
   *
   * @param eventName - Event name
   * @param payload - Event payload
   * @returns Array of execution results
   */
  async triggerEvent(eventName: string, payload: unknown): Promise<TaskExecutionResult[]> {
    const matching = Array.from(this.subscriptions.values()).filter(
      sub => sub.active && sub.eventName === eventName &&
        (!sub.filter || sub.filter(payload))
    );

    const results: TaskExecutionResult[] = [];
    for (const sub of matching) {
      sub.triggerCount++;
      const result = await this._executeTask(sub.taskConfig, {
        trigger: 'event',
        triggerId: sub.id,
        eventPayload: payload,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Remove an event subscription
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get all event subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  // ─────────────── Heartbeat ───────────────

  /**
   * Start a heartbeat health check. Runs checks at the specified interval,
   * respecting quiet hours. Emits 'scheduler.heartbeat' with HealthReport.
   *
   * @param config - Heartbeat configuration
   */
  heartbeat(config: HeartbeatConfig): void {
    this.heartbeatConfig = config;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      // Check quiet hours
      if (config.quietHours && isInQuietHours(config.quietHours)) {
        return;
      }

      const report = await this.runHealthChecks();
      this.emit('scheduler.heartbeat', {
        type: 'scheduler.heartbeat',
        data: report,
        timestamp: new Date(),
      });
    }, config.intervalMs);

    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Run all health checks manually and return the report
   */
  async runHealthChecks(): Promise<HealthReport> {
    if (!this.heartbeatConfig) {
      return {
        healthy: true,
        timestamp: new Date(),
        checks: [],
        healthyCount: 0,
        unhealthyCount: 0,
      };
    }

    const checks: HealthCheckResult[] = [];

    for (const checkFn of this.heartbeatConfig.checks) {
      const start = Date.now();
      try {
        const result = await checkFn();
        result.durationMs = Date.now() - start;
        checks.push(result);
      } catch (e) {
        checks.push({
          name: 'unknown',
          healthy: false,
          details: (e as Error).message,
          durationMs: Date.now() - start,
        });
      }
    }

    const healthyCount = checks.filter(c => c.healthy).length;
    const unhealthyCount = checks.filter(c => !c.healthy).length;

    return {
      healthy: unhealthyCount === 0,
      timestamp: new Date(),
      checks,
      healthyCount,
      unhealthyCount,
    };
  }

  // ─────────────── Lifecycle ───────────────

  /**
   * Start the scheduler — begins cron checking
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.cronJobs.size > 0) {
      this._startCronTimer();
    }
  }

  /**
   * Stop the scheduler — halts all timers
   */
  stop(): void {
    this.running = false;
    this._stopCronTimer();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();
    this.cronJobs.clear();
    this.webhooks.clear();
    this.subscriptions.clear();
    this.removeAllListeners();
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    cronJobs: number;
    webhooks: number;
    subscriptions: number;
    heartbeatActive: boolean;
  } {
    return {
      running: this.running,
      cronJobs: this.cronJobs.size,
      webhooks: this.webhooks.size,
      subscriptions: this.subscriptions.size,
      heartbeatActive: this.heartbeatTimer !== null,
    };
  }

  // ─────────────── Private ───────────────

  private _startCronTimer(): void {
    if (this.cronTimer) return;
    this.cronTimer = setInterval(() => {
      void this._checkCronJobs();
    }, this.cronCheckIntervalMs);
    if (typeof this.cronTimer.unref === 'function') {
      this.cronTimer.unref();
    }
  }

  private _stopCronTimer(): void {
    if (this.cronTimer) {
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }
  }

  private async _checkCronJobs(): Promise<void> {
    const now = new Date();
    for (const job of this.cronJobs.values()) {
      if (!job.active) continue;
      if (matchesCron(job.cronExpr, now)) {
        job.lastRunAt = now;
        job.runCount++;
        job.nextRunAt = nextCronMatch(job.cronExpr, now) ?? undefined;

        // Fire and forget — don't block the timer
        void this._executeTask(job.taskConfig, {
          trigger: 'cron',
          triggerId: job.id,
        }).catch(() => {
          job.errorCount++;
        });
      }
    }
  }

  private async _executeTask(
    taskConfig: ScheduledTaskConfig,
    partialCtx: Omit<TaskExecutionContext, 'executionId' | 'timestamp'>,
  ): Promise<TaskExecutionResult> {
    const executionId = randomUUID();
    const context: TaskExecutionContext = {
      ...partialCtx,
      executionId,
      timestamp: new Date(),
    };

    // Emit started
    this.emit('scheduler.task.started', {
      type: 'scheduler.task.started' as const,
      data: {
        executionId,
        taskName: taskConfig.name,
        trigger: context.trigger,
        triggerId: context.triggerId,
        trustLevel: taskConfig.trustLevel,
      },
      timestamp: context.timestamp,
    });

    const startMs = Date.now();

    try {
      const result = await this.executor(taskConfig, context);

      // Emit completed or failed
      if (result.success) {
        this.emit('scheduler.task.completed', {
          type: 'scheduler.task.completed' as const,
          data: {
            executionId,
            taskName: taskConfig.name,
            trigger: context.trigger,
            durationMs: result.durationMs,
          },
          timestamp: new Date(),
        });
      } else {
        this.emit('scheduler.task.failed', {
          type: 'scheduler.task.failed' as const,
          data: {
            executionId,
            taskName: taskConfig.name,
            trigger: context.trigger,
            error: result.error,
            durationMs: result.durationMs,
          },
          timestamp: new Date(),
        });
      }

      return result;
    } catch (e) {
      const durationMs = Date.now() - startMs;
      const errorMessage = (e as Error).message;

      this.emit('scheduler.task.failed', {
        type: 'scheduler.task.failed' as const,
        data: {
          executionId,
          taskName: taskConfig.name,
          trigger: context.trigger,
          error: errorMessage,
          durationMs,
        },
        timestamp: new Date(),
      });

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default task executor — returns success immediately
 * Replace with actual AgentRuntime integration
 */
function defaultExecutor(
  _taskConfig: ScheduledTaskConfig,
  _context: TaskExecutionContext,
): Promise<TaskExecutionResult> {
  return Promise.resolve({
    success: true,
    durationMs: 0,
  });
}

/**
 * Timing-safe string comparison for webhook secrets
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Check if current time is within quiet hours
 */
export function isInQuietHours(quietHours: QuietHours): boolean {
  const now = new Date();
  const offset = quietHours.timezoneOffsetHours ?? 0;
  const currentHour = (now.getUTCHours() + offset + 24) % 24;

  if (quietHours.startHour <= quietHours.endHour) {
    // Simple range: e.g., 22-06 won't hit this
    return currentHour >= quietHours.startHour && currentHour < quietHours.endHour;
  } else {
    // Wrapping range: e.g., 22-06 means 22,23,0,1,2,3,4,5
    return currentHour >= quietHours.startHour || currentHour < quietHours.endHour;
  }
}

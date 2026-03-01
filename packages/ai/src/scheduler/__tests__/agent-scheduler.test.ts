/**
 * Agent Scheduler Tests
 * TLP:AMBER - Internal Use Only
 *
 * Comprehensive tests for:
 *   - Cron scheduling with built-in cron parser
 *   - Webhook endpoints with secret validation
 *   - Event subscriptions with filters
 *   - Heartbeat health checks with quiet hours
 *   - Telemetry event emission
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentScheduler,
  matchesCron,
  nextCronMatch,
  isInQuietHours,
  type ScheduledTaskConfig,
  type TaskExecutor,
  type HealthCheckResult,
  type WebhookRequest,
} from '../agent-scheduler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function taskConfig(overrides: Partial<ScheduledTaskConfig> = {}): ScheduledTaskConfig {
  return {
    name: 'test-task',
    description: 'A test task',
    ...overrides,
  };
}

function successExecutor(): TaskExecutor {
  return vi.fn(async (_config, _ctx) => ({
    success: true,
    durationMs: 42,
  }));
}

function failExecutor(error = 'Task failed'): TaskExecutor {
  return vi.fn(async (_config, _ctx) => ({
    success: false,
    error,
    durationMs: 10,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Cron Parser', () => {
  describe('matchesCron', () => {
    it('matches every-minute pattern (* * * * *)', () => {
      const date = new Date(2026, 2, 1, 14, 30); // March 1, 2026 14:30
      expect(matchesCron('* * * * *', date)).toBe(true);
    });

    it('matches specific minute', () => {
      const date = new Date(2026, 2, 1, 14, 30);
      expect(matchesCron('30 * * * *', date)).toBe(true);
      expect(matchesCron('31 * * * *', date)).toBe(false);
    });

    it('matches specific hour and minute', () => {
      const date = new Date(2026, 2, 1, 14, 30);
      expect(matchesCron('30 14 * * *', date)).toBe(true);
      expect(matchesCron('30 15 * * *', date)).toBe(false);
    });

    it('matches day of month', () => {
      const date = new Date(2026, 2, 15, 0, 0); // March 15
      expect(matchesCron('0 0 15 * *', date)).toBe(true);
      expect(matchesCron('0 0 16 * *', date)).toBe(false);
    });

    it('matches month', () => {
      const date = new Date(2026, 2, 1, 0, 0); // March
      expect(matchesCron('0 0 1 3 *', date)).toBe(true);
      expect(matchesCron('0 0 1 4 *', date)).toBe(false);
    });

    it('matches day of week', () => {
      // March 1, 2026 is a Sunday (0)
      const date = new Date(2026, 2, 1, 0, 0);
      expect(matchesCron('0 0 * * 0', date)).toBe(true);
      expect(matchesCron('0 0 * * 1', date)).toBe(false);
    });

    it('handles range (1-5)', () => {
      const date = new Date(2026, 2, 3, 0, 0); // Tuesday (2)
      expect(matchesCron('0 0 * * 1-5', date)).toBe(true);
    });

    it('handles step (*/5)', () => {
      const date = new Date(2026, 2, 1, 0, 15);
      expect(matchesCron('*/5 * * * *', date)).toBe(true);
      expect(matchesCron('*/5 * * * *', new Date(2026, 2, 1, 0, 13))).toBe(false);
    });

    it('handles comma-separated values', () => {
      const date = new Date(2026, 2, 1, 0, 15);
      expect(matchesCron('0,15,30,45 * * * *', date)).toBe(true);
      expect(matchesCron('0,10,20 * * * *', date)).toBe(false);
    });

    it('throws on invalid cron expression', () => {
      expect(() => matchesCron('* * *', new Date())).toThrow(/expected 5 fields/);
    });
  });

  describe('nextCronMatch', () => {
    it('finds next match for every-minute cron', () => {
      const after = new Date(2026, 2, 1, 14, 30, 0, 0);
      const next = nextCronMatch('* * * * *', after);
      expect(next).not.toBeNull();
      expect(next!.getMinutes()).toBe(31);
    });

    it('finds next match for specific time', () => {
      const after = new Date(2026, 2, 1, 10, 0, 0, 0);
      const next = nextCronMatch('30 14 * * *', after);
      expect(next).not.toBeNull();
      expect(next!.getHours()).toBe(14);
      expect(next!.getMinutes()).toBe(30);
    });

    it('returns null if no match within 48 hours', () => {
      // February 30 doesn't exist
      const next = nextCronMatch('0 0 30 2 *', new Date(2026, 1, 1));
      expect(next).toBeNull();
    });
  });
});

describe('isInQuietHours', () => {
  it('detects quiet hours in simple range', () => {
    const quietHours = { startHour: 22, endHour: 6 };
    // Mock UTC time to 23:00
    const _realDate = Date;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 1, 23, 0)));
    expect(isInQuietHours(quietHours)).toBe(true);
    vi.useRealTimers();
  });

  it('detects outside quiet hours', () => {
    const quietHours = { startHour: 22, endHour: 6 };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 1, 14, 0)));
    expect(isInQuietHours(quietHours)).toBe(false);
    vi.useRealTimers();
  });

  it('handles non-wrapping range', () => {
    const quietHours = { startHour: 9, endHour: 17 };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 1, 12, 0)));
    expect(isInQuietHours(quietHours)).toBe(true);
    vi.useRealTimers();
  });
});

describe('AgentScheduler', () => {
  let scheduler: AgentScheduler;
  let executor: TaskExecutor;

  beforeEach(() => {
    executor = successExecutor();
    scheduler = new AgentScheduler({ executor });
  });

  afterEach(() => {
    scheduler.dispose();
  });

  // ─── Cron Scheduling ───

  describe('schedule', () => {
    it('registers a cron job and returns ID', () => {
      const id = scheduler.schedule('*/5 * * * *', taskConfig());
      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('stores job with correct properties', () => {
      const id = scheduler.schedule('0 9 * * 1-5', taskConfig({ name: 'morning-check' }));
      const job = scheduler.getJob(id);
      expect(job).toBeDefined();
      expect(job!.cronExpr).toBe('0 9 * * 1-5');
      expect(job!.taskConfig.name).toBe('morning-check');
      expect(job!.active).toBe(true);
      expect(job!.runCount).toBe(0);
    });

    it('defaults trust level to readonly', () => {
      const id = scheduler.schedule('* * * * *', taskConfig());
      const job = scheduler.getJob(id);
      expect(job!.taskConfig.trustLevel).toBe('readonly');
    });

    it('respects custom trust level', () => {
      const id = scheduler.schedule('* * * * *', taskConfig({ trustLevel: 'full' }));
      const job = scheduler.getJob(id);
      expect(job!.taskConfig.trustLevel).toBe('full');
    });

    it('rejects invalid cron expression', () => {
      expect(() => scheduler.schedule('bad', taskConfig())).toThrow(/Invalid cron expression/);
    });

    it('calculates nextRunAt', () => {
      const id = scheduler.schedule('0 * * * *', taskConfig());
      const job = scheduler.getJob(id);
      expect(job!.nextRunAt).toBeInstanceOf(Date);
    });
  });

  describe('unschedule', () => {
    it('removes a cron job', () => {
      const id = scheduler.schedule('* * * * *', taskConfig());
      expect(scheduler.unschedule(id)).toBe(true);
      expect(scheduler.getJob(id)).toBeUndefined();
    });

    it('returns false for unknown ID', () => {
      expect(scheduler.unschedule('nonexistent')).toBe(false);
    });
  });

  describe('getJobs', () => {
    it('returns all registered jobs', () => {
      scheduler.schedule('*/5 * * * *', taskConfig({ name: 'job-1' }));
      scheduler.schedule('0 * * * *', taskConfig({ name: 'job-2' }));
      const jobs = scheduler.getJobs();
      expect(jobs).toHaveLength(2);
    });
  });

  // ─── Webhooks ───

  describe('webhook', () => {
    it('registers a webhook and returns ID', () => {
      const id = scheduler.webhook('/webhook/deploy', taskConfig(), 'secret-12345678');
      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects short secrets', () => {
      expect(() =>
        scheduler.webhook('/api/hook', taskConfig(), 'short')
      ).toThrow(/at least 8 characters/);
    });

    it('stores webhook properties correctly', () => {
      const _id = scheduler.webhook('/webhook/test', taskConfig({ name: 'hook-task' }), 'my-secure-secret');
      const hooks = scheduler.getWebhooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].route).toBe('/webhook/test');
      expect(hooks[0].taskTemplate.name).toBe('hook-task');
    });
  });

  describe('handleWebhook', () => {
    it('executes task on valid webhook request', async () => {
      const secret = 'webhook-secret-12345';
      scheduler.webhook('/deploy', taskConfig({ name: 'deploy' }), secret);

      const result = await scheduler.handleWebhook({
        route: '/deploy',
        body: { branch: 'main' },
        headers: { 'x-webhook-secret': secret },
      });

      expect(result.success).toBe(true);
      expect(executor).toHaveBeenCalled();
    });

    it('passes webhook payload to executor context', async () => {
      const secret = 'webhook-secret-12345';
      scheduler.webhook('/deploy', taskConfig(), secret);

      await scheduler.handleWebhook({
        route: '/deploy',
        body: { branch: 'develop' },
        headers: { 'x-webhook-secret': secret },
      });

      expect(executor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          trigger: 'webhook',
          webhookPayload: { branch: 'develop' },
        })
      );
    });

    it('rejects unknown route', async () => {
      await expect(
        scheduler.handleWebhook({
          route: '/unknown',
          body: {},
          headers: { 'x-webhook-secret': 'any' },
        })
      ).rejects.toThrow(/No active webhook/);
    });

    it('rejects missing secret header', async () => {
      scheduler.webhook('/test', taskConfig(), 'secret-12345678');

      await expect(
        scheduler.handleWebhook({
          route: '/test',
          body: {},
          headers: {},
        })
      ).rejects.toThrow(/Missing X-Webhook-Secret/);
    });

    it('rejects invalid secret', async () => {
      scheduler.webhook('/test', taskConfig(), 'correct-secret-here');

      await expect(
        scheduler.handleWebhook({
          route: '/test',
          body: {},
          headers: { 'x-webhook-secret': 'wrong-secret-xxxxx' },
        })
      ).rejects.toThrow(/Invalid webhook secret/);
    });

    it('increments trigger count', async () => {
      const secret = 'test-secret-12345678';
      scheduler.webhook('/counter', taskConfig(), secret);

      const req: WebhookRequest = {
        route: '/counter',
        body: {},
        headers: { 'x-webhook-secret': secret },
      };

      await scheduler.handleWebhook(req);
      await scheduler.handleWebhook(req);

      const hooks = scheduler.getWebhooks();
      expect(hooks[0].triggerCount).toBe(2);
    });

    it('emits scheduler.webhook.received event', async () => {
      const handler = vi.fn();
      scheduler.on('scheduler.webhook.received', handler);

      const secret = 'test-secret-12345678';
      scheduler.webhook('/events', taskConfig(), secret);

      await scheduler.handleWebhook({
        route: '/events',
        body: {},
        headers: { 'x-webhook-secret': secret },
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduler.webhook.received',
        })
      );
    });
  });

  describe('removeWebhook', () => {
    it('removes a webhook', () => {
      const id = scheduler.webhook('/test', taskConfig(), 'secret-12345678');
      expect(scheduler.removeWebhook(id)).toBe(true);
      expect(scheduler.getWebhooks()).toHaveLength(0);
    });
  });

  // ─── Event Subscriptions ───

  describe('subscribe', () => {
    it('registers an event subscription', () => {
      const id = scheduler.subscribe('deployment.complete', null, taskConfig());
      expect(id).toBeDefined();
    });

    it('stores subscription properties', () => {
      scheduler.subscribe('build.complete', null, taskConfig({ name: 'post-build' }));
      const subs = scheduler.getSubscriptions();
      expect(subs).toHaveLength(1);
      expect(subs[0].eventName).toBe('build.complete');
      expect(subs[0].taskConfig.name).toBe('post-build');
    });
  });

  describe('triggerEvent', () => {
    it('executes matching subscriptions', async () => {
      scheduler.subscribe('test.event', null, taskConfig({ name: 'handler' }));
      const results = await scheduler.triggerEvent('test.event', { data: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('passes event payload to executor', async () => {
      scheduler.subscribe('deploy', null, taskConfig());
      await scheduler.triggerEvent('deploy', { env: 'production' });

      expect(executor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          trigger: 'event',
          eventPayload: { env: 'production' },
        })
      );
    });

    it('filters events with filter function', async () => {
      scheduler.subscribe(
        'deploy',
        (payload) => (payload as Record<string, unknown>).env === 'production',
        taskConfig({ name: 'prod-only' }),
      );

      // Should match
      const results1 = await scheduler.triggerEvent('deploy', { env: 'production' });
      expect(results1).toHaveLength(1);

      // Should not match
      const results2 = await scheduler.triggerEvent('deploy', { env: 'staging' });
      expect(results2).toHaveLength(0);
    });

    it('skips non-matching event names', async () => {
      scheduler.subscribe('event-a', null, taskConfig());
      const results = await scheduler.triggerEvent('event-b', {});
      expect(results).toHaveLength(0);
    });

    it('triggers multiple matching subscriptions', async () => {
      scheduler.subscribe('deploy', null, taskConfig({ name: 'handler-1' }));
      scheduler.subscribe('deploy', null, taskConfig({ name: 'handler-2' }));
      const results = await scheduler.triggerEvent('deploy', {});
      expect(results).toHaveLength(2);
    });

    it('increments trigger count', async () => {
      scheduler.subscribe('test', null, taskConfig());
      await scheduler.triggerEvent('test', {});
      await scheduler.triggerEvent('test', {});
      const subs = scheduler.getSubscriptions();
      expect(subs[0].triggerCount).toBe(2);
    });
  });

  describe('unsubscribe', () => {
    it('removes a subscription', () => {
      const id = scheduler.subscribe('test', null, taskConfig());
      expect(scheduler.unsubscribe(id)).toBe(true);
      expect(scheduler.getSubscriptions()).toHaveLength(0);
    });
  });

  // ─── Heartbeat ───

  describe('heartbeat', () => {
    it('runs health checks and returns report', async () => {
      const check = async (): Promise<HealthCheckResult> => ({
        name: 'db-check',
        healthy: true,
        details: 'Connection OK',
      });

      scheduler.heartbeat({
        intervalMs: 60_000,
        checks: [check],
      });

      const report = await scheduler.runHealthChecks();
      expect(report.healthy).toBe(true);
      expect(report.healthyCount).toBe(1);
      expect(report.unhealthyCount).toBe(0);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0].name).toBe('db-check');
    });

    it('reports unhealthy checks', async () => {
      const healthyCheck = async (): Promise<HealthCheckResult> => ({
        name: 'api',
        healthy: true,
      });
      const unhealthyCheck = async (): Promise<HealthCheckResult> => ({
        name: 'db',
        healthy: false,
        details: 'Connection timeout',
      });

      scheduler.heartbeat({
        intervalMs: 60_000,
        checks: [healthyCheck, unhealthyCheck],
      });

      const report = await scheduler.runHealthChecks();
      expect(report.healthy).toBe(false);
      expect(report.healthyCount).toBe(1);
      expect(report.unhealthyCount).toBe(1);
    });

    it('handles check errors gracefully', async () => {
      const throwingCheck = async (): Promise<HealthCheckResult> => {
        throw new Error('Check crashed');
      };

      scheduler.heartbeat({
        intervalMs: 60_000,
        checks: [throwingCheck],
      });

      const report = await scheduler.runHealthChecks();
      expect(report.healthy).toBe(false);
      expect(report.checks[0].healthy).toBe(false);
      expect(report.checks[0].details).toBe('Check crashed');
    });

    it('returns empty report without heartbeat config', async () => {
      const report = await scheduler.runHealthChecks();
      expect(report.healthy).toBe(true);
      expect(report.checks).toHaveLength(0);
    });
  });

  // ─── Telemetry Events ───

  describe('telemetry', () => {
    it('emits scheduler.task.started on execution', async () => {
      const handler = vi.fn();
      scheduler.on('scheduler.task.started', handler);

      scheduler.subscribe('test', null, taskConfig({ name: 'my-task' }));
      await scheduler.triggerEvent('test', {});

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduler.task.started',
          data: expect.objectContaining({
            taskName: 'my-task',
            trigger: 'event',
          }),
        })
      );
    });

    it('emits scheduler.task.completed on success', async () => {
      const handler = vi.fn();
      scheduler.on('scheduler.task.completed', handler);

      scheduler.subscribe('test', null, taskConfig());
      await scheduler.triggerEvent('test', {});

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduler.task.completed',
        })
      );
    });

    it('emits scheduler.task.failed on failure', async () => {
      scheduler.dispose();
      scheduler = new AgentScheduler({ executor: failExecutor('Something broke') });

      const handler = vi.fn();
      scheduler.on('scheduler.task.failed', handler);

      scheduler.subscribe('test', null, taskConfig());
      await scheduler.triggerEvent('test', {});

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduler.task.failed',
          data: expect.objectContaining({
            error: 'Something broke',
          }),
        })
      );
    });

    it('emits scheduler.task.failed when executor throws', async () => {
      scheduler.dispose();
      const throwingExecutor = vi.fn(async () => {
        throw new Error('Executor exploded');
      });
      scheduler = new AgentScheduler({ executor: throwingExecutor });

      const handler = vi.fn();
      scheduler.on('scheduler.task.failed', handler);

      scheduler.subscribe('test', null, taskConfig());
      await scheduler.triggerEvent('test', {});

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduler.task.failed',
          data: expect.objectContaining({
            error: 'Executor exploded',
          }),
        })
      );
    });
  });

  // ─── Lifecycle ───

  describe('lifecycle', () => {
    it('getStatus reports correct state', () => {
      scheduler.schedule('* * * * *', taskConfig());
      scheduler.webhook('/test', taskConfig(), 'secret-12345678');
      scheduler.subscribe('event', null, taskConfig());

      const status = scheduler.getStatus();
      expect(status.running).toBe(false);
      expect(status.cronJobs).toBe(1);
      expect(status.webhooks).toBe(1);
      expect(status.subscriptions).toBe(1);
    });

    it('start and stop toggle running state', () => {
      expect(scheduler.getStatus().running).toBe(false);
      scheduler.start();
      expect(scheduler.getStatus().running).toBe(true);
      scheduler.stop();
      expect(scheduler.getStatus().running).toBe(false);
    });

    it('dispose clears all registrations', () => {
      scheduler.schedule('* * * * *', taskConfig());
      scheduler.webhook('/test', taskConfig(), 'secret-12345678');
      scheduler.subscribe('event', null, taskConfig());

      scheduler.dispose();

      const status = scheduler.getStatus();
      expect(status.cronJobs).toBe(0);
      expect(status.webhooks).toBe(0);
      expect(status.subscriptions).toBe(0);
    });
  });

  // ─── Default Trust Level ───

  describe('default trust level', () => {
    it('uses readonly by default', () => {
      const id = scheduler.schedule('* * * * *', taskConfig());
      expect(scheduler.getJob(id)!.taskConfig.trustLevel).toBe('readonly');
    });

    it('respects custom default trust level', () => {
      scheduler.dispose();
      scheduler = new AgentScheduler({
        executor,
        defaultTrustLevel: 'sandboxed',
      });

      const id = scheduler.schedule('* * * * *', taskConfig());
      expect(scheduler.getJob(id)!.taskConfig.trustLevel).toBe('sandboxed');
    });
  });
});

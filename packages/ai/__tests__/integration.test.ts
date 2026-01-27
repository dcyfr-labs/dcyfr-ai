/**
 * Basic integration tests for DCYFR AI Framework
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryEngine } from '../core/telemetry-engine';
import { ProviderRegistry } from '../core/provider-registry';
import { createStorageAdapter } from '../utils/storage';

describe('TelemetryEngine', () => {
  let telemetry: TelemetryEngine;

  beforeEach(() => {
    telemetry = new TelemetryEngine({ storage: 'memory' });
  });

  it('should create a new session', () => {
    const session = telemetry.startSession('claude', {
      taskType: 'feature',
      description: 'Test task',
    });

    expect(session).toBeDefined();
    expect(session.getSession().agent).toBe('claude');
    expect(session.getSession().taskType).toBe('feature');
  });

  it('should record metrics', () => {
    const session = telemetry.startSession('claude', {
      taskType: 'feature',
      description: 'Test task',
    });

    session.recordMetric('tokenCompliance', 0.95);
    session.recordMetric('testPassRate', 0.99);

    const data = session.getSession();
    expect(data.metrics.tokenCompliance).toBe(0.95);
    expect(data.metrics.testPassRate).toBe(0.99);
  });

  it('should record validations', () => {
    const session = telemetry.startSession('claude', {
      taskType: 'feature',
      description: 'Test task',
    });

    session.recordValidation('typescript', 'pass');
    session.recordValidation('eslint', 'pass');

    const data = session.getSession();
    expect(data.metrics.validations.typescript).toBe('pass');
    expect(data.metrics.validations.eslint).toBe('pass');
  });

  it('should record violations', () => {
    const session = telemetry.startSession('claude', {
      taskType: 'feature',
      description: 'Test task',
    });

    session.recordViolation({
      type: 'eslint',
      severity: 'warning',
      message: 'Test violation',
      file: 'test.ts',
      line: 10,
      fixed: false,
    });

    const data = session.getSession();
    expect(data.violations).toHaveLength(1);
    expect(data.violations[0].message).toBe('Test violation');
    expect(data.metrics.lintViolations).toBe(1);
  });

  it('should track cost', () => {
    const session = telemetry.startSession('claude', {
      taskType: 'feature',
      description: 'Test task',
    });

    session.updateCost(1000, 500);

    const data = session.getSession();
    expect(data.cost.inputTokens).toBe(1000);
    expect(data.cost.outputTokens).toBe(500);
    expect(data.cost.estimatedCost).toBeGreaterThan(0);
  });

  it('should end session and calculate execution time', async () => {
    const session = telemetry.startSession('claude', {
      taskType: 'feature',
      description: 'Test task',
    });

    // Wait a bit to ensure execution time > 0
    await new Promise(resolve => setTimeout(resolve, 10));

    const result = await session.end('success');

    expect(result.outcome).toBe('success');
    expect(result.endTime).toBeDefined();
    expect(result.metrics.executionTime).toBeGreaterThan(0);
  });

  it('should get agent stats', async () => {
    const session1 = telemetry.startSession('claude', {
      taskType: 'feature',
      description: 'Test task 1',
    });
    await session1.end('success');

    const session2 = telemetry.startSession('claude', {
      taskType: 'bug',
      description: 'Test task 2',
    });
    await session2.end('success');

    const stats = await telemetry.getAgentStats('claude', '1d');

    expect(stats.totalSessions).toBe(2);
    expect(stats.agent).toBe('claude');
  });
});

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry({
      primaryProvider: 'claude',
      fallbackChain: ['groq', 'ollama'],
      autoReturn: false,
      healthCheckInterval: 60000,
    });
  });

  it('should initialize with primary provider', () => {
    expect(registry.getCurrentProvider()).toBe('claude');
  });

  it('should get health status', () => {
    const healthStatus = registry.getHealthStatus();
    expect(healthStatus.size).toBeGreaterThan(0);
    expect(healthStatus.has('claude')).toBe(true);
  });

  it('should execute successfully when provider is available', async () => {
    const result = await registry.executeWithFallback(
      {
        description: 'Test task',
        phase: 'implementation',
        filesInProgress: [],
      },
      async provider => {
        // Simulate success
        return `Success with ${provider}`;
      }
    );

    expect(result.success).toBe(true);
    expect(result.data).toContain('Success');
  });

  it('should cleanup on destroy', () => {
    registry.destroy();
    // Should not throw
    expect(true).toBe(true);
  });
});

describe('StorageAdapter', () => {
  it('should create memory storage adapter', () => {
    const adapter = createStorageAdapter('memory');
    expect(adapter.type).toBe('memory');
  });

  it('should store and retrieve data', async () => {
    const adapter = createStorageAdapter('memory');

    await adapter.set('test-key', { value: 'test data' });
    const result = await adapter.get<{ value: string }>('test-key');

    expect(result).toEqual({ value: 'test data' });
  });

  it('should return null for non-existent keys', async () => {
    const adapter = createStorageAdapter('memory');
    const result = await adapter.get('non-existent');

    expect(result).toBeNull();
  });

  it('should delete data', async () => {
    const adapter = createStorageAdapter('memory');

    await adapter.set('test-key', { value: 'test' });
    await adapter.delete('test-key');
    const result = await adapter.get('test-key');

    expect(result).toBeNull();
  });

  it('should list keys', async () => {
    const adapter = createStorageAdapter('memory');

    await adapter.set('prefix-1', 'value1');
    await adapter.set('prefix-2', 'value2');
    await adapter.set('other-key', 'value3');

    const allKeys = await adapter.list();
    expect(allKeys).toHaveLength(3);

    const prefixKeys = await adapter.list('prefix-');
    expect(prefixKeys).toHaveLength(2);
  });

  it('should clear all data', async () => {
    const adapter = createStorageAdapter('memory');

    await adapter.set('key1', 'value1');
    await adapter.set('key2', 'value2');

    await adapter.clear();

    const keys = await adapter.list();
    expect(keys).toHaveLength(0);
  });
});

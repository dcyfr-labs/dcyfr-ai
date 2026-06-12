/**
 * EndToEndWorkflowOrchestrator unit tests
 *
 * All six collaborator modules are mocked at the module boundary; the suite
 * exercises the orchestration stages, caching/batch toggles, event
 * forwarding, failure handling, and the reporting/query surface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => void;

const h = vi.hoisted(() => {
  function makeEmitter() {
    const handlers: Record<string, Handler[]> = {};
    return {
      handlers,
      on: vi.fn((event: string, fn: Handler) => {
        (handlers[event] ??= []).push(fn);
      }),
      fire(event: string, payload: unknown) {
        for (const fn of handlers[event] ?? []) fn(payload);
      },
    };
  }
  type Handler = (...args: unknown[]) => void;

  const delegation = {
    ...makeEmitter(),
    onboardAgent: vi.fn(),
    findOptimalAgent: vi.fn(),
    createDelegationContract: vi.fn(),
    getSystemMetrics: vi.fn(),
  };
  const detection = {
    ...makeEmitter(),
    detectAndRegisterCapabilities: vi.fn(),
    getSystemMetrics: vi.fn(),
  };
  const mcp = {
    ...makeEmitter(),
    reconfigureServers: vi.fn(),
    getServerStatus: vi.fn(),
    healthCheckServers: vi.fn(),
  };
  const validation = {
    ...makeEmitter(),
    validatePipeline: vi.fn(),
  };
  const profiler = {
    startTimer: vi.fn(() => 'timer-1'),
    endTimer: vi.fn(),
    getMetricsSummary: vi.fn(() => ({ totalOperations: 1 })),
    getBottlenecks: vi.fn(() => []),
    getRecommendations: vi.fn(() => []),
  };
  const cache = {
    get: vi.fn(),
    set: vi.fn(),
    getStats: vi.fn(() => ({ hitRate: 0.9 })),
    getConfig: vi.fn(() => ({ maxEntries: 5000 })),
  };
  const onboardBatch = {
    ...makeEmitter(),
    addItem: vi.fn(),
    waitForCompletion: vi.fn(),
  };
  const detectionBatch = {
    ...makeEmitter(),
    addItem: vi.fn(),
    waitForCompletion: vi.fn(),
  };
  return { delegation, detection, mcp, validation, profiler, cache, onboardBatch, detectionBatch };
});

vi.mock('../src/delegation-capability-integration.js', () => ({
  DelegationCapabilityIntegration: vi.fn(function () { return h.delegation; }),
}));
vi.mock('../src/enhanced-capability-detection.js', () => ({
  EnhancedCapabilityDetection: vi.fn(function () { return h.detection; }),
}));
vi.mock('../src/mcp-auto-configuration.js', () => ({
  MCPAutoConfiguration: vi.fn(function () { return h.mcp; }),
}));
vi.mock('../src/validation-pipeline-integration.js', () => ({
  ValidationPipelineIntegration: vi.fn(function () { return h.validation; }),
}));
vi.mock('../src/performance-profiler.js', () => ({
  PerformanceProfiler: vi.fn(function () { return h.profiler; }),
}));
vi.mock('../src/intelligent-cache-manager.js', () => ({
  IntelligentCacheManager: vi.fn(function () { return h.cache; }),
}));
vi.mock('../src/batch-processor.js', () => ({
  HighPerformanceBatchProcessor: vi.fn(),
  createAgentOnboardingBatchProcessor: vi.fn(() => h.onboardBatch),
  createCapabilityDetectionBatchProcessor: vi.fn(() => h.detectionBatch),
}));

import {
  EndToEndWorkflowOrchestrator,
  type WorkflowDefinition,
} from '../src/end-to-end-workflow-orchestrator.js';

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    name: 'test-workflow',
    description: 'unit test workflow',
    agents: [
      { source: { type: 'markdown', content: '# a1' }, agentId: 'a1' },
    ],
    tasks: [
      {
        taskId: 't1',
        description: 'task one',
        requiredCapabilities: [
          { capability_id: 'cap', name: 'Cap', description: 'cap', priority: 5 },
        ],
        priority: 5,
      },
    ],
    ...overrides,
  } as WorkflowDefinition;
}

function makeOrchestrator(config: Record<string, unknown> = {}) {
  return new EndToEndWorkflowOrchestrator({ workspaceRoot: '/tmp/ws', ...config });
}

function programHappyPath() {
  h.validation.validatePipeline.mockResolvedValue({ overallStatus: 'passed', testResults: [] });
  h.detection.detectAndRegisterCapabilities.mockResolvedValue({
    bootstrapResult: { detectedCapabilities: [1, 2, 3] },
    mcpRecommendations: [1, 2],
  });
  h.detection.getSystemMetrics.mockResolvedValue({ totalAgents: 5 });
  h.delegation.onboardAgent.mockResolvedValue({ agentId: 'a1', registered: true });
  h.delegation.findOptimalAgent.mockResolvedValue([{ confidence: 0.9 }]);
  h.delegation.createDelegationContract.mockResolvedValue({
    assignedAgent: 'a1',
    recommendation: { confidence: 0.92 },
  });
  h.delegation.getSystemMetrics.mockResolvedValue({ activeContracts: 2, averageConfidence: 0.88 });
  h.mcp.reconfigureServers.mockResolvedValue({ servers: ['s1'], startedServers: ['s1'], warnings: [] });
  h.mcp.getServerStatus.mockResolvedValue({});
  h.mcp.healthCheckServers.mockResolvedValue(new Map([['s1', true], ['s2', false]]));
  h.cache.get.mockReturnValue(undefined);
  h.onboardBatch.waitForCompletion.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.profiler.startTimer.mockReturnValue('timer-1');
  h.cache.getStats.mockReturnValue({ hitRate: 0.9 });
  h.cache.getConfig.mockReturnValue({ maxEntries: 5000 });
  h.profiler.getMetricsSummary.mockReturnValue({ totalOperations: 1 });
  h.profiler.getBottlenecks.mockReturnValue([]);
  h.profiler.getRecommendations.mockReturnValue([]);
  programHappyPath();
});

describe('constructor toggles', () => {
  it('builds all subsystems with defaults', () => {
    const orch = makeOrchestrator();
    expect(orch).toBeInstanceOf(EndToEndWorkflowOrchestrator);
    // Event handlers were registered on all collaborators
    expect(h.detection.on).toHaveBeenCalledWith('capability_detection_complete', expect.any(Function));
    expect(h.delegation.on).toHaveBeenCalledWith('delegation_contract_created', expect.any(Function));
    expect(h.mcp.on).toHaveBeenCalledWith('mcp_server_configured', expect.any(Function));
    expect(h.validation.on).toHaveBeenCalledWith('validation_completed', expect.any(Function));
    expect(h.onboardBatch.on).toHaveBeenCalledWith('batch_completed', expect.any(Function));
  });

  it('skips validation/profiler/cache/batch when disabled', () => {
    makeOrchestrator({
      enableValidation: false,
      enablePerformanceTracking: false,
      enableIntelligentCaching: false,
      enableBatchOptimizations: false,
      enableLogging: false,
    });
    expect(h.validation.on).not.toHaveBeenCalled();
    expect(h.onboardBatch.on).not.toHaveBeenCalled();
  });
});

describe('event forwarding', () => {
  it('re-emits collaborator events as workflow_progress', () => {
    const orch = makeOrchestrator({ enableLogging: false });
    const progress: unknown[] = [];
    orch.on('workflow_progress', (p) => progress.push(p));

    h.detection.fire('capability_detection_complete', { agentId: 'a1', detectedCapabilities: 3 });
    h.delegation.fire('delegation_contract_created', {
      contractId: 'c1', assignedAgent: 'a1', requiredCapabilities: [1],
    });
    h.mcp.fire('mcp_server_configured', { serverName: 's1' });
    h.validation.fire('validation_completed', {
      result: { overallStatus: 'passed', testResults: [] },
    });
    h.onboardBatch.fire('batch_completed', {
      batchId: 'b1', result: { successful: [1], batchSize: 1 },
    });

    expect(progress.map((p) => (p as { stage: string }).stage)).toEqual([
      'capability_detection', 'delegation_created', 'mcp_configuration', 'validation',
    ]);
  });
});

describe('executeWorkflow', () => {
  it('runs all stages to success and emits lifecycle events', async () => {
    const orch = makeOrchestrator({ enableLogging: false });
    const started = vi.fn();
    const completed = vi.fn();
    orch.on('workflow_started', started);
    orch.on('workflow_completed', completed);

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.status).toBe('success');
    expect(result.agentResults).toEqual([
      { agentId: 'a1', onboarded: true, capabilitiesDetected: 3, mcpServersConfigured: 2 },
    ]);
    expect(result.taskResults[0]).toMatchObject({
      taskId: 't1', status: 'completed', assignedAgent: 'a1', confidence: 0.92,
    });
    expect(result.finalSystemHealth).toEqual({
      totalAgents: 5, activeContracts: 2, averageConfidence: 0.88, mcpServersHealthy: 1,
    });
    expect(result.performanceMetrics.totalExecutionTime).toBeGreaterThanOrEqual(0);
    expect(started).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledOnce();
    // pre + post validation
    expect(h.validation.validatePipeline).toHaveBeenCalledTimes(2);
    expect(result.validationResults).toBeDefined();
  });

  it('fails the workflow when pre-validation fails', async () => {
    h.validation.validatePipeline.mockResolvedValue({ overallStatus: 'failed', testResults: [] });
    const orch = makeOrchestrator({ enableLogging: false });
    const failed = vi.fn();
    orch.on('workflow_failed', failed);

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.status).toBe('failed');
    expect(result.errors.some((e) => e.includes('Pre-validation failed'))).toBe(true);
    expect(failed).toHaveBeenCalledOnce();
    // onboarding never reached
    expect(h.delegation.onboardAgent).not.toHaveBeenCalled();
  });

  it('records a warning when pre-validation warns and continues', async () => {
    h.validation.validatePipeline
      .mockResolvedValueOnce({ overallStatus: 'warning', testResults: [] })
      .mockResolvedValue({ overallStatus: 'passed', testResults: [] });
    const orch = makeOrchestrator({ enableLogging: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.status).toBe('success');
    expect(result.warnings.some((w) => w.includes('Pre-validation warnings'))).toBe(true);
  });

  it('marks agents failed but continues when onboarding throws', async () => {
    h.detection.detectAndRegisterCapabilities.mockRejectedValue(new Error('detect boom'));
    const orch = makeOrchestrator({ enableLogging: false, enableIntelligentCaching: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.agentResults[0]).toMatchObject({ agentId: 'a1', onboarded: false });
    expect(result.errors.some((e) => e.includes('Agent onboarding failed'))).toBe(true);
    expect(result.status).toBe('partial');
  });

  it('continues with warnings when MCP reconfiguration fails', async () => {
    h.mcp.reconfigureServers.mockRejectedValue(new Error('mcp down'));
    const orch = makeOrchestrator({ enableLogging: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.errors.some((e) => e.includes('MCP auto-configuration failed'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('without optimal MCP configuration'))).toBe(true);
  });

  it('surfaces MCP warnings on success', async () => {
    h.mcp.reconfigureServers.mockResolvedValue({
      servers: ['s1'], startedServers: [], warnings: ['slow start'],
    });
    const orch = makeOrchestrator({ enableLogging: false });
    const result = await orch.executeWorkflow(makeWorkflow());
    expect(result.warnings).toContain('slow start');
  });

  it('records failed tasks when no agent matches', async () => {
    h.delegation.findOptimalAgent.mockResolvedValue([]);
    const orch = makeOrchestrator({ enableLogging: false, enableIntelligentCaching: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.taskResults[0]).toMatchObject({ taskId: 't1', status: 'failed', assignedAgent: 'none' });
    // Every task failed and no stage error was recorded -> overall failed
    expect(result.status).toBe('failed');
  });

  it('collects a warning when system-health collection fails', async () => {
    h.detection.getSystemMetrics.mockRejectedValue(new Error('metrics gone'));
    const orch = makeOrchestrator({ enableLogging: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.warnings.some((w) => w.includes('System health collection failed'))).toBe(true);
  });

  it('warns when post-validation fails (final status is recomputed afterwards)', async () => {
    h.validation.validatePipeline
      .mockResolvedValueOnce({ overallStatus: 'passed', testResults: [] })
      .mockResolvedValueOnce({ overallStatus: 'failed', testResults: [] });
    const orch = makeOrchestrator({ enableLogging: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    // determineFinalStatus runs after post-validation and recomputes status
    // from task results/errors alone, so the warning is the durable signal.
    expect(result.status).toBe('success');
    expect(result.warnings.some((w) => w.includes('Post-validation detected issues'))).toBe(true);
    expect(result.validationResults).toEqual({ overallStatus: 'failed', testResults: [] });
  });

  it('warns when post-validation throws', async () => {
    h.validation.validatePipeline
      .mockResolvedValueOnce({ overallStatus: 'passed', testResults: [] })
      .mockRejectedValueOnce(new Error('validator crashed'));
    const orch = makeOrchestrator({ enableLogging: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(result.warnings.some((w) => w.includes('Post-validation failed'))).toBe(true);
  });
});

describe('caching paths', () => {
  it('uses cached onboarding and task results on cache hits', async () => {
    h.cache.get.mockImplementation((key: string) => {
      if (key.startsWith('agent-onboarding:')) {
        return {
          detectionResult: { bootstrapResult: { detectedCapabilities: [1] }, mcpRecommendations: [] },
          onboardingResult: { agentId: 'cached-agent', registered: true },
        };
      }
      if (key.startsWith('task-execution:')) {
        return { status: 'completed', assignedAgent: 'cached-agent', confidence: 0.7 };
      }
      return undefined;
    });
    const orch = makeOrchestrator({ enableLogging: false });

    const result = await orch.executeWorkflow(makeWorkflow());

    expect(h.detection.detectAndRegisterCapabilities).not.toHaveBeenCalled();
    expect(h.delegation.onboardAgent).not.toHaveBeenCalled();
    expect(h.delegation.findOptimalAgent).not.toHaveBeenCalled();
    expect(result.agentResults[0].agentId).toBe('cached-agent');
    expect(result.taskResults[0].assignedAgent).toBe('cached-agent');
  });

  it('caches successful onboarding and task results on miss', async () => {
    const orch = makeOrchestrator({ enableLogging: false });
    await orch.executeWorkflow(makeWorkflow());

    const setKeys = h.cache.set.mock.calls.map((c) => c[0] as string);
    expect(setKeys.some((k) => k.startsWith('agent-onboarding:'))).toBe(true);
    expect(setKeys.some((k) => k.startsWith('task-execution:'))).toBe(true);
  });

  it('does not cache failed task results', async () => {
    h.delegation.findOptimalAgent.mockResolvedValue([]);
    const orch = makeOrchestrator({ enableLogging: false });
    await orch.executeWorkflow(makeWorkflow());

    const setKeys = h.cache.set.mock.calls.map((c) => c[0] as string);
    expect(setKeys.some((k) => k.startsWith('task-execution:'))).toBe(false);
  });
});

describe('batch onboarding', () => {
  it('uses the batch processor for >3 agents', async () => {
    const agents = ['a1', 'a2', 'a3', 'a4'].map((id) => ({
      source: { type: 'markdown' as const, content: `# ${id}` },
      agentId: id,
    }));
    const orch = makeOrchestrator({ enableLogging: false });

    const result = await orch.executeWorkflow(makeWorkflow({ agents }));

    expect(h.onboardBatch.addItem).toHaveBeenCalledTimes(4);
    expect(h.onboardBatch.waitForCompletion).toHaveBeenCalledWith(30000);
    expect(result.agentResults).toHaveLength(4);
    expect(h.delegation.onboardAgent).not.toHaveBeenCalled();
  });
});

describe('query and reporting surface', () => {
  it('tracks workflows in getWorkflowStatus and listActiveWorkflows', async () => {
    const orch = makeOrchestrator({ enableLogging: false });
    const result = await orch.executeWorkflow(makeWorkflow());

    expect(orch.getWorkflowStatus(result.workflowId)?.status).toBe('success');
    expect(orch.getWorkflowStatus('nope')).toBeNull();
    const listed = orch.listActiveWorkflows();
    expect(listed.some((w) => w.workflowId === result.workflowId)).toBe(true);
  });

  it('generates a workflow report with analyses and recommendations', async () => {
    h.profiler.getBottlenecks.mockReturnValue([{ component: 'cache' }]);
    h.cache.getStats.mockReturnValue({ hitRate: 0.5 });
    h.delegation.getSystemMetrics.mockResolvedValue({ activeContracts: 1, averageConfidence: 0.2 });
    const orch = makeOrchestrator({ enableLogging: false });
    const result = await orch.executeWorkflow(makeWorkflow());

    const report = await orch.generateWorkflowReport(result.workflowId);

    expect(report.workflowResult.workflowId).toBe(result.workflowId);
    expect(report.systemAnalysis.capabilityMetrics).toEqual({ totalAgents: 5 });
    expect(report.performanceAnalysis?.bottlenecks).toEqual([{ component: 'cache' }]);
    expect(report.cacheAnalysis?.stats).toEqual({ hitRate: 0.5 });
    expect(report.recommendations.some((r) => r.includes('confidence levels are below threshold'))).toBe(true);
    expect(report.recommendations.some((r) => r.includes('bottlenecks detected'))).toBe(true);
    expect(report.recommendations.some((r) => r.includes('Cache hit rate below 70%'))).toBe(true);
  });

  it('throws for an unknown workflow report', async () => {
    const orch = makeOrchestrator({ enableLogging: false });
    await expect(orch.generateWorkflowReport('missing')).rejects.toThrow('Workflow not found');
  });

  it('cleans up old completed workflows', async () => {
    const orch = makeOrchestrator({ enableLogging: false });
    const result = await orch.executeWorkflow(makeWorkflow());
    // Fresh workflow is not cleaned with the default window
    expect(orch.cleanupWorkflows(24)).toBe(0);
    // Backdate it and clean with a zero-hour window
    result.executedAt = new Date(Date.now() - 60_000);
    expect(orch.cleanupWorkflows(0)).toBe(1);
    expect(orch.getWorkflowStatus(result.workflowId)).toBeNull();
  });
});

describe('executeDemoWorkflow', () => {
  it('runs the bundled demo definition through the pipeline', async () => {
    const orch = makeOrchestrator({ enableLogging: false });
    const result = await orch.executeDemoWorkflow();

    expect(result.status).toBe('success');
    expect(result.agentResults).toHaveLength(2);
    expect(result.taskResults.map((t) => t.taskId)).toEqual([
      'design-token-validation', 'security-audit',
    ]);
  });
});

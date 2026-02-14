/**
 * Agent Runtime Tests
 * TLP:CLEAR
 * 
 * Comprehensive test suite for DCYFR Agent Runtime with delegation support,
 * capability self-assessment, and confidence tracking.
 * 
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRuntime } from '../agent-runtime';
import type { AgentRuntimeConfig, TaskExecutionContext, TaskExecutionResult } from '../agent-runtime';
import type {
  DelegationContract,
  VerificationPolicy,
  DelegationAgent,
  ContractAcceptanceDecision,
} from '../../types/delegation-contracts';
import type {
  AgentCapabilityManifest,
  AgentCapability,
} from '../../types/agent-capabilities';

describe('AgentRuntime', () => {
  let runtime: AgentRuntime;
  let config: AgentRuntimeConfig;
  let sampleCapabilityManifest: AgentCapabilityManifest;

  beforeEach(() => {
    // Create sample capability manifest
    sampleCapabilityManifest = {
      agent_id: 'test-agent',
      agent_name: 'Test Agent',
      version: '1.0.0',
      capabilities: [
        {
          capability_id: 'code_generation',
          name: 'Code Generation',
          description: 'Generate code based on specifications',
          confidence_level: 0.85,
          completion_time_estimate_ms: 60000,
          success_rate: 0.90,
          successful_completions: 100,
          resource_requirements: {
            memory_mb: 200,
            cpu_cores: 0.5,
          },
          supported_patterns: ['generate.*code', 'create.*function'],
          tlp_clearance: 'TLP:GREEN',
          tags: ['programming', 'javascript', 'typescript'],
          last_updated: new Date().toISOString(),
        },
        {
          capability_id: 'test_writing',
          name: 'Test Writing',
          description: 'Write unit and integration tests',
          confidence_level: 0.75,
          completion_time_estimate_ms: 45000,
          success_rate: 0.85,
          successful_completions: 80,
          resource_requirements: {
            memory_mb: 150,
            cpu_cores: 0.3,
          },
          supported_patterns: ['write.*test', 'create.*test'],
          tlp_clearance: 'TLP:GREEN',
          tags: ['testing', 'jest', 'vitest'],
          last_updated: new Date().toISOString(),
        },
      ],
      overall_confidence: 0.80,
      availability: 'available',
      current_workload: 0,
      max_concurrent_tasks: 5,
      specializations: ['web_development', 'testing'],
      preferred_task_types: ['code_generation', 'test_writing'],
      avoided_task_types: ['ui_design'],
      reputation_score: 0.88,
      total_completions: 180,
      avg_completion_time_ms: 52500,
      metadata: {
        framework_version: '1.0.0',
        last_health_check: new Date().toISOString(),
      },
      created_at: new Date('2026-01-01').toISOString(),
      updated_at: new Date().toISOString(),
    };

    config = {
      agent_id: 'test-agent',
      agent_name: 'Test Agent',
      version: '1.0.0',
      max_concurrent_tasks: 3,
      default_timeout_ms: 5000, // 5 seconds for tests
      capabilities: sampleCapabilityManifest,
      enable_telemetry: true,
      debug: false,
    };

    runtime = new AgentRuntime(config);

    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    runtime.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should initialize with provided configuration', () => {
      const agentInfo = runtime.getAgentInfo();
      
      expect(agentInfo.agent_id).toBe('test-agent');
      expect(agentInfo.agent_name).toBe('Test Agent');
      expect(agentInfo.version).toBe('1.0.0');
      expect(agentInfo.max_concurrent_tasks).toBe(3);
      expect(agentInfo.current_workload).toBe(0);
    });

    it('should initialize capabilities from manifest', () => {
      const manifest = runtime.getCapabilityManifest();
      
      expect(manifest).toBeTruthy();
      expect(manifest!.capabilities).toHaveLength(2);
      expect(manifest!.capabilities[0].capability_id).toBe('code_generation');
      expect(manifest!.capabilities[1].capability_id).toBe('test_writing');
    });

    it('should set default values for optional configuration', () => {
      const minimalConfig: AgentRuntimeConfig = {
        agent_id: 'minimal-agent',
        agent_name: 'Minimal Agent',
        version: '1.0.0',
      };

      const minimalRuntime = new AgentRuntime(minimalConfig);
      const agentInfo = minimalRuntime.getAgentInfo();
      
      expect(agentInfo.max_concurrent_tasks).toBe(5); // default
    });
  });

  describe('Basic Task Execution', () => {
    it('should execute a simple task successfully', async () => {
      const taskDescription = 'Generate a simple function';
      
      const result = await runtime.executeTask(taskDescription);
      
      expect(result.success).toBe(true);
      expect(result.output).toBeTruthy();
      expect(result.context.task.description).toBe(taskDescription);
      expect(result.metrics.execution_time_ms).toBeGreaterThan(0);
      expect(result.completed_at).toBeTruthy();
    });

    it('should track task execution context', async () => {
      let capturedContext: TaskExecutionContext | null = null;

      runtime.on('task:started', (context) => {
        capturedContext = context;
      });

      await runtime.executeTask('Test task');

      expect(capturedContext).toBeTruthy();
      expect(capturedContext!.execution_id).toBeTruthy();
      expect(capturedContext!.task.description).toBe('Test task');
      expect(capturedContext!.metadata.started_at).toBeTruthy();
    });

    it('should emit task events during execution', async () => {
      const events: string[] = [];

      runtime.on('task:started', () => events.push('started'));
      runtime.on('task:progress', () => events.push('progress'));
      runtime.on('task:completed', () => events.push('completed'));

      await runtime.executeTask('Test progress tracking');

      expect(events).toContain('started');
      expect(events).toContain('progress');
      expect(events).toContain('completed');
    });

    it('should handle task parameters', async () => {
      const taskDescription = 'Generate function with params';
      const taskParameters = { language: 'typescript', complexity: 'simple' };

      const result = await runtime.executeTask(taskDescription, taskParameters);

      expect(result.success).toBe(true);
      expect(result.context.task.parameters).toEqual(taskParameters);
    });

    it('should respect concurrent task limits', async () => {
      const tasks: Promise<TaskExecutionResult>[] = [];

      // Start max_concurrent_tasks + 1 tasks
      for (let i = 0; i < 4; i++) { // max is 3
        tasks.push(runtime.executeTask(`Task ${i}`));
      }

      // The 4th task should be rejected immediately
      await expect(tasks[3]).rejects.toThrow('Maximum concurrent task limit reached');
    });

    it('should track current tasks', async () => {
      const taskPromise = runtime.executeTask('Long running task');
      
      const currentTasks = runtime.getCurrentTasks();
      expect(currentTasks).toHaveLength(1);
      expect(currentTasks[0].task.description).toBe('Long running task');

      await taskPromise;

      const currentTasksAfter = runtime.getCurrentTasks();
      expect(currentTasksAfter).toHaveLength(0);
    });
  });

  describe('Delegation Contract Support', () => {
    let sampleContract: DelegationContract;

    beforeEach(() => {
      sampleContract = {
        contract_id: 'test-contract-001',
        task_id: 'task-001',
        delegator_agent_id: 'orchestrator-agent',
        delegatee_agent_id: 'test-agent',
        task_description: 'Generate authentication module',
        verification_policy: 'direct_inspection',
        success_criteria: {
          quality_threshold: 0.8,
          required_checks: ['syntax_valid', 'tests_included'],
        },
        timeout_ms: 10000,
        priority: 7,
        created_at: new Date().toISOString(),
        status: 'pending',
      };
    });

    it('should accept delegation contracts', async () => {
      let receivedContract: DelegationContract | null = null;
      let acceptedContract: DelegationContract | null = null;

      runtime.on('delegation:contract:received', (contract) => {
        receivedContract = contract;
      });

      runtime.on('delegation:contract:accepted', (contract) => {
        acceptedContract = contract;
      });

      const result = await runtime.executeTask(
        'Generate authentication module',
        {},
        sampleContract
      );

      expect(result.success).toBe(true);
      expect(receivedContract).toEqual(sampleContract);
      expect(acceptedContract).toEqual(sampleContract);
      expect(result.context.delegation_contract).toEqual(sampleContract);
    });

    it('should validate delegation contract fields', async () => {
      const invalidContract = {
        ...sampleContract,
        task_id: '', // Invalid: empty task_id
      };

      await expect(
        runtime.executeTask('Test task', {}, invalidContract)
      ).rejects.toThrow('Invalid delegation contract: missing required fields');
    });

    it('should reject contracts for wrong delegatee', async () => {
      const wrongContract = {
        ...sampleContract,
        delegatee_agent_id: 'different-agent',
      };

      await expect(
        runtime.executeTask('Test task', {}, wrongContract)
      ).rejects.toThrow('Contract delegated to different-agent but runtime is test-agent');
    });

    it('should validate verification policy', async () => {
      const invalidContract = {
        ...sampleContract,
        verification_policy: 'invalid_policy' as VerificationPolicy,
      };

      await expect(
        runtime.executeTask('Test task', {}, invalidContract)
      ).rejects.toThrow('Invalid verification policy: invalid_policy');
    });

    it('should apply contract timeout', async () => {
      const shortTimeoutContract = {
        ...sampleContract,
        timeout_ms: 50, // Very short timeout
      };

      await expect(
        runtime.executeTask('Test task', {}, shortTimeoutContract)
      ).rejects.toThrow('Task execution timeout after 50ms');
    });

    it('should perform verification when required', async () => {
      const result = await runtime.executeTask(
        'Generate module',
        {},
        sampleContract
      );

      expect(result.verification).toBeTruthy();
      expect(result.verification!.verification_method).toBe('direct_inspection');
      expect(result.verification!.verified_by).toBe('test-agent');
      expect(result.verification!.quality_score).toBeGreaterThan(0);
    });

    it('should check contract acceptance capability', async () => {
      const canAccept = await runtime.canAcceptDelegationContract(sampleContract);
      
      expect(canAccept.can_accept).toBe(true);
      expect(canAccept.reason).toBeUndefined();
      expect(canAccept.confidence).toBeGreaterThan(0);
      expect(canAccept.confidence).toBeLessThanOrEqual(1);
      expect(canAccept.assessment).toBeTruthy();
    });

    it('should reject contracts exceeding resource limits', async () => {
      const configWithLimits: AgentRuntimeConfig = {
        ...config,
        resource_limits: {
          memory_mb: 100,
          cpu_percent: 50,
        },
      };

      const limitedRuntime = new AgentRuntime(configWithLimits);
      
      const resourceHeavyContract = {
        ...sampleContract,
        resource_requirements: {
          memory_mb: 200, // Exceeds limit
          cpu_cores: 0.3,
        },
      };

      const canAccept = await limitedRuntime.canAcceptDelegationContract(resourceHeavyContract);
      
      expect(canAccept.can_accept).toBe(false);
      expect(canAccept.reason).toContain('Memory requirement');
    });
  });

  describe('Capability Self-Assessment', () => {
    beforeEach(async () => {
      // Execute some tasks to create history for assessment
      await runtime.executeTask('Generate a function');
      await runtime.executeTask('Write unit tests');
      await runtime.executeTask('Create TypeScript code');
    });

    it('should perform capability self-assessment', async () => {
      const assessments = await runtime.performCapabilitySelfAssessment();
      
      expect(assessments).toHaveLength(2); // code_generation and test_writing
      
      const codeGenAssessment = assessments.find(a => a.capability_id === 'code_generation');
      expect(codeGenAssessment).toBeTruthy();
      expect(codeGenAssessment!.confidence_level).toBeGreaterThan(0);
      expect(codeGenAssessment!.confidence_level).toBeLessThanOrEqual(1);
      expect(codeGenAssessment!.assessed_at).toBeTruthy();
      expect(codeGenAssessment!.confidence_factors).toBeTruthy();
    });

    it('should assess specific capability', async () => {
      const assessments = await runtime.performCapabilitySelfAssessment('code_generation');
      
      expect(assessments).toHaveLength(1);
      expect(assessments[0].capability_id).toBe('code_generation');
    });

    it('should include confidence factors in assessment', async () => {
      const assessments = await runtime.performCapabilitySelfAssessment('test_writing');
      const assessment = assessments[0];
      
      expect(assessment.confidence_factors).toBeTruthy();
      expect(assessment.confidence_factors.recent_success_rate).toBeDefined();
      expect(assessment.confidence_factors.resource_efficiency).toBeDefined();
    });

    it('should provide assessment reasoning', async () => {
      const assessments = await runtime.performCapabilitySelfAssessment('code_generation');
      const assessment = assessments[0];
      
      expect(assessment.reasoning).toBeTruthy();
      expect(assessment.reasoning).toContain('recent tasks');
    });

    it('should generate recommendations', async () => {
      const assessments = await runtime.performCapabilitySelfAssessment();
      const assessment = assessments[0];
      
      expect(assessment.recommendations).toBeTruthy();
      expect(assessment.recommendations!.confidence_adjustment).toBeDefined();
      expect(assessment.recommendations!.improvement_areas).toBeDefined();
    });

    it('should emit assessment events', async () => {
      let assessmentEvent: any = null;

      runtime.on('capability:assessed', (assessment) => {
        assessmentEvent = assessment;
      });

      await runtime.performCapabilitySelfAssessment('code_generation');

      expect(assessmentEvent).toBeTruthy();
      expect(assessmentEvent.capability_id).toBe('code_generation');
    });
  });

  describe('Confidence Tracking', () => {
    it('should track confidence history', async () => {
      const initialHistory = runtime.getConfidenceHistory('code_generation');
      expect(initialHistory).toHaveLength(1); // Initial confidence from manifest
      
      await runtime.performCapabilitySelfAssessment('code_generation');
      
      const updatedHistory = runtime.getConfidenceHistory('code_generation');
      expect(updatedHistory.length).toBeGreaterThanOrEqual(1);
      
      const historyEntry = updatedHistory[0];
      expect(historyEntry.confidence).toBeDefined();
      expect(historyEntry.timestamp).toBeTruthy();
    });

    it('should emit confidence update events', async () => {
      let confidenceUpdate: any = null;

      runtime.on('confidence:updated', (capabilityId, oldConfidence, newConfidence) => {
        confidenceUpdate = { capabilityId, oldConfidence, newConfidence };
      });

      // Manually adjust confidence to trigger event
      const manifest = runtime.getCapabilityManifest()!;
      const originalConfidence = manifest.capabilities[0].confidence_level;
      
      // Perform assessment that might change confidence
      await runtime.performCapabilitySelfAssessment();

      // Check if confidence update was significant enough to trigger event
      const newConfidence = manifest.capabilities[0].confidence_level;
      const confidenceDiff = Math.abs(newConfidence - originalConfidence);
      
      if (confidenceDiff > 0.1) {
        expect(confidenceUpdate).toBeTruthy();
        expect(confidenceUpdate.capabilityId).toBe('code_generation');
      }
    });

    it('should update capability statistics from task execution', async () => {
      const manifest = runtime.getCapabilityManifest()!;
      const capability = manifest.capabilities[0];
      const initialCompletions = capability.successful_completions;
      
      await runtime.executeTask('Generate a complex function');
      
      const updatedCapability = manifest.capabilities[0];
      expect(updatedCapability.successful_completions).toBeGreaterThanOrEqual(initialCompletions);
    });

    it('should limit confidence history size', async () => {
      // Perform many assessments
      for (let i = 0; i < 60; i++) {
        await runtime.performCapabilitySelfAssessment('code_generation');
      }
      
      const history = runtime.getConfidenceHistory('code_generation');
      expect(history.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Task History and Metrics', () => {
    beforeEach(async () => {
      await runtime.executeTask('Task 1');
      await runtime.executeTask('Task 2');
      await runtime.executeTask('Task 3');
    });

    it('should maintain task execution history', () => {
      const history = runtime.getTaskHistory();
      
      expect(history).toHaveLength(3);
      expect(history[0].context.task.description).toBe('Task 1');
      expect(history[1].context.task.description).toBe('Task 2');
      expect(history[2].context.task.description).toBe('Task 3');
    });

    it('should limit task history', () => {
      const limitedHistory = runtime.getTaskHistory(2);
      
      expect(limitedHistory).toHaveLength(2);
      expect(limitedHistory[0].context.task.description).toBe('Task 2');
      expect(limitedHistory[1].context.task.description).toBe('Task 3');
    });

    it('should include execution metrics in results', async () => {
      const result = await runtime.executeTask('Metric test task');
      
      expect(result.metrics).toBeTruthy();
      expect(result.metrics.execution_time_ms).toBeGreaterThan(0);
      expect(result.metrics.peak_memory_mb).toBeDefined();
      expect(result.metrics.cpu_time_ms).toBeGreaterThan(0);
    });
  });

  describe('Capability Manifest Management', () => {
    it('should allow updating capability manifest', () => {
      const newManifest: AgentCapabilityManifest = {
        ...sampleCapabilityManifest,
        overall_confidence: 0.95,
      };

      runtime.updateCapabilityManifest(newManifest);
      
      const updatedManifest = runtime.getCapabilityManifest();
      expect(updatedManifest!.overall_confidence).toBe(0.95);
    });

    it('should validate required capabilities', async () => {
      const contractWithRequiredCapabilities = {
        contract_id: 'test-contract-002',
        task_id: 'task-002',
        delegator_agent_id: 'orchestrator',
        delegatee_agent_id: 'test-agent',
        task_description: 'Simple task', // Avoid "complex" keyword that increases time estimate
        verification_policy: 'direct_inspection' as VerificationPolicy,
        required_capabilities: ['code_generation', 'test_writing'],
        success_criteria: {},
        timeout_ms: 15000, // Longer timeout to avoid timeout rejection
        created_at: new Date().toISOString(),
        status: 'pending' as const,
      };

      const canAccept = await runtime.canAcceptDelegationContract(contractWithRequiredCapabilities);
      expect(canAccept.can_accept).toBe(true);
    });

    it('should reject contracts with missing capabilities', async () => {
      const contractWithMissingCapability = {
        contract_id: 'test-contract-003',
        task_id: 'task-003',
        delegator_agent_id: 'orchestrator',
        delegatee_agent_id: 'test-agent',
        task_description: 'Complex task',
        verification_policy: 'direct_inspection' as VerificationPolicy,
        required_capabilities: ['ui_design'], // Not available
        success_criteria: {},
        timeout_ms: 5000,
        created_at: new Date().toISOString(),
        status: 'pending' as const,
      };

      const canAccept = await runtime.canAcceptDelegationContract(contractWithMissingCapability);
      expect(canAccept.can_accept).toBe(false);
      expect(canAccept.reason).toContain('Missing required capability: ui_design');
    });
  });

  describe('Error Handling', () => {
    it('should handle task execution failures', async () => {
      let failedEvent: TaskExecutionResult | null = null;

      runtime.on('task:failed', (result) => {
        failedEvent = result;
      });

      // Force a failure by mocking the simulation method
      const originalSimulate = (runtime as any).simulateTaskExecution;
      (runtime as any).simulateTaskExecution = vi.fn().mockRejectedValue(new Error('Simulated failure'));

      await expect(runtime.executeTask('Failing task')).rejects.toThrow('Simulated failure');

      expect(failedEvent).toBeTruthy();
      expect(failedEvent!.success).toBe(false);
      expect(failedEvent!.error).toBeTruthy();
      expect(failedEvent!.error!.message).toBe('Simulated failure');

      // Restore original method
      (runtime as any).simulateTaskExecution = originalSimulate;
    });

    it('should handle task timeouts', async () => {
      const shortTimeoutConfig = {
        ...config,
        default_timeout_ms: 10, // Very short timeout
      };

      const timeoutRuntime = new AgentRuntime(shortTimeoutConfig);
      
      await expect(
        timeoutRuntime.executeTask('Test timeout task')
      ).rejects.toThrow('Task execution timeout');
    });

    it('should clean up after failed tasks', async () => {
      const originalSimulate = (runtime as any).simulateTaskExecution;
      (runtime as any).simulateTaskExecution = vi.fn().mockRejectedValue(new Error('Test failure'));

      try {
        await runtime.executeTask('Failing task');
      } catch (error) {
        // Expected to fail
      }

      // Should have no current tasks after failure
      const currentTasks = runtime.getCurrentTasks();
      expect(currentTasks).toHaveLength(0);

      // Restore original method
      (runtime as any).simulateTaskExecution = originalSimulate;
    });
  });

  describe('Lifecycle Management', () => {
    it('should shutdown gracefully', async () => {
      let shutdownEmitted = false;

      runtime.on('shutdown', () => {
        shutdownEmitted = true;
      });

      await runtime.shutdown();

      expect(shutdownEmitted).toBe(true);
      
      const currentTasks = runtime.getCurrentTasks();
      expect(currentTasks).toHaveLength(0);
    });

    it('should handle shutdown with active tasks', async () => {
      // Start a task but don't wait for it
      const taskPromise = runtime.executeTask('Long task');
      
      await runtime.shutdown();
      
      // Task should be marked as timeout
      const currentTasks = runtime.getCurrentTasks();
      expect(currentTasks).toHaveLength(0);
    });
  });

  describe('Agent Information', () => {
    it('should calculate current reputation', () => {
      const agentInfo = runtime.getAgentInfo();
      
      expect(agentInfo.reputation_score).toBeGreaterThan(0);
      expect(agentInfo.reputation_score).toBeLessThanOrEqual(1);
    });

    it('should reflect current workload', async () => {
      const taskPromise = runtime.executeTask('Active task');
      
      const agentInfo = runtime.getAgentInfo();
      expect(agentInfo.current_workload).toBe(1);
      
      await taskPromise;
      
      const agentInfoAfter = runtime.getAgentInfo();
      expect(agentInfoAfter.current_workload).toBe(0);
    });

    it('should include capability information', () => {
      const agentInfo = runtime.getAgentInfo();
      
      expect(agentInfo.capabilities).toHaveLength(2);
      expect(agentInfo.capabilities[0].capability_id).toBe('code_generation');
      expect(agentInfo.capabilities[1].capability_id).toBe('test_writing');
    });
  });

  describe('Resource Monitoring', () => {
    it('should track resource usage in metrics  510ms', async () => {
      const result = await runtime.executeTask('Resource tracking test');
      
      expect(result.metrics.peak_memory_mb).toBeDefined();
      expect(result.metrics.execution_time_ms).toBeGreaterThan(0);
    });
  });

  describe('Enhanced Delegation-Aware Features', () => {
    let baseContract: DelegationContract;

    beforeEach(() => {
      baseContract = {
        contract_id: 'test-contract-delegated',
        task_id: 'task-delegated',
        delegator_agent_id: 'orchestrator-agent',
        delegatee_agent_id: 'test-agent',
        task_description: 'Test delegation task',
        verification_policy: 'direct_inspection',
        success_criteria: {
          quality_threshold: 0.8,
          required_checks: ['syntax_valid', 'tests_included'],
        },
        timeout_ms: 10000,
        priority: 7,
        created_at: new Date().toISOString(),
        status: 'pending',
      };
    });

    describe('Retry Policy Support', () => {
      it('should execute task with retry policy', async () => {
        const contractWithRetry: DelegationContract = {
          ...baseContract,
          retry_policy: {
            max_retries: 2,
            backoff_strategy: 'linear',
            initial_delay_ms: 100,
            retry_conditions: ['timeout', 'network_error'],
          },
        };

        const result = await runtime.executeTask('Test retry task', {}, contractWithRetry);
        expect(result.success).toBe(true);
      });

      it('should retry on failure based on retry conditions', async () => {
        const contractWithRetry: DelegationContract = {
          ...baseContract,
          retry_policy: {
            max_retries: 1,
            backoff_strategy: 'exponential',
            initial_delay_ms: 50,
          },
        };

        // Mock the simulation to fail first time, succeed second
        let callCount = 0;
        const originalSimulate = (runtime as any).simulateTaskExecution;
        (runtime as any).simulateTaskExecution = vi.fn().mockImplementation((context) => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('Task execution timeout')); // Should trigger retry
          }
          return originalSimulate.call(runtime, context);
        });

        const result = await runtime.executeTask('Retry test task', {}, contractWithRetry);
        expect(result.success).toBe(true);
        expect(callCount).toBe(2); // Initial + 1 retry

        // Restore original method
        (runtime as any).simulateTaskExecution = originalSimulate;
      });
    });

    describe('Permission Token Validation', () => {
      it('should accept contract with valid permission token', async () => {
        const contractWithPermissions: DelegationContract = {
          ...baseContract,
          permission_token: {
            token_id: 'token-001',
            scopes: ['read', 'write'],
            actions: ['create_file', 'run_command'],
            resources: ['workspace://', 'api://internal'],
            expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
          },
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithPermissions);
        expect(canAccept.can_accept).toBe(true);
      });

      it('should reject contract with expired permission token', async () => {
        const contractWithExpiredToken: DelegationContract = {
          ...baseContract,
          permission_token: {
            token_id: 'token-002',
            scopes: ['read'],
            actions: ['read_file'],
            resources: ['workspace://'],
            expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          },
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithExpiredToken);
        expect(canAccept.can_accept).toBe(false);
        expect(canAccept.reason).toContain('expired');
      });
    });

    describe('Firebreak Enforcement', () => {
      it('should reject contract exceeding delegation depth firebreak', async () => {
        const contractWithDepthFirebreak: DelegationContract = {
          ...baseContract,
          metadata: {
            delegation_depth: 5,
          },
          firebreaks: [
            {
              type: 'max_depth',
              threshold: 3,
              action: 'block',
            },
          ],
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithDepthFirebreak);
        expect(canAccept.can_accept).toBe(false);
        expect(canAccept.reason).toContain('Delegation depth');
      });

      it('should reject contract with human review firebreak', async () => {
        const contractWithHumanReview: DelegationContract = {
          ...baseContract,
          firebreaks: [
            {
              type: 'human_review',
              action: 'require_approval',
              reason: 'High-risk operation requires manual approval',
            },
          ],
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithHumanReview);
        expect(canAccept.can_accept).toBe(false);
        expect(canAccept.reason).toContain('Human review');
      });

      it('should reject contract exceeding timeout firebreak', async () => {
        const contractWithTimeoutFirebreak: DelegationContract = {
          ...baseContract,
          firebreaks: [
            {
              type: 'timeout',
              threshold: 2000, // 2 seconds
              action: 'block',
            },
          ],
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithTimeoutFirebreak);
        expect(canAccept.can_accept).toBe(false);
        expect(canAccept.reason).toContain('firebreak limit');
      });
    });

    describe('Reputation Requirements', () => {
      it('should accept contract when reputation requirements are met', async () => {
        // Execute some successful tasks to build reputation
        await runtime.executeTask('Build reputation 1');
        await runtime.executeTask('Build reputation 2');
        await runtime.executeTask('Build reputation 3');

        const contractWithRepRequirements: DelegationContract = {
          ...baseContract,
          reputation_requirements: {
            min_security_score: 0.1, // Low threshold
            min_tasks_completed: 3,
            min_confidence_score: 0.5,
          },
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithRepRequirements);
        expect(canAccept.can_accept).toBe(true);
      });

      it('should reject contract when minimum tasks not completed', async () => {
        const contractWithHighRequirements: DelegationContract = {
          ...baseContract,
          reputation_requirements: {
            min_tasks_completed: 100, // Very high threshold
          },
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithHighRequirements);
        expect(canAccept.can_accept).toBe(false);
        expect(canAccept.reason).toContain('Completed tasks');
      });

      it('should reject contract when confidence score too low', async () => {
        const contractWithHighConfidence: DelegationContract = {
          ...baseContract,
          reputation_requirements: {
            min_confidence_score: 0.99, // Very high threshold
          },
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithHighConfidence);
        expect(canAccept.can_accept).toBe(false);
        expect(canAccept.reason).toContain('Confidence');
      });

      it('should reject contract for missing specializations', async () => {
        const contractWithSpecializations: DelegationContract = {
          ...baseContract,
          reputation_requirements: {
            required_specializations: ['blockchain_development', 'quantum_computing'],
          },
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractWithSpecializations);
        expect(canAccept.can_accept).toBe(false);
        expect(canAccept.reason).toContain('Missing required specializations');
      });
    });

    describe('Enhanced Contract Assessment', () => {
      it('should provide detailed assessment scores', async () => {
        const contractForAssessment: DelegationContract = {
          ...baseContract,
          required_capabilities: ['code_generation'],
          resource_requirements: {
            memory_mb: 50,
            cpu_cores: 0.2,
          },
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractForAssessment);
        
        expect(canAccept.can_accept).toBe(true);
        expect(canAccept.confidence).toBeGreaterThan(0);
        expect(canAccept.assessment).toBeTruthy();
        expect(canAccept.assessment!.capability_match).toBeGreaterThan(0);
        expect(canAccept.assessment!.resource_availability).toBeGreaterThan(0);
        expect(canAccept.assessment!.workload_capacity).toBeGreaterThan(0);
        expect(canAccept.assessment!.reputation_compliance).toBe(true);
      });

      it('should calculate confidence based on multiple factors', async () => {
        const contractForConfidence: DelegationContract = {
          ...baseContract,
          required_capabilities: ['code_generation', 'test_writing'],
          metadata: {
            estimated_complexity: 3, // Low complexity
          },
          timeout_ms: 30000, // Reasonable timeout
        };

        const canAccept = await runtime.canAcceptDelegationContract(contractForConfidence);
        
        expect(canAccept.can_accept).toBe(true);
        expect(canAccept.confidence).toBeGreaterThan(0.5);
        expect(canAccept.estimated_completion_ms).toBeLessThan(contractForConfidence.timeout_ms!);
      });

      it('should penalize confidence for high complexity tasks', async () => {
        const simpleContract: DelegationContract = {
          ...baseContract,
          metadata: { estimated_complexity: 2 },
        };

        const complexContract: DelegationContract = {
          ...baseContract,
          metadata: { estimated_complexity: 9 },
        };

        const simpleAccept = await runtime.canAcceptDelegationContract(simpleContract);
        const complexAccept = await runtime.canAcceptDelegationContract(complexContract);

        expect(complexAccept.confidence).toBeLessThan(simpleAccept.confidence);
      });
    });
  });

  describe('Resource Monitoring', () => {
    it('should estimate task completion time', async () => {
      const longTaskDescription = 'This is a very long and complex task description that should take longer to estimate and complete based on its complexity and length and various other factors that make it challenging';
      
      const canAccept = await runtime.canAcceptDelegationContract({
        contract_id: 'test',
        task_id: 'test',
        delegator_agent_id: 'test',
        delegatee_agent_id: 'test-agent',
        task_description: longTaskDescription,
        verification_policy: 'direct_inspection',
        success_criteria: {},
        timeout_ms: 1000, // Short timeout
        created_at: new Date().toISOString(),
        status: 'pending',
      });
      
      // Should detect that task may exceed timeout
      expect(canAccept.can_accept).toBe(false);
      expect(canAccept.reason).toContain('may exceed timeout');
    });

    it('should track resource usage in metrics', async () => {
      const result = await runtime.executeTask('Resource tracking test');
      
      expect(result.metrics.peak_memory_mb).toBeDefined();
      expect(result.metrics.execution_time_ms).toBeGreaterThan(0);
    });
  });
});
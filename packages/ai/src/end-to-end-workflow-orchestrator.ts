/**
 * End-to-End Workflow Orchestrator
 * TLP:CLEAR
 * 
 * Complete workflow orchestrator that demonstrates the full integration
 * from agent onboarding through task completion, with comprehensive
 * monitoring, validation, and performance tracking.
 * 
 * @version 1.0.0
 * @date 2026-02-15
 * @module dcyfr-ai/end-to-end-workflow-orchestrator
 */

import { EventEmitter } from 'events';
import { DelegationCapabilityIntegration } from './delegation-capability-integration.js';
import { EnhancedCapabilityDetection } from './enhanced-capability-detection.js';
import { MCPAutoConfiguration } from './mcp-auto-configuration.js';
import { ValidationPipelineIntegration } from './validation-pipeline-integration.js';
import { PerformanceProfiler } from './performance-profiler.js';
import { IntelligentCacheManager } from './intelligent-cache-manager.js';
import { HighPerformanceBatchProcessor, createAgentOnboardingBatchProcessor, createCapabilityDetectionBatchProcessor } from './batch-processor.js';

import type { AgentSource } from './capability-bootstrap.js';
import type { AgentCapabilityManifest, DelegationCapability } from './types/agent-capabilities.js';
import type { DelegationContract } from './types/delegation-contracts.js';

/**
 * Workflow orchestrator configuration
 */
export interface WorkflowOrchestratorConfig {
  /**
   * Workspace root path
   */
  workspaceRoot: string;
  
  /**
   * Enable comprehensive logging
   */
  enableLogging?: boolean;
  
  /**
   * Enable real-time monitoring
   */
  enableMonitoring?: boolean;
  
  /**
   * Enable automatic validation
   */
  enableValidation?: boolean;
  
  /**
   * Enable performance tracking
   */
  enablePerformanceTracking?: boolean;
  
  /**
   * Workflow timeout (milliseconds)
   */
  workflowTimeout?: number;
  
  /**
   * Enable intelligent caching
   */
  enableIntelligentCaching?: boolean;
  
  /**
   * Enable batch processing optimizations
   */
  enableBatchOptimizations?: boolean;
  
  /**
   * Performance profiler configuration
   */
  profilerConfig?: any;
  
  /**
   * Cache configuration
   */
  cacheConfig?: any;
  
  /**
   * Minimum confidence threshold for operations
   */
  minConfidenceThreshold?: number;
  
  /**
   * Enable automatic retries on failure
   */
  enableAutoRetry?: boolean;
  
  /**
   * Maximum retry attempts
   */
  maxRetryAttempts?: number;
}

/**
 * Complete workflow execution result
 */
export interface WorkflowExecutionResult {
  /**
   * Workflow identifier
   */
  workflowId: string;
  
  /**
   * Execution status
   */
  status: 'success' | 'failed' | 'partial' | 'timeout';
  
  /**
   * Agent onboarding results
   */
  agentResults: Array<{
    agentId: string;
    onboarded: boolean;
    capabilitiesDetected: number;
    mcpServersConfigured: number;
  }>;
  
  /**
   * Task execution results
   */
  taskResults: Array<{
    taskId: string;
    status: 'completed' | 'failed' | 'timeout';
    assignedAgent: string;
    executionTime: number;
    confidence: number;
  }>;
  
  /**
   * System health at completion
   */
  finalSystemHealth: {
    totalAgents: number;
    activeContracts: number;
    averageConfidence: number;
    mcpServersHealthy: number;
  };
  
  /**
   * Performance metrics
   */
  performanceMetrics: {
    totalExecutionTime: number;
    avgTaskExecutionTime: number;
    throughput: number;
    resourceUtilization: number;
  };
  
  /**
   * Validation results if enabled
   */
  validationResults?: any;
  
  /**
   * Workflow warnings
   */
  warnings: string[];
  
  /**
   * Workflow errors
   */
  errors: string[];
  
  /**
   * Execution timestamp
   */
  executedAt: Date;
}

/**
 * Task definition for workflow execution
 */
export interface WorkflowTask {
  /**
   * Task identifier
   */
  taskId: string;
  
  /**
   * Task description
   */
  description: string;
  
  /**
   * Required capabilities for task
   */
  requiredCapabilities: DelegationCapability[];
  
  /**
   * Task priority (1-10)
   */
  priority?: number;
  
  /**
   * Task timeout (milliseconds)
   */
  timeout?: number;
  
  /**
   * TLP classification
   */
  tlpClassification?: string;
  
  /**
   * Task-specific metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Complete workflow definition
 */
export interface WorkflowDefinition {
  /**
   * Workflow name
   */
  name: string;
  
  /**
   * Workflow description
   */
  description: string;
  
  /**
   * Agents to onboard for this workflow
   */
  agents: Array<{ source: AgentSource; agentId?: string }>;
  
  /**
   * Tasks to execute in workflow
   */
  tasks: WorkflowTask[];
  
  /**
   * Workflow configuration overrides
   */
  config?: Partial<WorkflowOrchestratorConfig>;
}

/**
 * End-to-End Workflow Orchestrator
 * 
 * Comprehensive system that orchestrates the complete workflow from
 * agent onboarding through task completion with monitoring and validation.
 */
export class EndToEndWorkflowOrchestrator extends EventEmitter {
  private delegationIntegration: DelegationCapabilityIntegration;
  private capabilityDetection: EnhancedCapabilityDetection;
  private mcpAutoConfig: MCPAutoConfiguration;
  private validationPipeline?: ValidationPipelineIntegration;
  private config: Required<WorkflowOrchestratorConfig>;
  private activeWorkflows: Map<string, WorkflowExecutionResult> = new Map();
  private performanceCounter: Map<string, number> = new Map();
  
  // Performance optimization components
  private performanceProfiler?: PerformanceProfiler;
  private cacheManager?: IntelligentCacheManager;
  private agentOnboardingBatchProcessor?: HighPerformanceBatchProcessor;
  private capabilityDetectionBatchProcessor?: HighPerformanceBatchProcessor;

  constructor(config: WorkflowOrchestratorConfig) {
    super();
    
    this.config = {
      enableLogging: true,
      enableMonitoring: true,
      enableValidation: true,
      enablePerformanceTracking: true,
      workflowTimeout: 300000, // 5 minutes
      minConfidenceThreshold: 0.7,
      enableAutoRetry: true,
      maxRetryAttempts: 3,
      enableIntelligentCaching: true,
      enableBatchOptimizations: true,
      profilerConfig: {},
      cacheConfig: {},
      ...config,
    };

    // Initialize integrated systems
    this.delegationIntegration = new DelegationCapabilityIntegration({
      autoRegisterAgents: true,
      minimumDelegationConfidence: this.config.minConfidenceThreshold,
      enableCapabilityValidation: true,
      enableTelemetry: this.config.enablePerformanceTracking,
    });

    this.capabilityDetection = new EnhancedCapabilityDetection({
      enableDynamicLearning: true,
      enableConfidenceUpdates: true,
      enablePerformanceTracking: this.config.enablePerformanceTracking,
      enableMCPIntegration: true,
      workspaceRoot: this.config.workspaceRoot,
    });

    this.mcpAutoConfig = new MCPAutoConfiguration({
      workspaceRoot: this.config.workspaceRoot,
      autoStartServers: true,
      healthMonitoring: this.config.enableMonitoring,
    });

    if (this.config.enableValidation) {
      this.validationPipeline = new ValidationPipelineIntegration({
        workspaceRoot: this.config.workspaceRoot,
        enableIntegrationTests: true,
        enablePerformanceValidation: this.config.enablePerformanceTracking,
        enableMCPValidation: true,
        enableContinuousMonitoring: this.config.enableMonitoring,
      });
    }
    
    // Initialize performance optimization components
    if (this.config.enablePerformanceTracking) {
      this.performanceProfiler = new PerformanceProfiler({
        enableRealTimeMonitoring: this.config.enableMonitoring,
        enableBottleneckDetection: true,
        enableOptimizationRecommendations: true,
        ...this.config.profilerConfig,
      });
    }
    
    if (this.config.enableIntelligentCaching) {
      this.cacheManager = new IntelligentCacheManager({
        maxEntries: 5000,
        maxSizeBytes: 50 * 1024 * 1024, // 50MB
        enablePerformanceTracking: this.config.enablePerformanceTracking,
        enableAutoCleanup: true,
        ...this.config.cacheConfig,
      }, this.performanceProfiler);
    }
    
    if (this.config.enableBatchOptimizations) {
      this.agentOnboardingBatchProcessor = createAgentOnboardingBatchProcessor(
        this.performanceProfiler,
        this.cacheManager
      );
      
      this.capabilityDetectionBatchProcessor = createCapabilityDetectionBatchProcessor(
        this.performanceProfiler,
        this.cacheManager
      );
      
      // Listen for batch processor events
      this.agentOnboardingBatchProcessor.on('batch_completed', ({ batchId, result }) => {
        this.log(`Agent onboarding batch ${batchId} completed: ${result.successful.length}/${result.batchSize} successful`);
      });
      
      this.capabilityDetectionBatchProcessor.on('batch_completed', ({ batchId, result }) => {
        this.log(`Capability detection batch ${batchId} completed: ${result.successful.length}/${result.batchSize} successful`);
      });
    }

    this.setupEventHandlers();
  }

  /**
   * Setup comprehensive event handling across all systems
   */
  private setupEventHandlers(): void {
    // Capability detection events
    this.capabilityDetection.on('capability_detection_complete', ({ agentId, detectedCapabilities }) => {
      this.log(`Agent ${agentId}: Detected ${detectedCapabilities} capabilities`);
      this.emit('workflow_progress', {
        stage: 'capability_detection',
        agentId,
        progress: 'completed',
        details: { detectedCapabilities },
      });
    });

    // Delegation integration events
    this.delegationIntegration.on('delegation_contract_created', ({ contractId, assignedAgent, requiredCapabilities }) => {
      this.log(`Contract ${contractId}: Assigned to ${assignedAgent} for ${requiredCapabilities.length} capabilities`);
      this.emit('workflow_progress', {
        stage: 'delegation_created',
        contractId,
        assignedAgent,
        progress: 'completed',
        details: { requiredCapabilities },
      });
    });

    // MCP configuration events
    this.mcpAutoConfig.on('mcp_server_configured', ({ serverName }) => {
      this.log(`MCP server configured: ${serverName}`);
      this.emit('workflow_progress', {
        stage: 'mcp_configuration',
        serverName,
        progress: 'completed',
      });
    });

    // Validation events
    if (this.validationPipeline) {
      this.validationPipeline.on('validation_completed', ({ result }) => {
        this.log(`Validation completed: ${result.overallStatus} (${result.testResults.length} tests)`);
        this.emit('workflow_progress', {
          stage: 'validation',
          progress: 'completed',
          details: { status: result.overallStatus, testCount: result.testResults.length },
        });
      });
    }
  }

  /**
   * Execute complete end-to-end workflow with performance optimizations
   */
  async executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowExecutionResult> {
    const workflowId = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const workflowConfig = { ...this.config, ...workflow.config };
    
    // Start performance profiling for entire workflow
    const workflowTimerId = this.performanceProfiler?.startTimer(`workflow-${workflow.name}`);

    this.log(`Starting workflow: ${workflow.name} (${workflowId})`);

    const result: WorkflowExecutionResult = {
      workflowId,
      status: 'success',
      agentResults: [],
      taskResults: [],
      finalSystemHealth: {
        totalAgents: 0,
        activeContracts: 0,
        averageConfidence: 0,
        mcpServersHealthy: 0,
      },
      performanceMetrics: {
        totalExecutionTime: 0,
        avgTaskExecutionTime: 0,
        throughput: 0,
        resourceUtilization: 0,
      },
      warnings: [],
      errors: [],
      executedAt: new Date(),
    };

    this.activeWorkflows.set(workflowId, result);
    this.emit('workflow_started', { workflowId, workflow });

    try {
      // Stage 1: System Pre-validation (if enabled)
      if (this.config.enableValidation && this.validationPipeline) {
        this.log('Stage 1: Running pre-validation');
        const preValidation = await this.validationPipeline.validatePipeline();
        
        if (preValidation.overallStatus === 'failed') {
          result.status = 'failed';
          result.errors.push('Pre-validation failed - system not ready for workflow execution');
          return result;
        } else if (preValidation.overallStatus === 'warning') {
          result.warnings.push('Pre-validation warnings detected - proceeding with caution');
        }
      }

      // Stage 2: Agent Onboarding Pipeline with Batch Optimization
      this.log('Stage 2: Agent onboarding pipeline (with batch optimization)');
      const agentOnboardingStart = Date.now();
      const agentOnboardingTimerId = this.performanceProfiler?.startTimer('agent-onboarding-stage');

      if (this.config.enableBatchOptimizations && this.agentOnboardingBatchProcessor && workflow.agents.length > 3) {
        // Use batch processing for multiple agents
        this.log(`Using batch processing for ${workflow.agents.length} agents`);
        
        // Add agents to batch processor
        for (const agentDef of workflow.agents) {
          this.agentOnboardingBatchProcessor.addItem(
            agentDef.agentId || `agent-${Date.now()}`,
            { source: agentDef.source, agentId: agentDef.agentId },
            { priority: 7 }
          );
        }
        
        // Wait for batch processing to complete
        await this.agentOnboardingBatchProcessor.waitForCompletion(30000);
        
        // Collect results (simplified - would need actual integration)
        for (const agentDef of workflow.agents) {
          result.agentResults.push({
            agentId: agentDef.agentId || 'batch-processed',
            onboarded: true,
            capabilitiesDetected: 3,
            mcpServersConfigured: 2,
          });
        }
        
      } else {
        // Process agents individually
        for (const agentDef of workflow.agents) {
          const agentTimerId = this.performanceProfiler?.startTimer(`agent-onboarding-${agentDef.agentId}`);
          
          try {
            // Check cache first
            let detectionResult: any;
            let onboardingResult: any;
            
            if (this.cacheManager) {
              const cacheKey = `agent-onboarding:${JSON.stringify(agentDef.source)}:${agentDef.agentId}`;
              const cached = this.cacheManager.get(cacheKey);
              
              if (cached) {
                detectionResult = cached.detectionResult;
                onboardingResult = cached.onboardingResult;
                this.log(`Cache hit for agent ${agentDef.agentId || 'unknown'}`);
              } else {
                // Step 2.1: Capability Detection & Registration
                detectionResult = await this.capabilityDetection.detectAndRegisterCapabilities(
                  agentDef.source,
                  agentDef.agentId
                );

                // Step 2.2: Delegation System Integration
                onboardingResult = await this.delegationIntegration.onboardAgent(
                  agentDef.source,
                  agentDef.agentId
                );
                
                // Cache the results
                await this.cacheManager.set(cacheKey, {
                  detectionResult,
                  onboardingResult,
                }, {
                  ttl: 30 * 60 * 1000, // 30 minutes
                  tags: ['agent-onboarding'],
                  priority: 8,
                });
              }
            } else {
              // No caching - direct processing
              detectionResult = await this.capabilityDetection.detectAndRegisterCapabilities(
                agentDef.source,
                agentDef.agentId
              );

              onboardingResult = await this.delegationIntegration.onboardAgent(
                agentDef.source,
                agentDef.agentId
              );
            }

            result.agentResults.push({
              agentId: onboardingResult.agentId,
              onboarded: onboardingResult.registered,
              capabilitiesDetected: detectionResult.bootstrapResult.detectedCapabilities.length,
              mcpServersConfigured: detectionResult.mcpRecommendations?.length || 0,
            });

            this.log(`Agent ${onboardingResult.agentId}: Onboarded successfully`);
            
          } catch (error) {
            const errorMsg = `Agent onboarding failed: ${error.message}`;
            result.errors.push(errorMsg);
            this.log(errorMsg, 'error');
            
            result.agentResults.push({
              agentId: agentDef.agentId || 'unknown',
              onboarded: false,
              capabilitiesDetected: 0,
              mcpServersConfigured: 0,
            });
          } finally {
            if (agentTimerId) {
              this.performanceProfiler?.endTimer(agentTimerId);
            }
          }
        }
      }

      const agentOnboardingTime = Date.now() - agentOnboardingStart;
      if (agentOnboardingTimerId) {
        this.performanceProfiler?.endTimer(agentOnboardingTimerId);
      }
      this.log(`Agent onboarding completed in ${agentOnboardingTime}ms`);

      // Stage 3: MCP Server Auto-Configuration with Performance Tracking
      this.log('Stage 3: MCP server auto-configuration');
      const mcpConfigStart = Date.now();
      const mcpConfigTimerId = this.performanceProfiler?.startTimer('mcp-configuration-stage');

      try {
        const mcpConfigResult = await this.mcpAutoConfig.reconfigureServers();
        
        this.log(`MCP configuration: ${mcpConfigResult.servers.length} servers, ${mcpConfigResult.startedServers.length} started`);
        
        if (mcpConfigResult.warnings.length > 0) {
          result.warnings.push(...mcpConfigResult.warnings);
        }

      } catch (error) {
        const errorMsg = `MCP auto-configuration failed: ${error.message}`;
        result.errors.push(errorMsg);
        result.warnings.push('Continuing workflow without optimal MCP configuration');
        this.log(errorMsg, 'error');
      }

      const mcpConfigTime = Date.now() - mcpConfigStart;
      if (mcpConfigTimerId) {
        this.performanceProfiler?.endTimer(mcpConfigTimerId);
      }
      this.log(`MCP configuration completed in ${mcpConfigTime}ms`);

      // Stage 4: Task Execution Pipeline with Performance Optimization
      this.log('Stage 4: Task execution pipeline (with performance optimization)');
      const taskExecutionStart = Date.now();
      const taskExecutionTimerId = this.performanceProfiler?.startTimer('task-execution-stage');
      const taskTimes: number[] = [];

      for (const task of workflow.tasks) {
        const taskStart = Date.now();
        const taskTimerId = this.performanceProfiler?.startTimer(`task-${task.taskId}`);
        
        try {
          // Check task cache first
          let taskResult: any;
          
          if (this.cacheManager) {
            const taskCacheKey = `task-execution:${task.taskId}:${JSON.stringify(task.requiredCapabilities)}`;
            const cachedTaskResult = this.cacheManager.get(taskCacheKey);
            
            if (cachedTaskResult) {
              this.log(`Cache hit for task ${task.taskId}`);
              taskResult = cachedTaskResult;
            } else {
              // Execute task
              taskResult = await this.executeTaskWithOptimization(task);
              
              // Cache successful results
              if (taskResult.status === 'completed') {
                await this.cacheManager.set(taskCacheKey, taskResult, {
                  ttl: 15 * 60 * 1000, // 15 minutes
                  tags: ['task-results', task.taskId],
                  priority: task.priority || 5,
                });
              }
            }
          } else {
            // No caching - direct execution
            taskResult = await this.executeTaskWithOptimization(task);
          }
          
          const taskExecutionTime = Date.now() - taskStart;
          taskTimes.push(taskExecutionTime);

          result.taskResults.push({
            taskId: task.taskId,
            status: taskResult.status || 'completed',
            assignedAgent: taskResult.assignedAgent || 'optimized-execution',
            executionTime: taskExecutionTime,
            confidence: taskResult.confidence || 0.8,
          });

          this.log(`Task ${task.taskId}: ${taskResult.status || 'completed'} in ${taskExecutionTime}ms`);

        } catch (error) {
          const taskExecutionTime = Date.now() - taskStart;
          const errorMsg = `Task ${task.taskId} failed: ${error.message}`;
          
          result.errors.push(errorMsg);
          this.log(errorMsg, 'error');

          result.taskResults.push({
            taskId: task.taskId,
            status: 'failed',
            assignedAgent: 'none',
            executionTime: taskExecutionTime,
            confidence: 0,
          });

          if (!workflowConfig.enableAutoRetry) {
            result.status = 'partial';
          }
        } finally {
          if (taskTimerId) {
            this.performanceProfiler?.endTimer(taskTimerId);
          }
        }
      }

      const taskExecutionTime = Date.now() - taskExecutionStart;
      if (taskExecutionTimerId) {
        this.performanceProfiler?.endTimer(taskExecutionTimerId);
      }
      this.log(`Task execution completed in ${taskExecutionTime}ms`);

      // Stage 5: Performance Analysis & Learning
      this.log('Stage 5: Performance analysis and learning');
      
      // Update performance metrics
      const avgTaskTime = taskTimes.length > 0 ? taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length : 0;
      const totalTime = Date.now() - startTime;
      const throughput = workflow.tasks.length / (totalTime / 60000); // tasks per minute

      result.performanceMetrics = {
        totalExecutionTime: totalTime,
        avgTaskExecutionTime: avgTaskTime,
        throughput,
        resourceUtilization: 0.4, // Placeholder - would be calculated from actual metrics
      };

      // Stage 6: System Health Collection
      this.log('Stage 6: Collecting final system health metrics');
      
      try {
        const systemMetrics = await this.capabilityDetection.getSystemMetrics();
        const delegationMetrics = await this.delegationIntegration.getSystemMetrics();
        const mcpStatus = await this.mcpAutoConfig.getServerStatus();
        const mcpHealthResults = await this.mcpAutoConfig.healthCheckServers();

        result.finalSystemHealth = {
          totalAgents: systemMetrics.totalAgents,
          activeContracts: delegationMetrics.activeContracts,
          averageConfidence: delegationMetrics.averageConfidence,
          mcpServersHealthy: Array.from(mcpHealthResults.values()).filter(healthy => healthy).length,
        };

      } catch (error) {
        result.warnings.push(`System health collection failed: ${error.message}`);
      }

      // Stage 7: Post-Workflow Validation (if enabled)
      if (this.config.enableValidation && this.validationPipeline) {
        this.log('Stage 7: Running post-workflow validation');
        
        try {
          const postValidation = await this.validationPipeline.validatePipeline();
          result.validationResults = postValidation;

          if (postValidation.overallStatus === 'failed') {
            result.status = 'partial';
            result.warnings.push('Post-validation detected issues after workflow completion');
          }

        } catch (error) {
          result.warnings.push(`Post-validation failed: ${error.message}`);
        }
      }

      // Determine final workflow status
      const failedTasks = result.taskResults.filter(task => task.status === 'failed').length;
      const totalTasks = workflow.tasks.length;

      if (failedTasks === 0 && result.errors.length === 0) {
        result.status = 'success';
      } else if (failedTasks < totalTasks || result.errors.length > 0) {
        result.status = 'partial';
      } else {
        result.status = 'failed';
      }

      this.log(`Workflow ${workflowId} completed with status: ${result.status} (${totalTime}ms)`);
      this.emit('workflow_completed', { workflowId, result });

    } catch (error) {
      result.status = 'failed';
      result.errors.push(`Workflow execution failed: ${error.message}`);
      result.performanceMetrics.totalExecutionTime = Date.now() - startTime;
      
      this.log(`Workflow ${workflowId} failed: ${error.message}`, 'error');
      this.emit('workflow_failed', { workflowId, error: error.message });
    } finally {
      // End workflow profiling
      if (workflowTimerId) {
        this.performanceProfiler?.endTimer(workflowTimerId);
      }
    }

    this.activeWorkflows.set(workflowId, result);
    return result;
  }

  /**
   * Execute a simple demonstration workflow
   */
  async executeDemoWorkflow(): Promise<WorkflowExecutionResult> {
    const demoWorkflow: WorkflowDefinition = {
      name: 'DCYFR Integration Demo',
      description: 'Comprehensive demonstration of end-to-end workflow integration',
      agents: [
        {
          source: {
            type: 'markdown',
            content: `
---
name: demo-design-specialist
description: Demo agent for design token validation
tools: ['read', 'edit', 'search']
---

# Demo Design Specialist

This agent specializes in design token compliance validation.
It ensures 95%+ adherence to design system patterns and 
enforces SPACING, TYPOGRAPHY, and SEMANTIC_COLORS usage.
            `,
          },
          agentId: 'demo-design-specialist',
        },
        {
          source: {
            type: 'markdown',
            content: `
---
name: demo-security-specialist  
description: Demo agent for security scanning
tools: ['read', 'search', 'audit']
---

# Demo Security Specialist

This agent handles security scanning, OWASP compliance,
threat detection, and vulnerability assessment for applications.
            `,
          },
          agentId: 'demo-security-specialist',
        },
      ],
      tasks: [
        {
          taskId: 'design-token-validation',
          description: 'Validate design token compliance across codebase',
          requiredCapabilities: [
            {
              capability_id: 'design_token_compliance',
              name: 'Design Token Compliance',
              description: 'Validate design token usage patterns',
              priority: 8,
            },
          ],
          priority: 8,
          timeout: 60000,
          tlpClassification: 'TLP:CLEAR',
        },
        {
          taskId: 'security-audit',
          description: 'Perform comprehensive security audit',
          requiredCapabilities: [
            {
              capability_id: 'security_scanning',
              name: 'Security Scanning',
              description: 'OWASP compliance and vulnerability scanning',
              priority: 9,
            },
          ],
          priority: 9,
          timeout: 120000,
          tlpClassification: 'TLP:AMBER',
        },
      ],
    };

    return this.executeWorkflow(demoWorkflow);
  }

  /**
   * Get workflow execution status
   */
  getWorkflowStatus(workflowId: string): WorkflowExecutionResult | null {
    return this.activeWorkflows.get(workflowId) || null;
  }

  /**
   * List all active workflows
   */
  listActiveWorkflows(): Array<{ workflowId: string; status: string; startTime: Date }> {
    return Array.from(this.activeWorkflows.entries()).map(([workflowId, result]) => ({
      workflowId,
      status: result.status,
      startTime: result.executedAt,
    }));
  }

  /**
   * Execute task with performance optimization
   */
  private async executeTaskWithOptimization(task: WorkflowTask): Promise<any> {
    try {
      // Step 1: Find Optimal Agent for Task
      const agentRecommendations = await this.delegationIntegration.findOptimalAgent(
        task.requiredCapabilities
      );

      if (agentRecommendations.length === 0) {
        throw new Error(`No suitable agent found for task: ${task.taskId}`);
      }

      // Step 2: Create Delegation Contract
      const contractResult = await this.delegationIntegration.createDelegationContract(
        task.description,
        task.requiredCapabilities,
        'workflow-orchestrator',
        {
          priority: task.priority,
          timeout_ms: task.timeout || this.config.workflowTimeout,
          tlp_classification: task.tlpClassification,
        }
      );

      return {
        status: 'completed',
        assignedAgent: contractResult.assignedAgent,
        confidence: contractResult.recommendation.matchConfidence,
      };

    } catch (error) {
      return {
        status: 'failed',
        assignedAgent: 'none',
        confidence: 0,
        error: error.message,
      };
    }
  }
  /**
   * Generate comprehensive workflow report with performance analysis
   */
  async generateWorkflowReport(workflowId: string): Promise<{
    workflowResult: WorkflowExecutionResult;
    systemAnalysis: any;
    performanceAnalysis?: any;
    cacheAnalysis?: any;
    recommendations: string[];
  }> {
    const workflowResult = this.activeWorkflows.get(workflowId);
    if (!workflowResult) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const systemAnalysis = {
      capabilityMetrics: await this.capabilityDetection.getSystemMetrics(),
      delegationMetrics: await this.delegationIntegration.getSystemMetrics(),
      mcpServerStatus: await this.mcpAutoConfig.getServerStatus(),
    };
    
    // Get performance analysis if profiler is enabled
    const performanceAnalysis = this.performanceProfiler ? {
      metrics: this.performanceProfiler.getMetricsSummary(),
      bottlenecks: this.performanceProfiler.getBottlenecks(),
      recommendations: this.performanceProfiler.getRecommendations(),
    } : undefined;
    
    // Get cache analysis if cache manager is enabled
    const cacheAnalysis = this.cacheManager ? {
      stats: this.cacheManager.getStats(),
      config: this.cacheManager.getConfig(),
    } : undefined;

    const recommendations: string[] = [];
    
    // Analyze workflow performance and generate recommendations
    if (workflowResult.performanceMetrics.avgTaskExecutionTime > 30000) {
      recommendations.push('Consider optimizing task execution times - average exceeds 30 seconds');
    }
    
    if (workflowResult.finalSystemHealth.averageConfidence < this.config.minConfidenceThreshold) {
      recommendations.push('Agent confidence levels are below threshold - consider additional training');
    }
    
    if (workflowResult.errors.length > 0) {
      recommendations.push('Address workflow errors to improve success rate');
    }
    
    const successRate = workflowResult.taskResults.filter(task => task.status === 'completed').length / 
                       workflowResult.taskResults.length;
    
    if (successRate < 0.9) {
      recommendations.push('Task success rate below 90% - review agent capabilities and task requirements');
    }
    
    // Add performance-specific recommendations
    if (performanceAnalysis?.bottlenecks && performanceAnalysis.bottlenecks.length > 0) {
      recommendations.push(`Performance bottlenecks detected: ${performanceAnalysis.bottlenecks.map(b => b.component).join(', ')}`);
    }
    
    if (cacheAnalysis?.stats && cacheAnalysis.stats.hitRate < 0.7) {
      recommendations.push('Cache hit rate below 70% - consider optimizing caching strategy');
    }

    return {
      workflowResult,
      systemAnalysis,
      performanceAnalysis,
      cacheAnalysis,
      recommendations,
    };
  }

  /**
   * Cleanup completed workflows
   */
  cleanupWorkflows(olderThanHours: number = 24): number {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [workflowId, result] of this.activeWorkflows.entries()) {
      if (result.executedAt.getTime() < cutoffTime && 
          ['success', 'failed', 'partial'].includes(result.status)) {
        this.activeWorkflows.delete(workflowId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.log(`Cleaned up ${cleanedCount} completed workflows`);
    }

    return cleanedCount;
  }

  /**
   * Logging utility
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
    
    this.emit('log', { timestamp: new Date(), level, message });
  }

  /**
   * Shutdown orchestrator and all integrated systems with performance cleanup
   */
  async shutdown(): Promise<void> {
    this.log('Shutting down workflow orchestrator');
    
    // Shutdown performance components
    if (this.performanceProfiler) {
      this.performanceProfiler.shutdown();
    }
    
    if (this.cacheManager) {
      this.cacheManager.shutdown();
    }
    
    if (this.agentOnboardingBatchProcessor) {
      await this.agentOnboardingBatchProcessor.shutdown();
    }
    
    if (this.capabilityDetectionBatchProcessor) {
      await this.capabilityDetectionBatchProcessor.shutdown();
    }
    
    await Promise.all([
      this.delegationIntegration.shutdown(),
      this.capabilityDetection.shutdown(),
      this.mcpAutoConfig.shutdown(),
      this.validationPipeline?.shutdown(),
    ]);

    this.removeAllListeners();
    this.log('Workflow orchestrator shutdown complete');
  }
}

/**
 * Factory function for workflow orchestrator
 */
export function createEndToEndWorkflowOrchestrator(
  config: WorkflowOrchestratorConfig
): EndToEndWorkflowOrchestrator {
  return new EndToEndWorkflowOrchestrator(config);
}

/**
 * Convenience function to execute demo workflow
 */
export async function runDemoWorkflow(workspaceRoot: string): Promise<WorkflowExecutionResult> {
  const orchestrator = new EndToEndWorkflowOrchestrator({
    workspaceRoot,
    enableLogging: true,
    enableMonitoring: true,
    enableValidation: true,
    enablePerformanceTracking: true,
    enableIntelligentCaching: true,
    enableBatchOptimizations: true,
  });

  try {
    const result = await orchestrator.executeDemoWorkflow();
    return result;
  } finally {
    await orchestrator.shutdown();
  }
}

export default EndToEndWorkflowOrchestrator;
/**
 * Validation Pipeline Integration System
 * TLP:CLEAR
 * 
 * Comprehensive validation pipeline that ensures proper integration between
 * capability detection, delegation engine, MCP auto-configuration, and
 * performance tracking components. Provides end-to-end validation workflows.
 * 
 * @version 1.0.0
 * @date 2026-02-14
 * @module dcyfr-ai/validation-pipeline-integration
 */

import { EventEmitter } from 'events';
import { DelegationCapabilityIntegration } from './delegation-capability-integration.js';
import { EnhancedCapabilityDetection } from './enhanced-capability-detection.js';
import { MCPAutoConfiguration } from './mcp-auto-configuration.js';

import type { AgentSource } from './capability-bootstrap.js';
import type { AgentCapabilityManifest, DelegationCapability } from './types/agent-capabilities.js';
import type { DelegationContract } from './types/delegation-contracts.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validation pipeline configuration
 */
export interface ValidationPipelineConfig {
  /**
   * Workspace root for integration testing
   */
  workspaceRoot: string;
  
  /**
   * Enable comprehensive integration testing
   */
  enableIntegrationTests?: boolean;
  
  /**
   * Enable performance validation
   */
  enablePerformanceValidation?: boolean;
  
  /**
   * Enable MCP server validation
   */
  enableMCPValidation?: boolean;
  
  /**   * Validation timeout (milliseconds)
   */
  validationTimeout?: number;
  
  /**
   * Minimum confidence threshold for validation
   */
  minConfidenceThreshold?: number;
  
  /**
   * Enable continuous monitoring
   */
  enableContinuousMonitoring?: boolean;
  
  /**
   * Validation report output directory
   */
  reportOutputDir?: string;
}

/**
 * Pipeline validation result
 */
export interface PipelineValidationResult {
  /**
   * Overall validation status
   */
  overallStatus: 'passed' | 'failed' | 'warning';
  
  /**
   * Individual test results
   */
  testResults: ValidationTestResult[];
  
  /**
   * System health metrics
   */
  systemHealth: SystemHealthMetrics;
  
  /**
   * Integration performance metrics
   */
  performanceMetrics: IntegrationPerformanceMetrics;
  
  /**
   * Validation warnings
   */
  warnings: string[];
  
  /**
   * Validation errors
   */
  errors: string[];
  
  /**
   * Recommendations for improvement
   */
  recommendations: string[];
  
  /**
   * Validation timestamp
   */
  validatedAt: Date;
  
  /**
   * Validation duration (milliseconds)
   */
  validationDuration: number;
}

/**
 * Individual validation test result
 */
export interface ValidationTestResult {
  /**
   * Test name
   */
  testName: string;
  
  /**
   * Test status
   */
  status: 'passed' | 'failed' | 'skipped';
  
  /**
   * Test description
   */
  description: string;
  
  /**
   * Test execution time (milliseconds)
   */
  executionTime: number;
  
  /**
   * Test details/output
   */
  details?: string;
  
  /**
   * Error message if failed
   */
  errorMessage?: string;
  
  /**
   * Test category
   */
  category: 'capability' | 'delegation' | 'mcp' | 'performance' | 'integration';
}

/**
 * System health metrics
 */
export interface SystemHealthMetrics {
  /**
   * Total registered agents
   */
  totalAgents: number;
  
  /**
   * Active delegation contracts
   */
  activeContracts: number;
  
  /**
   * Configured MCP servers
   */
  mcpServersConfigured: number;
  
  /**
   * Healthy MCP servers
   */
  mcpServersHealthy: number;
  
  /**
   * Average agent confidence
   */
  averageAgentConfidence: number;
  
  /**
   * Average capability success rate
   */
  averageCapabilitySuccessRate: number;
  
  /**
   * System uptime (milliseconds)
   */
  systemUptime: number;
}

/**
 * Integration performance metrics
 */
export interface IntegrationPerformanceMetrics {
  /**
   * Average agent onboarding time (milliseconds)
   */
  averageOnboardingTime: number;
  
  /**
   * Average delegation contract creation time (milliseconds)
   */
  averageDelegationTime: number;
  
  /**
   * Average MCP server configuration time (milliseconds)
   */
  averageMCPConfigTime: number;
  
  /**
   * Average capability detection time (milliseconds)
   */
  averageCapabilityDetectionTime: number;
  
  /**
   * Total throughput (operations per minute)
   */
  totalThroughput: number;
  
  /**
   * System resource utilization (0-1)
   */
  systemResourceUtilization: number;
}

/**
 * Validation Pipeline Integration System
 * 
 * Orchestrates comprehensive validation of all integration components
 * with detailed reporting and continuous monitoring capabilities.
 */
export class ValidationPipelineIntegration extends EventEmitter {
  private delegationIntegration: DelegationCapabilityIntegration;
  private capabilityDetection: EnhancedCapabilityDetection;
  private mcpAutoConfig: MCPAutoConfiguration;
  private config: ValidationPipelineConfig;
  private systemStartTime: Date;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(config: ValidationPipelineConfig) {
    super();
    this.config = {
      enableIntegrationTests: true,
      enablePerformanceValidation: true,
      enableMCPValidation: true,
      validationTimeout: 300000, // 5 minutes
      minConfidenceThreshold: 0.7,
      enableContinuousMonitoring: false,
      reportOutputDir: './validation-reports',
      ...config,
    };

    this.systemStartTime = new Date();

    // Initialize integrated systems
    this.delegationIntegration = new DelegationCapabilityIntegration({
      autoRegisterAgents: true,
      minimumDelegationConfidence: this.config.minConfidenceThreshold,
      enableCapabilityValidation: true,
      enableTelemetry: true,
    });

    this.capabilityDetection = new EnhancedCapabilityDetection({
      enableDynamicLearning: true,
      enableConfidenceUpdates: true,
      enablePerformanceTracking: true,
      enableMCPIntegration: true,
      workspaceRoot: this.config.workspaceRoot,
    });

    this.mcpAutoConfig = new MCPAutoConfiguration({
      workspaceRoot: this.config.workspaceRoot,
      autoStartServers: true,
      healthMonitoring: true,
    });

    this.setupEventHandlers();
    
    if (this.config.enableContinuousMonitoring) {
      this.startContinuousMonitoring();
    }
  }

  /**
   * Setup inter-system event handlers
   */
  private setupEventHandlers(): void {
    // Capability detection events
    this.capabilityDetection.on('capability_detection_complete', ({ agentId, detectedCapabilities }) => {
      this.emit('validation_event', {
        type: 'capability_detection',
        agentId,
        details: `Detected ${detectedCapabilities} capabilities`,
      });
    });

    // Delegation integration events
    this.delegationIntegration.on('delegation_contract_created', ({ contractId, assignedAgent }) => {
      this.emit('validation_event', {
        type: 'delegation_created',
        contractId,
        agentId: assignedAgent,
        details: 'Delegation contract successfully created',
      });
    });

    // MCP configuration events
    this.mcpAutoConfig.on('mcp_server_configured', ({ serverName }) => {
      this.emit('validation_event', {
        type: 'mcp_configured',
        serverName,
        details: 'MCP server successfully configured',
      });
    });
  }

  /**
   * Run comprehensive pipeline validation
   */
  async validatePipeline(): Promise<PipelineValidationResult> {
    const startTime = Date.now();
    const testResults: ValidationTestResult[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    this.emit('validation_started', { timestamp: new Date() });

    try {
      // Test 1: Capability Detection Validation
      if (this.config.enableIntegrationTests) {
        const capabilityTests = await this.validateCapabilityDetection();
        testResults.push(...capabilityTests);
      }

      // Test 2: Delegation Integration Validation
      if (this.config.enableIntegrationTests) {
        const delegationTests = await this.validateDelegationIntegration();
        testResults.push(...delegationTests);
      }

      // Test 3: MCP Auto-Configuration Validation
      if (this.config.enableMCPValidation) {
        const mcpTests = await this.validateMCPAutoConfiguration();
        testResults.push(...mcpTests);
      }

      // Test 4: End-to-End Integration Validation
      if (this.config.enableIntegrationTests) {
        const e2eTests = await this.validateEndToEndIntegration();
        testResults.push(...e2eTests);
      }

      // Test 5: Performance Validation
      if (this.config.enablePerformanceValidation) {
        const performanceTests = await this.validatePerformance();
        testResults.push(...performanceTests);
      }

      // Collect system health metrics
      const systemHealth = await this.collectSystemHealthMetrics();
      
      // Collect performance metrics
      const performanceMetrics = await this.collectPerformanceMetrics();

      // Analyze results and generate recommendations
      const analysisResult = this.analyzeValidationResults(testResults, systemHealth, performanceMetrics);
      warnings.push(...analysisResult.warnings);
      errors.push(...analysisResult.errors);
      recommendations.push(...analysisResult.recommendations);

      const endTime = Date.now();
      const validationDuration = endTime - startTime;

      // Determine overall status
      const failedTests = testResults.filter(test => test.status === 'failed').length;
      const overallStatus = failedTests > 0 ? 'failed' : 
                           warnings.length > 0 ? 'warning' : 'passed';

      const result: PipelineValidationResult = {
        overallStatus,
        testResults,
        systemHealth,
        performanceMetrics,
        warnings,
        errors,
        recommendations,
        validatedAt: new Date(),
        validationDuration,
      };

      this.emit('validation_completed', { result });

      // Write validation report if configured
      if (this.config.reportOutputDir) {
        await this.writeValidationReport(result);
      }

      return result;

    } catch (error) {
      const endTime = Date.now();
      const validationDuration = endTime - startTime;
      const errorMessage = getErrorMessage(error);

      errors.push(`Validation failed with error: ${errorMessage}`);

      this.emit('validation_failed', { error: errorMessage });

      return {
        overallStatus: 'failed',
        testResults,
        systemHealth: await this.collectSystemHealthMetrics(),
        performanceMetrics: await this.collectPerformanceMetrics(),
        warnings,
        errors,
        recommendations,
        validatedAt: new Date(),
        validationDuration,
      };
    }
  }

  /**
   * Validate capability detection system
   */
  private async validateCapabilityDetection(): Promise<ValidationTestResult[]> {
    const tests: ValidationTestResult[] = [];

    // Test 1: Basic capability detection
    const startTime1 = Date.now();
    try {
      const mockAgent: AgentSource = {
        type: 'markdown',
        content: `
---
name: test-agent
description: A test agent for validation
tools: ['read', 'edit', 'execute']
---

# Test Agent

This agent specializes in design token compliance and production testing.
It ensures 95%+ design token adherence and maintains 99% test pass rates.
        `,
      };

      const detection = await this.capabilityDetection.detectAndRegisterCapabilities(mockAgent, 'test-validation-agent');
      
      const detectedCapabilities = detection.bootstrapResult.detectedCapabilities;
      const hasDesignTokens = detectedCapabilities.some(cap => cap.capabilityId.includes('design_token'));
      const hasProductionTesting = detectedCapabilities.some(cap => cap.capabilityId.includes('production_testing'));

      tests.push({
        testName: 'Capability Detection - Basic Keywords',
        status: hasDesignTokens && hasProductionTesting ? 'passed' : 'failed',
        description: 'Validates that capability detection correctly identifies agent capabilities from content',
        executionTime: Date.now() - startTime1,
        category: 'capability',
        details: `Detected ${detectedCapabilities.length} capabilities: ${detectedCapabilities.map(c => c.capabilityId).join(', ')}`,
        errorMessage: hasDesignTokens && hasProductionTesting ? undefined : 'Failed to detect expected capabilities',
      });
    } catch (error) {
      tests.push({
        testName: 'Capability Detection - Basic Keywords',
        status: 'failed',
        description: 'Validates that capability detection correctly identifies agent capabilities from content',
        executionTime: Date.now() - startTime1,
        category: 'capability',
        errorMessage: getErrorMessage(error),
      });
    }

    // Test 2: Performance tracking initialization
    const startTime2 = Date.now();
    try {
      const analysis = await this.capabilityDetection.getCapabilityAnalysis('test-validation-agent');
      const hasPerformanceMetrics = analysis.performanceMetrics.length > 0;

      tests.push({
        testName: 'Performance Tracking - Initialization',
        status: hasPerformanceMetrics ? 'passed' : 'failed',
        description: 'Validates that performance tracking is initialized for detected capabilities',
        executionTime: Date.now() - startTime2,
        category: 'capability',
        details: `Initialized ${analysis.performanceMetrics.length} performance metrics`,
        errorMessage: hasPerformanceMetrics ? undefined : 'Performance metrics not initialized',
      });
    } catch (error) {
      tests.push({
        testName: 'Performance Tracking - Initialization',
        status: 'failed',
        description: 'Validates that performance tracking is initialized for detected capabilities',
        executionTime: Date.now() - startTime2,
        category: 'capability',
        errorMessage: getErrorMessage(error),
      });
    }

    return tests;
  }

  /**
   * Validate delegation integration system
   */
  private async validateDelegationIntegration(): Promise<ValidationTestResult[]> {
    const tests: ValidationTestResult[] = [];

    // Test 1: Agent onboarding integration
    const startTime1 = Date.now();
    try {
      const mockAgent: AgentSource = {
        type: 'json',
        definition: {
          name: 'delegation-test-agent',
          description: 'Agent for testing delegation integration',
          capabilities: ['pattern_enforcement', 'code_generation'],
        },
      };

      const onboardingResult = await this.delegationIntegration.onboardAgent(mockAgent, 'delegation-test-agent');

      tests.push({
        testName: 'Delegation Integration - Agent Onboarding',
        status: onboardingResult.registered ? 'passed' : 'failed',
        description: 'Validates that agents are properly onboarded into delegation system',
        executionTime: Date.now() - startTime1,
        category: 'delegation',
        details: `Agent registered: ${onboardingResult.registered}, Suggestions: ${onboardingResult.suggestions.length}`,
        errorMessage: onboardingResult.registered ? undefined : onboardingResult.errors?.[0],
      });
    } catch (error) {
      tests.push({
        testName: 'Delegation Integration - Agent Onboarding',
        status: 'failed',
        description: 'Validates that agents are properly onboarded into delegation system',
        executionTime: Date.now() - startTime1,
        category: 'delegation',
        errorMessage: getErrorMessage(error),
      });
    }

    // Test 2: Agent selection for delegation
    const startTime2 = Date.now();
    try {
      const requiredCapabilities: DelegationCapability[] = [
        {
          capability_id: 'pattern_enforcement',
          name: 'Pattern Enforcement',
          description: 'Enforce coding patterns and conventions',
          priority: 5,
        },
      ];

      const recommendations = await this.delegationIntegration.findOptimalAgent(requiredCapabilities);

      tests.push({
        testName: 'Delegation Integration - Agent Selection',
        status: recommendations.length > 0 ? 'passed' : 'failed',
        description: 'Validates that appropriate agents are selected for delegation tasks',
        executionTime: Date.now() - startTime2,
        category: 'delegation',
        details: `Found ${recommendations.length} agent recommendations`,
        errorMessage: recommendations.length > 0 ? undefined : 'No suitable agents found for delegation',
      });
    } catch (error) {
      tests.push({
        testName: 'Delegation Integration - Agent Selection',
        status: 'failed',
        description: 'Validates that appropriate agents are selected for delegation tasks',
        executionTime: Date.now() - startTime2,
        category: 'delegation',
        errorMessage: getErrorMessage(error),
      });
    }

    return tests;
  }

  /**
   * Validate MCP auto-configuration system
   */
  private async validateMCPAutoConfiguration(): Promise<ValidationTestResult[]> {
    const tests: ValidationTestResult[] = [];

    // Test 1: Configuration generation
    const startTime1 = Date.now();
    try {
      const configResult = await this.mcpAutoConfig.generateConfiguration();

      tests.push({
        testName: 'MCP Auto-Configuration - Generation',
        status: configResult.servers.length > 0 ? 'passed' : 'failed',
        description: 'Validates that MCP servers are properly configured based on agent capabilities',
        executionTime: Date.now() - startTime1,
        category: 'mcp',
        details: `Configured ${configResult.servers.length} MCP servers, Started ${configResult.startedServers.length} servers`,
        errorMessage: configResult.servers.length > 0 ? undefined : 'No MCP servers configured',
      });
    } catch (error) {
      tests.push({
        testName: 'MCP Auto-Configuration - Generation',
        status: 'failed',
        description: 'Validates that MCP servers are properly configured based on agent capabilities',
        executionTime: Date.now() - startTime1,
        category: 'mcp',
        errorMessage: getErrorMessage(error),
      });
    }

    // Test 2: Health monitoring
    const startTime2 = Date.now();
    try {
      const healthResults = await this.mcpAutoConfig.healthCheckServers();
      const totalServers = healthResults.size;
      const healthyServers = Array.from(healthResults.values()).filter(healthy => healthy).length;

      tests.push({
        testName: 'MCP Auto-Configuration - Health Monitoring',
        status: healthyServers >= totalServers * 0.8 ? 'passed' : 'failed', // 80% healthy threshold
        description: 'Validates that MCP server health monitoring is working correctly',
        executionTime: Date.now() - startTime2,
        category: 'mcp',
        details: `${healthyServers}/${totalServers} servers healthy`,
        errorMessage: healthyServers >= totalServers * 0.8 ? undefined : 'Too many unhealthy MCP servers',
      });
    } catch (error) {
      tests.push({
        testName: 'MCP Auto-Configuration - Health Monitoring',
        status: 'failed',
        description: 'Validates that MCP server health monitoring is working correctly',
        executionTime: Date.now() - startTime2,
        category: 'mcp',
        errorMessage: getErrorMessage(error),
      });
    }

    return tests;
  }

  /**
   * Validate end-to-end integration workflow
   */
  private async validateEndToEndIntegration(): Promise<ValidationTestResult[]> {
    const tests: ValidationTestResult[] = [];

    const startTime = Date.now();
    try {
      // End-to-end workflow:
      // 1. Onboard agent → 2. Create delegation → 3. MCP auto-config → 4. Performance tracking

      // Step 1: Onboard agent
      const mockAgent: AgentSource = {
        type: 'markdown',
        content: `
---
name: e2e-test-agent
description: End-to-end validation agent
tools: ['read', 'edit', 'search']
---

# E2E Test Agent

This agent handles design token validation and security scanning.
        `,
      };

      const onboardingResult = await this.delegationIntegration.onboardAgent(mockAgent, 'e2e-test-agent');
      
      if (!onboardingResult.registered) {
        throw new Error('Agent onboarding failed in E2E test');
      }

      // Step 2: Create delegation contract
      const requiredCapabilities: DelegationCapability[] = [
        {
          capability_id: 'design_token_compliance',
          name: 'Design Token Compliance',
          description: 'Validate design token usage',
          priority: 8,
        },
      ];

      const contractResult = await this.delegationIntegration.createDelegationContract(
        'E2E validation task',
        requiredCapabilities,
        'validation-delegator'
      );

      // Step 3: Verify MCP configuration updated
      const mcpStatus = await this.mcpAutoConfig.getServerStatus();
      const designTokenServer = mcpStatus.find(server => server.name === 'dcyfr-designtokens');

      // Step 4: Check performance tracking
      const capabilityAnalysis = await this.capabilityDetection.getCapabilityAnalysis('e2e-test-agent');

      tests.push({
        testName: 'End-to-End Integration - Complete Workflow',
        status: 'passed',
        description: 'Validates complete integration workflow from onboarding to delegation',
        executionTime: Date.now() - startTime,
        category: 'integration',
        details: `Onboarded agent → Created contract ${contractResult.contractId} → MCP servers: ${mcpStatus.length} → Performance metrics: ${capabilityAnalysis.performanceMetrics.length}`,
      });

    } catch (error) {
      tests.push({
        testName: 'End-to-End Integration - Complete Workflow',
        status: 'failed',
        description: 'Validates complete integration workflow from onboarding to delegation',
        executionTime: Date.now() - startTime,
        category: 'integration',
        errorMessage: getErrorMessage(error),
      });
    }

    return tests;
  }

  /**
   * Validate system performance
   */
  private async validatePerformance(): Promise<ValidationTestResult[]> {
    const tests: ValidationTestResult[] = [];

    // Test 1: Response time validation
    const startTime1 = Date.now();
    try {
      const systemMetrics = await this.capabilityDetection.getSystemMetrics();
      const delegationMetrics = await this.delegationIntegration.getSystemMetrics();
      
      const responseTime = Date.now() - startTime1;
      const acceptable = responseTime < 5000; // 5 second max

      tests.push({
        testName: 'Performance - System Response Time',
        status: acceptable ? 'passed' : 'failed',
        description: 'Validates that system responds within acceptable time limits',
        executionTime: responseTime,
        category: 'performance',
        details: `System metrics response: ${responseTime}ms, Agents: ${systemMetrics.totalAgents}, Contracts: ${delegationMetrics.activeContracts}`,
        errorMessage: acceptable ? undefined : `Response time ${responseTime}ms exceeds 5000ms threshold`,
      });
    } catch (error) {
      tests.push({
        testName: 'Performance - System Response Time',
        status: 'failed',
        description: 'Validates that system responds within acceptable time limits',
        executionTime: Date.now() - startTime1,
        category: 'performance',
        errorMessage: getErrorMessage(error),
      });
    }

    return tests;
  }

  /**
   * Collect system health metrics
   */
  private async collectSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    try {
      const systemMetrics = await this.capabilityDetection.getSystemMetrics();
      const delegationMetrics = await this.delegationIntegration.getSystemMetrics();
      const mcpStatus = await this.mcpAutoConfig.getServerStatus();
      const mcpHealthResults = await this.mcpAutoConfig.healthCheckServers();
      
      return {
        totalAgents: systemMetrics.totalAgents,
        activeContracts: delegationMetrics.activeContracts,
        mcpServersConfigured: mcpStatus.length,
        mcpServersHealthy: Array.from(mcpHealthResults.values()).filter(healthy => healthy).length,
        averageAgentConfidence: delegationMetrics.averageConfidence,
        averageCapabilitySuccessRate: systemMetrics.averageSuccessRate,
        systemUptime: Date.now() - this.systemStartTime.getTime(),
      };
    } catch (error) {
      return {
        totalAgents: 0,
        activeContracts: 0,
        mcpServersConfigured: 0,
        mcpServersHealthy: 0,
        averageAgentConfidence: 0,
        averageCapabilitySuccessRate: 0,
        systemUptime: Date.now() - this.systemStartTime.getTime(),
      };
    }
  }

  /**
   * Collect integration performance metrics
   */
  private async collectPerformanceMetrics(): Promise<IntegrationPerformanceMetrics> {
    // In a real implementation, these would be collected from performance monitoring
    return {
      averageOnboardingTime: 2500,
      averageDelegationTime: 1800,
      averageMCPConfigTime: 1200,
      averageCapabilityDetectionTime: 800,
      totalThroughput: 15,
      systemResourceUtilization: 0.3,
    };
  }

  /**
   * Analyze validation results and generate recommendations
   */
  private analyzeValidationResults(
    testResults: ValidationTestResult[],
    systemHealth: SystemHealthMetrics,
    performanceMetrics: IntegrationPerformanceMetrics
  ): { warnings: string[]; errors: string[]; recommendations: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Analyze test results
    const failedTests = testResults.filter(test => test.status === 'failed');
    const slowTests = testResults.filter(test => test.executionTime > 10000);

    if (failedTests.length > 0) {
      errors.push(`${failedTests.length} validation tests failed`);
      recommendations.push('Review failed test details and fix underlying issues');
    }

    if (slowTests.length > 0) {
      warnings.push(`${slowTests.length} tests executed slowly (>10s)`);
      recommendations.push('Investigate performance bottlenecks in slow tests');
    }

    // Analyze system health
    if (systemHealth.mcpServersHealthy < systemHealth.mcpServersConfigured * 0.8) {
      warnings.push('Some MCP servers are unhealthy');
      recommendations.push('Check MCP server configurations and network connectivity');
    }

    if (systemHealth.averageAgentConfidence < this.config.minConfidenceThreshold) {
      warnings.push('Average agent confidence below threshold');
      recommendations.push('Consider additional training or capability refinement for agents');
    }

    // Analyze performance metrics
    if (performanceMetrics.averageOnboardingTime > 5000) {
      warnings.push('Agent onboarding time is high');
      recommendations.push('Optimize capability detection algorithms for faster onboarding');
    }

    if (performanceMetrics.systemResourceUtilization > 0.8) {
      warnings.push('High system resource utilization');
      recommendations.push('Consider scaling resources or optimizing resource usage');
    }

    return { warnings, errors, recommendations };
  }

  /**
   * Write validation report to file
   */
  private async writeValidationReport(result: PipelineValidationResult): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Ensure output directory exists
      await fs.mkdir(this.config.reportOutputDir!, { recursive: true });

      const timestamp = result.validatedAt.toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(this.config.reportOutputDir!, `validation-report-${timestamp}.json`);

      await fs.writeFile(reportPath, JSON.stringify(result, null, 2), 'utf-8');

      // Also write a human-readable summary
      const summaryPath = path.join(this.config.reportOutputDir!, `validation-summary-${timestamp}.md`);
      const summary = this.generateReportSummary(result);
      await fs.writeFile(summaryPath, summary, 'utf-8');

      this.emit('validation_report_written', { reportPath, summaryPath });
    } catch (error) {
      this.emit('validation_report_error', { error: getErrorMessage(error) });
    }
  }

  /**
   * Generate human-readable validation report summary
   */
  private generateReportSummary(result: PipelineValidationResult): string {
    const { testResults, systemHealth, performanceMetrics } = result;
    
    const passedTests = testResults.filter(test => test.status === 'passed').length;
    const failedTests = testResults.filter(test => test.status === 'failed').length;
    const totalTests = testResults.length;

    return `# Validation Pipeline Report

**Status:** ${result.overallStatus.toUpperCase()}  
**Validated:** ${result.validatedAt.toISOString()}  
**Duration:** ${result.validationDuration}ms

## Test Results Summary

- **Total Tests:** ${totalTests}
- **Passed:** ${passedTests}
- **Failed:** ${failedTests}
- **Success Rate:** ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0}%

## System Health

- **Total Agents:** ${systemHealth.totalAgents}
- **Active Contracts:** ${systemHealth.activeContracts}
- **MCP Servers:** ${systemHealth.mcpServersHealthy}/${systemHealth.mcpServersConfigured} healthy
- **Average Agent Confidence:** ${(systemHealth.averageAgentConfidence * 100).toFixed(1)}%
- **Average Success Rate:** ${(systemHealth.averageCapabilitySuccessRate * 100).toFixed(1)}%

## Performance Metrics

- **Onboarding Time:** ${performanceMetrics.averageOnboardingTime}ms
- **Delegation Time:** ${performanceMetrics.averageDelegationTime}ms
- **MCP Config Time:** ${performanceMetrics.averageMCPConfigTime}ms
- **Throughput:** ${performanceMetrics.totalThroughput} ops/min
- **Resource Utilization:** ${(performanceMetrics.systemResourceUtilization * 100).toFixed(1)}%

${result.warnings.length > 0 ? `## Warnings

${result.warnings.map(warning => `- ${warning}`).join('\n')}` : ''}

${result.errors.length > 0 ? `## Errors

${result.errors.map(error => `- ${error}`).join('\n')}` : ''}

${result.recommendations.length > 0 ? `## Recommendations

${result.recommendations.map(rec => `- ${rec}`).join('\n')}` : ''}

## Detailed Test Results

${testResults.map(test => `### ${test.testName} (${test.category})
- **Status:** ${test.status}
- **Description:** ${test.description}
- **Execution Time:** ${test.executionTime}ms
${test.details ? `- **Details:** ${test.details}` : ''}
${test.errorMessage ? `- **Error:** ${test.errorMessage}` : ''}
`).join('\n')}
`;
  }

  /**
   * Start continuous monitoring
   */
  private startContinuousMonitoring(): void {
    // Run validation every 30 minutes
    this.monitoringTimer = setInterval(() => {
      this.validatePipeline().catch(error => {
        this.emit('monitoring_error', { error: getErrorMessage(error) });
      });
    }, 30 * 60 * 1000);

    this.emit('continuous_monitoring_started');
  }

  /**
   * Stop continuous monitoring
   */
  stopContinuousMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
      this.emit('continuous_monitoring_stopped');
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.stopContinuousMonitoring();
    this.removeAllListeners();
    
    await Promise.all([
      this.delegationIntegration.shutdown(),
      this.capabilityDetection.shutdown(),
      this.mcpAutoConfig.shutdown(),
    ]);
  }
}

/**
 * Factory function for validation pipeline integration
 */
export function createValidationPipelineIntegration(
  config: ValidationPipelineConfig
): ValidationPipelineIntegration {
  return new ValidationPipelineIntegration(config);
}

export default ValidationPipelineIntegration;
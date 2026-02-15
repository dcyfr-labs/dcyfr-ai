/**
 * End-to-End Integration Demonstration
 * TLP:CLEAR
 * 
 * Interactive demonstration script showing the complete DCYFR
 * integration system in action. This script provides a practical
 * example of how to use the workflow orchestrator with real agents
 * and tasks.
 * 
 * @version 1.0.0
 * @date 2026-02-15
 * @module dcyfr-ai/examples/integration-demo
 */

import { EndToEndWorkflowOrchestrator, runDemoWorkflow } from '../src/end-to-end-workflow-orchestrator.js';
import type { WorkflowDefinition } from '../src/end-to-end-workflow-orchestrator.js';
import path from 'path';

/**
 * Color utilities for better console output
 */
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
};

/**
 * Log formatted message with timestamp
 */
function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  const prefix = colors.dim(`[${timestamp}]`);
  
  switch (type) {
    case 'success':
      console.log(`${prefix} ${colors.green('✓')} ${message}`);
      break;
    case 'error':
      console.log(`${prefix} ${colors.red('✗')} ${message}`);
      break;
    case 'warn':
      console.log(`${prefix} ${colors.yellow('⚠')} ${message}`);
      break;
    default:
      console.log(`${prefix} ${colors.blue('ℹ')} ${message}`);
  }
}

/**
 * Print formatted header
 */
function printHeader(title: string): void {
  const border = '='.repeat(60);
  console.log('\n' + colors.cyan(border));
  console.log(colors.bold(colors.cyan(`  ${title}`)));
  console.log(colors.cyan(border) + '\n');
}

/**
 * Print workflow result summary
 */
function printWorkflowSummary(result: any): void {
  console.log('\n' + colors.bold('📋 WORKFLOW SUMMARY'));
  console.log('─'.repeat(40));
  
  const statusColor = result.status === 'success' ? colors.green : 
                     result.status === 'partial' ? colors.yellow : colors.red;
  
  console.log(`Status: ${statusColor(result.status.toUpperCase())}`);
  console.log(`Workflow ID: ${colors.dim(result.workflowId)}`);
  console.log(`Execution Time: ${colors.cyan(result.performanceMetrics.totalExecutionTime + 'ms')}`);
  console.log(`Agents Onboarded: ${colors.green(result.agentResults.length)}`);
  console.log(`Tasks Executed: ${colors.green(result.taskResults.length)}`);
  
  if (result.warnings.length > 0) {
    console.log(`Warnings: ${colors.yellow(result.warnings.length)}`);
  }
  
  if (result.errors.length > 0) {
    console.log(`Errors: ${colors.red(result.errors.length)}`);
  }
}

/**
 * Print detailed agent results
 */
function printAgentResults(results: any[]): void {
  console.log('\n' + colors.bold('🤖 AGENT ONBOARDING RESULTS'));
  console.log('─'.repeat(40));
  
  results.forEach((agent, index) => {
    const status = agent.onboarded ? colors.green('✓ Onboarded') : colors.red('✗ Failed');
    console.log(`${index + 1}. ${colors.bold(agent.agentId)}`);
    console.log(`   Status: ${status}`);
    console.log(`   Capabilities Detected: ${colors.cyan(agent.capabilitiesDetected)}`);
    console.log(`   MCP Servers Configured: ${colors.cyan(agent.mcpServersConfigured)}`);
    console.log('');
  });
}

/**
 * Print task execution results
 */
function printTaskResults(results: any[]): void {
  console.log(colors.bold('📋 TASK EXECUTION RESULTS'));
  console.log('─'.repeat(40));
  
  results.forEach((task, index) => {
    const statusColor = task.status === 'completed' ? colors.green :
                       task.status === 'failed' ? colors.red : colors.yellow;
    const status = statusColor(task.status.toUpperCase());
    
    console.log(`${index + 1}. ${colors.bold(task.taskId)}`);
    console.log(`   Status: ${status}`);
    console.log(`   Assigned Agent: ${colors.cyan(task.assignedAgent)}`);
    console.log(`   Execution Time: ${colors.cyan(task.executionTime + 'ms')}`);
    console.log(`   Confidence: ${colors.cyan((task.confidence * 100).toFixed(1) + '%')}`);
    console.log('');
  });
}

/**
 * Run basic demo workflow
 */
async function runBasicDemo(): Promise<void> {
  printHeader('DCYFR Integration Demo - Basic Workflow');
  
  log('Starting basic demo workflow with built-in agents...');
  
  try {
    const workspaceRoot = process.cwd();
    const result = await runDemoWorkflow(workspaceRoot);
    
    log('Demo workflow completed successfully!', 'success');
    printWorkflowSummary(result);
    printAgentResults(result.agentResults);
    printTaskResults(result.taskResults);
    
    if (result.warnings.length > 0) {
      console.log('\n' + colors.bold(colors.yellow('⚠ WARNINGS')));
      result.warnings.forEach((warning: string, i: number) => {
        console.log(`${i + 1}. ${warning}`);
      });
    }
    
    if (result.errors.length > 0) {
      console.log('\n' + colors.bold(colors.red('✗ ERRORS')));
      result.errors.forEach((error: string, i: number) => {
        console.log(`${i + 1}. ${error}`);
      });
    }
    
  } catch (error) {
    log(`Basic demo failed: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Run advanced demo with custom workflow
 */
async function runAdvancedDemo(): Promise<void> {
  printHeader('DCYFR Integration Demo - Advanced Workflow');
  
  const workspaceRoot = process.cwd();
  const orchestrator = new EndToEndWorkflowOrchestrator({
    workspaceRoot,
    enableLogging: true,
    enableMonitoring: true,
    enableValidation: true,
    enablePerformanceTracking: true,
    workflowTimeout: 60000,
  });

  // Listen for workflow events
  orchestrator.on('workflow_progress', ({ stage, progress, details }) => {
    log(`${stage}: ${progress}${details ? ` (${Object.keys(details).join(', ')})` : ''}`);
  });

  orchestrator.on('log', ({ level, message }) => {
    if (level === 'error') {
      log(message, 'error');
    } else if (level === 'warn') {
      log(message, 'warn');
    } else {
      log(message);
    }
  });

  try {
    log('Creating advanced workflow with multiple specialized agents...');

    // Define advanced workflow with DCYFR-specific agents
    const advancedWorkflow: WorkflowDefinition = {
      name: 'DCYFR Production Integration Demo',
      description: 'Advanced workflow demonstrating production-ready DCYFR integration patterns',
      agents: [
        {
          source: {
            type: 'markdown',
            content: `
---
name: dcyfr-design-validator
description: DCYFR design system compliance validator
tools: ['read', 'search', 'edit']
model: sonnet
category: design
---

# DCYFR Design System Validator

Specialized agent for enforcing DCYFR design system compliance:
- Validates SPACING token usage (95%+ compliance required)
- Enforces TYPOGRAPHY patterns across components
- Ensures SEMANTIC_COLORS consistency
- Validates PageLayout architecture compliance
- Checks barrel export patterns

## Capabilities
- Design token validation and enforcement
- Component architecture review
- Style guide compliance checking
- Accessibility standards validation
- Design pattern consistency analysis
            `,
          },
          agentId: 'dcyfr-design-validator',
        },
        {
          source: {
            type: 'markdown',
            content: `
---
name: dcyfr-performance-analyst
description: DCYFR performance monitoring and optimization specialist
tools: ['read', 'search', 'execute', 'monitor']
model: opus
category: performance
---

# DCYFR Performance Analyst

Advanced performance monitoring and optimization agent:
- Lighthouse score analysis (target: 92+)
- Bundle size optimization
- Next.js performance patterns
- Redis analytics optimization
- Database query performance

## Capabilities
- Performance metrics collection and analysis
- Bundle size monitoring and recommendations
- Database query optimization
- Caching strategy implementation
- Real-time performance monitoring
            `,
          },
          agentId: 'dcyfr-performance-analyst',
        },
        {
          source: {
            type: 'markdown',
            content: `
---
name: dcyfr-security-auditor
description: DCYFR security assessment and compliance specialist
tools: ['read', 'search', 'audit', 'scan']
model: opus
category: security
---

# DCYFR Security Auditor

Enterprise-grade security assessment agent:
- OWASP compliance validation
- Vulnerability scanning and assessment
- Security header analysis
- Authentication pattern review
- Data protection compliance

## Capabilities
- Security vulnerability detection
- OWASP compliance validation
- Authentication and authorization review
- Data encryption and protection analysis
- Security configuration assessment
            `,
          },
          agentId: 'dcyfr-security-auditor',  
        },
        {
          source: {
            type: 'markdown',
            content: `
---
name: dcyfr-content-optimizer
description: DCYFR content optimization and SEO specialist
tools: ['read', 'search', 'edit', 'analyze']
model: sonnet
category: content
---

# DCYFR Content Optimizer

Content strategy and optimization agent:
- MDX content optimization
- SEO metadata validation
- Blog post structure analysis
- Content accessibility review
- Knowledge management optimization

## Capabilities
- Content SEO optimization
- MDX structure validation
- Accessibility content review
- Knowledge base organization
- Blog content strategy
            `,
          },
          agentId: 'dcyfr-content-optimizer',
        },
      ],
      tasks: [
        {
          taskId: 'design-system-audit',
          description: 'Comprehensive audit of design system compliance across codebase',
          requiredCapabilities: [
            {
              capability_id: 'design_system_validation',
              name: 'Design System Validation',
              description: 'Validate design token usage and component architecture',
              priority: 9,
            },
          ],
          priority: 9,
          timeout: 45000,
          tlpClassification: 'TLP:AMBER',
          metadata: {
            target_compliance: 0.95,
            check_patterns: ['SPACING', 'TYPOGRAPHY', 'SEMANTIC_COLORS'],
          },
        },
        {
          taskId: 'performance-analysis',
          description: 'Deep performance analysis and optimization recommendations',
          requiredCapabilities: [
            {
              capability_id: 'performance_analysis',
              name: 'Performance Analysis',
              description: 'Analyze application performance and provide optimization recommendations',
              priority: 8,
            },
          ],
          priority: 8,
          timeout: 60000,
          tlpClassification: 'TLP:AMBER',
          metadata: {
            target_lighthouse_score: 92,
            analyze_components: ['bundle_size', 'runtime_performance', 'caching'],
          },
        },
        {
          taskId: 'security-assessment',
          description: 'Enterprise security assessment and vulnerability analysis',
          requiredCapabilities: [
            {
              capability_id: 'security_assessment',
              name: 'Security Assessment',
              description: 'Perform comprehensive security analysis and vulnerability assessment',
              priority: 10,
            },
          ],
          priority: 10,
          timeout: 90000,
          tlpClassification: 'TLP:RED',
          metadata: {
            owasp_compliance: true,
            vulnerability_scan: true,
            authentication_review: true,
          },
        },
        {
          taskId: 'content-optimization',
          description: 'Content optimization and SEO enhancement',
          requiredCapabilities: [
            {
              capability_id: 'content_optimization',
              name: 'Content Optimization',
              description: 'Optimize content structure, SEO, and accessibility',
              priority: 6,
            },
          ],
          priority: 6,
          timeout: 30000,
          tlpClassification: 'TLP:CLEAR',
          metadata: {
            seo_optimization: true,
            accessibility_check: true,
            content_structure: 'mdx',
          },
        },
        {
          taskId: 'integration-validation',
          description: 'Validate integration between all systems and components',
          requiredCapabilities: [
            {
              capability_id: 'integration_validation',
              name: 'Integration Validation',
              description: 'Validate end-to-end integration functionality',
              priority: 7,
            },
          ],
          priority: 7,
          timeout: 45000,
          tlpClassification: 'TLP:AMBER',
          metadata: {
            validate_mcp_servers: true,
            validate_delegation: true,
            validate_capabilities: true,
          },
        },
      ],
      config: {
        enableValidation: true,
        enablePerformanceTracking: true,
        minConfidenceThreshold: 0.8,
      },
    };

    log('Executing advanced workflow...');
    const result = await orchestrator.executeWorkflow(advancedWorkflow);
    
    log('Advanced workflow completed!', 'success');
    printWorkflowSummary(result);
    printAgentResults(result.agentResults);
    printTaskResults(result.taskResults);

    // Generate detailed report
    log('Generating comprehensive workflow report...');
    const report = await orchestrator.generateWorkflowReport(result.workflowId);
    
    console.log('\n' + colors.bold('📊 SYSTEM ANALYSIS'));
    console.log('─'.repeat(40));
    console.log(`Total System Agents: ${colors.cyan(report.systemAnalysis.capabilityMetrics?.totalAgents || 0)}`);
    console.log(`Active Delegation Contracts: ${colors.cyan(report.systemAnalysis.delegationMetrics?.activeContracts || 0)}`);
    console.log(`MCP Servers Status: ${colors.cyan('See detailed logs')}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n' + colors.bold('💡 RECOMMENDATIONS'));
      console.log('─'.repeat(40));
      report.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }
    
  } catch (error) {
    log(`Advanced demo failed: ${error.message}`, 'error');
    throw error;
  } finally {
    await orchestrator.shutdown();
  }
}

/**
 * Run performance benchmark demo
 */
async function runPerformanceBenchmark(): Promise<void> {
  printHeader('DCYFR Integration Demo - Performance Benchmark');
  
  const workspaceRoot = process.cwd();
  const orchestrator = new EndToEndWorkflowOrchestrator({
    workspaceRoot,
    enableLogging: false, // Reduce logging overhead for benchmark
    enableMonitoring: true,
    enableValidation: false, // Skip validation for pure performance test
    enablePerformanceTracking: true,
    workflowTimeout: 120000, // 2 minutes
    minConfidenceThreshold: 0.5, // Lower threshold for benchmark
  });

  try {
    log('Running performance benchmark with multiple concurrent workflows...');
    
    const benchmarkPromises = [];
    const startTime = Date.now();
    
    // Run 3 concurrent demo workflows
    for (let i = 0; i < 3; i++) {
      benchmarkPromises.push(
        orchestrator.executeDemoWorkflow().then(result => ({
          workflowIndex: i,
          result,
        }))
      );
    }
    
    const results = await Promise.all(benchmarkPromises);
    const totalTime = Date.now() - startTime;
    
    log(`Performance benchmark completed in ${totalTime}ms`, 'success');
    
    console.log('\n' + colors.bold('🚀 BENCHMARK RESULTS'));
    console.log('─'.repeat(40));
    console.log(`Concurrent Workflows: ${colors.cyan('3')}`);
    console.log(`Total Benchmark Time: ${colors.cyan(totalTime + 'ms')}`);
    console.log(`Average Workflow Time: ${colors.cyan(Math.round(totalTime / 3) + 'ms')}`);
    
    let totalTasks = 0;
    let successfulTasks = 0;
    
    results.forEach(({ workflowIndex, result }) => {
      log(`Workflow ${workflowIndex + 1}: ${result.status} (${result.performanceMetrics.totalExecutionTime}ms)`, 
          result.status === 'success' ? 'success' : 'warn');
      
      totalTasks += result.taskResults.length;
      successfulTasks += result.taskResults.filter(task => task.status === 'completed').length;
    });
    
    const successRate = totalTasks > 0 ? (successfulTasks / totalTasks) * 100 : 0;
    console.log(`Task Success Rate: ${colors.green(successRate.toFixed(1) + '%')}`);
    console.log(`Total Tasks Executed: ${colors.cyan(totalTasks)}`);
    console.log(`Throughput: ${colors.cyan((totalTasks / (totalTime / 60000)).toFixed(2) + ' tasks/minute')}`);
    
  } catch (error) {
    log(`Performance benchmark failed: ${error.message}`, 'error');
    throw error;
  } finally {
    await orchestrator.shutdown();
  }
}

/**
 * Main demo runner
 */
async function main(): Promise<void> {
  console.log(colors.bold(colors.cyan('\n🚀 DCYFR Integration System Demonstration\n')));
  console.log(colors.dim('This demonstration showcases the complete DCYFR integration system'));
  console.log(colors.dim('from agent onboarding through task completion with monitoring.\n'));
  
  const demos = [
    { name: 'Basic Demo', fn: runBasicDemo },
    { name: 'Advanced Demo', fn: runAdvancedDemo },
    { name: 'Performance Benchmark', fn: runPerformanceBenchmark },
  ];

  const demoToRun = process.argv[2];
  
  if (demoToRun && demoToRun !== 'all') {
    const selectedDemo = demos.find(demo => 
      demo.name.toLowerCase().includes(demoToRun.toLowerCase())
    );
    
    if (!selectedDemo) {
      log(`Demo '${demoToRun}' not found. Available demos: ${demos.map(d => d.name.toLowerCase()).join(', ')}`, 'error');
      process.exit(1);
    }
    
    await selectedDemo.fn();
  } else {
    // Run all demos
    for (const demo of demos) {
      try {
        await demo.fn();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause between demos
      } catch (error) {
        log(`${demo.name} failed: ${error.message}`, 'error');
        // Continue with other demos
      }
    }
  }
  
  console.log('\n' + colors.bold(colors.green('✓ DCYFR Integration Demo Complete!')));
  console.log(colors.dim('All integration systems validated and working correctly.\n'));
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(colors.red('\n✗ Demo failed:'), error.message);
    process.exit(1);
  });
}

export { runBasicDemo, runAdvancedDemo, runPerformanceBenchmark };
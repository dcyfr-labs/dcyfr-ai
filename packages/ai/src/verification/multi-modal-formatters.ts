/**
 * DCYFR Multi-Modal Verification Formatters
 * TLP:AMBER - Internal Use Only
 * 
 * Concrete implementations of verification output formatters for multiple
 * formats including JSON, YAML, Markdown, HTML, and contract compliance.
 * 
 * @module verification/multi-modal-formatters
 * @version 1.0.0
 * @date 2026-02-13
 */

import {
  BaseVerificationFormatter,
  type FormattedVerificationOutput,
  type VerificationOutputFormat,
  type VerificationFormatterConfig,
  type IVerificationFormatter,
} from './output-formatter';
import type {
  DelegationContract,
  VerificationResult,
} from '../types/delegation-contracts';
import type { TaskExecutionResult } from '../runtime/agent-runtime';

/**
 * Standard multi-modal verification formatter
 * 
 * Provides implementations for all standard output formats with
 * configurable templates and styling options.
 */
export class StandardVerificationFormatter extends BaseVerificationFormatter implements IVerificationFormatter {
  
  async formatOutput(
    result: TaskExecutionResult,
    contract: DelegationContract,
    format: VerificationOutputFormat
  ): Promise<FormattedVerificationOutput> {
    let content: string;
    
    switch (format) {
      case 'json':
        content = await this.formatAsJson(result, contract);
        break;
      case 'yaml':
        content = await this.formatAsYaml(result, contract);
        break;
      case 'markdown':
        content = await this.formatAsMarkdown(result, contract);
        break;
      case 'html':
        content = await this.formatAsHtml(result, contract);
        break;
      case 'xml':
        content = await this.formatAsXml(result, contract);
        break;
      case 'csv':
        content = await this.formatAsCsv(result, contract);
        break;
      case 'plain_text':
        content = await this.formatAsPlainText(result, contract);
        break;
      case 'contract_compliance':
        content = await this.formatAsContractCompliance(result, contract);
        break;
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
    
    // Apply content size limits
    if (content.length > this.config.max_content_size_bytes) {
      const truncationMessage = '\n... (truncated)';
      const maxContentLength = this.config.max_content_size_bytes - truncationMessage.length;
      content = content.slice(0, maxContentLength) + truncationMessage;
    }
    
    // Validate contract compliance
    const validation = this.validateContractCompliance(content, contract, result);
    
    const formatted: FormattedVerificationOutput = {
      format,
      mime_type: this.getMimeType(format),
      content,
      metadata: {
        formatted_at: new Date().toISOString(),
        formatter_version: '1.0.0',
        contract_id: contract.contract_id,
        content_size_bytes: content.length,
        content_hash: this.config.include_content_hash ? this.calculateContentHash(content) : undefined,
        format_metadata: this.getFormatMetadata(format, result, contract),
      },
      validation: {
        contract_compliant: validation.compliant,
        compliance_checks: validation.checks,
        compliance_score: validation.score,
      },
    };
    
    return formatted;
  }
  
  // Format-specific implementations
  
  private async formatAsJson(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    const output = {
      contract_id: contract.contract_id,
      execution_result: {
        success: result.success,
        output: result.output,
        error: result.error,
        metrics: this.config.metadata_options.include_resource_usage ? result.metrics : {
          execution_time_ms: result.metrics.execution_time_ms,
        },
        verification: result.verification,
        completed_at: result.completed_at,
      },
      contract_verification: {
        verification_policy: contract.verification_policy,
        success_criteria: contract.success_criteria,
        tlp_classification: contract.tlp_classification,
      },
      compliance_summary: this.generateComplianceSummary(result, contract),
      metadata: {
        formatted_at: new Date().toISOString(),
        formatter: 'StandardVerificationFormatter',
        format_version: '1.0.0',
      },
    };
    
    return JSON.stringify(output, null, 2);
  }
  
  private async formatAsYaml(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    // Simple YAML-like format (would use proper YAML library in production)
    const data = {
      contract_id: contract.contract_id,
      execution_result: result,
      contract_verification: {
        verification_policy: contract.verification_policy,
        success_criteria: contract.success_criteria,
      },
    };
    
    return this.objectToYaml(data);
  }
  
  private formatContractRequirementsMarkdown(contract: DelegationContract): string {
    let section = `## Contract Requirements\n\n`;
    section += `- **Verification Policy:** ${contract.verification_policy}\n`;
    if (contract.tlp_classification) {
      section += `- **TLP Classification:** ${contract.tlp_classification}\n`;
    }
    if (contract.timeout_ms) {
      section += `- **Timeout:** ${contract.timeout_ms}ms\n`;
    }

    const criteria = contract.success_criteria;
    if (criteria.quality_threshold !== undefined) {
      section += `- **Quality Threshold:** ${(criteria.quality_threshold * 100).toFixed(1)}%\n`;
    }
    if (criteria.performance_requirements) {
      section += `- **Performance Requirements:**\n`;
      const perf = criteria.performance_requirements;
      if (perf.max_execution_time_ms) {
        section += `  - Max Execution Time: ${perf.max_execution_time_ms}ms\n`;
      }
      if (perf.max_memory_mb) {
        section += `  - Max Memory: ${perf.max_memory_mb}MB\n`;
      }
    }
    return section;
  }

  private async formatAsMarkdown(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
    const complianceScore = this.calculateComplianceScore(result, contract);
    const complianceStatus = complianceScore >= 0.8 ? '✅ COMPLIANT' : '⚠️ NON-COMPLIANT';
    
    let markdown = `# Verification Report\n\n`;
    markdown += `**Contract ID:** \`${contract.contract_id}\`  \n`;
    markdown += `**Status:** ${status}  \n`;
    markdown += `**Compliance:** ${complianceStatus} (${(complianceScore * 100).toFixed(1)}%)  \n`;
    markdown += `**Generated:** ${new Date().toISOString()}  \n\n`;
    
    // Execution Summary
    markdown += `## Execution Summary\n\n`;
    markdown += `- **Execution Time:** ${result.metrics.execution_time_ms}ms\n`;
    if (result.metrics.peak_memory_mb) {
      markdown += `- **Peak Memory:** ${result.metrics.peak_memory_mb}MB\n`;
    }
    if (result.metrics.cpu_time_ms) {
      markdown += `- **CPU Time:** ${result.metrics.cpu_time_ms}ms\n`;
    }
    markdown += `- **Completed At:** ${result.completed_at}\n\n`;
    
    // Task Output
    if (result.success && result.output) {
      markdown += `## Task Output\n\n`;
      markdown += `\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\`\n\n`;
    }
    
    // Error Details
    if (!result.success && result.error) {
      markdown += `## Error Details\n\n`;
      markdown += `- **Type:** ${result.error.type}\n`;
      markdown += `- **Message:** ${result.error.message}\n`;
      if (result.error.details) {
        markdown += `- **Details:** \`${JSON.stringify(result.error.details)}\`\n`;
      }
      markdown += `\n`;
    }
    
    // Verification Results
    if (result.verification) {
      markdown += `## Verification Results\n\n`;
      markdown += `- **Verified:** ${result.verification.verified ? '✅ Yes' : '❌ No'}\n`;
      markdown += `- **Method:** ${result.verification.verification_method}\n`;
      markdown += `- **Verified By:** ${result.verification.verified_by}\n`;
      if (result.verification.quality_score !== undefined) {
        markdown += `- **Quality Score:** ${(result.verification.quality_score * 100).toFixed(1)}%\n`;
      }
      if (result.verification.verification_details) {
        markdown += `- **Details:** ${result.verification.verification_details}\n`;
      }
      markdown += `\n`;
    }
    
    markdown += this.formatContractRequirementsMarkdown(contract);
    
    return markdown;
  }
  
  private async formatAsHtml(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    const status = result.success ? 'SUCCESS' : 'FAILED';
    const statusClass = result.success ? 'success' : 'error';
    const complianceScore = this.calculateComplianceScore(result, contract);
    const complianceStatus = complianceScore >= 0.8 ? 'COMPLIANT' : 'NON-COMPLIANT';
    const complianceClass = complianceScore >= 0.8 ? 'compliant' : 'non-compliant';
    
    let html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n`;
    html += `  <meta charset="UTF-8">\n`;
    html += `  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n`;
    html += `  <title>Verification Report - ${contract.contract_id}</title>\n`;
    html += `  <style>\n`;
    html += this.getHtmlStyles();
    html += `  </style>\n</head>\n<body>\n`;
    
    html += `  <div class="container">\n`;
    html += `    <header>\n`;
    html += `      <h1>Verification Report</h1>\n`;
    html += `      <div class="status-bar">\n`;
    html += `        <span class="status ${statusClass}">${status}</span>\n`;
    html += `        <span class="compliance ${complianceClass}">${complianceStatus}</span>\n`;
    html += `      </div>\n`;
    html += `    </header>\n`;
    
    html += `    <section class="summary">\n`;
    html += `      <h2>Summary</h2>\n`;
    html += `      <table>\n`;
    html += `        <tr><td>Contract ID</td><td>${contract.contract_id}</td></tr>\n`;
    html += `        <tr><td>Execution Time</td><td>${result.metrics.execution_time_ms}ms</td></tr>\n`;
    html += `        <tr><td>Compliance Score</td><td>${(complianceScore * 100).toFixed(1)}%</td></tr>\n`;
    html += `        <tr><td>Completed At</td><td>${result.completed_at}</td></tr>\n`;
    html += `      </table>\n`;
    html += `    </section>\n`;
    
    if (result.success && result.output) {
      html += `    <section class="output">\n`;
      html += `      <h2>Task Output</h2>\n`;
      html += `      <pre><code>${this.escapeHtml(JSON.stringify(result.output, null, 2))}</code></pre>\n`;
      html += `    </section>\n`;
    }
    
    if (!result.success && result.error) {
      html += `    <section class="error">\n`;
      html += `      <h2>Error Details</h2>\n`;
      html += `      <p><strong>Type:</strong> ${result.error.type}</p>\n`;
      html += `      <p><strong>Message:</strong> ${result.error.message}</p>\n`;
      html += `    </section>\n`;
    }
    
    html += `  </div>\n</body>\n</html>`;
    
    return html;
  }
  
  private async formatAsXml(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<verification_report contract_id="${contract.contract_id}" generated_at="${new Date().toISOString()}">\n`;
    
    xml += `  <execution_result success="${result.success}">\n`;
    xml += `    <metrics>\n`;
    xml += `      <execution_time_ms>${result.metrics.execution_time_ms}</execution_time_ms>\n`;
    if (result.metrics.peak_memory_mb) {
      xml += `      <peak_memory_mb>${result.metrics.peak_memory_mb}</peak_memory_mb>\n`;
    }
    xml += `    </metrics>\n`;
    
    if (result.success && result.output) {
      xml += `    <output><![CDATA[${JSON.stringify(result.output)}]]></output>\n`;
    }
    
    if (result.error) {
      xml += `    <error>\n`;
      xml += `      <type>${result.error.type}</type>\n`;
      xml += `      <message><![CDATA[${result.error.message}]]></message>\n`;
      xml += `    </error>\n`;
    }
    
    xml += `    <completed_at>${result.completed_at}</completed_at>\n`;
    xml += `  </execution_result>\n`;
    
    xml += `  <contract_requirements>\n`;
    xml += `    <verification_policy>${contract.verification_policy}</verification_policy>\n`;
    if (contract.tlp_classification) {
      xml += `    <tlp_classification>${contract.tlp_classification}</tlp_classification>\n`;
    }
    xml += `  </contract_requirements>\n`;
    
    if (result.verification) {
      xml += `  <verification verified="${result.verification.verified}">\n`;
      xml += `    <method>${result.verification.verification_method}</method>\n`;
      xml += `    <verified_by>${result.verification.verified_by}</verified_by>\n`;
      if (result.verification.quality_score !== undefined) {
        xml += `    <quality_score>${result.verification.quality_score}</quality_score>\n`;
      }
      xml += `  </verification>\n`;
    }
    
    xml += `</verification_report>`;
    
    return xml;
  }
  
  private async formatAsCsv(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    const headers = [
      'contract_id',
      'success',
      'execution_time_ms',
      'peak_memory_mb',
      'verified',
      'quality_score',
      'compliance_score',
      'completed_at'
    ];
    
    const complianceScore = this.calculateComplianceScore(result, contract);
    
    const row = [
      contract.contract_id,
      result.success,
      result.metrics.execution_time_ms,
      result.metrics.peak_memory_mb || '',
      result.verification?.verified || false,
      result.verification?.quality_score || '',
      complianceScore,
      result.completed_at
    ];
    
    return headers.join(',') + '\n' + row.join(',');
  }
  
  private async formatAsPlainText(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    const status = result.success ? 'SUCCESS' : 'FAILED';
    const complianceScore = this.calculateComplianceScore(result, contract);
    
    let text = `VERIFICATION REPORT\n`;
    text += `==================\n\n`;
    text += `Contract ID: ${contract.contract_id}\n`;
    text += `Status: ${status}\n`;
    text += `Compliance Score: ${(complianceScore * 100).toFixed(1)}%\n`;
    text += `Execution Time: ${result.metrics.execution_time_ms}ms\n`;
    text += `Completed At: ${result.completed_at}\n\n`;
    
    if (result.success && result.output) {
      text += `TASK OUTPUT:\n`;
      text += `${JSON.stringify(result.output, null, 2)}\n\n`;
    }
    
    if (!result.success && result.error) {
      text += `ERROR DETAILS:\n`;
      text += `Type: ${result.error.type}\n`;
      text += `Message: ${result.error.message}\n\n`;
    }
    
    if (result.verification) {
      text += `VERIFICATION:\n`;
      text += `Verified: ${result.verification.verified ? 'Yes' : 'No'}\n`;
      text += `Method: ${result.verification.verification_method}\n`;
      if (result.verification.quality_score !== undefined) {
        text += `Quality Score: ${(result.verification.quality_score * 100).toFixed(1)}%\n`;
      }
    }
    
    return text;
  }
  
  private async formatAsContractCompliance(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    const validation = this.validateContractCompliance('', contract, result);
    
    const compliance = {
      contract_id: contract.contract_id,
      compliance_check: {
        overall_compliant: validation.compliant,
        compliance_score: validation.score,
        checks_performed: validation.checks.length,
        checks_passed: validation.checks.filter(c => c.passed).length,
        timestamp: new Date().toISOString(),
      },
      detailed_checks: validation.checks.map(check => ({
        name: check.check_name,
        passed: check.passed,
        severity: check.severity,
        details: check.details,
      })),
      execution_summary: {
        success: result.success,
        execution_time_ms: result.metrics.execution_time_ms,
        verified: result.verification?.verified || false,
        quality_score: result.verification?.quality_score,
      },
      contract_termsReview: {
        verification_policy: contract.verification_policy,
        tlp_classification: contract.tlp_classification,
        success_criteria_met: this.evaluateSuccessCriteria(result, contract),
      },
    };
    
    return JSON.stringify(compliance, null, 2);
  }
  
  // Helper methods
  
  private getFormatMetadata(
    format: VerificationOutputFormat,
    result: TaskExecutionResult,
    contract: DelegationContract
  ): Record<string, unknown> {
    const base = {
      format_type: format,
      includes_timing: this.config.metadata_options.include_timing_data,
      includes_resources: this.config.metadata_options.include_resource_usage,
    };
    
    switch (format) {
      case 'html':
        return { ...base, has_styling: true, interactive: false };
      case 'json':
        return { ...base, structured: true, machine_readable: true };
      case 'markdown':
        return { ...base, human_readable: true, renderable: true };
      case 'csv':
        return { ...base, tabular: true, header_row: true };
      case 'contract_compliance':
        return { ...base, compliance_focused: true, audit_ready: true };
      default:
        return base;
    }
  }
  
  private generateComplianceSummary(result: TaskExecutionResult, contract: DelegationContract) {
    const validation = this.validateContractCompliance('', contract, result);
    return {
      compliant: validation.compliant,
      score: validation.score,
      checks_total: validation.checks.length,
      checks_passed: validation.checks.filter(c => c.passed).length,
      major_issues: validation.checks.filter(c => !c.passed && c.severity === 'error').length,
    };
  }
  
  private calculateComplianceScore(result: TaskExecutionResult, contract: DelegationContract): number {
    const validation = this.validateContractCompliance('', contract, result);
    return validation.score;
  }
  
  private evaluateSuccessCriteria(result: TaskExecutionResult, contract: DelegationContract): boolean {
    const validation = this.validateContractCompliance('', contract, result);
    return validation.compliant && result.success;
  }
  
  private objectToYaml(obj: any, indent = 0): string {
    let yaml = '';
    const spaces = '  '.repeat(indent);
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        yaml += `${spaces}- ${this.objectToYaml(item, indent + 1)}\n`;
      }
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          yaml += `${spaces}${key}:\n${this.objectToYaml(value, indent + 1)}`;
        } else {
          yaml += `${spaces}${key}: ${value}\n`;
        }
      }
    } else {
      return String(obj);
    }
    
    return yaml;
  }
  
  private getHtmlStyles(): string {
    return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
    header { background: #2563eb; color: white; padding: 20px; }
    header h1 { margin: 0; font-size: 24px; }
    .status-bar { margin-top: 10px; }
    .status, .compliance { padding: 4px 12px; border-radius: 4px; font-weight: bold; margin-right: 10px; }
    .success { background: #10b981; }
    .error { background: #ef4444; }
    .compliant { background: #10b981; }
    .non-compliant { background: #f59e0b; }
    section { padding: 20px; border-bottom: 1px solid #e5e7eb; }
    section:last-child { border-bottom: none; }
    h2 { margin-top: 0; color: #1f2937; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
    td:first-child { font-weight: bold; width: 200px; }
    pre { background: #f3f4f6; padding: 15px; border-radius: 4px; overflow-x: auto; }
    code { font-family: 'SF Mono', Monaco, monospace; }
    .error { background: #fef2f2; border-left: 4px solid #ef4444; }
    `;
  }
  
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    
    return text.replace(/[&<>"']/g, (match) => htmlEscapes[match] || match);
  }
}

/**
 * Specialized contract compliance formatter
 * 
 * Focused specifically on contract compliance verification with
 * detailed audit trails and regulatory compliance features.
 */
export class ContractComplianceFormatter extends BaseVerificationFormatter implements IVerificationFormatter {
  
  async formatOutput(
    result: TaskExecutionResult,
    contract: DelegationContract,
    format: VerificationOutputFormat
  ): Promise<FormattedVerificationOutput> {
    // Always output in contract compliance format regardless of requested format
    const content = await this.generateComplianceReport(result, contract);
    const validation = this.validateContractCompliance(content, contract, result);
    
    return {
      format: 'contract_compliance',
      mime_type: 'application/vnd.dcyfr.verification+json',
      content,
      metadata: {
        formatted_at: new Date().toISOString(),
        formatter_version: '1.0.0',
        contract_id: contract.contract_id,
        content_size_bytes: content.length,
        content_hash: this.config.include_content_hash ? this.calculateContentHash(content) : undefined,
        format_metadata: {
          compliance_focused: true,
          audit_ready: true,
          regulatory_compliant: true,
          tlp_classified: true,
        },
      },
      validation: {
        contract_compliant: validation.compliant,
        compliance_checks: validation.checks,
        compliance_score: validation.score,
      },
    };
  }
  
  private async generateComplianceReport(result: TaskExecutionResult, contract: DelegationContract): Promise<string> {
    const validation = this.validateContractCompliance('', contract, result);
    const timestamp = new Date().toISOString();
    
    const report = {
      compliance_report: {
        header: {
          report_id: this.generateReportId(),
          contract_id: contract.contract_id,
          generated_at: timestamp,
          report_type: 'delegation_contract_compliance',
          tlp_classification: contract.tlp_classification || 'TLP:AMBER',
          formatter_version: '1.0.0',
        },
        executive_summary: {
          overall_compliance: validation.compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
          compliance_score: validation.score,
          total_checks: validation.checks.length,
          passed_checks: validation.checks.filter(c => c.passed).length,
          critical_failures: validation.checks.filter(c => !c.passed && c.severity === 'error').length,
          recommendation: validation.compliant ? 'Contract terms satisfied' : 'Review and address compliance failures',
        },
        contract_analysis: {
          contract_terms: {
            verification_policy: contract.verification_policy,
            tlp_classification: contract.tlp_classification,
            timeout_ms: contract.timeout_ms,
            success_criteria: contract.success_criteria,
          },
          execution_analysis: {
            task_success: result.success,
            execution_time_ms: result.metrics.execution_time_ms,
            within_timeout: contract.timeout_ms ? result.metrics.execution_time_ms <= contract.timeout_ms : true,
            resource_usage: {
              peak_memory_mb: result.metrics.peak_memory_mb,
              cpu_time_ms: result.metrics.cpu_time_ms,
              network_bytes: result.metrics.network_bytes,
            },
          },
          verification_analysis: result.verification ? {
            verified: result.verification.verified,
            verification_method: result.verification.verification_method,
            quality_score: result.verification.quality_score,
            verified_by: result.verification.verified_by,
            verification_details: result.verification.verification_details,
          } : {
            verified: false,
            note: 'No verification performed',
          },
        },
        detailed_compliance_checks: validation.checks.map((check, index) => ({
          check_number: index + 1,
          check_name: check.check_name,
          requirement: this.getCheckRequirement(check.check_name, contract),
          status: check.passed ? 'PASS' : 'FAIL',
          severity: check.severity.toUpperCase(),
          details: check.details,
          remediation: check.passed ? null : this.getRemediation(check.check_name),
        })),
        audit_trail: {
          task_execution: {
            started_at: result.context.metadata.started_at,
            completed_at: result.completed_at,
            execution_context: {
              execution_id: result.context.execution_id,
              task_description: result.context.task?.description,
              delegation_contract_id: contract.contract_id,
            },
          },
          compliance_evaluation: {
            evaluation_timestamp: timestamp,
            evaluation_method: 'automated_contract_validation',
            evaluator: 'ContractComplianceFormatter',
            evaluation_criteria: Object.keys(contract.success_criteria),
          },
        },
        recommendations: this.generateRecommendations(validation, result, contract),
        appendix: {
          raw_execution_result: this.config.metadata_options.include_error_details ? result : {
            success: result.success,
            metrics: result.metrics,
            completed_at: result.completed_at,
          },
          contract_metadata: {
            created_at: contract.created_at,
            delegator_agent_id: contract.delegator_agent_id,
            delegatee_agent_id: contract.delegatee_agent_id,
          },
        },
      },
    };
    
    return JSON.stringify(report, null, 2);
  }
  
  private getCheckRequirement(checkName: string, contract: DelegationContract): string {
    const requirements: Record<string, string> = {
      'output_schema_compliance': 'Task output must conform to contract-specified schema',
      'performance_requirements': 'Task execution must meet performance criteria',
      'quality_threshold': `Quality score must meet or exceed ${contract.success_criteria.quality_threshold || 0}`,
      'output_format_compliance': 'Output must be in required format(s)',
    };
    
    return requirements[checkName] || 'Contract requirement validation';
  }
  
  private getRemediation(checkName: string): string {
    const remediations: Record<string, string> = {
      'output_schema_compliance': 'Review task output structure and ensure all required fields are present',
      'performance_requirements': 'Optimize task execution or request timeout extension',
      'quality_threshold': 'Improve task implementation or review quality metrics',
      'output_format_compliance': 'Convert output to required format(s)',
    };
    
    return remediations[checkName] || 'Review contract requirements and adjust implementation';
  }
  
  private generateRecommendations(
    validation: { compliant: boolean; score: number; checks: Array<any> },
    result: TaskExecutionResult,
    contract: DelegationContract
  ): Array<{ type: string; priority: string; description: string }> {
    const recommendations: Array<{ type: string; priority: string; description: string }> = [];
    
    if (!validation.compliant) {
      recommendations.push({
        type: 'compliance',
        priority: 'HIGH',
        description: 'Address compliance failures before considering task complete',
      });
    }
    
    if (!result.success) {
      recommendations.push({
        type: 'execution',
        priority: 'CRITICAL',
        description: 'Task execution failed - review error details and retry',
      });
    }
    
    if (validation.score < 0.5) {
      recommendations.push({
        type: 'quality',
        priority: 'HIGH',
        description: 'Low compliance score indicates significant issues',
      });
    }
    
    if (contract.timeout_ms && result.metrics.execution_time_ms > (contract.timeout_ms * 0.8)) {
      recommendations.push({
        type: 'performance',
        priority: 'MEDIUM',
        description: 'Execution time approaching timeout limit',
      });
    }
    
    if (validation.compliant && result.success) {
      recommendations.push({
        type: 'success',
        priority: 'INFO',
        description: 'All contract requirements satisfied',
      });
    }
    
    return recommendations;
  }
}
/**
 * DCYFR Verification Output Parser & Integration
 * TLP:AMBER - Internal Use Only
 * 
 * Parser for verification outputs and integration with AgentRuntime
 * to enable automated contract compliance checking and multi-modal
 * verification reporting.
 * 
 * @module verification/parser-integration
 * @version 1.0.0
 * @date 2026-02-13
 */

import type {
  DelegationContract,
  VerificationResult,
} from '../types/delegation-contracts';
import type { TaskExecutionResult } from '../runtime/agent-runtime';
import type {
  FormattedVerificationOutput,
  MultiModalVerificationReport,
  VerificationOutputFormat,
  VerificationFormatterConfig,
} from './output-formatter';
import {
  StandardVerificationFormatter,
  ContractComplianceFormatter,
} from './multi-modal-formatters';

/**
 * Verification output parser configuration
 */
export interface VerificationParserConfig {
  /** Enable strict schema validation */
  strict_validation: boolean;
  /** Formats to generate automatically */
  auto_generate_formats: VerificationOutputFormat[];
  /** Default formatter configuration */
  default_formatter_config: VerificationFormatterConfig;
  /** Custom validation rules */
  custom_validation_rules?: Array<{
    name: string;
    rule: (result: TaskExecutionResult, contract: DelegationContract) => boolean;
    error_message: string;
  }>;
}

/**
 * Parsed verification result with compliance analysis
 */
export interface ParsedVerificationResult {
  /** Original execution result */
  execution_result: TaskExecutionResult;
  /** Contract used for verification */
  contract: DelegationContract;
  /** Multi-modal formatted outputs */
  formatted_outputs: FormattedVerificationOutput[];
  /** Compliance analysis summary */
  compliance_analysis: {
    overall_compliant: boolean;
    compliance_score: number;
    failed_checks: string[];
    recommendations: string[];
  };
  /** Parser metadata */
  parser_metadata: {
    parsed_at: string;
    parser_version: string;
    formats_generated: VerificationOutputFormat[];
  };
}

/**
 * Verification output parser
 * 
 * Parses task execution results into multi-modal verification reports
 * with automated contract compliance checking.
 */
export class VerificationOutputParser {
  private config: VerificationParserConfig;
  private standardFormatter: StandardVerificationFormatter;
  private complianceFormatter: ContractComplianceFormatter;
  
  constructor(config?: Partial<VerificationParserConfig>) {
    this.config = {
      strict_validation: true,
      auto_generate_formats: ['json', 'markdown', 'contract_compliance'],
      default_formatter_config: {
        default_formats: ['json', 'markdown'],
        include_human_readable: true,
        include_machine_readable: true,
        include_content_hash: true,
        enable_compression: false,
        strict_compliance_checking: true,
        max_content_size_bytes: 1024 * 1024, // 1MB
        metadata_options: {
          include_timing_data: true,
          include_resource_usage: true,
          include_error_details: true,
          include_verification_artifacts: true,
        },
      },
      ...config,
    };
    
    this.standardFormatter = new StandardVerificationFormatter(this.config.default_formatter_config);
    this.complianceFormatter = new ContractComplianceFormatter(this.config.default_formatter_config);
  }
  
  /**
   * Parse task execution result into multi-modal verification report
   */
  async parseVerificationResult(
    result: TaskExecutionResult,
    contract: DelegationContract,
    additionalFormats?: VerificationOutputFormat[]
  ): Promise<ParsedVerificationResult> {
    const formats = [
      ...this.config.auto_generate_formats,
      ...(additionalFormats || [])
    ].filter((format, index, array) => array.indexOf(format) === index); // Remove duplicates
    
    // Generate formatted outputs
    const formattedOutputs: FormattedVerificationOutput[] = [];
    
    // Generate standard formats
    for (const format of formats.filter(f => f !== 'contract_compliance')) {
      try {
        const output = await this.standardFormatter.formatOutput(result, contract, format);
        formattedOutputs.push(output);
      } catch (error) {
        // Log error but continue with other formats
        console.warn(`Failed to generate ${format} format:`, error);
      }
    }
    
    // Generate compliance report if requested
    if (formats.includes('contract_compliance')) {
      try {
        const complianceOutput = await this.complianceFormatter.formatOutput(result, contract, 'contract_compliance');
        formattedOutputs.push(complianceOutput);
      } catch (error) {
        console.warn('Failed to generate contract compliance format:', error);
      }
    }
    
    // Perform compliance analysis
    const complianceAnalysis = this.analyzeCompliance(result, contract, formattedOutputs);
    
    // Run custom validation rules
    if (this.config.custom_validation_rules) {
      for (const rule of this.config.custom_validation_rules) {
        if (!rule.rule(result, contract)) {
          complianceAnalysis.failed_checks.push(rule.name);
          complianceAnalysis.recommendations.push(rule.error_message);
          complianceAnalysis.overall_compliant = false;
        }
      }
    }
    
    return {
      execution_result: result,
      contract,
      formatted_outputs: formattedOutputs,
      compliance_analysis: complianceAnalysis,
      parser_metadata: {
        parsed_at: new Date().toISOString(),
        parser_version: '1.0.0',
        formats_generated: formats,
      },
    };
  }
  
  /**
   * Generate multi-modal verification report
   */
  async generateMultiModalReport(
    result: TaskExecutionResult,
    contract: DelegationContract,
    formats?: VerificationOutputFormat[]
  ): Promise<MultiModalVerificationReport> {
    const parsedResult = await this.parseVerificationResult(result, contract, formats);
    
    return {
      report_id: this.generateReportId(),
      contract_id: contract.contract_id,
      execution_result: result,
      outputs: parsedResult.formatted_outputs,
      primary_output: formats?.[0] || 'json',
      metadata: {
        generated_at: new Date().toISOString(),
        generator_version: '1.0.0',
        format_count: parsedResult.formatted_outputs.length,
        total_size_bytes: parsedResult.formatted_outputs.reduce(
          (sum, output) => sum + (output.content?.length || 0),
          0
        ),
      },
      verification_summary: {
        // Legacy summary keys retained for backward compatibility
        overall_verified: result.verification?.verified || false,
        overall_compliant: parsedResult.compliance_analysis.overall_compliant,
        quality_score: result.verification?.quality_score || 0,
        // Current summary keys
        all_requirements_met: result.verification?.verified || false,
        compliance_status: parsedResult.compliance_analysis.overall_compliant ? 'compliant' : 'non_compliant',
        findings: parsedResult.compliance_analysis.failed_checks || [],
        recommendations: parsedResult.compliance_analysis.recommendations || [],
      },
    };
  }
  
  /**
   * Validate parsed result against strict criteria
   */
  validateParsedResult(parsedResult: ParsedVerificationResult): ValidationReport {
    const issues: Array<{ severity: 'error' | 'warning'; message: string }> = [];
    
    // Check if execution was successful
    if (!parsedResult.execution_result.success) {
      issues.push({
        severity: 'error',
        message: 'Task execution failed',
      });
    }
    
    // Check if any formats failed to generate
    if (parsedResult.formatted_outputs.length === 0) {
      issues.push({
        severity: 'error',
        message: 'No formatted outputs generated',
      });
    }
    
    // Check compliance score
    if (parsedResult.compliance_analysis.compliance_score < 0.8) {
      issues.push({
        severity: parsedResult.compliance_analysis.compliance_score < 0.5 ? 'error' : 'warning',
        message: `Low compliance score: ${(parsedResult.compliance_analysis.compliance_score * 100).toFixed(1)}%`,
      });
    }
    
    // Check for failed compliance checks
    if (parsedResult.compliance_analysis.failed_checks.length > 0) {
      issues.push({
        severity: 'warning',
        message: `Failed compliance checks: ${parsedResult.compliance_analysis.failed_checks.join(', ')}`,
      });
    }
    
    // Check format generation success
    const expectedFormats = this.config.auto_generate_formats.length;
    const actualFormats = parsedResult.formatted_outputs.length;
    if (actualFormats < expectedFormats) {
      issues.push({
        severity: 'warning',
        message: `Only ${actualFormats}/${expectedFormats} expected formats generated`,
      });
    }
    
    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      summary: {
        total_issues: issues.length,
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
      },
    };
  }
  
  // Private helper methods
  
  private analyzeCompliance(
    result: TaskExecutionResult,
    contract: DelegationContract,
    formattedOutputs: FormattedVerificationOutput[]
  ) {
    const failedChecks: string[] = [];
    const recommendations: string[] = [];
    let cumulativeScore = 0;
    let checkCount = 0;
    
    // Aggregate compliance scores from formatted outputs
    for (const output of formattedOutputs) {
      if (output.validation) {
        cumulativeScore += output.validation.compliance_score;
        checkCount++;
        
        // Collect failed checks
        for (const check of output.validation.compliance_checks) {
          if (!check.passed) {
            failedChecks.push(check.check_name);
          }
        }
      }
    }
    
    const overallCompliance = checkCount > 0 ? cumulativeScore / checkCount : 0;
    
    // Basic compliance recommendations
    if (!result.success) {
      recommendations.push('Task execution must be successful for compliance');
    }
    
    if (!result.verification?.verified) {
      recommendations.push('Task output should be properly verified');
    }
    
    if (overallCompliance < 0.8) {
      recommendations.push('Address compliance violations to meet contract requirements');
    }
    
    return {
      overall_compliant: overallCompliance >= 0.8 && result.success,
      compliance_score: overallCompliance,
      failed_checks: [...new Set(failedChecks)], // Remove duplicates
      recommendations: [...new Set(recommendations)], // Remove duplicates
    };
  }
  
  private generateReportId(): string {
    return `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Validation report for parsed verification results
 */
interface ValidationReport {
  valid: boolean;
  issues: Array<{ severity: 'error' | 'warning'; message: string }>;
  summary: {
    total_issues: number;
    errors: number;
    warnings: number;
  };
}

/**
 * AgentRuntime integration for verification output
 * 
 * Extends AgentRuntime with verification output formatting capabilities.
 */
export class VerificationIntegration {
  private parser: VerificationOutputParser;
  
  constructor(config?: Partial<VerificationParserConfig>) {
    this.parser = new VerificationOutputParser(config);
  }
  
  /**
   * Process task execution result with verification output formatting
   */
  async processTaskResult(
    result: TaskExecutionResult,
    contract: DelegationContract,
    options?: {
      formats?: VerificationOutputFormat[];
      validate_strict?: boolean;
    }
  ): Promise<{
    parsedResult: ParsedVerificationResult;
    multiModalReport: MultiModalVerificationReport;
    validation?: ValidationReport;
  }> {
    const parsedResult = await this.parser.parseVerificationResult(
      result,
      contract,
      options?.formats
    );
    
    const multiModalReport = await this.parser.generateMultiModalReport(
      result,
      contract,
      options?.formats
    );
    
    let validation: ValidationReport | undefined;
    if (options?.validate_strict) {
      validation = this.parser.validateParsedResult(parsedResult);
    }
    
    return {
      parsedResult,
      multiModalReport,
      validation,
    };
  }
  
  /**
   * Enhanced verification with custom validation rules
   */
  async processTaskResultWithCustomRules(
    result: TaskExecutionResult,
    contract: DelegationContract,
    customRules: Array<{
      name: string;
      rule: (result: TaskExecutionResult, contract: DelegationContract) => boolean;
      error_message: string;
    }>,
    options?: { formats?: VerificationOutputFormat[] }
  ): Promise<ParsedVerificationResult> {
    // Create parser with custom rules
    const customParser = new VerificationOutputParser({
      ...this.parser['config'],
      custom_validation_rules: customRules,
    });
    
    return customParser.parseVerificationResult(result, contract, options?.formats);
  }
  
  /**
   * Get available output formats
   */
  getAvailableFormats(): VerificationOutputFormat[] {
    return ['json', 'yaml', 'markdown', 'html', 'xml', 'csv', 'plain_text', 'contract_compliance'];
  }
  
  /**
   * Validate format support
   */
  isFormatSupported(format: VerificationOutputFormat): boolean {
    return this.getAvailableFormats().includes(format);
  }
}

// Export types - all interfaces already exported at declaration (lines 33, 51, 316)
/**
 * DCYFR Verification Output Formatter Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive test suite for verification output formatting system
 * including multi-modal formatters, contract compliance, and parser integration.
 * 
 * @module tests/verification/verification-output-formatters.test
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StandardVerificationFormatter,
  ContractComplianceFormatter,
} from '../../src/verification/multi-modal-formatters';
import {
  VerificationOutputParser,
  VerificationIntegration,
  type VerificationParserConfig,
} from '../../src/verification/parser-integration';
import type {
  VerificationFormatterConfig,
  VerificationOutputFormat,
} from '../../src/verification/output-formatter';
import type {
  DelegationContract,
  VerificationResult,
} from '../../src/types/delegation-contracts';
import type { TaskExecutionResult } from '../../src/runtime/agent-runtime';

// Test fixtures
const mockContract: DelegationContract = {
  contract_id: 'test_contract_001',
  delegator_agent_id: 'agent_delegator',
  delegatee_agent_id: 'agent_delegatee',
  task: {
    description: 'Test task for verification formatting',
    parameters: { input: 'test data' },
  },
  verification_policy: 'automated',
  success_criteria: {
    output_schema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['result'],
    },
    quality_threshold: 0.8,
    performance_requirements: {
      max_execution_time_ms: 5000,
      max_memory_mb: 100,
    },
    output_formats: ['json', 'markdown'],
  },
  tlp_classification: 'TLP:AMBER',
  created_at: '2026-02-13T10:00:00Z',
  expires_at: '2026-02-13T11:00:00Z',
  timeout_ms: 5000,
};

const mockSuccessfulResult: TaskExecutionResult = {
  context: {
    execution_id: 'exec_001',
    task: mockContract.task,
    metadata: {
      started_at: '2026-02-13T10:00:00Z',
      agent_id: 'agent_delegatee',
      runtime_version: '1.0.0',
    },
  },
  success: true,
  output: {
    result: 'Test task completed successfully',
    confidence: 0.95,
    additional_data: 'Extra information',
  },
  metrics: {
    execution_time_ms: 2500,
    peak_memory_mb: 45,
    cpu_time_ms: 2000,
    network_bytes: 1024,
  },
  verification: {
    verified: true,
    verification_method: 'automated_schema_validation',
    verified_by: 'internal_validator',
    quality_score: 0.92,
    verification_details: 'Schema validation passed',
  },
  completed_at: '2026-02-13T10:00:02.5Z',
};

const mockFailedResult: TaskExecutionResult = {
  context: {
    execution_id: 'exec_002',
    task: mockContract.task,
    metadata: {
      started_at: '2026-02-13T10:00:00Z',
      agent_id: 'agent_delegatee',
      runtime_version: '1.0.0',
    },
  },
  success: false,
  error: {
    type: 'ValidationError',
    message: 'Required field "result" missing from output',
    details: { field: 'result', expected_type: 'string' },
  },
  metrics: {
    execution_time_ms: 1500,
    peak_memory_mb: 25,
  },
  completed_at: '2026-02-13T10:00:01.5Z',
};

const defaultFormatterConfig: VerificationFormatterConfig = {
  include_content_hash: true,
  include_debug_info: false,
  max_content_size_bytes: 1024 * 1024,
  metadata_options: {
    include_timing_data: true,
    include_resource_usage: true,
    include_error_details: true,
    include_contract_metadata: true,
  },
};

describe('StandardVerificationFormatter', () => {
  let formatter: StandardVerificationFormatter;

  beforeEach(() => {
    formatter = new StandardVerificationFormatter(defaultFormatterConfig);
  });

  describe('JSON Format', () => {
    it('should format successful result as JSON', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'json');

      expect(output.format).toBe('json');
      expect(output.mime_type).toBe('application/json');
      expect(output.content).toContain(mockContract.contract_id);
      expect(output.content).toContain('Test task completed successfully');
      expect(output.validation.contract_compliant).toBe(true);

      // Validate JSON structure
      const parsed = JSON.parse(output.content);
      expect(parsed).toMatchObject({
        contract_id: mockContract.contract_id,
        execution_result: expect.objectContaining({
          success: true,
          output: expect.objectContaining({
            result: 'Test task completed successfully',
            confidence: 0.95,
          }),
        }),
        contract_verification: expect.objectContaining({
          verification_policy: 'automated',
        }),
      });
    });

    it('should format failed result as JSON', async () => {
      const output = await formatter.formatOutput(mockFailedResult, mockContract, 'json');

      expect(output.format).toBe('json');
      expect(output.validation.contract_compliant).toBe(false);

      const parsed = JSON.parse(output.content);
      expect(parsed.execution_result.success).toBe(false);
      expect(parsed.execution_result.error).toMatchObject({
        type: 'ValidationError',
        message: 'Required field "result" missing from output',
      });
    });
  });

  describe('Markdown Format', () => {
    it('should format successful result as markdown', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'markdown');

      expect(output.format).toBe('markdown');
      expect(output.mime_type).toBe('text/markdown');
      expect(output.content).toContain('# Verification Report');
      expect(output.content).toContain('✅ SUCCESS');
      expect(output.content).toContain('2500ms');
      expect(output.content).toContain('test_contract_001');
    });

    it('should format failed result as markdown', async () => {
      const output = await formatter.formatOutput(mockFailedResult, mockContract, 'markdown');

      expect(output.content).toContain('❌ FAILED');
      expect(output.content).toContain('ValidationError');
      expect(output.content).toContain('Required field "result" missing');
    });
  });

  describe('HTML Format', () => {
    it('should format successful result as HTML', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'html');

      expect(output.format).toBe('html');
      expect(output.mime_type).toBe('text/html');
      expect(output.content).toContain('<!DOCTYPE html>');
      expect(output.content).toContain('<title>Verification Report');
      expect(output.content).toContain('status success');
      expect(output.content).toContain('test_contract_001');
    });

    it('should include CSS styles', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'html');

      expect(output.content).toContain('<style>');
      expect(output.content).toContain('font-family:');
      expect(output.content).toContain('.success');
      expect(output.content).toContain('.error');
    });
  });

  describe('XML Format', () => {
    it('should format successful result as XML', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'xml');

      expect(output.format).toBe('xml');
      expect(output.mime_type).toBe('application/xml');
      expect(output.content).toContain('<?xml version="1.0"');
      expect(output.content).toContain('<verification_report');
      expect(output.content).toContain('contract_id="test_contract_001"');
      expect(output.content).toContain('success="true"');
    });
  });

  describe('CSV Format', () => {
    it('should format result as CSV', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'csv');

      expect(output.format).toBe('csv');
      expect(output.mime_type).toBe('text/csv');
      
      const lines = output.content.split('\n');
      expect(lines[0]).toContain('contract_id,success,execution_time_ms');
      expect(lines[1]).toContain('test_contract_001,true,2500');
    });
  });

  describe('Plain Text Format', () => {
    it('should format result as plain text', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'plain_text');

      expect(output.format).toBe('plain_text');
      expect(output.mime_type).toBe('text/plain');
      expect(output.content).toContain('VERIFICATION REPORT');
      expect(output.content).toContain('SUCCESS');
      expect(output.content).toContain('test_contract_001');
    });
  });

  describe('Content Size Limits', () => {
    it('should truncate content exceeding size limit', async () => {
      const smallConfig: VerificationFormatterConfig = {
        ...defaultFormatterConfig,
        max_content_size_bytes: 100,
      };
      const smallFormatter = new StandardVerificationFormatter(smallConfig);

      const output = await smallFormatter.formatOutput(mockSuccessfulResult, mockContract, 'json');

      expect(output.content.length).toBeLessThanOrEqual(110); // 100 + truncation message
      expect(output.content).toContain('... (truncated)');
    });
  });

  describe('Metadata Generation', () => {
    it('should include proper metadata', async () => {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'json');

      expect(output.metadata).toMatchObject({
        formatted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        formatter_version: '1.0.0',
        contract_id: 'test_contract_001',
        content_size_bytes: output.content.length,
      });

      expect(output.metadata.content_hash).toBeDefined();
      expect(output.metadata.format_metadata).toBeDefined();
    });
  });
});

describe('ContractComplianceFormatter', () => {
  let formatter: ContractComplianceFormatter;

  beforeEach(() => {
    formatter = new ContractComplianceFormatter(defaultFormatterConfig);
  });

  it('should generate compliance-focused report', async () => {
    const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'json');

    expect(output.format).toBe('contract_compliance');
    expect(output.mime_type).toBe('application/vnd.dcyfr.verification+json');

    const parsed = JSON.parse(output.content);
    expect(parsed.compliance_report).toBeDefined();
    expect(parsed.compliance_report.header).toMatchObject({
      contract_id: 'test_contract_001',
      report_type: 'delegation_contract_compliance',
      tlp_classification: 'TLP:AMBER',
    });

    expect(parsed.compliance_report.executive_summary).toBeDefined();
    expect(parsed.compliance_report.detailed_compliance_checks).toBeInstanceOf(Array);
    expect(parsed.compliance_report.audit_trail).toBeDefined();
  });

  it('should include compliance recommendations', async () => {
    const output = await formatter.formatOutput(mockFailedResult, mockContract, 'json');

    const parsed = JSON.parse(output.content);
    expect(parsed.compliance_report.recommendations).toBeInstanceOf(Array);
    expect(parsed.compliance_report.recommendations.length).toBeGreaterThan(0);
    
    const criticalRec = parsed.compliance_report.recommendations.find(
      (r: any) => r.priority === 'CRITICAL'
    );
    expect(criticalRec).toBeDefined();
    expect(criticalRec.description).toContain('execution failed');
  });

  it('should generate audit trail', async () => {
    const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, 'json');

    const parsed = JSON.parse(output.content);
    expect(parsed.compliance_report.audit_trail).toMatchObject({
      task_execution: expect.objectContaining({
        started_at: '2026-02-13T10:00:00Z',
        completed_at: '2026-02-13T10:00:02.5Z',
        execution_context: expect.objectContaining({
          execution_id: 'exec_001',
        }),
      }),
      compliance_evaluation: expect.objectContaining({
        evaluation_method: 'automated_contract_validation',
        evaluator: 'ContractComplianceFormatter',
      }),
    });
  });
});

describe('VerificationOutputParser', () => {
  let parser: VerificationOutputParser;
  let config: VerificationParserConfig;

  beforeEach(() => {
    config = {
      strict_validation: true,
      auto_generate_formats: ['json', 'markdown', 'contract_compliance'],
      default_formatter_config: defaultFormatterConfig,
    };
    parser = new VerificationOutputParser(config);
  });

  it('should parse successful result with multiple formats', async () => {
    const parsed = await parser.parseVerificationResult(mockSuccessfulResult, mockContract);

    expect(parsed.execution_result).toBe(mockSuccessfulResult);
    expect(parsed.contract).toBe(mockContract);
    expect(parsed.formatted_outputs).toHaveLength(3); // json, markdown, contract_compliance

    const formats = parsed.formatted_outputs.map(o => o.format);
    expect(formats).toContain('json');
    expect(formats).toContain('markdown');
    expect(formats).toContain('contract_compliance');

    expect(parsed.compliance_analysis.overall_compliant).toBe(true);
    expect(parsed.compliance_analysis.compliance_score).toBeGreaterThan(0.8);
  });

  it('should parse failed result with compliance issues', async () => {
    const parsed = await parser.parseVerificationResult(mockFailedResult, mockContract);

    expect(parsed.compliance_analysis.overall_compliant).toBe(false);
    expect(parsed.compliance_analysis.failed_checks.length).toBeGreaterThan(0);
    expect(parsed.compliance_analysis.recommendations.length).toBeGreaterThan(0);
  });

  it('should generate multi-modal report', async () => {
    const report = await parser.generateMultiModalReport(mockSuccessfulResult, mockContract, ['html', 'xml']);

    expect(report.report_id).toMatch(/^verify_\d+_/);
    expect(report.contract_id).toBe('test_contract_001');
    expect(report.outputs.length).toBeGreaterThan(3); // auto formats + additional

    expect(report.verification_summary).toMatchObject({
      overall_verified: true,
      overall_compliant: true,
      quality_score: 0.92,
    });
  });

  it('should validate parsed results', async () => {
    const parsed = await parser.parseVerificationResult(mockSuccessfulResult, mockContract);
    const validation = parser.validateParsedResult(parsed);

    expect(validation.valid).toBe(true);
    expect(validation.summary.errors).toBe(0);
  });

  it('should identify validation issues in failed results', async () => {
    const parsed = await parser.parseVerificationResult(mockFailedResult, mockContract);
    const validation = parser.validateParsedResult(parsed);

    expect(validation.valid).toBe(false);
    expect(validation.summary.errors).toBeGreaterThan(0);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: 'Task execution failed',
      })
    );
  });

  it('should support custom validation rules', async () => {
    const customConfig = {
      ...config,
      custom_validation_rules: [
        {
          name: 'confidence_threshold',
          rule: (result: TaskExecutionResult) => {
            return result.output?.confidence >= 0.9;
          },
          error_message: 'Confidence score must be at least 90%',
        },
      ],
    };

    const customParser = new VerificationOutputParser(customConfig);
    const parsed = await customParser.parseVerificationResult(mockSuccessfulResult, mockContract);

    expect(parsed.compliance_analysis.overall_compliant).toBe(true);

    // Test with lower confidence
    const lowConfidenceResult = {
      ...mockSuccessfulResult,
      output: { ...mockSuccessfulResult.output, confidence: 0.85 },
    };

    const lowConfidenceParsed = await customParser.parseVerificationResult(lowConfidenceResult, mockContract);
    expect(lowConfidenceParsed.compliance_analysis.overall_compliant).toBe(false);
    expect(lowConfidenceParsed.compliance_analysis.failed_checks).toContain('confidence_threshold');
  });
});

describe('VerificationIntegration', () => {
  let integration: VerificationIntegration;

  beforeEach(() => {
    integration = new VerificationIntegration({
      strict_validation: true,
      auto_generate_formats: ['json', 'markdown'],
      default_formatter_config: defaultFormatterConfig,
    });
  });

  it('should process task result with all features', async () => {
    const result = await integration.processTaskResult(
      mockSuccessfulResult,
      mockContract,
      {
        formats: ['html', 'xml'],
        validate_strict: true,
      }
    );

    expect(result.parsedResult).toBeDefined();
    expect(result.multiModalReport).toBeDefined();
    expect(result.validation).toBeDefined();

    expect(result.parsedResult.formatted_outputs.length).toBeGreaterThan(2);
    expect(result.validation?.valid).toBe(true);
  });

  it('should support custom validation rules', async () => {
    const customRules = [
      {
        name: 'execution_time_limit',
        rule: (result: TaskExecutionResult) => result.metrics.execution_time_ms <= 3000,
        error_message: 'Execution time exceeded 3 second limit',
      },
    ];

    const result = await integration.processTaskResultWithCustomRules(
      mockSuccessfulResult,
      mockContract,
      customRules
    );

    expect(result.compliance_analysis.overall_compliant).toBe(true);

    // Test with slow execution
    const slowResult = {
      ...mockSuccessfulResult,
      metrics: { ...mockSuccessfulResult.metrics, execution_time_ms: 4000 },
    };

    const slowResultParsed = await integration.processTaskResultWithCustomRules(
      slowResult,
      mockContract,
      customRules
    );

    expect(slowResultParsed.compliance_analysis.overall_compliant).toBe(false);
    expect(slowResultParsed.compliance_analysis.failed_checks).toContain('execution_time_limit');
  });

  it('should list available formats', () => {
    const formats = integration.getAvailableFormats();
    expect(formats).toEqual([
      'json', 'yaml', 'markdown', 'html', 'xml', 'csv', 'plain_text', 'contract_compliance'
    ]);
  });

  it('should validate format support', () => {
    expect(integration.isFormatSupported('json')).toBe(true);
    expect(integration.isFormatSupported('markdown')).toBe(true);
    expect(integration.isFormatSupported('invalid_format' as any)).toBe(false);
  });
});

describe('Format Integration Tests', () => {
  let formatter: StandardVerificationFormatter;

  beforeEach(() => {
    formatter = new StandardVerificationFormatter(defaultFormatterConfig);
  });

  it('should maintain content integrity across formats', async () => {
    const formats: VerificationOutputFormat[] = ['json', 'markdown', 'html', 'xml', 'plain_text'];
    const outputs = await Promise.all(
      formats.map(format => formatter.formatOutput(mockSuccessfulResult, mockContract, format))
    );

    // All outputs should contain key information
    for (const output of outputs) {
      expect(output.content).toContain('test_contract_001');
      expect(output.content).toContain('2500'); // execution time
      expect(output.validation.contract_compliant).toBe(true);
    }
  });

  it('should handle large outputs gracefully', async () => {
    const largeOutput = {
      ...mockSuccessfulResult,
      output: {
        result: 'Large data follows',
        data: 'x'.repeat(10000), // Large string
      },
    };

    const output = await formatter.formatOutput(largeOutput, mockContract, 'json');
    expect(output.content.length).toBeLessThan(1024 * 1024); // Within limit
    expect(output.metadata.content_size_bytes).toBeLessThan(1024 * 1024);
  });

  it('should preserve contract compliance across all formats', async () => {
    const formats: VerificationOutputFormat[] = ['json', 'yaml', 'markdown', 'html', 'xml', 'csv', 'plain_text'];
    
    for (const format of formats) {
      const output = await formatter.formatOutput(mockSuccessfulResult, mockContract, format);
      expect(output.validation.contract_compliant).toBe(true);
      expect(output.validation.compliance_score).toBeGreaterThan(0.8);
    }
  });
});
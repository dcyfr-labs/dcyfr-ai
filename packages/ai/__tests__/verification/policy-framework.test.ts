/**
 * DCYFR Verification Policy Framework Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive tests for all verification modes.
 * 
 * @module __tests__/verification/policy-framework.test
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VerificationPolicyFramework,
  DirectInspectionVerifier,
  ThirdPartyAuditVerifier,
  CryptographicProofVerifier,
  HumanRequiredVerifier,
  type VerificationContext,
} from '../../verification/policy-framework';

describe('VerificationPolicyFramework', () => {
  let framework: VerificationPolicyFramework;
  
  beforeEach(() => {
    framework = VerificationPolicyFramework.createDefault({
      verifierId: 'test-verifier',
      auditorId: 'test-auditor',
      humanReviewerId: 'test-human',
    });
  });
  
  describe('initialization', () => {
    it('should create default framework with all verifiers', () => {
      expect(framework).toBeDefined();
      expect(framework.getVerifier('direct_inspection')).toBeDefined();
      expect(framework.getVerifier('third_party_audit')).toBeDefined();
      expect(framework.getVerifier('cryptographic_proof')).toBeDefined();
      expect(framework.getVerifier('human_required')).toBeDefined();
    });
    
    it('should allow custom verifier registration', () => {
      const customFramework = new VerificationPolicyFramework();
      const verifier = new DirectInspectionVerifier('custom-verifier');
      
      customFramework.registerVerifier(verifier);
      
      expect(customFramework.getVerifier('direct_inspection')).toBe(verifier);
    });
    
    it('should return null for unregistered policy', () => {
      const customFramework = new VerificationPolicyFramework();
      expect(customFramework.getVerifier('direct_inspection')).toBeNull();
    });
  });
  
  describe('DirectInspectionVerifier', () => {
    const createContext = (overrides?: Partial<VerificationContext>): VerificationContext => ({
      contract_id: 'contract-1',
      task_output: { result: 'success' },
      task_description: 'Test task',
      success_criteria: {
        quality_threshold: 0.7,
      },
      delegatee_agent_id: 'agent-1',
      delegator_agent_id: 'agent-0',
      completion_time_ms: 1000,
      ...overrides,
    });
    
    it('should verify simple output successfully', async () => {
      const context = createContext();
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.verified).toBe(true);
      expect(result.verification_method).toBe('direct_inspection');
      expect(result.verified_by).toBe('test-verifier');
      expect(result.quality_score).toBeGreaterThan(0);
    });
    
    it('should fail verification for null output', async () => {
      const context = createContext({
        task_output: null,
        success_criteria: {
          quality_threshold: 0.5,
        },
      });
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.verified).toBe(false);
      expect(result.findings?.failed_checks?.length).toBeGreaterThan(0);
    });
    
    it('should check required checks', async () => {
      const context = createContext({
        task_output: { data: 'test' },
        success_criteria: {
          required_checks: ['not_null', 'is_object'],
        },
      });
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.findings?.passed_checks).toContain('not_null');
      expect(result.findings?.passed_checks).toContain('is_object');
    });
    
    it('should validate output schema', async () => {
      const context = createContext({
        task_output: { name: 'test', value: 42 },
        success_criteria: {
          output_schema: {
            name: 'string',
            value: 'number',
          },
        },
      });
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.findings?.passed_checks).toContain('output_schema');
    });
    
    it('should fail schema validation for missing keys', async () => {
      const context = createContext({
        task_output: { name: 'test' },
        success_criteria: {
          output_schema: {
            name: 'string',
            value: 'number',
            missing_key: 'string',
          },
        },
      });
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.findings?.failed_checks).toContain('output_schema');
    });
    
    it('should check performance requirements', async () => {
      const context = createContext({
        completion_time_ms: 500,
        success_criteria: {
          performance_requirements: {
            max_completion_time_ms: 1000,
          },
        },
      });
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.findings?.passed_checks).toContain('performance_requirements');
    });
    
    it('should warn about performance violations', async () => {
      const context = createContext({
        completion_time_ms: 5000,
        success_criteria: {
          performance_requirements: {
            max_completion_time_ms: 1000,
          },
        },
      });
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.findings?.warnings).toContain('performance_requirements_exceeded');
    });
    
    it('should assess string output quality', async () => {
      const longString = 'a'.repeat(200);
      const context = createContext({
        task_output: longString,
        success_criteria: {
          quality_threshold: 0.8,
        },
      });
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result.quality_score).toBeGreaterThan(0.7);
    });
  });
  
  describe('ThirdPartyAuditVerifier', () => {
    it('should perform third-party audit', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-2',
        task_output: { result: 'audited' },
        task_description: 'Audit task',
        success_criteria: {
          quality_threshold: 0.7,
        },
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 2000,
      };
      
      const result = await framework.verify('third_party_audit', context);
      
      expect(result.verification_method).toBe('third_party_audit');
      expect(result.verified_by).toBe('test-auditor');
      expect(result.metadata?.audit_type).toBe('third_party');
      expect(result.metadata?.auditor_agent_id).toBe('test-auditor');
    });
    
    it('should include audit checks in findings', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-3',
        task_output: { result: 'test' },
        task_description: 'Test task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 1500,
      };
      
      const result = await framework.verify('third_party_audit', context);
      
      const totalChecks = (result.findings?.passed_checks?.length ?? 0) + 
                         (result.findings?.failed_checks?.length ?? 0);
      
      expect(totalChecks).toBeGreaterThan(0);
    });
    
    it('should compute quality score based on audit results', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-4',
        task_output: { result: 'test' },
        task_description: 'Test task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 1000,
      };
      
      const result = await framework.verify('third_party_audit', context);
      
      expect(result.quality_score).toBeDefined();
      expect(result.quality_score).toBeGreaterThan(0);
      expect(result.quality_score).toBeLessThanOrEqual(1.0);
    });
  });
  
  describe('CryptographicProofVerifier', () => {
    it('should verify cryptographic signature', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-5',
        task_output: { result: 'signed' },
        task_description: 'Crypto task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 500,
        metadata: {
          signature: 'abc123def456',
        },
      };
      
      const result = await framework.verify('cryptographic_proof', context);
      
      expect(result.verification_method).toBe('cryptographic_proof');
      expect(result.findings?.passed_checks).toContain('signature_verification');
      expect(result.metadata?.signature_checked).toBe(true);
    });
    
    it('should verify cryptographic hash', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-6',
        task_output: { result: 'hashed' },
        task_description: 'Hash task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 500,
        metadata: {
          hash: '0'.repeat(64), // SHA-256 hash length
        },
      };
      
      const result = await framework.verify('cryptographic_proof', context);
      
      expect(result.findings?.passed_checks).toContain('hash_verification');
      expect(result.metadata?.hash_checked).toBe(true);
    });
    
    it('should verify zero-knowledge proof', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-7',
        task_output: { result: 'zk-proven' },
        task_description: 'ZK task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 500,
        metadata: {
          proof: {
            type: 'zk-snark',
            data: 'proof_data',
          },
        },
      };
      
      const result = await framework.verify('cryptographic_proof', context);
      
      expect(result.findings?.passed_checks).toContain('zk_proof_verification');
      expect(result.metadata?.proof_checked).toBe(true);
    });
    
    it('should warn about missing cryptographic elements', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-8',
        task_output: { result: 'unsigned' },
        task_description: 'No crypto task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 500,
      };
      
      const result = await framework.verify('cryptographic_proof', context);
      
      expect(result.findings?.warnings).toContain('no_signature_provided');
      expect(result.findings?.warnings).toContain('no_hash_provided');
    });
    
    it('should fail verification for invalid signature', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-9',
        task_output: { result: 'bad signature' },
        task_description: 'Invalid sig task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 500,
        metadata: {
          signature: '', // Empty signature
        },
      };
      
      const result = await framework.verify('cryptographic_proof', context);
      
      expect(result.findings?.failed_checks).toContain('signature_verification');
    });
    
    it('should fail verification for short hash', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-10',
        task_output: { result: 'short hash' },
        task_description: 'Short hash task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 500,
        metadata: {
          hash: '123', // Too short
        },
      };
      
      const result = await framework.verify('cryptographic_proof', context);
      
      expect(result.findings?.failed_checks).toContain('hash_verification');
    });
  });
  
  describe('HumanRequiredVerifier', () => {
    it('should require human review', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-11',
        task_output: { result: 'needs human review' },
        task_description: 'Human task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 3000,
      };
      
      const result = await framework.verify('human_required', context);
      
      expect(result.verification_method).toBe('human_required');
      expect(result.verified).toBe(false); // Pending review
      expect(result.verified_by).toBe('test-human');
      expect(result.metadata?.review_status).toBe('pending');
      expect(result.metadata?.human_review_required).toBe(true);
    });
    
    it('should include pending warning', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-12',
        task_output: { result: 'test' },
        task_description: 'Test task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 1000,
      };
      
      const result = await framework.verify('human_required', context);
      
      expect(result.findings?.warnings).toContain('human_review_pending');
    });
    
    it('should complete human review with approval', async () => {
      const verifier = new HumanRequiredVerifier('human-reviewer');
      
      const context: VerificationContext = {
        contract_id: 'contract-13',
        task_output: { result: 'approved' },
        task_description: 'Approval task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 2000,
      };
      
      const result = await verifier.completeReview(context, true, {
        comments: 'Looks good',
        quality_score: 0.95,
        passed_checks: ['manual_review', 'content_quality'],
      });
      
      expect(result.verified).toBe(true);
      expect(result.quality_score).toBe(0.95);
      expect(result.metadata?.review_status).toBe('completed');
      expect(result.metadata?.comments).toBe('Looks good');
      expect(result.findings?.passed_checks).toContain('manual_review');
    });
    
    it('should complete human review with rejection', async () => {
      const verifier = new HumanRequiredVerifier('human-reviewer');
      
      const context: VerificationContext = {
        contract_id: 'contract-14',
        task_output: { result: 'rejected' },
        task_description: 'Rejection task',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 2000,
      };
      
      const result = await verifier.completeReview(context, false, {
        comments: 'Does not meet requirements',
        quality_score: 0.3,
        failed_checks: ['content_accuracy', 'completeness'],
      });
      
      expect(result.verified).toBe(false);
      expect(result.quality_score).toBe(0.3);
      expect(result.metadata?.comments).toBe('Does not meet requirements');
      expect(result.findings?.failed_checks).toContain('content_accuracy');
    });
  });
  
  describe('framework integration', () => {
    it('should throw error for unregistered policy', async () => {
      const customFramework = new VerificationPolicyFramework();
      
      const context: VerificationContext = {
        contract_id: 'contract-15',
        task_output: { result: 'test' },
        task_description: 'Test',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 1000,
      };
      
      await expect(
        customFramework.verify('direct_inspection', context)
      ).rejects.toThrow('No verifier registered');
    });
    
    it('should support multiple verifier instances', () => {
      const customFramework = new VerificationPolicyFramework();
      
      const verifier1 = new DirectInspectionVerifier('verifier-1');
      const verifier2 = new DirectInspectionVerifier('verifier-2');
      
      customFramework.registerVerifier(verifier1);
      customFramework.registerVerifier(verifier2);
      
      const retrieved = customFramework.getVerifier('direct_inspection');
      expect(retrieved).toBe(verifier2); // Last registered wins
    });
  });
  
  describe('edge cases', () => {
    it('should handle empty success criteria', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-16',
        task_output: { result: 'test' },
        task_description: 'Test',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 1000,
      };
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result).toBeDefined();
      expect(result.verified).toBe(true); // No criteria = pass by default
    });
    
    it('should handle very large output', async () => {
      const largeOutput = { data: 'x'.repeat(100000) };
      
      const context: VerificationContext = {
        contract_id: 'contract-17',
        task_output: largeOutput,
        task_description: 'Large output task',
        success_criteria: {
          quality_threshold: 0.5,
        },
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 5000,
      };
      
      const result = await framework.verify('direct_inspection', context);
      
      expect(result).toBeDefined();
    });
    
    it('should handle undefined metadata', async () => {
      const context: VerificationContext = {
        contract_id: 'contract-18',
        task_output: { result: 'test' },
        task_description: 'Test',
        success_criteria: {},
        delegatee_agent_id: 'agent-1',
        delegator_agent_id: 'agent-0',
        completion_time_ms: 1000,
        metadata: undefined,
      };
      
      const result = await framework.verify('cryptographic_proof', context);
      
      expect(result).toBeDefined();
      expect(result.findings?.warnings).toContain('no_signature_provided');
    });
  });
});

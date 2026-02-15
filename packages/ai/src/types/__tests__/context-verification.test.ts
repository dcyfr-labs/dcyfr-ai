/**
 * Tests for Context Verification Types and Assessment
 * TLP:CLEAR
 * 
 * Validates the Anti-Assumption Protocol types including:
 * - ContextSufficiencyAssessment creation and evaluation
 * - Information gap tracking
 * - Assumption declaration and risk scoring
 * - Configuration thresholds
 * 
 * @test context-verification
 * @version 1.0.0
 * @date 2026-02-14
 */

import { describe, it, expect } from 'vitest';
import {
  createAssessment,
  evaluateAssessment,
  DEFAULT_CONTEXT_VERIFICATION_CONFIG,
  type ContextSufficiencyAssessment,
  type ContextVerificationConfig,
  type InformationItem,
  type InformationGap,
} from '../../types/context-verification.js';

describe('Context Verification (Anti-Assumption Protocol)', () => {
  describe('createAssessment', () => {
    it('should create a minimal assessment with defaults', () => {
      const assessment = createAssessment('agent-1', 'Implement button component');

      expect(assessment.agent_id).toBe('agent-1');
      expect(assessment.task_description).toBe('Implement button component');
      expect(assessment.overall_confidence).toBe(0);
      expect(assessment.decision).toBe('gather_context');
      expect(assessment.information_items).toEqual([]);
      expect(assessment.information_gaps).toEqual([]);
      expect(assessment.assumptions).toEqual([]);
      expect(assessment.assessment_id).toMatch(/^csa_/);
      expect(assessment.assessed_at).toBeTruthy();
    });

    it('should accept overrides', () => {
      const assessment = createAssessment('agent-2', 'Fix API route', {
        overall_confidence: 0.9,
        decision: 'proceed',
        reasoning: 'All context verified from source code',
      });

      expect(assessment.overall_confidence).toBe(0.9);
      expect(assessment.decision).toBe('proceed');
      expect(assessment.reasoning).toBe('All context verified from source code');
    });

    it('should generate unique assessment IDs', () => {
      const a1 = createAssessment('agent-1', 'Task A');
      const a2 = createAssessment('agent-1', 'Task B');

      expect(a1.assessment_id).not.toBe(a2.assessment_id);
    });
  });

  describe('evaluateAssessment', () => {
    it('should allow proceeding when confidence is above threshold', () => {
      const assessment = createAssessment('agent-1', 'Simple fix', {
        overall_confidence: 0.85,
        information_items: [
          {
            description: 'Read the source file',
            classification: 'verified_fact',
            category: 'api_signatures',
            confidence: 0.95,
            verified: true,
            verification_method: 'source_read',
          },
        ],
      });

      const result = evaluateAssessment(assessment);

      expect(result.can_proceed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('should block when confidence is below threshold', () => {
      const assessment = createAssessment('agent-1', 'Complex refactor', {
        overall_confidence: 0.5,
      });

      const result = evaluateAssessment(assessment);

      expect(result.can_proceed).toBe(false);
      expect(result.blockers).toContain(
        'Confidence 0.50 is below threshold 0.7'
      );
    });

    it('should block when too many unverified assumptions', () => {
      const assessment = createAssessment('agent-1', 'Multi-package change', {
        overall_confidence: 0.8,
        assumptions: [
          { assumption: 'File is at src/utils/', risk_if_wrong: 'medium', reason_unverified: 'Did not search' },
          { assumption: 'API accepts string', risk_if_wrong: 'high', reason_unverified: 'Guessed from name' },
          { assumption: 'Uses vitest', risk_if_wrong: 'low', reason_unverified: 'Common pattern' },
        ],
      });

      const result = evaluateAssessment(assessment);

      expect(result.can_proceed).toBe(false);
      expect(result.blockers.some(b => b.includes('unverified assumptions'))).toBe(true);
    });

    it('should block on critical-risk assumptions regardless of count', () => {
      const assessment = createAssessment('agent-1', 'Database migration', {
        overall_confidence: 0.9,
        assumptions: [
          { assumption: 'Database schema is unchanged', risk_if_wrong: 'critical', reason_unverified: 'Did not check migrations' },
        ],
      });

      const result = evaluateAssessment(assessment);

      expect(result.can_proceed).toBe(false);
      expect(result.blockers.some(b => b.includes('critical-risk'))).toBe(true);
    });

    it('should block on mandatory verification category gaps', () => {
      const assessment = createAssessment('agent-1', 'API route change', {
        overall_confidence: 0.8,
        information_gaps: [
          {
            description: 'Unknown API signature for endpoint',
            category: 'api_signatures',
            criticality: 'blocking',
            resolution_strategy: 'read_source',
            resolved: false,
          },
        ],
      });

      const result = evaluateAssessment(assessment);

      expect(result.can_proceed).toBe(false);
      expect(result.blockers.some(b => b.includes('api_signatures'))).toBe(true);
    });

    it('should allow proceeding when gaps are resolved', () => {
      const assessment = createAssessment('agent-1', 'API route change', {
        overall_confidence: 0.85,
        information_gaps: [
          {
            description: 'API signature verified',
            category: 'api_signatures',
            criticality: 'blocking',
            resolution_strategy: 'read_source',
            resolved: true,
            resolution: 'Read source at src/api/route.ts - confirmed params',
          },
        ],
      });

      const result = evaluateAssessment(assessment);

      expect(result.can_proceed).toBe(true);
    });

    it('should respect custom configuration thresholds', () => {
      const assessment = createAssessment('agent-1', 'Simple task', {
        overall_confidence: 0.6,
      });

      const strictConfig: ContextVerificationConfig = {
        ...DEFAULT_CONTEXT_VERIFICATION_CONFIG,
        minimum_confidence_threshold: 0.5, // Lower threshold
      };

      const result = evaluateAssessment(assessment, strictConfig);

      expect(result.can_proceed).toBe(true);
    });

    it('should accumulate multiple blockers', () => {
      const assessment = createAssessment('agent-1', 'Risky change', {
        overall_confidence: 0.4,
        assumptions: [
          { assumption: 'Config exists', risk_if_wrong: 'critical', reason_unverified: 'Guessed' },
          { assumption: 'Type is correct', risk_if_wrong: 'high', reason_unverified: 'Did not check' },
          { assumption: 'Pattern matches', risk_if_wrong: 'medium', reason_unverified: 'Assumed' },
        ],
        information_gaps: [
          {
            description: 'File path unknown',
            category: 'file_paths',
            criticality: 'blocking',
            resolution_strategy: 'search_codebase',
            resolved: false,
          },
        ],
      });

      const result = evaluateAssessment(assessment);

      expect(result.can_proceed).toBe(false);
      expect(result.blockers.length).toBeGreaterThanOrEqual(3); // confidence + assumptions + critical assumption + gap
    });
  });

  describe('DEFAULT_CONTEXT_VERIFICATION_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.minimum_confidence_threshold).toBe(0.7);
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.max_unverified_assumptions).toBe(2);
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.max_search_attempts_before_asking).toBe(2);
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.mandatory_verification_categories).toContain('api_signatures');
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.mandatory_verification_categories).toContain('file_paths');
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.mandatory_verification_categories).toContain('user_intent');
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.require_assumption_declaration).toBe(true);
      expect(DEFAULT_CONTEXT_VERIFICATION_CONFIG.require_cross_package_check).toBe(true);
    });
  });

  describe('InformationItem classification', () => {
    it('should support all classification types', () => {
      const items: InformationItem[] = [
        { description: 'Read from source', classification: 'verified_fact', category: 'api_signatures', confidence: 1.0, verified: true, verification_method: 'source_read' },
        { description: 'User told us', classification: 'user_stated', category: 'user_intent', confidence: 0.95, verified: true, verification_method: 'user_confirmation' },
        { description: 'Inferred from patterns', classification: 'inferred', category: 'conventions', confidence: 0.6, verified: false },
        { description: 'Just guessed', classification: 'assumed', category: 'file_paths', confidence: 0.3, verified: false },
        { description: 'Not investigated yet', classification: 'unknown', category: 'dependencies', confidence: 0, verified: false },
      ];

      // Verified facts should have highest confidence
      expect(items[0].confidence).toBeGreaterThan(items[2].confidence);
      // Assumptions should have low confidence
      expect(items[3].confidence).toBeLessThan(0.5);
      // Unknown should have zero confidence
      expect(items[4].confidence).toBe(0);
    });
  });

  describe('InformationGap resolution', () => {
    it('should track resolution strategies', () => {
      const gap: InformationGap = {
        description: 'Unknown file location for utility',
        category: 'file_paths',
        criticality: 'blocking',
        resolution_strategy: 'search_codebase',
        resolved: false,
      };

      expect(gap.resolved).toBe(false);
      expect(gap.resolution_strategy).toBe('search_codebase');

      // Simulate resolution
      const resolvedGap: InformationGap = {
        ...gap,
        resolved: true,
        resolution: 'Found at src/lib/utils/helpers.ts via grep search',
      };

      expect(resolvedGap.resolved).toBe(true);
      expect(resolvedGap.resolution).toContain('src/lib/utils/helpers.ts');
    });
  });
});

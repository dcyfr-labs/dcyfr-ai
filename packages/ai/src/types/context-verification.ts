/**
 * Context Verification Types for DCYFR AI Framework
 * TLP:CLEAR
 * 
 * Types for the Anti-Assumption Protocol — ensures agents verify context
 * sufficiency before making decisions. Prevents dead-end implementations,
 * recursive failures, and token waste from assumption-based decision making.
 * 
 * @module types/context-verification
 * @version 1.0.0
 * @date 2026-02-14
 */

/**
 * Classification of information an agent holds about a decision
 */
export type InformationClass = 
  | 'verified_fact'        // Read directly from source code, docs, or config
  | 'user_stated'          // Explicitly provided by the user
  | 'inferred'             // Pattern-matched or deduced from partial information
  | 'assumed'              // Guessed without verification
  | 'unknown';             // Information gap — not yet investigated

/**
 * Categories of information that commonly require verification
 */
export type VerificationCategory =
  | 'file_paths'           // Directory structure, file locations
  | 'api_signatures'       // Function parameters, return types, method names
  | 'configurations'       // Config values, env vars, feature flags
  | 'dependencies'         // Package versions, compatibility, relationships
  | 'conventions'          // Project patterns, naming conventions, best practices
  | 'user_intent'          // What the user actually wants (vs. what was asked)
  | 'cross_package_impact' // How changes affect other packages/consumers
  | 'existence'            // Whether something exists or doesn't
  | 'runtime_behavior'     // How code behaves at runtime
  | 'infrastructure';      // Deployment, CI/CD, environment specifics

/**
 * Individual information item tracked during context verification
 */
export interface InformationItem {
  /** What the agent believes or needs to know */
  description: string;
  
  /** How this information was obtained */
  classification: InformationClass;
  
  /** Category of information for systematic verification */
  category: VerificationCategory;
  
  /** Confidence in the accuracy of this information (0-1) */
  confidence: number;
  
  /** Source of the information (file path, user message, etc.) */
  source?: string;
  
  /** Whether this information has been verified against actual source */
  verified: boolean;
  
  /** Verification method used, if verified */
  verification_method?: 'source_read' | 'search' | 'user_confirmation' | 'test_execution' | 'type_check';
}

/**
 * An information gap that must be resolved before proceeding
 */
export interface InformationGap {
  /** What information is missing */
  description: string;
  
  /** Category of the missing information */
  category: VerificationCategory;
  
  /** How critical this gap is to the decision */
  criticality: 'blocking' | 'important' | 'nice_to_have';
  
  /** Suggested resolution approach */
  resolution_strategy: 
    | 'read_source'        // Read the actual source code 
    | 'search_codebase'    // Search for patterns/conventions
    | 'ask_user'           // Ask the user for clarification
    | 'run_test'           // Execute a test to verify behavior
    | 'check_types'        // Run type checker for signature verification
    | 'check_config'       // Read configuration files
    | 'defer';             // Can proceed without this, but note the gap
  
  /** Whether this gap has been resolved */
  resolved: boolean;
  
  /** Resolution details, if resolved */
  resolution?: string;
}

/**
 * Complete context sufficiency assessment
 * 
 * Agents must produce this assessment before taking non-trivial actions.
 * If overall_confidence < minimum_threshold, the agent should gather
 * more context or ask for clarification rather than proceeding.
 */
export interface ContextSufficiencyAssessment {
  /** Unique assessment identifier */
  assessment_id: string;
  
  /** Agent performing the assessment */
  agent_id: string;
  
  /** Task or decision being assessed */
  task_description: string;
  
  /** When the assessment was performed */
  assessed_at: string;
  
  /** 
   * Overall confidence in context sufficiency (0-1).
   * Below 0.7: MUST gather more context or ask for clarification.
   * 0.7-0.85: SHOULD state uncertainties explicitly before proceeding.
   * Above 0.85: May proceed with implementation.
   */
  overall_confidence: number;
  
  /** Facts and inferences the agent is working with */
  information_items: InformationItem[];
  
  /** Identified gaps in knowledge that affect the decision */
  information_gaps: InformationGap[];
  
  /** Assumptions the agent is making (should be minimized) */
  assumptions: Array<{
    /** What is being assumed */
    assumption: string;
    
    /** Risk if this assumption is wrong */
    risk_if_wrong: 'low' | 'medium' | 'high' | 'critical';
    
    /** Why verification wasn't possible */
    reason_unverified: string;
    
    /** Fallback plan if assumption proves incorrect */
    fallback?: string;
  }>;
  
  /** 
   * Decision: can the agent proceed, or must it gather more context?
   */
  decision: 'proceed' | 'gather_context' | 'ask_user' | 'escalate';
  
  /** Human-readable reasoning for the decision */
  reasoning: string;
  
  /** Specific actions to take if decision is not 'proceed' */
  next_actions?: Array<{
    action: string;
    category: VerificationCategory;
    priority: number;
  }>;
}

/**
 * Configuration for context verification behavior
 */
export interface ContextVerificationConfig {
  /** 
   * Minimum confidence threshold to proceed without gathering more context.
   * Default: 0.7
   */
  minimum_confidence_threshold: number;
  
  /** 
   * Maximum number of unverified assumptions allowed before blocking.
   * Default: 2
   */
  max_unverified_assumptions: number;
  
  /** 
   * Maximum number of search attempts before asking the user.
   * Default: 2 (the "two-search rule")
   */
  max_search_attempts_before_asking: number;
  
  /** 
   * Categories that MUST be verified (blocking if unverified).
   * Default: ['api_signatures', 'file_paths', 'user_intent']
   */
  mandatory_verification_categories: VerificationCategory[];
  
  /** 
   * Whether to require explicit assumption declaration.
   * Default: true
   */
  require_assumption_declaration: boolean;
  
  /** 
   * Whether cross-package impact must be checked for multi-package workspaces.
   * Default: true
   */
  require_cross_package_check: boolean;
}

/**
 * Default context verification configuration
 */
export const DEFAULT_CONTEXT_VERIFICATION_CONFIG: ContextVerificationConfig = {
  minimum_confidence_threshold: 0.7,
  max_unverified_assumptions: 2,
  max_search_attempts_before_asking: 2,
  mandatory_verification_categories: ['api_signatures', 'file_paths', 'user_intent'],
  require_assumption_declaration: true,
  require_cross_package_check: true,
};

/**
 * Helper to create a minimal context sufficiency assessment
 */
export function createAssessment(
  agent_id: string,
  task_description: string,
  overrides?: Partial<ContextSufficiencyAssessment>
): ContextSufficiencyAssessment {
  return {
    assessment_id: `csa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agent_id,
    task_description,
    assessed_at: new Date().toISOString(),
    overall_confidence: 0,
    information_items: [],
    information_gaps: [],
    assumptions: [],
    decision: 'gather_context',
    reasoning: 'Initial assessment — context gathering required',
    ...overrides,
  };
}

/**
 * Evaluate whether an assessment meets the verification threshold
 */
export function evaluateAssessment(
  assessment: ContextSufficiencyAssessment,
  config: ContextVerificationConfig = DEFAULT_CONTEXT_VERIFICATION_CONFIG
): { can_proceed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  
  // Check overall confidence
  if (assessment.overall_confidence < config.minimum_confidence_threshold) {
    blockers.push(
      `Confidence ${assessment.overall_confidence.toFixed(2)} is below threshold ${config.minimum_confidence_threshold}`
    );
  }
  
  // Check unverified assumptions
  const unverifiedCount = assessment.assumptions.length;
  if (unverifiedCount > config.max_unverified_assumptions) {
    blockers.push(
      `${unverifiedCount} unverified assumptions exceed maximum of ${config.max_unverified_assumptions}`
    );
  }
  
  // Check high-risk assumptions
  const criticalAssumptions = assessment.assumptions.filter(a => a.risk_if_wrong === 'critical');
  if (criticalAssumptions.length > 0) {
    blockers.push(
      `${criticalAssumptions.length} critical-risk assumption(s) must be verified: ${criticalAssumptions.map(a => a.assumption).join('; ')}`
    );
  }
  
  // Check mandatory categories
  for (const category of config.mandatory_verification_categories) {
    const hasUnresolvedGap = assessment.information_gaps.some(
      gap => gap.category === category && !gap.resolved && gap.criticality === 'blocking'
    );
    if (hasUnresolvedGap) {
      blockers.push(`Mandatory verification category '${category}' has unresolved blocking gaps`);
    }
  }
  
  return {
    can_proceed: blockers.length === 0,
    blockers,
  };
}

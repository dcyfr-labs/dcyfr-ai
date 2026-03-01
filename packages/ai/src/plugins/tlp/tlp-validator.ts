/**
 * TLP Clearance Validator for Plugin Marketplace
 *
 * Validates whether a user or agent has sufficient TLP clearance to
 * install or execute a plugin at a given classification level.
 *
 * Clearance hierarchy (permissive upward):
 *   CLEAR ⊂ GREEN ⊂ AMBER ⊂ RED
 *
 * A subject with clearance X may access any resource classified at X or below.
 *
 * Integration point: pair with classifyPlugin() from tlp-classifier.ts —
 * classify the plugin first, then call checkClearance() before installing.
 *
 * @module plugins/tlp/tlp-validator
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import {
  TlpLevel,
  TLP_RANK,
  TlpClearanceProfile,
  TlpClearanceCheckResult,
  TlpClassificationResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Core clearance check
// ---------------------------------------------------------------------------

/**
 * Checks whether a subject's clearance level permits access to a resource
 * at the given TLP classification.
 *
 * @param subject  - Subject's clearance profile
 * @param required - Required classification level of the resource
 * @returns TlpClearanceCheckResult — allowed flag + denial reason if blocked
 *
 * @example
 * ```ts
 * const result = checkClearance(
 *   { subjectId: 'user-123', clearance: 'GREEN' },
 *   'AMBER',
 * );
 * result.allowed; // false — GREEN < AMBER
 * ```
 */
export function checkClearance(
  subject: TlpClearanceProfile,
  required: TlpLevel,
): TlpClearanceCheckResult {
  const allowed = TLP_RANK[subject.clearance] >= TLP_RANK[required];

  return {
    allowed,
    subjectClearance: subject.clearance,
    requiredClearance: required,
    denyReason: allowed
      ? undefined
      : `Subject "${subject.subjectId}" has TLP:${subject.clearance} clearance ` +
        `but the resource requires TLP:${required} or higher.`,
  };
}

/**
 * Validates plugin installation for a given subject.
 * Convenience wrapper combining a full classification result with a clearance check.
 *
 * @param subject        - Subject's clearance profile
 * @param classification - Full TLP classification result from classifyPlugin()
 * @returns TlpClearanceCheckResult
 *
 * @example
 * ```ts
 * const classification = classifyPlugin({ plugin_id: 'x', permissions });
 * const check = validatePluginInstall(
 *   { subjectId: 'agent-1', clearance: 'AMBER' },
 *   classification,
 * );
 * if (!check.allowed) throw new Error(check.denyReason);
 * ```
 */
export function validatePluginInstall(
  subject: TlpClearanceProfile,
  classification: TlpClassificationResult,
): TlpClearanceCheckResult {
  return checkClearance(subject, classification.level);
}

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

/** Result for a single plugin in a batch validation */
export interface BatchValidationEntry {
  pluginId: string;
  level: TlpLevel;
  result: TlpClearanceCheckResult;
}

/**
 * Validates multiple plugins against a single subject's clearance.
 * Useful for marketplace listing pages where each plugin has a pre-computed level.
 *
 * @param subject - Subject's clearance profile
 * @param plugins - Array of { pluginId, level } pairs
 * @returns Array of BatchValidationEntry with per-plugin results
 */
export function batchValidate(
  subject: TlpClearanceProfile,
  plugins: Array<{ pluginId: string; level: TlpLevel }>,
): BatchValidationEntry[] {
  return plugins.map(({ pluginId, level }) => ({
    pluginId,
    level,
    result: checkClearance(subject, level),
  }));
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the subject's clearance is sufficient for the given level.
 * Lightweight alternative to checkClearance() when you only need the boolean.
 */
export function isCleared(clearance: TlpLevel, required: TlpLevel): boolean {
  return TLP_RANK[clearance] >= TLP_RANK[required];
}

/**
 * Returns the minimum clearance level required to access a resource.
 * Equivalent to the resource's TLP level — provided for symmetry with checkClearance.
 */
export function requiredClearance(level: TlpLevel): TlpLevel {
  return level;
}

/**
 * Returns all TLP levels at or below the given clearance.
 * Useful for constructing filtered marketplace views.
 *
 * @example
 * ```ts
 * accessibleLevels('GREEN'); // ['CLEAR', 'GREEN']
 * accessibleLevels('AMBER'); // ['CLEAR', 'GREEN', 'AMBER']
 * ```
 */
export function accessibleLevels(clearance: TlpLevel): TlpLevel[] {
  const all: TlpLevel[] = ['CLEAR', 'GREEN', 'AMBER', 'RED'];
  return all.filter(l => TLP_RANK[l] <= TLP_RANK[clearance]);
}

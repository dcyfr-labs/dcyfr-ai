/**
 * TLP Classification System for Plugin Marketplace
 *
 * Re-exports all public types, classifier, and validator for the
 * plugin TLP classification subsystem.
 *
 * @module plugins/tlp
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// Types
export type {
  TlpLevel,
  TlpBadge,
  TlpClassificationReason,
  TlpClassificationResult,
  TlpClearanceProfile,
  TlpClearanceCheckResult,
  PluginTlpInput,
} from './types.js';

export { TLP_RANK } from './types.js';

// Classifier
export {
  classifyPlugin,
  getTlpBadge,
  getAllTlpBadges,
  TLP_BADGES,
} from './tlp-classifier.js';

// Validator
export {
  checkClearance,
  validatePluginInstall,
  batchValidate,
  isCleared,
  requiredClearance,
  accessibleLevels,
} from './tlp-validator.js';

export type { BatchValidationEntry } from './tlp-validator.js';

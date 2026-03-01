/**
 * TLP Classification Types for Plugin Marketplace
 *
 * Implements TLP 2.0 (Traffic Light Protocol) classification for plugins,
 * mapping permission profiles to appropriate distribution levels.
 *
 * @see https://www.first.org/tlp/
 * @module plugins/tlp/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import type { PluginPermissions } from '../permissions/types.js';

// ---------------------------------------------------------------------------
// Core TLP 2.0 levels
// ---------------------------------------------------------------------------

/**
 * TLP 2.0 classification levels, ordered from lowest to highest sensitivity.
 *
 * - CLEAR: No restriction. Safe to redistribute publicly.
 * - GREEN: Limited community distribution. Share within the organization.
 * - AMBER: Limited distribution. Need-to-know basis inside the organization.
 * - RED: Restricted. Individual recipients only; not for redistribution.
 */
export type TlpLevel = 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';

/** Numeric severity for ordering/comparison */
export const TLP_RANK: Record<TlpLevel, number> = {
  CLEAR: 0,
  GREEN: 1,
  AMBER: 2,
  RED:   3,
};

// ---------------------------------------------------------------------------
// Badge rendering metadata
// ---------------------------------------------------------------------------

/** Visual badge metadata for marketplace UI rendering */
export interface TlpBadge {
  /** TLP level this badge represents */
  level: TlpLevel;
  /** Hex background color per TLP 2.0 spec */
  color: string;
  /** Human-readable label */
  label: string;
  /** Short tooltip shown on hover */
  tooltip: string;
  /** Longer description for detail views */
  description: string;
}

// ---------------------------------------------------------------------------
// Classification result
// ---------------------------------------------------------------------------

/** Single rule that contributed to a TLP classification decision */
export interface TlpClassificationReason {
  /** The rule identifier */
  rule: string;
  /** Human-readable explanation */
  reason: string;
  /** The TLP level this rule produces */
  level: TlpLevel;
}

/** Full result returned by the TLP classifier */
export interface TlpClassificationResult {
  /** Final assigned TLP level (highest level among triggered rules) */
  level: TlpLevel;
  /** All rules that were triggered */
  reasons: TlpClassificationReason[];
  /** Whether ANY elevated rule was triggered (AMBER or RED) */
  elevated: boolean;
  /** Badge metadata for UI rendering */
  badge: TlpBadge;
}

// ---------------------------------------------------------------------------
// Clearance check
// ---------------------------------------------------------------------------

/** User or agent TLP clearance profile */
export interface TlpClearanceProfile {
  /** Maximum TLP level the subject is cleared to access */
  clearance: TlpLevel;
  /** Subject identifier (user ID, agent name, etc.) */
  subjectId: string;
}

/** Result of a clearance check */
export interface TlpClearanceCheckResult {
  /** Whether the subject is cleared to access the resource */
  allowed: boolean;
  /** Subject's clearance level */
  subjectClearance: TlpLevel;
  /** Required clearance level */
  requiredClearance: TlpLevel;
  /** Human-readable denial reason when allowed=false */
  denyReason?: string;
}

// ---------------------------------------------------------------------------
// Plugin manifest surface used by classifier
// ---------------------------------------------------------------------------

/**
 * Minimal plugin descriptor accepted by the TLP classifier.
 * Accepts the full PluginPermissions type — extra fields are ignored.
 */
export interface PluginTlpInput {
  plugin_id: string;
  permissions: PluginPermissions;
}

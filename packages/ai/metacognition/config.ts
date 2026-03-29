/**
 * Metacognitive Improvement Runtime — Feature Flag Configuration
 * TLP:AMBER - Internal Use Only
 *
 * Reads `ENABLE_METACOG_RUNTIME` from the process environment and wires it
 * into a ready-to-use MetacognitiveImprovementRuntime singleton.
 *
 * Default path (flag absent or falsy): runtime is disabled — all methods
 * throw RuntimeDisabledError, existing agent behaviour is unchanged.
 *
 * @module ai/metacognition/config
 */

import { MetacognitiveImprovementRuntime, InMemoryImprovementLedger } from './runtime.js';
import { DEFAULT_GOVERNANCE_CONFIG } from './types.js';
import type { MetacognitiveRuntimeConfig } from './types.js';

/**
 * Read ENABLE_METACOG_RUNTIME from process.env.
 * Returns true only when the value is exactly the string "true" (case-insensitive).
 * Absent, empty, "false", "0", etc. all resolve to false.
 */
export function readFeatureFlag(): boolean {
  const raw = (typeof process !== 'undefined' ? process.env['ENABLE_METACOG_RUNTIME'] : undefined) ?? '';
  return raw.trim().toLowerCase() === 'true';
}

/**
 * Build a MetacognitiveRuntimeConfig from the current environment.
 * When the feature flag is off, `enabled` is false and the runtime is a no-op.
 */
export function buildRuntimeConfig(
  overrides: Partial<MetacognitiveRuntimeConfig> = {},
): MetacognitiveRuntimeConfig {
  return {
    enabled: readFeatureFlag(),
    policy_schema_version: { major: 1, minor: 0, patch: 0 },
    governance: DEFAULT_GOVERNANCE_CONFIG,
    ...overrides,
  };
}

/**
 * Default singleton runtime, wired from the environment.
 *
 * Uses an in-memory ledger until task 2.1 provides a persistent implementation.
 * Replace the ledger at startup for production use:
 *
 * ```typescript
 * import { defaultRuntime } from '@dcyfr/ai/metacognition';
 * // defaultRuntime is disabled unless ENABLE_METACOG_RUNTIME=true
 * ```
 *
 * This export has NO effect on existing code paths — the runtime only activates
 * when explicitly called by callers who import from this module.
 */
export const defaultRuntime = new MetacognitiveImprovementRuntime(
  buildRuntimeConfig(),
  new InMemoryImprovementLedger(),
);

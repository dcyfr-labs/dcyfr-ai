/**
 * TLP Classifier for Plugin Marketplace
 *
 * Analyzes a plugin's PluginPermissions manifest and derives an appropriate
 * TLP 2.0 classification level using a deterministic rule-set. Rules are
 * evaluated in escalating order; the highest triggered level wins.
 *
 * Classification rules (highest → lowest priority):
 *   RED   — secret access, unrestricted shell execution, or deleting sensitive paths
 *   AMBER — network egress, restricted shell, env-var access, or writing sensitive paths
 *   GREEN — any filesystem write/delete, any MCP server access
 *   CLEAR — read-only, no network, no shell, no secrets (default)
 *
 * @module plugins/tlp/tlp-classifier
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import type { PluginPermissions } from '../permissions/types.js';
import {
  TlpLevel,
  TLP_RANK,
  TlpBadge,
  TlpClassificationReason,
  TlpClassificationResult,
  PluginTlpInput,
} from './types.js';

// ---------------------------------------------------------------------------
// Badge definitions (TLP 2.0 spec colors)
// ---------------------------------------------------------------------------

const BADGES: Record<TlpLevel, TlpBadge> = {
  CLEAR: {
    level:       'CLEAR',
    color:       '#FFFFFF',
    label:       'TLP:CLEAR',
    tooltip:     'No restriction — safe to redistribute publicly',
    description: 'This plugin has read-only, no-network, no-shell permissions. Safe for all users.',
  },
  GREEN: {
    level:       'GREEN',
    color:       '#33FF00',
    label:       'TLP:GREEN',
    tooltip:     'Limited community distribution',
    description: 'This plugin can write files or access MCP servers. Share within your organization.',
  },
  AMBER: {
    level:       'AMBER',
    color:       '#FFC000',
    label:       'TLP:AMBER',
    tooltip:     'Limited distribution — need-to-know',
    description: 'This plugin accesses the network, environment variables, or shell. Restricted to vetted users.',
  },
  RED: {
    level:       'RED',
    color:       '#FF2B2B',
    label:       'TLP:RED',
    tooltip:     'Restricted — individual recipients only',
    description: 'This plugin accesses secrets, runs unrestricted shell commands, or deletes sensitive paths. Human approval required.',
  },
};

// ---------------------------------------------------------------------------
// Sensitive path patterns
// ---------------------------------------------------------------------------

const SENSITIVE_WRITE_PATTERNS = [
  '.env', 'secrets', '.ssh', '.aws', '.gnupg',
  '.npmrc', '.docker/config.json', 'credentials',
];

const SENSITIVE_DELETE_PATTERNS = [
  'src', 'node_modules', '.git', 'dist', 'build', 'package.json',
];

/**
 * Write check: pattern contains a sensitive keyword anywhere (e.g. ".env.production" contains ".env").
 */
function matchesSensitiveWritePath(patterns: string[], sensitiveList: string[]): boolean {
  return patterns.some(p =>
    sensitiveList.some(s => p.toLowerCase().includes(s.toLowerCase()))
  );
}

/**
 * Delete check: pattern starts with a sensitive root directory name.
 * Uses startsWith to avoid '/' matching any path that has a slash.
 */
function matchesSensitiveDeletePath(patterns: string[], sensitiveList: string[]): boolean {
  return patterns.some(p =>
    sensitiveList.some(
      s => p === s ||
           p.startsWith(s + '/') ||
           p.startsWith(s + '\\'),
    )
  );
}

// ---------------------------------------------------------------------------
// Rule engine
// ---------------------------------------------------------------------------

type Rule = {
  id: string;
  level: TlpLevel;
  description: string;
  test: (perms: PluginPermissions) => { triggered: boolean; detail?: string };
};

const RULES: Rule[] = [
  // -------- RED rules --------
  {
    id: 'RED:secret-access',
    level: 'RED',
    description: 'Plugin requests secret vault access',
    test: (p) => ({ triggered: p.data.allowSecretAccess }),
  },
  {
    id: 'RED:unrestricted-shell',
    level: 'RED',
    description: 'Plugin allows shell commands with no command allowlist',
    test: (p) => ({
      triggered: p.execution.allowShellCommands && p.execution.allowedCommands.length === 0,
    }),
  },
  {
    id: 'RED:sensitive-delete',
    level: 'RED',
    description: 'Plugin deletes sensitive filesystem paths',
    test: (p) => ({
      triggered: p.filesystem.delete.length > 0 &&
                 matchesSensitiveDeletePath(p.filesystem.delete, SENSITIVE_DELETE_PATTERNS),
      detail: p.filesystem.delete.join(', '),
    }),
  },

  // -------- AMBER rules --------
  {
    id: 'AMBER:network-egress',
    level: 'AMBER',
    description: 'Plugin makes outbound network requests',
    test: (p) => ({
      triggered: p.network.allowed,
      detail: p.network.allowedDomains.length > 0
        ? `domains: ${p.network.allowedDomains.join(', ')}` : undefined,
    }),
  },
  {
    id: 'AMBER:restricted-shell',
    level: 'AMBER',
    description: 'Plugin executes shell commands (restricted allowlist)',
    test: (p) => ({
      triggered: p.execution.allowShellCommands && p.execution.allowedCommands.length > 0,
      detail: `commands: ${p.execution.allowedCommands.join(', ')}`,
    }),
  },
  {
    id: 'AMBER:env-vars',
    level: 'AMBER',
    description: 'Plugin reads environment variables',
    test: (p) => ({ triggered: p.data.allowEnvironmentVars }),
  },
  {
    id: 'AMBER:sensitive-write',
    level: 'AMBER',
    description: 'Plugin writes to sensitive filesystem paths',
    test: (p) => ({
      triggered: p.filesystem.write.length > 0 &&
                 matchesSensitiveWritePath(p.filesystem.write, SENSITIVE_WRITE_PATTERNS),
      detail: p.filesystem.write.join(', '),
    }),
  },

  // -------- GREEN rules --------
  {
    id: 'GREEN:filesystem-write',
    level: 'GREEN',
    description: 'Plugin writes to the filesystem',
    test: (p) => ({
      triggered: p.filesystem.write.length > 0,
      detail: p.filesystem.write.join(', '),
    }),
  },
  {
    id: 'GREEN:filesystem-delete',
    level: 'GREEN',
    description: 'Plugin deletes filesystem entries',
    test: (p) => ({
      triggered: p.filesystem.delete.length > 0,
      detail: p.filesystem.delete.join(', '),
    }),
  },
  {
    id: 'GREEN:mcp-access',
    level: 'GREEN',
    description: 'Plugin calls MCP servers',
    test: (p) => ({
      triggered: p.mcp.allowedServers.length > 0,
      detail: `servers: ${p.mcp.allowedServers.join(', ')}`,
    }),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classifies a plugin's permissions into a TLP 2.0 level.
 *
 * @param input - Plugin id + full PluginPermissions
 * @returns A TlpClassificationResult with the level, all triggered reasons, and badge
 *
 * @example
 * ```ts
 * const result = classifyPlugin({
 *   plugin_id: 'dcyfr/secret-detector',
 *   permissions: { ...noNetworkReadOnly },
 * });
 * console.log(result.level); // 'CLEAR'
 * ```
 */
export function classifyPlugin(input: PluginTlpInput): TlpClassificationResult {
  const triggered: TlpClassificationReason[] = [];

  for (const rule of RULES) {
    const { triggered: hit, detail } = rule.test(input.permissions);
    if (hit) {
      triggered.push({
        rule:   rule.id,
        reason: detail ? `${rule.description} (${detail})` : rule.description,
        level:  rule.level,
      });
    }
  }

  const finalLevel: TlpLevel = triggered.reduce<TlpLevel>((max, r) => {
    return TLP_RANK[r.level] > TLP_RANK[max] ? r.level : max;
  }, 'CLEAR');

  return {
    level:    finalLevel,
    reasons:  triggered,
    elevated: TLP_RANK[finalLevel] >= TLP_RANK['AMBER'],
    badge:    BADGES[finalLevel],
  };
}

/**
 * Returns the TLP badge metadata for a given level, for use in UI rendering.
 *
 * @param level - TLP classification level
 * @returns TlpBadge with color, label, tooltip, and description
 *
 * @example
 * ```ts
 * const badge = getTlpBadge('AMBER');
 * // { color: '#FFC000', label: 'TLP:AMBER', ... }
 * ```
 */
export function getTlpBadge(level: TlpLevel): TlpBadge {
  return BADGES[level];
}

/**
 * Returns all four TLP badges, useful for rendering a legend.
 */
export function getAllTlpBadges(): TlpBadge[] {
  return ['CLEAR', 'GREEN', 'AMBER', 'RED'].map(l => BADGES[l as TlpLevel]);
}

// Re-export badge map for advanced consumers
export { BADGES as TLP_BADGES };

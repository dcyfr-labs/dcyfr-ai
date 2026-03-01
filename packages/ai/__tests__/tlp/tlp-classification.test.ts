/**
 * TLP Classification System — Unit Tests
 *
 * Tests for classifyPlugin(), getTlpBadge(), clearance validation,
 * and all boundary cases of the rule engine.
 *
 * TLP:AMBER - Internal Use Only
 *
 * @module __tests__/tlp/tlp-classification.test.ts
 * @version 1.0.0
 * @date 2026-02-28
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPlugin,
  getTlpBadge,
  getAllTlpBadges,
  TLP_BADGES,
} from '../../src/plugins/tlp/tlp-classifier';
import {
  checkClearance,
  validatePluginInstall,
  batchValidate,
  isCleared,
  accessibleLevels,
} from '../../src/plugins/tlp/tlp-validator';
import { TLP_RANK } from '../../src/plugins/tlp/types';
import type { PluginPermissions } from '../../src/plugins/permissions/types';
import type { TlpLevel } from '../../src/plugins/tlp/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePerms(overrides: Partial<PluginPermissions> = {}): PluginPermissions {
  return {
    filesystem: { read: [], write: [], delete: [], ...overrides.filesystem },
    network:    { allowed: false, allowedDomains: [], maxRequests: 0, ...overrides.network },
    execution:  { allowShellCommands: false, allowedCommands: [], maxProcesses: 0, ...overrides.execution },
    mcp:        { allowedServers: [], deniedServers: [], ...overrides.mcp },
    data:       { allowEnvironmentVars: false, allowSecretAccess: false, ...overrides.data },
  };
}

const READ_ONLY = makePerms({ filesystem: { read: ['**/*.ts'], write: [], delete: [] } });

// ---------------------------------------------------------------------------
// TLP_RANK ordering
// ---------------------------------------------------------------------------

describe('TLP_RANK', () => {
  it('should order CLEAR < GREEN < AMBER < RED', () => {
    expect(TLP_RANK['CLEAR']).toBeLessThan(TLP_RANK['GREEN']);
    expect(TLP_RANK['GREEN']).toBeLessThan(TLP_RANK['AMBER']);
    expect(TLP_RANK['AMBER']).toBeLessThan(TLP_RANK['RED']);
  });
});

// ---------------------------------------------------------------------------
// Classifier — CLEAR cases
// ---------------------------------------------------------------------------

describe('classifyPlugin — CLEAR', () => {
  it('classifies empty permissions as CLEAR', () => {
    const result = classifyPlugin({ plugin_id: 'test/empty', permissions: makePerms() });
    expect(result.level).toBe('CLEAR');
    expect(result.elevated).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('classifies read-only filesystem as CLEAR', () => {
    const result = classifyPlugin({ plugin_id: 'test/readonly', permissions: READ_ONLY });
    expect(result.level).toBe('CLEAR');
  });

  it('sets badge for CLEAR classification', () => {
    const result = classifyPlugin({ plugin_id: 'test/clear', permissions: makePerms() });
    expect(result.badge.level).toBe('CLEAR');
    expect(result.badge.color).toBe('#FFFFFF');
    expect(result.badge.label).toBe('TLP:CLEAR');
  });
});

// ---------------------------------------------------------------------------
// Classifier — GREEN cases
// ---------------------------------------------------------------------------

describe('classifyPlugin — GREEN', () => {
  it('classifies filesystem write as GREEN', () => {
    const result = classifyPlugin({
      plugin_id: 'test/writer',
      permissions: makePerms({ filesystem: { read: [], write: ['output/**'], delete: [] } }),
    });
    expect(result.level).toBe('GREEN');
    expect(result.reasons.some(r => r.rule === 'GREEN:filesystem-write')).toBe(true);
  });

  it('classifies filesystem delete (non-sensitive) as GREEN', () => {
    const result = classifyPlugin({
      plugin_id: 'test/deleter',
      permissions: makePerms({ filesystem: { read: [], write: [], delete: ['tmp/**'] } }),
    });
    expect(result.level).toBe('GREEN');
    expect(result.reasons.some(r => r.rule === 'GREEN:filesystem-delete')).toBe(true);
  });

  it('classifies MCP server access as GREEN', () => {
    const result = classifyPlugin({
      plugin_id: 'test/mcp',
      permissions: makePerms({ mcp: { allowedServers: ['sqlite-mcp'], deniedServers: [] } }),
    });
    expect(result.level).toBe('GREEN');
    expect(result.reasons.some(r => r.rule === 'GREEN:mcp-access')).toBe(true);
  });

  it('sets GREEN badge fields correctly', () => {
    const result = classifyPlugin({
      plugin_id: 'test/green',
      permissions: makePerms({ mcp: { allowedServers: ['x'], deniedServers: [] } }),
    });
    expect(result.badge.level).toBe('GREEN');
    expect(result.badge.color).toBe('#33FF00');
    expect(result.elevated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Classifier — AMBER cases
// ---------------------------------------------------------------------------

describe('classifyPlugin — AMBER', () => {
  it('classifies network egress as AMBER', () => {
    const result = classifyPlugin({
      plugin_id: 'test/net',
      permissions: makePerms({ network: { allowed: true, allowedDomains: [], maxRequests: 0 } }),
    });
    expect(result.level).toBe('AMBER');
    expect(result.elevated).toBe(true);
    expect(result.reasons.some(r => r.rule === 'AMBER:network-egress')).toBe(true);
  });

  it('classifies restricted shell as AMBER (not RED)', () => {
    const result = classifyPlugin({
      plugin_id: 'test/shell',
      permissions: makePerms({
        execution: { allowShellCommands: true, allowedCommands: ['eslint'], maxProcesses: 1 },
      }),
    });
    expect(result.level).toBe('AMBER');
    expect(result.reasons.some(r => r.rule === 'AMBER:restricted-shell')).toBe(true);
    expect(result.reasons.some(r => r.rule === 'RED:unrestricted-shell')).toBe(false);
  });

  it('classifies env var access as AMBER', () => {
    const result = classifyPlugin({
      plugin_id: 'test/env',
      permissions: makePerms({ data: { allowEnvironmentVars: true, allowSecretAccess: false } }),
    });
    expect(result.level).toBe('AMBER');
    expect(result.reasons.some(r => r.rule === 'AMBER:env-vars')).toBe(true);
  });

  it('classifies writing .env paths as AMBER', () => {
    const result = classifyPlugin({
      plugin_id: 'test/env-write',
      permissions: makePerms({ filesystem: { read: [], write: ['.env.production'], delete: [] } }),
    });
    expect(result.level).toBe('AMBER');
    expect(result.reasons.some(r => r.rule === 'AMBER:sensitive-write')).toBe(true);
  });

  it('classifies writing secrets directory as AMBER', () => {
    const result = classifyPlugin({
      plugin_id: 'test/secrets-write',
      permissions: makePerms({ filesystem: { read: [], write: ['secrets/key.pem'], delete: [] } }),
    });
    expect(result.level).toBe('AMBER');
  });

  it('network domain allowlist appears in reason detail', () => {
    const result = classifyPlugin({
      plugin_id: 'test/net-domain',
      permissions: makePerms({
        network: { allowed: true, allowedDomains: ['api.github.com'], maxRequests: 20 },
      }),
    });
    const reason = result.reasons.find(r => r.rule === 'AMBER:network-egress');
    expect(reason?.reason).toContain('api.github.com');
  });
});

// ---------------------------------------------------------------------------
// Classifier — RED cases
// ---------------------------------------------------------------------------

describe('classifyPlugin — RED', () => {
  it('classifies secret access as RED', () => {
    const result = classifyPlugin({
      plugin_id: 'test/secrets',
      permissions: makePerms({ data: { allowEnvironmentVars: false, allowSecretAccess: true } }),
    });
    expect(result.level).toBe('RED');
    expect(result.elevated).toBe(true);
    expect(result.reasons.some(r => r.rule === 'RED:secret-access')).toBe(true);
  });

  it('classifies unrestricted shell as RED', () => {
    const result = classifyPlugin({
      plugin_id: 'test/shell-unrestricted',
      permissions: makePerms({
        execution: { allowShellCommands: true, allowedCommands: [], maxProcesses: 0 },
      }),
    });
    expect(result.level).toBe('RED');
    expect(result.reasons.some(r => r.rule === 'RED:unrestricted-shell')).toBe(true);
    // Also no AMBER restricted-shell rule triggered (no commands in allowlist)
    expect(result.reasons.some(r => r.rule === 'AMBER:restricted-shell')).toBe(false);
  });

  it('classifies deleting sensitive path (src) as RED', () => {
    const result = classifyPlugin({
      plugin_id: 'test/src-delete',
      permissions: makePerms({ filesystem: { read: [], write: [], delete: ['src/**'] } }),
    });
    expect(result.level).toBe('RED');
    expect(result.reasons.some(r => r.rule === 'RED:sensitive-delete')).toBe(true);
  });

  it('classifies deleting .git as RED', () => {
    const result = classifyPlugin({
      plugin_id: 'test/git-delete',
      permissions: makePerms({ filesystem: { read: [], write: [], delete: ['.git/**'] } }),
    });
    expect(result.level).toBe('RED');
  });

  it('RED escalates over AMBER when both triggered', () => {
    const result = classifyPlugin({
      plugin_id: 'test/mixed',
      permissions: makePerms({
        network: { allowed: true, allowedDomains: [], maxRequests: 0 }, // AMBER
        data:    { allowEnvironmentVars: false, allowSecretAccess: true },   // RED
      }),
    });
    expect(result.level).toBe('RED');
    // Both rules should be recorded
    expect(result.reasons.some(r => r.level === 'AMBER')).toBe(true);
    expect(result.reasons.some(r => r.level === 'RED')).toBe(true);
  });

  it('sets RED badge fields correctly', () => {
    const result = classifyPlugin({
      plugin_id: 'test/red',
      permissions: makePerms({ data: { allowEnvironmentVars: false, allowSecretAccess: true } }),
    });
    expect(result.badge.level).toBe('RED');
    expect(result.badge.color).toBe('#FF2B2B');
    expect(result.elevated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple reasons in result
// ---------------------------------------------------------------------------

describe('classifyPlugin — multiple reasons', () => {
  it('records multiple triggered rules', () => {
    const result = classifyPlugin({
      plugin_id: 'test/multi',
      permissions: makePerms({
        network:   { allowed: true, allowedDomains: [], maxRequests: 0 },
        mcp:       { allowedServers: ['sqlite-mcp'], deniedServers: [] },
        filesystem: { read: [], write: ['output/'], delete: [] },
      }),
    });
    // All three rules should trigger (GREEN+AMBER), final level AMBER
    expect(result.level).toBe('AMBER');
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

describe('getTlpBadge', () => {
  it('returns correct badge for each level', () => {
    const levels: TlpLevel[] = ['CLEAR', 'GREEN', 'AMBER', 'RED'];
    for (const level of levels) {
      const badge = getTlpBadge(level);
      expect(badge.level).toBe(level);
      expect(badge.label).toBe(`TLP:${level}`);
      expect(badge.color).toBeTruthy();
      expect(badge.tooltip).toBeTruthy();
    }
  });
});

describe('getAllTlpBadges', () => {
  it('returns all 4 badges', () => {
    const badges = getAllTlpBadges();
    expect(badges).toHaveLength(4);
    const labels = badges.map(b => b.label);
    expect(labels).toContain('TLP:CLEAR');
    expect(labels).toContain('TLP:GREEN');
    expect(labels).toContain('TLP:AMBER');
    expect(labels).toContain('TLP:RED');
  });
});

describe('TLP_BADGES', () => {
  it('exports all badge levels', () => {
    expect(TLP_BADGES['CLEAR'].color).toBe('#FFFFFF');
    expect(TLP_BADGES['RED'].color).toBe('#FF2B2B');
  });
});

// ---------------------------------------------------------------------------
// Clearance validator
// ---------------------------------------------------------------------------

describe('checkClearance', () => {
  it('allows access when clearance equals required', () => {
    const result = checkClearance({ subjectId: 'u1', clearance: 'AMBER' }, 'AMBER');
    expect(result.allowed).toBe(true);
    expect(result.denyReason).toBeUndefined();
  });

  it('allows access when clearance exceeds required', () => {
    const result = checkClearance({ subjectId: 'u1', clearance: 'RED' }, 'AMBER');
    expect(result.allowed).toBe(true);
  });

  it('denies access when clearance is below required', () => {
    const result = checkClearance({ subjectId: 'u1', clearance: 'GREEN' }, 'AMBER');
    expect(result.allowed).toBe(false);
    expect(result.denyReason).toContain('GREEN');
    expect(result.denyReason).toContain('AMBER');
  });

  it('includes subject ID in deny reason', () => {
    const result = checkClearance({ subjectId: 'agent-99', clearance: 'CLEAR' }, 'RED');
    expect(result.denyReason).toContain('agent-99');
  });

  it('CLEAR clearance is denied for GREEN resource', () => {
    const result = checkClearance({ subjectId: 'u', clearance: 'CLEAR' }, 'GREEN');
    expect(result.allowed).toBe(false);
  });

  it('RED clearance can access all levels', () => {
    const levels: TlpLevel[] = ['CLEAR', 'GREEN', 'AMBER', 'RED'];
    for (const level of levels) {
      const result = checkClearance({ subjectId: 'u', clearance: 'RED' }, level);
      expect(result.allowed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validatePluginInstall
// ---------------------------------------------------------------------------

describe('validatePluginInstall', () => {
  it('allows install when clearance matches classification', () => {
    const classification = classifyPlugin({
      plugin_id: 'test/amber-plugin',
      permissions: makePerms({ network: { allowed: true, allowedDomains: [], maxRequests: 0 } }),
    });
    const result = validatePluginInstall({ subjectId: 'u', clearance: 'AMBER' }, classification);
    expect(result.allowed).toBe(true);
  });

  it('denies install when clearance is insufficient', () => {
    const classification = classifyPlugin({
      plugin_id: 'test/red-plugin',
      permissions: makePerms({ data: { allowEnvironmentVars: false, allowSecretAccess: true } }),
    });
    const result = validatePluginInstall({ subjectId: 'u', clearance: 'AMBER' }, classification);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// batchValidate
// ---------------------------------------------------------------------------

describe('batchValidate', () => {
  it('validates multiple plugins in one call', () => {
    const results = batchValidate(
      { subjectId: 'u', clearance: 'GREEN' },
      [
        { pluginId: 'a', level: 'CLEAR' },
        { pluginId: 'b', level: 'GREEN' },
        { pluginId: 'c', level: 'AMBER' },
        { pluginId: 'd', level: 'RED' },
      ],
    );
    expect(results).toHaveLength(4);
    expect(results[0].result.allowed).toBe(true);   // CLEAR ≤ GREEN
    expect(results[1].result.allowed).toBe(true);   // GREEN ≤ GREEN
    expect(results[2].result.allowed).toBe(false);  // AMBER > GREEN
    expect(results[3].result.allowed).toBe(false);  // RED > GREEN
  });

  it('returns each entry with pluginId and level', () => {
    const results = batchValidate(
      { subjectId: 'u', clearance: 'RED' },
      [{ pluginId: 'my-plugin', level: 'AMBER' }],
    );
    expect(results[0].pluginId).toBe('my-plugin');
    expect(results[0].level).toBe('AMBER');
  });
});

// ---------------------------------------------------------------------------
// isCleared helper
// ---------------------------------------------------------------------------

describe('isCleared', () => {
  it('returns true when clearance >= required', () => {
    expect(isCleared('AMBER', 'GREEN')).toBe(true);
    expect(isCleared('AMBER', 'AMBER')).toBe(true);
    expect(isCleared('RED',   'CLEAR')).toBe(true);
  });

  it('returns false when clearance < required', () => {
    expect(isCleared('CLEAR', 'GREEN')).toBe(false);
    expect(isCleared('GREEN', 'RED')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// accessibleLevels helper
// ---------------------------------------------------------------------------

describe('accessibleLevels', () => {
  it('CLEAR can only access CLEAR', () => {
    expect(accessibleLevels('CLEAR')).toEqual(['CLEAR']);
  });

  it('GREEN can access CLEAR and GREEN', () => {
    expect(accessibleLevels('GREEN')).toEqual(['CLEAR', 'GREEN']);
  });

  it('AMBER can access CLEAR, GREEN, AMBER', () => {
    expect(accessibleLevels('AMBER')).toEqual(['CLEAR', 'GREEN', 'AMBER']);
  });

  it('RED can access all levels', () => {
    expect(accessibleLevels('RED')).toEqual(['CLEAR', 'GREEN', 'AMBER', 'RED']);
  });
});

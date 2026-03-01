/**
 * Tests for the plugin permission model (Phase 2)
 *
 * Covers:
 *  - PluginPermissionValidator — all 5 categories
 *  - PermissionEnforcer        — fs/fetch/exec proxies
 *  - attenuatePermissions      — delegation narrowing
 *  - PermissionAuditLogger     — stdout fallback + Axiom path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createDenyAllPermissions,
  createAllowAllPermissions,
  PluginPermissionValidator,
  PermissionEnforcer,
  PermissionDeniedError,
  attenuatePermissions,
  isSubsetOf,
  PermissionAuditLogger,
} from '../src/plugins/permissions/index';
import type {
  PluginPermissions,
  EnforcementContext,
  RealFs,
  AuditLogResult,
} from '../src/plugins/permissions/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePermissions(overrides: Partial<PluginPermissions> = {}): PluginPermissions {
  return { ...createDenyAllPermissions(), ...overrides };
}

const ctx: EnforcementContext = {
  pluginId: 'test-plugin',
  pluginVersion: '1.0.0',
  executionId: 'exec-001',
};

// ---------------------------------------------------------------------------
// PluginPermissionValidator
// ---------------------------------------------------------------------------

describe('PluginPermissionValidator — filesystem', () => {
  it('grants read when glob matches', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ filesystem: { read: ['src/**'], write: [], delete: [] } }),
    );
    expect(v.checkFileRead('src/index.ts').granted).toBe(true);
  });

  it('denies read when no pattern matches', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ filesystem: { read: ['src/**'], write: [], delete: [] } }),
    );
    const result = v.checkFileRead('dist/bundle.js');
    expect(result.granted).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('grants write when glob matches', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ filesystem: { read: [], write: ['out/**'], delete: [] } }),
    );
    expect(v.checkFileWrite('out/report.txt').granted).toBe(true);
  });

  it('denies write outside allowed paths', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ filesystem: { read: [], write: ['out/**'], delete: [] } }),
    );
    expect(v.checkFileWrite('/etc/passwd').granted).toBe(false);
  });

  it('grants delete when glob matches', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ filesystem: { read: [], write: [], delete: ['tmp/**'] } }),
    );
    expect(v.checkFileDelete('tmp/cache.db').granted).toBe(true);
  });

  it('denies delete when not whitelisted', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ filesystem: { read: [], write: [], delete: ['tmp/**'] } }),
    );
    expect(v.checkFileDelete('src/core.ts').granted).toBe(false);
  });
});

describe('PluginPermissionValidator — network', () => {
  it('grants request when network allowed with no domain restriction', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        network: { allowed: true, allowedDomains: [], maxRequests: 0 },
      }),
    );
    expect(v.checkNetworkRequest('https://example.com/api').granted).toBe(true);
  });

  it('grants request to explicitly allowed domain', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        network: { allowed: true, allowedDomains: ['api.github.com'], maxRequests: 0 },
      }),
    );
    expect(v.checkNetworkRequest('https://api.github.com/repos').granted).toBe(true);
  });

  it('denies request to non-whitelisted domain', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        network: { allowed: true, allowedDomains: ['api.github.com'], maxRequests: 0 },
      }),
    );
    expect(v.checkNetworkRequest('https://evil.com').granted).toBe(false);
  });

  it('denies all requests when network.allowed is false', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        network: { allowed: false, allowedDomains: [], maxRequests: 0 },
      }),
    );
    expect(v.checkNetworkRequest('https://example.com').granted).toBe(false);
  });

  it('supports wildcard domain patterns', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        network: { allowed: true, allowedDomains: ['*.github.com'], maxRequests: 0 },
      }),
    );
    expect(v.checkNetworkRequest('https://api.github.com/v3').granted).toBe(true);
    expect(v.checkNetworkRequest('https://uploads.github.com/file').granted).toBe(true);
    expect(v.checkNetworkRequest('https://evil.com').granted).toBe(false);
  });
});

describe('PluginPermissionValidator — execution', () => {
  it('grants command when shell commands allowed and command on list', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        execution: { allowShellCommands: true, allowedCommands: ['git', 'npm'], maxProcesses: 0 },
      }),
    );
    expect(v.checkCommandExecution('git').granted).toBe(true);
  });

  it('denies command not on allowedCommands list', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        execution: { allowShellCommands: true, allowedCommands: ['git'], maxProcesses: 0 },
      }),
    );
    expect(v.checkCommandExecution('rm').granted).toBe(false);
  });

  it('denies all commands when allowShellCommands is false', () => {
    const v = new PluginPermissionValidator(createDenyAllPermissions());
    expect(v.checkCommandExecution('ls').granted).toBe(false);
  });
});

describe('PluginPermissionValidator — mcp', () => {
  it('grants access to unrestricted server list (*)', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        mcp: { allowedServers: ['*'], deniedServers: [] },
      }),
    );
    expect(v.checkMcpAccess('any-server').granted).toBe(true);
  });

  it('denies access to explicitly denied server', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        mcp: { allowedServers: ['*'], deniedServers: ['dangerous-server'] },
      }),
    );
    expect(v.checkMcpAccess('dangerous-server').granted).toBe(false);
  });

  it('grants access to explicitly allowed server', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        mcp: { allowedServers: ['safe-server'], deniedServers: [] },
      }),
    );
    expect(v.checkMcpAccess('safe-server').granted).toBe(true);
  });

  it('denies access to server not on allowedServers', () => {
    const v = new PluginPermissionValidator(
      makePermissions({
        mcp: { allowedServers: ['safe-server'], deniedServers: [] },
      }),
    );
    expect(v.checkMcpAccess('other-server').granted).toBe(false);
  });
});

describe('PluginPermissionValidator — data', () => {
  it('grants env access when allowEnvironmentVars is true', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ data: { allowEnvironmentVars: true, allowSecretAccess: false } }),
    );
    expect(v.checkEnvAccess().granted).toBe(true);
  });

  it('denies env access when allowEnvironmentVars is false', () => {
    const v = new PluginPermissionValidator(createDenyAllPermissions());
    expect(v.checkEnvAccess().granted).toBe(false);
  });

  it('grants secret access when allowSecretAccess is true', () => {
    const v = new PluginPermissionValidator(
      makePermissions({ data: { allowEnvironmentVars: false, allowSecretAccess: true } }),
    );
    expect(v.checkSecretAccess().granted).toBe(true);
  });

  it('denies secret access by default', () => {
    const v = new PluginPermissionValidator(createDenyAllPermissions());
    expect(v.checkSecretAccess().granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

describe('createDenyAllPermissions / createAllowAllPermissions', () => {
  it('deny-all denies every check', () => {
    const v = new PluginPermissionValidator(createDenyAllPermissions());
    expect(v.checkFileRead('/etc/hosts').granted).toBe(false);
    expect(v.checkNetworkRequest('https://example.com').granted).toBe(false);
    expect(v.checkCommandExecution('ls').granted).toBe(false);
    expect(v.checkMcpAccess('any').granted).toBe(false);
    expect(v.checkEnvAccess().granted).toBe(false);
    expect(v.checkSecretAccess().granted).toBe(false);
  });

  it('allow-all passes every check', () => {
    const v = new PluginPermissionValidator(createAllowAllPermissions());
    expect(v.checkFileRead('/etc/hosts').granted).toBe(true);
    expect(v.checkNetworkRequest('https://example.com').granted).toBe(true);
    expect(v.checkCommandExecution('rm').granted).toBe(true);
    expect(v.checkMcpAccess('any').granted).toBe(true);
    expect(v.checkEnvAccess().granted).toBe(true);
    expect(v.checkSecretAccess().granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PermissionEnforcer — fs proxy
// ---------------------------------------------------------------------------

describe('PermissionEnforcer — fs proxy', () => {
  const grantSpy = vi.fn();
  const denySpy = vi.fn();
  const testCtx: EnforcementContext = { ...ctx, onGrant: grantSpy, onDeny: denySpy };

  const mockRealFs: RealFs = {
    readFile: vi.fn().mockResolvedValue('file-content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue(['a.ts', 'b.ts']),
    stat: vi.fn().mockResolvedValue({ isFile: () => true, size: 42, mtime: new Date() }),
  };

  beforeEach(() => {
    grantSpy.mockClear();
    denySpy.mockClear();
  });

  it('allows readFile on permitted path and calls onGrant', async () => {
    const perms = makePermissions({ filesystem: { read: ['src/**'], write: [], delete: [] } });
    const enforcer = new PermissionEnforcer(perms, testCtx);
    const proxy = enforcer.createFsProxy(mockRealFs);

    const result = await proxy.readFile('src/utils.ts');
    expect(result).toBe('file-content');
    expect(grantSpy).toHaveBeenCalledOnce();
    expect(grantSpy.mock.calls[0][0]).toMatchObject({ action: 'read', resource: 'src/utils.ts' });
  });

  it('throws PermissionDeniedError on denied readFile', async () => {
    const perms = makePermissions({ filesystem: { read: ['src/**'], write: [], delete: [] } });
    const enforcer = new PermissionEnforcer(perms, testCtx);
    const proxy = enforcer.createFsProxy(mockRealFs);

    await expect(proxy.readFile('/etc/passwd')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(denySpy).toHaveBeenCalledOnce();
  });

  it('allows writeFile on permitted path', async () => {
    const perms = makePermissions({ filesystem: { read: [], write: ['out/**'], delete: [] } });
    const enforcer = new PermissionEnforcer(perms, testCtx);
    const proxy = enforcer.createFsProxy(mockRealFs);

    await expect(proxy.writeFile('out/report.txt', 'data')).resolves.toBeUndefined();
    expect(grantSpy).toHaveBeenCalledOnce();
  });

  it('throws on denied unlink', async () => {
    const perms = createDenyAllPermissions();
    const enforcer = new PermissionEnforcer(perms, testCtx);
    const proxy = enforcer.createFsProxy(mockRealFs);

    await expect(proxy.unlink('/etc/hosts')).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

// ---------------------------------------------------------------------------
// PermissionEnforcer — fetch proxy
// ---------------------------------------------------------------------------

describe('PermissionEnforcer — fetch proxy', () => {
  const grantSpy = vi.fn();
  const denySpy = vi.fn();
  const testCtx: EnforcementContext = { ...ctx, onGrant: grantSpy, onDeny: denySpy };

  const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));

  beforeEach(() => {
    grantSpy.mockClear();
    denySpy.mockClear();
    mockFetch.mockClear();
  });

  it('allows requests to permitted domains', async () => {
    const perms = makePermissions({
      network: { allowed: true, allowedDomains: ['api.example.com'], maxRequests: 0 },
    });
    const enforcer = new PermissionEnforcer(perms, testCtx);
    const safeFetch = enforcer.createFetchProxy(mockFetch as typeof globalThis.fetch);

    await safeFetch('https://api.example.com/v1/data');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(grantSpy).toHaveBeenCalledOnce();
  });

  it('denies requests to blocked domains', async () => {
    const perms = makePermissions({
      network: { allowed: true, allowedDomains: ['api.example.com'], maxRequests: 0 },
    });
    const enforcer = new PermissionEnforcer(perms, testCtx);
    const safeFetch = enforcer.createFetchProxy(mockFetch as typeof globalThis.fetch);

    await expect(safeFetch('https://evil.com')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(denySpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// attenuatePermissions
// ---------------------------------------------------------------------------

describe('attenuatePermissions', () => {
  it('retains filesystem globs that are a subset of parent', () => {
    const parent = makePermissions({
      filesystem: { read: ['src/**', 'docs/**'], write: [], delete: [] },
    });
    const requested = makePermissions({
      filesystem: { read: ['src/**'], write: [], delete: [] },
    });
    const result = attenuatePermissions(requested, parent);
    expect(result.attenuated.filesystem.read).toEqual(['src/**']);
    expect(result.removedCapabilities).toHaveLength(0);
  });

  it('removes filesystem globs not covered by parent', () => {
    const parent = makePermissions({
      filesystem: { read: ['src/**'], write: [], delete: [] },
    });
    const requested = makePermissions({
      filesystem: { read: ['src/**', 'etc/**'], write: [], delete: [] },
    });
    const result = attenuatePermissions(requested, parent);
    expect(result.attenuated.filesystem.read).toEqual(['src/**']);
    expect(result.removedCapabilities).toContain('filesystem.read: etc/**');
  });

  it('removes network.allowed when parent does not grant it', () => {
    const parent = makePermissions({
      network: { allowed: false, allowedDomains: [], maxRequests: 0 },
    });
    const requested = makePermissions({
      network: { allowed: true, allowedDomains: [], maxRequests: 0 },
    });
    const result = attenuatePermissions(requested, parent);
    expect(result.attenuated.network.allowed).toBe(false);
    expect(result.removedCapabilities).toContain('network.allowed');
  });

  it('applies stricter maxRequests limit', () => {
    const parent = makePermissions({
      network: { allowed: true, allowedDomains: [], maxRequests: 50 },
    });
    const requested = makePermissions({
      network: { allowed: true, allowedDomains: [], maxRequests: 100 },
    });
    const result = attenuatePermissions(requested, parent);
    expect(result.attenuated.network.maxRequests).toBe(50);
  });

  it('preserves the original (parent) permissions in result', () => {
    const parent = createAllowAllPermissions();
    const requested = createDenyAllPermissions();
    const result = attenuatePermissions(requested, parent);
    expect(result.original).toStrictEqual(parent);
  });

  it('isSubsetOf returns true when all requested ⊆ granted', () => {
    const parent = createAllowAllPermissions();
    const child = makePermissions({
      filesystem: { read: ['src/**'], write: [], delete: [] },
    });
    expect(isSubsetOf(child, parent)).toBe(true);
  });

  it('isSubsetOf returns false when requested exceeds granted', () => {
    const parent = makePermissions({
      filesystem: { read: ['src/**'], write: [], delete: [] },
    });
    const child = makePermissions({
      filesystem: { read: ['etc/**'], write: [], delete: [] },
    });
    expect(isSubsetOf(child, parent)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PermissionAuditLogger
// ---------------------------------------------------------------------------

describe('PermissionAuditLogger', () => {
  const sampleEvent = {
    timestamp: '2026-02-28T00:00:00.000Z',
    eventType: 'permission_granted' as const,
    pluginId: 'test-plugin',
    pluginVersion: '1.0.0',
    category: 'filesystem' as const,
    action: 'read',
    resource: 'src/index.ts',
    granted: true,
  };

  it('logs to stdout when Axiom is not configured', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const logger = new PermissionAuditLogger();
    const result = await logger.log(sampleEvent);

    expect(result.destination).toBe('stdout');
    expect(result.success).toBe(true);
    expect(writeSpy).toHaveBeenCalledOnce();

    writeSpy.mockRestore();
  });

  it('logs to stderr for denied events', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const logger = new PermissionAuditLogger();
    const denied = { ...sampleEvent, eventType: 'permission_denied' as const, granted: false };
    await logger.log(denied);

    expect(writeSpy).toHaveBeenCalledOnce();
    writeSpy.mockRestore();
  });

  it('reports isAxiomEnabled=false without token', () => {
    const logger = new PermissionAuditLogger();
    expect(logger.isAxiomEnabled).toBe(false);
  });

  it('reports isAxiomEnabled=true when dataset + token provided', () => {
    const logger = new PermissionAuditLogger({
      axiomDataset: 'dcyfr-plugins',
      axiomToken: 'xaat-test',
    });
    expect(logger.isAxiomEnabled).toBe(true);
  });

  it('sends to Axiom when configured and falls back to console on failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 500, statusText: 'Internal Server Error' }),
    );
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const logger = new PermissionAuditLogger({
      axiomDataset: 'dcyfr-plugins',
      axiomToken: 'xaat-test',
    });
    const result = await logger.log(sampleEvent);

    expect(result.destination).toBe('axiom');
    expect(result.success).toBe(false);
    // Falls back to console
    expect(stdoutSpy).toHaveBeenCalledOnce();

    fetchSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('succeeds when Axiom returns 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const logger = new PermissionAuditLogger({
      axiomDataset: 'dcyfr-plugins',
      axiomToken: 'xaat-test',
    });
    const result = await logger.log(sampleEvent);

    expect(result.destination).toBe('axiom');
    expect(result.success).toBe(true);
    // No console fallback on success
    expect(stdoutSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('logBatch handles multiple events without Axiom', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const logger = new PermissionAuditLogger();
    const results = await logger.logBatch([sampleEvent, sampleEvent]);

    expect(results).toHaveLength(2);
    results.forEach((r: AuditLogResult) => {
      expect(r.destination).toBe('stdout');
      expect(r.success).toBe(true);
    });
    expect(writeSpy).toHaveBeenCalledTimes(2);

    writeSpy.mockRestore();
  });

  it('logBatch returns empty array for empty input', async () => {
    const logger = new PermissionAuditLogger();
    const results = await logger.logBatch([]);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PermissionDeniedError shape
// ---------------------------------------------------------------------------

describe('PermissionDeniedError', () => {
  it('has all required properties', () => {
    const err = new PermissionDeniedError('filesystem', 'read', '/etc/hosts', 'not whitelisted');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PermissionDeniedError');
    expect(err.category).toBe('filesystem');
    expect(err.action).toBe('read');
    expect(err.resource).toBe('/etc/hosts');
    expect(err.denialReason).toBe('not whitelisted');
    expect(err.message).toContain('filesystem');
    expect(err.message).toContain('/etc/hosts');
  });
});

// ---------------------------------------------------------------------------
// afterEach guard
// ---------------------------------------------------------------------------
afterEach(() => {
  vi.restoreAllMocks();
});

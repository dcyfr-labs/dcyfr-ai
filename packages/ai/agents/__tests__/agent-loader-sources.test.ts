/**
 * AgentLoader source-resolution, duplicate-handling, failure-mode, and
 * discovery tests. Uses real temp files (markdown / JSON / ESM modules);
 * only the glob module is mocked for deterministic discovery.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentLoader, AgentLoadError, AgentValidationError } from '../agent-loader.js';

const globMock = vi.hoisted(() => vi.fn(async () => [] as string[]));
vi.mock('glob', () => ({ glob: globMock }));

const tmp = mkdtempSync(join(tmpdir(), 'agent-loader-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const MD_AGENT = `---
name: md-agent
version: 1.0.0
description: Markdown-sourced test agent
category: testing
tier: project
tools: ['read']
---

# Markdown Agent
`;

function writeMdAgent(name: string, agentName = 'md-agent'): string {
  const p = join(tmp, name);
  writeFileSync(p, MD_AGENT.replace('md-agent', agentName));
  return p;
}

function writeJsonAgent(name: string, agentName = 'json-agent'): string {
  const p = join(tmp, name);
  writeFileSync(
    p,
    JSON.stringify({
      manifest: {
        name: agentName,
        version: '1.2.3',
        description: 'JSON-sourced test agent',
        category: 'testing',
        tier: 'project',
      },
    }),
  );
  return p;
}

function writeModuleAgent(name: string, agentName = 'module-agent'): string {
  const p = join(tmp, name);
  writeFileSync(
    p,
    `export default { manifest: { name: '${agentName}', version: '2.0.0', description: 'ESM-sourced test agent', category: 'testing', tier: 'project' } };\n`,
  );
  return p;
}

beforeEach(() => {
  globMock.mockReset();
  globMock.mockResolvedValue([]);
});

describe('resolveAgentFromSource', () => {
  it('loads an agent from a markdown file', async () => {
    const loader = new AgentLoader();
    const loaded = await loader.loadAgent(writeMdAgent('one.md'));
    expect(loaded.name).toBe('md-agent');
    expect(loaded.manifest.version).toBe('1.0.0');
    expect(loaded.tier).toBe('project');
    expect(loaded.enabled).toBe(true);
  });

  it('loads an agent from a JSON file', async () => {
    const loader = new AgentLoader();
    const loaded = await loader.loadAgent(writeJsonAgent('two.json'));
    expect(loaded.name).toBe('json-agent');
    expect(loaded.manifest.version).toBe('1.2.3');
  });

  it('loads an agent from an ESM module default export', async () => {
    const loader = new AgentLoader();
    const loaded = await loader.loadAgent(writeModuleAgent('three.mjs'));
    expect(loaded.name).toBe('module-agent');
    expect(loaded.source).toContain('three.mjs');
  });

  it('loads a runtime Agent object directly', async () => {
    const loader = new AgentLoader();
    const loaded = await loader.loadAgent({
      manifest: {
        name: 'runtime-agent',
        version: '0.1.0',
        description: 'constructed at runtime',
        category: 'testing',
        tier: 'project',
      },
    } as never);
    expect(loaded.source).toBe('runtime');
  });

  it('runs the onLoad hook before registering', async () => {
    const loader = new AgentLoader();
    const onLoad = vi.fn(async () => {});
    await loader.loadAgent({
      manifest: {
        name: 'hooked-agent',
        version: '0.1.0',
        description: 'agent with hook',
        category: 'testing',
        tier: 'project',
      },
      onLoad,
    } as never);
    expect(onLoad).toHaveBeenCalledOnce();
  });
});

describe('duplicate handling', () => {
  it('rejects a duplicate at the same or lower-priority tier', async () => {
    const loader = new AgentLoader();
    await loader.loadAgent(writeMdAgent('dup-a.md', 'dup-agent'), 'project');
    await expect(
      loader.loadAgent(writeMdAgent('dup-b.md', 'dup-agent'), 'private'),
    ).rejects.toThrow(/already loaded from tier 'project'/);
  });

  it('overrides a duplicate from a higher-priority tier', async () => {
    const loader = new AgentLoader();
    await loader.loadAgent(writeMdAgent('dup-c.md', 'dup-agent-2'), 'private');
    const reloaded = await loader.loadAgent(writeMdAgent('dup-d.md', 'dup-agent-2'), 'project');
    expect(reloaded.tier).toBe('project');
  });
});

describe('failure modes', () => {
  it('wraps errors in AgentLoadError when failureMode is throw', async () => {
    const loader = new AgentLoader({ failureMode: 'throw' });
    await expect(loader.loadAgent(join(tmp, 'missing.md'))).rejects.toBeInstanceOf(AgentLoadError);
  });

  it('warns and rethrows the original error when failureMode is warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const loader = new AgentLoader({ failureMode: 'warn' });
      await expect(loader.loadAgent(join(tmp, 'missing.md'))).rejects.toThrow();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load agent'),
        expect.anything(),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('rethrows silently when failureMode is silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const loader = new AgentLoader({ failureMode: 'silent' });
      await expect(loader.loadAgent(join(tmp, 'missing.md'))).rejects.toThrow();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects manifests that fail validation', async () => {
    const loader = new AgentLoader({ failureMode: 'silent' });
    await expect(
      loader.loadAgent({ manifest: { name: 'incomplete' } } as never),
    ).rejects.toThrow(AgentValidationError);
  });
});

describe('discoverAgents', () => {
  it('discovers agents across search paths via glob patterns', async () => {
    const agentPath = writeMdAgent('discovered.md', 'discovered-agent');
    globMock.mockImplementation(async (pattern: string) =>
      pattern.endsWith('/**/*.md') ? [agentPath] : [],
    );
    const loader = new AgentLoader({ searchPaths: [tmp] });

    const discovered = await loader.discoverAgents();

    expect(discovered.map((m) => m.name)).toContain('discovered-agent');
    // four patterns per search path
    expect(globMock).toHaveBeenCalledTimes(4);
  });

  it('warns but continues when a discovered file fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      globMock.mockImplementation(async (pattern: string) =>
        pattern.endsWith('/**/*.md') ? [join(tmp, 'broken-agent.md')] : [],
      );
      const loader = new AgentLoader({ searchPaths: [tmp], failureMode: 'warn' });

      const discovered = await loader.discoverAgents();

      expect(discovered).toEqual([]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when a search path errors entirely', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      globMock.mockRejectedValue(new Error('glob exploded'));
      const loader = new AgentLoader({ searchPaths: ['/nope'], failureMode: 'warn' });

      const discovered = await loader.discoverAgents();

      expect(discovered).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to search path'),
        expect.anything(),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

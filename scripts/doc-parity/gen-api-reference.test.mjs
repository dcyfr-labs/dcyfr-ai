import { test, expect, describe } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderReference, barrelsFromExports, extractApiFromDts, docFilesFor, renderIndex } from './gen-api-reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));

describe('renderReference', () => {
  test('renders a level-3 backtick header for each value export', () => {
    const md = renderReference({
      subpath: './memory',
      packageName: '@dcyfr/ai',
      api: [
        { name: 'MemoryStore', kind: 'class', signature: 'class MemoryStore', summary: 'Stores memories.' },
        { name: 'createMemory', kind: 'function', signature: 'function createMemory(): Memory', summary: '' },
      ],
    });
    // check-exports.mjs matches /^#{2,4}\s+`Symbol`/ — every export gets an H2 header.
    expect(md).toMatch(/^## `MemoryStore`$/m);
    expect(md).toMatch(/^## `createMemory`$/m);
  });

  test('includes the subpath H1 title and a signature block + summary per export', () => {
    const md = renderReference({
      subpath: './memory',
      packageName: '@dcyfr/ai',
      api: [{ name: 'MemoryStore', kind: 'class', signature: 'class MemoryStore', summary: 'Stores memories.' }],
    });
    expect(md).toContain('# `@dcyfr/ai/memory`');
    expect(md).toContain('```ts\nclass MemoryStore\n```');
    expect(md).toContain('Stores memories.');
  });

  test('uses the bare package name as the root-barrel H1 title', () => {
    const md = renderReference({ subpath: '.', packageName: '@dcyfr/ai', api: [] });
    expect(md).toContain('# `@dcyfr/ai`');
  });

  test('starts with a TLP banner + H1 so generated files pass MD041', () => {
    const md = renderReference({ subpath: './memory', packageName: '@dcyfr/ai', api: [] });
    expect(md.startsWith('<!-- TLP:CLEAR -->\n# `@dcyfr/ai/memory`')).toBe(true);
  });
});

describe('barrelsFromExports', () => {
  test('maps each export entry to its built .d.ts barrel descriptor', () => {
    const exportsMap = {
      '.': './dist/ai/index.js',
      './memory': './dist/ai/memory/index.js',
      './gateway': { types: './dist/ai/src/gateway/index.d.ts', import: './dist/ai/src/gateway/index.js' },
    };
    const barrels = barrelsFromExports(exportsMap, { packageName: '@dcyfr/ai', repoRoot: '/repo' });
    expect(barrels).toEqual([
      { subpath: '.', importPath: '@dcyfr/ai', dts: '/repo/dist/ai/index.d.ts', src: '/repo/packages/ai/index.ts', packageName: '@dcyfr/ai' },
      { subpath: './memory', importPath: '@dcyfr/ai/memory', dts: '/repo/dist/ai/memory/index.d.ts', src: '/repo/packages/ai/memory/index.ts', packageName: '@dcyfr/ai' },
      { subpath: './gateway', importPath: '@dcyfr/ai/gateway', dts: '/repo/dist/ai/src/gateway/index.d.ts', src: '/repo/packages/ai/src/gateway/index.ts', packageName: '@dcyfr/ai' },
    ]);
  });
});

describe('extractApiFromDts', () => {
  test('returns public value exports with kind and JSDoc summary, excluding types', () => {
    const api = extractApiFromDts(join(here, '__fixtures__', 'barrel-sample.d.ts'));
    // value-only (Opts/ID interfaces+type aliases excluded), sorted by name.
    expect(api.map((e) => e.name)).toEqual(['Store', 'VERSION', 'add']);
    const add = api.find((e) => e.name === 'add');
    expect(add.kind).toBe('function');
    expect(add.summary).toBe('Adds two numbers.');
    expect(api.find((e) => e.name === 'Store').kind).toBe('class');
    expect(api.find((e) => e.name === 'VERSION').kind).toBe('const');
  });
});

describe('docFilesFor', () => {
  test('produces one docs/api/<slug>.md per barrel via injected extraction', () => {
    const barrels = [
      { subpath: '.', packageName: '@dcyfr/ai', dts: '/d/index.d.ts' },
      { subpath: './security/prompt-scan-worker', packageName: '@dcyfr/ai', dts: '/d/w.d.ts' },
    ];
    const extract = (dts) =>
      dts.includes('index') ? [{ name: 'loadConfig', kind: 'function', signature: 'function loadConfig()', summary: '' }] : [];
    const files = docFilesFor(barrels, { extract });
    // root barrel slugs to index.md; nested subpath flattens slashes to dashes.
    expect(files.map((f) => f.relPath)).toEqual(['docs/api/index.md', 'docs/api/security-prompt-scan-worker.md']);
    expect(files[0].content).toMatch(/^## `loadConfig`$/m);
  });
});

describe('renderIndex', () => {
  test('lists a markdown link to each barrel doc', () => {
    const idx = renderIndex([
      { subpath: '.', packageName: '@dcyfr/ai' },
      { subpath: './memory', packageName: '@dcyfr/ai' },
    ]);
    expect(idx.startsWith('<!-- TLP:CLEAR -->\n# `@dcyfr/ai` — API Reference')).toBe(true);
    expect(idx).toContain('[`@dcyfr/ai`](./index.md)');
    expect(idx).toContain('[`@dcyfr/ai/memory`](./memory.md)');
  });
});

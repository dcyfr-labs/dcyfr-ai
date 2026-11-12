import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluateCapabilities } from './check-capabilities.mjs';
import { buildGraph, entryPoints, extractSpecifiers, resolveSpecifier, stripComments } from './lib/import-graph.mjs';

let root;
const put = (rel, body = '') => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
};
const RUNNER = 'packages/ai/runner.ts';
const cap = (over = {}) => ({
  id: 'plugin-sandbox-docker',
  name: 'Docker plugin sandbox',
  status: 'shipped',
  module: RUNNER,
  usedBy: 'packages/ai/loader.ts',
  claimTerms: ['sandbox'],
  summary: 'A test capability.',
  ...over,
});
const run = (...caps) => evaluateCapabilities(root, { version: 1, capabilities: caps });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'capgate-'));
  put('package.json', JSON.stringify({ exports: { '.': { types: './dist/ai/index.d.ts', import: './dist/ai/index.js' } } }));
  put(RUNNER, 'export class Runner {}\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('shipped tier', () => {
  test('a runner nothing imports cannot be marked `shipped`', () => {
    put('packages/ai/index.ts', "export { loader } from './loader.js';\n");
    put('packages/ai/loader.ts', 'export const loader = 1;\n');
    const { failures, rows } = run(cap());
    expect(failures.join('\n')).toMatch(/does not reach packages\/ai\/runner\.ts through runtime import edges/);
    expect(rows[0].proven).toBe('planned');
  });

  test('a genuinely imported module passes as shipped', () => {
    put('packages/ai/index.ts', "export { loader } from './loader.js';\n");
    put('packages/ai/loader.ts', "import { Runner } from './runner.js';\nexport const loader = new Runner();\n");
    const { failures, rows } = run(cap());
    expect(failures).toEqual([]);
    expect(rows[0].proven).toBe('shipped');
    expect(rows[0].proof).toBe('packages/ai/loader.ts -> packages/ai/runner.ts');
  });

  test('a dynamic import() counts as a runtime import', () => {
    put('packages/ai/index.ts', "export { loader } from './loader.js';\n");
    put('packages/ai/loader.ts', "export const loader = () => import('./runner.js');\n");
    expect(run(cap()).failures).toEqual([]);
  });

  test('a re-export-only barrel does not make a module shipped', () => {
    put('packages/ai/index.ts', "export * from './loader.js';\n");
    put('packages/ai/loader.ts', "export { Runner } from './runner.js';\n");
    const { failures } = run(cap());
    expect(failures.join('\n')).toMatch(/does not reach packages\/ai\/runner\.ts through runtime import edges/);
  });

  test('a type-only import does not count (import type and import { type X })', () => {
    put('packages/ai/index.ts', "export { a } from './a.js';\nexport { b } from './b.js';\n");
    put('packages/ai/a.ts', "import type { Runner } from './runner.js';\nexport const a = 1;\n");
    put('packages/ai/b.ts', "import { type Runner } from './runner.js';\nexport const b = 1;\n");
    for (const usedBy of ['packages/ai/a.ts', 'packages/ai/b.ts']) {
      expect(run(cap({ usedBy })).failures.join('\n')).toMatch(/does not reach/);
    }
  });

  test('a mixed `import { type X, Y }` is a runtime import', () => {
    put('packages/ai/index.ts', "export { a } from './a.js';\n");
    put('packages/ai/a.ts', "import { type Runner, Runner as R } from './runner.js';\nexport const a = R;\n");
    expect(run(cap({ usedBy: 'packages/ai/a.ts' })).failures).toEqual([]);
  });

  test('an importer that is a test file does not count', () => {
    put('packages/ai/index.ts', "export const x = 1;\n");
    put('packages/ai/__tests__/runner.test.ts', "import { Runner } from '../runner.js';\nnew Runner();\n");
    const { failures } = run(cap({ usedBy: 'packages/ai/__tests__/runner.test.ts' }));
    expect(failures.join('\n')).toMatch(/is a test, fixture or non-TypeScript file/);
    // And a test importer alone never lifts a planned module.
    const planned = run(cap({ status: 'planned', usedBy: undefined }));
    expect(planned.failures).toEqual([]);
    expect(planned.rows[0].proven).toBe('planned');
  });

  test('an import that only appears in a comment or template string is ignored', () => {
    put('packages/ai/index.ts', "export { loader } from './loader.js';\n");
    put('packages/ai/loader.ts', "// import { Runner } from './runner.js';\n/* import './runner.js' */\nexport const s = `import { Runner } from './runner.js'`;\nexport const loader = 1;\n");
    expect(run(cap()).failures.join('\n')).toMatch(/does not reach/);
  });
});

describe('library-only and planned tiers', () => {
  test('library-only passes when reachable via re-export only', () => {
    put('packages/ai/index.ts', "export { Runner } from './runner.js';\n");
    const { failures, rows } = run(cap({ status: 'library-only', usedBy: undefined }));
    expect(failures).toEqual([]);
    expect(rows[0].proven).toBe('library-only');
  });

  test('library-only fails when the module is not reachable from an export entry', () => {
    put('packages/ai/index.ts', 'export const x = 1;\n');
    expect(run(cap({ status: 'library-only', usedBy: undefined })).failures.join('\n')).toMatch(/graph proves only planned/);
  });

  test('planned with a missing module fails', () => {
    put('packages/ai/index.ts', 'export const x = 1;\n');
    expect(run(cap({ status: 'planned', usedBy: undefined, module: 'packages/ai/nope.ts' })).failures.join('\n')).toMatch(/does not exist/);
  });

  test('planned fails when the code already qualifies for a higher tier (stale manifest)', () => {
    put('packages/ai/index.ts', "export { loader } from './loader.js';\n");
    put('packages/ai/loader.ts', "import { Runner } from './runner.js';\nexport const loader = new Runner();\n");
    expect(run(cap({ status: 'planned', usedBy: undefined })).failures.join('\n')).toMatch(/already qualifies as shipped/);
    expect(run(cap({ status: 'library-only', usedBy: undefined })).failures.join('\n')).toMatch(/already qualifies as shipped/);
  });

  test('shipped requires usedBy; usedBy is rejected on other statuses', () => {
    put('packages/ai/index.ts', "export { Runner } from './runner.js';\n");
    expect(run(cap({ usedBy: undefined })).failures.join('\n')).toMatch(/requires usedBy/);
    expect(run(cap({ status: 'library-only', usedBy: 'packages/ai/index.ts' })).failures.join('\n')).toMatch(/usedBy is only valid/);
  });

  test('schema errors: bad status, bad claim term, duplicate id', () => {
    put('packages/ai/index.ts', 'export const x = 1;\n');
    expect(run(cap({ status: 'done' })).failures.join('\n')).toMatch(/status must be one of/);
    expect(run(cap({ status: 'planned', usedBy: undefined, claimTerms: ['secure'] })).failures.join('\n')).toMatch(/claimTerms/);
    const planned = cap({ status: 'planned', usedBy: undefined });
    expect(run(planned, planned).failures.join('\n')).toMatch(/duplicate id/);
  });
});

describe('import graph', () => {
  test('maps .js to .ts, directory index.ts, extensionless and the @dcyfr/ai alias', () => {
    const files = new Set(['packages/ai/a.ts', 'packages/ai/dir/index.ts', 'packages/ai/b.ts', 'packages/ai/x/y.ts']);
    expect(resolveSpecifier('./a.js', 'packages/ai/b.ts', files)).toBe('packages/ai/a.ts');
    expect(resolveSpecifier('./dir', 'packages/ai/b.ts', files)).toBe('packages/ai/dir/index.ts');
    expect(resolveSpecifier('./dir/index.js', 'packages/ai/b.ts', files)).toBe('packages/ai/dir/index.ts');
    expect(resolveSpecifier('./a', 'packages/ai/b.ts', files)).toBe('packages/ai/a.ts');
    expect(resolveSpecifier('@dcyfr/ai/x/y', 'packages/ai/b.ts', files)).toBe('packages/ai/x/y.ts');
    expect(resolveSpecifier('zod', 'packages/ai/b.ts', files)).toBeNull();
  });

  test('extractSpecifiers separates imports from re-exports and drops types', () => {
    const src = [
      "import a from './a';",
      "import type { T } from './t';",
      "import { type U } from './u';",
      "import './side';",
      "export { v } from './v';",
      "export type { W } from './w';",
      "export * from './star';",
      "const m = await import('./dyn');",
    ].join('\n');
    const { imports, reexports } = extractSpecifiers(src);
    expect(imports.sort()).toEqual(['./a', './dyn', './side']);
    expect(reexports.sort()).toEqual(['./star', './v']);
  });

  test('stripComments keeps quoted specifiers and blanks comments', () => {
    const out = stripComments("// import 'x'\nimport 'y'; /* import 'z' */\n");
    expect(out).toContain("import 'y'");
    expect(out).not.toContain("'x'");
    expect(out).not.toContain("'z'");
  });

  test('entryPoints maps dist export targets back to packages sources', () => {
    put('packages/ai/index.ts', 'export {};\n');
    const g = buildGraph(root);
    expect(entryPoints(root, g)).toEqual(['packages/ai/index.ts']);
  });
});

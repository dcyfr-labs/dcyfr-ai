/**
 * Static import graph over the non-test TypeScript under `packages/`.
 *
 * Two edge kinds are tracked separately because the capabilities gate treats
 * them differently:
 *   - `imports`   runtime `import` edges (static, side-effect, dynamic `import()`).
 *                 `import type` and `import { type X }` (every specifier typed)
 *                 are ignored: they are erased at compile time.
 *   - `reexports` `export ... from` edges. A barrel that only re-exports a
 *                 module makes it reachable, but is not a load-path user of it.
 *
 * Dependency-free (regex + a small comment stripper) so the gate runs before
 * `npm run build` and needs no TypeScript compiler API.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '__fixtures__', '__mocks__', 'tests', 'test', 'fixtures']);
const TS_EXT = /\.(ts|tsx)$/;
const ALIAS_PREFIX = '@dcyfr/ai';

/** True for paths the graph must never include (tests, fixtures, declarations). */
export function isTestPath(relPath) {
  const parts = relPath.split('/');
  if (parts.slice(0, -1).some((p) => SKIP_DIRS.has(p) && p !== 'node_modules' && p !== 'dist')) return true;
  return /\.(test|spec)\.(ts|tsx)$/.test(relPath);
}

/** Recursively list non-test `.ts`/`.tsx` files under `<root>/packages` (posix, root-relative). */
export function listSourceFiles(root) {
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      const childRel = posix.join(rel, name);
      const st = statSync(join(root, childRel));
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(childRel);
      } else if (TS_EXT.test(name) && !name.endsWith('.d.ts') && !isTestPath(childRel)) {
        out.push(childRel);
      }
    }
  };
  if (existsSync(join(root, 'packages'))) walk('packages');
  return out;
}

/**
 * Replace comments and template-literal bodies with spaces (newlines kept) so
 * example code in JSDoc and in template strings never produces edges. Quoted
 * strings are preserved because import specifiers live in them.
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      if (i < n) { out += '  '; i += 2; }
    } else if (c === '"' || c === "'") {
      out += c; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; } else { out += src[i]; i++; }
      }
      if (i < n && src[i] === c) { out += c; i++; }
    } else if (c === '`') {
      out += c; i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\' && i + 1 < n) { out += '  '; i += 2; } else { out += src[i] === '\n' ? '\n' : ' '; i++; }
      }
      if (i < n) { out += '`'; i++; }
    } else {
      out += c; i++;
    }
  }
  return out;
}

/** True when a braced clause lists only `type X` specifiers (so it is erased). */
function allTyped(clause) {
  const m = clause.match(/^\s*\{([\s\S]*)\}\s*$/);
  if (!m) return false;
  const specs = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  return specs.length > 0 && specs.every((s) => /^type\s+\S/.test(s));
}

/** Extract `{ imports, reexports }` specifier lists from TypeScript source. */
export function extractSpecifiers(src) {
  const code = stripComments(src);
  const imports = [];
  const reexports = [];

  const importFrom = /(?:^|[;}])[ \t]*import\s+([^;'"]*?)\s*from\s*(['"])([^'"\n]+)\2/gm;
  for (const m of code.matchAll(importFrom)) {
    const clause = m[1].trim();
    if (/^type\s/.test(clause) || allTyped(clause)) continue;
    imports.push(m[3]);
  }
  const sideEffect = /(?:^|[;}])[ \t]*import\s*(['"])([^'"\n]+)\1/gm;
  for (const m of code.matchAll(sideEffect)) imports.push(m[2]);
  const dynamic = /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;
  for (const m of code.matchAll(dynamic)) imports.push(m[2]);

  const reexport = /(?:^|[;}])[ \t]*export\s+(type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\3/gm;
  for (const m of code.matchAll(reexport)) {
    if (m[1] || allTyped(m[2])) continue;
    reexports.push(m[4]);
  }
  return { imports, reexports };
}

/**
 * Resolve a specifier to a graph file. Handles relative specifiers (with `.js`
 * mapped to `.ts`, or extensionless), directory `index.ts`, and the tsconfig
 * alias `@dcyfr/ai/*` -> `packages/ai/*`. Returns null for external packages.
 */
export function resolveSpecifier(spec, fromFile, fileSet) {
  let base;
  if (spec.startsWith('.')) {
    base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  } else if (spec === ALIAS_PREFIX) {
    base = 'packages/ai/index';
  } else if (spec.startsWith(ALIAS_PREFIX + '/')) {
    base = posix.join('packages/ai', spec.slice(ALIAS_PREFIX.length + 1));
  } else {
    return null;
  }
  const bare = base.replace(/\.(m?js|cjs|jsx)$/, '');
  const candidates = [bare + '.ts', bare + '.tsx', base + '.ts', base + '.tsx', posix.join(bare, 'index.ts'), posix.join(base, 'index.ts'), base];
  return candidates.find((c) => fileSet.has(c)) ?? null;
}

/** Build the graph for `root`. `files` may be passed to avoid a second walk. */
export function buildGraph(root, files = listSourceFiles(root)) {
  const fileSet = new Set(files);
  const imports = new Map();
  const reexports = new Map();
  for (const f of files) {
    const { imports: i, reexports: r } = extractSpecifiers(readFileSync(join(root, f), 'utf8'));
    const resolve = (specs) => new Set(specs.map((s) => resolveSpecifier(s, f, fileSet)).filter((t) => t && t !== f));
    imports.set(f, resolve(i));
    reexports.set(f, resolve(r));
  }
  return { files: fileSet, imports, reexports };
}

/** Package export entry files, mapped from `dist/ai/x.js` back to `packages/ai/x.ts`. */
export function entryPoints(root, graph) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const targets = new Set();
  const collect = (v) => {
    if (typeof v === 'string') targets.add(v);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'types') collect(x);
  };
  collect(pkg.exports);
  if (pkg.main) targets.add(pkg.main);
  const out = new Set();
  for (const t of targets) {
    const rel = posix.normalize(t.replace(/^\.\//, ''));
    if (!rel.startsWith('dist/')) continue;
    const src = 'packages/' + rel.slice('dist/'.length).replace(/\.(m?js|cjs)$/, '.ts');
    if (graph.files.has(src)) out.add(src);
  }
  return [...out].sort();
}

/** Files reachable from `starts` following imports and re-exports. */
export function reachableFrom(graph, starts) {
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    const f = queue.pop();
    for (const map of [graph.imports, graph.reexports]) {
      for (const t of map.get(f) ?? []) if (!seen.has(t)) { seen.add(t); queue.push(t); }
    }
  }
  return seen;
}

/**
 * Shortest runtime-import path from `from` to `to` (re-export edges are NOT
 * followed). Returns the file list including both ends, or null.
 */
export function importPath(graph, from, to) {
  if (from === to) return null;
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const f = queue.shift();
    for (const t of graph.imports.get(f) ?? []) {
      if (prev.has(t)) continue;
      prev.set(t, f);
      if (t === to) {
        const path = [t];
        for (let p = prev.get(t); p !== null; p = prev.get(p)) path.unshift(p);
        return path;
      }
      queue.push(t);
    }
  }
  return null;
}

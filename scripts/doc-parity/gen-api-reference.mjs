#!/usr/bin/env node
/**
 * Wave 1 generated API reference (dcyfr-ai-doc-automation).
 *
 * Produces a deterministic, per-subpath markdown reference covering every public
 * VALUE export across the root barrel and all declared subpath barrels, from the
 * BUILT type declarations (dist/**\/*.d.ts). Each export gets a `### \`name\``
 * header so the forward export-parity gate (check-exports.mjs) sees it as
 * documented — letting that gate flip to strict.
 *
 * Pure functions (barrelsFromExports / renderReference) are unit-tested;
 * extractApiFromDts reads the TS compiler's view of the built .d.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * True when a declaration's source file is the generated, release-managed version
 * module (`packages/ai/generated/version.ts` → `dist/**\/generated/version.d.ts`).
 * Its `VERSION` const emits a literal-typed value (`VERSION = "3.4.0"`) that bumps
 * every release; the reference widens it to its base type so a release-please
 * version bump never perturbs `docs/api` and reds the strict Doc Parity gate.
 * @param {string} fileName absolute or relative path to a `.d.ts`
 * @returns {boolean}
 */
export function isGeneratedVersionDts(fileName) {
  return /(^|[/\\])generated[/\\]version\.d\.ts$/.test(fileName || '');
}

/** Map a resolved symbol's flags to a coarse declaration kind (value exports only). */
function classifyKind(flags) {
  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Enum) return 'enum';
  if (flags & ts.SymbolFlags.Variable) return 'const';
  return 'value';
}

/**
 * Enumerate the public VALUE exports of a built `.d.ts` barrel, resolving
 * re-export aliases, and capture each export's kind, a single-line signature,
 * and its JSDoc summary (first line). Type-only exports (interface / type alias)
 * are excluded — the parity gate only requires value exports to be documented.
 * @param {string} dtsPath absolute path to the built `.d.ts`
 * @returns {Array<{name:string, kind:string, signature:string, summary:string}>}
 */
export function extractApiFromDts(dtsPath) {
  const program = ts.createProgram([dtsPath], {
    noEmit: true,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(dtsPath);
  if (!sf) return [];
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) return [];

  const out = [];
  for (const exp of checker.getExportsOfModule(moduleSymbol)) {
    let sym = exp;
    if (sym.flags & ts.SymbolFlags.Alias) {
      try {
        sym = checker.getAliasedSymbol(sym);
      } catch {
        /* unresolved re-export target — keep the alias symbol */
      }
    }
    if (!(sym.flags & ts.SymbolFlags.Value)) continue; // type-only export
    const decl = sym.declarations?.[0];
    let signature = '';
    if (decl) {
      if (isGeneratedVersionDts(decl.getSourceFile().fileName)) {
        // Render the release-managed VERSION const by its widened base type
        // (`VERSION: string`) instead of the literal value the .d.ts carries, so
        // the generated reference is version-invariant. See isGeneratedVersionDts.
        const baseType = checker.getBaseTypeOfLiteralType(checker.getTypeOfSymbolAtLocation(sym, decl));
        signature = `${exp.name}: ${checker.typeToString(baseType)}`;
      } else {
        signature = decl
          .getText(decl.getSourceFile())
          .split('{')[0]
          .replace(/\s+/g, ' ')
          .replace(/^export\s+(declare\s+)?/, '')
          .replace(/;?\s*$/, '')
          .trim();
      }
    }
    const summary = ts.displayPartsToString(sym.getDocumentationComment(checker)).split('\n')[0].trim();
    out.push({ name: exp.name, kind: classifyKind(sym.flags), signature, summary });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Resolve a package.json `exports` map to one descriptor per barrel, pointing at
 * the built `.d.ts` for each subpath.
 * @param {Record<string, string | {types?:string, import?:string, default?:string}>} exportsMap
 * @param {{packageName: string, repoRoot: string}} opts
 * @returns {Array<{subpath:string, importPath:string, dts:string, packageName:string}>}
 */
export function barrelsFromExports(exportsMap, { packageName, repoRoot }) {
  const toDts = (p) => (p || '').replace(/\.js$/, '.d.ts');
  return Object.entries(exportsMap).map(([subpath, entry]) => {
    const types = typeof entry === 'string' ? toDts(entry) : entry.types ?? toDts(entry.import ?? entry.default);
    const rel = types.replace(/^\.\//, '');
    const dts = join(repoRoot, rel);
    // The TS source barrel mirrors the dist tree (dist/ai/** ← packages/ai/**);
    // the source-based export-parity check reads it without needing a build.
    const src = join(repoRoot, rel.replace(/^dist\//, 'packages/').replace(/\.d\.ts$/, '.ts'));
    const importPath = subpath === '.' ? packageName : packageName + subpath.slice(1);
    return { subpath, importPath, dts, src, packageName };
  });
}

/**
 * Render one barrel's API into deterministic markdown.
 * @param {{subpath: string, packageName: string, api: Array<{name:string,kind:string,signature:string,summary:string}>}} barrel
 * @returns {string}
 */
/** Slug a subpath to a `docs/api` filename stem. `'.'` → `'index'`. */
export function slugOf(subpath) {
  return subpath.replace(/^\.\/?/, '').replace(/\//g, '-') || 'index';
}

/**
 * Plan the generated doc files for a set of barrels. Pure given an injected
 * `extract` (defaults to extractApiFromDts in the CLI), so it unit-tests with no
 * filesystem or compiler.
 * @param {Array<{subpath:string, packageName:string, dts:string}>} barrels
 * @param {{extract: (dtsPath:string)=>Array<object>}} deps
 * @returns {Array<{relPath:string, content:string}>}
 */
export function docFilesFor(barrels, { extract }) {
  return barrels.map((b) => ({
    relPath: `docs/api/${slugOf(b.subpath)}.md`,
    content: renderReference({ ...b, api: extract(b.dts) }),
  }));
}

const GENERATED_NOTE =
  '<!-- Generated by scripts/doc-parity/gen-api-reference.mjs from the built .d.ts — do not edit by hand. -->';

/**
 * Render the docs/api index (TOC) linking every barrel doc.
 * @param {Array<{subpath:string, packageName:string}>} barrels
 * @returns {string}
 */
export function renderIndex(barrels) {
  const packageName = barrels[0]?.packageName ?? '';
  const lines = ['<!-- TLP:CLEAR -->', `# \`${packageName}\` — API Reference`, '', GENERATED_NOTE, ''];
  for (const b of barrels) {
    const importPath = b.subpath === '.' ? packageName : packageName + b.subpath.slice(1);
    lines.push(`- [\`${importPath}\`](./${slugOf(b.subpath)}.md)`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderReference({ subpath, packageName, api }) {
  const importPath = subpath === '.' ? packageName : packageName + subpath.slice(1);
  // Leading TLP comment + H1 keep generated files MD041-clean (verified against
  // the repo's markdownlint config); export headers are H2 so check-exports'
  // `^#{2,4}\s+`Symbol`` matcher counts them as documented.
  const lines = ['<!-- TLP:CLEAR -->', `# \`${importPath}\``, '', GENERATED_NOTE, ''];
  for (const e of api) {
    lines.push(`## \`${e.name}\``, '', `\`${e.kind}\``, '');
    if (e.signature) lines.push('```ts', e.signature, '```', '');
    if (e.summary) lines.push(e.summary, '');
  }
  return lines.join('\n');
}

/** CLI: regenerate docs/api/*.md from the built .d.ts barrels. */
export function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const barrels = barrelsFromExports(pkg.exports, { packageName: pkg.name, repoRoot });
  const apiDir = join(repoRoot, 'docs', 'api');
  mkdirSync(apiDir, { recursive: true });
  const files = docFilesFor(barrels, { extract: extractApiFromDts });
  for (const f of files) writeFileSync(join(repoRoot, f.relPath), f.content);
  writeFileSync(join(apiDir, 'README.md'), renderIndex(barrels));
  console.log(`gen-api-reference: wrote ${files.length} barrel docs + index to docs/api/`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

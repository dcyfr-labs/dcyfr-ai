#!/usr/bin/env node

// Adds the file extensions Node's ESM loader requires to relative specifiers
// in the compiled output. tsc emits them as written (`./foo`), which works for
// bundlers but not for Node, and not for consumers whose tsconfig uses
// `moduleResolution: node16 | nodenext` without `skipLibCheck`: their compiler
// reads our .d.ts files and stops at TS2834/TS2835. So both the .js files and
// the .d.ts files are rewritten; in a .d.ts the specifier still names the .js
// file, which TypeScript maps to the declaration next to it.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DIST_ROOT = path.resolve(process.cwd(), 'dist', 'ai');

const SPECIFIER_REGEX = /(from\s+['"](\.{1,2}\/[^'"\n]+)['"]|export\s+\*\s+from\s+['"](\.{1,2}\/[^'"\n]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"\n]+)['"]\s*\))/g;

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hasKnownExtension(specifier) {
  return /\.(js|mjs|cjs|json|node)$/i.test(specifier);
}

async function resolveSpecifier(filePath, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return null;
  }

  if (hasKnownExtension(specifier)) {
    return null;
  }

  const absoluteBase = path.resolve(path.dirname(filePath), specifier);

  if ((await exists(`${absoluteBase}.js`)) || (await exists(`${absoluteBase}.d.ts`))) {
    return `${specifier}.js`;
  }

  if (
    (await exists(path.join(absoluteBase, 'index.js'))) ||
    (await exists(path.join(absoluteBase, 'index.d.ts')))
  ) {
    return `${specifier}/index.js`;
  }

  return null;
}

async function walkOutputFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkOutputFiles(fullPath)));
    } else if (entry.isFile() && (fullPath.endsWith('.js') || fullPath.endsWith('.d.ts'))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function rewriteFile(filePath) {
  const original = await fs.readFile(filePath, 'utf8');
  const matches = [...original.matchAll(SPECIFIER_REGEX)];

  if (matches.length === 0) {
    return { changed: false, replacements: 0 };
  }

  let updated = original;
  let replacements = 0;

  for (const match of matches) {
    const fullMatch = match[0];
    const specifier = match[2] ?? match[3] ?? match[4];

    if (!specifier) {
      continue;
    }

    const resolved = await resolveSpecifier(filePath, specifier);
    if (!resolved || resolved === specifier) {
      continue;
    }

    const updatedMatch = fullMatch.replace(specifier, resolved);
    if (updatedMatch !== fullMatch) {
      updated = updated.replace(fullMatch, updatedMatch);
      replacements += 1;
    }
  }

  if (updated !== original) {
    await fs.writeFile(filePath, updated, 'utf8');
    return { changed: true, replacements };
  }

  return { changed: false, replacements: 0 };
}

async function main() {
  if (!(await exists(DIST_ROOT))) {
    console.warn(`[fix-esm-imports] dist root not found, skipping: ${DIST_ROOT}`);
    return;
  }

  const files = await walkOutputFiles(DIST_ROOT);
  let changedFiles = 0;
  let totalReplacements = 0;

  for (const filePath of files) {
    const result = await rewriteFile(filePath);
    if (result.changed) {
      changedFiles += 1;
      totalReplacements += result.replacements;
    }
  }

  console.log(
    `[fix-esm-imports] Updated ${totalReplacements} specifier(s) in ${changedFiles} file(s) under ${path.relative(process.cwd(), DIST_ROOT)}`,
  );
}

main().catch((error) => {
  console.error('[fix-esm-imports] failed:', error);
  process.exitCode = 1;
});

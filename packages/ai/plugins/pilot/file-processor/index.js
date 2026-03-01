/** @dcyfr-pilot/file-processor — entry point */
'use strict';

import { readFile, writeFile, mkdir, glob } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Analyse TypeScript source files in a directory.
 *
 * @param {string} srcDir - Source directory to analyse
 * @param {string} outputDir - Directory for the analysis report
 * @returns {Promise<{ files: number; lines: number; reportPath: string }>}
 */
async function analyseSourceFiles(srcDir, outputDir) {
  let totalLines = 0;
  let fileCount = 0;
  const breakdown = [];

  for await (const entry of glob(`${srcDir}/**/*.{ts,js}`)) {
    const content = await readFile(entry, 'utf8');
    const lines = content.split('\n').length;
    totalLines += lines;
    fileCount++;
    breakdown.push({ file: entry, lines });
  }

  await mkdir(outputDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    summary: { files: fileCount, totalLines },
    breakdown,
  };

  const reportPath = join(outputDir, 'source-analysis.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  return { files: fileCount, lines: totalLines, reportPath };
}

export { analyseSourceFiles };

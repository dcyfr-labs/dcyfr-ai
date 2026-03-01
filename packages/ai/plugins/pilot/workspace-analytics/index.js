/** @dcyfr-pilot/workspace-analytics — entry point */
'use strict';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Read and parse a coverage summary file.
 *
 * @param {string} coverageDir - Path to the coverage directory
 * @returns {Promise<Record<string, unknown> | null>} Coverage summary or null
 */
async function readCoverageSummary(coverageDir) {
  try {
    const summaryPath = join(coverageDir, 'coverage-summary.json');
    const raw = await readFile(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Aggregate basic workspace metrics.
 *
 * @param {string} workspaceRoot - Workspace root path
 * @returns {Promise<Record<string, unknown>>} Workspace metrics
 */
async function collectWorkspaceMetrics(workspaceRoot) {
  const coverage = await readCoverageSummary(join(workspaceRoot, 'coverage'));

  return {
    collectedAt: new Date().toISOString(),
    environment: process.env['NODE_ENV'] ?? 'unknown',
    ci: Boolean(process.env['CI']),
    coverage: coverage
      ? {
          statements: coverage['total']?.['statements']?.['pct'],
          branches: coverage['total']?.['branches']?.['pct'],
          functions: coverage['total']?.['functions']?.['pct'],
          lines: coverage['total']?.['lines']?.['pct'],
        }
      : null,
  };
}

export { readCoverageSummary, collectWorkspaceMetrics };

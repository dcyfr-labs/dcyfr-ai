/**
 * SBOM Generator
 *
 * Generates Software Bill of Materials in CycloneDX format using Syft CLI.
 * Falls back to `npm ls --all --json` when Syft is unavailable.
 *
 * @module plugins/security/sbom-generator
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SBOMResult, SBOMComponent } from './types.js';

const execFileAsync = promisify(execFile);

/** Directory where SBOMs are persisted */
const SBOM_STORAGE_DIR = join(homedir(), '.dcyfr', 'plugin-sboms');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureStorageDir(): void {
  if (!existsSync(SBOM_STORAGE_DIR)) {
    mkdirSync(SBOM_STORAGE_DIR, { recursive: true });
  }
}

function buildStoragePath(pluginId: string, version: string): string {
  const safeId = pluginId.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  return join(SBOM_STORAGE_DIR, `${safeId}-${version}.json`);
}

// ---------------------------------------------------------------------------
// Syft-based SBOM
// ---------------------------------------------------------------------------

interface SyftCycloneDXComponent {
  name?: string;
  version?: string;
  licenses?: Array<{ expression?: string }>;
  cpe?: string;
  purl?: string;
  type?: string;
}

interface SyftOutput {
  components?: SyftCycloneDXComponent[];
}

async function generateWithSyft(
  pluginPath: string,
  storagePath: string,
): Promise<SBOMResult> {
  const { stdout } = await execFileAsync('syft', [
    pluginPath,
    '--output',
    'cyclonedx-json',
  ]);

  const parsed: SyftOutput = JSON.parse(stdout);
  const components: SBOMComponent[] = (parsed.components ?? []).map((c) => ({
    name: c.name ?? 'unknown',
    version: c.version ?? 'unknown',
    license: c.licenses?.[0]?.expression,
    cpe: c.cpe,
    purl: c.purl,
    ecosystem: c.type,
  }));

  writeFileSync(storagePath, JSON.stringify({ components, format: 'cyclonedx', generatedAt: new Date().toISOString() }, null, 2));

  return {
    success: true,
    usedFallback: false,
    format: 'cyclonedx',
    components,
    storagePath,
  };
}

// ---------------------------------------------------------------------------
// npm ls fallback
// ---------------------------------------------------------------------------

interface NpmLsEntry {
  version?: string;
  resolved?: string;
  dependencies?: Record<string, NpmLsEntry>;
}

interface NpmLsOutput {
  name?: string;
  version?: string;
  dependencies?: Record<string, NpmLsEntry>;
}

function flattenNpmLsDeps(
  deps: Record<string, NpmLsEntry> | undefined,
  acc: SBOMComponent[],
): void {
  if (!deps) return;
  for (const [name, entry] of Object.entries(deps)) {
    acc.push({ name, version: entry.version ?? 'unknown', ecosystem: 'npm' });
    flattenNpmLsDeps(entry.dependencies, acc);
  }
}

async function generateWithNpmLs(
  pluginPath: string,
  storagePath: string,
): Promise<SBOMResult> {
  const { stdout } = await execFileAsync('npm', ['ls', '--all', '--json'], {
    cwd: pluginPath,
  });

  const parsed: NpmLsOutput = JSON.parse(stdout);
  const components: SBOMComponent[] = [];
  flattenNpmLsDeps(parsed.dependencies, components);

  writeFileSync(storagePath, JSON.stringify({ components, format: 'npm-ls', generatedAt: new Date().toISOString() }, null, 2));

  return {
    success: true,
    usedFallback: true,
    format: 'npm-ls',
    components,
    storagePath,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an SBOM for a plugin.
 *
 * Tries Syft first; falls back to `npm ls` if Syft is unavailable.
 *
 * @param pluginId  Unique plugin identifier used in storage path
 * @param version   Plugin version string
 * @param pluginPath Absolute path to the extracted plugin directory
 */
export async function generateSBOM(
  pluginId: string,
  version: string,
  pluginPath: string,
): Promise<SBOMResult> {
  ensureStorageDir();
  const storagePath = buildStoragePath(pluginId, version);

  try {
    return await generateWithSyft(pluginPath, storagePath);
  } catch (syftError) {
    // Syft unavailable or parsing failed — try npm ls fallback
    try {
      const result = await generateWithNpmLs(pluginPath, storagePath);
      return result;
    } catch (npmError) {
      return {
        success: false,
        usedFallback: true,
        format: 'npm-ls',
        components: [],
        error: `Syft: ${String(syftError)} | npm ls: ${String(npmError)}`,
      };
    }
  }
}

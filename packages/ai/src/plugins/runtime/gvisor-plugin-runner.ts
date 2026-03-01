/**
 * gVisor Plugin Runner
 *
 * Extends DockerPluginRunner with gVisor (runsc) runtime support.
 * Enforces TLP-based runtime selection:
 *   - TLP:CLEAR / TLP:GREEN → standard Docker (no gVisor required)
 *   - TLP:AMBER            → gVisor preferred; gracefully falls back to Docker
 *   - TLP:RED              → gVisor required; throws if unavailable
 *
 * gVisor (runsc) provides an additional kernel isolation layer on top of
 * Docker by intercepting all guest system calls via a user-space kernel.
 * This significantly reduces the attack surface for privilege escalation
 * exploits in high-sensitivity (AMBER/RED) plugin workloads.
 *
 * Specification: Plugin Marketplace Security — Phase 15 (gVisor Integration)
 *
 * @see https://gvisor.dev/docs/
 * @module plugins/runtime/gvisor-plugin-runner
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DockerPluginRunner } from './docker-plugin-runner.js';
import type { SandboxConfig, SandboxResult, GVisorProbeResult } from './types.js';
import type { TLPLevel } from '../../types/delegation-contracts.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown when a TLP:RED plugin cannot be executed because the gVisor
 * runtime (runsc) is not available on the host machine.
 *
 * TLP:RED plugins are blocked unconditionally if gVisor is absent —
 * unlike TLP:AMBER which falls back to standard Docker with a warning.
 */
export class GVisorRequiredError extends Error {
  readonly code = 'GVISOR_REQUIRED';

  constructor(message: string) {
    super(message);
    this.name = 'GVisorRequiredError';
    // Maintain proper prototype chain in compiled JS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Result type with runtime metadata
// ---------------------------------------------------------------------------

/** Extended result that records which container runtime was actually used. */
export interface GVisorSandboxResult extends SandboxResult {
  /** Indicates whether gVisor or standard Docker executed the plugin. */
  runtimeUsed: 'gvisor' | 'docker';
  /** The TLP level that drove runtime selection. */
  tlpLevel: TLPLevel;
}

// ---------------------------------------------------------------------------
// GVisorPluginRunner
// ---------------------------------------------------------------------------

/**
 * Plugin runner with gVisor (runsc) isolation support and TLP enforcement.
 *
 * Inherits all standard Docker sandbox behaviour from DockerPluginRunner and
 * adds:
 * 1. Lightweight PATH-based gVisor detection (no Docker daemon required).
 * 2. `runWithTlp()` — TLP-aware `run()` wrapper that automatically selects
 *    `--runtime=runsc` for AMBER/RED plugins and enforces blocking for RED
 *    when gVisor is absent.
 *
 * @example
 * ```ts
 * const runner = new GVisorPluginRunner();
 * const result = await runner.runWithTlp(
 *   { image: 'dcyfr-plugin-sandbox:latest', command: ['node', 'dist/index.js'] },
 *   'TLP:AMBER',
 * );
 * console.log(result.runtimeUsed); // 'gvisor' | 'docker'
 * console.log(result.tlpLevel);    // 'TLP:AMBER'
 * ```
 */
export class GVisorPluginRunner extends DockerPluginRunner {
  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Probe whether the gVisor `runsc` binary is present on this machine.
   *
   * Uses a two-stage lightweight check — no Docker daemon required:
   * 1. `which runsc`     — succeeds on most Linux/macOS installations.
   * 2. `runsc --version` — fallback for non-standard PATH configurations.
   *
   * This is faster than DockerPluginRunner.isGVisorAvailable() which spins
   * up a full container and pulls `hello-world`. Use this method for all
   * availability checks before scheduling plugin workloads.
   */
  override async isGVisorAvailable(): Promise<GVisorProbeResult> {
    // Stage 1: which runsc
    try {
      await execFileAsync('which', ['runsc']);
      return { available: true };
    } catch {
      // Fall through to stage 2
    }

    // Stage 2: runsc --version (handles non-standard PATH setups)
    try {
      await execFileAsync('runsc', ['--version']);
      return { available: true };
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_);
      return {
        available: false,
        error: `runsc not found in PATH: ${msg}`,
      };
    }
  }

  /**
   * Execute a plugin with TLP-level-aware runtime selection.
   *
   * Runtime selection table:
   *
   * | TLP Level   | gVisor Available | Behaviour                                  |
   * |-------------|------------------|--------------------------------------------|
   * | CLEAR/GREEN | any              | Standard Docker (--runtime flag omitted)   |
   * | AMBER       | yes              | gVisor (--runtime=runsc)                   |
   * | AMBER       | no               | Docker fallback; warning prepended to stderr |
   * | RED         | yes              | gVisor (--runtime=runsc)                   |
   * | RED         | no               | Throws GVisorRequiredError — BLOCKED       |
   *
   * @param config   Standard SandboxConfig. The `useGVisor` field is managed
   *                 automatically and should be omitted by callers.
   * @param tlpLevel Plugin data classification. Defaults to 'TLP:CLEAR'.
   * @returns SandboxResult enriched with `runtimeUsed` and `tlpLevel`.
   * @throws {GVisorRequiredError} When tlpLevel is 'TLP:RED' and gVisor is unavailable.
   */
  async runWithTlp(
    config: SandboxConfig,
    tlpLevel: TLPLevel = 'TLP:CLEAR',
  ): Promise<GVisorSandboxResult> {
    const requiresGVisor = tlpLevel === 'TLP:AMBER' || tlpLevel === 'TLP:RED';

    if (!requiresGVisor) {
      // TLP:CLEAR or TLP:GREEN — standard Docker, gVisor not needed
      const result = await this.run({ ...config, useGVisor: false });
      return { ...result, runtimeUsed: 'docker', tlpLevel };
    }

    const probe = await this.isGVisorAvailable();

    if (probe.available) {
      // gVisor present — enable --runtime=runsc
      const result = await this.run({ ...config, useGVisor: true });
      return { ...result, runtimeUsed: 'gvisor', tlpLevel };
    }

    // gVisor unavailable -------------------------------------------------------

    if (tlpLevel === 'TLP:RED') {
      throw new GVisorRequiredError(
        `TLP:RED plugin requires gVisor isolation but runsc is not available: ` +
          `${probe.error ?? 'unknown reason'}. ` +
          `Install gVisor on your host: https://gvisor.dev/docs/user_guide/install/`,
      );
    }

    // TLP:AMBER fallback — run with standard Docker but prepend a clear warning
    const fallbackResult = await this.run({ ...config, useGVisor: false });
    const warning =
      `[DCYFR WARNING] gVisor unavailable (${probe.error ?? 'runsc not in PATH'}). ` +
      `TLP:AMBER plugin running in standard Docker — isolation reduced. ` +
      `Install gVisor for full isolation: https://gvisor.dev/docs/user_guide/install/\n`;

    return {
      ...fallbackResult,
      runtimeUsed: 'docker',
      tlpLevel,
      stderr: warning + fallbackResult.stderr,
    };
  }
}

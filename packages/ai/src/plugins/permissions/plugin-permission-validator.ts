/**
 * Plugin Permission Validator
 *
 * Validates plugin permission requests against declared capabilities using
 * glob pattern matching. Implements the capability-based least-privilege model.
 *
 * Uses Node.js v22+ built-in `path.matchesGlob()` for filesystem patterns.
 *
 * @module plugins/permissions/plugin-permission-validator
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { matchesGlob } from 'node:path';
import type {
  PluginPermissions,
  PermissionCheckResult,
  PermissionViolation,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAnyGlob(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      return matchesGlob(path, pattern);
    } catch {
      return false;
    }
  });
}

function matchesDomain(hostname: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true; // no restrictions
  return allowedDomains.some((domain) => {
    // Support wildcard subdomains: *.github.com matches api.github.com
    if (domain.startsWith('*.')) {
      const suffix = domain.slice(1); // .github.com
      return hostname === domain.slice(2) || hostname.endsWith(suffix);
    }
    return hostname === domain;
  });
}

// ---------------------------------------------------------------------------
// Public validator class
// ---------------------------------------------------------------------------

/** Stateless validator — create once and reuse across permission checks */
export class PluginPermissionValidator {
  constructor(private readonly permissions: PluginPermissions) {}

  // -------------------------------------------------------------------------
  // Filesystem
  // -------------------------------------------------------------------------

  /** Check if the plugin may read a given file/directory path */
  checkFileRead(path: string): PermissionCheckResult {
    const { read } = this.permissions.filesystem;
    const violations: PermissionViolation[] = [];

    if (read.length === 0) {
      violations.push({
        category: 'filesystem',
        message: `No read patterns declared — read access denied for "${path}"`,
        requested: path,
        blocking: true,
      });
      return { granted: false, reason: `Filesystem read not declared`, violations };
    }

    if (!matchesAnyGlob(path, read)) {
      violations.push({
        category: 'filesystem',
        message: `Path "${path}" does not match any declared read pattern`,
        requested: path,
        blocking: true,
      });
      return {
        granted: false,
        reason: `Path "${path}" outside declared read patterns`,
        violations,
      };
    }

    return { granted: true, violations: [] };
  }

  /** Check if the plugin may write to a given file/directory path */
  checkFileWrite(path: string): PermissionCheckResult {
    const { write } = this.permissions.filesystem;
    const violations: PermissionViolation[] = [];

    if (write.length === 0) {
      violations.push({
        category: 'filesystem',
        message: `No write patterns declared — write access denied for "${path}"`,
        requested: path,
        blocking: true,
      });
      return { granted: false, reason: `Filesystem write not declared`, violations };
    }

    if (!matchesAnyGlob(path, write)) {
      violations.push({
        category: 'filesystem',
        message: `Path "${path}" does not match any declared write pattern`,
        requested: path,
        blocking: true,
      });
      return {
        granted: false,
        reason: `Path "${path}" outside declared write patterns`,
        violations,
      };
    }

    return { granted: true, violations: [] };
  }

  /** Check if the plugin may delete a given file/directory path */
  checkFileDelete(path: string): PermissionCheckResult {
    const { delete: del } = this.permissions.filesystem;
    const violations: PermissionViolation[] = [];

    if (del.length === 0) {
      violations.push({
        category: 'filesystem',
        message: `No delete patterns declared — delete access denied for "${path}"`,
        requested: path,
        blocking: true,
      });
      return { granted: false, reason: `Filesystem delete not declared`, violations };
    }

    if (!matchesAnyGlob(path, del)) {
      violations.push({
        category: 'filesystem',
        message: `Path "${path}" does not match any declared delete pattern`,
        requested: path,
        blocking: true,
      });
      return {
        granted: false,
        reason: `Path "${path}" outside declared delete patterns`,
        violations,
      };
    }

    return { granted: true, violations: [] };
  }

  // -------------------------------------------------------------------------
  // Network
  // -------------------------------------------------------------------------

  /**
   * Check if the plugin may make a network request to the given hostname.
   * Pass `url` as a full URL string (e.g. "https://api.github.com/repos/...").
   */
  checkNetworkRequest(url: string): PermissionCheckResult {
    const net = this.permissions.network;
    const violations: PermissionViolation[] = [];

    if (!net.allowed) {
      violations.push({
        category: 'network',
        message: `Network access is not permitted`,
        requested: url,
        blocking: true,
      });
      return { granted: false, reason: `Network access disabled`, violations };
    }

    // Extract hostname from URL
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      violations.push({
        category: 'network',
        message: `Invalid URL: "${url}"`,
        requested: url,
        blocking: true,
      });
      return { granted: false, reason: `Invalid URL`, violations };
    }

    if (net.allowedDomains.length > 0 && !matchesDomain(hostname, net.allowedDomains)) {
      violations.push({
        category: 'network',
        message: `Domain "${hostname}" is not in the allowed domains list`,
        requested: url,
        blocking: true,
      });
      return {
        granted: false,
        reason: `Domain "${hostname}" not in allowedDomains`,
        violations,
      };
    }

    return { granted: true, violations: [] };
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /** Check if the plugin may execute a given command */
  checkCommandExecution(command: string): PermissionCheckResult {
    const exec = this.permissions.execution;
    const violations: PermissionViolation[] = [];

    if (!exec.allowShellCommands) {
      // Shell commands entirely disabled
      violations.push({
        category: 'execution',
        message: `Shell commands are not permitted`,
        requested: command,
        blocking: true,
      });
      return { granted: false, reason: 'Shell commands are not permitted', violations };
    }

    // Shell commands enabled — if allowedCommands is empty, allow all.
    // If non-empty it acts as an explicit allowlist.
    if (exec.allowedCommands.length === 0) {
      return { granted: true, violations: [] };
    }

    const allowed = exec.allowedCommands.some((c) => {
      // Match full command or just the executable basename
      const executable = command.split(/\s+/)[0] ?? command;
      return c === executable || c === command;
    });

    if (!allowed) {
      violations.push({
        category: 'execution',
        message: `Command "${command}" is not in the execution allowlist`,
        requested: command,
        blocking: true,
      });
      return {
        granted: false,
        reason: `Command "${command}" not in allowedCommands`,
        violations,
      };
    }

    return { granted: true, violations: [] };
  }

  // -------------------------------------------------------------------------
  // MCP
  // -------------------------------------------------------------------------

  /** Check if the plugin may call a given MCP server */
  checkMcpAccess(serverName: string): PermissionCheckResult {
    const mcp = this.permissions.mcp;
    const violations: PermissionViolation[] = [];

    // Deny takes precedence
    if (mcp.deniedServers.includes(serverName)) {
      violations.push({
        category: 'mcp',
        message: `MCP server "${serverName}" is explicitly denied`,
        requested: serverName,
        blocking: true,
      });
      return { granted: false, reason: `MCP server "${serverName}" denied`, violations };
    }

    // Check allowlist (wildcard '*' allows all non-denied)
    const granted =
      mcp.allowedServers.includes('*') || mcp.allowedServers.includes(serverName);

    if (!granted) {
      violations.push({
        category: 'mcp',
        message: `MCP server "${serverName}" is not in the allowed servers list`,
        requested: serverName,
        blocking: true,
      });
      return {
        granted: false,
        reason: `MCP server "${serverName}" not in allowedServers`,
        violations,
      };
    }

    return { granted: true, violations: [] };
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  /** Check if the plugin may access environment variables */
  checkEnvAccess(): PermissionCheckResult {
    const violations: PermissionViolation[] = [];
    if (!this.permissions.data.allowEnvironmentVars) {
      violations.push({
        category: 'data',
        message: `Environment variable access is not permitted`,
        requested: 'process.env',
        blocking: true,
      });
      return {
        granted: false,
        reason: `Environment variable access disabled`,
        violations,
      };
    }
    return { granted: true, violations: [] };
  }

  /** Check if the plugin may access secrets */
  checkSecretAccess(): PermissionCheckResult {
    const violations: PermissionViolation[] = [];
    if (!this.permissions.data.allowSecretAccess) {
      violations.push({
        category: 'data',
        message: `Secret access is not permitted`,
        requested: 'secrets',
        blocking: true,
      });
      return { granted: false, reason: `Secret access disabled`, violations };
    }
    return { granted: true, violations: [] };
  }
}

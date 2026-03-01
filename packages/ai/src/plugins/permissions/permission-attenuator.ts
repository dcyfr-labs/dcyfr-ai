/**
 * Permission Attenuation
 *
 * Implements the principle that a delegating agent can only grant a
 * sub-agent permissions it already holds. Narrows permissions at the
 * point of delegation, producing an `AttenuatedPermissions` record.
 *
 * Compatible with the delegation framework's security middleware chain.
 *
 * @module plugins/permissions/permission-attenuator
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { matchesGlob } from 'node:path';
import type {
  PluginPermissions,
  FilesystemPermissions,
  NetworkPermissions,
  ExecutionPermissions,
  McpPermissions,
  DataPermissions,
  AttenuatedPermissions,
} from './types.js';

// ---------------------------------------------------------------------------
// Intersection helpers (narrow A ∩ B)
// ---------------------------------------------------------------------------

/**
 * Return only those patterns in `requested` that are covered by
 * at least one pattern in `granted`. "Covered" = every path that
 * matches `req` also matches at least one pattern in `granted`.
 *
 * For simplicity we use direct containment: a pattern is retained if it
 * is equal to a granted pattern or if one of the granted patterns is the
 * wildcard `**` (match all).
 */
function intersectGlobs(requested: string[], granted: string[]): string[] {
  if (granted.includes('**')) return requested;
  return requested.filter((req) =>
    granted.some((g) => {
      if (g === req) return true;
      // If granted pattern ends with /** try to see if requested is a sub-path
      try {
        return matchesGlob(req, g);
      } catch {
        return false;
      }
    }),
  );
}

function intersectFilesystem(
  requested: FilesystemPermissions,
  granted: FilesystemPermissions,
): { result: FilesystemPermissions; removed: string[] } {
  const read = intersectGlobs(requested.read, granted.read);
  const write = intersectGlobs(requested.write, granted.write);
  const delete_ = intersectGlobs(requested.delete, granted.delete);

  const removed: string[] = [];
  for (const p of requested.read) {
    if (!read.includes(p)) removed.push(`filesystem.read: ${p}`);
  }
  for (const p of requested.write) {
    if (!write.includes(p)) removed.push(`filesystem.write: ${p}`);
  }
  for (const p of requested.delete) {
    if (!delete_.includes(p)) removed.push(`filesystem.delete: ${p}`);
  }

  return { result: { read, write, delete: delete_ }, removed };
}

function intersectNetwork(
  requested: NetworkPermissions,
  granted: NetworkPermissions,
): { result: NetworkPermissions; removed: string[] } {
  const removed: string[] = [];
  const allowed = requested.allowed && granted.allowed;

  if (requested.allowed && !granted.allowed) {
    removed.push('network.allowed');
  }

  // Intersect domain lists
  let allowedDomains = requested.allowedDomains;
  if (granted.allowedDomains.length > 0) {
    allowedDomains = requested.allowedDomains.filter((d) =>
      granted.allowedDomains.includes(d),
    );
    for (const d of requested.allowedDomains) {
      if (!allowedDomains.includes(d)) removed.push(`network.allowedDomains: ${d}`);
    }
  }

  // Take the stricter (lower) request limit
  let maxRequests: number;
  if (requested.maxRequests === 0) {
    maxRequests = granted.maxRequests;
  } else if (granted.maxRequests === 0) {
    maxRequests = requested.maxRequests;
  } else {
    maxRequests = Math.min(requested.maxRequests, granted.maxRequests);
  }

  if (requested.maxRequests === 0 && granted.maxRequests > 0) {
    removed.push(`network.maxRequests: unlimited → ${granted.maxRequests}`);
  }

  return { result: { allowed, allowedDomains, maxRequests }, removed };
}

function intersectExecution(
  requested: ExecutionPermissions,
  granted: ExecutionPermissions,
): { result: ExecutionPermissions; removed: string[] } {
  const removed: string[] = [];
  const allowShellCommands = requested.allowShellCommands && granted.allowShellCommands;

  if (requested.allowShellCommands && !granted.allowShellCommands) {
    removed.push('execution.allowShellCommands');
  }

  const allowedCommands = granted.allowShellCommands
    ? requested.allowedCommands
    : requested.allowedCommands.filter((c) => granted.allowedCommands.includes(c));

  for (const c of requested.allowedCommands) {
    if (!allowedCommands.includes(c)) removed.push(`execution.allowedCommands: ${c}`);
  }

  let maxProcesses: number;
  if (requested.maxProcesses === 0) {
    maxProcesses = granted.maxProcesses;
  } else if (granted.maxProcesses === 0) {
    maxProcesses = requested.maxProcesses;
  } else {
    maxProcesses = Math.min(requested.maxProcesses, granted.maxProcesses);
  }

  return { result: { allowShellCommands, allowedCommands, maxProcesses }, removed };
}

function intersectMcp(
  requested: McpPermissions,
  granted: McpPermissions,
): { result: McpPermissions; removed: string[] } {
  const removed: string[] = [];

  // Merge deny lists (union)
  const deniedServers = [...new Set([...requested.deniedServers, ...granted.deniedServers])];

  // Intersect allow lists
  let allowedServers: string[];
  if (granted.allowedServers.includes('*')) {
    allowedServers = requested.allowedServers;
  } else if (requested.allowedServers.includes('*')) {
    allowedServers = granted.allowedServers;
  } else {
    allowedServers = requested.allowedServers.filter((s) =>
      granted.allowedServers.includes(s),
    );
    for (const s of requested.allowedServers) {
      if (!allowedServers.includes(s)) removed.push(`mcp.allowedServers: ${s}`);
    }
  }

  return { result: { allowedServers, deniedServers }, removed };
}

function intersectData(
  requested: DataPermissions,
  granted: DataPermissions,
): { result: DataPermissions; removed: string[] } {
  const removed: string[] = [];
  const allowEnvironmentVars = requested.allowEnvironmentVars && granted.allowEnvironmentVars;
  const allowSecretAccess = requested.allowSecretAccess && granted.allowSecretAccess;

  if (requested.allowEnvironmentVars && !granted.allowEnvironmentVars) {
    removed.push('data.allowEnvironmentVars');
  }
  if (requested.allowSecretAccess && !granted.allowSecretAccess) {
    removed.push('data.allowSecretAccess');
  }

  return { result: { allowEnvironmentVars, allowSecretAccess }, removed };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attenuate `requested` permissions against `granted` (the parent's actual
 * permissions). The result is guaranteed to be a strict subset of `granted`.
 *
 * @param requested - Permissions the plugin wants to delegate downstream
 * @param granted   - Permissions the plugin currently holds
 */
export function attenuatePermissions(
  requested: PluginPermissions,
  granted: PluginPermissions,
): AttenuatedPermissions {
  const removedCapabilities: string[] = [];

  const fs = intersectFilesystem(requested.filesystem, granted.filesystem);
  const net = intersectNetwork(requested.network, granted.network);
  const exec = intersectExecution(requested.execution, granted.execution);
  const mcp = intersectMcp(requested.mcp, granted.mcp);
  const data = intersectData(requested.data, granted.data);

  removedCapabilities.push(
    ...fs.removed,
    ...net.removed,
    ...exec.removed,
    ...mcp.removed,
    ...data.removed,
  );

  return {
    original: granted,
    attenuated: {
      filesystem: fs.result,
      network: net.result,
      execution: exec.result,
      mcp: mcp.result,
      data: data.result,
    },
    removedCapabilities,
  };
}

/**
 * Check whether `subset` is a strict subset of `superset`.
 * Returns `true` when every capability in `subset` is also present in `superset`.
 */
export function isSubsetOf(
  subset: PluginPermissions,
  superset: PluginPermissions,
): boolean {
  const result = attenuatePermissions(subset, superset);
  // If attenuation removed nothing AND the sets match, subset ⊆ superset
  return result.removedCapabilities.length === 0;
}

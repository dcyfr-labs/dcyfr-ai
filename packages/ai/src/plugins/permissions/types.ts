/**
 * Plugin Permission Model Types
 *
 * Capability-based permission model for plugin sandboxing. Follows
 * least-privilege (OWASP ASVS 4.0) and is compatible with the
 * delegation security framework.
 *
 * @module plugins/permissions/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Five permission categories
// ---------------------------------------------------------------------------

/** Filesystem access permissions — controlled by glob patterns */
export interface FilesystemPermissions {
  /** Glob patterns the plugin may read */
  read: string[];
  /** Glob patterns the plugin may write to */
  write: string[];
  /** Glob patterns the plugin may delete */
  delete: string[];
}

/** Network access permissions */
export interface NetworkPermissions {
  /** Whether any outbound network access is allowed */
  allowed: boolean;
  /** Allowlist of hostnames/domains (empty = allow all when allowed:true) */
  allowedDomains: string[];
  /** Maximum HTTP requests per plugin execution (0 = unlimited when allowed:true) */
  maxRequests: number;
}

/** Shell/process execution permissions */
export interface ExecutionPermissions {
  /** Whether arbitrary shell commands can be spawned */
  allowShellCommands: boolean;
  /**
   * Allowlist of executable names the plugin may run.
   * Only enforced when allowShellCommands:false.
   */
  allowedCommands: string[];
  /** Maximum concurrent child processes (0 = no limit) */
  maxProcesses: number;
}

/** MCP server access permissions */
export interface McpPermissions {
  /** Names of MCP servers the plugin is allowed to call */
  allowedServers: string[];
  /** Names of MCP servers explicitly denied (takes precedence over allowedServers) */
  deniedServers: string[];
}

/** Data / environment access permissions */
export interface DataPermissions {
  /** Whether the plugin may read process.env */
  allowEnvironmentVars: boolean;
  /** Whether the plugin may access secrets (e.g. from a vault) */
  allowSecretAccess: boolean;
}

// ---------------------------------------------------------------------------
// Composite type
// ---------------------------------------------------------------------------

/** Full set of permissions declared by a plugin */
export interface PluginPermissions {
  filesystem: FilesystemPermissions;
  network: NetworkPermissions;
  execution: ExecutionPermissions;
  mcp: McpPermissions;
  data: DataPermissions;
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

/** A single permission violation */
export interface PermissionViolation {
  /** Permission category that was violated */
  category: keyof PluginPermissions;
  /** Human-readable description of the violation */
  message: string;
  /** The requested resource/action */
  requested: string;
  /** Whether the violation is blocking (true) or a warning (false) */
  blocking: boolean;
}

/** Result of validating a permission request */
export interface PermissionCheckResult {
  /** Whether the permission is granted */
  granted: boolean;
  /** Reason for denial if granted:false */
  reason?: string;
  violations: PermissionViolation[];
}

// ---------------------------------------------------------------------------
// Attenuation types
// ---------------------------------------------------------------------------

/**
 * Express that a set of permissions is a strict subset of a parent set.
 * Used when a plugin delegates to sub-agents — the sub-agent can only receive
 * permissions the parent already holds.
 */
export interface AttenuatedPermissions {
  /** Original granted permissions */
  original: PluginPermissions;
  /** Attenuated (narrowed) permissions to pass to sub-agent */
  attenuated: PluginPermissions;
  /** Human-readable description of what was removed */
  removedCapabilities: string[];
}

// ---------------------------------------------------------------------------
// Audit event types
// ---------------------------------------------------------------------------

/** Categories of permission audit events */
export type PermissionAuditEventType =
  | 'permission_granted'
  | 'permission_denied'
  | 'permission_attenuated'
  | 'enforcement_violation';

/** Structured audit event for a permission decision */
export interface PermissionAuditEvent {
  timestamp: string;
  eventType: PermissionAuditEventType;
  pluginId: string;
  pluginVersion: string;
  category: keyof PluginPermissions;
  action: string;
  resource: string;
  granted: boolean;
  reason?: string;
  executionId?: string;
}

// ---------------------------------------------------------------------------
// Default / zero-permission factories
// ---------------------------------------------------------------------------

/** Create a fully-locked-down permission set (deny everything) */
export function createDenyAllPermissions(): PluginPermissions {
  return {
    filesystem: { read: [], write: [], delete: [] },
    network: { allowed: false, allowedDomains: [], maxRequests: 0 },
    execution: { allowShellCommands: false, allowedCommands: [], maxProcesses: 0 },
    mcp: { allowedServers: [], deniedServers: [] },
    data: { allowEnvironmentVars: false, allowSecretAccess: false },
  };
}

/** Create a maximally-permissive permission set (allow everything) */
export function createAllowAllPermissions(): PluginPermissions {
  return {
    filesystem: { read: ['**'], write: ['**'], delete: ['**'] },
    network: { allowed: true, allowedDomains: [], maxRequests: 0 },
    execution: { allowShellCommands: true, allowedCommands: [], maxProcesses: 0 },
    mcp: { allowedServers: ['*'], deniedServers: [] },
    data: { allowEnvironmentVars: true, allowSecretAccess: true },
  };
}

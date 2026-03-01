/**
 * Runtime Permission Enforcement Layer
 *
 * Intercepts filesystem, network, and child_process operations at runtime
 * to enforce declared plugin permissions. Wraps Node.js APIs with permission
 * checks before delegating to the original implementation.
 *
 * @module plugins/permissions/permission-enforcer
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import type { PluginPermissions, PermissionAuditEvent } from './types.js';
import { PluginPermissionValidator } from './plugin-permission-validator.js';

// ---------------------------------------------------------------------------
// Context for an enforcement session
// ---------------------------------------------------------------------------

export interface EnforcementContext {
  pluginId: string;
  pluginVersion: string;
  executionId?: string;
  /** Called when a permission is granted. Optional — used for audit logging. */
  onGrant?: (event: Omit<PermissionAuditEvent, 'timestamp'>) => void;
  /** Called when a permission is denied. Optional — used for audit logging. */
  onDeny?: (event: Omit<PermissionAuditEvent, 'timestamp'>) => void;
}

// ---------------------------------------------------------------------------
// Slim interface covering the fs.promises methods we enforce
// ---------------------------------------------------------------------------

export interface RealFs {
  readFile(path: string, options?: { encoding?: BufferEncoding | null } | BufferEncoding | null): Promise<Buffer | string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  readdir(path: string): Promise<string[] | Buffer[]>;
  stat(path: string): Promise<{ isFile(): boolean; size: number; mtime: Date }>;
}

// ---------------------------------------------------------------------------
// Enforced fs API subset
// ---------------------------------------------------------------------------

export interface EnforcedFsApis {
  readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  readdir(path: string): Promise<string[] | Buffer[]>;
  stat(path: string): Promise<{ isFile(): boolean; size: number; mtime: Date }>;
}

// ---------------------------------------------------------------------------
// Enforced fetch type
// ---------------------------------------------------------------------------

export type EnforcedFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Enforced exec type
// ---------------------------------------------------------------------------

export interface EnforcedExec {
  execFile(command: string, args?: string[]): Promise<{ stdout: string; stderr: string }>;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  readonly category: keyof PluginPermissions;
  readonly action: string;
  readonly resource: string;
  readonly denialReason: string;

  constructor(
    category: keyof PluginPermissions,
    action: string,
    resource: string,
    denialReason: string,
  ) {
    super(`Permission denied: [${category}] ${action} on "${resource}" — ${denialReason}`);
    this.name = 'PermissionDeniedError';
    this.category = category;
    this.action = action;
    this.resource = resource;
    this.denialReason = denialReason;
  }
}

// ---------------------------------------------------------------------------
// Permission enforcer
// ---------------------------------------------------------------------------

/**
 * Wraps Node.js APIs with permission enforcement for a given plugin.
 *
 * Usage:
 * ```ts
 * const enforcer = new PermissionEnforcer(permissions, ctx);
 * const safeFs = enforcer.createFsProxy(realFsPromises);
 * const safeFetch = enforcer.createFetchProxy();
 * ```
 */
export class PermissionEnforcer {
  private readonly validator: PluginPermissionValidator;

  constructor(
    readonly permissions: PluginPermissions,
    private readonly ctx: EnforcementContext,
  ) {
    this.validator = new PluginPermissionValidator(permissions);
  }

  private emitGrant(
    category: keyof PluginPermissions,
    action: string,
    resource: string,
  ): void {
    this.ctx.onGrant?.({
      eventType: 'permission_granted',
      pluginId: this.ctx.pluginId,
      pluginVersion: this.ctx.pluginVersion,
      executionId: this.ctx.executionId,
      category,
      action,
      resource,
      granted: true,
    });
  }

  private emitDeny(
    category: keyof PluginPermissions,
    action: string,
    resource: string,
    reason: string,
  ): void {
    this.ctx.onDeny?.({
      eventType: 'permission_denied',
      pluginId: this.ctx.pluginId,
      pluginVersion: this.ctx.pluginVersion,
      executionId: this.ctx.executionId,
      category,
      action,
      resource,
      granted: false,
      reason,
    });
  }

  private enforce(
    check: { granted: boolean; reason?: string },
    category: keyof PluginPermissions,
    action: string,
    resource: string,
  ): void {
    if (check.granted) {
      this.emitGrant(category, action, resource);
    } else {
      const reason = check.reason ?? 'Permission denied';
      this.emitDeny(category, action, resource, reason);
      throw new PermissionDeniedError(category, action, resource, reason);
    }
  }

  /**
   * Create a `fs.promises`-compatible proxy for the plugin.
   * Only the methods covered by declared permissions work; others throw.
   */
  createFsProxy(realFs: RealFs): EnforcedFsApis {
    const validate = (check: { granted: boolean; reason?: string }, category: keyof PluginPermissions, action: string, resource: string): void =>
      this.enforce(check, category, action, resource);
    const val = this.validator;

    return {
      readFile: async (path: string, encoding?: BufferEncoding) => {
        validate(val.checkFileRead(path), 'filesystem', 'read', path);
        return realFs.readFile(path, encoding ?? null);
      },
      writeFile: async (path: string, data: string | Uint8Array) => {
        validate(val.checkFileWrite(path), 'filesystem', 'write', path);
        await realFs.writeFile(path, data);
      },
      unlink: async (path: string) => {
        validate(val.checkFileDelete(path), 'filesystem', 'delete', path);
        await realFs.unlink(path);
      },
      mkdir: async (path: string, options?: { recursive?: boolean }) => {
        validate(val.checkFileWrite(path), 'filesystem', 'mkdir', path);
        return realFs.mkdir(path, options);
      },
      readdir: async (path: string) => {
        validate(val.checkFileRead(path), 'filesystem', 'readdir', path);
        return realFs.readdir(path);
      },
      stat: async (path: string) => {
        validate(val.checkFileRead(path), 'filesystem', 'stat', path);
        return realFs.stat(path);
      },
    };
  }

  /**
   * Create a `fetch`-compatible proxy that enforces network permissions.
   */
  createFetchProxy(realFetch: typeof globalThis.fetch = globalThis.fetch): EnforcedFetch {
    const validate = (check: { granted: boolean; reason?: string }, category: keyof PluginPermissions, action: string, resource: string): void =>
      this.enforce(check, category, action, resource);
    const val = this.validator;

    return async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      validate(val.checkNetworkRequest(urlStr), 'network', 'request', urlStr);
      return realFetch(url, init);
    };
  }

  /**
   * Create an `execFile`-compatible proxy that enforces execution permissions.
   */
  createExecProxy(): EnforcedExec {
    const validate = (check: { granted: boolean; reason?: string }, category: keyof PluginPermissions, action: string, resource: string): void =>
      this.enforce(check, category, action, resource);
    const val = this.validator;

    return {
      execFile: async (command: string, args: string[] = []) => {
        validate(val.checkCommandExecution(command), 'execution', 'execFile', command);
        const { execFile: nodeExecFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(nodeExecFile);
        return execFileAsync(command, args);
      },
    };
  }
}

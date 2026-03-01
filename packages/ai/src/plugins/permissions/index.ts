/**
 * Plugin Permissions System
 *
 * Exports all types, validators, enforcers, attenuators, and audit loggers
 * for the DCYFR plugin permission model.
 *
 * @module plugins/permissions
 */

export type {
  FilesystemPermissions,
  NetworkPermissions,
  ExecutionPermissions,
  McpPermissions,
  DataPermissions,
  PluginPermissions,
  PermissionViolation,
  PermissionCheckResult,
  AttenuatedPermissions,
  PermissionAuditEvent,
  PermissionAuditEventType,
} from './types.js';
export { createDenyAllPermissions, createAllowAllPermissions } from './types.js';
export { PluginPermissionValidator } from './plugin-permission-validator.js';
export {
  PermissionDeniedError,
  PermissionEnforcer,
} from './permission-enforcer.js';
export type {
  EnforcementContext,
  RealFs,
  EnforcedFsApis,
  EnforcedFetch,
  EnforcedExec,
} from './permission-enforcer.js';
export { attenuatePermissions, isSubsetOf } from './permission-attenuator.js';
export { PermissionAuditLogger } from './permission-audit-logger.js';
export type {
  PermissionAuditLoggerConfig,
  AuditLogResult,
} from './permission-audit-logger.js';

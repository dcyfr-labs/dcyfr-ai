/**
 * Plugin Reputation — barrel export
 *
 * @module plugins/reputation
 */

export { PluginReputationEngine } from './plugin-reputation-engine.js';
export { openReputationDb, getSchemaVersion, DEFAULT_DB_PATH } from './plugin-reputation-db.js';
export type {
  PluginReputationEngineConfig,
  PluginReputationRecord,
  PluginIncidentRecord,
  PluginAuditRecord,
  PluginScoreResult,
  TopPluginResult,
  UpsertScanInput,
  PluginTrustScore,
  AuditEventType,
  IncidentSeverity,
  RegistryReputationEntry,
} from './types.js';

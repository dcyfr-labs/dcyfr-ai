/**
 * Plugin Incident Response — Barrel Export
 * @module plugins/incidents
 */

export { IncidentResponseManager, IncidentError } from './incident-response-manager.js';
export type {
  IncidentResponseManagerConfig,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  CreateIncidentInput,
  AcknowledgeIncidentInput,
  ResolveIncidentInput,
  ListIncidentsOptions,
  IncidentPage,
  SlaConfig,
  EmailNotifier,
  GithubClient,
  AxiomLogger,
  GithubIssuePayload,
  GithubAdvisoryPayload,
  AxiomAlertPayload,
} from './incident-response-manager.js';
export { DEFAULT_SLA, PLUGIN_INCIDENTS_SCHEMA_SQL } from './types.js';

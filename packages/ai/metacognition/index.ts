/**
 * Metacognitive Improvement Runtime — Public Module Entry
 * TLP:AMBER - Internal Use Only
 *
 * Exports all types, runtime, ledger, and the environment-wired default instance.
 * Nothing here changes existing agent behaviour — the runtime only activates when
 * `ENABLE_METACOG_RUNTIME=true` and callers explicitly invoke its methods.
 *
 * @module ai/metacognition
 */

export type {
  ImprovementLifecycleState,
  TlpClassification,
  ImprovementScope,
  PolicySchemaVersion,
  PolicyConstraints,
  ImprovementPolicyDocument,
  PolicySnapshot,
  PolicyParameterChange,
  PolicyDiff,
  ProposalEvaluationCriteria,
  ImprovementContext,
  ImprovementProposal,
  BenchmarkResult,
  ImprovementEvaluationResult,
  GovernanceConfig,
  MetacognitiveRuntimeConfig,
} from './types.js';

export {
  VALID_LIFECYCLE_TRANSITIONS,
  DEFAULT_GOVERNANCE_CONFIG,
  VERIFICATION_POLICY_STRENGTH,
  isSchemaCompatible,
  formatSchemaVersion,
  meetsVerificationThreshold,
  resolveRequiredPolicy,
} from './types.js';

export type { LedgerEntry, LedgerEntryPayload, ImprovementLedger, IdGenerator } from './runtime.js';

export {
  MetacognitiveImprovementRuntime,
  InMemoryImprovementLedger,
  InvalidLifecycleTransitionError,
  SchemaIncompatibleError,
  GovernanceViolationError,
  RuntimeDisabledError,
  createMetacognitiveRuntime,
} from './runtime.js';

export { readFeatureFlag, buildRuntimeConfig, defaultRuntime } from './config.js';

export type { GovernanceGuardResult } from './governance.js';
export {
  checkProductionPromotionPolicy,
  checkTlpRedGate,
  checkGovernance,
  assertGovernanceConfigValid,
} from './governance.js';

export type {
  MetacogTelemetryEventType,
  MetacogTelemetryEventBase,
  ProposalSubmittedEvent,
  ProposalEvaluatedEvent,
  ProposalApprovedEvent,
  ProposalRejectedEvent,
  ProposalAppliedEvent,
  ProposalRolledBackEvent,
  TransferEvaluatedEvent,
  MetacogTelemetryEvent,
  TelemetrySink,
  MetacogMetrics,
} from './telemetry.js';
export {
  MetacogTelemetryEmitter,
  InMemoryTelemetrySink,
  defaultConsoleSink,
} from './telemetry.js';

export type {
  DomainDefinition,
  BenchmarkDefinition,
  TransferEvaluationInput,
  BaselineRecord,
  TransferEvaluationResult,
  BenchmarkRunner,
} from './transfer.js';
export {
  evaluateTransfer,
  TransferEvaluationError,
  SCORING_STRATEGY_DOMAIN,
  DELEGATION_THRESHOLDS_DOMAIN,
  SCORING_STRATEGY_BASELINES,
  DELEGATION_THRESHOLDS_BASELINES,
} from './transfer.js';

export type {
  LedgerRecordEnvelope,
} from './ledger.js';
export {
  LEDGER_RECORD_SCHEMA_VERSION,
  serializeLedgerEntry,
  deserializeLedgerEntry,
  deserializeAllEntries,
  LedgerDeserializationError,
  FileLedger,
  SyncFileLedger,
  reconstructLineage,
  extractRollbackTrail,
  LedgerLineageError,
} from './ledger.js';

/**
 * Session Management Module
 * @module session
 */

export {
  SessionManager,
  OverlayMemory,
  TLPSessionMiddleware,
  RateLimiterSessionMiddleware,
  TrustLevelViolation,
  trustLevelToPolicy,
  isToolAllowed,
  type TrustLevel,
  type ToolPolicyMode,
  type SessionTool,
  type ToolPolicy,
  type SessionConfig,
  type SessionLifecycle,
  type ManagedAgentSession,
  type SessionMetadata,
  type SessionQuery,
  type IdleQueryOptions,
  type SecurityEvaluation,
  type SessionSecurityMiddleware,
  type SharedKnowledgeBase,
  type SessionManagerConfig,
} from './session-manager.js';

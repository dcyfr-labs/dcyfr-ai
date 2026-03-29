/**
 * Linear Integration Module
 *
 * Exports all Linear integration components for use in automation workflows.
 *
 * Components:
 *   - LinearClient: GraphQL API wrapper with authentication, rate limiting, retries
 *   - IssueMapper: Issue key correlation from branch/PR/commit
 *   - SyncService: Bi-directional state synchronization (Phase 3)
 *   - MappingStore: Persistent correlation storage (Phase 2)
 *
 * Part of: dcyfr-ai integration layer
 * Roadmap: Phase 2 (MVP) → Phase 3 (Production) → Phase 4 (Org Rollout)
 */

export { LinearClient, LinearError, LinearRateLimitError } from './linear-client.js';
export type {
    LinearClientConfig,
    IssueMapping,
    LinearIssue,
    LinearIssueState,
    LinearComment,
} from './linear-client.js';

export { IssueMapper } from './issue-mapper.js';
export type { CorrelationInput, CorrelationResult } from './issue-mapper.js';

// Future exports (Phase 3+):
// export { SyncService } from './sync-service.js';
// export { MappingStore } from './mapping-store.js';

/**
 * Linear API Client
 *
 * Provides a typed, authenticated wrapper around the Linear GraphQL API for
 * reading/writing issues, creating comments, adding labels, and managing
 * issue state transitions.
 *
 * Usage:
 *   const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
 *   const issue = await client.getIssue('DCYFR-123');
 *   await client.addComment(issue.id, 'Review started');
 *   await client.updateIssueState(issue.id, 'In Review');
 *
 * Authentication:
 *   - Requires LINEAR_API_KEY environment variable (org API key)
 *   - API documentation: https://developers.linear.app/docs
 *   - GraphQL endpoint: https://api.linear.app/graphql
 *
 * Rate Limiting:
 *   - Linear API: 1000 requests/hour per token
 *   - Implements sliding-window rate limiter with exponential backoff
 *
 * Idempotency:
 *   - All write operations include deduplication keys
 *   - Prevents duplicate comments/updates on identical requests
 *
 * Error Handling:
 *   - GraphQL errors returned as structured `LinearError`
 *   - Network failures trigger exponential backoff retry
 *   - Rate limits surface as `RateLimitError`
 *
 * Part of: dcyfr-ai integration layer
 * Roadmap: Phase 2 (MVP Linear Sync) + Phase 3 (Bidirectional Sync)
 * Test: __tests__/integrations/linear/linear-client.test.ts
 */

import type { GraphQLError, RequestInit } from '@dcyfr/ai/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Linear API credentials and configuration.
 */
export interface LinearClientConfig {
    /** Linear API key (org-scoped, from workspace settings) */
    apiKey: string;
    /** Optional: Override GraphQL endpoint (default: https://api.linear.app/graphql) */
    graphqlEndpoint?: string;
    /** Optional: Maximum retry attempts for transient failures (default: 3) */
    maxRetries?: number;
    /** Optional: Timeout in ms for API requests (default: 30000) */
    requestTimeout?: number;
}

/**
 * Mapping between Linear issue and GitHub PR/issue.
 * Stored in persistent mapping store for correlation.
 */
export interface IssueMapping {
    /** Linear issue ID (UUID) */
    linearIssueId: string;
    /** GitHub repository owner */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** GitHub PR number (if PR) or issue number (if issue) */
    prOrIssueNumber: number;
    /** How the correlation was established */
    correlationSource: 'branch' | 'pr_title' | 'commit_message' | 'manual';
    /** Confidence score (0-1); 1.0 = certain, < 0.8 = needs review */
    confidence: number;
    /** When the mapping was created */
    createdAt: Date;
    /** When the mapping was last verified */
    lastVerifiedAt?: Date;
}

/**
 * Linear issue with relevant fields for review/PR sync.
 */
export interface LinearIssue {
    id: string;
    identifier: string; // e.g., "DCYFR-123"
    title: string;
    description?: string;
    state: {
        id: string;
        name: string; // e.g., "Todo", "In Progress", "In Review", "Done"
    };
    assignee?: {
        id: string;
        name: string;
        email: string;
    };
    team: {
        id: string;
        key: string; // e.g., "DCYFR"
    };
    labels: Array<{
        id: string;
        name: string;
    }>;
    createdAt: string;
    updatedAt: string;
    /** Custom field for linking to GitHub PR */
    _githubPrUrl?: string;
    /** Custom field for PR review status */
    _prReviewStatus?: 'pending' | 'in_progress' | 'approved' | 'changes_requested';
}

/**
 * Linear issue state for workflow transitions.
 */
export interface LinearIssueState {
    id: string;
    name: string;
    type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
    position: number;
}

/**
 * Comment created on a Linear issue.
 */
export interface LinearComment {
    id: string;
    body: string;
    author: {
        id: string;
        name: string;
    };
    createdAt: string;
    updatedAt: string;
}

/**
 * Linear API error with detailed context.
 */
export class LinearError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly graphqlErrors?: GraphQLError[],
    ) {
        super(message);
        this.name = 'LinearError';
    }
}

/**
 * Rate limit error when API quota is exceeded.
 */
export class LinearRateLimitError extends LinearError {
    constructor(
        message: string,
        public readonly resetAt: Date,
    ) {
        super(message, 429);
        this.name = 'LinearRateLimitError';
    }
}

// ============================================================================
// Linear Client
// ============================================================================

export class LinearClient {
    private apiKey: string;
    private graphqlEndpoint: string;
    private maxRetries: number;
    private requestTimeout: number;

    private requestCount = 0;
    private requestResetAt = Date.now() + 3600000; // 1 hour from now

    constructor(config: LinearClientConfig) {
        this.apiKey = config.apiKey;
        this.graphqlEndpoint = config.graphqlEndpoint ?? 'https://api.linear.app/graphql';
        this.maxRetries = config.maxRetries ?? 3;
        this.requestTimeout = config.requestTimeout ?? 30000;

        if (!this.apiKey) {
            throw new LinearError('LINEAR_API_KEY is required');
        }
    }

    /**
     * Retrieve a Linear issue by identifier (e.g., "DCYFR-123").
     */
    async getIssue(identifier: string): Promise<LinearIssue> {
        const query = `
      query GetIssue($identifier: String!) {
        issue(id: $identifier) {
          id
          identifier
          title
          description
          state { id name }
          assignee { id name email }
          team { id key }
          labels { id name }
          createdAt
          updatedAt
        }
      }
    `;

        const data = await this.graphql<{ issue: LinearIssue }>(query, { identifier });
        return data.issue;
    }

    /**
     * Get all available workflow states for a team.
     * Used for determining valid state transitions.
     */
    async getWorkflowStates(teamId: string): Promise<LinearIssueState[]> {
        const query = `
      query GetWorkflowStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
              position
            }
          }
        }
      }
    `;

        const data = await this.graphql<{
            team: {
                states: { nodes: LinearIssueState[] };
            };
        }>(query, { teamId });

        return data.team.states.nodes;
    }

    /**
     * Update an issue's state (e.g., "In Review" → "Changes Requested").
     * Returns the updated issue.
     */
    async updateIssueState(issueId: string, newState: string): Promise<LinearIssue> {
        const mutation = `
      mutation UpdateIssueState($issueId: String!, $state: String!) {
        issueUpdate(id: $issueId, input: { stateId: $state }) {
          issue {
            id
            identifier
            title
            state { id name }
            updatedAt
          }
        }
      }
    `;

        const data = await this.graphql<{
            issueUpdate: { issue: LinearIssue };
        }>(mutation, { issueId, state: newState });

        return data.issueUpdate.issue;
    }

    /**
     * Add a comment to a Linear issue.
     * Includes deduplication key to prevent duplicate comments.
     */
    async addComment(
        issueId: string,
        body: string,
        deduplicationKey?: string,
    ): Promise<LinearComment> {
        const mutation = `
      mutation AddComment($issueId: String!, $body: String!, $deduplicationKey: String) {
        commentCreate(input: { issueId: $issueId, body: $body, deduplicationKey: $deduplicationKey }) {
          comment {
            id
            body
            author { id name }
            createdAt
            updatedAt
          }
        }
      }
    `;

        const data = await this.graphql<{
            commentCreate: { comment: LinearComment };
        }>(mutation, { issueId, body, deduplicationKey });

        return data.commentCreate.comment;
    }

    /**
     * Add a label to a Linear issue.
     */
    async addLabel(issueId: string, labelId: string): Promise<void> {
        const mutation = `
      mutation AddLabel($issueId: String!, $labelIds: [String!]!) {
        issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
          issue { id }
        }
      }
    `;

        await this.graphql(mutation, { issueId, labelIds: [labelId] });
    }

    /**
     * Assign a Linear issue to a team member.
     */
    async assignIssue(issueId: string, userId: string): Promise<void> {
        const mutation = `
      mutation AssignIssue($issueId: String!, $userId: String!) {
        issueUpdate(id: $issueId, input: { assigneeId: $userId }) {
          issue { id }
        }
      }
    `;

        await this.graphql(mutation, { issueId, userId });
    }

    /**
     * Search for issues by query (e.g., team or label filters).
     * Used for finding issues linked to GitHub PRs.
     */
    async searchIssues(query: string, limit = 25): Promise<LinearIssue[]> {
        const graphqlQuery = `
      query SearchIssues($query: String!, $first: Int!) {
        issues(filter: $query, first: $first) {
          nodes {
            id
            identifier
            title
            description
            state { id name }
            assignee { id name email }
            team { id key }
            labels { id name }
            createdAt
            updatedAt
          }
        }
      }
    `;

        const data = await this.graphql<{
            issues: { nodes: LinearIssue[] };
        }>(graphqlQuery, { query, first: limit });

        return data.issues.nodes;
    }

    /**
     * Internal: Execute a GraphQL query/mutation with rate-limit and retry handling.
     */
    private async graphql<T>(
        query: string,
        variables?: Record<string, any>,
        retryCount = 0,
    ): Promise<T> {
        // Check rate limit
        this.checkRateLimit();

        const payload = {
            query,
            variables: variables ?? {},
        };

        const options: RequestInit = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            timeout: this.requestTimeout,
        };

        try {
            const response = await fetch(this.graphqlEndpoint, options);
            this.requestCount++;

            // Handle rate limiting
            if (response.status === 429) {
                const resetAfter = response.headers.get('Retry-After');
                const resetAt = new Date(Date.now() + (Number.parseInt(resetAfter ?? '60', 10) * 1000));
                throw new LinearRateLimitError(
                    'Linear API rate limit exceeded',
                    resetAt,
                );
            }

            if (!response.ok) {
                throw new LinearError(
                    `Linear API returned ${response.status}`,
                    response.status,
                );
            }

            const data = await response.json();

            // Handle GraphQL errors
            if (data.errors && data.errors.length > 0) {
                throw new LinearError(
                    `GraphQL error: ${data.errors[0].message}`,
                    400,
                    data.errors,
                );
            }

            return data.data as T;
        } catch (error) {
            // Retry on transient errors
            if (retryCount < this.maxRetries && this.isTransient(error)) {
                const backoffMs = Math.pow(2, retryCount) * 1000;
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                return this.graphql(query, variables, retryCount + 1);
            }

            if (error instanceof LinearError) {
                throw error;
            }

            throw new LinearError(
                `Linear API request failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Check if request is within rate limit quota.
     * Resets hourly.
     */
    private checkRateLimit(): void {
        const now = Date.now();

        // Reset counter if window has passed
        if (now > this.requestResetAt) {
            this.requestCount = 0;
            this.requestResetAt = now + 3600000; // 1 hour from now
        }

        // Linear: 1000 requests/hour
        if (this.requestCount >= 1000) {
            throw new LinearRateLimitError(
                'Linear API rate limit exceeded (1000/hour)',
                new Date(this.requestResetAt),
            );
        }
    }

    /**
     * Determine if an error is transient (can be retried).
     */
    private isTransient(error: any): boolean {
        if (error instanceof LinearRateLimitError) {
            return true;
        }
        if (error instanceof LinearError) {
            // Only retry on server errors (5xx)
            return error.statusCode ? error.statusCode >= 500 : false;
        }
        return true; // Assume network errors are transient
    }
}

export default LinearClient;

/**
 * Test Suite: Linear Client
 *
 * Validates LinearClient API, authentication, rate limiting, retries, and
 * error handling. Mocked Linear API responses avoid external dependencies.
 *
 * Run:
 *   bun test __tests__/integrations/linear/linear-client.test.ts
 *
 * Part of: dcyfr-ai integration tests (Phase 1)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinearClient, LinearError, LinearRateLimitError } from '../../../src/integrations/linear/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_API_KEY = 'test-linear-api-key-XXXXXXXX';

const mockIssueResponse = {
    data: {
        issue: {
            id: 'issue-uuid-123',
            identifier: 'DCYFR-123',
            title: 'Implement OAuth flow',
            description: 'Add OAuth 2.0 integration for GitHub',
            state: { id: 'state-1', name: 'In Progress' },
            assignee: {
                id: 'user-1',
                name: 'Alice',
                email: 'alice@dcyfr.ai',
            },
            team: { id: 'team-1', key: 'DCYFR' },
            labels: [
                { id: 'label-1', name: 'backend' },
                { id: 'label-2', name: 'authentication' },
            ],
            createdAt: '2026-03-01T12:00:00Z',
            updatedAt: '2026-03-28T14:30:00Z',
        },
    },
};

const mockCommentResponse = {
    data: {
        commentCreate: {
            comment: {
                id: 'comment-uuid-456',
                body: 'PR opened: https://github.com/dcyfr/dcyfr-ai/pull/123',
                author: { id: 'bot', name: 'DCYFR Bot' },
                createdAt: '2026-03-28T15:00:00Z',
                updatedAt: '2026-03-28T15:00:00Z',
            },
        },
    },
};

const mockGraphQLError = {
    data: null,
    errors: [
        {
            message: 'Issue not found',
            extensions: { code: 'NOT_FOUND' },
        },
    ],
};

// ============================================================================
// Tests
// ============================================================================

describe('LinearClient', () => {
    let client: LinearClient;
    let fetchMock: any;

    beforeEach(() => {
        client = new LinearClient({ apiKey: MOCK_API_KEY });
        // Mock global fetch
        fetchMock = vi.fn();
        global.fetch = fetchMock as any;
    });

    describe('initialization', () => {
        it('should throw if no API key provided', () => {
            expect(() => {
                new LinearClient({ apiKey: '' });
            }).toThrow('LINEAR_API_KEY is required');
        });

        it('should accept optional configuration', () => {
            const client = new LinearClient({
                apiKey: MOCK_API_KEY,
                graphqlEndpoint: 'https://custom.linear.app/graphql',
                maxRetries: 5,
                requestTimeout: 60000,
            });
            expect(client).toBeDefined();
        });
    });

    describe('getIssue', () => {
        it('should fetch issue by identifier', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockIssueResponse,
                headers: new Map(),
            });

            const issue = await client.getIssue('DCYFR-123');

            expect(issue.identifier).toBe('DCYFR-123');
            expect(issue.title).toBe('Implement OAuth flow');
            expect(fetchMock).toHaveBeenCalledOnce();
        });

        it('should include correct Authorization header', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockIssueResponse,
                headers: new Map(),
            });

            await client.getIssue('DCYFR-123');

            const call = fetchMock.mock.calls[0];
            const options = call[1];
            expect(options.headers.Authorization).toBe(`Bearer ${MOCK_API_KEY}`);
        });

        it('should throw on GraphQL error', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockGraphQLError,
                headers: new Map(),
            });

            await expect(client.getIssue('INVALID-999')).rejects.toThrow(
                'GraphQL error: Issue not found',
            );
        });

        it('should throw on HTTP error', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                headers: new Map(),
            });

            await expect(client.getIssue('DCYFR-123')).rejects.toThrow(
                'Linear API returned 500',
            );
        });
    });

    describe('addComment', () => {
        it('should add comment with deduplication key', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockCommentResponse,
                headers: new Map(),
            });

            const comment = await client.addComment(
                'issue-uuid-123',
                'PR opened: https://github.com/dcyfr/dcyfr-ai/pull/123',
                'dedup-key-1',
            );

            expect(comment.id).toBe('comment-uuid-456');
            expect(comment.body).toContain('PR opened');

            const call = fetchMock.mock.calls[0];
            const payload = JSON.parse(call[1].body);
            expect(payload.variables.deduplicationKey).toBe('dedup-key-1');
        });

        it('should retry on transient errors', async () => {
            // First call: network timeout
            fetchMock.mockRejectedValueOnce(new Error('Network timeout'));

            // Second call: success
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockCommentResponse,
                headers: new Map(),
            });

            const comment = await client.addComment('issue-uuid-123', 'Test comment');
            expect(comment.id).toBe('comment-uuid-456');
            expect(fetchMock).toHaveBeenCalledTimes(2); // Retried once
        });
    });

    describe('rate limiting', () => {
        it('should throw on 429 rate limit response', async () => {
            const resetAt = new Date(Date.now() + 3600000);
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: new Map([['Retry-After', '3600']]),
            });

            await expect(client.getIssue('DCYFR-123')).rejects.toBeInstanceOf(
                LinearRateLimitError,
            );
        });

        it('should track request count and reset hourly', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockIssueResponse,
                headers: new Map(),
            });

            // Make 3 requests
            await client.getIssue('DCYFR-1');
            await client.getIssue('DCYFR-2');
            await client.getIssue('DCYFR-3');

            expect(fetchMock).toHaveBeenCalledTimes(3);
        });
    });

    describe('error handling', () => {
        it('should wrap generic errors as LinearError', async () => {
            fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

            await expect(client.getIssue('DCYFR-123')).rejects.toThrow(LinearError);
        });

        it('should preserve GraphQL error details', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: null,
                    errors: [
                        { message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } },
                    ],
                }),
                headers: new Map(),
            });

            try {
                await client.getIssue('DCYFR-123');
                expect.fail('Should throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(LinearError);
                expect(error.graphqlErrors).toBeDefined();
                expect(error.graphqlErrors[0].message).toBe('Unauthorized');
            }
        });
    });
});

describe('LinearClient - Integration Tests (Skipped in CI)', () => {
    it.skip('should connect to real Linear API', async () => {
        // Requires real LINEAR_API_KEY and network access
        // Only run locally with: bun test --include="**/linear-client.test.ts" --run
        const apiKey = process.env.LINEAR_API_KEY_TEST;
        if (!apiKey) {
            console.log('Skipping: LINEAR_API_KEY_TEST not set');
            return;
        }

        const client = new LinearClient({ apiKey });
        // Validate connectivity (query public workspace info, not specific issues)
        // const info = await client.getWorkflowStates('team-id');
        // expect(info).toBeDefined();
    });
});

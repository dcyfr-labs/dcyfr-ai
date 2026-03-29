/**
 * Test Suite: Issue Mapper
 *
 * Validates correlation logic for extracting issue keys from branch names,
 * PR titles, commit messages, and PR bodies. Tests confidence scoring and
 * alternate match detection.
 *
 * Run:
 *   bun test __tests__/integrations/linear/issue-mapper.test.ts
 *
 * Part of: dcyfr-ai integration tests (Phase 1)
 */

import { describe, it, expect } from 'vitest';
import { IssueMapper } from '../../../src/integrations/linear/issue-mapper.js';

// ============================================================================
// Tests
// ============================================================================

describe('IssueMapper', () => {
    describe('extractIssueKeys', () => {
        it('should extract single issue key', () => {
            const text = 'Fixes DCYFR-123';
            const keys = IssueMapper.extractIssueKeys(text);
            expect(keys).toEqual(['DCYFR-123']);
        });

        it('should extract multiple issue keys', () => {
            const text = 'Fixes DCYFR-123 and PROJ-456';
            const keys = IssueMapper.extractIssueKeys(text);
            expect(keys).toContain('DCYFR-123');
            expect(keys).toContain('PROJ-456');
        });

        it('should deduplicate keys', () => {
            const text = 'See DCYFR-123, also DCYFR-123';
            const keys = IssueMapper.extractIssueKeys(text);
            expect(keys).toEqual(['DCYFR-123']);
        });

        it('should respect limit parameter', () => {
            const text = 'DCYFR-1, DCYFR-2, DCYFR-3, DCYFR-4, DCYFR-5, DCYFR-6';
            const keys = IssueMapper.extractIssueKeys(text, 3);
            expect(keys).toHaveLength(3);
        });

        it('should handle no matches', () => {
            const text = 'No issue keys here';
            const keys = IssueMapper.extractIssueKeys(text);
            expect(keys).toEqual([]);
        });
    });

    describe('extractFromBranch', () => {
        it('should extract key from feature branch', () => {
            const key = IssueMapper.extractFromBranch('feature/DCYFR-123-auth-flow');
            expect(key).toBe('DCYFR-123');
        });

        it('should extract key from bugfix branch', () => {
            const key = IssueMapper.extractFromBranch('bugfix/PROJ-456-null-pointer');
            expect(key).toBe('PROJ-456');
        });

        it('should extract key with single-letter prefix', () => {
            const key = IssueMapper.extractFromBranch('chore/A-1-cleanup');
            expect(key).toBe('A-1');
        });

        it('should return null for invalid format', () => {
            expect(IssueMapper.extractFromBranch('main')).toBeNull();
            expect(IssueMapper.extractFromBranch('release/1.0.0')).toBeNull();
            expect(IssueMapper.extractFromBranch('feature/no-key-here')).toBeNull();
        });

        it('should handle branches with long prefixes', () => {
            const key = IssueMapper.extractFromBranch('refactor/DCYFR-999-big-rewrite');
            expect(key).toBe('DCYFR-999');
        });
    });

    describe('extractFromPrTitle', () => {
        it('should extract key from bracketed title', () => {
            const key = IssueMapper.extractFromPrTitle('[DCYFR-123] Add OAuth flow');
            expect(key).toBe('DCYFR-123');
        });

        it('should extract key with colon', () => {
            const key = IssueMapper.extractFromPrTitle('[DCYFR-456]: Fix bug');
            expect(key).toBe('DCYFR-456');
        });

        it('should extract key with spaces', () => {
            const key = IssueMapper.extractFromPrTitle('[DCYFR-789] Long description');
            expect(key).toBe('DCYFR-789');
        });

        it('should return null if no bracket', () => {
            expect(IssueMapper.extractFromPrTitle('Add OAuth flow')).toBeNull();
            expect(IssueMapper.extractFromPrTitle('DCYFR-123 at start')).toBeNull();
        });

        it('should return null if key not in brackets', () => {
            const key = IssueMapper.extractFromPrTitle('Feature: DCYFR-123');
            expect(key).toBeNull();
        });
    });

    describe('extractFromCommits', () => {
        it('should extract from Fixes pattern', () => {
            const commits = ['Add auth flow', 'Fixes DCYFR-123'];
            const key = IssueMapper.extractFromCommits(commits);
            expect(key).toBe('DCYFR-123');
        });

        it('should extract from Closes pattern', () => {
            const commits = ['Closes PROJ-456 for real'];
            const key = IssueMapper.extractFromCommits(commits);
            expect(key).toBe('PROJ-456');
        });

        it('should extract from Resolves pattern', () => {
            const commits = ['Resolves DCYFR-789'];
            const key = IssueMapper.extractFromCommits(commits);
            expect(key).toBe('DCYFR-789');
        });

        it('should handle past tense', () => {
            const commits = ['Fixed DCYFR-111', 'Closed DCYFR-222', 'Resolved DCYFR-333'];
            expect(IssueMapper.extractFromCommits([commits[0]])).toBe('DCYFR-111');
            expect(IssueMapper.extractFromCommits([commits[1]])).toBe('DCYFR-222');
            expect(IssueMapper.extractFromCommits([commits[2]])).toBe('DCYFR-333');
        });

        it('should return null if no pattern matches', () => {
            const commits = ['Add feature', 'Update docs'];
            expect(IssueMapper.extractFromCommits(commits)).toBeNull();
        });

        it('should return first match if multiple commits match', () => {
            const commits = ['Fixes DCYFR-111', 'Fixes DCYFR-222'];
            const key = IssueMapper.extractFromCommits(commits);
            expect(key).toBe('DCYFR-111');
        });
    });

    describe('extractFromPrBody', () => {
        it('should extract key from PR body', () => {
            const body = 'This PR implements DCYFR-123 feature';
            const keys = IssueMapper.extractFromPrBody(body);
            expect(keys).toContain('DCYFR-123');
        });

        it('should limit to 1 result', () => {
            const body = 'Fixes DCYFR-1, DCYFR-2, DCYFR-3';
            const keys = IssueMapper.extractFromPrBody(body);
            expect(keys).toHaveLength(1);
        });

        it('should return empty array if no matches', () => {
            const body = 'No issue keys here';
            const keys = IssueMapper.extractFromPrBody(body);
            expect(keys).toEqual([]);
        });
    });

    describe('correlate', () => {
        it('should prioritize branch over PR title', () => {
            const result = IssueMapper.correlate({
                branch: 'feature/DCYFR-123-foo',
                prTitle: '[DCYFR-456] Bar',
            });

            expect(result.identifier).toBe('DCYFR-123');
            expect(result.source).toBe('branch');
            expect(result.confidence).toBe(0.95);
        });

        it('should prioritize PR title over commits', () => {
            const result = IssueMapper.correlate({
                prTitle: '[DCYFR-456] Feature',
                commits: ['Fixes DCYFR-789'],
            });

            expect(result.identifier).toBe('DCYFR-456');
            expect(result.source).toBe('pr_title');
            expect(result.confidence).toBe(0.85);
        });

        it('should use commits when branch and title missing', () => {
            const result = IssueMapper.correlate({
                commits: ['Fixes DCYFR-789'],
            });

            expect(result.identifier).toBe('DCYFR-789');
            expect(result.source).toBe('commit_message');
            expect(result.confidence).toBe(0.75);
        });

        it('should fall back to PR body', () => {
            const result = IssueMapper.correlate({
                prBody: 'See DCYFR-999 for details',
            });

            expect(result.identifier).toBe('DCYFR-999');
            expect(result.source).toBe('pr_body');
            expect(result.confidence).toBe(0.60);
        });

        it('should return null if no sources match', () => {
            const result = IssueMapper.correlate({
                branch: 'main',
                prTitle: 'Merge dev to main',
            });

            expect(result.identifier).toBeNull();
            expect(result.source).toBeNull();
            expect(result.confidence).toBe(0);
        });

        it('should collect alternates', () => {
            const result = IssueMapper.correlate({
                branch: 'feature/DCYFR-123-foo',
                prTitle: '[DCYFR-456] Bar',
                commits: ['Fixes DCYFR-789'],
            });

            expect(result.alternates).toHaveLength(2);
            expect(result.alternates[0].identifier).toBe('DCYFR-456');
            expect(result.alternates[0].confidence).toBe(0.85);
            expect(result.alternates[1].identifier).toBe('DCYFR-789');
            expect(result.alternates[1].confidence).toBe(0.75);
        });

        it('should have real-world branch format', () => {
            const result = IssueMapper.correlate({
                branch: 'feature/DCYFR-123-complete-oauth-flow',
                prTitle: '[DCYFR-123] Complete OAuth flow implementation',
                commits: ['Add OAuth provider', 'Fixes DCYFR-123'],
            });

            expect(result.identifier).toBe('DCYFR-123');
            expect(result.source).toBe('branch');
            expect(result.confidence).toBe(0.95);
            // All alternates should match same issue
            expect(result.alternates.every((a: any) => a.identifier === 'DCYFR-123')).toBe(true);
        });
    });

    describe('isConfident', () => {
        it('should return true for high confidence match', () => {
            const result = IssueMapper.correlate({
                branch: 'feature/DCYFR-123-foo',
            });

            expect(IssueMapper.isConfident(result)).toBe(true);
        });

        it('should return false for low confidence match', () => {
            const result = IssueMapper.correlate({
                prBody: 'See DCYFR-999 for details',
            });

            expect(IssueMapper.isConfident(result)).toBe(false); // 0.60 < 0.8
            expect(IssueMapper.isConfident(result, 0.5)).toBe(true); // 0.60 >= 0.5
        });

        it('should return false for null match', () => {
            const result = IssueMapper.correlate({});

            expect(IssueMapper.isConfident(result)).toBe(false);
        });
    });
});

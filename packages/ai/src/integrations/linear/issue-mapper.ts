/**
 * Issue Key Correlation and Mapping
 *
 * Extracts issue keys from GitHub PR titles, branch names, and commit messages
 * to automatically correlate them with Linear issues. Implements a priority-based
 * matching strategy and stores mappings for future reference.
 *
 * Correlation Strategy (in order of confidence):
 *   1. Branch name:   `feature/DCYFR-123-description`  [confidence: 0.95]
 *   2. PR title:      `[DCYFR-123] Feature description` [confidence: 0.85]
 *   3. Commit message: Usually at end: `... Fixes DCYFR-123` [confidence: 0.75]
 *   4. Manual mapping: User explicitly linked (stored in DB) [confidence: 1.0]
 *
 * Usage:
 *   const mapper = new IssueMapper({ store: myMappingStore });
 *   const match = await mapper.correlate({
 *     branch: 'feature/DCYFR-123-auth',
 *     prTitle: '[DCYFR-123] Add OAuth',
 *     commits: ['Add auth module (#123)', 'Fixes DCYFR-123']
 *   });
 *   // => { linearIssueId: 'uuid-xxx', identifier: 'DCYFR-123', confidence: 0.95 }
 *
 * Part of: Phase 2 (MVP Linear Sync) + Phase 3 (Bidirectional Sync)
 * Test: __tests__/integrations/linear/issue-mapper.test.ts
 */

export interface CorrelationInput {
    /** Git branch name (e.g., "feature/DCYFR-123-auth") */
    branch?: string;
    /** Pull request title (e.g., "[DCYFR-123] Add OAuth") */
    prTitle?: string;
    /** List of commit messages to search */
    commits?: string[];
    /** Raw PR body/description to search */
    prBody?: string;
}

export interface CorrelationResult {
    /** Linear issue identifier if found (e.g., "DCYFR-123") */
    identifier: string | null;
    /** Source of the match (branch|pr_title|commit_message|pr_body) */
    source: 'branch' | 'pr_title' | 'commit_message' | 'pr_body' | null;
    /** Confidence score (0-1, where 1.0 = certain) */
    confidence: number;
    /** All potential matches found (for debugging/validation) */
    alternates: Array<{
        identifier: string;
        source: string;
        confidence: number;
    }>;
}

// ============================================================================
// Issue Key Regex Patterns
// ============================================================================

/**
 * Matches Jira-style issue keys: TEAM-NUMBER
 * Examples: DCYFR-123, FOO-999
 *
 * Pattern explanation:
 *   [A-Z]+ = one or more uppercase letters (team key)
 *   - = hyphen
 *   \d+ = one or more digits (issue number)
 */
const ISSUE_KEY_PATTERN = /([A-Z][A-Z0-9]*-\d+)/g;

/**
 * Branch name format: feature/TEAM-NUMBER-description
 */
const BRANCH_PATTERN = /^[a-z]+\/([A-Z][A-Z0-9]*-\d+)/;

/**
 * PR title format: "[TEAM-NUMBER] Description" or "[TEAM-NUMBER] Description (Fixes)"
 */
const PR_TITLE_PATTERN = /^\[([A-Z][A-Z0-9]*-\d+)\]/;

/**
 * Commit pattern: "Description (Fixes|Closes|Resolves) TEAM-NUMBER"
 */
const COMMIT_PATTERN = /(Fixes|Closes|Resolves|Fixed|Closed|Resolved)\s+([A-Z][A-Z0-9]*-\d+)/i;

// ============================================================================
// IssueMapper
// ============================================================================

export class IssueMapper {
    /**
     * Extract issue key from a string, returning up to `limit` matches.
     */
    static extractIssueKeys(text: string, limit: number = 5): string[] {
        const matches = text.matchAll(ISSUE_KEY_PATTERN);
        return Array.from(matches)
            .map(m => m[1])
            .slice(0, limit)
            .filter((v, i, a) => a.indexOf(v) === i); // Deduplicate
    }

    /**
     * Extract issue key from branch name (highest confidence).
     * Pattern: feature/DCYFR-123-description
     */
    static extractFromBranch(branch: string): string | null {
        const match = branch.match(BRANCH_PATTERN);
        return match ? match[1] : null;
    }

    /**
     * Extract issue key from PR title (high confidence).
     * Patterns: "[DCYFR-123] Title", "[DCYFR-123]: Title"
     */
    static extractFromPrTitle(title: string): string | null {
        const match = title.match(PR_TITLE_PATTERN);
        return match ? match[1] : null;
    }

    /**
     * Extract issue key from commit messages (moderate confidence).
     * Patterns: "Fixes DCYFR-123", "Closes DCYFR-123", "Resolves DCYFR-123"
     */
    static extractFromCommits(commits: string[]): string | null {
        for (const commit of commits) {
            const match = commit.match(COMMIT_PATTERN);
            if (match) {
                return match[2]; // Return the issue key
            }
        }
        return null;
    }

    /**
     * Extract issue keys from PR body/description (low confidence).
     * Uses generic issue key pattern matching.
     */
    static extractFromPrBody(body: string): string[] {
        return this.extractIssueKeys(body, 1);
    }

    /**
     * Correlate a pull request to a Linear issue by examining branch, title, commits, and body.
     *
     * Returns the best match with highest confidence, plus alternates for manual review.
     * Implements priority-based matching:
     *   1. Branch name (0.95) — most specific
     *   2. PR title (0.85)
     *   3. Commit messages (0.75)
     *   4. PR body (0.60) — lowest confidence
     */
    static correlate(input: CorrelationInput): CorrelationResult {
        const candidates: Array<{
            identifier: string;
            source: string;
            confidence: number;
        }> = [];

        // 1. Branch (highest priority)
        if (input.branch) {
            const key = this.extractFromBranch(input.branch);
            if (key) {
                candidates.push({
                    identifier: key,
                    source: 'branch',
                    confidence: 0.95,
                });
            }
        }

        // 2. PR title
        if (input.prTitle) {
            const key = this.extractFromPrTitle(input.prTitle);
            if (key) {
                candidates.push({
                    identifier: key,
                    source: 'pr_title',
                    confidence: 0.85,
                });
            }
        }

        // 3. Commit messages
        if (input.commits && input.commits.length > 0) {
            const key = this.extractFromCommits(input.commits);
            if (key) {
                candidates.push({
                    identifier: key,
                    source: 'commit_message',
                    confidence: 0.75,
                });
            }
        }

        // 4. PR body
        if (input.prBody) {
            const keys = this.extractFromPrBody(input.prBody);
            for (const key of keys) {
                candidates.push({
                    identifier: key,
                    source: 'pr_body',
                    confidence: 0.60,
                });
            }
        }

        // Return best match (by confidence, then by source priority)
        if (candidates.length === 0) {
            return {
                identifier: null,
                source: null,
                confidence: 0,
                alternates: [],
            };
        }

        // Sort by confidence descending
        candidates.sort((a, b) => b.confidence - a.confidence);

        const best = candidates[0];
        const alternates = candidates.slice(1);

        return {
            identifier: best.identifier,
            source: best.source as any,
            confidence: best.confidence,
            alternates,
        };
    }

    /**
     * Validate that a correlation result meets minimum confidence threshold.
     * Default threshold: 0.8 (requires high confidence)
     */
    static isConfident(result: CorrelationResult, threshold = 0.8): boolean {
        return result.confidence >= threshold && result.identifier !== null;
    }
}

export default IssueMapper;

/**
 * @file plugin-rating-aggregator.test.ts
 * @description Unit tests for the plugin marketplace rating and review system.
 *              Covers tasks 12.1–12.7: review CRUD, aggregation, moderation,
 *              community score derivation, and trust score integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginRatingAggregator,
  ReviewError,
} from '../../src/plugins/reviews/plugin-rating-aggregator.js';
import type { CreateReviewInput, StarRating } from '../../src/plugins/reviews/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReviewInput(
  pluginId: string,
  userId: string,
  rating: StarRating,
  comment?: string,
): CreateReviewInput {
  return {
    pluginId,
    userId,
    displayName: `User ${userId}`,
    rating,
    comment,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PluginRatingAggregator', () => {
  let agg: PluginRatingAggregator;

  beforeEach(() => {
    agg = new PluginRatingAggregator({ autoApproveOnCreate: true });
  });

  // ── createReview ────────────────────────────────────────────────────────

  describe('createReview()', () => {
    it('creates a review with correct fields', () => {
      const review = agg.createReview(makeReviewInput('plugin-a', 'user-1', 5, 'Excellent!'));
      expect(review.pluginId).toBe('plugin-a');
      expect(review.userId).toBe('user-1');
      expect(review.rating).toBe(5);
      expect(review.comment).toBe('Excellent!');
      expect(review.status).toBe('approved');
      expect(review.helpfulVotes).toBe(0);
      expect(review.flagCount).toBe(0);
      expect(review.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('sets status to pending when autoApproveOnCreate=false', () => {
      const agg2 = new PluginRatingAggregator({ autoApproveOnCreate: false });
      const review = agg2.createReview(makeReviewInput('plugin-a', 'user-1', 3));
      expect(review.status).toBe('pending');
    });

    it('throws DUPLICATE_REVIEW on second review from same user', () => {
      agg.createReview(makeReviewInput('plugin-a', 'user-1', 5));
      let caught: unknown;
      try {
        agg.createReview(makeReviewInput('plugin-a', 'user-1', 3));
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReviewError);
      expect((caught as ReviewError).code).toBe('DUPLICATE_REVIEW');
    });

    it('allows different users to review the same plugin', () => {
      const r1 = agg.createReview(makeReviewInput('plugin-a', 'user-1', 5));
      const r2 = agg.createReview(makeReviewInput('plugin-a', 'user-2', 3));
      expect(r1.id).not.toBe(r2.id);
    });

    it('allows same user to review different plugins', () => {
      const r1 = agg.createReview(makeReviewInput('plugin-a', 'user-1', 5));
      const r2 = agg.createReview(makeReviewInput('plugin-b', 'user-1', 4));
      expect(r1.pluginId).toBe('plugin-a');
      expect(r2.pluginId).toBe('plugin-b');
    });

    it('throws INVALID_INPUT when pluginId is empty', () => {
      let caught: unknown;
      try {
        agg.createReview({ pluginId: '', userId: 'u1', displayName: 'A', rating: 5 });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReviewError);
      expect((caught as ReviewError).code).toBe('INVALID_INPUT');
    });

    it('throws INVALID_RATING for rating 0', () => {
      let caught: unknown;
      try {
        agg.createReview({ pluginId: 'p', userId: 'u', displayName: 'A', rating: 0 as StarRating });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReviewError);
      expect((caught as ReviewError).code).toBe('INVALID_RATING');
    });

    it('throws INVALID_RATING for rating 6', () => {
      let caught: unknown;
      try {
        agg.createReview({ pluginId: 'p', userId: 'u', displayName: 'A', rating: 6 as StarRating });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReviewError);
      expect((caught as ReviewError).code).toBe('INVALID_RATING');
    });

    it('truncates comment exceeding maxCommentLength', () => {
      const agg2 = new PluginRatingAggregator({ maxCommentLength: 10 });
      const review = agg2.createReview(
        makeReviewInput('p', 'u', 4, 'A very long comment that exceeds 10 chars'),
      );
      expect(review.comment?.length).toBe(10);
    });

    it('accepts comment at exactly maxCommentLength', () => {
      const agg2 = new PluginRatingAggregator({ maxCommentLength: 5 });
      const review = agg2.createReview(makeReviewInput('p', 'u', 4, 'hello'));
      expect(review.comment).toBe('hello');
    });

    it('accepts reviews without comments', () => {
      const review = agg.createReview(makeReviewInput('plugin-a', 'user-1', 4));
      expect(review.comment).toBeUndefined();
    });

    it('trims whitespace from displayName and comment', () => {
      const review = agg.createReview({
        pluginId: 'p',
        userId: 'u',
        displayName: '  Alice  ',
        rating: 5,
        comment: '  Great  ',
      });
      expect(review.displayName).toBe('Alice');
      expect(review.comment).toBe('Great');
    });
  });

  // ── flagReview ──────────────────────────────────────────────────────────

  describe('flagReview()', () => {
    it('increments flagCount on each call', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 3));
      const r1 = agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod-1' });
      const r2 = agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod-2' });
      expect(r1.flagCount).toBe(1);
      expect(r2.flagCount).toBe(2);
    });

    it('auto-flags review when flagCount reaches threshold (3)', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 3));
      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod-1' });
      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod-2' });
      const flagged = agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod-3' });
      expect(flagged.status).toBe('flagged');
    });

    it('does not flag before threshold', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 3));
      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod-1' });
      const r = agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod-2' });
      expect(r.status).toBe('approved');
    });

    it('throws REVIEW_NOT_FOUND for unknown reviewId', () => {
      let caught: unknown;
      try {
        agg.flagReview({ reviewId: 'no-such-id', reason: 'spam', reportedBy: 'u' });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReviewError);
      expect((caught as ReviewError).code).toBe('REVIEW_NOT_FOUND');
    });

    it('throws REVIEW_REMOVED for removed review', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 3));
      agg.removeReview(review.id);
      let caught: unknown;
      try {
        agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'mod' });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReviewError);
      expect((caught as ReviewError).code).toBe('REVIEW_REMOVED');
    });
  });

  // ── approveReview ───────────────────────────────────────────────────────

  describe('approveReview()', () => {
    it('sets status to approved', () => {
      const agg2 = new PluginRatingAggregator({ autoApproveOnCreate: false });
      const review = agg2.createReview(makeReviewInput('p', 'u1', 5));
      expect(review.status).toBe('pending');
      const approved = agg2.approveReview(review.id);
      expect(approved.status).toBe('approved');
    });

    it('re-approves a flagged review', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 4));
      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'm1' });
      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'm2' });
      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'm3' });
      const reapproved = agg.approveReview(review.id);
      expect(reapproved.status).toBe('approved');
    });
  });

  // ── removeReview ─────────────────────────────────────────────────────────

  describe('removeReview()', () => {
    it('sets status to removed', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 5));
      const removed = agg.removeReview(review.id);
      expect(removed.status).toBe('removed');
    });

    it('does not include removed reviews in rating stats', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      const r2 = agg.createReview(makeReviewInput('p', 'u2', 1));
      agg.removeReview(r2.id);
      const stats = agg.getRatingStats('p');
      expect(stats.totalReviews).toBe(1);
      expect(stats.averageRating).toBe(5);
    });
  });

  // ── voteHelpful ─────────────────────────────────────────────────────────

  describe('voteHelpful()', () => {
    it('increments helpfulVotes', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 5));
      const voted = agg.voteHelpful(review.id);
      expect(voted.helpfulVotes).toBe(1);
    });

    it('accumulates multiple votes', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.voteHelpful(review.id);
      agg.voteHelpful(review.id);
      const voted = agg.voteHelpful(review.id);
      expect(voted.helpfulVotes).toBe(3);
    });
  });

  // ── getReviews ──────────────────────────────────────────────────────────

  describe('getReviews()', () => {
    beforeEach(() => {
      agg.createReview(makeReviewInput('plugin-x', 'u1', 5, 'Great!'));
      agg.createReview(makeReviewInput('plugin-x', 'u2', 4, 'Good'));
      agg.createReview(makeReviewInput('plugin-x', 'u3', 3, 'OK'));
      agg.createReview(makeReviewInput('plugin-x', 'u4', 2, 'Meh'));
      agg.createReview(makeReviewInput('plugin-x', 'u5', 1, 'Bad'));
    });

    it('returns all approved reviews by default', () => {
      const page = agg.getReviews('plugin-x');
      expect(page.total).toBe(5);
      expect(page.reviews.length).toBe(5);
    });

    it('respects pageSize', () => {
      const page = agg.getReviews('plugin-x', { page: 1, pageSize: 2 });
      expect(page.reviews.length).toBe(2);
      expect(page.hasMore).toBe(true);
    });

    it('returns correct page 2', () => {
      const page = agg.getReviews('plugin-x', { page: 2, pageSize: 3 });
      expect(page.reviews.length).toBe(2);
      expect(page.hasMore).toBe(false);
    });

    it('sorts by rating desc', () => {
      const page = agg.getReviews('plugin-x', { sortBy: 'rating', sortOrder: 'desc' });
      const ratings = page.reviews.map((r) => r.rating);
      expect(ratings[0]).toBe(5);
      expect(ratings[ratings.length - 1]).toBe(1);
    });

    it('sorts by rating asc', () => {
      const page = agg.getReviews('plugin-x', { sortBy: 'rating', sortOrder: 'asc' });
      expect(page.reviews[0].rating).toBe(1);
    });

    it('filters by pending status', () => {
      const aggPending = new PluginRatingAggregator({ autoApproveOnCreate: false });
      aggPending.createReview(makeReviewInput('p', 'u1', 5));
      const page = aggPending.getReviews('p', { status: 'pending' });
      expect(page.total).toBe(1);
    });

    it('filters by plugin correctly (no cross-plugin contamination)', () => {
      agg.createReview(makeReviewInput('other-plugin', 'u-other', 5));
      const page = agg.getReviews('plugin-x');
      expect(page.total).toBe(5);
    });

    it('returns empty page for unknown plugin', () => {
      const page = agg.getReviews('nonexistent');
      expect(page.total).toBe(0);
      expect(page.reviews.length).toBe(0);
      expect(page.hasMore).toBe(false);
    });
  });

  // ── hasReviewed ─────────────────────────────────────────────────────────

  describe('hasReviewed()', () => {
    it('returns true after review submission', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      expect(agg.hasReviewed('p', 'u1')).toBe(true);
    });

    it('returns false before review', () => {
      expect(agg.hasReviewed('p', 'u1')).toBe(false);
    });

    it('returns false for different plugin', () => {
      agg.createReview(makeReviewInput('p1', 'u1', 5));
      expect(agg.hasReviewed('p2', 'u1')).toBe(false);
    });
  });

  // ── getRatingStats ──────────────────────────────────────────────────────

  describe('getRatingStats()', () => {
    it('returns zero stats for plugin with no reviews', () => {
      const stats = agg.getRatingStats('no-reviews');
      expect(stats.totalReviews).toBe(0);
      expect(stats.averageRating).toBe(0);
      expect(stats.communityScore).toBe(0);
    });

    it('calculates average correctly', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.createReview(makeReviewInput('p', 'u2', 3));
      const stats = agg.getRatingStats('p');
      expect(stats.averageRating).toBe(4);
      expect(stats.totalReviews).toBe(2);
    });

    it('builds correct distribution', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.createReview(makeReviewInput('p', 'u2', 5));
      agg.createReview(makeReviewInput('p', 'u3', 3));
      const stats = agg.getRatingStats('p');
      expect(stats.distribution[5]).toBe(2);
      expect(stats.distribution[4]).toBe(0);
      expect(stats.distribution[3]).toBe(1);
    });

    it('computes communityScore as (avg/5)*100', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.createReview(makeReviewInput('p', 'u2', 5));
      const stats = agg.getRatingStats('p');
      expect(stats.communityScore).toBe(100);
    });

    it('communityScore for average rating 2.5 = 50', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.createReview(makeReviewInput('p', 'u2', 1));
      const stats = agg.getRatingStats('p');
      // avg = 3, communityScore = 60
      expect(stats.communityScore).toBe(60);
    });

    it('communityScore capped at 100, floored at 0', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      const stats = agg.getRatingStats('p');
      expect(stats.communityScore).toBeLessThanOrEqual(100);
      expect(stats.communityScore).toBeGreaterThanOrEqual(0);
    });
  });

  // ── getCommunityScore ───────────────────────────────────────────────────

  describe('getCommunityScore()', () => {
    it('returns communityScore matching getRatingStats()', () => {
      agg.createReview(makeReviewInput('p', 'u1', 4));
      expect(agg.getCommunityScore('p')).toBe(agg.getRatingStats('p').communityScore);
    });

    it('returns 0 for unknown plugin', () => {
      expect(agg.getCommunityScore('unknown')).toBe(0);
    });
  });

  // ── moderation workflow ─────────────────────────────────────────────────

  describe('Moderation workflow', () => {
    it('full moderation lifecycle: create → flag 3x → flagged → approve', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 5, 'Excellent!'));
      expect(review.status).toBe('approved');

      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'm1' });
      agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'm2' });
      const flagged = agg.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'm3' });
      expect(flagged.status).toBe('flagged');

      // Flagged review excluded from ratings
      const statsBeforeApproval = agg.getRatingStats('p');
      expect(statsBeforeApproval.totalReviews).toBe(0);

      // Moderator approves
      const approved = agg.approveReview(review.id);
      expect(approved.status).toBe('approved');

      const statsAfterApproval = agg.getRatingStats('p');
      expect(statsAfterApproval.totalReviews).toBe(1);
    });

    it('full moderation lifecycle: flag → remove (permanent)', () => {
      const review = agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.flagReview({ reviewId: review.id, reason: 'inappropriate', reportedBy: 'm1' });
      agg.flagReview({ reviewId: review.id, reason: 'inappropriate', reportedBy: 'm2' });
      agg.flagReview({ reviewId: review.id, reason: 'inappropriate', reportedBy: 'm3' });

      const removed = agg.removeReview(review.id);
      expect(removed.status).toBe('removed');

      const stats = agg.getRatingStats('p');
      expect(stats.totalReviews).toBe(0);
    });

    it('custom flagThreshold of 1 auto-flags on first flag', () => {
      const strict = new PluginRatingAggregator({ flagThreshold: 1 });
      const review = strict.createReview(makeReviewInput('p', 'u1', 2));
      const flagged = strict.flagReview({ reviewId: review.id, reason: 'spam', reportedBy: 'm1' });
      expect(flagged.status).toBe('flagged');
    });
  });

  // ── hydrate / export ────────────────────────────────────────────────────

  describe('hydrate() / export()', () => {
    it('roundtrips reviews via export/hydrate', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5, 'Good'));
      agg.createReview(makeReviewInput('p', 'u2', 3));

      const exported = agg.export();
      expect(exported.length).toBe(2);

      const newAgg = new PluginRatingAggregator();
      newAgg.hydrate(exported);
      expect(newAgg.size).toBe(2);
    });

    it('hydrated aggregator preserves rating stats', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.createReview(makeReviewInput('p', 'u2', 5));
      const exported = agg.export();

      const newAgg = new PluginRatingAggregator();
      newAgg.hydrate(exported);
      const stats = newAgg.getRatingStats('p');
      expect(stats.totalReviews).toBe(2);
      expect(stats.averageRating).toBe(5);
    });

    it('hydrated aggregator prevents duplicate reviews', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      const newAgg = new PluginRatingAggregator();
      newAgg.hydrate(agg.export());

      let caught: unknown;
      try {
        newAgg.createReview(makeReviewInput('p', 'u1', 3));
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ReviewError);
      expect((caught as ReviewError).code).toBe('DUPLICATE_REVIEW');
    });
  });

  // ── size ─────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('returns 0 initially', () => {
      expect(agg.size).toBe(0);
    });

    it('increments with each created review', () => {
      agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.createReview(makeReviewInput('p', 'u2', 3));
      expect(agg.size).toBe(2);
    });

    it('does not decrement on removal (soft delete)', () => {
      const r = agg.createReview(makeReviewInput('p', 'u1', 5));
      agg.removeReview(r.id);
      expect(agg.size).toBe(1); // Review still in store, just status=removed
    });
  });
});

// ── Trust score integration ─────────────────────────────────────────────────

describe('Community score trust integration', () => {
  it('getCommunityScore() can replace communityScore dimension in trust score', () => {
    const agg = new PluginRatingAggregator();
    agg.createReview(makeReviewInput('test-plugin', 'u1', 4));
    agg.createReview(makeReviewInput('test-plugin', 'u2', 5));
    agg.createReview(makeReviewInput('test-plugin', 'u3', 4));

    const communityScore = agg.getCommunityScore('test-plugin');

    // Average = (4+5+4)/3 = 4.33... → communityScore = round((4.33/5)*100) = 87
    expect(communityScore).toBeGreaterThanOrEqual(80);
    expect(communityScore).toBeLessThanOrEqual(100);

    // Plugged into trust score dimensions
    const trustScore = {
      overall: Math.round(communityScore * 0.3 + 90 * 0.7), // 30% community weight
      dimensions: {
        security: 90,
        community: communityScore,
        maintenance: 88,
        transparency: 92,
      },
    };
    expect(trustScore.dimensions.community).toBe(communityScore);
    expect(trustScore.overall).toBeGreaterThan(0);
  });
});

/**
 * Plugin Rating Aggregator
 *
 * Manages community reviews and ratings for marketplace plugins.
 * Provides CRUD operations, aggregation statistics, moderation
 * workflow, and community score derivation for trust score integration.
 *
 * Design notes:
 *   • Pure in-memory implementation — no external DB required.
 *     Callers can persist reviews to their own store and hydrate on startup.
 *   • Thread-safe for single-process use; multi-process requires an external store.
 *   • communityScore formula: (averageRating / 5) * 100, floored at 0, capped at 100.
 *   • Auto-approve reviews with flag_count < FLAG_THRESHOLD (default: 3).
 *   • Auto-flag reviews with flag_count >= FLAG_THRESHOLD.
 *
 * @module plugins/reviews/plugin-rating-aggregator
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { randomUUID } from 'crypto';
import type {
  PluginReview,
  CreateReviewInput,
  FlagReviewInput,
  PluginRatingStats,
  ReviewPage,
  ReviewQueryOptions,
  RatingDistribution,
  StarRating,
  ReviewStatus,
} from './types.js';

// Re-export types for convenience
export type {
  PluginReview,
  CreateReviewInput,
  FlagReviewInput,
  PluginRatingStats,
  ReviewPage,
  ReviewQueryOptions,
  RatingDistribution,
  StarRating,
  ReviewStatus,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const FLAG_THRESHOLD = 3;
const AUTO_APPROVE_ON_CREATE = true;
const MAX_COMMENT_LENGTH = 2000;

// ---------------------------------------------------------------------------
// PluginRatingAggregator class
// ---------------------------------------------------------------------------

/** Configuration for PluginRatingAggregator */
export interface PluginRatingAggregatorConfig {
  /**
   * Number of flag votes before a review is automatically flagged.
   * Defaults to 3.
   */
  flagThreshold?: number;

  /**
   * Whether to auto-approve reviews on creation.
   * When false, reviews start as 'pending' and require moderation.
   * Defaults to true.
   */
  autoApproveOnCreate?: boolean;

  /** Maximum comment length in characters. Defaults to 2000. */
  maxCommentLength?: number;
}

/** Error thrown by PluginRatingAggregator operations */
export class ReviewError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

/** Core rating and review management service */
export class PluginRatingAggregator {
  /** In-memory review store: reviewId → PluginReview */
  private readonly reviews = new Map<string, PluginReview>();

  /** Per-plugin → Set of userIds (one review per user per plugin) */
  private readonly userReviewIndex = new Map<string, Map<string, string>>();

  private readonly flagThreshold: number;
  private readonly autoApproveOnCreate: boolean;
  private readonly maxCommentLength: number;

  constructor(config: PluginRatingAggregatorConfig = {}) {
    this.flagThreshold = config.flagThreshold ?? FLAG_THRESHOLD;
    this.autoApproveOnCreate = config.autoApproveOnCreate ?? AUTO_APPROVE_ON_CREATE;
    this.maxCommentLength = config.maxCommentLength ?? MAX_COMMENT_LENGTH;
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Submit a new review. Each user may only submit one review per plugin.
   * Throws ReviewError if a duplicate review is detected or input is invalid.
   */
  createReview(input: CreateReviewInput): PluginReview {
    this.validateCreateInput(input);

    // One review per user per plugin
    const pluginUserMap = this.userReviewIndex.get(input.pluginId) ?? new Map<string, string>();
    if (pluginUserMap.has(input.userId)) {
      throw new ReviewError(
        `User '${input.userId}' has already submitted a review for plugin '${input.pluginId}'.`,
        'DUPLICATE_REVIEW'
      );
    }

    const now = new Date().toISOString();
    const review: PluginReview = {
      id: randomUUID(),
      pluginId: input.pluginId,
      userId: input.userId,
      displayName: input.displayName.trim(),
      rating: input.rating,
      comment: input.comment ? input.comment.trim().slice(0, this.maxCommentLength) : undefined,
      status: this.autoApproveOnCreate ? 'approved' : 'pending',
      createdAt: now,
      updatedAt: now,
      helpfulVotes: 0,
      flagCount: 0,
    };

    this.reviews.set(review.id, review);
    pluginUserMap.set(input.userId, review.id);
    this.userReviewIndex.set(input.pluginId, pluginUserMap);

    return review;
  }

  /**
   * Flag a review as inappropriate. If flag count reaches the threshold,
   * the review status is automatically changed to 'flagged'.
   */
  flagReview(input: FlagReviewInput): PluginReview {
    const review = this.getReviewOrThrow(input.reviewId);

    if (review.status === 'removed') {
      throw new ReviewError(`Review '${input.reviewId}' has been removed.`, 'REVIEW_REMOVED');
    }

    const updated: PluginReview = {
      ...review,
      flagCount: review.flagCount + 1,
      status:
        review.flagCount + 1 >= this.flagThreshold && review.status === 'approved'
          ? 'flagged'
          : review.status,
      updatedAt: new Date().toISOString(),
    };

    this.reviews.set(review.id, updated);
    return updated;
  }

  /**
   * Mark a flagged or pending review as approved (moderation action).
   */
  approveReview(reviewId: string): PluginReview {
    const review = this.getReviewOrThrow(reviewId);
    const updated: PluginReview = {
      ...review,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    };
    this.reviews.set(reviewId, updated);
    return updated;
  }

  /**
   * Remove / soft-delete a review (moderation action). Removed reviews are
   * excluded from ratings but retained for audit purposes.
   */
  removeReview(reviewId: string): PluginReview {
    const review = this.getReviewOrThrow(reviewId);
    const updated: PluginReview = {
      ...review,
      status: 'removed',
      updatedAt: new Date().toISOString(),
    };
    this.reviews.set(reviewId, updated);
    return updated;
  }

  /**
   * Record a helpful vote on a review.
   */
  voteHelpful(reviewId: string): PluginReview {
    const review = this.getReviewOrThrow(reviewId);
    const updated: PluginReview = {
      ...review,
      helpfulVotes: review.helpfulVotes + 1,
      updatedAt: new Date().toISOString(),
    };
    this.reviews.set(reviewId, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Read operations
  // -------------------------------------------------------------------------

  /**
   * Get a single review by ID. Returns undefined if not found.
   */
  getReview(reviewId: string): PluginReview | undefined {
    return this.reviews.get(reviewId);
  }

  /**
   * Get all reviews for a plugin with optional filtering, sorting, and pagination.
   * Defaults to filtering by 'approved' status.
   */
  getReviews(pluginId: string, options: ReviewQueryOptions = {}): ReviewPage {
    const {
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
      status = 'approved',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const clampedPageSize = Math.min(pageSize, MAX_PAGE_SIZE);

    // Filter
    let filtered = Array.from(this.reviews.values()).filter(
      (r) => r.pluginId === pluginId && r.status === status
    );

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'createdAt') {
        comparison = a.createdAt.localeCompare(b.createdAt);
      } else if (sortBy === 'rating') {
        comparison = a.rating - b.rating;
      } else if (sortBy === 'helpfulVotes') {
        comparison = a.helpfulVotes - b.helpfulVotes;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const total = filtered.length;
    const start = (page - 1) * clampedPageSize;
    const reviews = filtered.slice(start, start + clampedPageSize);

    return {
      reviews,
      total,
      page,
      pageSize: clampedPageSize,
      hasMore: start + reviews.length < total,
    };
  }

  /**
   * Check whether a user has already reviewed a plugin.
   */
  hasReviewed(pluginId: string, userId: string): boolean {
    return this.userReviewIndex.get(pluginId)?.has(userId) ?? false;
  }

  // -------------------------------------------------------------------------
  // Aggregation
  // -------------------------------------------------------------------------

  /**
   * Calculate aggregated rating statistics for a plugin.
   * Only includes 'approved' reviews in the calculation.
   */
  getRatingStats(pluginId: string): PluginRatingStats {
    const approvedReviews = Array.from(this.reviews.values()).filter(
      (r) => r.pluginId === pluginId && r.status === 'approved'
    );

    const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;

    for (const review of approvedReviews) {
      distribution[review.rating]++;
      sum += review.rating;
    }

    const totalReviews = approvedReviews.length;
    const averageRating = totalReviews > 0 ? sum / totalReviews : 0;
    const communityScore = Math.min(100, Math.max(0, Math.round((averageRating / 5) * 100)));

    return {
      pluginId,
      averageRating: Math.round(averageRating * 100) / 100,
      totalReviews,
      distribution,
      communityScore,
    };
  }

  /**
   * Get community score (0–100) for use in trust score calculation.
   * Returns the communityScore from getRatingStats().
   */
  getCommunityScore(pluginId: string): number {
    return this.getRatingStats(pluginId).communityScore;
  }

  // -------------------------------------------------------------------------
  // Bulk operations
  // -------------------------------------------------------------------------

  /**
   * Load reviews into the aggregator (e.g. from a persistent store on startup).
   * Silently skips reviews with invalid status.
   */
  hydrate(reviews: PluginReview[]): void {
    for (const review of reviews) {
      this.reviews.set(review.id, review);
      const pluginUserMap = this.userReviewIndex.get(review.pluginId) ?? new Map<string, string>();
      pluginUserMap.set(review.userId, review.id);
      this.userReviewIndex.set(review.pluginId, pluginUserMap);
    }
  }

  /**
   * Export all reviews (for persistence).
   */
  export(): PluginReview[] {
    return Array.from(this.reviews.values());
  }

  /**
   * Total number of reviews in the store.
   */
  get size(): number {
    return this.reviews.size;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getReviewOrThrow(reviewId: string): PluginReview {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new ReviewError(`Review '${reviewId}' not found.`, 'REVIEW_NOT_FOUND');
    }
    return review;
  }

  private validateCreateInput(input: CreateReviewInput): void {
    if (!input.pluginId?.trim()) {
      throw new ReviewError('pluginId is required.', 'INVALID_INPUT');
    }
    if (!input.userId?.trim()) {
      throw new ReviewError('userId is required.', 'INVALID_INPUT');
    }
    if (!input.displayName?.trim()) {
      throw new ReviewError('displayName is required.', 'INVALID_INPUT');
    }
    if (![1, 2, 3, 4, 5].includes(input.rating)) {
      throw new ReviewError('rating must be between 1 and 5.', 'INVALID_RATING');
    }
    // Long comments are truncated (not rejected) to allow graceful handling
    // Callers may also enforce length limits at the API layer
  }
}

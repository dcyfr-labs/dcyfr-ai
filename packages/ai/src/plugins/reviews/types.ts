/**
 * Plugin Review & Rating Types
 *
 * Type definitions for the plugin marketplace community rating and review system.
 *
 * @module plugins/reviews/types
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Star rating value (1-5) */
export type StarRating = 1 | 2 | 3 | 4 | 5;

/** Review moderation status */
export type ReviewStatus = 'pending' | 'approved' | 'flagged' | 'removed';

/** A single plugin community review */
export interface PluginReview {
  /** Unique review identifier (UUID) */
  id: string;

  /** Plugin identifier this review is for */
  pluginId: string;

  /** Author user identifier */
  userId: string;

  /** Display name (may be anonymized) */
  displayName: string;

  /** Star rating 1–5 */
  rating: StarRating;

  /** Review text content (optional) */
  comment?: string;

  /** Moderation status */
  status: ReviewStatus;

  /** When this review was created (ISO-8601) */
  createdAt: string;

  /** When this review was last updated (ISO-8601) */
  updatedAt: string;

  /** Number of helpful votes */
  helpfulVotes: number;

  /** Number of flag/report votes */
  flagCount: number;
}

/** Input for submitting a new review */
export interface CreateReviewInput {
  pluginId: string;
  userId: string;
  displayName: string;
  rating: StarRating;
  comment?: string;
}

/** Input for flagging a review */
export interface FlagReviewInput {
  reviewId: string;
  reason: 'spam' | 'inappropriate' | 'fake' | 'other';
  reportedBy: string;
}

// ---------------------------------------------------------------------------
// Aggregation types
// ---------------------------------------------------------------------------

/** Distribution of star ratings */
export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

/** Aggregated rating statistics for a plugin */
export interface PluginRatingStats {
  /** Plugin identifier */
  pluginId: string;

  /** Average rating (0 if no reviews) */
  averageRating: number;

  /** Total number of approved reviews */
  totalReviews: number;

  /** Distribution of ratings */
  distribution: RatingDistribution;

  /** Community score (0–100) derived from average rating */
  communityScore: number;
}

/** Paginated list of reviews */
export interface ReviewPage {
  reviews: PluginReview[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Options for querying reviews */
export interface ReviewQueryOptions {
  page?: number;
  pageSize?: number;
  status?: ReviewStatus;
  sortBy?: 'createdAt' | 'rating' | 'helpfulVotes';
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Schema definitions (for reference / Drizzle migration)
// ---------------------------------------------------------------------------

/**
 * Drizzle-compatible column definitions for the plugin_reviews table.
 *
 * Column layout:
 *   id          TEXT PRIMARY KEY     — UUID
 *   plugin_id   TEXT NOT NULL        — FK → plugins.id
 *   user_id     TEXT NOT NULL        — FK → users.id / session
 *   display_name TEXT NOT NULL       — anonymizable display name
 *   rating      INTEGER NOT NULL     — 1–5
 *   comment     TEXT                 — optional review body
 *   status      TEXT NOT NULL        — pending | approved | flagged | removed
 *   helpful_votes INTEGER DEFAULT 0
 *   flag_count  INTEGER DEFAULT 0
 *   created_at  TEXT NOT NULL        — ISO-8601
 *   updated_at  TEXT NOT NULL        — ISO-8601
 *
 * Indexes:
 *   idx_reviews_plugin_id  ON plugin_reviews(plugin_id)
 *   idx_reviews_user_id    ON plugin_reviews(user_id)
 *   idx_reviews_status     ON plugin_reviews(status)
 */
export const PLUGIN_REVIEWS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS plugin_reviews (
  id            TEXT PRIMARY KEY,
  plugin_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'flagged', 'removed')),
  helpful_votes INTEGER NOT NULL DEFAULT 0,
  flag_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_plugin_id ON plugin_reviews(plugin_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id   ON plugin_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status    ON plugin_reviews(status);
`;

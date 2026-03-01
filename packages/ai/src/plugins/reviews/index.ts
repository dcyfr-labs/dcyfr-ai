/**
 * Plugin Reviews Module
 *
 * Exports for the plugin marketplace rating and review system.
 *
 * @module plugins/reviews
 */

export { PluginRatingAggregator, ReviewError } from './plugin-rating-aggregator.js';
export type {
  PluginRatingAggregatorConfig,
  StarRating,
  ReviewStatus,
  PluginReview,
  CreateReviewInput,
  FlagReviewInput,
  PluginRatingStats,
  ReviewPage,
  ReviewQueryOptions,
  RatingDistribution,
} from './plugin-rating-aggregator.js';
export { PLUGIN_REVIEWS_SCHEMA_SQL } from './types.js';

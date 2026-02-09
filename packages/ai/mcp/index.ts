/**
 * MCP Module - Exports for MCP (Model Context Protocol) integration
 *
 * @module @dcyfr/ai/mcp
 */

// Type exports
export type {
  MCPTransport,
  MCPServerStatus,
  MCPTool,
  MCPResource,
  MCPServerConfig,
  MCPServerManifest,
  MCPServerCapabilities,
  LoadedMCPServer,
  MCPRegistryConfig,
  MCPHealthCheckResult,
} from './types.js';

// MCP Registry exports
export {
  MCPRegistry,
  getGlobalMCPRegistry,
  resetGlobalMCPRegistry,
} from './mcp-registry.js';

// ============================================================================
// Shared MCP Server Infrastructure
// ============================================================================

// Shared types for MCP servers
export type {
  MCPContext,
  MCPError,
  TimeRange,
  PageViewData,
  TrendingContent,
  EngagementMetric,
  ActivityLog,
  Milestone,
  AnalyticsSummary,
  TokenCategory,
  TokenViolation,
  TokenValidationResult,
  TokenSuggestion,
  TokenUsage,
  ComplianceReport,
  ContentType,
  ContentMetadata,
  ContentItem,
  ContentAnalysis,
  RelatedContent,
  TopicTaxonomy,
  SearchResult,
  CacheEntry,
  CacheOptions,
  ScholarAuthor,
  ScholarPaper,
  ScholarCitation,
  ScholarReference,
  ScholarSearchResult,
  ScholarBulkSearchResult,
  ScholarAuthorSearchResult,
  ScholarRecommendation,
  ScholarSearchParams,
  ScholarCacheStats,
} from './servers/shared/types.js';

// Shared utilities
export {
  MCPToolError,
  handleToolError,
  isProduction,
  isDevelopment,
  getEnvironment,
  filterProductionData,
  warnProductionFallback,
  getTimeRangeMs,
  isWithinTimeRange,
  sanitizePath,
  extractSlug,
  calculateReadingTime,
  dedupe,
  sortByProperty,
  limitResults,
  isValidUrl,
  isValidPath,
  measurePerformance,
  logToolExecution,
} from './servers/shared/utils.js';

// Cache utilities
export {
  SimpleCache,
  analyticsCache,
  tokensCache,
  contentCache,
  scholarPapersCache,
  scholarSearchCache,
  scholarAuthorsCache,
} from './servers/shared/cache.js';

// Redis client
export {
  redis,
  getRedisKeyPrefix,
  getRedisEnvironment,
  closeRedisClient,
} from './servers/shared/redis-client.js';

// Rate limiter
export type { RateLimiterStats } from './servers/shared/rate-limiter.js';
export { RateLimiter } from './servers/shared/rate-limiter.js';

// PromptIntel client and types
export type {
  PromptIntelIoPC,
  PromptIntelTaxonomy,
  PromptIntelAgentReport,
  PromptIntelSearchParams,
  PromptIntelClientConfig,
  PromptIntelHealthResponse,
  PromptIntelErrorResponse,
} from './servers/shared/promptintel-types.js';
export { PromptIntelClient } from './servers/shared/promptintel-client.js';

// ============================================================================
// MCP Server Factories
// ============================================================================

// Content Manager MCP server factory and types
export type {
  ContentProvider,
  ContentItem as ContentManagerItem,
  ContentMetadata as ContentManagerMetadata,
  ContentSearchOptions,
} from './servers/content-manager/content-provider.js';
export { createContentManagerServer } from './servers/content-manager/index.js';

// Design Tokens MCP server factory and types
export type {
  TokenProvider,
  TokenCategory as DesignTokenCategory,
  TokenViolation as DesignTokenViolation,
  ValidationResult as DesignTokenValidationResult,
  TokenSuggestion as DesignTokenSuggestion,
  ComplianceReport as DesignTokenComplianceReport,
} from './servers/design-tokens/token-provider.js';
export { createDesignTokenServer } from './servers/design-tokens/index.js';

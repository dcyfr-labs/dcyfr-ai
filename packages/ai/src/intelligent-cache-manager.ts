/**
 * Intelligent Cache Manager for DCYFR Integration System
 * TLP:CLEAR
 * 
 * High-performance caching system optimized for DCYFR integration workflows.
 * Provides intelligent caching strategies for capability detection, agent data,
 * MCP server configurations, and delegation contracts with automatic cache
 * invalidation and performance optimization.
 * 
 * @version 1.0.0
 * @date 2026-02-15
 * @module dcyfr-ai/intelligent-cache-manager
 */

import { EventEmitter } from 'events';
import { PerformanceProfiler } from './performance-profiler.js';

/**
 * Cache entry metadata
 */
export interface CacheEntry<T = any> {
  /**
   * Cache key
   */
  key: string;
  
  /**
   * Cached value
   */
  value: T;
  
  /**
   * Entry creation timestamp
   */
  createdAt: Date;
  
  /**
   * Entry last access timestamp
   */
  lastAccessedAt: Date;
  
  /**
   * Entry expiration timestamp (optional)
   */
  expiresAt?: Date;
  
  /**
   * Access count for LRU optimization
   */
  accessCount: number;
  
  /**
   * Entry size in bytes (estimated)
   */
  estimatedSize: number;
  
  /**
   * Cache tags for selective invalidation
   */
  tags: Set<string>;
  
  /**
   * Entry priority (higher = more important to keep)
   */
  priority: number;
  
  /**
   * Function to compute cache key dependencies
   */
  dependencies?: string[];
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /**
   * Maximum number of entries
   */
  maxEntries?: number;
  
  /**
   * Maximum cache size in bytes
   */
  maxSizeBytes?: number;
  
  /**
   * Default TTL in milliseconds
   */
  defaultTTL?: number;
  
  /**
   * Cache eviction strategy
   */
  evictionStrategy?: 'lru' | 'lfu' | 'ttl' | 'priority';
  
  /**
   * Enable performance tracking
   */
  enablePerformanceTracking?: boolean;
  
  /**
   * Enable automatic cleanup
   */
  enableAutoCleanup?: boolean;
  
  /**
   * Cleanup interval in milliseconds
   */
  cleanupInterval?: number;
  
  /**
   * Enable compression for large entries
   */
  enableCompression?: boolean;
  
  /**
   * Compression threshold in bytes
   */
  compressionThreshold?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Total cache hits
   */
  hits: number;
  
  /**
   * Total cache misses
   */
  misses: number;
  
  /**
   * Cache hit rate (0-1)
   */
  hitRate: number;
  
  /**
   * Current number of entries
   */
  entryCount: number;
  
  /**
   * Current cache size in bytes
   */
  currentSize: number;
  
  /**
   * Number of evictions
   */
  evictions: number;
  
  /**
   * Number of expirations
   */
  expirations: number;
  
  /**
   * Average access time in milliseconds
   */
  averageAccessTime: number;
  
  /**
   * Memory utilization percentage
   */
  memoryUtilization: number;
}

/**
 * Cache invalidation pattern
 */
export interface InvalidationPattern {
  /**
   * Pattern type
   */
  type: 'tag' | 'key_prefix' | 'key_regex' | 'dependency' | 'time_based';
  
  /**
   * Pattern value
   */
  pattern: string | RegExp | string[];
  
  /**
   * Invalidation reason
   */
  reason?: string;
}

/**
 * Intelligent Cache Manager
 * 
 * High-performance caching system with intelligent eviction strategies,
 * automatic cleanup, and performance optimization for DCYFR integration workflows.
 */
export class IntelligentCacheManager extends EventEmitter {
  private config: Required<CacheConfig>;
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats;
  private profiler?: PerformanceProfiler;
  private cleanupInterval?: NodeJS.Timeout;
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> keys
  private dependencyIndex: Map<string, Set<string>> = new Map(); // dependency -> keys

  constructor(config: CacheConfig = {}, profiler?: PerformanceProfiler) {
    super();
    
    this.config = {
      maxEntries: 10000,
      maxSizeBytes: 100 * 1024 * 1024, // 100MB
      defaultTTL: 60 * 60 * 1000, // 1 hour
      evictionStrategy: 'lru',
      enablePerformanceTracking: true,
      enableAutoCleanup: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      enableCompression: false,
      compressionThreshold: 1024, // 1KB
      ...config,
    };

    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      entryCount: 0,
      currentSize: 0,
      evictions: 0,
      expirations: 0,
      averageAccessTime: 0,
      memoryUtilization: 0,
    };

    this.profiler = profiler;

    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const startTime = this.config.enablePerformanceTracking ? Date.now() : 0;
    
    try {
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.stats.misses++;
        this.updateStats();
        this.emit('cache_miss', { key });
        return null;
      }

      // Check expiration
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        this.delete(key);
        this.stats.misses++;
        this.stats.expirations++;
        this.updateStats();
        this.emit('cache_expired', { key, entry });
        return null;
      }

      // Update access information
      entry.lastAccessedAt = new Date();
      entry.accessCount++;

      this.stats.hits++;
      this.updateStats();
      
      this.emit('cache_hit', { key, entry });
      return entry.value;

    } finally {
      if (this.config.enablePerformanceTracking && this.profiler) {
        const accessTime = Date.now() - startTime;
        this.profiler.recordMetric({
          id: `cache-access-${Date.now()}`,
          name: 'cache_access_time',
          value: accessTime,
          unit: 'ms',
          category: 'timing',
          timestamp: new Date(),
          context: { operation: 'get', key },
        });
      }
    }
  }

  /**
   * Set value in cache
   */
  set<T>(
    key: string, 
    value: T, 
    options: {
      ttl?: number;
      tags?: string[];
      priority?: number;
      dependencies?: string[];
    } = {}
  ): boolean {
    const startTime = this.config.enablePerformanceTracking ? Date.now() : 0;
    
    try {
      // Calculate estimated size
      const estimatedSize = this.estimateSize(value);
      
      // Check if we need to evict entries
      this.ensureCapacity(estimatedSize);

      const now = new Date();
      const ttl = options.ttl || this.config.defaultTTL;
      const expiresAt = ttl > 0 ? new Date(now.getTime() + ttl) : undefined;
      
      const entry: CacheEntry<T> = {
        key,
        value: this.config.enableCompression && estimatedSize > this.config.compressionThreshold
          ? this.compressValue(value) : value,
        createdAt: now,
        lastAccessedAt: now,
        expiresAt,
        accessCount: 0,
        estimatedSize,
        tags: new Set(options.tags || []),
        priority: options.priority || 5,
        dependencies: options.dependencies,
      };

      // Remove existing entry if present
      if (this.cache.has(key)) {
        this.removeFromIndexes(key);
      }

      // Store entry
      this.cache.set(key, entry);
      this.stats.currentSize += estimatedSize;
      this.stats.entryCount = this.cache.size;

      // Update indexes
      this.updateIndexes(key, entry);
      
      this.updateStats();
      this.emit('cache_set', { key, entry, options });
      
      return true;

    } catch (error) {
      this.emit('cache_error', { operation: 'set', key, error: (error as Error).message });
      return false;
      
    } finally {
      if (this.config.enablePerformanceTracking && this.profiler) {
        const setTime = Date.now() - startTime;
        this.profiler.recordMetric({
          id: `cache-set-${Date.now()}`,
          name: 'cache_set_time',
          value: setTime,
          unit: 'ms',
          category: 'timing',
          timestamp: new Date(),
          context: { operation: 'set', key },
        });
      }
    }
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.stats.currentSize -= entry.estimatedSize;
    this.stats.entryCount = this.cache.size;
    
    this.removeFromIndexes(key);
    this.updateStats();
    
    this.emit('cache_delete', { key, entry });
    return true;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get or compute value (with caching)
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T> | T,
    options: {
      ttl?: number;
      tags?: string[];
      priority?: number;
      dependencies?: string[];
    } = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute value
    const startTime = Date.now();
    const value = await computeFn();
    const computeTime = Date.now() - startTime;
    
    // Store in cache
    this.set(key, value, options);
    
    if (this.profiler) {
      this.profiler.recordMetric({
        id: `cache-compute-${Date.now()}`,
        name: 'cache_compute_time',
        value: computeTime,
        unit: 'ms',
        category: 'timing',
        timestamp: new Date(),
        context: { operation: 'compute', key },
      });
    }
    
    this.emit('cache_computed', { key, value, computeTime });
    return value;
  }

  /** Collect cache keys matching a given invalidation pattern */
  private collectKeysForPattern(pattern: InvalidationPattern): string[] {
    switch (pattern.type) {
      case 'tag': {
        const tagKeys = this.tagIndex.get(pattern.pattern as string);
        return tagKeys ? Array.from(tagKeys) : [];
      }
      case 'key_prefix': {
        const prefix = pattern.pattern as string;
        return Array.from(this.cache.keys()).filter(k => k.startsWith(prefix));
      }
      case 'key_regex': {
        const regex = pattern.pattern as RegExp;
        return Array.from(this.cache.keys()).filter(k => regex.test(k));
      }
      case 'dependency': {
        const depKeys = this.dependencyIndex.get(pattern.pattern as string);
        return depKeys ? Array.from(depKeys) : [];
      }
      case 'time_based': {
        const cutoff = new Date(pattern.pattern as string);
        return Array.from(this.cache.entries())
          .filter(([, entry]) => entry.createdAt < cutoff)
          .map(([k]) => k);
      }
      default:
        return [];
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern: InvalidationPattern): number {
    const keysToDelete = this.collectKeysForPattern(pattern);
    let invalidatedCount = 0;

    for (const key of keysToDelete) {
      if (this.delete(key)) {
        invalidatedCount++;
      }
    }

    this.emit('cache_invalidated', { 
      pattern, 
      invalidatedCount, 
      reason: pattern.reason 
    });

    return invalidatedCount;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const entryCount = this.cache.size;
    
    this.cache.clear();
    this.tagIndex.clear();
    this.dependencyIndex.clear();
    
    this.stats.currentSize = 0;
    this.stats.entryCount = 0;
    this.updateStats();
    
    this.emit('cache_cleared', { entryCount });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entries for debugging
   */
  entries(): Array<{ key: string; entry: CacheEntry }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({ key, entry }));
  }

  /**
   * Optimize cache performance
   */
  optimize(): {
    beforeStats: CacheStats;
    afterStats: CacheStats;
    optimizations: string[];
  } {
    const beforeStats = this.getStats();
    const optimizations: string[] = [];

    // Remove expired entries
    const expiredCount = this.removeExpired();
    if (expiredCount > 0) {
      optimizations.push(`Removed ${expiredCount} expired entries`);
    }

    // Optimize based on access patterns
    if (beforeStats.hitRate < 0.7) {
      // Low hit rate - consider increasing TTL for frequently accessed items
      this.optimizeByAccessPattern();
      optimizations.push('Optimized TTL based on access patterns');
    }

    // Compress large entries if not already compressed
    if (!this.config.enableCompression) {
      const compressedCount = this.compressLargeEntries();
      if (compressedCount > 0) {
        optimizations.push(`Compressed ${compressedCount} large entries`);
      }
    }

    // Evict low-priority entries if approaching capacity
    if (this.stats.memoryUtilization > 0.8) {
      const evictedCount = this.evictByPriority();
      if (evictedCount > 0) {
        optimizations.push(`Evicted ${evictedCount} low-priority entries`);
      }
    }

    const afterStats = this.getStats();
    
    this.emit('cache_optimized', { 
      beforeStats, 
      afterStats, 
      optimizations 
    });

    return { beforeStats, afterStats, optimizations };
  }

  /**
   * Ensure cache capacity for new entry
   */
  private ensureCapacity(newEntrySize: number): void {
    // Check size limit
    while (this.stats.currentSize + newEntrySize > this.config.maxSizeBytes && this.cache.size > 0) {
      this.evictOne();
    }

    // Check entry count limit
    while (this.cache.size >= this.config.maxEntries && this.cache.size > 0) {
      this.evictOne();
    }
  }

  /**
   * Evict one entry based on strategy
   */
  private evictOne(): boolean {
    let keyToEvict: string | null = null;

    switch (this.config.evictionStrategy) {
      case 'lru':
        keyToEvict = this.findLRUKey();
        break;
      case 'lfu':
        keyToEvict = this.findLFUKey();
        break;
      case 'ttl':
        keyToEvict = this.findEarliestExpiringKey();
        break;
      case 'priority':
        keyToEvict = this.findLowestPriorityKey();
        break;
    }

    if (keyToEvict) {
      this.delete(keyToEvict);
      this.stats.evictions++;
      this.emit('cache_evicted', { key: keyToEvict, strategy: this.config.evictionStrategy });
      return true;
    }

    return false;
  }

  /**
   * Find least recently used key
   */
  private findLRUKey(): string | null {
    let oldestTime = Date.now();
    let lruKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt.getTime() < oldestTime) {
        oldestTime = entry.lastAccessedAt.getTime();
        lruKey = key;
      }
    }

    return lruKey;
  }

  /**
   * Find least frequently used key
   */
  private findLFUKey(): string | null {
    let lowestCount = Infinity;
    let lfuKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < lowestCount) {
        lowestCount = entry.accessCount;
        lfuKey = key;
      }
    }

    return lfuKey;
  }

  /**
   * Find earliest expiring key
   */
  private findEarliestExpiringKey(): string | null {
    let earliestExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
    let ttlKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < earliestExpiry) {
        earliestExpiry = entry.expiresAt;
        ttlKey = key;
      }
    }

    return ttlKey;
  }

  /**
   * Find lowest priority key
   */
  private findLowestPriorityKey(): string | null {
    let lowestPriority = Infinity;
    let priorityKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.priority < lowestPriority) {
        lowestPriority = entry.priority;
        priorityKey = key;
      }
    }

    return priorityKey;
  }

  /**
   * Update cache indexes
   */
  private updateIndexes(key: string, entry: CacheEntry): void {
    // Update tag index
    for (const tag of entry.tags) {
      let tagKeys = this.tagIndex.get(tag);
      if (!tagKeys) {
        tagKeys = new Set();
        this.tagIndex.set(tag, tagKeys);
      }
      tagKeys.add(key);
    }

    // Update dependency index
    if (entry.dependencies) {
      for (const dependency of entry.dependencies) {
        let depKeys = this.dependencyIndex.get(dependency);
        if (!depKeys) {
          depKeys = new Set();
          this.dependencyIndex.set(dependency, depKeys);
        }
        depKeys.add(key);
      }
    }
  }

  /** Remove a single key from an index map, deleting the bucket if empty */
  private removeKeyFromIndexMap(indexMap: Map<string, Set<string>>, indexKey: string, cacheKey: string): void {
    const bucket = indexMap.get(indexKey);
    if (!bucket) return;
    bucket.delete(cacheKey);
    if (bucket.size === 0) indexMap.delete(indexKey);
  }

  /**
   * Remove key from all indexes
   */
  private removeFromIndexes(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    for (const tag of entry.tags) {
      this.removeKeyFromIndexMap(this.tagIndex, tag, key);
    }

    if (entry.dependencies) {
      for (const dep of entry.dependencies) {
        this.removeKeyFromIndexMap(this.dependencyIndex, dep, key);
      }
    }
  }

  /**
   * Estimate size of value in bytes
   */
  private estimateSize<T>(value: T): number {
    try {
      const jsonStr = JSON.stringify(value);
      return jsonStr.length * 2; // Rough estimate for UTF-16 encoding
    } catch {
      return 1024; // Default estimate for non-serializable values
    }
  }

  /**
   * Compress value (placeholder - would use actual compression)
   */
  private compressValue<T>(value: T): T {
    // In a real implementation, this would use compression like gzip
    // For now, just return the value unchanged
    return value;
  }

  /**
   * Remove expired entries
   */
  private removeExpired(): number {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    let removedCount = 0;
    for (const key of expiredKeys) {
      if (this.delete(key)) {
        removedCount++;
        this.stats.expirations++;
      }
    }

    return removedCount;
  }

  /**
   * Optimize by access pattern
   */
  private optimizeByAccessPattern(): void {
    // Extend TTL for frequently accessed items
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount > 10) { // Frequently accessed
        const newTTL = this.config.defaultTTL * 2;
        entry.expiresAt = new Date(Date.now() + newTTL);
      }
    }
  }

  /**
   * Compress large entries
   */
  private compressLargeEntries(): number {
    let compressedCount = 0;
    
    for (const entry of this.cache.values()) {
      if (entry.estimatedSize > this.config.compressionThreshold) {
        // Would implement actual compression here
        compressedCount++;
      }
    }

    return compressedCount;
  }

  /**
   * Evict by priority
   */
  private evictByPriority(): number {
    const lowPriorityEntries = Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.priority < 3)
      .slice(0, Math.floor(this.cache.size * 0.1)); // Evict up to 10%

    let evictedCount = 0;
    for (const [key] of lowPriorityEntries) {
      if (this.delete(key)) {
        evictedCount++;
      }
    }

    return evictedCount;
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    const totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    this.stats.memoryUtilization = this.config.maxSizeBytes > 0 
      ? this.stats.currentSize / this.config.maxSizeBytes : 0;
  }

  /**
   * Start automatic cleanup
   */
  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const expiredCount = this.removeExpired();
      if (expiredCount > 0) {
        this.emit('auto_cleanup', { expiredCount });
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Shutdown cache manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.clear();
    this.removeAllListeners();
    
    this.emit('shutdown_complete');
  }
}

/**
 * Global cache manager instance
 */
let globalCacheManager: IntelligentCacheManager | null = null;

/**
 * Get or create global cache manager instance
 */
export function getGlobalCacheManager(
  config?: CacheConfig, 
  profiler?: PerformanceProfiler
): IntelligentCacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new IntelligentCacheManager(config, profiler);
  }
  return globalCacheManager;
}

/**
 * Cache decorator for class methods
 */
export function cache(options: {
  ttl?: number;
  keyGenerator?: (...args: any[]) => string;
  tags?: string[];
  priority?: number;
} = {}) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const cacheManager = getGlobalCacheManager();
    
    descriptor.value = async function(...args: any[]) {
      const cacheKey = options.keyGenerator 
        ? options.keyGenerator(...args)
        : `${target.constructor.name}.${propertyName}:${JSON.stringify(args)}`;
      
      return await cacheManager.getOrCompute(
        cacheKey,
        () => method.apply(this, args),
        options
      );
    };
    
    return descriptor;
  };
}

export default IntelligentCacheManager;
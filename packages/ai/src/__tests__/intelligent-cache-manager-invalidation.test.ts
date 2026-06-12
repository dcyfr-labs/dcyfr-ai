/**
 * IntelligentCacheManager invalidation-pattern and index-maintenance tests:
 * every collectKeysForPattern branch, index cleanup on delete, and the
 * access-pattern optimizer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IntelligentCacheManager } from '../intelligent-cache-manager.js';

let cache: IntelligentCacheManager;

beforeEach(() => {
  cache = new IntelligentCacheManager({
    enableAutoCleanup: false,
    enablePerformanceTracking: false,
  });
});

afterEach(() => {
  cache.removeAllListeners();
});

describe('invalidate by pattern', () => {
  it('invalidates by tag', () => {
    cache.set('a', 1, { tags: ['red'] });
    cache.set('b', 2, { tags: ['red', 'blue'] });
    cache.set('c', 3, { tags: ['blue'] });

    expect(cache.invalidate({ type: 'tag', pattern: 'red' })).toBe(2);
    expect(cache.get("a")).toBeNull();
    expect(cache.get('c')).toBe(3);
    // tag index bucket for 'blue' survives for the remaining entry
    expect(cache.invalidate({ type: 'tag', pattern: 'blue' })).toBe(1);
  });

  it('invalidates by key prefix', () => {
    cache.set('user:1', 'a');
    cache.set('user:2', 'b');
    cache.set('task:1', 'c');

    expect(cache.invalidate({ type: 'key_prefix', pattern: 'user:' })).toBe(2);
    expect(cache.get('task:1')).toBe('c');
  });

  it('invalidates by key regex', () => {
    cache.set('alpha-1', 'a');
    cache.set('alpha-2', 'b');
    cache.set('beta-1', 'c');

    expect(cache.invalidate({ type: 'key_regex', pattern: /^alpha-/ })).toBe(2);
    expect(cache.get('beta-1')).toBe('c');
  });

  it('invalidates by dependency', () => {
    cache.set('derived:1', 'a', { dependencies: ['source:x'] });
    cache.set('derived:2', 'b', { dependencies: ['source:x', 'source:y'] });
    cache.set('independent', 'c');

    expect(cache.invalidate({ type: 'dependency', pattern: 'source:x' })).toBe(2);
    expect(cache.get('independent')).toBe('c');
    // remaining dependency bucket was cleaned with its entries
    expect(cache.invalidate({ type: 'dependency', pattern: 'source:y' })).toBe(0);
  });

  it('invalidates by time cutoff', () => {
    cache.set('old-ish', 'a');
    cache.set('also-old', 'b');

    const future = new Date(Date.now() + 60_000).toISOString();
    expect(cache.invalidate({ type: 'time_based', pattern: future })).toBe(2);

    cache.set('fresh', 'c');
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(cache.invalidate({ type: 'time_based', pattern: past })).toBe(0);
    expect(cache.get('fresh')).toBe('c');
  });

  it('returns 0 for unknown pattern types and missing buckets', () => {
    cache.set('a', 1);
    expect(cache.invalidate({ type: 'nope' as never, pattern: 'x' })).toBe(0);
    expect(cache.invalidate({ type: 'tag', pattern: 'no-such-tag' })).toBe(0);
    expect(cache.invalidate({ type: 'dependency', pattern: 'no-such-dep' })).toBe(0);
  });
});

describe('index maintenance', () => {
  it('removes keys from tag and dependency indexes on delete', () => {
    cache.set('x', 1, { tags: ['t1'], dependencies: ['d1'] });
    cache.set('y', 2, { tags: ['t1'], dependencies: ['d1'] });

    expect(cache.delete('x')).toBe(true);
    // y is still reachable through both indexes
    expect(cache.invalidate({ type: 'tag', pattern: 't1' })).toBe(1);

    cache.set('z', 3, { tags: ['t2'], dependencies: ['d2'] });
    expect(cache.delete('z')).toBe(true);
    // buckets fully removed once their last key is gone
    expect(cache.invalidate({ type: 'tag', pattern: 't2' })).toBe(0);
    expect(cache.invalidate({ type: 'dependency', pattern: 'd2' })).toBe(0);
    expect(cache.delete('never-set')).toBe(false);
  });
});

describe('optimize', () => {
  it('extends TTL for frequently accessed entries', () => {
    cache.set('hot', 'value');
    for (let i = 0; i < 12; i++) cache.get('hot');
    cache.set('cold', 'value');

    const summary = cache.optimize();

    expect(summary).toBeTypeOf('object');
    expect(cache.get('hot')).toBe('value');
    expect(cache.get('cold')).toBe('value');
  });
});

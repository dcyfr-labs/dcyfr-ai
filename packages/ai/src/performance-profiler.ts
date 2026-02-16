/**
 * Performance Profiler and Optimization Manager
 * TLP:CLEAR
 * 
 * Comprehensive performance profiling, monitoring, and optimization
 * system for DCYFR integration workflows. Provides real-time metrics,
 * bottleneck identification, and automatic optimization recommendations.
 * 
 * @version 1.0.0
 * @date 2026-02-15
 * @module dcyfr-ai/performance-profiler
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

/**
 * Performance metric data point
 */
export interface PerformanceMetric {
  /**
   * Metric identifier
   */
  id: string;
  
  /**
   * Metric name
   */
  name: string;
  
  /**
   * Metric value
   */
  value: number;
  
  /**
   * Measurement unit
   */
  unit: 'ms' | 'bytes' | 'count' | 'percent' | 'ratio';
  
  /**
   * Metric category
   */
  category: 'timing' | 'memory' | 'throughput' | 'resource' | 'error';
  
  /**
   * Measurement timestamp
   */
  timestamp: Date;
  
  /**
   * Context metadata
   */
  context?: Record<string, any>;
}

/**
 * Performance benchmark result
 */
export interface BenchmarkResult {
  /**
   * Benchmark identifier
   */
  benchmarkId: string;
  
  /**
   * Operation being benchmarked
   */
  operation: string;
  
  /**
   * Execution time (milliseconds)
   */
  executionTime: number;
  
  /**
   * Memory usage before operation
   */
  memoryBefore: number;
  
  /**
   * Memory usage after operation
   */
  memoryAfter: number;
  
  /**
   * Memory delta (allocated - deallocated)
   */
  memoryDelta: number;
  
  /**
   * CPU time consumed
   */
  cpuTime?: number;
  
  /**
   * Throughput (operations per second)
   */
  throughput?: number;
  
  /**
   * Operation parameters
   */
  parameters?: Record<string, any>;
  
  /**
   * Benchmark completion timestamp
   */
  completedAt: Date;
}

/**
 * Performance bottleneck identification
 */
export interface PerformanceBottleneck {
  /**
   * Bottleneck identifier
   */
  id: string;
  
  /**
   * Component or operation experiencing bottleneck
   */
  component: string;
  
  /**
   * Bottleneck severity (1-10)
   */
  severity: number;
  
  /**
   * Bottleneck type
   */
  type: 'cpu' | 'memory' | 'io' | 'network' | 'concurrency' | 'algorithm';
  
  /**
   * Current performance vs baseline
   */
  performanceImpact: number;
  
  /**
   * Optimization recommendations
   */
  recommendations: string[];
  
  /**
   * Detection timestamp
   */
  detectedAt: Date;
  
  /**
   * Supporting metrics
   */
  metrics: PerformanceMetric[];
}

/**
 * Performance optimization recommendation
 */
export interface OptimizationRecommendation {
  /**
   * Recommendation identifier
   */
  id: string;
  
  /**
   * Target component or operation
   */
  target: string;
  
  /**
   * Recommendation type
   */
  type: 'caching' | 'batching' | 'parallelization' | 'algorithm' | 'resource' | 'configuration';
  
  /**
   * Recommendation priority (1-10)
   */
  priority: number;
  
  /**
   * Expected performance improvement
   */
  expectedImprovement: {
    metric: string;
    currentValue: number;
    targetValue: number;
    improvementPercent: number;
  };
  
  /**
   * Implementation complexity (1-5)
   */
  complexity: number;
  
  /**
   * Recommendation description
   */
  description: string;
  
  /**
   * Implementation steps
   */
  implementationSteps: string[];
  
  /**
   * Generated timestamp
   */
  generatedAt: Date;
}

/**
 * Performance profiler configuration
 */
export interface PerformanceProfilerConfig {
  /**
   * Enable real-time monitoring
   */
  enableRealTimeMonitoring?: boolean;
  
  /**
   * Monitoring interval (milliseconds)
   */
  monitoringInterval?: number;
  
  /**
   * Enable automatic bottleneck detection
   */
  enableBottleneckDetection?: boolean;
  
  /**
   * Performance baseline configuration
   */
  baselines?: Record<string, number>;
  
  /**
   * Memory profiling configuration
   */
  memoryProfiling?: {
    enabled: boolean;
    sampleInterval: number;
    trackAllocations: boolean;
  };
  
  /**
   * CPU profiling configuration
   */
  cpuProfiling?: {
    enabled: boolean;
    sampleInterval: number;
  };
  
  /**
   * Enable optimization recommendations
   */
  enableOptimizationRecommendations?: boolean;
  
  /**
   * Performance alerts configuration
   */
  alerts?: {
    enabled: boolean;
    thresholds: Record<string, number>;
  };
}

/**
 * Performance Profiler and Optimization Manager
 * 
 * Comprehensive performance monitoring and optimization system providing
 * real-time metrics, bottleneck detection, and optimization recommendations.
 */
export class PerformanceProfiler extends EventEmitter {
  private config: Required<PerformanceProfilerConfig>;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private benchmarks: Map<string, BenchmarkResult[]> = new Map();
  private bottlenecks: Map<string, PerformanceBottleneck> = new Map();
  private recommendations: Map<string, OptimizationRecommendation> = new Map();
  private activeTimers: Map<string, number> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private memoryBaseline: number = 0;

  constructor(config: PerformanceProfilerConfig = {}) {
    super();
    
    this.config = {
      enableRealTimeMonitoring: true,
      monitoringInterval: 5000, // 5 seconds
      enableBottleneckDetection: true,
      baselines: {},
      memoryProfiling: {
        enabled: true,
        sampleInterval: 1000,
        trackAllocations: true,
      },
      cpuProfiling: {
        enabled: true,
        sampleInterval: 100,
      },
      enableOptimizationRecommendations: true,
      alerts: {
        enabled: true,
        thresholds: {
          memoryUsage: 0.8, // 80% of available memory
          cpuUsage: 0.9, // 90% CPU usage
          responseTime: 5000, // 5 second response time
        },
      },
      ...config,
    };

    this.memoryBaseline = this.getMemoryUsage();
    
    if (this.config.enableRealTimeMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * Start performance timer
   */
  startTimer(operation: string): string {
    const timerId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeTimers.set(timerId, performance.now());
    
    this.emit('timer_started', { timerId, operation });
    return timerId;
  }

  /**
   * End performance timer and record metric
   */
  endTimer(timerId: string, context?: Record<string, any>): number {
    const startTime = this.activeTimers.get(timerId);
    if (!startTime) {
      throw new Error(`Timer not found: ${timerId}`);
    }
    
    const endTime = performance.now();
    const executionTime = endTime - startTime;
    
    this.activeTimers.delete(timerId);
    
    const metric: PerformanceMetric = {
      id: `timing-${timerId}`,
      name: timerId.split('-')[0],
      value: executionTime,
      unit: 'ms',
      category: 'timing',
      timestamp: new Date(),
      context,
    };
    
    this.recordMetric(metric);
    this.emit('timer_ended', { timerId, executionTime, context });
    
    return executionTime;
  }

  /**
   * Record performance metric
   */
  recordMetric(metric: PerformanceMetric): void {
    const categoryMetrics = this.metrics.get(metric.category) || [];
    categoryMetrics.push(metric);
    
    // Keep only last 1000 metrics per category for memory efficiency
    if (categoryMetrics.length > 1000) {
      categoryMetrics.splice(0, categoryMetrics.length - 1000);
    }
    
    this.metrics.set(metric.category, categoryMetrics);
    
    // Check for alerts
    if (this.config.alerts.enabled) {
      this.checkPerformanceAlerts(metric);
    }
    
    // Check for bottlenecks
    if (this.config.enableBottleneckDetection) {
      this.detectBottlenecks(metric);
    }
    
    this.emit('metric_recorded', metric);
  }

  /**
   * Run performance benchmark
   */
  async benchmark<T>(
    operation: string,
    fn: () => Promise<T> | T,
    parameters?: Record<string, any>,
    iterations: number = 1
  ): Promise<{ result: T; benchmark: BenchmarkResult }> {
    const benchmarkId = `bench-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let result: T;
    let totalExecutionTime = 0;
    let totalMemoryDelta = 0;
    
    for (let i = 0; i < iterations; i++) {
      const memoryBefore = this.getMemoryUsage();
      const startTime = performance.now();
      
      if (i === 0) {
        // Only capture result from first iteration
        result = await fn();
      } else {
        await fn();
      }
      
      const endTime = performance.now();
      const memoryAfter = this.getMemoryUsage();
      
      totalExecutionTime += endTime - startTime;
      totalMemoryDelta += memoryAfter - memoryBefore;
    }
    
    const avgExecutionTime = totalExecutionTime / iterations;
    const avgMemoryDelta = totalMemoryDelta / iterations;
    const throughput = iterations / (totalExecutionTime / 1000); // ops per second
    
    const benchmark: BenchmarkResult = {
      benchmarkId,
      operation,
      executionTime: avgExecutionTime,
      memoryBefore: this.memoryBaseline,
      memoryAfter: this.getMemoryUsage(),
      memoryDelta: avgMemoryDelta,
      throughput,
      parameters,
      completedAt: new Date(),
    };
    
    // Store benchmark result
    const operationBenchmarks = this.benchmarks.get(operation) || [];
    operationBenchmarks.push(benchmark);
    this.benchmarks.set(operation, operationBenchmarks);
    
    this.emit('benchmark_completed', benchmark);
    return { result: result!, benchmark };
  }

  /**
   * Get current memory usage in bytes
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0; // Browser environment fallback
  }

  /**
   * Start real-time monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.monitoringInterval);
  }

  /**
   * Collect system-wide performance metrics
   */
  private collectSystemMetrics(): void {
    const memoryUsage = this.getMemoryUsage();
    const memoryMetric: PerformanceMetric = {
      id: `memory-${Date.now()}`,
      name: 'memory_usage',
      value: memoryUsage,
      unit: 'bytes',
      category: 'memory',
      timestamp: new Date(),
    };
    
    this.recordMetric(memoryMetric);
    
    // Record active timers count
    const timersMetric: PerformanceMetric = {
      id: `timers-${Date.now()}`,
      name: 'active_timers',
      value: this.activeTimers.size,
      unit: 'count',
      category: 'resource',
      timestamp: new Date(),
    };
    
    this.recordMetric(timersMetric);
  }

  /**
   * Check for performance alerts
   */
  private checkPerformanceAlerts(metric: PerformanceMetric): void {
    const thresholds = this.config.alerts.thresholds;
    
    if (metric.name === 'memory_usage' && metric.unit === 'bytes') {
      const memoryThreshold = thresholds.memoryUsage * (1024 * 1024 * 1024); // Convert to bytes
      if (metric.value > memoryThreshold) {
        this.emit('performance_alert', {
          type: 'memory_exceeded',
          metric,
          threshold: memoryThreshold,
          severity: 'high',
        });
      }
    }
    
    if (metric.category === 'timing' && metric.unit === 'ms') {
      if (metric.value > thresholds.responseTime) {
        this.emit('performance_alert', {
          type: 'slow_response',
          metric,
          threshold: thresholds.responseTime,
          severity: 'medium',
        });
      }
    }
  }

  /**
   * Detect performance bottlenecks
   */
  private detectBottlenecks(metric: PerformanceMetric): void {
    const baseline = this.config.baselines[metric.name];
    if (!baseline) return;
    
    const performanceImpact = (metric.value - baseline) / baseline;
    
    if (performanceImpact > 0.5) { // 50% slower than baseline
      const bottleneck: PerformanceBottleneck = {
        id: `bottleneck-${metric.name}-${Date.now()}`,
        component: metric.name,
        severity: Math.min(10, Math.floor(performanceImpact * 10)),
        type: this.categorizeBottleneckType(metric),
        performanceImpact,
        recommendations: this.generateBottleneckRecommendations(metric, performanceImpact),
        detectedAt: new Date(),
        metrics: [metric],
      };
      
      this.bottlenecks.set(bottleneck.id, bottleneck);
      this.emit('bottleneck_detected', bottleneck);
      
      if (this.config.enableOptimizationRecommendations) {
        this.generateOptimizationRecommendations(bottleneck);
      }
    }
  }

  /**
   * Categorize bottleneck type based on metric
   */
  private categorizeBottleneckType(metric: PerformanceMetric): PerformanceBottleneck['type'] {
    if (metric.category === 'memory') return 'memory';
    if (metric.category === 'timing' && metric.name.includes('network')) return 'network';
    if (metric.category === 'timing' && metric.name.includes('io')) return 'io';
    if (metric.category === 'timing') return 'cpu';
    if (metric.category === 'resource') return 'concurrency';
    return 'algorithm';
  }

  /**
   * Generate bottleneck-specific recommendations
   */
  private generateBottleneckRecommendations(metric: PerformanceMetric, impact: number): string[] {
    const recommendations: string[] = [];
    
    if (metric.category === 'timing') {
      if (impact > 2) {
        recommendations.push('Consider implementing caching for frequently accessed data');
        recommendations.push('Evaluate algorithm complexity and optimize if possible');
      }
      if (impact > 1) {
        recommendations.push('Implement batching for bulk operations');
        recommendations.push('Consider parallelization opportunities');
      }
    }
    
    if (metric.category === 'memory') {
      recommendations.push('Review memory allocation patterns');
      recommendations.push('Implement object pooling for frequently created objects');
      recommendations.push('Add garbage collection optimization');
    }
    
    return recommendations;
  }

  /**
   * Generate optimization recommendations
   */
  private generateOptimizationRecommendations(bottleneck: PerformanceBottleneck): void {
    const recommendation: OptimizationRecommendation = {
      id: `opt-${bottleneck.id}`,
      target: bottleneck.component,
      type: this.getRecommendationType(bottleneck.type),
      priority: bottleneck.severity,
      expectedImprovement: {
        metric: bottleneck.component,
        currentValue: bottleneck.metrics[0]?.value || 0,
        targetValue: (bottleneck.metrics[0]?.value || 0) * (1 - Math.min(0.5, bottleneck.performanceImpact / 2)),
        improvementPercent: Math.min(50, bottleneck.performanceImpact * 50),
      },
      complexity: this.estimateImplementationComplexity(bottleneck.type),
      description: `Optimize ${bottleneck.component} to address ${bottleneck.type} bottleneck`,
      implementationSteps: bottleneck.recommendations,
      generatedAt: new Date(),
    };

    this.recommendations.set(recommendation.id, recommendation);
    this.emit('optimization_recommendation', recommendation);
  }

  /**
   * Get recommendation type based on bottleneck type
   */
  private getRecommendationType(bottleneckType: PerformanceBottleneck['type']): OptimizationRecommendation['type'] {
    const mapping: Record<PerformanceBottleneck['type'], OptimizationRecommendation['type']> = {
      cpu: 'algorithm',
      memory: 'resource',
      io: 'caching',
      network: 'caching',
      concurrency: 'parallelization',
      algorithm: 'algorithm',
    };
    return mapping[bottleneckType] || 'configuration';
  }

  /**
   * Estimate implementation complexity
   */
  private estimateImplementationComplexity(bottleneckType: PerformanceBottleneck['type']): number {
    const complexity: Record<PerformanceBottleneck['type'], number> = {
      cpu: 3,
      memory: 3,
      io: 2,
      network: 2,
      concurrency: 5,
      algorithm: 4,
    };
    return complexity[bottleneckType] || 3;
  }

  /**
   * Get performance metrics summary
   */
  getMetricsSummary(): {
    totalMetrics: number;
    categories: Record<string, number>;
    recentAlerts: number;
    activeBottlenecks: number;
    pendingRecommendations: number;
  } {
    const totalMetrics = Array.from(this.metrics.values()).reduce((sum, metrics) => sum + metrics.length, 0);
    const categories: Record<string, number> = {};
    
    for (const [category, metrics] of this.metrics.entries()) {
      categories[category] = metrics.length;
    }
    
    return {
      totalMetrics,
      categories,
      recentAlerts: 0, // Would track alerts from event emissions
      activeBottlenecks: this.bottlenecks.size,
      pendingRecommendations: this.recommendations.size,
    };
  }

  /**
   * Get benchmark results for operation
   */
  getBenchmarkResults(operation?: string): BenchmarkResult[] {
    if (operation) {
      return this.benchmarks.get(operation) || [];
    }
    
    return Array.from(this.benchmarks.values()).flat();
  }

  /**
   * Get performance bottlenecks
   */
  getBottlenecks(): PerformanceBottleneck[] {
    return Array.from(this.bottlenecks.values());
  }

  /**
   * Get optimization recommendations
   */
  getRecommendations(priorityFilter?: number): OptimizationRecommendation[] {
    const recommendations = Array.from(this.recommendations.values());
    
    if (priorityFilter !== undefined) {
      return recommendations.filter(rec => rec.priority >= priorityFilter);
    }
    
    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Clear performance data
   */
  clearData(categories?: string[]): void {
    if (categories) {
      for (const category of categories) {
        this.metrics.delete(category);
      }
    } else {
      this.metrics.clear();
      this.benchmarks.clear();
      this.bottlenecks.clear();
      this.recommendations.clear();
    }
    
    this.emit('data_cleared', { categories });
  }

  /**
   * Export performance data
   */
  exportData(): {
    metrics: Record<string, PerformanceMetric[]>;
    benchmarks: Record<string, BenchmarkResult[]>;
    bottlenecks: PerformanceBottleneck[];
    recommendations: OptimizationRecommendation[];
    summary: any;
  } {
    return {
      metrics: Object.fromEntries(this.metrics),
      benchmarks: Object.fromEntries(this.benchmarks),
      bottlenecks: Array.from(this.bottlenecks.values()),
      recommendations: Array.from(this.recommendations.values()),
      summary: this.getMetricsSummary(),
    };
  }

  /**
   * Shutdown profiler
   */
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.activeTimers.clear();
    this.removeAllListeners();
    
    this.emit('shutdown_complete');
  }
}

/**
 * Global performance profiler instance
 */
let globalProfiler: PerformanceProfiler | null = null;

/**
 * Get or create global performance profiler instance
 */
export function getGlobalProfiler(config?: PerformanceProfilerConfig): PerformanceProfiler {
  if (!globalProfiler) {
    globalProfiler = new PerformanceProfiler(config);
  }
  return globalProfiler;
}

/**
 * Performance profiling decorator for class methods
 */
export function profileMethod(operation?: string) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const profiler = getGlobalProfiler();
    
    descriptor.value = async function(...args: any[]) {
      const operationName = operation || `${target.constructor.name}.${propertyName}`;
      const timerId = profiler.startTimer(operationName);
      
      try {
        const result = await method.apply(this, args);
        return result;
      } finally {
        profiler.endTimer(timerId, { args: args.length });
      }
    };
    
    return descriptor;
  };
}

/**
 * Performance profiling function wrapper
 */
export async function profileFunction<T>(
  operation: string,
  fn: () => Promise<T> | T,
  profiler?: PerformanceProfiler
): Promise<T> {
  const activeProfiler = profiler || getGlobalProfiler();
  const timerId = activeProfiler.startTimer(operation);
  
  try {
    return await fn();
  } finally {
    activeProfiler.endTimer(timerId);
  }
}

export default PerformanceProfiler;
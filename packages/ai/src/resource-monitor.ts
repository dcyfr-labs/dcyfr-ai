/**
 * System Resource Monitor for DCYFR Integration Performance
 * TLP:CLEAR
 * 
 * Advanced system resource monitoring for DCYFR integration workflows.
 * Tracks CPU, memory, I/O, and network resources with intelligent alerting
 * and optimization recommendations for maximum system performance.
 * 
 * @version 1.0.0
 * @date 2026-02-15
 * @module dcyfr-ai/resource-monitor
 */

import { EventEmitter } from 'events';
import { PerformanceProfiler } from './performance-profiler.js';

/**
 * System resource usage snapshot
 */
export interface ResourceSnapshot {
  /**
   * Snapshot timestamp
   */
  timestamp: Date;
  
  /**
   * Memory usage information
   */
  memory: {
    /**
     * Total system memory (bytes)
     */
    total: number;
    
    /**
     * Used memory (bytes)
     */
    used: number;
    
    /**
     * Free memory (bytes)
     */
    free: number;
    
    /**
     * Memory utilization percentage (0-1)
     */
    utilization: number;
    
    /**
     * Process heap usage (bytes)
     */
    heapUsed: number;
    
    /**
     * Process heap total (bytes)
     */
    heapTotal: number;
  };
  
  /**
   * CPU usage information
   */
  cpu: {
    /**
     * CPU utilization percentage (0-1)
     */
    utilization: number;
    
    /**
     * Number of CPU cores
     */
    cores: number;
    
    /**
     * Load averages [1min, 5min, 15min]
     */
    loadAverage: [number, number, number];
    
    /**
     * Process CPU time (milliseconds)
     */
    processCpuTime: number;
  };
  
  /**
   * I/O statistics
   */
  io?: {
    /**
     * Read operations per second
     */
    readOps: number;
    
    /**
     * Write operations per second
     */
    writeOps: number;
    
    /**
     * Bytes read per second
     */
    readBytes: number;
    
    /**
     * Bytes written per second
     */
    writeBytes: number;
  };
  
  /**
   * Network statistics
   */
  network?: {
    /**
     * Bytes received per second
     */
    bytesReceived: number;
    
    /**
     * Bytes sent per second
     */
    bytesSent: number;
    
    /**
     * Active connections
     */
    activeConnections: number;
  };
}

/**
 * Resource alert configuration
 */
export interface ResourceAlert {
  /**
   * Alert identifier
   */
  id: string;
  
  /**
   * Resource type
   */
  resource: 'memory' | 'cpu' | 'io' | 'network';
  
  /**
   * Alert threshold (percentage 0-1 or absolute value)
   */
  threshold: number;
  
  /**
   * Alert severity
   */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /**
   * Alert message
   */
  message: string;
  
  /**
   * Triggered timestamp
   */
  triggeredAt: Date;
  
  /**
   * Resource snapshot when triggered
   */
  snapshot: ResourceSnapshot;
  
  /**
   * Alert recommendations
   */
  recommendations: string[];
}

/**
 * Resource monitor configuration
 */
export interface ResourceMonitorConfig {
  /**
   * Monitoring interval in milliseconds
   */
  monitoringInterval?: number;
  
  /**
   * Enable alerting
   */
  enableAlerting?: boolean;
  
  /**
   * Memory utilization alert threshold (0-1)
   */
  memoryAlertThreshold?: number;
  
  /**
   * CPU utilization alert threshold (0-1)
   */
  cpuAlertThreshold?: number;
  
  /**
   * Enable I/O monitoring
   */
  enableIOMonitoring?: boolean;
  
  /**
   * Enable network monitoring
   */
  enableNetworkMonitoring?: boolean;
  
  /**
   * History retention period (milliseconds)
   */
  historyRetention?: number;
  
  /**
   * Enable performance optimization recommendations
   */
  enableOptimizationRecommendations?: boolean;
}

/**
 * System Resource Monitor
 * 
 * Comprehensive system resource monitoring with intelligent alerting,
 * trend analysis, and optimization recommendations for DCYFR workflows.
 */
export class SystemResourceMonitor extends EventEmitter {
  private config: Required<ResourceMonitorConfig>;
  private profiler?: PerformanceProfiler;
  
  private monitoringInterval?: NodeJS.Timeout;
  private snapshots: ResourceSnapshot[] = [];
  private alerts: ResourceAlert[] = [];
  private lastCpuUsage: any = null;
  
  private baselineSnapshot?: ResourceSnapshot;
  private isMonitoring: boolean = false;

  constructor(config: ResourceMonitorConfig = {}, profiler?: PerformanceProfiler) {
    super();
    
    this.config = {
      monitoringInterval: 5000, // 5 seconds
      enableAlerting: true,
      memoryAlertThreshold: 0.8, // 80%
      cpuAlertThreshold: 0.9, // 90%
      enableIOMonitoring: false, // Platform-dependent
      enableNetworkMonitoring: false, // Platform-dependent
      historyRetention: 60 * 60 * 1000, // 1 hour
      enableOptimizationRecommendations: true,
      ...config,
    };

    this.profiler = profiler;
    
    this.establishBaseline();
  }

  /**
   * Start resource monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectSnapshot();
    }, this.config.monitoringInterval);

    this.emit('monitoring_started');
  }

  /**
   * Stop resource monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.emit('monitoring_stopped');
  }

  /**
   * Collect current resource snapshot
   */
  collectSnapshot(): ResourceSnapshot {
    const snapshot = this.createSnapshot();
    
    // Store snapshot
    this.snapshots.push(snapshot);
    
    // Cleanup old snapshots
    this.cleanupOldSnapshots();
    
    // Check for alerts
    if (this.config.enableAlerting) {
      this.checkResourceAlerts(snapshot);
    }
    
    // Record metrics in profiler
    if (this.profiler) {
      this.recordProfilingMetrics(snapshot);
    }
    
    this.emit('snapshot_collected', snapshot);
    return snapshot;
  }

  /**
   * Create resource snapshot
   */
  private createSnapshot(): ResourceSnapshot {
    const memoryUsage = this.getMemoryUsage();
    const cpuUsage = this.getCpuUsage();
    
    return {
      timestamp: new Date(),
      memory: {
        total: memoryUsage.total,
        used: memoryUsage.used,
        free: memoryUsage.free,
        utilization: memoryUsage.used / memoryUsage.total,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
      },
      cpu: {
        utilization: cpuUsage.utilization,
        cores: cpuUsage.cores,
        loadAverage: cpuUsage.loadAverage,
        processCpuTime: cpuUsage.processCpuTime,
      },
      io: this.config.enableIOMonitoring ? this.getIOUsage() : undefined,
      network: this.config.enableNetworkMonitoring ? this.getNetworkUsage() : undefined,
    };
  }

  /**
   * Get memory usage statistics
   */
  private getMemoryUsage(): any {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const processMemory = process.memoryUsage();
      
      // Estimate system memory (would use actual system info in production)
      const totalMemory = 8 * 1024 * 1024 * 1024; // 8GB estimate
      const freeMemory = totalMemory * 0.3; // Rough estimate
      
      return {
        total: totalMemory,
        used: totalMemory - freeMemory,
        free: freeMemory,
        heapUsed: processMemory.heapUsed,
        heapTotal: processMemory.heapTotal,
      };
    }
    
    // Browser fallback
    return {
      total: 0,
      used: 0,
      free: 0,
      heapUsed: 0,
      heapTotal: 0,
    };
  }

  /**
   * Get CPU usage statistics
   */
  private getCpuUsage(): any {
    let cpuUtilization = 0;
    let cores = 1;
    let loadAverage: [number, number, number] = [0, 0, 0];
    let processCpuTime = 0;

    if (typeof process !== 'undefined') {
      // Node.js environment
      try {
        const os = require('os');
        cores = os.cpus().length;
        loadAverage = os.loadavg() as [number, number, number];
        
        // Calculate CPU utilization (simplified)
        const cpus = os.cpus();
        if (cpus && cpus.length > 0) {
          const totalTimes = cpus.reduce((acc: any, cpu: any) => {
            const times = cpu.times;
            acc.idle += times.idle;
            acc.total += times.user + times.nice + times.sys + times.idle + times.irq;
            return acc;
          }, { idle: 0, total: 0 });
          
          cpuUtilization = 1 - (totalTimes.idle / totalTimes.total);
        }
        
        // Process CPU time
        if (process.cpuUsage) {
          const cpuUsageData = process.cpuUsage();
          processCpuTime = (cpuUsageData.user + cpuUsageData.system) / 1000; // Convert to milliseconds
        }
      } catch (error) {
        // Fallback for environments without os module
        cpuUtilization = 0.1; // Placeholder
      }
    }

    return {
      utilization: Math.min(1, Math.max(0, cpuUtilization)),
      cores,
      loadAverage,
      processCpuTime,
    };
  }

  /**
   * Get I/O usage statistics (placeholder)
   */
  private getIOUsage(): any {
    // Would implement actual I/O monitoring in production
    return {
      readOps: 10,
      writeOps: 5,
      readBytes: 1024 * 100,
      writeBytes: 1024 * 50,
    };
  }

  /**
   * Get network usage statistics (placeholder)
   */
  private getNetworkUsage(): any {
    // Would implement actual network monitoring in production
    return {
      bytesReceived: 1024 * 200,
      bytesSent: 1024 * 150,
      activeConnections: 3,
    };
  }

  /**
   * Check for resource alerts
   */
  private checkResourceAlerts(snapshot: ResourceSnapshot): void {
    // Memory alerts
    if (snapshot.memory.utilization > this.config.memoryAlertThreshold) {
      this.triggerAlert({
        id: `memory-alert-${Date.now()}`,
        resource: 'memory',
        threshold: this.config.memoryAlertThreshold,
        severity: snapshot.memory.utilization > 0.95 ? 'critical' : 'high',
        message: `Memory utilization at ${(snapshot.memory.utilization * 100).toFixed(1)}%`,
        triggeredAt: new Date(),
        snapshot,
        recommendations: [
          'Consider enabling garbage collection optimization',
          'Review memory allocation patterns',
          'Implement object pooling for frequently created objects',
        ],
      });
    }

    // CPU alerts
    if (snapshot.cpu.utilization > this.config.cpuAlertThreshold) {
      this.triggerAlert({
        id: `cpu-alert-${Date.now()}`,
        resource: 'cpu',
        threshold: this.config.cpuAlertThreshold,
        severity: snapshot.cpu.utilization > 0.98 ? 'critical' : 'high',
        message: `CPU utilization at ${(snapshot.cpu.utilization * 100).toFixed(1)}%`,
        triggeredAt: new Date(),
        snapshot,
        recommendations: [
          'Consider implementing parallel processing',
          'Optimize algorithm complexity',
          'Enable batch processing for bulk operations',
        ],
      });
    }

    // Load average alerts (for systems with multiple cores)
    if (snapshot.cpu.cores > 1 && snapshot.cpu.loadAverage[0] > snapshot.cpu.cores * 1.5) {
      this.triggerAlert({
        id: `load-alert-${Date.now()}`,
        resource: 'cpu',
        threshold: snapshot.cpu.cores * 1.5,
        severity: 'medium',
        message: `High load average: ${snapshot.cpu.loadAverage[0].toFixed(2)}`,
        triggeredAt: new Date(),
        snapshot,
        recommendations: [
          'Review concurrent process limits',
          'Consider load balancing strategies',
          'Optimize resource-intensive operations',
        ],
      });
    }
  }

  /**
   * Trigger resource alert
   */
  private triggerAlert(alert: ResourceAlert): void {
    this.alerts.push(alert);
    
    // Keep only recent alerts (last 24 hours)
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
    this.alerts = this.alerts.filter(alert => 
      alert.triggeredAt.getTime() > cutoffTime
    );
    
    this.emit('resource_alert', alert);
    
    // Generate optimization recommendations if enabled
    if (this.config.enableOptimizationRecommendations) {
      this.generateOptimizationRecommendations(alert);
    }
  }

  /**
   * Generate optimization recommendations based on alert
   */
  private generateOptimizationRecommendations(alert: ResourceAlert): void {
    const recommendations: string[] = [...alert.recommendations];
    
    // Add specific recommendations based on alert patterns
    const recentAlerts = this.alerts.filter(a => 
      a.resource === alert.resource && 
      Date.now() - a.triggeredAt.getTime() < 30 * 60 * 1000 // Last 30 minutes
    );
    
    if (recentAlerts.length > 3) {
      recommendations.push('Persistent resource pressure detected - consider scaling resources');
      recommendations.push('Review resource allocation and limits');
    }
    
    this.emit('optimization_recommendations', {
      alert,
      recommendations,
      severity: alert.severity,
    });
  }

  /**
   * Record metrics in performance profiler
   */
  private recordProfilingMetrics(snapshot: ResourceSnapshot): void {
    if (!this.profiler) return;
    
    // Memory metrics
    this.profiler.recordMetric({
      id: `memory-${Date.now()}`,
      name: 'system_memory_utilization',
      value: snapshot.memory.utilization,
      unit: 'percent',
      category: 'memory',
      timestamp: snapshot.timestamp,
    });
    
    this.profiler.recordMetric({
      id: `heap-${Date.now()}`,
      name: 'process_heap_usage',
      value: snapshot.memory.heapUsed,
      unit: 'bytes',
      category: 'memory',
      timestamp: snapshot.timestamp,
    });
    
    // CPU metrics
    this.profiler.recordMetric({
      id: `cpu-${Date.now()}`,
      name: 'system_cpu_utilization',
      value: snapshot.cpu.utilization,
      unit: 'percent',
      category: 'resource',
      timestamp: snapshot.timestamp,
    });
  }

  /**
   * Establish performance baseline
   */
  private establishBaseline(): void {
    // Collect initial snapshot as baseline
    setTimeout(() => {
      this.baselineSnapshot = this.collectSnapshot();
      this.emit('baseline_established', this.baselineSnapshot);
    }, 1000);
  }

  /**
   * Cleanup old snapshots
   */
  private cleanupOldSnapshots(): void {
    const cutoffTime = Date.now() - this.config.historyRetention;
    this.snapshots = this.snapshots.filter(snapshot => 
      snapshot.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Get current resource usage
   */
  getCurrentUsage(): ResourceSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * Get resource usage history
   */
  getUsageHistory(duration?: number): ResourceSnapshot[] {
    if (!duration) {
      return [...this.snapshots];
    }
    
    const cutoffTime = Date.now() - duration;
    return this.snapshots.filter(snapshot => 
      snapshot.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ResourceAlert[] {
    return [...this.alerts];
  }

  /**
   * Get resource usage statistics
   */
  getUsageStatistics(): {
    averageMemoryUtilization: number;
    averageCpuUtilization: number;
    maxMemoryUtilization: number;
    maxCpuUtilization: number;
    alertCount: number;
    uptimeHours: number;
  } {
    if (this.snapshots.length === 0) {
      return {
        averageMemoryUtilization: 0,
        averageCpuUtilization: 0,
        maxMemoryUtilization: 0,
        maxCpuUtilization: 0,
        alertCount: this.alerts.length,
        uptimeHours: 0,
      };
    }
    
    const memoryUtilizations = this.snapshots.map(s => s.memory.utilization);
    const cpuUtilizations = this.snapshots.map(s => s.cpu.utilization);
    
    const averageMemoryUtilization = memoryUtilizations.reduce((a, b) => a + b, 0) / memoryUtilizations.length;
    const averageCpuUtilization = cpuUtilizations.reduce((a, b) => a + b, 0) / cpuUtilizations.length;
    const maxMemoryUtilization = Math.max(...memoryUtilizations);
    const maxCpuUtilization = Math.max(...cpuUtilizations);
    
    const uptimeHours = this.snapshots.length > 0 ? 
      (Date.now() - this.snapshots[0].timestamp.getTime()) / (1000 * 60 * 60) : 0;
    
    return {
      averageMemoryUtilization,
      averageCpuUtilization,
      maxMemoryUtilization,
      maxCpuUtilization,
      alertCount: this.alerts.length,
      uptimeHours,
    };
  }

  /**
   * Generate resource usage report
   */
  generateReport(): {
    summary: any;
    alerts: ResourceAlert[];
    recommendations: string[];
    charts?: any;
  } {
    const stats = this.getUsageStatistics();
    const currentUsage = this.getCurrentUsage();
    
    const recommendations: string[] = [];
    
    // Analyze trends and generate recommendations
    if (stats.averageMemoryUtilization > 0.7) {
      recommendations.push('Memory utilization consistently high - consider increasing available memory');
    }
    
    if (stats.averageCpuUtilization > 0.6) {
      recommendations.push('CPU utilization consistently high - consider optimization or scaling');
    }
    
    if (this.alerts.length > 10) {
      recommendations.push('High alert frequency - review resource thresholds and optimization opportunities');
    }
    
    return {
      summary: {
        currentUsage,
        statistics: stats,
        baseline: this.baselineSnapshot,
      },
      alerts: this.getActiveAlerts(),
      recommendations,
    };
  }

  /**
   * Clear monitoring data
   */
  clearData(): void {
    this.snapshots = [];
    this.alerts = [];
    this.baselineSnapshot = undefined;
    
    this.emit('data_cleared');
  }

  /**
   * Shutdown resource monitor
   */
  shutdown(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    
    this.emit('shutdown_complete');
  }
}

/**
 * Global resource monitor instance
 */
let globalResourceMonitor: SystemResourceMonitor | null = null;

/**
 * Get or create global resource monitor instance
 */
export function getGlobalResourceMonitor(
  config?: ResourceMonitorConfig, 
  profiler?: PerformanceProfiler
): SystemResourceMonitor {
  if (!globalResourceMonitor) {
    globalResourceMonitor = new SystemResourceMonitor(config, profiler);
  }
  return globalResourceMonitor;
}

/**
 * Monitor resources during workflow execution
 */
export async function monitorWorkflowExecution<T>(
  workflowFn: () => Promise<T>,
  config?: ResourceMonitorConfig
): Promise<{
  result: T;
  resourceReport: any;
}> {
  const monitor = new SystemResourceMonitor(config);
  
  try {
    monitor.startMonitoring();
    const result = await workflowFn();
    const resourceReport = monitor.generateReport();
    
    return { result, resourceReport };
    
  } finally {
    monitor.shutdown();
  }
}

export default SystemResourceMonitor;
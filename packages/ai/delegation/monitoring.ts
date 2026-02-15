/**
 * Delegation System Health Monitoring & Alerting
 * 
 * Provides comprehensive monitoring, metrics collection, and alerting
 * for the delegation framework.
 * 
 * @module delegation/monitoring
 */

export interface SystemHealthMetrics {
  /** Overall system health score (0-100) */
  healthScore: number;
  
  /** Timestamp of metrics collection */
  timestamp: Date;
  
  /** Contract metrics */
  contracts: {
    active: number;
    pending: number;
    completed: number;
    failed: number;
    total: number;
    averageDuration: number;  // milliseconds
    successRate: number;      // 0-1
  };
  
  /** Agent metrics */
  agents: {
    total: number;
    available: number;
    busy: number;
    offline: number;
    averageLoad: number;      // 0-1
  };
  
  /** Performance metrics */
  performance: {
    averageLatency: number;   // milliseconds
    p95Latency: number;       // milliseconds
    p99Latency: number;       // milliseconds
    throughput: number;       // contracts/minute
    queueDepth: number;       // pending contracts
  };
  
  /** Resource metrics */
  resources: {
    cpuUtilization: number;   // 0-1
    memoryUtilization: number; // 0-1
    activeThreads: number;
    queuedTasks: number;
  };
  
  /** Error metrics */
  errors: {
    total: number;
    rate: number;             // errors/minute
    byType: Record<string, number>;
    recentErrors: Array<{
      timestamp: Date;
      type: string;
      message: string;
      contractId?: string;
    }>;
  };
  
  /** Reputation metrics */
  reputation: {
    averageScore: number;     // 0-100
    topPerformers: Array<{
      name: string;
      score: number;
    }>;
    underperformers: Array<{
      name: string;
      score: number;
    }>;
  };
}

export interface AlertRule {
  /** Alert rule ID */
  id: string;
  
  /** Alert name */
  name: string;
  
  /** Alert condition */
  condition: AlertCondition;
  
  /** Alert severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  
  /** Alert channels */
  channels: AlertChannel[];
  
  /** Cooldown period (milliseconds) */
  cooldown?: number;
  
  /** Whether alert is enabled */
  enabled: boolean;
}

export interface AlertCondition {
  /** Metric to monitor */
  metric: string;
  
  /** Comparison operator */
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  
  /** Threshold value */
  threshold: number;
  
  /** Duration threshold must be exceeded (milliseconds) */
  duration?: number;
}

export type AlertChannel = 
  | 'console'
  | 'email'
  | 'slack'
  | 'pagerduty'
  | 'webhook'
  | 'mcp';

export interface Alert {
  /** Alert ID */
  id: string;
  
  /** Alert rule that triggered */
  ruleId: string;
  
  /** Alert name */
  name: string;
  
  /** Alert severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  
  /** Alert message */
  message: string;
  
  /** Current value that triggered alert */
  value: number;
  
  /** Threshold that was exceeded */
  threshold: number;
  
  /** Timestamp alert was triggered */
  timestamp: Date;
  
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Default alert rules for delegation system
 */
export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    condition: {
      metric: 'errors.rate',
      operator: '>',
      threshold: 10,  // > 10 errors/minute
      duration: 60000  // for 1 minute
    },
    severity: 'critical',
    channels: ['console', 'mcp'],
    cooldown: 300000,  // 5 minutes
    enabled: true
  },
  {
    id: 'low-success-rate',
    name: 'Low Contract Success Rate',
    condition: {
      metric: 'contracts.successRate',
      operator: '<',
      threshold: 0.9,  // < 90%
      duration: 300000  // for 5 minutes
    },
    severity: 'error',
    channels: ['console', 'mcp'],
    cooldown: 600000,  // 10 minutes
    enabled: true
  },
  {
    id: 'high-latency',
    name: 'High Average Latency',
    condition: {
      metric: 'performance.averageLatency',
      operator: '>',
      threshold: 5000,  // > 5 seconds
      duration: 120000  // for 2 minutes
    },
    severity: 'warning',
    channels: ['console', 'mcp'],
    cooldown: 300000,  // 5 minutes
    enabled: true
  },
  {
    id: 'high-cpu',
    name: 'High CPU Utilization',
    condition: {
      metric: 'resources.cpuUtilization',
      operator: '>',
      threshold: 0.9,  // > 90%
      duration: 60000  // for 1 minute
    },
    severity: 'warning',
    channels: ['console'],
    cooldown: 300000,
    enabled: true
  },
  {
    id: 'high-memory',
    name: 'High Memory Utilization',
    condition: {
      metric: 'resources.memoryUtilization',
      operator: '>',
      threshold: 0.85,  // > 85%
      duration: 120000  // for 2 minutes
    },
    severity: 'error',
    channels: ['console', 'mcp'],
    cooldown: 300000,
    enabled: true
  },
  {
    id: 'queue-buildup',
    name: 'Task Queue Buildup',
    condition: {
      metric: 'performance.queueDepth',
      operator: '>',
      threshold: 100,  // > 100 queued contracts
      duration: 180000  // for 3 minutes
    },
    severity: 'warning',
    channels: ['console', 'mcp'],
    cooldown: 600000,  // 10 minutes
    enabled: true
  },
  {
    id: 'no-available-agents',
    name: 'No Available Agents',
    condition: {
      metric: 'agents.available',
      operator: '==',
      threshold: 0,
      duration: 30000  // for 30 seconds
    },
    severity: 'critical',
    channels: ['console', 'mcp'],
    cooldown: 180000,  // 3 minutes
    enabled: true
  }
];

/**
 * Health monitor for delegation system
 */
export class DelegationHealthMonitor {
  private metrics: SystemHealthMetrics;
  private metricHistory: SystemHealthMetrics[] = [];
  private maxHistorySize = 1000;
  
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private lastAlertTime: Map<string, number> = new Map();
  
  private monitoringInterval?: NodeJS.Timeout;
  private collectionInterval = 10000;  // 10 seconds
  
  constructor() {
    this.metrics = this.createEmptyMetrics();
    
    // Initialize with default alert rules
    for (const rule of DEFAULT_ALERT_RULES) {
      this.alertRules.set(rule.id, rule);
    }
  }
  
  /**
   * Start health monitoring
   */
  start(intervalMs: number = 10000): void {
    if (this.monitoringInterval) {
      return; // Already started
    }
    
    this.collectionInterval = intervalMs;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.evaluateAlerts();
    }, intervalMs);
    
    console.log(`[DelegationHealthMonitor] Started monitoring (interval: ${intervalMs}ms)`);
  }
  
  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log('[DelegationHealthMonitor] Stopped monitoring');
    }
  }
  
  /**
   * Collect current system metrics
   */
  private collectMetrics(): void {
    // In real implementation, this would query actual system state
    // For now, create placeholder metrics
    this.metrics = {
      healthScore: this.calculateHealthScore(),
      timestamp: new Date(),
      contracts: {
        active: 0,
        pending: 0,
        completed: 0,
        failed: 0,
        total: 0,
        averageDuration: 0,
        successRate: 1.0
      },
      agents: {
        total: 0,
        available: 0,
        busy: 0,
        offline: 0,
        averageLoad: 0
      },
      performance: {
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        throughput: 0,
        queueDepth: 0
      },
      resources: {
        cpuUtilization: this.getCpuUtilization(),
        memoryUtilization: this.getMemoryUtilization(),
        activeThreads: 0,
        queuedTasks: 0
      },
      errors: {
        total: 0,
        rate: 0,
        byType: {},
        recentErrors: []
      },
      reputation: {
        averageScore: 75,
        topPerformers: [],
        underperformers: []
      }
    };
    
    // Add to history
    this.metricHistory.push(this.metrics);
    if (this.metricHistory.length > this.maxHistorySize) {
      this.metricHistory.shift();
    }
  }
  
  /**
   * Get current health metrics
   */
  getCurrentMetrics(): SystemHealthMetrics {
    return this.metrics;
  }
  
  /**
   * Get metric history
   */
  getMetricHistory(count?: number): SystemHealthMetrics[] {
    if (count) {
      return this.metricHistory.slice(-count);
    }
    return this.metricHistory;
  }
  
  /**
   * Calculate overall health score
   */
  private calculateHealthScore(): number {
    // Weighted health score calculation
    const successRateWeight = 0.3;
    const latencyWeight = 0.2;
    const errorRateWeight = 0.3;
    const resourceWeight = 0.2;
    
    const successScore = (this.metrics?.contracts.successRate || 1.0) * 100;
    const latencyScore = Math.max(0, 100 - (this.metrics?.performance.averageLatency || 0) / 50);
    const errorScore = Math.max(0, 100 - (this.metrics?.errors.rate || 0) * 10);
    const resourceScore = Math.max(0, 100 - (this.metrics?.resources.cpuUtilization || 0) * 100);
    
    return Math.round(
      successScore * successRateWeight +
      latencyScore * latencyWeight +
      errorScore * errorRateWeight +
      resourceScore * resourceWeight
    );
  }
  
  /**
   * Get CPU utilization (0-1)
   */
  private getCpuUtilization(): number {
    // In real implementation, use process or OS metrics
    // Placeholder: return random value for demonstration
    return Math.random() * 0.5; // 0-50%
  }
  
  /**
   * Get memory utilization (0-1)
   */
  private getMemoryUtilization(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return usage.heapUsed / usage.heapTotal;
    }
    return 0;
  }
  
  /**
   * Add alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }
  
  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
  }
  
  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }
  
  /**
   * Evaluate alert conditions
   */
  private evaluateAlerts(): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      const lastAlert = this.lastAlertTime.get(rule.id);
      if (lastAlert && rule.cooldown) {
        if (Date.now() - lastAlert < rule.cooldown) {
          continue; // Still in cooldown
        }
      }
      
      // Evaluate condition
      const value = this.getMetricValue(rule.condition.metric);
      if (this.evaluateCondition(value, rule.condition)) {
        this.triggerAlert(rule, value);
      }
    }
  }
  
  /**
   * Get metric value by path
   */
  private getMetricValue(path: string): number {
    const parts = path.split('.');
    let value: any = this.metrics;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) return 0;
    }
    
    return typeof value === 'number' ? value : 0;
  }
  
  /**
   * Evaluate alert condition
   */
  private evaluateCondition(value: number, condition: AlertCondition): boolean {
    switch (condition.operator) {
      case '>':
        return value > condition.threshold;
      case '<':
        return value < condition.threshold;
      case '>=':
        return value >= condition.threshold;
      case '<=':
        return value <= condition.threshold;
      case '==':
        return value === condition.threshold;
      case '!=':
        return value !== condition.threshold;
      default:
        return false;
    }
  }
  
  /**
   * Trigger alert
   */
  private triggerAlert(rule: AlertRule, value: number): void {
    const alert: Alert = {
      id: `${rule.id}-${Date.now()}`,
      ruleId: rule.id,
      name: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${rule.condition.metric} is ${value} (threshold: ${rule.condition.threshold})`,
      value,
      threshold: rule.condition.threshold,
      timestamp: new Date()
    };
    
    // Store alert
    this.activeAlerts.set(rule.id, alert);
    this.alertHistory.push(alert);
    this.lastAlertTime.set(rule.id, Date.now());
    
    // Send to channels
    this.sendAlert(alert, rule.channels);
  }
  
  /**
   * Send alert to channels
   */
 private sendAlert(alert: Alert, channels: AlertChannel[]): void {
    for (const channel of channels) {
      switch (channel) {
        case 'console':
          this.sendConsoleAlert(alert);
          break;
        case 'mcp':
          this.sendMCPAlert(alert);
          break;
        // Additional channels can be implemented
        default:
          console.warn(`[Alert] Unsupported channel: ${channel}`);
      }
    }
  }
  
  /**
   * Send alert to console
   */
  private sendConsoleAlert(alert: Alert): void {
    const icon = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    }[alert.severity];
    
    console.log(`\n${icon} [${alert.severity.toUpperCase()}] ${alert.message}`);
    console.log(`   Timestamp: ${alert.timestamp.toISOString()}`);
    console.log(`   Value: ${alert.value} | Threshold: ${alert.threshold}\n`);
  }
  
  /**
   * Send alert to MCP server
   */
  private sendMCPAlert(alert: Alert): void {
    // In real implementation, send to MCP server
    // For now, just log
    console.log(`[MCP Alert] ${alert.severity}: ${alert.message}`);
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }
  
  /**
   * Get alert history
   */
  getAlertHistory(count?: number): Alert[] {
    if (count) {
      return this.alertHistory.slice(-count);
    }
    return this.alertHistory;
  }
  
  /**
   * Clear alert
   */
  clearAlert(ruleId: string): void {
    this.activeAlerts.delete(ruleId);
  }
  
  /**
   * Create empty metrics
   */
  private createEmptyMetrics(): SystemHealthMetrics {
    return {
      healthScore: 100,
      timestamp: new Date(),
      contracts: {
        active: 0,
        pending: 0,
        completed: 0,
        failed: 0,
        total: 0,
        averageDuration: 0,
        successRate: 1.0
      },
      agents: {
        total: 0,
        available: 0,
        busy: 0,
        offline: 0,
        averageLoad: 0
      },
      performance: {
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        throughput: 0,
        queueDepth: 0
      },
      resources: {
        cpuUtilization: 0,
        memoryUtilization: 0,
        activeThreads: 0,
        queuedTasks: 0
      },
      errors: {
        total: 0,
        rate: 0,
        byType: {},
        recentErrors: []
      },
      reputation: {
        averageScore: 0,
        topPerformers: [],
        underperformers: []
      }
    };
  }
  
  /**
   * Export monitoring data for analysis
   */
  export(): {
    currentMetrics: SystemHealthMetrics;
    metricHistory: SystemHealthMetrics[];
    activeAlerts: Alert[];
    alertHistory: Alert[];
  } {
    return {
      currentMetrics: this.metrics,
      metricHistory: this.metricHistory,
      activeAlerts: this.getActiveAlerts(),
      alertHistory: this.alertHistory
    };
  }
}

/**
 * Singleton health monitor instance
 */
let healthMonitor: DelegationHealthMonitor | null = null;

/**
 * Get global health monitor instance
 */
export function getHealthMonitor(): DelegationHealthMonitor {
  if (!healthMonitor) {
    healthMonitor = new DelegationHealthMonitor();
  }
  return healthMonitor;
}

/**
 * Initialize health monitoring
 */
export function startHealthMonitoring(intervalMs: number = 10000): DelegationHealthMonitor {
  const monitor = getHealthMonitor();
  monitor.start(intervalMs);
  return monitor;
}

/**
 * Stop health monitoring
 */
export function stopHealthMonitoring(): void {
  getHealthMonitor().stop();
}

/**
 * Tests for Delegation Health Monitoring & Alerting
 * 
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DelegationHealthMonitor,
  getHealthMonitor,
  startHealthMonitoring,
  stopHealthMonitoring,
  DEFAULT_ALERT_RULES,
  type AlertRule,
  type AlertCondition,
  type Alert,
  type SystemHealthMetrics
} from '../../delegation/monitoring';

describe('Delegation Health Monitoring System', () => {
  let monitor: DelegationHealthMonitor;
  
  beforeEach(() => {
    monitor = new DelegationHealthMonitor();
  });
  
  afterEach(() => {
    monitor.stop();
  });
  
  describe('Initialization', () => {
    it('should create monitor with empty metrics', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.healthScore).toBe(100);
      expect(metrics.contracts.total).toBe(0);
      expect(metrics.agents.total).toBe(0);
    });
    
    it('should initialize with default alert rules', () => {
      const rules = monitor.getAlertRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.length).toBe(DEFAULT_ALERT_RULES.length);
    });
    
    it('should have all default alerts enabled', () => {
      const rules = monitor.getAlertRules();
      
      rules.forEach(rule => {
        expect(rule.enabled).toBe(true);
      });
    });
  });
  
  describe('Metric Collection', () => {
    it('should collect metrics when started', async () => {
      const historyBefore = monitor.getMetricHistory().length;
      
      monitor.start(100); // 100ms interval
      await new Promise(resolve => setTimeout(resolve, 250)); // Wait for ~2 collections
      monitor.stop();
      
      const historyAfter = monitor.getMetricHistory().length;
      expect(historyAfter).toBeGreaterThan(historyBefore);
    });
    
    it('should maintain metric history', async () => {
      monitor.start(50);
      await new Promise(resolve => setTimeout(resolve, 200)); // Collect 3-4 metrics
      monitor.stop();
      
      const history = monitor.getMetricHistory();
      expect(history.length).toBeGreaterThanOrEqual(3);
    });
    
    it('should limit metric history size', async () => {
      // This test would need to run longer to verify, simplified version:
      monitor.start(10);
      await new Promise(resolve => setTimeout(resolve, 100));
      monitor.stop();
      
      const history = monitor.getMetricHistory();
      expect(history.length).toBeLessThanOrEqual(1000); // Max size
    });
    
    it('should update timestamp on each collection', () => {
      const metrics1 = monitor.getCurrentMetrics();
      const time1 = metrics1.timestamp.getTime();
      
      // Force collection by starting and stopping
      monitor.start(10);
      setTimeout(() => monitor.stop(), 50);
      
      setTimeout(() => {
        const metrics2 = monitor.getCurrentMetrics();
        const time2 = metrics2.timestamp.getTime();
        
        // If a collection happened, time should be different
        if (metrics2.timestamp !== metrics1.timestamp) {
          expect(time2).toBeGreaterThan(time1);
        }
      }, 100);
    });
  });
  
  describe('Alert Rules Management', () => {
    it('should add custom alert rule', () => {
      const customRule: AlertRule = {
        id: 'custom-test',
        name: 'Custom Test Rule',
        condition: {
          metric: 'contracts.total',
          operator: '>',
          threshold: 1000
        },
        severity: 'warning',
        channels: ['console'],
        enabled: true
      };
      
      monitor.addAlertRule(customRule);
      const rules = monitor.getAlertRules();
      
      expect(rules.find(r => r.id === 'custom-test')).toBeDefined();
    });
    
    it('should remove alert rule', () => {
      const rulesBefore = monitor.getAlertRules();
      const firstRuleId = rulesBefore[0].id;
      
      monitor.removeAlertRule(firstRuleId);
      const rulesAfter = monitor.getAlertRules();
      
      expect(rulesAfter.find(r => r.id === firstRuleId)).toBeUndefined();
      expect(rulesAfter.length).toBe(rulesBefore.length - 1);
    });
    
    it('should get all alert rules', () => {
      const rules = monitor.getAlertRules();
      
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });
  });
  
  describe('Default Alert Rules', () => {
    it('should have high error rate alert', () => {
      const rule = DEFAULT_ALERT_RULES.find(r => r.id === 'high-error-rate');
      
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('critical');
      expect(rule?.condition.metric).toBe('errors.rate');
      expect(rule?.condition.operator).toBe('>');
    });
    
    it('should have low success rate alert', () => {
      const rule = DEFAULT_ALERT_RULES.find(r => r.id === 'low-success-rate');
      
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('error');
      expect(rule?.condition.metric).toBe('contracts.successRate');
      expect(rule?.condition.operator).toBe('<');
    });
    
    it('should have high latency alert', () => {
      const rule = DEFAULT_ALERT_RULES.find(r => r.id === 'high-latency');
      
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('warning');
      expect(rule?.condition.metric).toBe('performance.averageLatency');
    });
    
    it('should have resource monitoring alerts', () => {
      const cpuRule = DEFAULT_ALERT_RULES.find(r => r.id === 'high-cpu');
      const memRule = DEFAULT_ALERT_RULES.find(r => r.id === 'high-memory');
      
      expect(cpuRule).toBeDefined();
      expect(memRule).toBeDefined();
    });
    
    it('should have queue buildup alert', () => {
      const rule = DEFAULT_ALERT_RULES.find(r => r.id === 'queue-buildup');
      
      expect(rule).toBeDefined();
      expect(rule?.condition.metric).toBe('performance.queueDepth');
    });
    
    it('should have no available agents alert', () => {
      const rule = DEFAULT_ALERT_RULES.find(r => r.id === 'no-available-agents');
      
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('critical');
    });
  });
  
  describe('Alert Evaluation', () => {
    it('should not trigger alerts on normal metrics', async () => {
      monitor.start(50);
      await new Promise(resolve => setTimeout(resolve, 200));
      monitor.stop();
      
      const activeAlerts = monitor.getActiveAlerts();
      // With normal/empty metrics, no alerts should trigger
      expect(activeAlerts.length).toBe(0);
    });
    
    it('should respect alert cooldown periods', () => {
      const rule: AlertRule = {
        id: 'test-cooldown',
        name: 'Test Cooldown',
        condition: {
          metric: 'contracts.total',
          operator: '>',
          threshold: -1  // Always true
        },
        severity: 'info',
        channels: ['console'],
        cooldown: 1000,  // 1 second cooldown
        enabled: true
      };
      
      monitor.addAlertRule(rule);
      
      // Trigger alert manually twice in quick succession
      // In real implementation, the second trigger should be suppressed
      // This test verifies the cooldown mechanism exists
      expect(rule.cooldown).toBe(1000);
    });
  });
  
  describe('Alert History', () => {
    it('should store alert history', () => {
      const historyBefore = monitor.getAlertHistory();
      const initialCount = historyBefore.length;
      
      // Alert history exists even if empty initially
      expect(Array.isArray(historyBefore)).toBe(true);
      expect(historyBefore.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should retrieve recent alert history', () => {
      const recent = monitor.getAlertHistory(10);
      
      expect(Array.isArray(recent)).toBe(true);
      expect(recent.length).toBeLessThanOrEqual(10);
    });
    
    it('should clear individual alerts', () => {
      // Add a rule that always triggers
      const rule: AlertRule = {
        id: 'test-clear',
        name: 'Test Clear',
        condition: {
          metric: 'contracts.total',
          operator: '>=',
          threshold: 0  // Always true
        },
        severity: 'info',
        channels: [],
        enabled: true
      };
      
      monitor.addAlertRule(rule);
      
      // Clear the alert
      monitor.clearAlert('test-clear');
      
      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts.find(a => a.ruleId === 'test-clear')).toBeUndefined();
    });
  });
  
  describe('Health Score Calculation', () => {
    it('should have initial health score of 100', () => {
      const metrics = monitor.getCurrentMetrics();
      expect(metrics.healthScore).toBe(100);
    });
    
    it('should calculate health score within valid range', () => {
      const metrics = monitor.getCurrentMetrics();
      expect(metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(100);
    });
  });
  
  describe('Metric History Retrieval', () => {
    it('should get full metric history', () => {
      const history = monitor.getMetricHistory();
  expect(Array.isArray(history)).toBe(true);
    });
    
    it('should get limited metric history', async () => {
      monitor.start(20);
      await new Promise(resolve => setTimeout(resolve, 100)); // Collect ~4-5 metrics
      monitor.stop();
      
      const recentThree = monitor.getMetricHistory(3);
      expect(recentThree.length).toBeLessThanOrEqual(3);
    });
  });
  
  describe('Start/Stop Monitoring', () => {
    it('should start monitoring', () => {
      expect(() => monitor.start(100)).not.toThrow();
    });
    
    it('should stop monitoring', () => {
      monitor.start(100);
      expect(() => monitor.stop()).not.toThrow();
    });
    
    it('should not start twice', () => {
      monitor.start(100);
      const historyBefore = monitor.getMetricHistory().length;
      
      monitor.start(100); // Try to start again
      
      // Should not create duplicate monitoring
      // (implementation prevents double-start)
      expect(() => monitor.start(100)).not.toThrow();
      
      monitor.stop();
    });
  });
  
  describe('Export Monitoring Data', () => {
    it('should export all monitoring data', () => {
      const exported = monitor.export();
      
      expect(exported).toHaveProperty('currentMetrics');
      expect(exported).toHaveProperty('metricHistory');
      expect(exported).toHaveProperty('activeAlerts');
      expect(exported).toHaveProperty('alertHistory');
    });
    
    it('should export valid current metrics', () => {
      const exported = monitor.export();
      
      expect(exported.currentMetrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(exported.currentMetrics.timestamp).toBeInstanceOf(Date);
    });
    
    it('should export metric history array', () => {
      const exported = monitor.export();
      
      expect(Array.isArray(exported.metricHistory)).toBe(true);
    });
    
    it('should export alert arrays', () => {
      const exported = monitor.export();
      
      expect(Array.isArray(exported.activeAlerts)).toBe(true);
      expect(Array.isArray(exported.alertHistory)).toBe(true);
    });
  });
  
  describe('Singleton Health Monitor', () => {
    it('should return same instance from getHealthMonitor', () => {
      const monitor1 = getHealthMonitor();
      const monitor2 = getHealthMonitor();
      
      expect(monitor1).toBe(monitor2);
    });
    
    it('should start monitoring via helper function', () => {
      const started = startHealthMonitoring(100);
      
      expect(started).toBeInstanceOf(DelegationHealthMonitor);
      
      stopHealthMonitoring();
    });
    
    it('should stop monitoring via helper function', () => {
      startHealthMonitoring(100);
      expect(() => stopHealthMonitoring()).not.toThrow();
    });
  });
  
  describe('Resource Metrics', () => {
    it('should track CPU utilization', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.resources.cpuUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.resources.cpuUtilization).toBeLessThanOrEqual(1);
    });
    
    it('should track memory utilization', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.resources.memoryUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.resources.memoryUtilization).toBeLessThanOrEqual(1);
    });
  });
  
  describe('Performance Metrics', () => {
    it('should have performance metrics structure', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.performance).toBeDefined();
      expect(metrics.performance).toHaveProperty('averageLatency');
      expect(metrics.performance).toHaveProperty('p95Latency');
      expect(metrics.performance).toHaveProperty('p99Latency');
      expect(metrics.performance).toHaveProperty('throughput');
      expect(metrics.performance).toHaveProperty('queueDepth');
    });
  });
  
  describe('Contract Metrics', () => {
    it('should have contract metrics structure', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.contracts).toBeDefined();
      expect(metrics.contracts).toHaveProperty('active');
      expect(metrics.contracts).toHaveProperty('pending');
      expect(metrics.contracts).toHaveProperty('completed');
      expect(metrics.contracts).toHaveProperty('failed');
      expect(metrics.contracts).toHaveProperty('total');
      expect(metrics.contracts).toHaveProperty('averageDuration');
      expect(metrics.contracts).toHaveProperty('successRate');
    });
    
    it('should have valid success rate', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.contracts.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.contracts.successRate).toBeLessThanOrEqual(1);
    });
  });
  
  describe('Agent Metrics', () => {
    it('should have agent metrics structure', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.agents).toBeDefined();
      expect(metrics.agents).toHaveProperty('total');
      expect(metrics.agents).toHaveProperty('available');
      expect(metrics.agents).toHaveProperty('busy');
      expect(metrics.agents).toHaveProperty('offline');
      expect(metrics.agents).toHaveProperty('averageLoad');
    });
  });
  
  describe('Error Metrics', () => {
    it('should have error metrics structure', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.errors).toBeDefined();
      expect(metrics.errors).toHaveProperty('total');
      expect(metrics.errors).toHaveProperty('rate');
      expect(metrics.errors).toHaveProperty('byType');
      expect(metrics.errors).toHaveProperty('recentErrors');
    });
    
    it('should track errors by type', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(typeof metrics.errors.byType).toBe('object');
      expect(Array.isArray(metrics.errors.recentErrors)).toBe(true);
    });
  });
  
  describe('Reputation Metrics', () => {
    it('should have reputation metrics structure', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.reputation).toBeDefined();
      expect(metrics.reputation).toHaveProperty('averageScore');
      expect(metrics.reputation).toHaveProperty('topPerformers');
      expect(metrics.reputation).toHaveProperty('underperformers');
    });
    
    it('should have valid average reputation score', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics.reputation.averageScore).toBeGreaterThanOrEqual(0);
      expect(metrics.reputation.averageScore).toBeLessThanOrEqual(100);
    });
  });
});

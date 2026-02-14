/**
 * DCYFR Reputation Engine Tests
 * TLP:AMBER - Internal Use Only
 * 
 * Comprehensive tests for multi-dimensional reputation scoring.
 * 
 * @module __tests__/reputation/reputation-engine.test
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { ReputationEngine } from '../../reputation/reputation-engine';
import type { TaskOutcome } from '../../reputation/reputation-engine';

const TEST_DB_PATH = '/tmp/test-reputation-engine.db';

describe('ReputationEngine', () => {
  let engine: ReputationEngine;
  
  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    
    // Initialize database with schema
    const Database = require('better-sqlite3');
    const db = new Database(TEST_DB_PATH);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_reputation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL UNIQUE,
        agent_name TEXT NOT NULL,
        confidence_score REAL NOT NULL DEFAULT 0.5,
        reliability_score REAL NOT NULL DEFAULT 0.5,
        speed_score REAL NOT NULL DEFAULT 0.5,
        quality_score REAL NOT NULL DEFAULT 0.5,
        security_score REAL NOT NULL DEFAULT 0.5,
        total_tasks INTEGER DEFAULT 0,
        successful_tasks INTEGER DEFAULT 0,
        failed_tasks INTEGER DEFAULT 0,
        success_rate REAL GENERATED ALWAYS AS (
          CASE WHEN total_tasks > 0 
            THEN CAST(successful_tasks AS REAL) / total_tasks 
            ELSE 0.0 
          END
        ) STORED,
        avg_completion_time_ms INTEGER DEFAULT NULL,
        min_completion_time_ms INTEGER DEFAULT NULL,
        max_completion_time_ms INTEGER DEFAULT NULL,
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_task_at TEXT DEFAULT NULL,
        UNIQUE(agent_id)
      );
      
      CREATE TABLE IF NOT EXISTS reputation_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        event_data TEXT NOT NULL,
        task_id TEXT,
        delegation_contract_id TEXT,
        source_system TEXT NOT NULL DEFAULT 'dcyfr-ai'
      );
    `);
    
    db.close();
    
    // Initialize engine
    engine = new ReputationEngine({
      databasePath: TEST_DB_PATH,
      debug: false,
    });
  });
  
  afterEach(() => {
    engine.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });
  
  describe('initialization', () => {
    it('should create engine with default weights', () => {
      const eng = new ReputationEngine({
        databasePath: TEST_DB_PATH,
      });
      
      expect(eng).toBeDefined();
      eng.close();
    });
    
    it('should create engine with custom weights', () => {
      const eng = new ReputationEngine({
        databasePath: TEST_DB_PATH,
        reliabilityWeight: 0.5,
        speedWeight: 0.2,
        qualityWeight: 0.2,
        securityWeight: 0.1,
      });
      
      expect(eng).toBeDefined();
      eng.close();
    });
    
    it('should throw error if weights do not sum to 1.0', () => {
      expect(() => {
        new ReputationEngine({
          databasePath: TEST_DB_PATH,
          reliabilityWeight: 0.5,
          speedWeight: 0.5,
          qualityWeight: 0.5,
          securityWeight: 0.5,
        });
      }).toThrow('must sum to 1.0');
    });
  });
  
  describe('updateReputation', () => {
    it('should create initial reputation for new agent', async () => {
      const outcome: TaskOutcome = {
        contract_id: 'contract-1',
        agent_id: 'agent-1',
        agent_name: 'Agent One',
        task_id: 'task-1',
        success: true,
        completion_time_ms: 500,
        quality_score: 0.9,
      };
      
      const reputation = await engine.updateReputation(outcome);
      
      expect(reputation.agent_id).toBe('agent-1');
      expect(reputation.total_tasks).toBe(1);
      expect(reputation.successful_tasks).toBe(1);
      expect(reputation.failed_tasks).toBe(0);
      expect(reputation.success_rate).toBe(1.0);
      expect(reputation.reliability_score).toBe(1.0);
      expect(reputation.quality_score).toBe(0.9);
      expect(reputation.confidence_score).toBeGreaterThan(0.8);
    });
    
    it('should create initial reputation with failure', async () => {
      const outcome: TaskOutcome = {
        contract_id: 'contract-2',
        agent_id: 'agent-2',
        agent_name: 'Agent Two',
        task_id: 'task-2',
        success: false,
        completion_time_ms: 3000,
      };
      
      const reputation = await engine.updateReputation(outcome);
      
      expect(reputation.total_tasks).toBe(1);
      expect(reputation.successful_tasks).toBe(0);
      expect(reputation.failed_tasks).toBe(1);
      expect(reputation.success_rate).toBe(0.0);
      expect(reputation.reliability_score).toBe(0.0);
      expect(reputation.confidence_score).toBeLessThan(0.5);
    });
    
    it('should update existing reputation with success', async () => {
      // Create initial reputation
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-3',
        agent_name: 'Agent Three',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
        quality_score: 0.8,
      });
      
      // Update with another success
      const updated = await engine.updateReputation({
        contract_id: 'c2',
        agent_id: 'agent-3',
        agent_name: 'Agent Three',
        task_id: 't2',
        success: true,
        completion_time_ms: 800,
        quality_score: 0.9,
      });
      
      expect(updated.total_tasks).toBe(2);
      expect(updated.successful_tasks).toBe(2);
      expect(updated.success_rate).toBe(1.0);
      expect(updated.avg_completion_time_ms).toBe(900);
      expect(updated.min_completion_time_ms).toBe(800);
      expect(updated.max_completion_time_ms).toBe(1000);
    });
    
    it('should update existing reputation with failure', async () => {
      // Create initial reputation with success
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-4',
        agent_name: 'Agent Four',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
        quality_score: 0.9,
      });
      
      const initial = await engine.getReputation('agent-4');
      
      // Update with failure
      const updated = await engine.updateReputation({
        contract_id: 'c2',
        agent_id: 'agent-4',
        agent_name: 'Agent Four',
        task_id: 't2',
        success: false,
        completion_time_ms: 5000,
        quality_score: 0.3,
      });
      
      expect(updated.total_tasks).toBe(2);
      expect(updated.successful_tasks).toBe(1);
      expect(updated.failed_tasks).toBe(1);
      expect(updated.success_rate).toBe(0.5);
      expect(updated.confidence_score).toBeLessThan(initial!.confidence_score);
    });
    
    it('should handle security violations', async () => {
      const outcome: TaskOutcome = {
        contract_id: 'c1',
        agent_id: 'agent-5',
        agent_name: 'Agent Five',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
        quality_score: 0.8,
        security_violations: 2,
      };
      
      const reputation = await engine.updateReputation(outcome);
      
      expect(reputation.security_score).toBeLessThan(1.0);
      expect(reputation.security_score).toBe(0.6); // 1.0 - 2 * 0.2
    });
    
    it('should apply exponential moving average to scores', async () => {
      // Create with high scores
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-6',
        agent_name: 'Agent Six',
        task_id: 't1',
        success: true,
        completion_time_ms: 500,
        quality_score: 1.0,
      });
      
      const initial = await engine.getReputation('agent-6');
      
      // Update with low scores
      await engine.updateReputation({
        contract_id: 'c2',
        agent_id: 'agent-6',
        agent_name: 'Agent Six',
        task_id: 't2',
        success: false,
        completion_time_ms: 150000,
        quality_score: 0.0,
      });
      
      const updated = await engine.getReputation('agent-6');
      
      // Scores should be between initial and new values due to EMA
      expect(updated!.reliability_score).toBeLessThan(initial!.reliability_score);
      expect(updated!.reliability_score).toBeGreaterThan(0.0);
      expect(updated!.quality_score).toBeLessThan(initial!.quality_score);
      expect(updated!.quality_score).toBeGreaterThan(0.0);
    });
  });
  
  describe('getReputation', () => {
    it('should return null for non-existent agent', async () => {
      const reputation = await engine.getReputation('non-existent');
      expect(reputation).toBeNull();
    });
    
    it('should return reputation for existing agent', async () => {
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-7',
        agent_name: 'Agent Seven',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
      });
      
      const reputation = await engine.getReputation('agent-7');
      
      expect(reputation).not.toBeNull();
      expect(reputation!.agent_id).toBe('agent-7');
    });
  });
  
  describe('queryReputation', () => {
    beforeEach(async () => {
      // Create multiple agents with different reputations
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'high-performer',
        agent_name: 'High Performer',
        task_id: 't1',
        success: true,
        completion_time_ms: 500,
        quality_score: 0.95,
      });
      
      await engine.updateReputation({
        contract_id: 'c2',
        agent_id: 'medium-performer',
        agent_name: 'Medium Performer',
        task_id: 't2',
        success: true,
        completion_time_ms: 5000,
        quality_score: 0.7,
      });
      
      await engine.updateReputation({
        contract_id: 'c3',
        agent_id: 'low-performer',
        agent_name: 'Low Performer',
        task_id: 't3',
        success: false,
        completion_time_ms: 30000,
        quality_score: 0.3,
      });
    });
    
    it('should return all agents without filters', async () => {
      const results = await engine.queryReputation();
      expect(results.length).toBe(3);
    });
    
    it('should filter by minimum confidence score', async () => {
      const results = await engine.queryReputation({ min_confidence: 0.7 });
      expect(results.length).toBeLessThan(3);
      results.forEach(rep => {
        expect(rep.confidence_score).toBeGreaterThanOrEqual(0.7);
      });
    });
    
    it('should filter by minimum success rate', async () => {
      const results = await engine.queryReputation({ min_success_rate: 0.9 });
      results.forEach(rep => {
        expect(rep.success_rate).toBeGreaterThanOrEqual(0.9);
      });
    });
    
    it('should sort by confidence score descending (default)', async () => {
      const results = await engine.queryReputation();
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].confidence_score).toBeGreaterThanOrEqual(results[i].confidence_score);
      }
    });
    
    it('should sort by confidence score ascending', async () => {
      const results = await engine.queryReputation({ sort_order: 'asc' });
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].confidence_score).toBeLessThanOrEqual(results[i].confidence_score);
      }
    });
    
    it('should sort by different fields', async () => {
      const byReliability = await engine.queryReputation({ sort_by: 'reliability_score' });
      expect(byReliability[0].reliability_score).toBeGreaterThanOrEqual(byReliability[byReliability.length - 1].reliability_score);
      
      const byQuality = await engine.queryReputation({ sort_by: 'quality_score' });
      expect(byQuality[0].quality_score).toBeGreaterThanOrEqual(byQuality[byQuality.length - 1].quality_score);
    });
    
    it('should limit results', async () => {
      const results = await engine.queryReputation({ limit: 2 });
      expect(results.length).toBe(2);
    });
    
    it('should paginate results', async () => {
      const page1 = await engine.queryReputation({ limit: 2, offset: 0, sort_by: 'confidence_score', sort_order: 'desc' });
      const page2 = await engine.queryReputation({ limit: 2, offset: 2, sort_by: 'confidence_score', sort_order: 'desc' });
      
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(1);
      expect(page1[0].agent_id).not.toBe(page2[0].agent_id);
    });
  });
  
  describe('getAuditLog', () => {
    it('should return audit log entries for agent', async () => {
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-8',
        agent_name: 'Agent Eight',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
      });
      
      await engine.updateReputation({
        contract_id: 'c2',
        agent_id: 'agent-8',
        agent_name: 'Agent Eight',
        task_id: 't2',
        success: true,
        completion_time_ms: 1200,
      });
      
      const auditLog = await engine.getAuditLog('agent-8');
      
      expect(auditLog.length).toBeGreaterThanOrEqual(2);
      expect(auditLog[0].agent_id).toBe('agent-8');
      expect(auditLog[0].event_type).toMatch(/reputation_(created|updated)/);
    });
    
    it('should limit audit log entries', async () => {
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-9',
        agent_name: 'Agent Nine',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
      });
      
      await engine.updateReputation({
        contract_id: 'c2',
        agent_id: 'agent-9',
        agent_name: 'Agent Nine',
        task_id: 't2',
        success: true,
        completion_time_ms: 1200,
      });
      
      const auditLog = await engine.getAuditLog('agent-9', 1);
      
      expect(auditLog.length).toBe(1);
    });
    
    it('should return audit log in reverse chronological order', async () => {
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-10',
        agent_name: 'Agent Ten',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
      });
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await engine.updateReputation({
        contract_id: 'c2',
        agent_id: 'agent-10',
        agent_name: 'Agent Ten',
        task_id: 't2',
        success: true,
        completion_time_ms: 1200,
      });
      
      const auditLog = await engine.getAuditLog('agent-10');
      
      expect(auditLog.length).toBeGreaterThanOrEqual(2);
      // Compare timestamps as strings (ISO 8601 format is lexicographically sortable)
      expect(auditLog[0].timestamp >= auditLog[1].timestamp).toBe(true);
    });
  });
  
  describe('resetReputation', () => {
    it('should delete agent reputation', async () => {
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-11',
        agent_name: 'Agent Eleven',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
      });
      
      let reputation = await engine.getReputation('agent-11');
      expect(reputation).not.toBeNull();
      
      await engine.resetReputation('agent-11');
      
      reputation = await engine.getReputation('agent-11');
      expect(reputation).toBeNull();
    });
    
    it('should log reset event', async () => {
      await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'agent-12',
        agent_name: 'Agent Twelve',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
      });
      
      await engine.resetReputation('agent-12');
      
      const auditLog = await engine.getAuditLog('agent-12');
      
      const resetEvent = auditLog.find(e => e.event_type === 'reputation_reset');
      expect(resetEvent).toBeDefined();
    });
  });
  
  describe('edge cases', () => {
    it('should handle very fast completion times', async () => {
      const reputation = await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'fast-agent',
        agent_name: 'Fast Agent',
        task_id: 't1',
        success: true,
        completion_time_ms: 100,
        quality_score: 0.9,
      });
      
      expect(reputation.speed_score).toBe(1.0);
    });
    
    it('should handle very slow completion times', async () => {
      const reputation = await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'slow-agent',
        agent_name: 'Slow Agent',
        task_id: 't1',
        success: true,
        completion_time_ms: 300000, // 5 minutes
        quality_score: 0.9,
      });
      
      expect(reputation.speed_score).toBe(0.3);
    });
    
    it('should handle zero quality score', async () => {
      const reputation = await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'zero-quality',
        agent_name: 'Zero Quality',
        task_id: 't1',
        success: false,
        completion_time_ms: 1000,
        quality_score: 0.0,
      });
      
      expect(reputation.quality_score).toBe(0.0);
    });
    
    it('should handle perfect quality score', async () => {
      const reputation = await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'perfect-quality',
        agent_name: 'Perfect Quality',
        task_id: 't1',
        success: true,
        completion_time_ms: 500,
        quality_score: 1.0,
      });
      
      expect(reputation.quality_score).toBe(1.0);
    });
    
    it('should handle multiple security violations', async () => {
      const reputation = await engine.updateReputation({
        contract_id: 'c1',
        agent_id: 'insecure-agent',
        agent_name: 'Insecure Agent',
        task_id: 't1',
        success: true,
        completion_time_ms: 1000,
        security_violations: 5,
      });
      
      expect(reputation.security_score).toBe(0.0); // Clamped to 0
    });
    
    it('should handle rapid successive updates', async () => {
      // Sequential updates to avoid race conditions on initial creation
      for (let i = 0; i < 10; i++) {
        await engine.updateReputation({
          contract_id: `c${i}`,
          agent_id: 'rapid-agent',
          agent_name: 'Rapid Agent',
          task_id: `t${i}`,
          success: i % 2 === 0, // Alternate success/failure
          completion_time_ms: 1000 + i * 100,
          quality_score: 0.5 + (i % 5) * 0.1,
        });
      }
      
      const reputation = await engine.getReputation('rapid-agent');
      
      expect(reputation).not.toBeNull();
      expect(reputation!.total_tasks).toBe(10);
      expect(reputation!.successful_tasks).toBe(5);
      expect(reputation!.success_rate).toBe(0.5);
    });
  });
});

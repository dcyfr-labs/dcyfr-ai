#!/usr/bin/env node

/**
 * Create test telemetry database for CLI testing
 */

import sqlite3 from 'sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

const { Database } = sqlite3;

// Ensure .dcyfr directory exists
const dcyfrDir = join(homedir(), '.dcyfr');
try {
  mkdirSync(dcyfrDir, { recursive: true });
} catch (error) {
  // Directory might already exist
}

const dbPath = join(dcyfrDir, 'telemetry.db');

console.log(`Creating test telemetry database at: ${dbPath}`);

const db = new Database(dbPath, (err) => {
  if (err) {
    console.error('Error creating database:', err);
    process.exit(1);
  }
  
  console.log('✅ Connected to SQLite database');
  
  // Create telemetry table
  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry_sessions (
      session_id TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      task_type TEXT DEFAULT 'generic',
      description TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT CHECK(status IN ('success', 'failed', 'timeout')) DEFAULT 'success',
      model_used TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0.0,
      duration INTEGER DEFAULT 0
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err);
      process.exit(1);
    }
    
    console.log('✅ Created telemetry_sessions table');
    
    // Insert sample data
    const sampleData = [
      {
        sessionId: 'session-001',
        agentType: 'claude-3.5-sonnet',
        taskType: 'code-generation',
        description: 'Generate TypeScript interface for user profile',
        startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        endTime: new Date(Date.now() - 3590000).toISOString(),
        status: 'success',
        modelUsed: 'claude-3-5-sonnet',
        inputTokens: 250,
        outputTokens: 180,
        totalCost: 0.0034,
        duration: 10000
      },
      {
        sessionId: 'session-002',
        agentType: 'gpt-4-turbo',
        taskType: 'data-analysis',
        description: 'Analyze customer feedback data and generate insights',
        startTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        endTime: new Date(Date.now() - 7180000).toISOString(),
        status: 'success',
        modelUsed: 'gpt-4-turbo',
        inputTokens: 450,
        outputTokens: 320,
        totalCost: 0.0089,
        duration: 20000
      },
      {
        sessionId: 'session-003',
        agentType: 'claude-3.5-sonnet',
        taskType: 'refactoring',
        description: 'Refactor legacy JavaScript code to modern TypeScript',
        startTime: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        endTime: new Date(Date.now() - 86380000).toISOString(),
        status: 'failed',
        modelUsed: 'claude-3-5-sonnet',
        inputTokens: 800,
        outputTokens: 0,
        totalCost: 0.0045,
        duration: 20000
      },
      {
        sessionId: 'session-004',
        agentType: 'gpt-3.5-turbo',
        taskType: 'documentation',
        description: 'Generate API documentation from OpenAPI spec',
        startTime: new Date().toISOString(), // Now
        endTime: null,
        status: 'success',
        modelUsed: 'gpt-3.5-turbo',
        inputTokens: 150,
        outputTokens: 400,
        totalCost: 0.0012,
        duration: 8000
      }
    ];
    
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO telemetry_sessions 
      (session_id, agent_type, task_type, description, start_time, end_time, status, model_used, input_tokens, output_tokens, total_cost, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    sampleData.forEach((data) => {
      insertStmt.run([
        data.sessionId,
        data.agentType,
        data.taskType,
        data.description,
        data.startTime,
        data.endTime,
        data.status,
        data.modelUsed,
        data.inputTokens,
        data.outputTokens,
        data.totalCost,
        data.duration
      ], (err) => {
        if (err) {
          console.error('Error inserting sample data:', err);
        }
      });
    });
    
    insertStmt.finalize();
    
    console.log('✅ Inserted sample telemetry data');
    console.log(`\nTest the CLI with:\n  npx dcyfr telemetry --help\n  npx dcyfr telemetry --period today`);
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('✅ Database setup complete');
      }
    });
  });
});
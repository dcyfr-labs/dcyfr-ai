#!/usr/bin/env node

/**
 * Create a test telemetry database for CLI testing.
 *
 * Usage:
 *   node scripts/create-test-telemetry-db.js [dbPath]
 *
 * Defaults to ~/.dcyfr/telemetry.db so `dcyfr-ai telemetry` picks it up
 * with no extra flags. Pass a path to write elsewhere (then point the CLI
 * at it with `dcyfr-ai telemetry --db <path>`).
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

const dbPath = process.argv[2] || join(homedir(), '.dcyfr', 'telemetry.db');

mkdirSync(dirname(dbPath), { recursive: true });

console.log(`Creating test telemetry database at: ${dbPath}`);

const db = new Database(dbPath);

// Single-statement DDL via prepare().run() (keeps it off the raw exec path).
db.prepare(`
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
`).run();

console.log('✅ Created telemetry_sessions table');

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
    duration: 10000,
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
    duration: 20000,
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
    duration: 20000,
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
    duration: 8000,
  },
];

const insert = db.prepare(`
  INSERT OR REPLACE INTO telemetry_sessions
    (session_id, agent_type, task_type, description, start_time, end_time, status,
     model_used, input_tokens, output_tokens, total_cost, duration)
  VALUES
    (@sessionId, @agentType, @taskType, @description, @startTime, @endTime, @status,
     @modelUsed, @inputTokens, @outputTokens, @totalCost, @duration)
`);

const insertAll = db.transaction((rows) => {
  for (const row of rows) insert.run(row);
});
insertAll(sampleData);

console.log('✅ Inserted sample telemetry data');

db.close();

console.log('✅ Database setup complete');
console.log(
  `\nTest the CLI with:\n` +
    `  npx dcyfr-ai telemetry --help\n` +
    `  npx dcyfr-ai telemetry --period today --db ${dbPath}`
);

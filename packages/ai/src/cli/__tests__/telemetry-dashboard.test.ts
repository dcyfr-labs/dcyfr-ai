/**
 * Telemetry Dashboard CLI — data-path tests
 *
 * Exercises the SQLite-backed query methods against a throwaway
 * better-sqlite3 fixture database. These guard the data path that
 * `dcyfr-ai telemetry` depends on, and would have caught the
 * sqlite3 -> better-sqlite3 dependency mismatch (the code imported
 * the un-declared `sqlite3` package, so every query threw).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TelemetryDashboard } from '../telemetry-dashboard';

const SCHEMA = `
  CREATE TABLE telemetry_sessions (
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
`;

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

// session_id, agent_type, task_type, description, start_time, status, model_used,
// input_tokens, output_tokens, total_cost, duration
const ROWS: Array<Array<string | number>> = [
  ['s1', 'rei', 'codegen', 'task a', hoursAgo(1), 'success', 'claude-opus-4', 100, 50, 0.01, 1000],
  ['s2', 'rei', 'review', 'task b', hoursAgo(2), 'failed', 'claude-opus-4', 200, 80, 0.02, 2000],
  ['s3', 'asuka', 'analysis', 'task c', hoursAgo(3), 'success', 'gpt-4o', 300, 120, 0.03, 1500],
];

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'dcyfr-telemetry-'));
  dbPath = join(tmpDir, 'telemetry.db');
  const db = new Database(dbPath);
  // Single DDL statement — prepare().run() keeps this off the noisy exec() path.
  db.prepare(SCHEMA).run();
  const insert = db.prepare(
    `INSERT INTO telemetry_sessions
       (session_id, agent_type, task_type, description, start_time, status, model_used,
        input_tokens, output_tokens, total_cost, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of ROWS) insert.run(...row);
  db.close();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('TelemetryDashboard data access (better-sqlite3)', () => {
  const dashboard = (): TelemetryDashboard => {
    const d = new TelemetryDashboard();
    d.setDatabasePath(dbPath);
    return d;
  };

  it('reads all telemetry rows with camelCase field mapping', async () => {
    const records = await dashboard().getAgentTelemetry();
    expect(records).toHaveLength(3);
    const s1 = records.find((r) => r.sessionId === 's1');
    expect(s1).toMatchObject({
      agentType: 'rei',
      modelUsed: 'claude-opus-4',
      inputTokens: 100,
      outputTokens: 50,
      totalCost: 0.01,
    });
  });

  it('filters by agent name', async () => {
    const records = await dashboard().getAgentTelemetry('rei');
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.agentType === 'rei')).toBe(true);
  });

  it('filters by period window', async () => {
    const records = await dashboard().getAgentTelemetry(undefined, 'week');
    expect(records).toHaveLength(3);
  });

  it('aggregates a model usage breakdown', async () => {
    const breakdown = await dashboard().getModelBreakdown();
    const opus = breakdown.find((b) => b.model === 'claude-opus-4');
    expect(opus).toMatchObject({ callCount: 2, totalTokens: 430 });
    expect(opus!.totalCost).toBeCloseTo(0.03, 5);
  });

  it('does not let a malicious --agent value inject SQL', async () => {
    // If the agent filter were interpolated raw, this trailing OR would match every row.
    const records = await dashboard().getAgentTelemetry("rei' OR '1'='1");
    expect(records).toHaveLength(0);
  });

  it('returns an empty result set when the database file is absent', async () => {
    const d = new TelemetryDashboard();
    d.setDatabasePath(join(tmpDir, 'does-not-exist.db'));
    await expect(d.getAgentTelemetry()).resolves.toEqual([]);
  });
});

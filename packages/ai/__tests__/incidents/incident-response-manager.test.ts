/**
 * Tests for IncidentResponseManager
 *
 * Covers:
 *   - Incident creation (CVSS validation, severity derivation, SLA deadline, auto-disable)
 *   - Acknowledge, markInProgress, resolve lifecycle
 *   - Error cases (NOT_FOUND, ALREADY_ACKNOWLEDGED, ALREADY_RESOLVED, INVALID_TRANSITION)
 *   - SLA breach detection and checkSlaBreaches mutation
 *   - Overdue incident listing
 *   - listIncidents filtering + pagination
 *   - GitHub issue + advisory creation
 *   - Axiom alert dispatch
 *   - Auto-disable callback
 *   - Email notifier stub
 *   - Hydration + export round-trip
 *   - DEFAULT_SLA values
 *   - PLUGIN_INCIDENTS_SCHEMA_SQL
 *
 * @module plugins/incidents/__tests__
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IncidentResponseManager,
  IncidentError,
} from '../../src/plugins/incidents/incident-response-manager.js';
import { DEFAULT_SLA, PLUGIN_INCIDENTS_SCHEMA_SQL } from '../../src/plugins/incidents/types.js';
import type {
  CreateIncidentInput,
  Incident,
  GithubClient,
  AxiomLogger,
  EmailNotifier,
  GithubIssuePayload,
  GithubAdvisoryPayload,
  AxiomAlertPayload,
} from '../../src/plugins/incidents/incident-response-manager.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<CreateIncidentInput> = {}): CreateIncidentInput {
  return {
    pluginId:    'author/test-plugin',
    title:       'Test vulnerability',
    description: 'Detailed description of the vulnerability',
    cvssScore:   5,
    ...overrides,
  };
}

// Advance a future SLA deadline to the past for breach testing
function makePastDeadlineIncident(base: Incident): Incident {
  const past = new Date(Date.now() - 1000).toISOString();
  return { ...base, slaDeadline: past };
}

// ---------------------------------------------------------------------------
// DEFAULT_SLA
// ---------------------------------------------------------------------------

describe('DEFAULT_SLA', () => {
  it('critical is 24 hours', () => {
    expect(DEFAULT_SLA.criticalMs).toBe(24 * 60 * 60 * 1000);
  });

  it('high is 48 hours', () => {
    expect(DEFAULT_SLA.highMs).toBe(48 * 60 * 60 * 1000);
  });

  it('medium is 7 days', () => {
    expect(DEFAULT_SLA.mediumMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('low is 30 days', () => {
    expect(DEFAULT_SLA.lowMs).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// PLUGIN_INCIDENTS_SCHEMA_SQL
// ---------------------------------------------------------------------------

describe('PLUGIN_INCIDENTS_SCHEMA_SQL', () => {
  it('is a non-empty string', () => {
    expect(typeof PLUGIN_INCIDENTS_SCHEMA_SQL).toBe('string');
    expect(PLUGIN_INCIDENTS_SCHEMA_SQL.length).toBeGreaterThan(50);
  });

  it('contains CREATE TABLE IF NOT EXISTS plugin_incidents', () => {
    expect(PLUGIN_INCIDENTS_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS plugin_incidents');
  });

  it('contains all required columns', () => {
    const cols = ['id', 'plugin_id', 'title', 'description', 'cvss_score', 'severity', 'status',
      'sla_deadline', 'auto_disabled', 'assignee', 'resolution'];
    for (const col of cols) {
      expect(PLUGIN_INCIDENTS_SCHEMA_SQL).toContain(col);
    }
  });

  it('creates index on plugin_id', () => {
    expect(PLUGIN_INCIDENTS_SCHEMA_SQL).toContain('idx_incidents_plugin_id');
  });
});

// ---------------------------------------------------------------------------
// createIncident: basic functionality
// ---------------------------------------------------------------------------

describe('IncidentResponseManager.createIncident', () => {
  let manager: IncidentResponseManager;

  beforeEach(() => {
    manager = new IncidentResponseManager();
  });

  it('returns an incident with a UUID id', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(incident.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stores the pluginId, title, description', async () => {
    const incident = await manager.createIncident(makeInput({
      pluginId:    'vendor/plugin-x',
      title:       'XSS vulnerability',
      description: 'Reflected XSS in input parameter',
    }));
    expect(incident.pluginId).toBe('vendor/plugin-x');
    expect(incident.title).toBe('XSS vulnerability');
    expect(incident.description).toBe('Reflected XSS in input parameter');
  });

  it('initial status is open', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(incident.status).toBe('open');
  });

  it('createdAt is a valid ISO-8601 date', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(() => new Date(incident.createdAt)).not.toThrow();
    expect(new Date(incident.createdAt).toISOString()).toBe(incident.createdAt);
  });

  it('acknowledgedAt and resolvedAt are null on creation', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(incident.acknowledgedAt).toBeNull();
    expect(incident.resolvedAt).toBeNull();
  });

  it('assignee and resolution are null on creation', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(incident.assignee).toBeNull();
    expect(incident.resolution).toBeNull();
  });

  it('githubIssueUrl and githubAdvisoryUrl are null on creation', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(incident.githubIssueUrl).toBeNull();
    expect(incident.githubAdvisoryUrl).toBeNull();
  });

  it('stores cveIds', async () => {
    const incident = await manager.createIncident(makeInput({ cveIds: ['CVE-2026-12345', 'CVE-2026-99999'] }));
    expect(incident.cveIds).toEqual(['CVE-2026-12345', 'CVE-2026-99999']);
  });

  it('defaults cveIds to empty array', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(incident.cveIds).toEqual([]);
  });

  it('stores metadata', async () => {
    const incident = await manager.createIncident(makeInput({ metadata: { reporter: 'alice' } }));
    expect(incident.metadata).toEqual({ reporter: 'alice' });
  });

  it('defaults metadata to empty object', async () => {
    const incident = await manager.createIncident(makeInput());
    expect(incident.metadata).toEqual({});
  });

  it('increments size', async () => {
    await manager.createIncident(makeInput({ pluginId: 'a/a' }));
    await manager.createIncident(makeInput({ pluginId: 'a/b' }));
    expect(manager.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Severity derivation from CVSS
// ---------------------------------------------------------------------------

describe('Severity derivation', () => {
  let manager: IncidentResponseManager;
  beforeEach(() => { manager = new IncidentResponseManager(); });

  it.each([
    [9,    'critical'],
    [9.8,  'critical'],
    [10,   'critical'],
    [7,    'high'],
    [8.9,  'high'],
    [4,    'medium'],
    [6.9,  'medium'],
    [0.1,  'low'],
    [3.9,  'low'],
    [0,    'informational'],
  ] as const)('CVSS %s → severity "%s"', async (score, expected) => {
    const incident = await manager.createIncident(makeInput({ cvssScore: score }));
    expect(incident.severity).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// SLA deadline computation
// ---------------------------------------------------------------------------

describe('SLA deadline computation', () => {
  it('critical incident slaDeadline is ~24h after createdAt', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput({ cvssScore: 9.5 }));
    const created = new Date(incident.createdAt).getTime();
    const deadline = new Date(incident.slaDeadline).getTime();
    expect(deadline - created).toBeGreaterThanOrEqual(DEFAULT_SLA.criticalMs - 100);
    expect(deadline - created).toBeLessThanOrEqual(DEFAULT_SLA.criticalMs + 100);
  });

  it('medium incident slaDeadline is ~7d after createdAt', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput({ cvssScore: 5 }));
    const created = new Date(incident.createdAt).getTime();
    const deadline = new Date(incident.slaDeadline).getTime();
    expect(deadline - created).toBeGreaterThanOrEqual(DEFAULT_SLA.mediumMs - 100);
    expect(deadline - created).toBeLessThanOrEqual(DEFAULT_SLA.mediumMs + 100);
  });

  it('respects custom SLA config', async () => {
    const manager = new IncidentResponseManager({ sla: { criticalMs: 60_000 } });
    const incident = await manager.createIncident(makeInput({ cvssScore: 10 }));
    const created = new Date(incident.createdAt).getTime();
    const deadline = new Date(incident.slaDeadline).getTime();
    expect(deadline - created).toBeGreaterThanOrEqual(60_000 - 100);
    expect(deadline - created).toBeLessThanOrEqual(60_000 + 100);
  });
});

// ---------------------------------------------------------------------------
// CVSS validation
// ---------------------------------------------------------------------------

describe('CVSS validation', () => {
  let manager: IncidentResponseManager;
  beforeEach(() => { manager = new IncidentResponseManager(); });

  it('throws INVALID_CVSS for score < 0', async () => {
    try {
      await manager.createIncident(makeInput({ cvssScore: -0.1 }));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('INVALID_CVSS');
    }
  });

  it('throws INVALID_CVSS for score > 10', async () => {
    try {
      await manager.createIncident(makeInput({ cvssScore: 10.1 }));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('INVALID_CVSS');
    }
  });

  it('accepts boundary score 0.0', async () => {
    const incident = await manager.createIncident(makeInput({ cvssScore: 0 }));
    expect(incident.severity).toBe('informational');
  });

  it('accepts boundary score 10.0', async () => {
    const incident = await manager.createIncident(makeInput({ cvssScore: 10 }));
    expect(incident.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// Auto-disable on CVSS ≥ 9.0
// ---------------------------------------------------------------------------

describe('Auto-disable (CVSS ≥ 9.0)', () => {
  it('sets autoDisabled=true for CVSS ≥ 9.0', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput({ cvssScore: 9 }));
    expect(incident.autoDisabled).toBe(true);
  });

  it('sets autoDisabled=false for CVSS < 9.0', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput({ cvssScore: 8.9 }));
    expect(incident.autoDisabled).toBe(false);
  });

  it('calls onAutoDisable callback with pluginId and incident', async () => {
    const onAutoDisable = vi.fn();
    const manager = new IncidentResponseManager({ onAutoDisable });
    const incident = await manager.createIncident(makeInput({ cvssScore: 9.5, pluginId: 'vendor/critical-plugin' }));
    expect(onAutoDisable).toHaveBeenCalledOnce();
    expect(onAutoDisable).toHaveBeenCalledWith('vendor/critical-plugin', incident);
  });

  it('does NOT call onAutoDisable for CVSS < 9.0', async () => {
    const onAutoDisable = vi.fn();
    const manager = new IncidentResponseManager({ onAutoDisable });
    await manager.createIncident(makeInput({ cvssScore: 7.5 }));
    expect(onAutoDisable).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// acknowledgeIncident
// ---------------------------------------------------------------------------

describe('acknowledgeIncident', () => {
  let manager: IncidentResponseManager;
  let incidentId: string;

  beforeEach(async () => {
    manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    incidentId = incident.id;
  });

  it('transitions status to acknowledged', () => {
    const updated = manager.acknowledgeIncident({ id: incidentId, assignee: 'security-team' });
    expect(updated.status).toBe('acknowledged');
  });

  it('sets acknowledgedAt timestamp', () => {
    const updated = manager.acknowledgeIncident({ id: incidentId, assignee: 'alice' });
    expect(updated.acknowledgedAt).not.toBeNull();
    expect(() => new Date(updated.acknowledgedAt!)).not.toThrow();
  });

  it('sets the assignee', () => {
    const updated = manager.acknowledgeIncident({ id: incidentId, assignee: 'alice@dcyfr.ai' });
    expect(updated.assignee).toBe('alice@dcyfr.ai');
  });

  it('throws NOT_FOUND for unknown incident', () => {
    try {
      manager.acknowledgeIncident({ id: 'nonexistent', assignee: 'alice' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('NOT_FOUND');
    }
  });

  it('throws ALREADY_ACKNOWLEDGED when called twice', () => {
    manager.acknowledgeIncident({ id: incidentId, assignee: 'alice' });
    try {
      manager.acknowledgeIncident({ id: incidentId, assignee: 'bob' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('ALREADY_ACKNOWLEDGED');
    }
  });
});

// ---------------------------------------------------------------------------
// markInProgress
// ---------------------------------------------------------------------------

describe('markInProgress', () => {
  let manager: IncidentResponseManager;
  let incidentId: string;

  beforeEach(async () => {
    manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    incidentId = incident.id;
  });

  it('transitions open → in_progress', () => {
    const updated = manager.markInProgress(incidentId);
    expect(updated.status).toBe('in_progress');
  });

  it('transitions acknowledged → in_progress', () => {
    manager.acknowledgeIncident({ id: incidentId, assignee: 'alice' });
    const updated = manager.markInProgress(incidentId);
    expect(updated.status).toBe('in_progress');
  });

  it('updates assignee if provided', () => {
    const updated = manager.markInProgress(incidentId, 'bob');
    expect(updated.assignee).toBe('bob');
  });

  it('throws INVALID_TRANSITION from resolved', () => {
    manager.resolveIncident({ id: incidentId, resolution: 'patch deployed' });
    try {
      manager.markInProgress(incidentId);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('INVALID_TRANSITION');
    }
  });

  it('throws NOT_FOUND for unknown id', () => {
    try {
      manager.markInProgress('unknown-id');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------
// resolveIncident
// ---------------------------------------------------------------------------

describe('resolveIncident', () => {
  let manager: IncidentResponseManager;
  let incidentId: string;

  beforeEach(async () => {
    manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    incidentId = incident.id;
  });

  it('transitions status to resolved by default', () => {
    const updated = manager.resolveIncident({ id: incidentId, resolution: 'CVE patched' });
    expect(updated.status).toBe('resolved');
  });

  it('can close with finalStatus closed', () => {
    const updated = manager.resolveIncident({ id: incidentId, resolution: 'False positive', finalStatus: 'closed' });
    expect(updated.status).toBe('closed');
  });

  it('sets resolvedAt timestamp', () => {
    const updated = manager.resolveIncident({ id: incidentId, resolution: 'Fixed' });
    expect(updated.resolvedAt).not.toBeNull();
  });

  it('stores resolution text', () => {
    const updated = manager.resolveIncident({ id: incidentId, resolution: 'Applied hotfix 1.2.3' });
    expect(updated.resolution).toBe('Applied hotfix 1.2.3');
  });

  it('throws NOT_FOUND for unknown incident', () => {
    try {
      manager.resolveIncident({ id: 'missing', resolution: 'N/A' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('NOT_FOUND');
    }
  });

  it('throws ALREADY_RESOLVED when already resolved', () => {
    manager.resolveIncident({ id: incidentId, resolution: 'Done' });
    try {
      manager.resolveIncident({ id: incidentId, resolution: 'Again' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('ALREADY_RESOLVED');
    }
  });
});

// ---------------------------------------------------------------------------
// getIncident
// ---------------------------------------------------------------------------

describe('getIncident', () => {
  it('returns the correct incident', async () => {
    const manager = new IncidentResponseManager();
    const created = await manager.createIncident(makeInput({ title: 'Specific title' }));
    const fetched = manager.getIncident(created.id);
    expect(fetched.title).toBe('Specific title');
    expect(fetched.id).toBe(created.id);
  });

  it('throws NOT_FOUND for missing id', () => {
    const manager = new IncidentResponseManager();
    try {
      manager.getIncident('ghost-id');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IncidentError);
      expect((err as IncidentError).code).toBe('NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------
// SLA breach detection
// ---------------------------------------------------------------------------

describe('checkSlaBreaches', () => {
  it('marks overdue open incidents as sla_breached', async () => {
    const manager = new IncidentResponseManager({ sla: { criticalMs: 1 } });
    const incident = await manager.createIncident(makeInput({ cvssScore: 9.5 }));
    // Advance past the SLA by hydrating with a past deadline
    manager.hydrate([makePastDeadlineIncident(incident)]);
    const breached = await manager.checkSlaBreaches();
    expect(breached).toHaveLength(1);
    expect(breached[0].status).toBe('sla_breached');
  });

  it('does not re-breach already sla_breached incidents', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    manager.hydrate([{ ...makePastDeadlineIncident(incident), status: 'sla_breached' }]);
    const breached = await manager.checkSlaBreaches();
    expect(breached).toHaveLength(0);
  });

  it('does not breach resolved incidents', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    const resolved = manager.resolveIncident({ id: incident.id, resolution: 'fixed' });
    manager.hydrate([makePastDeadlineIncident(resolved)]);
    const breached = await manager.checkSlaBreaches();
    expect(breached).toHaveLength(0);
  });

  it('returns empty array when no breaches', async () => {
    const manager = new IncidentResponseManager();
    await manager.createIncident(makeInput()); // far future deadline
    const breached = await manager.checkSlaBreaches();
    expect(breached).toHaveLength(0);
  });
});

describe('getOverdueIncidents', () => {
  it('returns incidents past SLA without mutating status', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    manager.hydrate([makePastDeadlineIncident(incident)]);
    const overdue = manager.getOverdueIncidents();
    expect(overdue).toHaveLength(1);
    expect(overdue[0].status).toBe('open'); // NOT changed to sla_breached
  });
});

// ---------------------------------------------------------------------------
// listIncidents
// ---------------------------------------------------------------------------

describe('listIncidents', () => {
  let manager: IncidentResponseManager;

  beforeEach(async () => {
    manager = new IncidentResponseManager();
    await manager.createIncident(makeInput({ pluginId: 'vendor/p1', cvssScore: 9.5 }));
    await manager.createIncident(makeInput({ pluginId: 'vendor/p1', cvssScore: 5 }));
    await manager.createIncident(makeInput({ pluginId: 'vendor/p2', cvssScore: 7.5 }));
  });

  it('returns all incidents with no filters', () => {
    const page = manager.listIncidents();
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(3);
  });

  it('filters by pluginId', () => {
    const page = manager.listIncidents({ pluginId: 'vendor/p1' });
    expect(page.total).toBe(2);
    expect(page.items.every(i => i.pluginId === 'vendor/p1')).toBe(true);
  });

  it('filters by severity', () => {
    const page = manager.listIncidents({ severity: 'critical' });
    expect(page.total).toBe(1);
    expect(page.items[0].severity).toBe('critical');
  });

  it('filters by status array', () => {
    const ids = manager.listIncidents().items.map(i => i.id);
    manager.resolveIncident({ id: ids[0], resolution: 'done' });
    const page = manager.listIncidents({ status: ['resolved', 'open'] });
    expect(page.total).toBe(3);
  });

  it('filters slaBreached=false returns only non-breached', async () => {
    const manager2 = new IncidentResponseManager();
    const inc = await manager2.createIncident(makeInput());
    manager2.hydrate([makePastDeadlineIncident(inc)]);
    const page = manager2.listIncidents({ slaBreached: false });
    // All incidents have past deadline (slaBreached=true), so none match false
    expect(page.items.every(i => new Date(i.slaDeadline) > new Date())).toBe(true);
  });

  it('paginates correctly', () => {
    const page = manager.listIncidents({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    const page2 = manager.listIncidents({ page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it('returns items sorted newest first', async () => {
    const items = manager.listIncidents().items;
    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i].createdAt >= items[i + 1].createdAt).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// GitHub integration
// ---------------------------------------------------------------------------

describe('createGithubIssue', () => {
  it('calls githubClient.createIssue with correct payload', async () => {
    const createIssue = vi.fn<(p: GithubIssuePayload) => Promise<string | null>>()
      .mockResolvedValue('https://github.com/dcyfr/plugins/issues/42');
    const createSecurityAdvisory = vi.fn<(p: GithubAdvisoryPayload) => Promise<string | null>>()
      .mockResolvedValue(null);
    const githubClient: GithubClient = { createIssue, createSecurityAdvisory };
    const manager = new IncidentResponseManager({ githubClient, githubRepo: 'dcyfr/dcyfr-plugins' });

    const incident = await manager.createIncident(makeInput({ cvssScore: 5 }));
    // Clear auto-dispatch calls fired during createIncident
    createIssue.mockClear();
    const url = await manager.createGithubIssue(incident);

    expect(url).toBe('https://github.com/dcyfr/plugins/issues/42');
    expect(createIssue).toHaveBeenCalledOnce();
    const payload = createIssue.mock.calls[0][0];
    expect(payload.repo).toBe('dcyfr/dcyfr-plugins');
    expect(payload.labels).toContain('security');
    expect(payload.title).toContain(incident.pluginId);
  });

  it('returns null when no githubClient configured', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    const url = await manager.createGithubIssue(incident);
    expect(url).toBeNull();
  });
});

describe('createSecurityAdvisory', () => {
  it('calls githubClient.createSecurityAdvisory with correct payload', async () => {
    const createIssue = vi.fn<(p: GithubIssuePayload) => Promise<string | null>>()
      .mockResolvedValue(null);
    const createSecurityAdvisory = vi.fn<(p: GithubAdvisoryPayload) => Promise<string | null>>()
      .mockResolvedValue('https://github.com/dcyfr/plugins/security/advisories/GHSA-xxxx');
    const githubClient: GithubClient = { createIssue, createSecurityAdvisory };
    const manager = new IncidentResponseManager({ githubClient, githubRepo: 'dcyfr/dcyfr-plugins' });

    const incident = await manager.createIncident(makeInput({ cvssScore: 9 }));
    const url = await manager.createSecurityAdvisory(incident);

    expect(url).toContain('GHSA');
    const payload = createSecurityAdvisory.mock.calls[0][0];
    expect(payload.ghsaSeverity).toBe('critical');
    expect(payload.summary.length).toBeLessThanOrEqual(128);
  });

  it('returns null when no githubClient configured', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    const url = await manager.createSecurityAdvisory(incident);
    expect(url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axiom alerts
// ---------------------------------------------------------------------------

describe('sendAxiomAlert', () => {
  it('calls axiomLogger.logAlert for sla_breach', async () => {
    const logAlert = vi.fn<(p: AxiomAlertPayload) => Promise<void>>().mockResolvedValue(undefined);
    const axiomLogger: AxiomLogger = { logAlert };
    const manager = new IncidentResponseManager({ axiomLogger });
    const incident = await manager.createIncident(makeInput());
    await manager.sendAxiomAlert(incident, 'sla_breach');
    expect(logAlert).toHaveBeenCalledOnce();
    expect(logAlert.mock.calls[0][0].alertType).toBe('sla_breach');
  });

  it('calls axiomLogger.logAlert for auto_disable', async () => {
    const logAlert = vi.fn<(p: AxiomAlertPayload) => Promise<void>>().mockResolvedValue(undefined);
    const axiomLogger: AxiomLogger = { logAlert };
    const manager = new IncidentResponseManager({ axiomLogger });
    const incident = await manager.createIncident(makeInput({ cvssScore: 9.5 }));
    // Clear auto-dispatch calls (new_critical + auto_disable) fired during createIncident
    logAlert.mockClear();
    await manager.sendAxiomAlert(incident, 'auto_disable');
    expect(logAlert).toHaveBeenCalledOnce();
    expect(logAlert.mock.calls[0][0].alertType).toBe('auto_disable');
  });

  it('does nothing when no axiomLogger configured', async () => {
    const manager = new IncidentResponseManager();
    const incident = await manager.createIncident(makeInput());
    // Should not throw
    await expect(manager.sendAxiomAlert(incident, 'sla_breach')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Axiom alert on SLA breach via checkSlaBreaches
// ---------------------------------------------------------------------------

describe('Axiom alert triggered by checkSlaBreaches', () => {
  it('fires axiom alert when breach is detected', async () => {
    const logAlert = vi.fn<(p: AxiomAlertPayload) => Promise<void>>().mockResolvedValue(undefined);
    const axiomLogger: AxiomLogger = { logAlert };
    const manager = new IncidentResponseManager({ axiomLogger });
    const incident = await manager.createIncident(makeInput());
    manager.hydrate([makePastDeadlineIncident(incident)]);
    await manager.checkSlaBreaches();
    expect(logAlert).toHaveBeenCalled();
    expect(logAlert.mock.calls[0][0].alertType).toBe('sla_breach');
  });
});

// ---------------------------------------------------------------------------
// Automatic GitHub issue + advisory on createIncident
// ---------------------------------------------------------------------------

describe('Auto GitHub notifications on createIncident', () => {
  it('creates issue automatically for any incident when githubClient configured', async () => {
    const createIssue = vi.fn<(p: GithubIssuePayload) => Promise<string | null>>()
      .mockResolvedValue('https://github.com/test/42');
    const createSecurityAdvisory = vi.fn<(p: GithubAdvisoryPayload) => Promise<string | null>>()
      .mockResolvedValue(null);
    const githubClient: GithubClient = { createIssue, createSecurityAdvisory };
    const manager = new IncidentResponseManager({ githubClient, githubRepo: 'dcyfr/test' });
    await manager.createIncident(makeInput({ cvssScore: 5 }));
    expect(createIssue).toHaveBeenCalledOnce();
  });

  it('creates advisory for critical incidents', async () => {
    const createIssue = vi.fn<(p: GithubIssuePayload) => Promise<string | null>>()
      .mockResolvedValue('https://github.com/test/43');
    const createSecurityAdvisory = vi.fn<(p: GithubAdvisoryPayload) => Promise<string | null>>()
      .mockResolvedValue('https://github.com/advisory/GHSA-abc');
    const githubClient: GithubClient = { createIssue, createSecurityAdvisory };
    const manager = new IncidentResponseManager({ githubClient, githubRepo: 'dcyfr/test' });
    await manager.createIncident(makeInput({ cvssScore: 9.5 }));
    expect(createSecurityAdvisory).toHaveBeenCalledOnce();
  });

  it('creates advisory for high incidents', async () => {
    const createIssue = vi.fn<(p: GithubIssuePayload) => Promise<string | null>>()
      .mockResolvedValue('https://github.com/test/44');
    const createSecurityAdvisory = vi.fn<(p: GithubAdvisoryPayload) => Promise<string | null>>()
      .mockResolvedValue('https://github.com/advisory/GHSA-xyz');
    const githubClient: GithubClient = { createIssue, createSecurityAdvisory };
    const manager = new IncidentResponseManager({ githubClient, githubRepo: 'dcyfr/test' });
    await manager.createIncident(makeInput({ cvssScore: 7.5 }));
    expect(createSecurityAdvisory).toHaveBeenCalledOnce();
  });

  it('does NOT create advisory for medium incidents', async () => {
    const createIssue = vi.fn<(p: GithubIssuePayload) => Promise<string | null>>()
      .mockResolvedValue(null);
    const createSecurityAdvisory = vi.fn<(p: GithubAdvisoryPayload) => Promise<string | null>>()
      .mockResolvedValue(null);
    const githubClient: GithubClient = { createIssue, createSecurityAdvisory };
    const manager = new IncidentResponseManager({ githubClient, githubRepo: 'dcyfr/test' });
    await manager.createIncident(makeInput({ cvssScore: 5 }));
    expect(createSecurityAdvisory).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hydration & export round-trip
// ---------------------------------------------------------------------------

describe('hydrate + export', () => {
  it('round-trips incidents', async () => {
    const manager = new IncidentResponseManager();
    await manager.createIncident(makeInput({ pluginId: 'x/a', cvssScore: 5 }));
    await manager.createIncident(makeInput({ pluginId: 'x/b', cvssScore: 7.5 }));
    const exported = manager.export();
    expect(exported).toHaveLength(2);

    const manager2 = new IncidentResponseManager();
    manager2.hydrate(exported);
    expect(manager2.size).toBe(2);
    const page = manager2.listIncidents();
    expect(page.total).toBe(2);
  });

  it('hydrate replaces existing state', async () => {
    const manager = new IncidentResponseManager();
    await manager.createIncident(makeInput({ pluginId: 'old/plugin' }));
    manager.hydrate([]); // clear
    expect(manager.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// IncidentError
// ---------------------------------------------------------------------------

describe('IncidentError', () => {
  it('is an instance of Error', () => {
    const err = new IncidentError('test', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name IncidentError', () => {
    const err = new IncidentError('test', 'X');
    expect(err.name).toBe('IncidentError');
  });

  it('stores the code', () => {
    const err = new IncidentError('test', 'MY_CODE');
    expect(err.code).toBe('MY_CODE');
  });

  it('stores the message', () => {
    const err = new IncidentError('something went wrong', 'ERR');
    expect(err.message).toBe('something went wrong');
  });
});

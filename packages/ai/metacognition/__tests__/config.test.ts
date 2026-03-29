/**
 * Feature flag wiring tests — ENABLE_METACOG_RUNTIME
 * TLP:AMBER - Internal Use Only
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFeatureFlag, buildRuntimeConfig } from '../config.js';

const ENV_KEY = 'ENABLE_METACOG_RUNTIME';

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe('readFeatureFlag', () => {
  it('returns false when env var is absent', () => {
    delete process.env[ENV_KEY];
    expect(readFeatureFlag()).toBe(false);
  });

  it('returns false when env var is empty string', () => {
    process.env[ENV_KEY] = '';
    expect(readFeatureFlag()).toBe(false);
  });

  it('returns false when env var is "false"', () => {
    process.env[ENV_KEY] = 'false';
    expect(readFeatureFlag()).toBe(false);
  });

  it('returns false when env var is "0"', () => {
    process.env[ENV_KEY] = '0';
    expect(readFeatureFlag()).toBe(false);
  });

  it('returns true when env var is "true"', () => {
    process.env[ENV_KEY] = 'true';
    expect(readFeatureFlag()).toBe(true);
  });

  it('returns true when env var is "TRUE" (case-insensitive)', () => {
    process.env[ENV_KEY] = 'TRUE';
    expect(readFeatureFlag()).toBe(true);
  });

  it('returns true when env var is "True" with whitespace', () => {
    process.env[ENV_KEY] = '  True  ';
    expect(readFeatureFlag()).toBe(true);
  });
});

describe('buildRuntimeConfig', () => {
  it('builds disabled config when flag is off', () => {
    delete process.env[ENV_KEY];
    const config = buildRuntimeConfig();
    expect(config.enabled).toBe(false);
    expect(config.governance.tlp_red_policy).toBe('human_required');
    expect(config.governance.production_direct_min_policy).toBe('third_party_audit');
  });

  it('builds enabled config when flag is on', () => {
    process.env[ENV_KEY] = 'true';
    const config = buildRuntimeConfig();
    expect(config.enabled).toBe(true);
  });

  it('applies overrides on top of env-derived config', () => {
    delete process.env[ENV_KEY];
    const config = buildRuntimeConfig({ enabled: true });
    expect(config.enabled).toBe(true);
  });
});

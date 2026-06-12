/**
 * sonarcloud-client unit tests — fetch is stubbed; exercises token guard,
 * metric extraction, rating/gate parsing, and error paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCodeQuality } from '../sonarcloud-client.js';

const fetchMock = vi.fn();

function gateResponse(status?: string) {
  return { projectStatus: status ? { status } : {} };
}

function measuresResponse(measures: Array<{ metric: string; value: string }>) {
  return { component: { measures } };
}

function okJson(body: unknown) {
  return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchCodeQuality', () => {
  it('fails closed when no token is configured', async () => {
    const result = await fetchCodeQuality('dcyfr_x', '');
    expect(result).toEqual({
      success: false,
      requiresManualReview: true,
      qualityGate: 'NONE',
      error: 'SONARCLOUD_TOKEN not configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses metrics, rating, and an OK gate', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/qualitygates/')
        ? okJson(gateResponse('OK'))
        : okJson(
            measuresResponse([
              { metric: 'bugs', value: '3' },
              { metric: 'vulnerabilities', value: '0' },
              { metric: 'security_hotspots', value: '0' },
              { metric: 'code_smells', value: '12' },
              { metric: 'sqale_rating', value: '2' },
              { metric: 'coverage', value: '81.4' },
            ]),
          ),
    );

    const result = await fetchCodeQuality('dcyfr_x', 'tok');

    expect(result.success).toBe(true);
    expect(result.qualityGate).toBe('OK');
    expect(result.requiresManualReview).toBe(false);
    expect(result.metrics).toEqual({
      bugs: 3,
      vulnerabilities: 0,
      securityHotspots: 0,
      codeSmells: 12,
      maintainabilityRating: 'B',
      coverage: 81.4,
    });
    // token flows into both requests
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers.Authorization).toBe('Bearer tok');
    }
  });

  it('requires manual review when hotspots or vulnerabilities exist', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/qualitygates/')
        ? okJson(gateResponse('ERROR'))
        : okJson(
            measuresResponse([
              { metric: 'vulnerabilities', value: '1' },
              { metric: 'security_hotspots', value: '4' },
            ]),
          ),
    );

    const result = await fetchCodeQuality('dcyfr_x', 'tok');

    expect(result.requiresManualReview).toBe(true);
    expect(result.qualityGate).toBe('ERROR');
  });

  it.each([
    ['WARN', 'WARN'],
    [undefined, 'NONE'],
    ['SOMETHING_ELSE', 'NONE'],
  ] as const)('maps gate status %s to %s', async (status, expected) => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/qualitygates/')
        ? okJson(gateResponse(status as string | undefined))
        : okJson(measuresResponse([])),
    );

    const result = await fetchCodeQuality('dcyfr_x', 'tok');
    expect(result.qualityGate).toBe(expected);
  });

  it('defaults missing measures to zero / unknown', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/qualitygates/') ? okJson(gateResponse('OK')) : okJson({}),
    );

    const result = await fetchCodeQuality('dcyfr_x', 'tok');

    expect(result.metrics).toEqual({
      bugs: 0,
      vulnerabilities: 0,
      securityHotspots: 0,
      codeSmells: 0,
      maintainabilityRating: 'unknown',
      coverage: 0,
    });
  });

  it('reports HTTP failures with the status code', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });

    const result = await fetchCodeQuality('dcyfr_x', 'tok');

    expect(result.success).toBe(false);
    expect(result.requiresManualReview).toBe(true);
    expect(result.qualityGate).toBe('NONE');
    expect(result.error).toContain('403');
  });

  it('reports network-level failures', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const result = await fetchCodeQuality('dcyfr_x', 'tok');

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNRESET');
  });
});

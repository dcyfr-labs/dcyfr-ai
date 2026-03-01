/**
 * SonarCloud API Client
 *
 * Fetches code quality metrics for a plugin project via the SonarCloud Web API.
 * Requires SONARCLOUD_TOKEN environment variable.
 *
 * @module plugins/security/sonarcloud-client
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import type { CodeQualityResult, CodeQualityMetrics } from './types.js';

const SONARCLOUD_API_BASE = 'https://sonarcloud.io/api';

// ---------------------------------------------------------------------------
// API response shapes (subset)
// ---------------------------------------------------------------------------

interface SonarMeasure {
  metric: string;
  value: string;
}

interface SonarProjectStatusResponse {
  projectStatus?: {
    status?: string;
  };
}

interface SonarMeasuresResponse {
  component?: {
    measures?: SonarMeasure[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMaintainabilityRating(
  value: string,
): CodeQualityMetrics['maintainabilityRating'] {
  const map: Record<string, CodeQualityMetrics['maintainabilityRating']> = {
    '1': 'A',
    '2': 'B',
    '3': 'C',
    '4': 'D',
    '5': 'E',
  };
  return map[value] ?? 'unknown';
}

function extractMetric(measures: SonarMeasure[], key: string): number {
  const m = measures.find((m) => m.metric === key);
  return m ? Number.parseInt(m.value, 10) : 0;
}

function extractFloat(measures: SonarMeasure[], key: string): number {
  const m = measures.find((m) => m.metric === key);
  return m ? Number.parseFloat(m.value) : 0;
}

function parseQualityGate(
  status?: string,
): CodeQualityResult['qualityGate'] {
  if (status === 'OK') return 'OK';
  if (status === 'WARN') return 'WARN';
  if (status === 'ERROR') return 'ERROR';
  return 'NONE';
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`SonarCloud API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch code quality metrics for a plugin from SonarCloud.
 *
 * @param projectKey  SonarCloud project key (e.g. "dcyfr_my-plugin")
 * @param token       SonarCloud API token (defaults to SONARCLOUD_TOKEN env var)
 */
export async function fetchCodeQuality(
  projectKey: string,
  token: string = process.env.SONARCLOUD_TOKEN ?? '',
): Promise<CodeQualityResult> {
  if (!token) {
    return {
      success: false,
      requiresManualReview: true,
      qualityGate: 'NONE',
      error: 'SONARCLOUD_TOKEN not configured',
    };
  }

  try {
    const [qualityGateData, measuresData] = await Promise.all([
      fetchJson<SonarProjectStatusResponse>(
        `${SONARCLOUD_API_BASE}/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`,
        token,
      ),
      fetchJson<SonarMeasuresResponse>(
        `${SONARCLOUD_API_BASE}/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=bugs,vulnerabilities,security_hotspots,code_smells,sqale_rating,coverage`,
        token,
      ),
    ]);

    const measures = measuresData.component?.measures ?? [];
    const metrics: CodeQualityMetrics = {
      bugs: extractMetric(measures, 'bugs'),
      vulnerabilities: extractMetric(measures, 'vulnerabilities'),
      securityHotspots: extractMetric(measures, 'security_hotspots'),
      codeSmells: extractMetric(measures, 'code_smells'),
      maintainabilityRating: parseMaintainabilityRating(
        measures.find((m) => m.metric === 'sqale_rating')?.value ?? '',
      ),
      coverage: extractFloat(measures, 'coverage'),
    };

    const qualityGate = parseQualityGate(
      qualityGateData.projectStatus?.status,
    );

    // Security hotspots always require manual review
    const requiresManualReview =
      metrics.securityHotspots > 0 || metrics.vulnerabilities > 0;

    return {
      success: true,
      metrics,
      requiresManualReview,
      qualityGate,
    };
  } catch (err) {
    return {
      success: false,
      requiresManualReview: true,
      qualityGate: 'NONE',
      error: String(err),
    };
  }
}

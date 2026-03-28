/**
 * Prompt Security Scan Worker
 *
 * Background execution engine for prompt security scans.
 * Implements the Validate→Queue→Respond pattern with:
 * - Deterministic state transitions (queued → running → complete | failed)
 * - Retry with exponential backoff
 * - Timeout guarantees (terminal state always reached)
 * - Audit trail via structured result
 *
 * @module security/prompt-scan-worker
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScanState = 'queued' | 'running' | 'complete' | 'failed';

export interface ThreatMatch {
  pattern: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  source: 'iopc' | 'taxonomy' | 'pattern';
  details?: string;
}

export interface ScanOptions {
  maxRiskScore?: number;
  checkPatterns?: boolean;
  checkIoPC?: boolean;
}

export interface ScanInput {
  scanId: string;
  prompt: string;
  context?: string;
  options?: ScanOptions;
}

export interface ScanOutput {
  scanId: string;
  safe: boolean;
  riskScore: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'safe';
  findings: ThreatMatch[];
  remediationSummary: string;
  durationMs: number;
  attempts: number;
}

export type WorkerResult =
  | { success: true; output: ScanOutput }
  | { success: false; error: string; finalAttempt: number };

// ─── Local Pattern Detection ──────────────────────────────────────────────────

const LOCAL_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  severity: ThreatMatch['severity'];
  confidence: number;
}> = [
  {
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|commands?)/i,
    category: 'prompt-injection',
    severity: 'high',
    confidence: 0.9,
  },
  {
    pattern: /(system\s+prompt|you\s+are\s+now|forget\s+everything|new\s+instructions?|disregard|override)/i,
    category: 'prompt-override',
    severity: 'high',
    confidence: 0.85,
  },
  {
    pattern: /(tell\s+me|what\s+(is|are))\s+(the|your)\s+(system|initial|original)\s+(prompt|instructions?)/i,
    category: 'prompt-leakage',
    severity: 'medium',
    confidence: 0.8,
  },
  {
    pattern: /```[\s\S]*(?:exec|eval|require|import)[\s\S]*```/i,
    category: 'code-injection',
    severity: 'critical',
    confidence: 0.95,
  },
  {
    pattern: /<script[^>]*>[\s\S]*<\/script>/i,
    category: 'xss-attempt',
    severity: 'high',
    confidence: 0.9,
  },
  {
    pattern: /\bon\w+\s*=/i,
    category: 'xss-attempt',
    severity: 'high',
    confidence: 0.85,
  },
  {
    pattern: /(javascript:|data:text\/html|vbscript:)/i,
    category: 'xss-attempt',
    severity: 'high',
    confidence: 0.9,
  },
];

// ─── Core Analysis ────────────────────────────────────────────────────────────

function checkLocalPatterns(prompt: string): ThreatMatch[] {
  const matches: ThreatMatch[] = [];
  for (const { pattern, category, severity, confidence } of LOCAL_PATTERNS) {
    if (pattern.test(prompt)) {
      matches.push({ pattern: pattern.source, category, severity, confidence, source: 'pattern' });
    }
  }
  return matches;
}

function calculateRiskScore(findings: ThreatMatch[]): number {
  if (findings.length === 0) return 0;
  const weights = { critical: 100, high: 75, medium: 50, low: 25 } as const;
  let totalScore = 0;
  let totalWeight = 0;
  for (const f of findings) {
    totalScore += weights[f.severity] * f.confidence;
    totalWeight += f.confidence;
  }
  const avg = totalWeight > 0 ? totalScore / totalWeight : 0;
  const multiplier = Math.min(1 + (findings.length - 1) * 0.1, 1.5);
  return Math.min(Math.round(avg * multiplier), 100);
}

function determineSeverity(findings: ThreatMatch[], riskScore: number): ScanOutput['severity'] {
  if (findings.length === 0) return 'safe';
  if (findings.some((f) => f.severity === 'critical') || riskScore >= 90) return 'critical';
  if (findings.some((f) => f.severity === 'high') || riskScore >= 70) return 'high';
  if (findings.some((f) => f.severity === 'medium') || riskScore >= 40) return 'medium';
  return 'low';
}

function buildRemediationSummary(findings: ThreatMatch[], severity: ScanOutput['severity']): string {
  if (findings.length === 0) return 'No threats detected. Prompt appears safe.';
  const categories = [...new Set(findings.map((f) => f.category))];
  const lines: string[] = [
    `Severity: ${severity.toUpperCase()} — ${findings.length} finding(s) across ${categories.length} category(ies).`,
  ];
  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat);
    const topSeverity = catFindings.reduce<ThreatMatch['severity']>((acc, f) => {
      const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
      return rank[f.severity] > rank[acc] ? f.severity : acc;
    }, 'low');
    lines.push(`• ${cat}: ${catFindings.length} match(es), highest severity ${topSeverity}`);
  }
  lines.push('Recommendation: Review flagged patterns and sanitize or reject the prompt before processing.');
  return lines.join('\n');
}

/** Execute a single scan attempt — throws on error */
async function attemptScan(input: ScanInput, maxRiskScore: number): Promise<ScanOutput> {
  const start = Date.now();
  const findings = checkLocalPatterns(input.prompt);
  const riskScore = calculateRiskScore(findings);
  const severity = determineSeverity(findings, riskScore);
  const safe = riskScore <= maxRiskScore && severity !== 'critical';
  const remediationSummary = buildRemediationSummary(findings, severity);

  return {
    scanId: input.scanId,
    safe,
    riskScore,
    severity,
    findings,
    remediationSummary,
    durationMs: Date.now() - start,
    attempts: 1, // caller accumulates total attempts
  };
}

// ─── Worker Entry Point ───────────────────────────────────────────────────────

const DEFAULT_MAX_RISK_SCORE = 70;
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const SCAN_TIMEOUT_MS = 30_000;

/**
 * Execute a prompt security scan with retry/timeout guarantees.
 *
 * Guarantees terminal state (complete or failed) within SCAN_TIMEOUT_MS.
 * Retries up to DEFAULT_MAX_ATTEMPTS times with exponential backoff.
 * Emits structured audit events via onStateChange callback.
 */
export async function executePromptScan(
  input: ScanInput,
  opts: {
    maxAttempts?: number;
    timeoutMs?: number;
    onStateChange?: (state: ScanState, attempt: number) => void;
  } = {}
): Promise<WorkerResult> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = opts.timeoutMs ?? SCAN_TIMEOUT_MS;
  const maxRiskScore = input.options?.maxRiskScore ?? DEFAULT_MAX_RISK_SCORE;

  const deadline = Date.now() + timeoutMs;
  let lastError = 'Unknown error';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() >= deadline) {
      break;
    }

    opts.onStateChange?.('running', attempt);

    try {
      const output = await Promise.race([
        attemptScan(input, maxRiskScore),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Scan timed out')), Math.max(0, deadline - Date.now()))
        ),
      ]);

      return {
        success: true,
        output: { ...output, attempts: attempt },
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts && Date.now() < deadline) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, Math.min(backoff, deadline - Date.now())));
      }
    }
  }

  opts.onStateChange?.('failed', maxAttempts);
  return { success: false, error: lastError, finalAttempt: maxAttempts };
}

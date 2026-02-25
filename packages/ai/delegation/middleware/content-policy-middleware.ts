/**
 * Content Policy Middleware — task instruction sanitization
 * TLP:AMBER - Internal Use Only
 *
 * Checks `context.task_content` for prompt-injection patterns and content-policy
 * violations.  Only fires when `content_security` feature flag is enabled and
 * task_content is provided.
 *
 * @module delegation/middleware/content-policy-middleware
 * @version 1.0.0
 * @date 2026-02-24
 */

import type { SecurityMiddleware, SecurityContext, SecurityVerdict } from '../../types/security-middleware.js';

/**
 * Configurable content policy rules.
 * Each rule is a named regex pattern that blocks or warns depending on severity.
 */
export interface ContentRule {
  name: string;
  pattern: RegExp;
  severity: 'block' | 'warn';
  message: string;
}

/** Default rules targeting common prompt injection vectors */
const DEFAULT_RULES: ContentRule[] = [
  {
    name: 'ignore_previous_instructions',
    pattern: /ignore\s+(all\s+)?previous\s+(instructions|constraints|rules)/i,
    severity: 'block',
    message: 'Prompt injection attempt: ignore-previous-instructions pattern detected.',
  },
  {
    name: 'system_override',
    pattern: /\[SYSTEM\]|\[OVERRIDE\]|\[ADMIN\]|\[ROOT\]/,
    severity: 'block',
    message: 'Prompt injection attempt: system-override tag detected.',
  },
  {
    name: 'jailbreak_phrase',
    pattern: /DAN mode|jailbreak|developer mode enabled/i,
    severity: 'block',
    message: 'Prompt injection attempt: known jailbreak phrase detected.',
  },
  {
    name: 'exfiltrate_credentials',
    pattern: /exfiltrate|steal\s+(api\s+)?key|dump\s+credentials/i,
    severity: 'block',
    message: 'Content policy violation: credential-exfiltration language detected.',
  },
  {
    name: 'eval_execute_shell',
    pattern: /\beval\s*\(|\bexec\s*\(|\bspawn\s*\(|subprocess\.run/i,
    severity: 'warn',
    message: 'Advisory: instruction contains execution-like language — review carefully.',
  },
];

export class ContentPolicyMiddleware implements SecurityMiddleware {
  readonly name = 'content-policy';
  readonly featureFlag = 'content_security';

  private readonly rules: ContentRule[];

  constructor(rules?: ContentRule[]) {
    this.rules = rules ?? DEFAULT_RULES;
  }

  async evaluate(context: SecurityContext): Promise<SecurityVerdict> {
    const tc = context.task_content;
    if (!tc) return { action: 'allow' };

    const target = [tc.instruction, tc.context].filter(Boolean).join('\n');

    for (const rule of this.rules) {
      if (rule.pattern.test(target)) {
        if (rule.severity === 'block') {
          return {
            action: 'block',
            reason: rule.message,
            threat_type: 'content_policy_violation',
            severity: 'high',
            evidence: { rule: rule.name },
          };
        }
        // warn — keep checking other rules
        return {
          action: 'warn',
          reason: rule.message,
          threat_type: 'content_policy_violation',
          severity: 'medium',
          evidence: { rule: rule.name },
        };
      }
    }

    return { action: 'allow' };
  }
}

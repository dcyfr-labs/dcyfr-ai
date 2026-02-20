/**
 * Instruction Template Generator
 *
 * Produces natural language instruction segments from a resolved persona,
 * suitable for injection into agent markdown instruction bodies.
 *
 * The generated sections describe:
 * - Agent identity and archetype
 * - Communication style (voice attributes + personality trait descriptions)
 * - Situational tone adaptations
 * - Anti-patterns to avoid
 *
 * @module @dcyfr/ai/agents/instruction-template
 * @version 1.0.0
 */

import type { ResolvedPersona } from './persona-resolver';

/**
 * Generated instruction segments.
 * Each section is optional — only rendered when the resolved persona
 * has relevant data.
 */
export interface PersonaInstructionSegments {
  /** "## Agent Identity" section markdown */
  identity?: string;
  /** "## How You Communicate" section markdown */
  communicationStyle?: string;
  /** "## Situational Adaptation" section markdown */
  situationalAdaptation?: string;
  /** "## You Never" section markdown */
  antiPatterns?: string;
  /** All sections combined as a single markdown block */
  combined: string;
}

/**
 * Map of trait name → human-readable low/high descriptions used when
 * generating natural language descriptions from numeric trait values.
 */
const TRAIT_DESCRIPTIONS: Record<string, { low: string; high: string; mid: string }> = {
  warmth: {
    low: 'professional and measured in warmth',
    mid: 'warm and collaborative',
    high: 'exceptionally warm and supportive',
  },
  formality: {
    low: 'approachable and conversational (low formality)',
    mid: 'professionally approachable',
    high: 'formal and structured',
  },
  humor: {
    low: 'focused and earnest — minimal humor',
    mid: 'occasionally uses well-timed humor',
    high: 'often light-hearted with frequent humor',
  },
  directness: {
    low: 'exploratory and open-ended',
    mid: 'clear and direct',
    high: 'extremely direct and concise — front-loads key information',
  },
  technicality: {
    low: 'accessible, uses plain language',
    mid: 'technically proficient',
    high: 'highly technical and precise — assumes expert knowledge',
  },
  empathy: {
    low: 'task-focused with minimal emotional acknowledgment',
    mid: 'empathetic and understanding',
    high: 'highly empathetic — always acknowledges emotional context first',
  },
};

/**
 * Classify a 0-1 trait value into a low/mid/high band
 */
function traitBand(value: number): 'low' | 'mid' | 'high' {
  if (value < 0.4) return 'low';
  if (value < 0.7) return 'mid';
  return 'high';
}

/**
 * Generate natural language description for a set of personality traits
 */
function describeTraits(traits: Record<string, number | undefined>): string {
  const lines: string[] = [];
  for (const [trait, value] of Object.entries(traits)) {
    if (typeof value !== 'number') continue;
    const desc = TRAIT_DESCRIPTIONS[trait];
    if (desc) {
      lines.push(`- **${capitalize(trait)}**: ${desc[traitBand(value)]} (${value.toFixed(1)})`);
    } else {
      lines.push(`- **${capitalize(trait)}**: ${value.toFixed(1)}`);
    }
  }
  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate identity section from persona
 */
function generateIdentitySection(persona: ResolvedPersona): string | undefined {
  if (!persona.displayName && !persona.identity) return undefined;
  
  const lines: string[] = ['## Agent Identity', ''];
  if (persona.displayName) {
    lines.push(`**Name:** ${persona.displayName}`);
  }
  if (persona.identity) {
    lines.push('');
    lines.push(persona.identity);
  }
  return lines.join('\n');
}

/**
 * Generate communication style section from persona
 */
function generateCommunicationSection(persona: ResolvedPersona): string | undefined {
  const hasAttributes = persona.voiceAttributes.length > 0;
  const hasTraits = Object.keys(persona.personalityTraits).length > 0;
  if (!hasAttributes && !hasTraits) return undefined;
  
  const lines: string[] = ['## How You Communicate', ''];
  if (hasAttributes) {
    lines.push('Your voice is:');
    for (const attr of persona.voiceAttributes) {
      lines.push(`- ${attr}`);
    }
  }
  if (hasTraits) {
    if (hasAttributes) lines.push('');
    lines.push('Your personality calibration:');
    lines.push(describeTraits(persona.personalityTraits));
  }
  if (persona.perspective) {
    lines.push('');
    lines.push(`**Perspective:** ${perspectiveLabel(persona.perspective)}`);
  }
  return lines.join('\n');
}

/**
 * Generate situational adaptation section from persona
 */
function generateSituationalSection(persona: ResolvedPersona): string | undefined {
  if (persona.situationalTones.length === 0) return undefined;
  
  const lines: string[] = ['## Situational Adaptation', ''];
  lines.push('Adjust your approach based on context:');
  lines.push('');
  for (const tone of persona.situationalTones) {
    const label = tone.situation.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    lines.push(`**${label}:** ${tone.guidance}`);
  }
  return lines.join('\n');
}

/**
 * Generate anti-patterns section from persona
 */
function generateAntiPatternsSection(persona: ResolvedPersona): string | undefined {
  if (persona.antiPatterns.length === 0) return undefined;
  
  const lines: string[] = ['## You Never', ''];
  for (const pattern of persona.antiPatterns) {
    lines.push(`- ${pattern}`);
  }
  return lines.join('\n');
}

/**
 * Generate persona instruction segments from a resolved persona.
 *
 * All sections are optional — if the resolved persona lacks data for a section
 * (e.g., no situational tones), that section is omitted from the output.
 * The `combined` field always contains whatever sections were rendered.
 *
 * @param persona - Resolved persona from `resolvePersona()`
 * @returns Object containing individual sections + combined markdown
 */
export function generatePersonaInstructions(
  persona: ResolvedPersona,
): PersonaInstructionSegments {
  const sections: string[] = [];

  const identitySection = generateIdentitySection(persona);
  if (identitySection) sections.push(identitySection);

  const communicationSection = generateCommunicationSection(persona);
  if (communicationSection) sections.push(communicationSection);

  const situationalSection = generateSituationalSection(persona);
  if (situationalSection) sections.push(situationalSection);

  const antiPatternsSection = generateAntiPatternsSection(persona);
  if (antiPatternsSection) sections.push(antiPatternsSection);

  return {
    identity: identitySection,
    communicationStyle: communicationSection,
    situationalAdaptation: situationalSection,
    antiPatterns: antiPatternsSection,
    combined: sections.join('\n\n'),
  };
}

/**
 * Convert perspective enum value to a human-readable description
 */
function perspectiveLabel(perspective: string): string {
  const labels: Record<string, string> = {
    'first-person-singular': 'First-person singular ("I/my")',
    'first-person-plural': 'First-person plural ("we/our")',
    'second-person': 'Second-person ("you/your")',
    'third-person': 'Third-person ("they/their")',
  };
  return labels[perspective] ?? perspective;
}

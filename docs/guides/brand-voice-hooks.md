<!-- TLP:CLEAR -->

# Brand Voice Hooks — Developer Guide

**Information Classification:** TLP:CLEAR (Public)  
**Last Updated:** 2026-02-22  
**Package:** `@dcyfr/ai`  
**Module:** `@dcyfr/ai` → `src/personas/hooks/before-llm-call`

---

## Overview

The brand voice hook system automatically injects DCYFR brand voice and agent
persona context into the system prompt before each LLM call. This ensures every
AI output is tonally consistent with the DCYFR brand — without requiring manual
prompt engineering per agent.

---

## Quick Start

```typescript
import { createBrandVoiceHook, loadPersona } from '@dcyfr/ai';

// 1. Create the hook
const hook = createBrandVoiceHook({
  voiceOptions: { verbosity: 2 },
});

// 2. Load or define the agent persona
const { persona } = loadPersona('dcyfr-engineer');

// 3. Execute before each LLM call
const { systemPrompt, resolvedVoice } = hook.execute({
  persona,
  systemPrompt: 'You are a helpful assistant.',
});

console.log(systemPrompt);
// → "You are Test Engineer — Testing and validation. Your primary capabilities:
//    testing, analysis, code-review. Use technical language where appropriate.
//    Assume the reader has engineering context.\n\nYou are a helpful assistant."
```

---

## API Reference

### `createBrandVoiceHook(config?)`

Factory function. Returns a `BrandVoiceHook` instance.

```typescript
const hook = createBrandVoiceHook({
  enabled: true,             // default: true
  placement: 'prepend',      // 'prepend' | 'append', default: 'prepend'
  separator: '\n\n',         // default: '\n\n'
  voiceOptions: {
    verbosity: 2,            // 0–4, default: 2
    tone: null,              // ToneProfile override, default: null (use persona/brand default)
    includeTraits: false,    // Include calibration scores at verbosity ≥ 4
    brandVoice: null,        // BrandVoice override, default: null (load from DCYFR_CONTEXT)
  },
});
```

### `hook.execute(input)`

Resolves the voice and injects it into the system prompt.

```typescript
const output = hook.execute({
  systemPrompt: 'Your current system prompt',
  persona: myPersona,   // AgentPersona (preferred)
  agentName: 'dcyfr-engineer',  // Alternative: load persona by name
  context: 'Security code review task',
});

// output.systemPrompt    — modified prompt with voice prefix
// output.resolvedVoice   — ResolvedVoice with applied tone and traits
// output.skipped         — true if hook was disabled
```

---

## Verbosity Levels

| Level | Content Added |
| --- | --- |
| `0` | Nothing (empty prefix) |
| `1` | Persona identity block (name, role, capabilities) |
| `2` | Tone guidelines (default, recommended) |
| `3` | Top 3 brand voice attributes |
| `4` | Calibration scores (requires `includeTraits: true`) |

---

## Tone Profiles

| Profile | Behaviour |
| --- | --- |
| `precise` | Unambiguous, concrete, no filler |
| `conversational` | Natural, peer-to-peer |
| `technical` | Engineering context assumed |
| `empathetic` | Acknowledge context before solutions |
| `collaborative-expert` | Knowledgeable peer (DCYFR default) |
| `patient` | Step-by-step, never rushed |
| `diagnostic` | Known/unknown/next-step framing |
| `urgent` | Action-first, skip preamble |
| `enthusiastic` | Energised, celebrates progress |

Tone resolution priority: **override → persona → brand default**

---

## Loading Agent Personas

Personas are loaded from `agents/<name>/agent.json`:

```json
{
  "name": "dcyfr-engineer",
  "title": "DCYFR Security Engineer",
  "role": "Defensive code review and security analysis",
  "capabilities": ["code-review", "security-audit", "threat-modeling"],
  "voice_tone": "technical"
}
```

```typescript
import { loadPersona, getPersona } from '@dcyfr/ai';

// With full result metadata
const { persona, source, errors } = loadPersona('dcyfr-engineer');

// Convenience — returns AgentPersona directly
const persona = getPersona('dcyfr-engineer');
```

The loader follows this resolution order:

1. In-memory cache (if `useCache: true`)
2. `<baseDir>/<agentName>/agent.json`
3. `<baseDir>/<agentName>.json`
4. Built-in default persona (if `allowFallback: true`)

---

## Working with VoiceResolver Directly

For more control, use `resolveVoice` directly without the hook wrapper:

```typescript
import { resolveVoice, loadBrandVoice } from '@dcyfr/ai';

const brandVoice = loadBrandVoice(); // reads from .github/context/DCYFR_CONTEXT.json

const voice = resolveVoice(myPersona, {
  tone: 'diagnostic',         // override tone for this call
  verbosity: 3,
  brandVoice,
});

const systemPrompt = voice.systemPrefix + '\n\n' + originalPrompt;
```

---

## Integration with Inngest / Agent Runtime

When processing agent jobs via Inngest:

```typescript
export const agentTaskHandler = inngest.createFunction(
  { id: 'agent/task.execute' },
  { event: 'agent/task.requested' },
  async ({ event }) => {
    const { agentName, systemPrompt: basePrompt } = event.data;

    const hook = createBrandVoiceHook({ voiceOptions: { verbosity: 2 } });
    const { persona } = loadPersona(agentName);
    const { systemPrompt } = hook.execute({ persona, systemPrompt: basePrompt });

    // Pass systemPrompt to your LLM call
    const result = await llm.complete({ system: systemPrompt, ... });
    return result;
  },
);
```

---

## Testing

```typescript
import { createBrandVoiceHook } from '@dcyfr/ai';
import type { BrandVoice } from '@dcyfr/ai';
import { describe, it, expect } from 'vitest';

const MOCK_BRAND_VOICE: BrandVoice = { /* ... */ };

describe('My LLM integration', () => {
  it('injects voice prefix', () => {
    const hook = createBrandVoiceHook({
      voiceOptions: { brandVoice: MOCK_BRAND_VOICE, verbosity: 1 },
    });

    const { systemPrompt } = hook.execute({
      persona: myPersona,
      systemPrompt: 'Original.',
    });

    expect(systemPrompt).toContain('My Agent Title');
  });
});
```

Pass a `brandVoice` override in `voiceOptions` to avoid filesystem reads in tests.

---

## Architecture

```text
BrandVoiceHook.execute(input)
        ↓
  PersonaLoader.loadPersona()   ← agents/<name>/agent.json
        ↓
  VoiceResolver.resolveVoice()  ← merges brand_voice + persona overrides
        ↓
  renderPersonaBlock()          ← identity block
  applyToneGuidelines()         ← tone text
        ↓
  inject into systemPrompt
```

Brand voice data flows from `.github/context/DCYFR_CONTEXT.json` → `loadBrandVoice()` → `resolveVoice()`.

---

## Related

- [src/personas/types.ts](../../packages/ai/src/personas/types.ts) — Type definitions
- [src/personas/voice-resolver.ts](../../packages/ai/src/personas/voice-resolver.ts) — VoiceResolver implementation
- [src/personas/persona-loader.ts](../../packages/ai/src/personas/persona-loader.ts) — PersonaLoader implementation
- [src/personas/hooks/before-llm-call.ts](../../packages/ai/src/personas/hooks/before-llm-call.ts) — Hook implementation
- [src/tests/personas.test.ts](../../packages/ai/src/tests/personas.test.ts) — Unit tests (34 passing)

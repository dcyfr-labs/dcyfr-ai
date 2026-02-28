# GitHub Models Quick Start Guide

**Free access to GPT-4o, Claude 3.5 Sonnet, and more with your GitHub token**

---

## Overview

GitHub Models provides free API access to premium AI models for GitHub Pro/Teams subscribers. Since you already have `GITHUB_TOKEN` configured for Copilot, you can immediately start using:

- **GPT-4o** and GPT-4o-mini (OpenAI)
- **Claude 3.5 Sonnet** (Anthropic)  
- **Llama 3.1** (Meta)
- **Mistral** and other models

**Cost:** $0 with your existing GitHub Pro/Teams subscription

---

## Quick Setup

### 1. Verify GITHUB_TOKEN

```bash
# Your token should already be set
echo $GITHUB_TOKEN
```

### 2. Configure as Primary Provider

**Option A: Environment Variables**

```bash
export LLM_PROVIDER=github-models
export LLM_MODEL=gpt-4o  # or claude-3-5-sonnet-20241022
```

**Option B: Programmatic Configuration**

```typescript
import { ProviderRegistry } from '@dcyfr/ai/core/provider-registry';

const registry = new ProviderRegistry({
  primaryProvider: 'github-models',
  fallbackChain: ['anthropic', 'ollama'],
  autoReturn: true,
  healthCheckInterval: 60000,
});
```

### 3. Use in Your Code

```typescript
import { AgentRuntime } from '@dcyfr/ai/runtime';

const agent = new AgentRuntime({
  name: 'my-agent',
  provider: 'github-models',  // Uses GITHUB_TOKEN automatically
  model: 'gpt-4o',
});

// Execute tasks normally
const result = await agent.execute({
  type: 'code_generation',
  description: 'Create a TypeScript function',
});
```

---

## Available Models

### Recommended Models

```bash
# GPT-4o (Best for general tasks)
LLM_MODEL=gpt-4o

# GPT-4o-mini (Fast, efficient)
LLM_MODEL=gpt-4o-mini

# Claude 3.5 Sonnet (Great for code)
LLM_MODEL=claude-3-5-sonnet-20241022

# Llama 3.1 70B (Open source)
LLM_MODEL=llama-3.1-70b-instruct
```

### Full Model List

Check available models:
```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://models.inference.ai.azure.com/models
```

---

## Rate Limits

**Free Tier (GitHub Pro/Teams):**
- 10 requests/minute per model
- 50 requests/day per model
- Varies by model

**Monitor Usage:**
- GitHub Settings: https://github.com/settings/tokens
- View token usage and rate limit status

**For Higher Limits:**
- Use direct provider APIs (OpenAI, Anthropic)
- Configure as fallback: `fallbackChain: ['github-models', 'openai']`

---

## Use Cases

### ✅ Perfect For

- **CI/CD Workflows** - Already have GITHUB_TOKEN in Actions
- **Development** - Free access to premium models
- **Testing** - Validate against multiple models
- **Cost Optimization** - Free tier for low-volume production

### ⚠️ Consider Alternatives For

- **High-Volume Production** - Direct APIs have higher limits
- **Enterprise SLAs** - Direct provider support
- **Specialized Features** - Some model-specific features may differ

---

## Examples

### Example 1: Code Review Agent

```typescript
import { AgentRuntime } from '@dcyfr/ai/runtime';

const reviewer = new AgentRuntime({
  name: 'code-reviewer',
  provider: 'github-models',
  model: 'claude-3-5-sonnet-20241022',  // Great for code
});

const review = await reviewer.execute({
  type: 'code_review',
  description: 'Review authentication.ts for security issues',
  context: { code: fileContent },
});
```

### Example 2: Multi-Model Comparison

```typescript
const models = ['gpt-4o', 'claude-3-5-sonnet-20241022', 'llama-3.1-70b-instruct'];

const results = await Promise.all(
  models.map(model => 
    new AgentRuntime({
      name: `agent-${model}`,
      provider: 'github-models',
      model,
    }).execute(task)
  )
);

// Compare outputs across models
console.log(results.map(r => r.output));
```

### Example 3: GitHub Actions Integration

```yaml
name: AI Code Review
on: pull_request

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run AI Review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Already available
          LLM_PROVIDER: github-models
          LLM_MODEL: gpt-4o
        run: |
          npm install
          npm run ai:review
```

---

## Troubleshooting

### "GITHUB_TOKEN not found"

```bash
# Verify token is set
echo $GITHUB_TOKEN | wc -c  # Should be >40 chars

# Set if missing
export GITHUB_TOKEN=ghp_your_token_here
```

### "Rate limit exceeded"

```bash
# Switch to fallback provider
export LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-your-key

# Or configure automatic fallback
fallbackChain: ['github-models', 'openai', 'ollama']
```

### "Model not available"

```bash
# List available models
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://models.inference.ai.azure.com/models | jq '.data[].id'

# Use a different model
export LLM_MODEL=gpt-4o-mini
```

---

## Next Steps

- **Full Documentation**: [PROVIDER_INTEGRATIONS.md](../PROVIDER_INTEGRATIONS.md)
- **Provider Registry**: [Provider Registry API](../api/provider-registry.md)
- **Agent Runtime**: [Agent Runtime Guide](../guides/agent-runtime.md)

---

**Version:** 1.0.0  
**Last Updated:** February 28, 2026  
**Scope:** @dcyfr/ai v2.1.3+

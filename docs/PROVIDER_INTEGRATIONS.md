# LLM Provider Integrations

**Complete guide to connecting DCYFR AI with various LLM providers**

---

## Overview

DCYFR AI supports multiple LLM providers through a unified configuration system. Choose the provider that best fits your needs: cloud APIs, local models, or multi-model routing proxies.

## Supported Providers

| Provider | Type | Use Case | Cost |
|----------|------|----------|------|
| **Msty Vibe CLI Proxy** | Local Proxy | Multi-model routing, unified interface | Variable (based on models) |
| **OpenAI** | Cloud API | Production workloads, GPT-4/GPT-3.5 | Pay-per-use |
| **Anthropic** | Cloud API | Claude models, long context | Pay-per-use |
| **Ollama** | Local | Offline development, privacy | Free (local compute) |
| **GitHub Copilot** | Via Proxy | Code assistance, enterprise | Subscription |

---

## 🎯 Msty Studio Vibe CLI Proxy (Recommended for Development)

**Multi-model local routing with unified OpenAI-compatible API**

### Features

- **Unified Interface**: Single endpoint for multiple AI providers
- **Model Routing**: Automatically routes requests to appropriate provider
- **Supported Models**:
  - Claude Code (Anthropic)
  - OpenAI Codex (GPT-4, GPT-3.5)
  - GitHub Copilot
  - Google Gemini
  - Qwen Code
  - iFlow
  - Antigravity

### Setup

1. **Install Msty Studio**
   - Download from: [https://msty.app](https://msty.app)
   - Enable Vibe CLI Proxy feature

2. **Start Vibe CLI Proxy**
   ```bash
   # Default endpoint: http://localhost:8317
   # Verify it's running:
   curl http://localhost:8317/v1/models
   ```

3. **Configure DCYFR AI**
   ```bash
   # In dcyfr-ai/.env:
   LLM_PROVIDER=openai
   OPENAI_API_BASE=http://localhost:8317/v1
   OPENAI_API_KEY=msty-vibe-proxy  # Any non-empty value
   LLM_MODEL=gpt-4  # Or claude-3-5-sonnet, copilot-gpt-4, etc.
   ```

4. **Test Connection**
   ```bash
   cd dcyfr-ai
   npm run test:run
   ```

### Supported Models

```bash
# GPT Models (via OpenAI)
LLM_MODEL=gpt-4
LLM_MODEL=gpt-4-turbo
LLM_MODEL=gpt-3.5-turbo

# Claude Models (via Anthropic)
LLM_MODEL=claude-3-5-sonnet
LLM_MODEL=claude-3-opus
LLM_MODEL=claude-3-haiku

# GitHub Copilot
LLM_MODEL=copilot-gpt-4
LLM_MODEL=copilot-gpt-3.5

# Google Gemini
LLM_MODEL=gemini-pro
LLM_MODEL=gemini-ultra

# Qwen Code
LLM_MODEL=qwen-coder-plus
LLM_MODEL=qwen-2.5-coder
```

### Benefits

✅ **Single Configuration**: One endpoint for all models  
✅ **Model Switching**: Change models without reconfiguring  
✅ **Local Routing**: Privacy-friendly request routing  
✅ **Cost Management**: Use different models for different tasks  
✅ **Fallback Support**: Automatic failover between providers

### Documentation

- **Official Docs**: [https://docs.msty.studio/features/vibe-cli-proxy](https://docs.msty.studio/features/vibe-cli-proxy)
- **Model Catalog**: Check Msty Studio UI for available models
- **API Compatibility**: Full OpenAI API compatibility

---

## 🌐 OpenAI (Direct)

**Production-ready cloud API for GPT models**

### Setup

```bash
# Get API key from: https://platform.openai.com/api-keys
export OPENAI_API_KEY="sk-..."
export LLM_PROVIDER=openai
export LLM_MODEL=gpt-4
export LLM_EMBEDDING_MODEL=text-embedding-3-small
```

### Recommended Models

- **GPT-4 Turbo**: Best quality, higher cost
- **GPT-3.5 Turbo**: Fast, cost-effective
- **text-embedding-3-small**: Embeddings for memory

### Pricing

- GPT-4 Turbo: $0.01/1K prompt, $0.03/1K completion
- GPT-3.5 Turbo: $0.0005/1K prompt, $0.0015/1K completion
- Embeddings: $0.00002/1K tokens

---

## 🧠 Anthropic (Direct)

**Claude models for long-context tasks**

### Setup

```bash
# Get API key from: https://console.anthropic.com/account/keys
export ANTHROPIC_API_KEY="sk-ant-..."
export LLM_PROVIDER=anthropic
export LLM_MODEL=claude-3-5-sonnet
```

### Recommended Models

- **Claude 3.5 Sonnet**: Best balance of speed/quality
- **Claude 3 Opus**: Highest quality
- **Claude 3 Haiku**: Fastest, most economical

### Pricing

- Claude 3.5 Sonnet: $0.003/1K prompt, $0.015/1K completion
- Claude 3 Opus: $0.015/1K prompt, $0.075/1K completion
- Claude 3 Haiku: $0.00025/1K prompt, $0.00125/1K completion

---

## 🦙 Ollama (Local)

**Run LLMs locally without cloud dependencies**

### Setup

1. **Install Ollama**
   ```bash
   # macOS
   brew install ollama
   
   # Linux
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull Models**
   ```bash
   ollama pull llama3.1
   ollama pull codellama
   ollama pull mistral
   ```

3. **Configure DCYFR AI**
   ```bash
   export OLLAMA_URL=http://localhost:11434
   export LLM_PROVIDER=custom
   export LLM_API_BASE=http://localhost:11434/v1
   export LLM_MODEL=llama3.1
   ```

### Benefits

✅ **Privacy**: All processing local  
✅ **No Cost**: Free compute (uses local resources)  
✅ **Offline**: Works without internet  
✅ **Customizable**: Fine-tune your own models

### Limitations

❌ Slower than cloud APIs  
❌ Requires powerful hardware  
❌ Limited model selection

---

## 🔄 Provider Fallback Strategy

Configure multiple providers for automatic fallback:

```typescript
// In AgentRuntime configuration
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  primaryProvider: 'openai',  // Try first
  fallbackChain: ['anthropic', 'ollama'],  // Fallback order
  autoReturn: true,  // Return to primary when healthy
});
```

### Fallback Scenarios

1. **Rate Limiting**: Auto-switch when hitting rate limits
2. **Errors**: Fall back on API errors
3. **Timeouts**: Switch on slow responses
4. **Cost Management**: Use cheaper models as fallback

---

## 🧪 Testing Provider Configuration

### Verify Connection

```bash
cd dcyfr-ai
npm run test:run -- --grep "provider"
```

### Test Specific Model

```typescript
import { AgentRuntime } from '@dcyfr/ai/runtime';

const runtime = new AgentRuntime(/* ... */);
const result = await runtime.execute({
  task: 'What is 2 + 2?',
  userId: 'test-user',
  sessionId: 'test-session',
});

console.log('Provider used:', result.metadata?.provider);
console.log('Model used:', result.metadata?.model);
```

### Health Check

```bash
# OpenAI
curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"

# Anthropic  
curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY"

# Msty Vibe CLI Proxy
curl http://localhost:8317/v1/models

# Ollama
curl http://localhost:11434/api/tags
```

---

## 📊 Cost Comparison

**Example: 1M tokens/month workload**

| Provider | Configuration | Monthly Cost |
|----------|--------------|--------------|
| Msty + Ollama | Local routing + local models | $0 (compute only) |
| GPT-3.5 Turbo | Direct OpenAI | ~$2-6 |
| GPT-4 Turbo | Direct OpenAI | ~$40-140 |
| Claude 3.5 Sonnet | Direct Anthropic | ~$18-90 |
| Msty + Mixed | GPT-3.5 primary, Ollama fallback | ~$1-3 |

---

## 🔒 Security Best Practices

### API Key Management

```bash
# ✅ DO: Use environment variables
export OPENAI_API_KEY="sk-..."

# ❌ DON'T: Hardcode in source code
const apiKey = "sk-...";  // Never do this!

# ✅ DO: Use .env files (gitignored)
echo "OPENAI_API_KEY=sk-..." >> .env

# ✅ DO: Use secret managers in production
# AWS Secrets Manager, Azure Key Vault, etc.
```

### Network Security

```bash
# Msty Vibe CLI Proxy: Restrict to localhost
OPENAI_API_BASE=http://localhost:8317/v1  # ✅ Local only

# Cloud APIs: Use HTTPS only
OPENAI_API_BASE=https://api.openai.com/v1  # ✅ Secure

# Custom proxies: Verify SSL certificates
OPENAI_API_BASE=https://your-proxy.com/v1  # ✅ With valid cert
```

---

## 🚀 Quick Start Configurations

### Development (Msty Vibe)

```bash
# .env
LLM_PROVIDER=openai
OPENAI_API_BASE=http://localhost:8317/v1
OPENAI_API_KEY=msty-vibe-proxy
LLM_MODEL=gpt-4
```

### Production (OpenAI + Anthropic Fallback)

```bash
# .env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-real-key
ANTHROPIC_API_KEY=sk-ant-real-key
LLM_MODEL=gpt-4-turbo
```

### Offline (Ollama)

```bash
# .env
LLM_PROVIDER=custom
LLM_API_BASE=http://localhost:11434/v1
LLM_MODEL=llama3.1
OLLAMA_URL=http://localhost:11434
```

---

## 📚 Additional Resources

- **Msty Studio Docs**: https://docs.msty.studio/
- **OpenAI Platform**: https://platform.openai.com/
- **Anthropic Console**: https://console.anthropic.com/
- **Ollama Docs**: https://ollama.com/docs
- **DCYFR AI README**: [../README.md](../README.md)
- **Memory Setup**: [MEMORY_SETUP.md](MEMORY_SETUP.md)

---

**Last Updated**: February 12, 2026  
**Version**: 1.0.4

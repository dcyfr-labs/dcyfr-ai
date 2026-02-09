<!-- TLP:CLEAR -->
# Memory Layer Setup Guide

**Information Classification:** TLP:CLEAR (Public)  
**Last Updated:** February 8, 2026

---

## Overview

DCYFR AI includes a memory layer powered by [mem0](https://mem0.ai/) that provides:
- **User Memory:** Persistent user preferences and context across sessions
- **Agent Memory:** Workflow state for multi-step agent tasks
- **Session Memory:** Temporary context within a single conversation

This guide walks through setting up the memory layer for local development and production.

---

## Quick Start (Local Development with Qdrant)

### 1. Start Qdrant Vector Database

```bash
cd dcyfr-ai
docker compose up -d qdrant
```

Verify Qdrant is running:
```bash
curl http://localhost:6333/healthz
# Expected: {"title":"qdrant - vector search engine","version":"1.8.0"}
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Vector Database
VECTOR_DB_PROVIDER=qdrant
VECTOR_DB_URL=http://localhost:6333
VECTOR_DB_INDEX=dcyfr_memories

# LLM (OpenAI for embeddings)
OPENAI_API_KEY=sk-...your-key-here...
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_EMBEDDING_MODEL=text-embedding-3-small

# Caching
MEMORY_CACHE_ENABLED=true
MEMORY_CACHE_TTL=300
MEMORY_CACHE_MAX_SIZE=1000
```

### 3. Install Dependencies

```bash
npm install
```

This installs `mem0ai` package and other dependencies.

### 4. Test Memory Integration

Create `test-memory.ts`:

```typescript
import { getMemory } from '@dcyfr/ai/memory';

const memory = getMemory();

// Add user memory
const memoryId = await memory.addUserMemory(
  'user123',
  'I prefer TypeScript over JavaScript',
  { topic: 'preferences', importance: 0.9 }
);

console.log('Memory added:', memoryId);

// Search memories
const results = await memory.searchUserMemories(
  'user123',
  'programming language preferences'
);

console.log('Search results:', results);
```

Run test:
```bash
node --loader ts-node/esm test-memory.ts
```

---

## Production Setup (Pinecone)

### 1. Create Pinecone Account

1. Sign up at [pinecone.io](https://www.pinecone.io/)
2. Create a new index:
   - **Name:** `dcyfr-memories`
   - **Dimensions:** 1536 (for OpenAI text-embedding-3-small)
   - **Metric:** cosine
   - **Environment:** us-west1-gcp (or your preferred region)

### 2. Configure Production Environment

```bash
# Vector Database
VECTOR_DB_PROVIDER=pinecone
VECTOR_DB_API_KEY=your-pinecone-api-key
VECTOR_DB_ENVIRONMENT=us-west1-gcp
VECTOR_DB_INDEX=dcyfr-memories

# LLM (same as dev)
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_EMBEDDING_MODEL=text-embedding-3-small

# Caching
MEMORY_CACHE_ENABLED=true
MEMORY_CACHE_TTL=300
MEMORY_CACHE_MAX_SIZE=1000
```

### 3. Verify Connection

```typescript
import { getMemoryConfig, validateMemoryConfig } from '@dcyfr/ai/memory';

const config = getMemoryConfig();
validateMemoryConfig(config);

console.log('✅ Memory configuration valid:', config);
```

---

## API Usage

### User Memory

```typescript
import { getMemory } from '@dcyfr/ai/memory';

const memory = getMemory();

// Store user preference
await memory.addUserMemory(
  'user123',
  'I prefer dark mode and concise explanations',
  { topic: 'ui_preferences', importance: 0.8 }
);

// Search user memories
const results = await memory.searchUserMemories(
  'user123',
  'What are my UI preferences?',
  3  // limit
);

// Get all user memories
const allMemories = await memory.getUserMemories('user123');

// Get memories by topic
const uiMemories = await memory.getUserMemories('user123', 'ui_preferences');
```

### Agent Memory

```typescript
// Store agent workflow state
await memory.addAgentMemory(
  'code-reviewer',
  'session-abc123',
  {
    currentFile: 'app.ts',
    issuesFound: 3,
    reviewProgress: 0.6,
  }
);

// Retrieve agent state
const state = await memory.getAgentState('code-reviewer', 'session-abc123');

// Search agent memories
const agentResults = await memory.searchAgentMemories(
  'code-reviewer',
  'What files have I reviewed?'
);
```

### Session Memory

```typescript
// Add temporary session context
await memory.addSessionMemory(
  'session-abc123',
  'User is debugging authentication issues',
  3600  // TTL: 1 hour
);

// Get full session context (for prompt injection)
const context = await memory.getSessionContext('session-abc123');
// Use in prompt: `Previous context: ${context}`
```

### Admin Operations

```typescript
// Delete all user memories (GDPR compliance)
await memory.deleteUserMemories('user123');

// Delete session memories (cleanup)
await memory.deleteSessionMemories('session-abc123');
```

---

## Troubleshooting

### "mem0ai package not installed"

```bash
npm install mem0ai
```

### "VECTOR_DB_URL is required for Qdrant"

Ensure `.env` has:
```bash
VECTOR_DB_PROVIDER=qdrant
VECTOR_DB_URL=http://localhost:6333
```

### "mem0 connection test failed"

**Qdrant:** Check Docker container is running:
```bash
docker ps | grep qdrant
docker compose logs qdrant
```

**Pinecone:** Verify API key and environment:
```bash
curl -X GET https://controller.YOUR-ENVIRONMENT.pinecone.io/databases \
  -H "Api-Key: YOUR-API-KEY"
```

### TypeScript compilation errors

Ensure `tsconfig.json` includes memory module:
```json
{
  "compilerOptions": {
    "paths": {
      "@dcyfr/ai/*": ["./packages/ai/*"]
    }
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│ Your Application                        │
│ (dcyfr-labs, agents, chatbot)          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ @dcyfr/ai/memory                       │
│ ├── DCYFRMemory interface              │
│ ├── User/Agent/Session APIs            │
│ └── Caching layer (optional)           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ mem0 Client (mem0ai package)           │
│ ├── Vector search                      │
│ ├── Memory storage                     │
│ └── LLM integration                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Vector Database                         │
│ Qdrant (dev) or Pinecone (prod)        │
└─────────────────────────────────────────┘
```

---

## Next Steps

1. **Phase 1B:** Implement caching layer (optional optimization)
2. **Phase 1C:** Create API routes in dcyfr-labs
3. **Phase 1D:** Integration testing + documentation

---

## Resources

- [mem0 Documentation](https://docs.mem0.ai/)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [Pinecone Documentation](https://docs.pinecone.io/)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)

---

**Support:** For questions or issues, open an issue at [dcyfr-ai GitHub](https://github.com/dcyfr/dcyfr-ai/issues)

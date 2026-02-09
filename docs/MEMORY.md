<!-- TLP:CLEAR -->
# Memory Layer Integration Guide

**Information Classification:** TLP:CLEAR (Public)

The @dcyfr/ai memory layer provides persistent, semantic memory capabilities for AI agents and applications. Built on mem0's open-source memory system with enterprise-grade abstractions.

---

## Quick Start

### Installation

```bash
npm install @dcyfr/ai
```

### Basic Usage

```typescript
import { getMemory } from '@dcyfr/ai';

// Initialize memory layer (auto-configures from environment)
const memory = getMemory();

// Add a user memory
const memoryId = await memory.addUserMemory(
  'user-123',
  'I prefer TypeScript over JavaScript',
  { topic: 'programming', importance: 0.8 }
);

// Search user memories
const memories = await memory.searchUserMemories(
  'user-123',
  'programming languages',
  3 // limit
);

console.log(memories[0].content); // "I prefer TypeScript over JavaScript"
```

---

## Core Concepts

### Memory Types

**User Memory**: Personal memories tied to a specific user
```typescript
await memory.addUserMemory(userId, message, context);
const results = await memory.searchUserMemories(userId, query, limit);
```

**Agent Memory**: Memories for AI agents within sessions
```typescript
await memory.addAgentMemory(agentId, sessionId, message, context);
const results = await memory.searchAgentMemories(agentId, sessionId, query, limit);
```

**Session Memory**: Temporary memories with TTL for conversations
```typescript
await memory.addSessionMemory(sessionId, message, ttlHours);
const context = await memory.getSessionContext(sessionId);
```

### Memory Context

Optional metadata for enhanced search and organization:

```typescript
interface MemoryContext {
  topic?: string;        // Category for filtering ("programming", "personal")
  importance?: number;   // 0-1 relevance score
  metadata?: Record<string, any>; // Custom data
}
```

---

## Configuration

### Environment Variables

```bash
# Required: Vector Database
VECTOR_DB_PROVIDER=qdrant  # qdrant | pinecone | weaviate
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-api-key

# Required: LLM Provider
LLM_PROVIDER=openai  # openai | anthropic
OPENAI_API_KEY=sk-your-api-key

# Optional: Caching
ENABLE_MEMORY_CACHING=true
MEMORY_CACHE_TTL=300  # 5 minutes
```

### Supported Providers

#### Vector Databases
- **Qdrant** (recommended): Self-hosted or cloud
- **Pinecone**: Managed vector database
- **Weaviate**: Open-source vector search

#### LLM Providers  
- **OpenAI**: GPT-3.5/4 for text processing
- **Anthropic**: Claude for text processing

### Production Setup

```bash
# Docker Compose example for Qdrant
version: '3.8'
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    environment:
      QDRANT__SERVICE__HTTP_PORT: 6333
```

---

## API Reference

### DCYFRMemory Class

#### User Methods

**`addUserMemory(userId, message, context?)`**
- **Returns**: `Promise<string>` (memory ID)
- **Throws**: Error if user ID invalid or message empty

**`searchUserMemories(userId, query, limit?)`**
- **Returns**: `Promise<MemorySearchResult[]>`
- **Default limit**: 5, **Max**: 50

**`getUserMemories(userId, filter?)`**
- **Returns**: `Promise<Memory[]>`
- **Filters**: `{ topic?, limit?, offset? }`

**`deleteUserMemory(userId, memoryId)`**
- **Returns**: `Promise<boolean>` (success status)

#### Agent Methods

**`addAgentMemory(agentId, sessionId, message, context?)`**
- **Returns**: `Promise<string>` (memory ID)

**`searchAgentMemories(agentId, sessionId, query, limit?)`**
- **Returns**: `Promise<MemorySearchResult[]>`

**`getAgentState(agentId, sessionId)`**
- **Returns**: `Promise<Record<string, any> | null>`

#### Session Methods

**`addSessionMemory(sessionId, message, ttlHours?)`**
- **Returns**: `Promise<string>` (memory ID)
- **Default TTL**: 24 hours

**`getSessionContext(sessionId, maxAge?)`**
- **Returns**: `Promise<Memory[]>`
- **maxAge**: Filter memories newer than hours

**`deleteSessionMemory(sessionId)`**
- **Returns**: `Promise<boolean>`

### Types

```typescript
interface MemorySearchResult {
  id: string;
  content: string;
  owner: string;
  ownerType: 'user' | 'agent' | 'session';
  importance?: number;
  topic?: string;
  createdAt: Date;
  relevance: number; // 0-1 similarity score
}

interface Memory {
  id: string;
  content: string;
  owner: string;
  ownerType: 'user' | 'agent' | 'session';
  importance?: number;
  topic?: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}
```

---

## Error Handling

The memory layer includes comprehensive error handling:

```typescript
try {
  const memory = getMemory();
  const result = await memory.addUserMemory(userId, message);
  console.log('Memory added:', result);
} catch (error) {
  if (error.message.includes('configuration required')) {
    console.error('Memory not configured. Set VECTOR_DB_PROVIDER and LLM_PROVIDER');
  } else if (error.message.includes('Failed to add user memory')) {
    console.error('Memory service unavailable:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

Common error scenarios:
- **Configuration missing**: Set required environment variables
- **Service unavailable**: Check vector DB and LLM provider connectivity
- **Rate limiting**: Implement exponential backoff
- **Invalid input**: Validate user IDs and message content

---

## Best Practices

### Memory Content

```typescript
// ✅ Good: Specific, contextual
await memory.addUserMemory(
  'user-123',
  'Prefers React over Vue for component reusability and TypeScript support',
  { topic: 'frontend-frameworks', importance: 0.9 }
);

// ❌ Poor: Generic, no context
await memory.addUserMemory('user-123', 'likes React');
```

### Search Queries

```typescript
// ✅ Good: Specific intent
const memories = await memory.searchUserMemories(
  'user-123',
  'frontend framework preferences for TypeScript projects',
  3
);

// ❌ Poor: Too broad
const memories = await memory.searchUserMemories('user-123', 'tech');
```

### Performance

```typescript
// ✅ Batch operations when possible
const promises = messages.map(msg => 
  memory.addUserMemory(userId, msg.content, msg.context)
);
await Promise.all(promises);

// ❌ Sequential operations
for (const msg of messages) {
  await memory.addUserMemory(userId, msg.content); // Slow
}
```

### Memory Cleanup

```typescript
// Implement periodic cleanup for session memories
setInterval(async () => {
  const oldSessions = await getExpiredSessions();
  for (const sessionId of oldSessions) {
    await memory.deleteSessionMemory(sessionId);
  }
}, 24 * 60 * 60 * 1000); // Daily cleanup
```

---

## Advanced Usage

### Custom Memory Provider

```typescript
import { DCYFRMemoryImpl, createMem0Client } from '@dcyfr/ai/memory';

// Custom mem0 client configuration
const customClient = createMem0Client({
  apiKey: process.env.MEM0_API_KEY,
  baseURL: 'https://custom-instance.mem0.ai',
  timeout: 10000
});

// Use custom configuration
const memory = new DCYFRMemoryImpl(customClient);
```

### Memory Analytics

```typescript
// Track memory usage
const userMemories = await memory.getUserMemories('user-123');
console.log(`User has ${userMemories.length} memories`);

// Analyze memory topics
const topics = userMemories.reduce((acc, mem) => {
  if (mem.topic) acc[mem.topic] = (acc[mem.topic] || 0) + 1;
  return acc;
}, {});
```

### Integration with Chat Systems

```typescript
async function enhancePromptWithMemory(userId: string, prompt: string) {
  const memory = getMemory();
  
  // Get relevant memories
  const memories = await memory.searchUserMemories(userId, prompt, 3);
  
  if (memories.length === 0) return prompt;
  
  // Build context
  const context = memories
    .map(m => `- ${m.content}`)
    .join('\n');
  
  // Enhance prompt
  return `
Context from previous conversations:
${context}

Current request: ${prompt}
  `;
}
```

---

## Migration Guide

### From LongTermMemory

If migrating from an existing LongTermMemory implementation:

```typescript
// Before (LongTermMemory)
const longTerm = new LongTermMemory(config);
await longTerm.store(userId, message);
const results = await longTerm.search(userId, query);

// After (DCYFRMemory)
const memory = getMemory();
await memory.addUserMemory(userId, message);
const results = await memory.searchUserMemories(userId, query);
```

**Key Differences:**
1. **Method names**: `store` → `addUserMemory`, `search` → `searchUserMemories`
2. **Configuration**: Environment-based vs constructor injection
3. **Types**: More specific interfaces with better TypeScript support
4. **Error handling**: Standardized error messages and types

---

## Troubleshooting

### Common Issues

**"Memory configuration required for first-time initialization"**
- Solution: Set `VECTOR_DB_PROVIDER` and `LLM_PROVIDER` environment variables

**"Failed to connect to vector database"**
- Check vector DB URL and API key
- Verify network connectivity  
- Ensure vector DB is running

**"Rate limit exceeded"**
- Implement exponential backoff
- Consider memory caching
- Reduce query frequency

**Search returns empty results**
- Check if memories exist for user
- Try broader search terms
- Verify user ID consistency

### Debug Mode

```typescript
// Enable debug logging
process.env.DEBUG = 'dcyfr:memory*';
```

### Health Checks

```typescript
// Verify memory system health
async function checkMemoryHealth() {
  try {
    const memory = getMemory();
    const testId = await memory.addUserMemory('health-check', 'test message');
    const results = await memory.searchUserMemories('health-check', 'test', 1);
    await memory.deleteUserMemory('health-check', testId);
    return results.length > 0;
  } catch (error) {
    console.error('Memory health check failed:', error);
    return false;
  }
}
```

---

## Links

- [mem0 Documentation](https://docs.mem0.ai/)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [DCYFR AI Framework](https://github.com/dcyfr/dcyfr-ai)

---

**Last Updated:** February 8, 2026  
**Version:** @dcyfr/ai v1.0.0+
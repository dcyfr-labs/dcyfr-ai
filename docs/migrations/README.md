# Migration Guides

This directory contains migration guides to help you transition from other AI frameworks to @dcyfr/ai.

## Migration Overview

| Framework | Complexity | Time Estimate | Key Benefits |
|-----------|------------|---------------|--------------|
| LangChain | Medium | 4-8 hours | Better type safety, simpler API |
| Vercel AI SDK | Low | 2-4 hours | Enhanced streaming, better error handling |
| OpenAI SDK | Low | 1-2 hours | Unified provider interface, built-in retry |

## Quick Start Migration

### 1. Install @dcyfr/ai

```bash
npm install @dcyfr/ai
# or
yarn add @dcyfr/ai
```

### 2. Basic Provider Setup

```typescript
// Before (LangChain)
import { ChatOpenAI } from "@langchain/openai";
const llm = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// After (@dcyfr/ai) 
import { createAgent } from '@dcyfr/ai';
const agent = createAgent({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY
});
```

### 3. Chat Completion

```typescript
// Before (Vercel AI SDK)
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: openai('gpt-4'),
  prompt: 'Hello world'
});

// After (@dcyfr/ai)
import { createAgent } from '@dcyfr/ai';

const agent = createAgent({ provider: 'openai' });
const response = await agent.chat('Hello world');
```

## Migration Support

### Manual Migration Checklist

- [ ] **Provider Configuration** - Update API keys and endpoints
- [ ] **Chat Interface** - Replace chat completion calls
- [ ] **Streaming** - Update streaming response handling  
- [ ] **Error Handling** - Migrate error handling patterns
- [ ] **Memory/Context** - Replace conversation memory systems
- [ ] **Tools/Functions** - Migrate function calling implementations
- [ ] **Testing** - Update test suites with new API patterns

## Framework Comparison

### Type Safety
- **@dcyfr/ai**: Full TypeScript support with strict types
- **LangChain**: Partial TypeScript, runtime type issues common
- **Vercel AI SDK**: Good TypeScript support
- **OpenAI SDK**: Basic type definitions

### Performance  
- **@dcyfr/ai**: Optimized for low latency, built-in caching
- **LangChain**: Heavy framework, slower initialization
- **Vercel AI SDK**: Fast, minimal overhead
- **OpenAI SDK**: Direct API calls, no optimization layer

### Developer Experience
- **@dcyfr/ai**: Unified interface, consistent patterns
- **LangChain**: Complex abstractions, steep learning curve  
- **Vercel AI SDK**: Simple API, limited advanced features
- **OpenAI SDK**: Manual implementation required for common patterns

## Common Migration Patterns

### 1. Provider Abstraction

```typescript
// @dcyfr/ai - Switch providers easily
const agent = createAgent({
  provider: process.env.NODE_ENV === 'dev' ? 'ollama' : 'openai'
});
```

### 2. Unified Streaming

```typescript
// @dcyfr/ai - Consistent streaming across providers
const stream = await agent.stream('Tell me a story');
for await (const chunk of stream) {
  console.log(chunk.text);
}
```

### 3. Built-in Memory

```typescript
// @dcyfr/ai - Automatic conversation memory
const agent = createAgent({
  provider: 'openai',
  memory: { type: 'conversation', maxLength: 10 }
});
```

## Getting Help

- **Community**: [@dcyfr/ai Discord](https://discord.gg/dcyfr-ai)  
- **Support**: [migration@dcyfr.ai](mailto:migration@dcyfr.ai)

---

**Next Steps**: Choose your migration guide above and follow the step-by-step process.
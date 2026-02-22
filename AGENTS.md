# AGENTS.md - @dcyfr/ai

**Portable AI Agent Framework**

Version: 1.0.3  
Type: Public npm package  
License: MIT

---

## 🎯 Project Overview

`@dcyfr/ai` is a **portable, plugin-based AI agent framework** designed for:
- Building AI-powered CLI tools
- Creating interactive TUI (Terminal UI) applications
- Implementing multi-agent workflows
- Rapid prototyping with LLMs

**Key Features:**
- Zero vendor lock-in (supports multiple LLM providers)
- Plugin architecture for extensibility
- Built-in agent primitives
- TypeScript-first design

---

## 🏗️ Architecture Patterns

### 1. Plugin System

**Plugins are the core extension mechanism:**

```typescript
import { AgentFramework, Plugin } from '@dcyfr/ai';

// Define a plugin
const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  
  async initialize(framework) {
    console.log('Plugin initialized');
  },
  
  async execute(context) {
    // Plugin logic
    return { success: true };
  },
};

// Use the plugin
const framework = new AgentFramework();
framework.use(myPlugin);
```

### 2. Agent Primitives

**Built-in agents for common tasks:**

```typescript
import { 
  CodeGeneratorAgent,
  DocumentationAgent,
  TestGeneratorAgent,
  SecurityScannerAgent 
} from '@dcyfr/ai/agents-builtin';

// Use a built-in agent
const codeAgent = new CodeGeneratorAgent({
  model: 'gpt-4',
  temperature: 0.7,
});

const code = await codeAgent.generate({
  prompt: 'Create a TypeScript function to validate emails',
  language: 'typescript',
});
```

### 3. Provider Abstraction

**Support for multiple LLM providers:**

```typescript
import { LLMProvider } from '@dcyfr/ai';

// OpenAI
const openai = new LLMProvider({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
});

// Anthropic
const anthropic = new LLMProvider({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus',
});

// Local models (Ollama)
const ollama = new LLMProvider({
  provider: 'ollama',
  baseURL: 'http://localhost:11434',
  model: 'llama2',
});
```

### 4. Configuration System

**YAML-based configuration:**

```yaml
# config/default.yaml
framework:
  name: "my-ai-app"
  version: "1.0.0"

providers:
  default: openai
  
  openai:
    model: gpt-4
    temperature: 0.7
    maxTokens: 2000
  
  anthropic:
    model: claude-3-opus
    temperature: 0.5

plugins:
  - name: code-generator
    enabled: true
  - name: documentation
    enabled: false
```

---

## 📦 Package Structure

```
packages/ai/
├── agents/               # Agent abstractions
│   ├── base-agent.ts
│   ├── code-agent.ts
│   └── doc-agent.ts
├── agents-builtin/       # 15 generic built-in agents
│   ├── code-generator/
│   ├── documentation/
│   ├── test-generator/
│   └── security-scanner/
├── providers/            # LLM provider integrations
│   ├── openai.ts
│   ├── anthropic.ts
│   └── ollama.ts
├── plugins/              # Plugin system
│   ├── plugin-manager.ts
│   └── plugin-types.ts
└── utils/                # Shared utilities
    ├── config.ts
    └── logger.ts
```

---

## 🧩 Built-In Agents (15 Total)

1. **CodeGeneratorAgent** - Generate code from natural language
2. **DocumentationAgent** - Create technical documentation
3. **TestGeneratorAgent** - Generate unit tests
4. **SecurityScannerAgent** - Scan for security vulnerabilities
5. **RefactoringAgent** - Suggest code refactorings
6. **APIDesignAgent** - Design REST/GraphQL APIs
7. **DatabaseSchemaAgent** - Generate database schemas
8. **ConfigGeneratorAgent** - Create configuration files
9. **GitCommitAgent** - Generate meaningful commit messages
10. **ChangelogAgent** - Generate CHANGELOG entries
11. **ReadmeAgent** - Create README documentation
12. **MigrationAgent** - Generate database migrations
13. **ValidationAgent** - Validate code patterns
14. **OptimizationAgent** - Suggest performance optimizations
15. **TranslationAgent** - Translate code between languages

---

## 🛠️ Development Patterns

### Creating a New Agent

```typescript
import { BaseAgent, AgentConfig } from '@dcyfr/ai';

export class MyCustomAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({
      name: 'my-custom-agent',
      version: '1.0.0',
      ...config,
    });
  }

  async execute(input: string): Promise<string> {
    // Agent implementation
    const response = await this.llm.complete({
      prompt: this.buildPrompt(input),
      temperature: this.config.temperature || 0.7,
    });
    
    return response.text;
  }

  private buildPrompt(input: string): string {
    return `You are a helpful assistant. ${input}`;
  }
}
```

### Creating a Plugin

```typescript
import { Plugin, PluginContext } from '@dcyfr/ai';

export const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  
  async initialize(context: PluginContext) {
    // Setup logic
    context.logger.info('Plugin initialized');
  },
  
  async execute(context: PluginContext) {
    // Main plugin logic
    return { success: true };
  },
  
  async cleanup(context: PluginContext) {
    // Teardown logic
    context.logger.info('Plugin cleaned up');
  },
};
```

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Type checking
npm run typecheck
```

**Test Patterns:**

```typescript
import { describe, it, expect } from 'vitest';
import { CodeGeneratorAgent } from '../agents-builtin/code-generator';

describe('CodeGeneratorAgent', () => {
  it('should generate valid TypeScript code', async () => {
    const agent = new CodeGeneratorAgent({
      provider: 'mock',  // Use mock provider in tests
    });
    
    const code = await agent.generate({
      prompt: 'Create a hello world function',
      language: 'typescript',
    });
    
    expect(code).toContain('function');
    expect(code).toContain('hello');
  });
});
```

---

## 📚 CLI & TUI

### CLI Usage

```bash
# Generate code
dcyfr-ai generate --prompt "Create a REST API" --language typescript

# Generate tests
dcyfr-ai test --file src/app.ts

# Scan for security issues
dcyfr-ai security --dir ./src

# Interactive mode
dcyfr-ai interactive
```

### TUI Usage

```bash
# Launch interactive terminal UI
dcyfr-ai-tui

# Or
node bin/tui.js
```

---

## 🔒 Security

- **API Keys:** Never commit API keys. Use environment variables.
- **Input Validation:** Always validate user inputs before passing to LLMs.
- **Rate Limiting:** Implement rate limiting for API calls.
- **Sandboxing:** Execute generated code in isolated environments.

---

## 📦 Publishing

```bash
# Build the package
npm run build

# Publish to npm (automated via CI)
npm publish --access public
```

**Versioning:** Follows semantic versioning (semver)

---

## 🔗 Related Packages

- **@dcyfr/agents** - Proprietary DCYFR-specific agents (private)
- **@dcyfr/ai-nodejs** - Node.js starter template using this framework
- **@dcyfr/ai-sandbox** - Examples and experimentation sandbox

---

## 📄 Documentation

- [API.md](docs/API.md) - Complete API reference
- [EXAMPLES.md](docs/EXAMPLES.md) - Usage examples
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [examples/](examples/) - Code examples

---

**Last Updated:** February 1, 2026  
**Maintained By:** DCYFR Team  
**NPM:** [@dcyfr/ai](https://www.npmjs.com/package/@dcyfr/ai)

## Quality Gates
- TypeScript: 0 errors (`npm run typecheck`)
- Tests: ≥99% pass rate (`npm run test`)
- Lint: 0 errors (`npm run lint`)

# API Reference

Complete API documentation for @dcyfr/ai framework.

## Table of Contents

- [Configuration](#configuration)
- [Telemetry](#telemetry)
- [Providers](#providers)
- [Plugins](#plugins)
- [Validation](#validation)
- [Types](#types)

## Configuration

### `loadConfig(options?): Promise<FrameworkConfig>`

Load and validate configuration from files or defaults.

**Parameters:**
- `options?: LoaderOptions` - Configuration loader options

**Returns:** `Promise<FrameworkConfig>` - Validated configuration

**Example:**
```typescript
import { loadConfig } from '@dcyfr/ai';

const config = await loadConfig({
  projectRoot: '/path/to/project',
  enableEnvOverrides: true,
});
```

### `class ConfigLoader`

Configuration loader with three-layer merge.

**Constructor:**
```typescript
new ConfigLoader(options?: LoaderOptions)
```

**Methods:**

#### `load(): Promise<FrameworkConfig>`
Load complete configuration with three-layer merge.

#### `validate(config: unknown): FrameworkConfig`
Validate configuration against schema.

#### `getConfigFilePath(): Promise<string | null>`
Get path to configuration file if it exists.

**Example:**
```typescript
import { ConfigLoader } from '@dcyfr/ai';

const loader = new ConfigLoader({
  projectRoot: process.cwd(),
  configFile: 'custom.yaml',
});

const config = await loader.load();
```

### Configuration Schemas

All configuration schemas exported from `@dcyfr/ai`:

- `FrameworkConfigSchema` - Main configuration
- `TelemetryConfigSchema` - Telemetry settings
- `ProviderConfigSchema` - Provider settings
- `ValidationGateConfigSchema` - Validation gates
- `PluginConfigSchema` - Plugin settings
- `DesignTokenConfigSchema` - Design token validation
- `BarrelExportConfigSchema` - Barrel export checking
- `PageLayoutConfigSchema` - PageLayout enforcement
- `TestDataConfigSchema` - Test data safety

## Telemetry

### `class TelemetryEngine`

Core telemetry tracking engine.

**Constructor:**
```typescript
new TelemetryEngine(options: TelemetryEngineOptions)
```

**Options:**
```typescript
interface TelemetryEngineOptions {
  storage: 'memory' | 'file' | 'redis' | 'database';
  enabled?: boolean;
  storagePath?: string;
  retentionDays?: number;
}
```

**Methods:**

#### `startSession(agent, context): TelemetrySession`
Start a new telemetry session.

**Parameters:**
- `agent: AgentType` - Agent identifier
- `context: SessionContext` - Session metadata

**Returns:** `TelemetrySession`

#### `getAgentStats(agent, period): Promise<AgentStats>`
Get statistics for an agent.

**Parameters:**
- `agent: AgentType` - Agent to query
- `period: string` - Time period (e.g., '30d', '7d')

**Returns:** `Promise<AgentStats>`

#### `getAllSessions(): Promise<TelemetrySession[]>`
Get all telemetry sessions.

**Example:**
```typescript
import { TelemetryEngine } from '@dcyfr/ai';

const engine = new TelemetryEngine({
  storage: 'file',
  storagePath: '.dcyfr/telemetry',
  retentionDays: 30,
});

const session = engine.startSession('claude', {
  taskType: 'feature',
  taskDescription: 'Add dark mode',
});
```

### `class TelemetrySessionManager`

Manage telemetry sessions with lifecycle hooks.

**Constructor:**
```typescript
new TelemetrySessionManager(engine: TelemetryEngine)
```

**Methods:**

#### `startSession(agent, context): SessionWrapper`
Start managed session with helper methods.

**Returns:** `SessionWrapper` with methods:
- `recordMetric(name: string, value: number): void`
- `complete(result: SessionResult): void`

**Example:**
```typescript
import { TelemetryEngine, TelemetrySessionManager } from '@dcyfr/ai';

const engine = new TelemetryEngine({ storage: 'memory' });
const manager = new TelemetrySessionManager(engine);

const session = manager.startSession('claude', {
  taskType: 'feature',
  taskDescription: 'Implement auth',
});

session.recordMetric('tokenCompliance', 0.95);
session.complete({ success: true });
```

## Providers

### `class ProviderRegistry`

Multi-provider AI with automatic fallback.

**Constructor:**
```typescript
new ProviderRegistry(config: ProviderRegistryConfig)
```

**Config:**
```typescript
interface ProviderRegistryConfig {
  providers: Record<ProviderType, ProviderConfig>;
  fallbackOrder: ProviderType[];
  timeout?: number;
  retries?: number;
}
```

**Methods:**

#### `executeWithFallback<T>(provider, context, executor): Promise<T>`
Execute function with provider fallback.

**Parameters:**
- `provider: ProviderType` - Primary provider
- `context: TaskContext` - Execution context
- `executor: (provider: ProviderType) => Promise<T>` - Execution function

**Returns:** `Promise<T>` - Execution result

#### `getProviderHealth(provider): ProviderHealth`
Get provider health status.

#### `switchProvider(from, to, reason): Promise<void>`
Manually switch provider.

**Example:**
```typescript
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  providers: {
    claude: { enabled: true },
    groq: { enabled: true },
  },
  fallbackOrder: ['claude', 'groq'],
});

const result = await registry.executeWithFallback(
  'claude',
  { taskType: 'feature' },
  async (provider) => {
    return await callAI(provider);
  }
);
```

## Plugins

### `class PluginLoader`

Dynamic plugin loading and management.

**Constructor:**
```typescript
new PluginLoader(config?: PluginLoaderConfig)
```

**Config:**
```typescript
interface PluginLoaderConfig {
  failureMode?: 'error' | 'warn' | 'skip';
  timeout?: number;
}
```

**Methods:**

#### `loadPlugin(plugin): Promise<void>`
Load a single plugin.

#### `loadPlugins(plugins): Promise<void>`
Load multiple plugins.

#### `validateAll(context): Promise<ValidationResult>`
Run all loaded plugins.

#### `getPluginCount(): number`
Get number of loaded plugins.

#### `clearAll(): Promise<void>`
Unload all plugins.

**Example:**
```typescript
import { PluginLoader } from '@dcyfr/ai';

const loader = new PluginLoader({
  failureMode: 'warn',
  timeout: 30000,
});

await loader.loadPlugin({
  manifest: {
    name: 'my-validator',
    version: '1.0.0',
    description: 'Custom validator',
  },
  async onValidate(context) {
    return {
      valid: true,
      violations: [],
      warnings: [],
    };
  },
});
```

### Plugin Interface

```typescript
interface Plugin {
  manifest: PluginManifest;
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  onValidate?: (context: ValidationContext) => Promise<ValidationResult>;
  onComplete?: () => void | Promise<void>;
}

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  dependencies?: Record<string, string>;
}
```

## Validation

### `class ValidationFramework`

Orchestrate validation gates and plugins.

**Constructor:**
```typescript
new ValidationFramework(config?: ValidationFrameworkConfig)
```

**Config:**
```typescript
interface ValidationFrameworkConfig {
  gates?: ValidationGate[];
  parallel?: boolean;
  failFast?: boolean;
}

interface ValidationGate {
  name: string;
  plugins: string[];
  required: boolean;
  failureMode: 'error' | 'warn' | 'skip';
  parallel?: boolean;
  timeout?: number;
}
```

**Methods:**

#### `loadPlugins(plugins): Promise<void>`
Load plugins into framework.

#### `validate(context): Promise<ValidationReport>`
Run validation with all gates.

**Parameters:**
- `context: ValidationContext`

**Returns:** `Promise<ValidationReport>`

#### `getGates(): ValidationGate[]`
Get configured gates.

**Example:**
```typescript
import { ValidationFramework } from '@dcyfr/ai';

const framework = new ValidationFramework({
  gates: [
    {
      name: 'code-quality',
      plugins: ['eslint', 'typescript'],
      required: true,
      failureMode: 'error',
    },
  ],
  parallel: true,
});

const report = await framework.validate({
  projectRoot: process.cwd(),
  files: ['src/**/*.ts'],
  config: {},
});
```

## Types

### Core Types

```typescript
// Agent types
type AgentType = 'claude' | 'copilot' | 'groq' | 'ollama';

// Task types
type TaskType = 'feature' | 'bug' | 'refactor' | 'quick-fix' | 'research';

// Task outcomes
type TaskOutcome = 'success' | 'escalated' | 'failed';

// Validation severity
type ValidationSeverity = 'error' | 'warning' | 'info';

// Storage types
type StorageType = 'memory' | 'file' | 'redis' | 'database';
```

### Telemetry Types

```typescript
interface TelemetrySession {
  sessionId: string;
  agent: AgentType;
  taskType: TaskType;
  taskDescription: string;
  startTime: Date;
  endTime?: Date;
  outcome?: TaskOutcome;
  metrics: TelemetryMetrics;
}

interface TelemetryMetrics {
  tokenCompliance: number;
  testPassRate: number;
  lintViolations: number;
  typeErrors: number;
  executionTime: number;
  tokensUsed: number;
  filesModified: number;
  linesChanged: number;
  validations: ValidationStatus;
}
```

### Provider Types

```typescript
type ProviderType = 'claude' | 'groq' | 'ollama' | 'copilot' | 'openai' | 'anthropic';

interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

interface ProviderHealth {
  available: boolean;
  responseTime?: number;
  errorRate?: number;
  lastCheck: Date;
}
```

### Validation Types

```typescript
interface ValidationContext {
  projectRoot: string;
  files: string[];
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
  warnings: ValidationViolation[];
  metadata?: Record<string, unknown>;
}

interface ValidationViolation {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}

interface ValidationReport {
  valid: boolean;
  gates: GateResult[];
  summary: ValidationSummary;
}
```

## Error Classes

### `RateLimitError`

Thrown when provider rate limit is exceeded.

```typescript
class RateLimitError extends Error {
  constructor(provider: ProviderType, retryAfter?: number);
}
```

### `ProviderUnavailableError`

Thrown when provider is unavailable.

```typescript
class ProviderUnavailableError extends Error {
  constructor(provider: ProviderType, reason?: string);
}
```

### `PluginLoadError`

Thrown when plugin fails to load.

```typescript
class PluginLoadError extends Error {
  constructor(pluginName: string, reason: string);
}
```

### `PluginValidationError`

Thrown when plugin manifest is invalid.

```typescript
class PluginValidationError extends Error {
  constructor(pluginName: string, errors: string[]);
}
```

## Utilities

### Storage Adapters

```typescript
interface StorageAdapter {
  save(key: string, value: unknown): Promise<void>;
  load(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

// Built-in adapters
class MemoryStorage implements StorageAdapter { }
class FileStorage implements StorageAdapter {
  constructor(basePath: string);
}
```

## Constants

```typescript
// Default configuration
export const DEFAULT_CONFIG: FrameworkConfig;

// Provider defaults
export const DEFAULT_PROVIDERS: Record<ProviderType, ProviderConfig>;

// Timeouts
export const DEFAULT_TIMEOUT = 30000;
export const DEFAULT_PLUGIN_TIMEOUT = 30000;

// Retention
export const DEFAULT_RETENTION_DAYS = 30;
```

---

For more examples and guides, see:
- [Getting Started](./GETTING-STARTED.md)
- [Plugin Development](./PLUGINS.md)
- [Examples](../examples/)

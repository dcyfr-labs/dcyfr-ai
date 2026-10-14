<!-- TLP:CLEAR -->
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
new TelemetryEngine(options?: {
  storage?: StorageType | StorageAdapter; // default: 'memory'
  basePath?: string;                       // used by the 'file' storage type
})
```

**Methods:**

#### `startSession(agent, options): TelemetrySessionManager`
Start a new telemetry session.

**Parameters:**
- `agent: AgentType` - Agent identifier
- `options: { taskType: TaskType; description: string }` - Session metadata

#### `getSession(sessionId): TelemetrySessionManager | undefined`
Get an active session.

#### `endSession(sessionId, outcome): Promise<TelemetrySession | null>`
End an active session by ID.

#### `getAgentStats(agent, period = '30d'): Promise<AgentStats>`
Get statistics for an agent.

#### `compareAgents(period = '30d'): Promise<ComparisonStats>`
Compare all agents, with recommendations.

#### `getHandoffPatterns(period = '30d'): Promise<HandoffPatterns>`
Summarize agent handoffs.

**Example:**
```typescript
import { TelemetryEngine } from '@dcyfr/ai';

const engine = new TelemetryEngine({
  storage: 'file',
  basePath: '.dcyfr/telemetry',
});

const session = engine.startSession('anthropic', {
  taskType: 'feature',
  description: 'Add dark mode',
});
```

### `class TelemetrySessionManager`

A running session, returned by `TelemetryEngine.startSession()`. It is not constructed directly.

**Methods:**
- `recordMetric(metric: keyof TelemetryMetrics, value: number): void`
- `recordValidation(validation: string, status: ValidationStatus): void`
- `recordViolation(violation: Omit<ViolationRecord, 'timestamp'>): void`
- `recordHandoff(handoff: Omit<HandoffRecord, 'timestamp' | 'fromAgent'>): void`
- `updateCost(inputTokens: number, outputTokens: number): void`
- `getSession(): TelemetrySession`
- `end(outcome: TaskOutcome): Promise<TelemetrySession>`

**Example:**
```typescript
import { TelemetryEngine } from '@dcyfr/ai';

const engine = new TelemetryEngine({ storage: 'memory' });

const session = engine.startSession('anthropic', {
  taskType: 'feature',
  description: 'Implement auth',
});

session.recordMetric('tokenCompliance', 0.95);
await session.end('success');
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
  primaryProvider: ProviderType;
  fallbackChain: ProviderType[];
  autoReturn: boolean;          // return to the primary when it recovers
  healthCheckInterval: number;  // ms
  sessionStatePath?: string;
  validationLevel?: 'standard' | 'enhanced' | 'strict';
}
```

**Methods:**

#### `executeWithFallback<T>(task, executor): Promise<ExecutionResult<T>>`
Run `executor` against the current provider, falling back along `fallbackChain` on failure.

**Parameters:**
- `task: TaskContext` - Execution context (`description`, `phase`, `filesInProgress`)
- `executor: (provider: ProviderType) => Promise<T>` - Execution function

#### `getCurrentProvider(): ProviderType`
Get the active provider.

#### `getHealthStatus(): Map<ProviderType, ProviderHealth>`
Get health status for every provider.

#### `destroy(): void`
Stop health monitoring.

**Example:**
```typescript
import { ProviderRegistry } from '@dcyfr/ai';

const registry = new ProviderRegistry({
  primaryProvider: 'anthropic',
  fallbackChain: ['github-models', 'ollama'],
  autoReturn: true,
  healthCheckInterval: 60000,
});

const result = await registry.executeWithFallback(
  {
    description: 'Implement feature',
    phase: 'implementation',
    filesInProgress: ['src/app.ts'],
  },
  async (provider) => {
    return await callAI(provider);
  }
);

registry.destroy();
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
  failureMode?: 'throw' | 'warn' | 'silent';
  autoLoad?: boolean;
  timeout?: number; // ms
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
  failureMode?: 'error' | 'warn' | 'block';
  parallel?: boolean;
  timeout?: number;
}

interface ValidationGate {
  name: string;
  plugins: string[];
  required: boolean;
  failureMode: 'error' | 'warn' | 'skip';
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

A gate whose plugins are all missing or disabled runs nothing and is reported with `skipped: true`:

- A `required` gate that is skipped fails, with a `gate-skipped` violation (severity `error`) naming the plugins.
- An optional gate that is skipped passes with a `gate-skipped` warning.
- `report.valid` is `true` only when no gate failed **and at least one gate ran**. A run where every gate was skipped, or with no gates, is not valid.

```typescript
interface ValidationReport {
  valid: boolean;
  gates: {
    name: string;
    passed: boolean;
    skipped: boolean;
    violations: ValidationViolation[];
    warnings: ValidationViolation[];
    executionTime: number;
  }[];
  summary: {
    totalGates: number;
    passedGates: number;
    failedGates: number;
    skippedGates: number;
    totalViolations: number;
    totalWarnings: number;
    executionTime: number;
  };
}
```

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
type AgentType = 'ollama' | 'workbench' | 'github-models' | 'anthropic';

// Task types
type TaskType =
  | 'feature' | 'bug' | 'refactor' | 'quick-fix' | 'research'
  | 'documentation' | 'testing' | 'plugin_installation';

// Task outcomes
type TaskOutcome = 'success' | 'escalated' | 'failed' | 'partial';

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
  violations: ViolationRecord[];
  handoffs: HandoffRecord[];
  cost: { provider: string; inputTokens: number; outputTokens: number; estimatedCost: number; currency: 'USD' | 'EUR' | 'GBP' };
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
  validations: Record<string, ValidationStatus>;
}
```

### Provider Types

```typescript
type ProviderType = 'local' | 'ollama' | 'workbench' | 'github-models' | 'anthropic';

interface ProviderConfig {
  name: ProviderType;
  apiEndpoint?: string;
  healthCheckUrl?: string;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  enabled?: boolean;
}

interface ProviderHealth {
  provider: ProviderType;
  available: boolean;
  responseTime?: number;
  lastChecked: Date;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
  error?: string;
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
  column?: number;
  fixed?: boolean;
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
  constructor(message: string, provider: ProviderType, retryAfter?: number);
}
```

### `ProviderUnavailableError`

Thrown when provider is unavailable.

```typescript
class ProviderUnavailableError extends Error {
  constructor(message: string, provider: ProviderType);
}
```

### `PluginLoadError`

Thrown when plugin fails to load.

```typescript
class PluginLoadError extends Error {
  constructor(message: string, pluginName: string, cause?: Error);
}
```

### `PluginValidationError`

Thrown when plugin manifest is invalid.

```typescript
class PluginValidationError extends Error {
  constructor(message: string, pluginName: string);
}
```

## Utilities

### Storage Adapters

```typescript
interface StorageAdapter {
  type: StorageType;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

// Built-in adapters and factory
class MemoryStorageAdapter implements StorageAdapter { }
class FileStorageAdapter implements StorageAdapter { }
function createStorageAdapter(type: StorageType, options?: { basePath?: string }): StorageAdapter;
```

## Constants

```typescript
// Default configuration
export const DEFAULT_CONFIG: FrameworkConfig;
```

---

For more examples and guides, see:
- [Getting Started](./GETTING-STARTED.md)
- [Plugin Development](./PLUGINS.md)
- [Examples](../examples/)

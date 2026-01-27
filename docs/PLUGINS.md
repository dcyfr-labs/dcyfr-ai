# Plugin Development Guide

Learn how to create custom validation plugins for @dcyfr/ai framework.

## Table of Contents

- [Plugin Basics](#plugin-basics)
- [Plugin Interface](#plugin-interface)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Creating a Plugin](#creating-a-plugin)
- [Loading Plugins](#loading-plugins)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Plugin Basics

Plugins extend the validation capabilities of @dcyfr/ai. Each plugin:

- Validates specific aspects of your code
- Reports violations and warnings
- Integrates with the validation framework
- Can run in parallel or serial mode

### Quick Start

Create a plugin using the CLI:

```bash
dcyfr-ai plugin:create --name my-validator
```

This generates a template in `plugins/my-validator.ts`.

## Plugin Interface

Every plugin must implement the `Plugin` interface:

```typescript
interface Plugin {
  manifest: PluginManifest;
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  onValidate?: (context: ValidationContext) => Promise<ValidationResult>;
  onComplete?: () => void | Promise<void>;
}
```

### Manifest

```typescript
interface PluginManifest {
  name: string;           // Unique plugin identifier
  version: string;        // Semantic version
  description: string;    // What the plugin does
  author?: string;        // Plugin author
  license?: string;       // License (e.g., MIT)
  dependencies?: Record<string, string>;  // NPM dependencies
}
```

### Validation Context

The context passed to `onValidate`:

```typescript
interface ValidationContext {
  projectRoot: string;              // Project directory
  files: string[];                  // Files to validate
  config: Record<string, unknown>;  // Plugin configuration
  metadata?: Record<string, unknown>;  // Additional data
}
```

### Validation Result

What your plugin should return:

```typescript
interface ValidationResult {
  valid: boolean;                      // Overall pass/fail
  violations: ValidationViolation[];   // Critical issues
  warnings: ValidationViolation[];     // Non-critical issues
  metadata?: Record<string, unknown>;  // Additional info
}

interface ValidationViolation {
  type: string;           // Violation category
  severity: 'error' | 'warning' | 'info';
  message: string;        // Human-readable description
  file?: string;          // File path
  line?: number;          // Line number
  column?: number;        // Column number
  suggestion?: string;    // How to fix it
}
```

## Lifecycle Hooks

### onLoad()

Called when plugin is loaded into the framework.

**Use for:**
- Initialization
- Loading external resources
- Validating plugin configuration

```typescript
async onLoad() {
  console.log('Plugin loading...');
  this.cache = new Map();
  await this.loadConfig();
}
```

### onValidate(context)

**Required hook** - performs the actual validation.

```typescript
async onValidate(context: ValidationContext): Promise<ValidationResult> {
  const violations = [];
  
  for (const file of context.files) {
    // Validate each file
    const issues = await this.checkFile(file);
    violations.push(...issues);
  }
  
  return {
    valid: violations.length === 0,
    violations,
    warnings: [],
  };
}
```

### onComplete()

Called after validation completes.

**Use for:**
- Cleanup
- Generating reports
- Saving state

```typescript
async onComplete() {
  console.log('Validation complete');
  await this.saveReport();
  this.cache.clear();
}
```

### onUnload()

Called when plugin is removed from framework.

**Use for:**
- Resource cleanup
- Closing connections

```typescript
async onUnload() {
  this.cache.clear();
  await this.closeConnections();
}
```

## Creating a Plugin

### Example: Import Validator

```typescript
import type { Plugin, ValidationContext, ValidationResult } from '@dcyfr/ai';
import { readFile } from 'fs/promises';

export const importValidator: Plugin = {
  manifest: {
    name: 'import-validator',
    version: '1.0.0',
    description: 'Validates import statements',
    author: 'Your Name',
    license: 'MIT',
  },
  
  async onLoad() {
    console.log('Import validator loaded');
  },
  
  async onValidate(context: ValidationContext): Promise<ValidationResult> {
    const violations = [];
    const warnings = [];
    
    for (const filePath of context.files) {
      // Read file
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Check each line
      lines.forEach((line, index) => {
        // Wildcard imports
        if (line.includes('import * from')) {
          warnings.push({
            type: 'wildcard-import',
            severity: 'warning',
            message: 'Avoid wildcard imports',
            file: filePath,
            line: index + 1,
            suggestion: 'Import specific symbols instead',
          });
        }
        
        // Relative imports beyond 2 levels
        const relativeMatch = line.match(/from ['"](\.\.\/.+)['"]/);
        if (relativeMatch) {
          const levels = (relativeMatch[1].match(/\.\.\//g) || []).length;
          if (levels > 2) {
            violations.push({
              type: 'deep-relative-import',
              severity: 'error',
              message: `Relative import too deep (${levels} levels)`,
              file: filePath,
              line: index + 1,
              suggestion: 'Use path aliases instead',
            });
          }
        }
      });
    }
    
    return {
      valid: violations.length === 0,
      violations,
      warnings,
      metadata: {
        filesChecked: context.files.length,
      },
    };
  },
};
```

### Example: Performance Budget Plugin

```typescript
import type { Plugin } from '@dcyfr/ai';
import { stat } from 'fs/promises';

export const performanceBudget: Plugin = {
  manifest: {
    name: 'performance-budget',
    version: '1.0.0',
    description: 'Enforces file size budgets',
  },
  
  async onValidate(context) {
    const violations = [];
    const maxSize = context.config.maxFileSize || 100 * 1024; // 100KB default
    
    for (const file of context.files) {
      const stats = await stat(file);
      
      if (stats.size > maxSize) {
        violations.push({
          type: 'file-too-large',
          severity: 'error',
          message: `File exceeds budget: ${(stats.size / 1024).toFixed(1)}KB > ${(maxSize / 1024).toFixed(1)}KB`,
          file,
          suggestion: 'Split into smaller modules',
        });
      }
    }
    
    return {
      valid: violations.length === 0,
      violations,
      warnings: [],
      metadata: {
        budget: maxSize,
        totalSize: context.files.reduce(async (sum, f) => {
          const s = await stat(f);
          return sum + s.size;
        }, 0),
      },
    };
  },
};
```

## Loading Plugins

### Using PluginLoader

```typescript
import { PluginLoader } from '@dcyfr/ai';
import { importValidator } from './plugins/import-validator';
import { performanceBudget } from './plugins/performance-budget';

const loader = new PluginLoader({
  failureMode: 'warn',  // 'error' | 'warn' | 'skip'
  timeout: 30000,       // 30 seconds
});

// Load single plugin
await loader.loadPlugin(importValidator);

// Load multiple plugins
await loader.loadPlugins([
  importValidator,
  performanceBudget,
]);

// Run validation
const result = await loader.validateAll({
  projectRoot: process.cwd(),
  files: ['src/**/*.ts'],
  config: {
    maxFileSize: 50 * 1024,  // 50KB
  },
});

console.log(`Valid: ${result.valid}`);
console.log(`Violations: ${result.violations.length}`);
```

### Using ValidationFramework

```typescript
import { ValidationFramework } from '@dcyfr/ai';

const framework = new ValidationFramework({
  gates: [
    {
      name: 'code-quality',
      plugins: ['import-validator', 'performance-budget'],
      required: true,
      failureMode: 'error',
    },
  ],
  parallel: true,
});

// Load plugins
await framework.loadPlugins([
  importValidator,
  performanceBudget,
]);

// Run validation
const report = await framework.validate({
  projectRoot: process.cwd(),
  files: ['src/**/*.ts'],
  config: {},
});
```

## Best Practices

### 1. Make Plugins Focused

Each plugin should validate one specific aspect:

✅ Good: `import-validator`, `file-size-checker`, `naming-convention`
❌ Bad: `code-quality` (too broad)

### 2. Provide Clear Error Messages

```typescript
// ❌ Bad
violations.push({
  type: 'error',
  severity: 'error',
  message: 'Invalid',
});

// ✅ Good
violations.push({
  type: 'wildcard-import',
  severity: 'warning',
  message: 'Avoid wildcard imports - they increase bundle size',
  file: 'src/utils.ts',
  line: 15,
  suggestion: 'Import only what you need: import { foo, bar } from "./module"',
});
```

### 3. Handle Errors Gracefully

```typescript
async onValidate(context) {
  const violations = [];
  
  for (const file of context.files) {
    try {
      const content = await readFile(file, 'utf-8');
      // Validate content...
    } catch (error) {
      // Don't crash - report as violation
      violations.push({
        type: 'read-error',
        severity: 'error',
        message: `Failed to read file: ${error.message}`,
        file,
      });
    }
  }
  
  return { valid: violations.length === 0, violations, warnings: [] };
}
```

### 4. Use Configuration

```typescript
async onValidate(context) {
  // Get plugin config
  const config = context.config.importValidator || {};
  const allowWildcard = config.allowWildcard || false;
  const maxImportDepth = config.maxImportDepth || 2;
  
  // Use config in validation...
}
```

### 5. Optimize Performance

```typescript
// ✅ Cache expensive operations
private cache = new Map();

async onValidate(context) {
  for (const file of context.files) {
    if (this.cache.has(file)) {
      continue;  // Already validated
    }
    
    // Expensive validation...
    this.cache.set(file, result);
  }
}

// ✅ Process files in parallel
async onValidate(context) {
  const results = await Promise.all(
    context.files.map(file => this.validateFile(file))
  );
  
  return {
    valid: results.every(r => r.valid),
    violations: results.flatMap(r => r.violations),
    warnings: results.flatMap(r => r.warnings),
  };
}
```

### 6. Include Metadata

```typescript
return {
  valid: violations.length === 0,
  violations,
  warnings,
  metadata: {
    filesChecked: context.files.length,
    executionTime: Date.now() - startTime,
    version: this.manifest.version,
    cacheHits: this.cacheHits,
  },
};
```

## Examples

See the [examples/](../examples/) directory for complete plugin examples:

- **import-validator.ts** - Validates import statements
- **performance-budget.ts** - Enforces file size limits
- **naming-convention.ts** - Checks naming patterns
- **security-scanner.ts** - Detects security issues

## Testing Plugins

```typescript
import { describe, it, expect } from 'vitest';
import { importValidator } from './import-validator';

describe('importValidator', () => {
  it('should detect wildcard imports', async () => {
    const result = await importValidator.onValidate({
      projectRoot: '/test',
      files: ['test-file.ts'],
      config: {},
    });
    
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('wildcard-import');
  });
});
```

## Publishing Plugins

To share your plugin:

1. Create npm package
2. Export plugin from index
3. Add peer dependency on @dcyfr/ai
4. Document configuration options

```json
{
  "name": "@yourname/dcyfr-plugin-custom",
  "version": "1.0.0",
  "peerDependencies": {
    "@dcyfr/ai": "^1.0.0"
  }
}
```

Users can then install and use:

```bash
npm install @yourname/dcyfr-plugin-custom
```

```typescript
import { myCustomPlugin } from '@yourname/dcyfr-plugin-custom';
await loader.loadPlugin(myCustomPlugin);
```

---

For more examples and API reference, see:
- [Getting Started](./GETTING-STARTED.md)
- [API Reference](./API.md)
- [Examples](../examples/)

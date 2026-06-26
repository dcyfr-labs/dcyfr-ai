# WebAssembly Plugin Starter Template

**TLP:CLEAR - Public Documentation**
<!-- markdownlint-disable MD032 MD036 -->

This starter template helps you create DCYFR plugins compiled to WebAssembly (WASM) for near-native performance with strong isolation.

## Benefits of WASM Plugins

| Metric | Docker | gVisor | **WASM** |
|--------|--------|--------|----------|
| **Startup time** | 1-3s | 500ms-1s | **<50ms** |
| **Performance overhead** | 15-20% | 8-12% | **<5%** |
| **Memory footprint** | 50-100MB | 30-60MB | **<10MB** |
| **Isolation strength** | Strong | Strongest | Strong |
| **Portability** | Linux-only | Linux-only | **Cross-platform** |

**Use WASM when:**
- Performance is critical (<100ms response time needed)
- Plugins need to run on macOS/Windows/Linux
- Minimal memory footprint required
- Plugin logic is compute-intensive (crypto, data processing)

**Use Docker/gVisor when:**
- Plugin needs arbitrary npm dependencies
- Plugin interacts heavily with filesystem
- Plugin requires system calls not supported by WASI

---

## Quick Start

### 1. Install Dependencies

```bash
npm install --save-dev assemblyscript @assemblyscript/wasi-shim
```

### 2. Create Plugin Code

**`plugin.ts`** — Your plugin logic:
```typescript
/**
 * Example WASM plugin: URL shortener with validation
 */

// WASI imports for I/O
import { Console } from 'as-wasi/assembly';

/**
 * Validate and shorten a URL
 * @param url - Input URL to validate
 * @returns Shortened URL or error message
 */
export function shortenUrl(url: string): string {
  // Basic URL validation
  if (url.length === 0) {
    return 'Error: URL cannot be empty';
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'Error: URL must start with http:// or https://';
  }
  
  // Simple hash-based shortening (for demo purposes)
  const hash = hashString(url);
  const shortCode = hash.toString(36).slice(0, 8);
  
  Console.log(`Shortened ${url} to ${shortCode}`);
  return `https://short.link/${shortCode}`;
}

/**
 * Simple string hash function
 */
function hashString(str: string): i32 {
  let hash: i32 = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

// WASI entry point
export function _start(): void {
  // Plugin initialization
  Console.log('URL Shortener Plugin initialized');
}
```

### 3. Compile to WASM

**`asconfig.json`** — AssemblyScript config:
```json
{
  "targets": {
    "release": {
      "outFile": "build/plugin.wasm",
      "sourceMap": true,
      "optimize": true,
      "runtime": "stub"
    },
    "debug": {
      "outFile": "build/plugin.debug.wasm",
      "sourceMap": true,
      "debug": true
    }
  },
  "options": {
    "bindings": "esm"
  }
}
```

**Build command:**
```bash
npx asc plugin.ts --config asconfig.json --target release
```

### 4. Create Plugin Manifest

**`plugin.json`**:
```json
{
  "id": "url-shortener-wasm",
  "name": "URL Shortener (WASM)",
  "version": "1.0.0",
  "runtime": "wasm",
  "wasmPath": "./build/plugin.wasm",
  "exports": {
    "shortenUrl": {
      "params": ["string"],
      "returns": "string"
    }
  },
  "resourceLimits": {
    "maxMemory": "16MB",
    "maxCpu": 0.25,
    "maxExecutionTime": "500ms"
  },
  "permissions": {
    "network": false,
    "filesystem": false
  }
}
```

### 5. Test Locally

```typescript
import { WasmPluginRunner } from '@dcyfr/ai/plugins/runtime';

const result = await WasmPluginRunner.run({
  wasmPath: './build/plugin.wasm',
  args: ['https://example.com/very/long/url'],
  env: {},
  resourceLimits: {
    maxMemory: '16MB',
    maxCpu: 0.25,
    maxExecutionTime: '500ms',
    maxDiskSpace: '1MB',
  },
});

console.log('Exit code:', result.exitCode);
console.log('Output:', result.stdout);
console.log('Execution time:', result.executionTimeMs, 'ms');
```

---

## Project Structure

```
my-wasm-plugin/
├── plugin.ts               # Plugin logic (AssemblyScript)
├── asconfig.json           # AssemblyScript compiler config
├── plugin.json             # Plugin manifest
├── package.json
├── README.md
├── build/
│   ├── plugin.wasm        # Compiled WASM module
│   └── plugin.wasm.map    # Source map for debugging
└── tests/
    └── plugin.test.ts     # Unit tests
```

---

## Memory Management

WASM uses **linear memory** (64KB pages). Configure memory limits carefully:

```json
{
  "resourceLimits": {
    "maxMemory": "16MB"  // → 256 pages (16MB / 64KB)
  }
}
```

**Memory allocation tips:**
- Start with 16MB for simple plugins
- Use 32-64MB for data-intensive plugins
- Avoid exceeding 128MB (diminishes performance advantage)

---

## Performance Optimization

### 1. Enable Compiler Optimizations

```bash
npx asc plugin.ts --optimize --shrinkLevel 2 --converge
```

### 2. Use SIMD for Data Processing

```typescript
import { v128 } from 'assemblyscript';

export function processArray(data: Float32Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const vec = v128.load(data.dataStart + i * 4);
    const result = v128.add<f32>(vec, v128.splat<f32>(1.0));
    v128.store(data.dataStart + i * 4, result);
  }
}
```

### 3. Minimize String Operations

Strings are expensive in WASM. Use numeric IDs where possible:

```typescript
// ❌ SLOW
export function lookup(name: string): string { /* ... */ }

// ✅ FAST
export function lookup(id: i32): i32 { /* ... */ }
```

---

## Debugging

### 1. Use Debug Build

```bash
npx asc plugin.ts --target debug
```

### 2. Enable Source Maps

```typescript
import { WasmPluginRunner } from '@dcyfr/ai/plugins/runtime';
import { readFileSync } from 'fs';

// Load source map for better stack traces
const sourceMap = readFileSync('./build/plugin.wasm.map', 'utf-8');
```

### 3. Add Logging

```typescript
import { Console } from 'as-wasi/assembly';

export function processData(input: string): string {
  Console.log(`Processing: ${input}`);
  const result = transform(input);
  Console.log(`Result: ${result}`);
  return result;
}
```

---

## Limitations

1. **No dynamic imports** — All code must be compiled ahead-of-time
2. **Limited filesystem access** — Must declare preopens
3. **No threading** — Single-threaded execution only
4. **Limited system calls** — WASI preview1 API only

For full system access, use Docker or gVisor runtime instead.

---

## Publishing

### 1. Test Locally

```bash
npm run build
npm run test
```

### 2. Create SBOM

```bash
npm install --save-dev @cyclonedx/cyclonedx-npm
npx cyclonedx-npm --output-file sbom.json
```

### 3. Submit for Certification

```bash
# Bronze (free): automated scan
dcyfr plugin submit --tier bronze

# Silver ($499): human audit
dcyfr plugin submit --tier silver

# Gold ($2,499): penetration test
dcyfr plugin submit --tier gold
```

### 4. Publish to Marketplace

```bash
dcyfr plugin publish
```

---

## Examples

See full examples at:
- Basic WASM Plugin (example coming soon)
- Crypto Plugin (WASM + SIMD) (example coming soon)
- JSON Parser Plugin (example coming soon)

---

## Support

- **Discord:** https://discord.gg/dcyfr
- **GitHub Issues:** https://github.com/dcyfr-labs/dcyfr-ai/issues

---

**Last Updated:** March 1, 2026  
**License:** MIT  
**Maintainer:** DCYFR Security Team

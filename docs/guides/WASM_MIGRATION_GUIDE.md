# WebAssembly Migration Guide

**TLP:CLEAR - Public Documentation**
<!-- markdownlint-disable MD032 MD036 -->

This guide helps you migrate existing Docker-based DCYFR plugins to WebAssembly for improved performance and portability.

## Why Migrate to WASM?

| Benefit | Improvement vs Docker |
|---------|----------------------|
| **Startup time** | **20-60x faster** (50ms vs 1-3s) |
| **Performance** | **3-4x faster** execution (<5% overhead vs 15-20%) |
| **Memory footprint** | **5-10x smaller** (<10MB vs 50-100MB) |
| **Portability** | **Cross-platform** (works on macOS/Windows/Linux) |
| **Security** | **Equivalent** strong isolation (linear memory sandbox) |

---

## Migration Checklist

### Phase 1: Assessment (30 minutes)

- [ ] **Check dependencies** — Does your plugin use npm packages? (WASM has limited support)
- [ ] **Review filesystem usage** — WASM has restricted filesystem access (preopens only)
- [ ] **Identify system calls** — WASM supports WASI preview1 only (limited syscalls)
- [ ] **Measure performance** — Is plugin CPU-bound? (Best candidates for WASM)

**Decision matrix:**

| Plugin Characteristic | Recommendation |
|----------------------|----------------|
| Pure computation (crypto, data processing) | ✅ **WASM (best choice)** |
| Few/no npm dependencies | ✅ **WASM** |
| Network-heavy (API calls) | ⚠️ **Docker** (easier) |
| Filesystem-heavy (file parsing) | ⚠️ **Docker or gVisor** |
| Requires system commands (git, ffmpeg) | ❌ **Docker only** |

### Phase 2: Code Port (1-3 hours)

#### 1. Convert TypeScript → AssemblyScript

AssemblyScript is TypeScript-like but compiles to WASM. Key differences:

**TypeScript (Docker):**
```typescript
export async function processData(input: string): Promise<string> {
  const data = JSON.parse(input);
  const result = await fetch('https://api.example.com/transform', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.json();
}
```

**AssemblyScript (WASM):**
```typescript
import { Console } from 'as-wasi/assembly';
import { JSON } from 'assemblyscript-json';

export function processData(input: string): string {
  Console.log('Processing input');
  
  // Parse JSON manually (no built-in JSON support)
  const parsed = JSON.parse(input);
  const value = parsed.getString('key');
  
  // Transform (no network access unless explicitly configured)
  const transformed = transform(value);
  
  return `{"result":"${transformed}"}`;
}

function transform(input: string | null): string {
  if (input === null) return '';
  return input.toUpperCase();
}
```

**Key changes:**
1. Remove `async/await` — WASM plugins are synchronous
2. Replace `fetch()` — No built-in network (use WASI sockets or pass data in)
3. Replace `JSON` — Use `assemblyscript-json` library
4. Replace `console.log` — Use `as-wasi/assembly` Console
5. Add explicit types — AssemblyScript requires strict typing

#### 2. Handle Dependencies

**Docker (before):**
```json
{
  "dependencies": {
    "axios": "^1.0.0",
    "lodash": "^4.17.21",
    "uuid": "^9.0.0"
  }
}
```

**WASM (after):**
```json
{
  "dependencies": {
    "assemblyscript": "^0.27.0",
    "@assemblyscript/wasi-shim": "^0.1.0",
    "assemblyscript-json": "^1.1.0",
    "as-wasi": "^0.6.0"
  },
  "devDependencies": {
    "assemblyscript": "^0.27.0"
  }
}
```

**Mapping common libraries:**

| npm Package | AssemblyScript Alternative |
|-------------|----------------------------|
| `axios`, `node-fetch` | Manual HTTP via WASI sockets (or pass data in) |
| `lodash` | Re-implement needed functions |
| `uuid` | `as-crypto` (crypto.randomUUID) |
| `moment`, `date-fns` | Native Date (limited features) |
| `joi`, `yup` | Manual validation |

#### 3. Update Plugin Manifest

**Docker manifest:**
```json
{
  "id": "data-processor",
  "runtime": "docker",
  "image": "dcyfr-plugin:latest",
  "command": ["node", "dist/index.js"],
  "env": {
    "NODE_ENV": "production"
  },
  "resourceLimits": {
    "maxMemory": "512MB",
    "maxCpu": 1.0,
    "maxExecutionTime": "5m"
  }
}
```

**WASM manifest:**
```json
{
  "id": "data-processor",
  "runtime": "wasm",
  "wasmPath": "./build/plugin.wasm",
  "exports": {
    "processData": {
      "params": ["string"],
      "returns": "string"
    }
  },
  "resourceLimits": {
    "maxMemory": "32MB",
    "maxCpu": 0.5,
    "maxExecutionTime": "500ms"
  },
  "permissions": {
    "network": false,
    "filesystem": false
  }
}
```

### Phase 3: Testing (30-60 minutes)

#### 1. Unit Tests

**Before (Docker):**
```typescript
import { processData } from './plugin';

describe('Data Processor', () => {
  it('should transform input', async () => {
    const result = await processData('{"key":"value"}');
    expect(result).toBe('{"result":"VALUE"}');
  });
});
```

**After (WASM):**
```typescript
import { processData } from '../build/plugin';
import loader from '@assemblyscript/loader';
import fs from 'fs';

describe('Data Processor (WASM)', () => {
  let module: any;
  
  beforeAll(async () => {
    const wasmBuffer = fs.readFileSync('./build/plugin.wasm');
    module = await loader.instantiate(wasmBuffer);
  });
  
  it('should transform input', () => {
    const input = '{"key":"value"}';
    const result = module.processData(input);
    expect(result).toBe('{"result":"VALUE"}');
  });
});
```

#### 2. Performance Benchmarking

```typescript
import { WasmPluginRunner } from '@dcyfr/ai/plugins/runtime';
import { DockerPluginRunner } from '@dcyfr/ai/plugins/runtime';
import { performance } from 'perf_hooks';

async function benchmark() {
  const input = '{"key":"test"}';
  
  // Benchmark WASM
  const wasmStart = performance.now();
  await WasmPluginRunner.run({
    wasmPath: './build/plugin.wasm',
    args: [input],
    env: {},
  });
  const wasmTime = performance.now() - wasmStart;
  
  // Benchmark Docker
  const dockerStart = performance.now();
  await DockerPluginRunner.run({
    image: 'dcyfr-plugin:latest',
    command: ['node', 'dist/index.js', input],
    env: {},
  });
  const dockerTime = performance.now() - dockerStart;
  
  console.log(`WASM: ${wasmTime.toFixed(2)}ms`);
  console.log(`Docker: ${dockerTime.toFixed(2)}ms`);
  console.log(`Speedup: ${(dockerTime / wasmTime).toFixed(2)}x`);
}

benchmark();
```

**Expected results:**
- WASM startup: < 100ms
- Docker startup: 1-3 seconds
- Speedup: 10-30x

### Phase 4: Deployment (15 minutes)

1. **Build WASM module:**
   ```bash
   npx asc plugin.ts --optimize --shrinkLevel 2 --converge
   ```

2. **Generate SBOM:**
   ```bash
   npx cyclonedx-npm --output-file sbom.json
   ```

3. **Submit for certification:**
   ```bash
   dcyfr plugin submit --tier bronze  # or silver/gold
   ```

4. **Publish:**
   ```bash
   dcyfr plugin publish
   ```

---

## Migration Examples

### Example 1: Simple Data Transformer

**Before (Docker):**
```typescript
// plugin.ts
export async function transform(input: string): Promise<string> {
  return input.toUpperCase();
}
```

**After (WASM):**
```typescript
// plugin.ts (AssemblyScript)
export function transform(input: string): string {
  return input.toUpperCase();
}
```

**Changes:** None! This is the ideal migration case.

---

### Example  2: API Client

**Before (Docker):**
```typescript
import axios from 'axios';

export async function fetchUser(id: string): Promise<User> {
  const response = await axios.get(`https://api.example.com/users/${id}`);
  return response.data;
}
```

**After (WASM):**
```typescript
import { Console } from 'as-wasi/assembly';

// Strategy 1: Pass data in (recommended)
export function processUser(userData: string): string {
  Console.log(`Processing user: ${userData}`);
  // Parse + transform user data
  return transformedData;
}

// Strategy 2: Use WASI sockets (advanced)
import { Socket } from 'as-wasi/assembly/wasi';

export function fetchUser(id: string): string {
  const socket = Socket.create();
  socket.connect('api.example.com', 443);
  socket.send(`GET /users/${id} HTTP/1.1\r\nHost: api.example.com\r\n\r\n`);
  const response = socket.receive();
  socket.close();
  return response;
}
```

**Recommendation:** For API-heavy plugins, consider keeping Docker or using a hybrid approach (WASM for computation, Docker for I/O).

---

### Example 3: Filesystem Processing

**Before (Docker):**
```typescript
import { readFileSync } from 'fs';

export async function processFile(path: string): Promise<string> {
  const content = readFileSync(path, 'utf-8');
  return content.toUpperCase();
}
```

**After (WASM):**
```typescript
import { FileSystem } from 'as-wasi/assembly';

export function processFile(path: string): string {
  // Requires preopen permission
  const fd = FileSystem.open(path, 'r');
  const content = FileSystem.readString(fd);
  FileSystem.close(fd);
  return content.toUpperCase();
}
```

**Manifest update:**
```json
{
  "permissions": {
    "filesystem": true
  },
  "preopens": {
    "/data": "/host/data"
  }
}
```

---

## Troubleshooting

### Issue: "Cannot find module 'assemblyscript'"

**Solution:**
```bash
npm install --save-dev assemblyscript
npx asinit .
```

### Issue: "Memory access out of bounds"

**Cause:** Insufficient linear memory pages.

**Solution:** Increase `maxMemory` in plugin.json:
```json
{
  "resourceLimits": {
    "maxMemory": "64MB"  // Increased from 16MB
  }
}
```

### Issue: "Function not exported"

**Cause:** Missing `export` keyword in AssemblyScript.

**Solution:**
```typescript
// ❌ WRONG
function transform(input: string): string { /* ... */ }

// ✅ CORRECT
export function transform(input: string): string { /* ... */ }
```

### Issue: "WASI not available"

**Cause:** Node.js version < 18.

**Solution:** Upgrade to Node.js 18+ or use Docker runtime.

---

## Hybrid Approach

For complex plugins, use both WASM and Docker:

```json
{
  "id": "hybrid-plugin",
  "runtimes": [
    {
      "name": "compute",
      "type": "wasm",
      "wasmPath": "./build/compute.wasm",
      "exports": ["transform", "validate"]
    },
    {
      "name": "io",
      "type": "docker",
      "image": "plugin-io:latest",
      "exports": ["fetchData", "saveResults"]
    }
  ]
}
```

**When to use hybrid:**
- CPU-intensive computation (use WASM)
- I/O-heavy operations (use Docker)
- Need both performance and flexibility

---

## Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Startup time | <100ms | `WasmPluginRunner.run()` first call |
| Execution overhead | <5% | Compare WASM vs native AssemblyScript |
| Memory footprint | <32MB | Check `maxMemory` in successful runs |
| Binary size | <500KB | `ls -lh build/plugin.wasm` |

---

## Support

- **Migration help:** https://discord.gg/dcyfr #plugin-migration
- **AssemblyScript docs:** https://www.assemblyscript.org/
- **WASI spec:** https://wasi.dev/

---

**Last Updated:** March 1, 2026  
**License:** MIT  
**Maintainer:** DCYFR Security Team

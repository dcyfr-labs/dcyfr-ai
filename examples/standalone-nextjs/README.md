# Standalone Next.js Example with @dcyfr/ai

This is a minimal Next.js application demonstrating how to use @dcyfr/ai framework in a non-DCYFR project.

## Features Demonstrated

- ✅ Configuration management with `package.json` integration
- ✅ Telemetry tracking for AI agents
- ✅ Custom validation plugins
- ✅ Multi-provider AI with fallback
- ✅ CLI integration for validation

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Your Providers

Create `.env.local`:

```env
# Claude (Anthropic)
ANTHROPIC_API_KEY=your_key_here

# Groq
GROQ_API_KEY=your_key_here

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434
```

### 3. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Run Validation

```bash
npm run validate
```

### 5. View Telemetry

```bash
npm run telemetry:report
```

## Project Structure

```
standalone-nextjs/
├── package.json          # Config in "dcyfr" key
├── scripts/
│   ├── validate.js       # Custom validation runner
│   └── telemetry-report.js  # Telemetry analytics
├── lib/
│   ├── ai-config.ts      # Framework configuration
│   └── telemetry.ts      # Telemetry setup
├── plugins/
│   └── next-validator.ts # Custom Next.js validation
└── app/
    └── page.tsx          # Next.js app
```

## Configuration

This example uses `package.json` for configuration (see the `dcyfr` key).

You can also create `.dcyfr.yaml`:

```yaml
version: '1.0.0'
projectName: standalone-example

telemetry:
  enabled: true
  storage: file
  storagePath: .dcyfr/telemetry

providers:
  enabled: true
  primary: claude
  fallback: [groq, ollama]

validation:
  enabled: true
  parallel: true
  gates:
    - name: typescript
      plugins: [typescript-compiler]
      required: true
      failureMode: error
```

## Custom Validation

See [plugins/next-validator.ts](./plugins/next-validator.ts) for an example of creating custom validators for Next.js projects.

## Telemetry Tracking

The example tracks:
- AI agent sessions (which provider, task type)
- Quality metrics (compliance, test pass rate)
- Cost tracking (token usage)
- Performance metrics (execution time)

View reports with `npm run telemetry:report`

## Learn More

- [@dcyfr/ai Documentation](../../docs/GETTING-STARTED.md)
- [API Reference](../../docs/API.md)
- [Plugin Development](../../docs/PLUGINS.md)

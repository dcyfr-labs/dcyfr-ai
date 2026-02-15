<!-- TLP:CLEAR -->

# DCYFR Capability Bootstrap API Documentation

**Information Classification:** TLP:CLEAR (Public)  
**Last Updated:** February 15, 2026  
**Version:** 1.0.0  
**Module:** `@dcyfr/ai/capability-bootstrap`

## Overview

The DCYFR Capability Bootstrap Toolkit provides automated capability manifest generation for new agent onboarding. It analyzes agent definitions from multiple formats and generates comprehensive capability manifests with intelligent confidence score initialization and gradual validation support.

## Quick Start

```typescript
import { bootstrapAgent } from '@dcyfr/ai/capability-bootstrap';

// Bootstrap from Markdown agent file
const result = await bootstrapAgent({
  type: 'file',
  filePath: './agents/my-agent.agent.md'
});

console.log(`Generated manifest for: ${result.agentId}`);
console.log(`Detected ${result.manifest.capabilities.length} capabilities`);
```

## Core API Reference

### Types

#### `AgentSource`

Supported agent definition sources for the bootstrap system.

```typescript
type AgentSource = 
  | { type: 'markdown'; content: string; path?: string }
  | { type: 'typescript'; agentObject: any }
  | { type: 'json'; definition: any }
  | { type: 'file'; filePath: string };
```

**Supported Formats:**

| Type | Description | Use Case |
|------|-------------|----------|
| `markdown` | Claude-style `.agent.md` files with YAML frontmatter | Standard DCYFR agent definitions |
| `typescript` | Agent objects in TypeScript/JavaScript | Programmatically created agents |
| `json` | JSON agent definitions | Configuration-based agents |
| `file` | File path to any supported format | File-based agent loading |

#### `CapabilityDetectionConfig`

Configuration for capability detection algorithm.

```typescript
interface CapabilityDetectionConfig {
  minimumKeywordMatches?: number;        // Default: 2
  fuzzyMatching?: boolean;               // Default: true
  customKeywordMappings?: Record<string, string[]>;
  mandatoryCapabilities?: string[];      // Default: ['pattern_enforcement']
  agentTier?: 'workspace' | 'production' | 'generic';
}
```

**Configuration Options:**

- **`minimumKeywordMatches`**: Minimum keyword matches required to assign a capability
- **`fuzzyMatching`**: Enable intelligent fuzzy matching for capability keywords
- **`customKeywordMappings`**: Extend default detection with custom capability-keyword mappings
- **`mandatoryCapabilities`**: Capabilities to always include regardless of detection
- **`agentTier`**: Agent tier for specialized detection patterns

#### `ConfidenceInitConfig`

Configuration for confidence score initialization.

```typescript
interface ConfidenceInitConfig {
  initialConfidence?: number;           // Default: 0.50
  validatedConfidence?: number;         // Default: 0.85
  provenConfidence?: number;            // Default: 0.92
  gradualValidation?: boolean;
  completionsForProvenStatus?: number;
}
```

**Confidence Levels:**

- **`initialConfidence`**: Base confidence for unvalidated capabilities (0.50)
- **`validatedConfidence`**: Confidence boost for manually validated capabilities (0.85)
- **`provenConfidence`**: Confidence for capabilities with successful completions (0.92)
- **`gradualValidation`**: Enable progressive confidence increases over time
- **`completionsForProvenStatus`**: Completions needed to reach proven status

#### `BootstrapResult`

Result of the bootstrap process with metadata and suggestions.

```typescript
interface BootstrapResult {
  agentId: string;
  manifest: AgentCapabilityManifest;
  detectedCapabilities: Array<{
    capabilityId: string;
    detectionConfidence: number;
    matchedKeywords: string[];
  }>;
  warnings: string[];
  suggestions: string[];
}
```

### Classes

#### `CapabilityBootstrap`

Main bootstrap orchestrator with configurable detection and confidence initialization.

```typescript
class CapabilityBootstrap {
  constructor(
    detectionConfig?: CapabilityDetectionConfig,
    confidenceConfig?: ConfidenceInitConfig
  );
  
  async bootstrap(source: AgentSource): Promise<BootstrapResult>;
  async bootstrapBatch(sources: AgentSource[]): Promise<BootstrapResult[]>;
}
```

**Methods:**

- **`bootstrap(source: AgentSource)`**: Bootstrap a single agent from any supported source
- **`bootstrapBatch(sources: AgentSource[])`**: Bootstrap multiple agents in parallel

#### `AgentAnalyzer`

Agent definition parser supporting multiple formats.

```typescript
class AgentAnalyzer {
  async analyze(source: AgentSource): Promise<{
    name: string;
    description: string;
    content: string;
    metadata: Record<string, any>;
  }>;
}
```

**Supported Analysis:**

- **Markdown**: YAML frontmatter extraction, content parsing
- **TypeScript**: Object property analysis
- **JSON**: Schema-based parsing
- **File**: Auto-detection and parsing

#### `CapabilityDetector`

Intelligent capability detection using keyword analysis and pattern matching.

```typescript
class CapabilityDetector {
  constructor(config?: CapabilityDetectionConfig);
  
  detect(content: string, agentName: string): Array<{
    capabilityId: string;
    detectionConfidence: number;
    matchedKeywords: string[];
  }>;
}
```

**Detection Features:**

- **Keyword Matching**: Fuzzy and exact keyword matching
- **Name Analysis**: Agent name pattern matching
- **Tier-Specific Detection**: Specialized patterns for workspace/production agents
- **Custom Mappings**: Extensible keyword-capability mappings

#### `ConfidenceInitializer`

Confidence score calculator with validation tracking.

```typescript
class ConfidenceInitializer {
  constructor(config?: ConfidenceInitConfig);
  
  initializeConfidence(
    detectionConfidence: number,
    isValidated: boolean,
    successfulCompletions: number
  ): number;
}
```

**Confidence Algorithm:**

1. **Base Score**: Uses detection confidence as starting point
2. **Validation Boost**: Increases confidence for validated capabilities  
3. **Completion History**: Progressive increases based on successful completions
4. **Gradual Learning**: Optional gradual validation mode for continuous improvement

### Functions

#### `bootstrapAgent(source: AgentSource): Promise<BootstrapResult>`

Bootstrap a single agent using default configuration.

```typescript
// Bootstrap from Markdown file
const result = await bootstrapAgent({
  type: 'file',
  filePath: './agents/security-expert.agent.md'
});

// Bootstrap from in-memory content
const result = await bootstrapAgent({
  type: 'markdown',
  content: markdownContent,
  path: 'security-expert.agent.md'
});
```

#### `bootstrapAgents(sources: AgentSource[]): Promise<BootstrapResult[]>`

Bootstrap multiple agents in parallel.

```typescript
const sources: AgentSource[] = [
  { type: 'file', filePath: './agents/frontend-dev.agent.md' },
  { type: 'file', filePath: './agents/backend-dev.agent.md' },
  { type: 'json', definition: apiAgentConfig }
];

const results = await bootstrapAgents(sources);
console.log(`Bootstrapped ${results.length} agents`);
```

## Usage Examples

### Basic Agent Bootstrapping

```typescript
import { bootstrapAgent } from '@dcyfr/ai/capability-bootstrap';

// Load and bootstrap an agent
const result = await bootstrapAgent({
  type: 'file',
  filePath: './agents/typescript-expert.agent.md'
});

// Access generated manifest
console.log('Agent:', result.agentId);
console.log('Capabilities:', result.manifest.capabilities.map(c => c.id));
console.log('Overall Confidence:', result.manifest.overall_confidence);

// Review detection details
result.detectedCapabilities.forEach(capability => {
  console.log(`${capability.capabilityId}: ${capability.detectionConfidence.toFixed(2)}`);
  console.log(`  Keywords: ${capability.matchedKeywords.join(', ')}`);
});

// Handle warnings and suggestions
if (result.warnings.length > 0) {
  console.warn('Bootstrap warnings:', result.warnings);
}

if (result.suggestions.length > 0) {
  console.info('Suggestions:', result.suggestions);
}
```

### Custom Configuration

```typescript
import { CapabilityBootstrap } from '@dcyfr/ai/capability-bootstrap';

// Create bootstrap with custom configuration
const bootstrap = new CapabilityBootstrap(
  // Detection config
  {
    minimumKeywordMatches: 3,
    fuzzyMatching: true,
    agentTier: 'production',
    mandatoryCapabilities: ['pattern_enforcement', 'security_compliance'],
    customKeywordMappings: {
      'custom_validation': ['audit', 'compliance', 'verify', 'validate'],
      'performance_optimization': ['optimize', 'performance', 'speed', 'efficiency']
    }
  },
  // Confidence config
  {
    initialConfidence: 0.60,
    validatedConfidence: 0.90,
    gradualValidation: true,
    completionsForProvenStatus: 5
  }
);

// Bootstrap with custom configuration
const result = await bootstrap.bootstrap({
  type: 'file',
  filePath: './agents/production-agent.agent.md'
});
```

### Batch Processing

```typescript
import { bootstrapAgents } from '@dcyfr/ai/capability-bootstrap';
import { glob } from 'glob';

// Find all agent files
const agentFiles = await glob('./agents/**/*.agent.md');

// Create agent sources
const sources = agentFiles.map(filePath => ({
  type: 'file' as const,
  filePath
}));

// Bootstrap all agents
const results = await bootstrapAgents(sources);

// Process results
for (const result of results) {
  console.log(`${result.agentId}: ${result.manifest.capabilities.length} capabilities`);
  
  // Save manifest to file
  await writeFile(
    `./manifests/${result.agentId}.json`,
    JSON.stringify(result.manifest, null, 2)
  );
}

console.log(`Successfully bootstrapped ${results.length} agents`);
```

### Integration with Agent Factory

```typescript
import { bootstrapAgent } from '@dcyfr/ai/capability-bootstrap';
import { AgentFactory } from '@dcyfr/ai';

// Bootstrap and create agent instance
async function createAgentFromDefinition(agentPath: string) {
  // Bootstrap to generate capability manifest
  const bootstrap = await bootstrapAgent({
    type: 'file',
    filePath: agentPath
  });
  
  // Create agent instance with generated manifest
  const agent = AgentFactory.create({
    ...bootstrap.manifest,
    capabilities: bootstrap.manifest.capabilities.map(c => ({
      ...c,
      // Custom capability initialization
      enabled: c.confidence_level > 0.7
    }))
  });
  
  return {
    agent,
    bootstrap,
    suggestions: bootstrap.suggestions
  };
}

// Usage
const { agent, bootstrap, suggestions } = await createAgentFromDefinition(
  './agents/fullstack-developer.agent.md'
);

// Review suggestions for improvement
if (suggestions.length > 0) {
  console.log('Bootstrap suggestions:');
  suggestions.forEach((suggestion, i) => {
    console.log(`${i + 1}. ${suggestion}`);
  });
}
```

## Capability Detection Patterns

### Built-in Capability Keywords

The system includes default keyword mappings for common capabilities:

```typescript
// Example built-in mappings (partial)
const DEFAULT_KEYWORDS = {
  'code_generation': ['generate', 'create', 'build', 'implement', 'develop'],
  'code_review': ['review', 'analyze', 'audit', 'inspect', 'examine'],
  'debugging': ['debug', 'fix', 'troubleshoot', 'diagnose', 'resolve'],
  'testing': ['test', 'spec', 'coverage', 'validate', 'verify'],
  'documentation': ['document', 'readme', 'guide', 'explain', 'describe'],
  'security_analysis': ['security', 'vulnerability', 'owasp', 'audit', 'compliance'],
  'performance_optimization': ['performance', 'optimize', 'speed', 'efficiency', 'benchmark'],
  'pattern_enforcement': ['pattern', 'convention', 'style', 'standard', 'consistency']
};
```

### Detection Algorithm

1. **Content Analysis**: Scans agent description and content for capability keywords
2. **Name Matching**: Checks if agent name suggests specific capabilities
3. **Fuzzy Matching**: Uses intelligent fuzzy matching for keyword variations
4. **Confidence Scoring**: Calculates detection confidence based on keyword matches
5. **Mandatory Injection**: Adds required capabilities regardless of detection
6. **Tier-Specific Rules**: Applies specialized detection for workspace/production agents

### Custom Detection Rules

```typescript
// Extend detection with custom rules
const customBootstrap = new CapabilityBootstrap({
  customKeywordMappings: {
    'ai_training': ['train', 'model', 'ml', 'ai', 'neural', 'deep learning'],
    'data_analysis': ['analyze', 'data', 'statistics', 'metrics', 'insights'],
    'api_design': ['api', 'endpoint', 'rest', 'graphql', 'openapi'],
    'devops': ['deploy', 'ci/cd', 'docker', 'kubernetes', 'infrastructure']
  },
  mandatoryCapabilities: [
    'pattern_enforcement',
    'security_compliance',
    'documentation'
  ],
  agentTier: 'production'
});
```

## Error Handling

### Common Error Scenarios

```typescript
try {
  const result = await bootstrapAgent(source);
} catch (error) {
  if (error.message.includes('Unsupported agent source type')) {
    console.error('Invalid source type provided');
  } else if (error.message.includes('Failed to parse')) {
    console.error('Agent definition parsing failed:', error);
  } else if (error.message.includes('File not found')) {
    console.error('Agent file does not exist:', source.filePath);
  } else {
    console.error('Unexpected bootstrap error:', error);
  }
}
```

### Validation and Warnings

The bootstrap system provides non-fatal warnings and suggestions:

```typescript
const result = await bootstrapAgent(source);

// Handle warnings (non-fatal issues)
if (result.warnings.length > 0) {
  console.warn('Bootstrap completed with warnings:');
  result.warnings.forEach(warning => console.warn(`- ${warning}`));
}

// Review suggestions for improvement
if (result.suggestions.length > 0) {
  console.info('Suggestions to improve agent definition:');
  result.suggestions.forEach(suggestion => console.info(`- ${suggestion}`));
}
```

## Best Practices

### Agent Definition Quality

1. **Clear Descriptions**: Write detailed agent descriptions with capability keywords
2. **Structured Content**: Use consistent formatting and clear section headers
3. **Capability Hints**: Include capability-related keywords in agent content
4. **Metadata Completeness**: Provide comprehensive YAML frontmatter

### Configuration Tuning

1. **Minimum Matches**: Adjust `minimumKeywordMatches` based on agent complexity
2. **Fuzzy Matching**: Enable for flexible detection, disable for strict matching
3. **Custom Keywords**: Add domain-specific keyword mappings for specialized agents
4. **Confidence Thresholds**: Tune confidence levels based on validation requirements

### Production Deployment

1. **Validation Pipeline**: Always review bootstrap results before production deployment
2. **Confidence Monitoring**: Track capability confidence scores over time
3. **Gradual Rollout**: Use gradual validation for progressive capability enablement
4. **Batch Processing**: Use batch bootstrapping for efficient multi-agent setup

## Integration Points

### Agent Factory Integration

```typescript
import { bootstrapAgent } from '@dcyfr/ai/capability-bootstrap';
import { AgentFactory } from '@dcyfr/ai';

const bootstrap = await bootstrapAgent(source);
const agent = AgentFactory.create(bootstrap.manifest);
```

### Capability Validation Integration

```typescript
import { validateCapabilities } from '@dcyfr/ai/capability-validation';

const result = await bootstrapAgent(source);
const validationReport = await validateCapabilities(result.manifest);
```

### Monitoring Integration

```typescript
import { trackCapabilityMetrics } from '@dcyfr/ai/monitoring';

const result = await bootstrapAgent(source);
trackCapabilityMetrics(result.agentId, result.manifest.capabilities);
```

---

**Next Steps:**
- Review [Capability Validation API](./capability-validation-api.md)
- See [Agent Factory Documentation](./agent-factory-api.md)  
- Explore [MCP Integration Guide](../guides/mcp-integration.md)

**Support:**
- Issues: [GitHub Issues](https://github.com/dcyfr/dcyfr-ai/issues)
- Discussions: [GitHub Discussions](https://github.com/dcyfr/dcyfr-ai/discussions)
- Documentation: [DCYFR AI Documentation](https://docs.dcyfr.ai)
/**
 * Configuration Schema - Zod validation schemas for framework configuration
 * 
 * Provides type-safe configuration with runtime validation and defaults.
 */

import { z } from 'zod';

/**
 * Severity level for validation issues
 */
export const SeveritySchema = z.enum(['error', 'warning', 'info']);

/**
 * Failure mode for validation gates
 */
export const FailureModeSchema = z.enum(['error', 'warn', 'skip']);

/**
 * Design token configuration
 */
export const DesignTokenConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokenFile: z.string().default('src/lib/design-tokens.ts'),
  compliance: z.number().min(0).max(1).default(0.90),
  autofix: z.boolean().default(false),
  strictMode: z.boolean().default(true),
  patterns: z.object({
    spacing: z.array(z.string()).default([
      'SPACING.XS',
      'SPACING.SM',
      'SPACING.MD',
      'SPACING.LG',
      'SPACING.XL',
    ]),
    typography: z.array(z.string()).default([
      'TYPOGRAPHY.H1',
      'TYPOGRAPHY.H2',
      'TYPOGRAPHY.BODY',
    ]),
    colors: z.array(z.string()).default([
      'SEMANTIC_COLORS.primary',
      'SEMANTIC_COLORS.success',
    ]),
  }).default({}),
}).default({});

/**
 * Barrel export configuration
 */
export const BarrelExportConfigSchema = z.object({
  enabled: z.boolean().default(true),
  barrelPaths: z.array(z.string()).default([
    '@/components',
    '@/lib',
    '@/utils',
  ]),
  allowRelativeWithin: z.boolean().default(false),
  strictMode: z.boolean().default(true),
  exceptions: z.array(z.string()).default([
    'src/app/**/layout.tsx',
    'src/app/**/page.tsx',
  ]),
}).default({});

/**
 * PageLayout enforcement configuration
 */
export const PageLayoutConfigSchema = z.object({
  enabled: z.boolean().default(true),
  targetUsage: z.number().min(0).max(1).default(0.90),
  pagePattern: z.string().default('src/app/**/page.tsx'),
  exceptions: z.array(z.string()).default([
    'ArticleLayout',
    'ArchiveLayout',
    'ErrorLayout',
  ]),
  strictMode: z.boolean().default(true),
}).default({});

/**
 * Test data guardian configuration
 */
export const TestDataConfigSchema = z.object({
  enabled: z.boolean().default(true),
  testPattern: z.string().default('**/*.{test,spec}.{ts,tsx,js,jsx}'),
  sensitivePatterns: z.object({
    apiKeys: z.boolean().default(true),
    passwords: z.boolean().default(true),
    secrets: z.boolean().default(true),
    tokens: z.boolean().default(true),
    emails: z.boolean().default(true),
    urls: z.boolean().default(true),
  }).default({}),
  allowedPrefixes: z.array(z.string()).default([
    'MOCK_',
    'TEST_',
    'FAKE_',
    'FIXTURE_',
  ]),
}).default({});

/**
 * Plugin configuration
 */
export const PluginConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  timeout: z.number().positive().default(30000),
  failureMode: FailureModeSchema.default('warn'),
  config: z.record(z.unknown()).default({}),
});

/**
 * Validation gate configuration
 */
export const ValidationGateConfigSchema = z.object({
  name: z.string(),
  plugins: z.array(z.string()),
  required: z.boolean().default(true),
  failureMode: FailureModeSchema.default('error'),
  parallel: z.boolean().default(false),
  timeout: z.number().positive().default(60000),
});

/**
 * Telemetry configuration
 */
export const TelemetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storage: z.enum(['memory', 'file', 'redis', 'database']).default('file'),
  storagePath: z.string().default('.dcyfr/telemetry'),
  retentionDays: z.number().positive().default(30),
  sampling: z.number().min(0).max(1).default(1.0),
}).default({});

/**
 * Provider configuration
 */
export const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  primary: z.string().default('claude'),
  fallback: z.array(z.string()).default(['groq', 'ollama', 'copilot']),
  timeout: z.number().positive().default(30000),
  retries: z.number().min(0).default(3),
  providers: z.record(z.object({
    enabled: z.boolean().default(true),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    maxTokens: z.number().positive().optional(),
  })).default({}),
}).default({});

/**
 * Agent category schema
 */
export const AgentCategorySchema = z.enum([
  'core',
  'development',
  'architecture',
  'testing',
  'security',
  'performance',
  'content',
  'devops',
  'data',
  'research',
  'specialized',
]);

/**
 * Agent tier schema
 */
export const AgentTierSchema = z.enum(['public', 'private', 'project']);

/**
 * Agent model schema
 */
export const AgentModelSchema = z.enum(['haiku', 'sonnet', 'opus']);

/**
 * Agent permission mode schema
 */
export const AgentPermissionModeSchema = z.enum(['readonly', 'acceptEdits', 'full']);

/**
 * Agent quality gate schema
 */
export const AgentQualityGateSchema = z.object({
  name: z.string(),
  threshold: z.number().min(0).max(1),
  metric: z.string(),
  failureMode: FailureModeSchema.default('warn'),
});

/**
 * Agent proactive trigger schema
 */
export const AgentProactiveTriggerSchema = z.object({
  pattern: z.string(),
  action: z.enum(['warn', 'block', 'fix', 'suggest']),
  message: z.string(),
  priority: z.number().default(50),
});

/**
 * Agent manifest schema
 */
export const AgentManifestSchema = z.object({
  name: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string(),
  category: AgentCategorySchema,
  tier: AgentTierSchema,
  model: AgentModelSchema.default('sonnet'),
  permissionMode: AgentPermissionModeSchema.default('acceptEdits'),
  tools: z.array(z.string()).default([]),
  delegatesTo: z.array(z.string()).optional(),
  delegatedFrom: z.array(z.string()).optional(),
  proactiveTriggers: z.array(AgentProactiveTriggerSchema).optional(),
  qualityGates: z.array(AgentQualityGateSchema).optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Agent registry tier configuration schema
 */
export const AgentTierConfigSchema = z.object({
  enabled: z.boolean().default(true),
  source: z.string().optional(),
  paths: z.array(z.string()).optional(),
});

/**
 * Agent registry configuration schema
 */
export const AgentRegistryConfigSchema = z.object({
  autoDiscover: z.boolean().default(false),
  projectPaths: z.array(z.string()).default(['.claude/agents', '.github/agents']),
  public: AgentTierConfigSchema.default({ enabled: true, source: '@dcyfr/ai/agents-builtin' }),
  private: AgentTierConfigSchema.default({ enabled: false }),
  project: AgentTierConfigSchema.default({ enabled: true, paths: ['.claude/agents', '.github/agents'] }),
}).default({});

/**
 * Agent routing rule schema
 */
export const AgentRoutingRuleSchema = z.object({
  pattern: z.string(),
  agent: z.string(),
  priority: z.number().default(50),
});

/**
 * Agent router configuration schema
 */
export const AgentRouterConfigSchema = z.object({
  defaultAgent: z.string().default('fullstack-developer'),
  routingRules: z.array(AgentRoutingRuleSchema).default([]),
  delegationEnabled: z.boolean().default(true),
  maxDelegationDepth: z.number().min(0).default(3),
}).default({});

/**
 * MCP transport schema
 */
export const MCPTransportSchema = z.enum(['stdio', 'sse', 'websocket']);

/**
 * MCP server configuration schema
 */
export const MCPServerConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  transport: MCPTransportSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  enabled: z.boolean().default(true),
  tier: AgentTierSchema.optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * MCP registry configuration schema
 */
export const MCPRegistryConfigSchema = z.object({
  autoDiscover: z.boolean().default(false),
  searchPaths: z.array(z.string()).default(['.mcp.json', '.vscode/mcp.json']),
  configFileName: z.string().default('.mcp.json'),
  healthCheckInterval: z.number().positive().default(60000),
  healthMonitoring: z.boolean().default(false),
}).default({});

/**
 * Main framework configuration schema
 */
export const FrameworkConfigSchema = z.object({
  // Framework metadata
  version: z.string().default('1.0.0'),
  projectName: z.string().optional(),
  
  // Core features
  telemetry: TelemetryConfigSchema,
  providers: ProviderConfigSchema,
  
  // Validation
  validation: z.object({
    enabled: z.boolean().default(true),
    parallel: z.boolean().default(true),
    failFast: z.boolean().default(false),
    gates: z.array(ValidationGateConfigSchema).default([]),
  }).default({}),
  
  // Plugins
  plugins: z.array(PluginConfigSchema).default([]),
  
  // DCYFR-specific agents
  agents: z.object({
    designTokens: DesignTokenConfigSchema,
    barrelExports: BarrelExportConfigSchema,
    pageLayout: PageLayoutConfigSchema,
    testData: TestDataConfigSchema,
  }).default({}),
  
  // Project settings
  project: z.object({
    root: z.string().default(process.cwd()),
    include: z.array(z.string()).default(['src/**/*.{ts,tsx,js,jsx}']),
    exclude: z.array(z.string()).default([
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
    ]),
  }).default({}),

  // Agent registry configuration
  agentRegistry: AgentRegistryConfigSchema,

  // Agent router configuration
  agentRouter: AgentRouterConfigSchema,

  // MCP registry configuration
  mcpRegistry: MCPRegistryConfigSchema,
});

/**
 * Type inference from schemas
 */
export type FrameworkConfig = z.infer<typeof FrameworkConfigSchema>;
export type DesignTokenConfig = z.infer<typeof DesignTokenConfigSchema>;
export type BarrelExportConfig = z.infer<typeof BarrelExportConfigSchema>;
export type PageLayoutConfig = z.infer<typeof PageLayoutConfigSchema>;
export type TestDataConfig = z.infer<typeof TestDataConfigSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type ValidationGateConfig = z.infer<typeof ValidationGateConfigSchema>;
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type FailureMode = z.infer<typeof FailureModeSchema>;

// Agent schema types
export type AgentCategory = z.infer<typeof AgentCategorySchema>;
export type AgentTier = z.infer<typeof AgentTierSchema>;
export type AgentModel = z.infer<typeof AgentModelSchema>;
export type AgentPermissionMode = z.infer<typeof AgentPermissionModeSchema>;
export type AgentQualityGateConfig = z.infer<typeof AgentQualityGateSchema>;
export type AgentProactiveTriggerConfig = z.infer<typeof AgentProactiveTriggerSchema>;
export type AgentManifestConfig = z.infer<typeof AgentManifestSchema>;
export type AgentTierConfig = z.infer<typeof AgentTierConfigSchema>;
export type AgentRegistryConfig = z.infer<typeof AgentRegistryConfigSchema>;
export type AgentRoutingRuleConfig = z.infer<typeof AgentRoutingRuleSchema>;
export type AgentRouterConfig = z.infer<typeof AgentRouterConfigSchema>;

// MCP schema types
export type MCPTransport = z.infer<typeof MCPTransportSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPRegistryConfig = z.infer<typeof MCPRegistryConfigSchema>;

/**
 * Default framework configuration
 */
export const DEFAULT_CONFIG: FrameworkConfig = {
  version: '1.0.0',
  
  telemetry: {
    enabled: true,
    storage: 'file',
    storagePath: '.dcyfr/telemetry',
    retentionDays: 30,
    sampling: 1.0,
  },
  
  providers: {
    enabled: true,
    primary: 'claude',
    fallback: ['groq', 'ollama', 'copilot'],
    timeout: 30000,
    retries: 3,
    providers: {},
  },
  
  validation: {
    enabled: true,
    parallel: true,
    failFast: false,
    gates: [],
  },
  
  plugins: [],
  
  agents: {
    designTokens: {
      enabled: true,
      tokenFile: 'src/lib/design-tokens.ts',
      compliance: 0.90,
      autofix: false,
      strictMode: true,
      patterns: {
        spacing: ['SPACING.XS', 'SPACING.SM', 'SPACING.MD', 'SPACING.LG', 'SPACING.XL'],
        typography: ['TYPOGRAPHY.H1', 'TYPOGRAPHY.H2', 'TYPOGRAPHY.BODY'],
        colors: ['SEMANTIC_COLORS.primary', 'SEMANTIC_COLORS.success'],
      },
    },
    barrelExports: {
      enabled: true,
      barrelPaths: ['@/components', '@/lib', '@/utils'],
      allowRelativeWithin: false,
      strictMode: true,
      exceptions: ['src/app/**/layout.tsx', 'src/app/**/page.tsx'],
    },
    pageLayout: {
      enabled: true,
      targetUsage: 0.90,
      pagePattern: 'src/app/**/page.tsx',
      exceptions: ['ArticleLayout', 'ArchiveLayout', 'ErrorLayout'],
      strictMode: true,
    },
    testData: {
      enabled: true,
      testPattern: '**/*.{test,spec}.{ts,tsx,js,jsx}',
      sensitivePatterns: {
        apiKeys: true,
        passwords: true,
        secrets: true,
        tokens: true,
        emails: true,
        urls: true,
      },
      allowedPrefixes: ['MOCK_', 'TEST_', 'FAKE_', 'FIXTURE_'],
    },
  },
  
  project: {
    root: process.cwd(),
    include: ['src/**/*.{ts,tsx,js,jsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
    ],
  },

  agentRegistry: {
    autoDiscover: false,
    projectPaths: ['.claude/agents', '.github/agents'],
    public: { enabled: true, source: '@dcyfr/ai/agents-builtin' },
    private: { enabled: false },
    project: { enabled: true, paths: ['.claude/agents', '.github/agents'] },
  },

  agentRouter: {
    defaultAgent: 'fullstack-developer',
    routingRules: [],
    delegationEnabled: true,
    maxDelegationDepth: 3,
  },

  mcpRegistry: {
    autoDiscover: false,
    searchPaths: ['.mcp.json', '.vscode/mcp.json'],
    configFileName: '.mcp.json',
    healthCheckInterval: 60000,
    healthMonitoring: false,
  },
};

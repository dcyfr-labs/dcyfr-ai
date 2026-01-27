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
};

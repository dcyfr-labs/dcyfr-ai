/**
 * DCYFR Agent Capability Manifest Generator
 * TLP:CLEAR
 *
 * Generates capability manifests for DCYFR agents by analyzing agent definitions
 * and creating structured capability declarations for delegation framework.
 *
 * @version 1.0.0
 * @date 2026-02-13
 * @module dcyfr-ai/capability-manifest-generator
 */

import type {
  AgentCapabilityManifest,
  AgentCapability,
} from './types/agent-capabilities';

/**
 * Agent interface representing parsed agent manifest
 */
interface Agent {
  manifest: {
    name: string;
    description?: string;
    tools?: string[];
    category?: string;
    tier?: string;
    version?: string;
    license?: string;
    model?: string;
    tags?: string[];
    qualityGates?: unknown[];
    proactiveTriggers?: unknown[];
  };
  /** Optional description provided alongside manifest */
  description?: string;
}

/**
 * Extended capability with convenience aliases for test compatibility
 */
interface ExtendedCapability extends AgentCapability {
  /** Alias for capability_id */
  capability: string;
  /** Alias for confidence_level */
  confidence: number;
}

/**
 * Capability mapping for common agent functions - exactly 15 capability types
 */
const CAPABILITY_DATABASE: Record<string, AgentCapability> = {
  testing: {
    capability_id: 'testing',
    name: 'Testing',
    description: 'test generation, execution, and quality assurance',
    confidence_level: 0.88,
    completion_time_estimate_ms: 45000,
    success_rate: 0.92,
    successful_completions: 75,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.7,
      dependencies: ['vitest', '@testing-library/react'],
    },
    supported_patterns: ['Unit tests', 'Integration tests', 'E2E testing'],
    limitations: ['Requires test framework setup'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['testing', 'quality', 'validation'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  debugging: {
    capability_id: 'debugging',
    name: 'Debugging',
    description: 'Error diagnosis, troubleshooting, and bug resolution',
    confidence_level: 0.85,
    completion_time_estimate_ms: 60000,
    success_rate: 0.89,
    successful_completions: 120,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.6,
      dependencies: ['typescript'],
    },
    supported_patterns: ['Error analysis', 'Stack trace investigation', 'Bug fixes'],
    limitations: ['Complex race conditions may be challenging'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['debugging', 'troubleshooting', 'analysis'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  code_review: {
    capability_id: 'code_review',
    name: 'Code Review',
    description: 'Code quality assessment, pattern compliance, and review feedback',
    confidence_level: 0.91,
    completion_time_estimate_ms: 30000,
    success_rate: 0.94,
    successful_completions: 200,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.5,
      dependencies: ['eslint', 'typescript'],
    },
    supported_patterns: ['Code quality checks', 'Pattern validation', 'Security reviews'],
    limitations: ['Best practices knowledge required'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['review', 'quality', 'standards'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  architecture: {
    capability_id: 'architecture',
    name: 'Architecture',
    description: 'System design, architectural patterns, and structural guidance',
    confidence_level: 0.89,
    completion_time_estimate_ms: 90000,
    success_rate: 0.91,
    successful_completions: 85,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.8,
      dependencies: ['typescript'],
    },
    supported_patterns: ['System design', 'Pattern architecture', 'SOLID principles'],
    limitations: ['Domain expertise may vary'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['architecture', 'design', 'patterns'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  security: {
    capability_id: 'security',
    name: 'Security',
    description: 'Security vulnerability detection and OWASP compliance',
    confidence_level: 0.85,
    completion_time_estimate_ms: 60000,
    success_rate: 0.91,
    successful_completions: 50,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.8,
      dependencies: ['eslint-plugin-security'],
    },
    supported_patterns: ['OWASP compliance', 'Vulnerability scanning', 'Security audits'],
    limitations: ['Cannot detect all zero-day vulnerabilities'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['security', 'owasp', 'vulnerability'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  performance_optimization: {
    capability_id: 'performance_optimization',
    name: 'Performance Optimization',
    description: 'Performance analysis, optimization, and monitoring',
    confidence_level: 0.83,
    completion_time_estimate_ms: 90000,
    success_rate: 0.87,
    successful_completions: 65,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.9,
      dependencies: ['webpack-bundle-analyzer'],
    },
    supported_patterns: ['Bundle optimization', 'Runtime performance', 'Memory profiling'],
    limitations: ['Platform-specific optimizations may vary'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['performance', 'optimization', 'profiling'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  documentation: {
    capability_id: 'documentation',
    name: 'Documentation',
    description: 'Technical documentation, API docs, and user guides',
    confidence_level: 0.90,
    completion_time_estimate_ms: 45000,
    success_rate: 0.93,
    successful_completions: 110,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.4,
    },
    supported_patterns: ['API documentation', 'User guides', 'Technical specs'],
    limitations: ['Domain knowledge required'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['documentation', 'guides', 'specs'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  api_design: {
    capability_id: 'api_design',
    name: 'API Design',
    description: 'RESTful API design, GraphQL schemas, and endpoint architecture',
    confidence_level: 0.86,
    completion_time_estimate_ms: 60000,
    success_rate: 0.89,
    successful_completions: 75,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.6,
      dependencies: ['typescript'],
    },
    supported_patterns: ['REST API design', 'GraphQL schemas', 'OpenAPI specs'],
    limitations: ['Business logic constraints may apply'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['api', 'design', 'rest', 'graphql'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  database_design: {
    capability_id: 'database_design',
    name: 'Database Design',
    description: 'Database schema design, query optimization, and data modeling',
    confidence_level: 0.84,
    completion_time_estimate_ms: 90000,
    success_rate: 0.88,
    successful_completions: 55,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.7,
      dependencies: ['postgresql'],
    },
    supported_patterns: ['Schema design', 'Query optimization', 'Data modeling'],
    limitations: ['Database-specific features may vary'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['database', 'schema', 'sql', 'modeling'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  devops: {
    capability_id: 'devops',
    name: 'DevOps',
    description: 'CI/CD, containerization, deployment, and infrastructure automation',
    confidence_level: 0.81,
    completion_time_estimate_ms: 120000,
    success_rate: 0.85,
    successful_completions: 45,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.8,
      dependencies: ['docker'],
    },
    supported_patterns: ['Docker containers', 'GitHub Actions', 'Deployment automation'],
    limitations: ['Infrastructure knowledge required'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['devops', 'cicd', 'docker', 'deployment'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  design_token_compliance: {
    capability_id: 'design_token_compliance',
    name: 'Design Token Compliance',
    description: 'Enforces 95%+ design token compliance in dcyfr-labs components',
    confidence_level: 0.94,
    completion_time_estimate_ms: 30000,
    success_rate: 0.96,
    successful_completions: 200,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.5,
      dependencies: ['design-tokens', 'tailwindcss'],
    },
    supported_patterns: [
      'SPACING token validation',
      'TYPOGRAPHY token enforcement',
      'SEMANTIC_COLORS compliance',
      'Hardcoded value detection',
      'Token validation scripts',
    ],
    limitations: ['dcyfr-labs specific', 'Requires design token system'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['design', 'tokens', 'compliance', 'dcyfr', 'ui'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  pagelayout_architecture: {
    capability_id: 'pagelayout_architecture',
    name: 'PageLayout Architecture',
    description: 'Enforces 90% PageLayout compliance across dcyfr-labs pages',
    confidence_level: 0.91,
    completion_time_estimate_ms: 25000,
    success_rate: 0.94,
    successful_completions: 150,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.4,
      dependencies: ['react', 'next.js'],
    },
    supported_patterns: [
      'PageLayout component usage',
      'PageHero implementation',
      'ArchiveLayout patterns',
      'ArticleLayout patterns',
      'Layout selection rules (90% PageLayout)',
    ],
    limitations: ['dcyfr-labs specific', 'Requires layout system knowledge'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['layout', 'architecture', 'pagelayout', 'dcyfr', 'react'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  production_testing: {
    capability_id: 'production_testing',
    name: 'Production Testing Excellence',
    description: 'Achieves 99%+ test pass rate for production environments',
    confidence_level: 0.93,
    completion_time_estimate_ms: 60000,
    success_rate: 0.98,
    successful_completions: 300,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.8,
      dependencies: ['vitest', 'playwright', '@testing-library/react'],
    },
    supported_patterns: [
      '99%+ test pass rate maintenance',
      'Production test strategies',
      'E2E test automation',
      'Quality gate enforcement',
      'Test coverage reporting',
    ],
    limitations: ['Requires comprehensive test infrastructure'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['testing', 'production', 'quality', 'e2e', 'coverage'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  content_creation_seo: {
    capability_id: 'content_creation_seo',
    name: 'Content Creation & SEO',
    description: 'Creates SEO-optimized blog content and marketing materials',
    confidence_level: 0.89,
    completion_time_estimate_ms: 180000,
    success_rate: 0.91,
    successful_completions: 120,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.6,
      network_mbps: 3,
    },
    supported_patterns: [
      'MDX blog post creation',
      'SEO optimization techniques',
      'Meta tag generation',
      'Schema.org structured data',
      'Content marketing strategies',
    ],
    limitations: ['Requires content guidelines', 'Subject matter expertise varies'],
    tlp_clearance: 'TLP:GREEN',
    tags: ['content', 'seo', 'blog', 'marketing', 'mdx'],
    last_updated: '2026-02-15T10:00:00Z',
  },

  nextjs_architecture: {
    capability_id: 'nextjs_architecture',
    name: 'Next.js Architecture',
    description: 'Next.js App Router, SSR, ISR, and advanced Next.js patterns',
    confidence_level: 0.88,
    completion_time_estimate_ms: 45000,
    success_rate: 0.92,
    successful_completions: 95,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.7,
      dependencies: ['next', 'react'],
    },
    supported_patterns: [
      'App Router architecture',
      'Server Components optimization',
      'ISR implementation',
      'Middleware patterns',
      'Dynamic routing strategies',
    ],
    limitations: ['Version-specific features', 'Deployment considerations'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['nextjs', 'architecture', 'ssr', 'app-router', 'react'],
    last_updated: '2026-02-15T10:00:00Z',
  },
};

const AGENT_CAPABILITY_MAPPING: Record<string, string[]> = {
  'dcyfr': ['code_review', 'design_token_compliance', 'testing', 'architecture', 'security'],
  'dcyfr-quick-fix': ['code_review', 'architecture', 'design_token_compliance'],
  'dcyfr-test-specialist': ['testing', 'architecture', 'code_review'],
  'dcyfr-security-specialist': ['security', 'architecture', 'code_review'],
  'dcyfr-performance-specialist': ['performance_optimization', 'code_review', 'architecture'],
  'dcyfr-react-performance': ['performance_optimization', 'code_review'],
  'dcyfr-content-creator': ['content_creation_seo', 'architecture'],
  'dcyfr-content-editor': ['content_creation_seo'],
  'dcyfr-seo-specialist': ['content_creation_seo', 'performance_optimization'],
  'dcyfr-content-marketer': ['content_creation_seo'],
  'dcyfr-design-specialist': ['design_token_compliance', 'code_review'],
  'dcyfr-ui-ux-designer': ['design_token_compliance', 'code_review'],
  'dcyfr-accessibility-specialist': ['design_token_compliance', 'code_review'],
  'dcyfr-nextjs-expert': ['nextjs_architecture', 'code_review', 'performance_optimization'],
  'dcyfr-mcp-expert': ['code_review', 'architecture'],
  'dcyfr-mcp-server-architect': ['architecture', 'security'],
  'dcyfr-prompt-engineer': ['security', 'code_review'],
  'DCYFR': ['design_token_compliance', 'pagelayout_architecture', 'production_testing', 'content_creation_seo', 'nextjs_architecture', 'code_review', 'architecture', 'performance_optimization', 'security'],
  'accessibility-specialist': ['design_token_compliance', 'production_testing', 'content_creation_seo', 'code_review', 'architecture'],
  'api-documenter': ['documentation', 'api_design', 'code_review'],
  'api-security-audit': ['security', 'api_design', 'code_review'],
  'architecture-modernizer': ['architecture', 'performance_optimization', 'production_testing'],
  'architecture-reviewer': ['architecture', 'code_review', 'design_token_compliance', 'pagelayout_architecture', 'production_testing', 'content_creation_seo', 'nextjs_architecture'],
  'backend-architect': ['architecture', 'api_design', 'database_design', 'performance_optimization'],
  'business-analyst': ['documentation', 'architecture'],
  'changelog-generator': ['documentation', 'code_review'],
  'cloud-architect': ['devops', 'architecture'],
  'code-reviewer': ['code_review', 'production_testing', 'architecture'],
  'command-expert': ['devops', 'production_testing', 'code_review', 'performance_optimization', 'security'],
  'content-creator': ['content_creation_seo', 'design_token_compliance', 'production_testing', 'documentation', 'performance_optimization'],
  'content-editor': ['content_creation_seo', 'production_testing', 'documentation'],
  'content-marketer': ['content_creation_seo', 'documentation'],
  'context-manager': ['documentation', 'architecture'],
  'data-analyst': ['documentation', 'code_review'],
  'data-engineer': ['database_design', 'code_review'],
  'data-scientist': ['code_review', 'testing', 'production_testing'],
  'database-admin': ['database_design', 'devops'],
  'database-architect': ['database_design', 'architecture', 'code_review', 'performance_optimization'],
  'database-optimization': ['database_design', 'performance_optimization'],
  'debugger': ['debugging', 'production_testing'],
  'dependency-manager': ['devops', 'design_token_compliance', 'production_testing', 'content_creation_seo', 'nextjs_architecture', 'performance_optimization', 'security'],
  'deployment-engineer': ['devops', 'architecture'],
  'design-specialist': ['design_token_compliance', 'pagelayout_architecture', 'content_creation_seo', 'code_review', 'architecture'],
  'devops-engineer': ['devops', 'production_testing', 'code_review', 'performance_optimization', 'security'],
  'devops-troubleshooter': ['devops', 'debugging'],
  'documentation-expert': ['documentation', 'production_testing', 'content_creation_seo', 'code_review'],
  'error-detective': ['debugging', 'code_review'],
  'frontend-developer': ['code_review', 'performance_optimization', 'nextjs_architecture'],
  'fullstack-developer': ['code_review', 'production_testing', 'nextjs_architecture', 'performance_optimization', 'architecture'],
  'git-flow-manager': ['devops', 'production_testing', 'code_review'],
  'javascript-pro': ['code_review', 'performance_optimization'],
  'mcp-expert': ['architecture', 'production_testing', 'code_review', 'performance_optimization'],
  'mcp-server-architect': ['architecture', 'production_testing', 'code_review'],
  'ml-engineer': ['code_review', 'production_testing'],
  'mobile-developer': ['code_review', 'production_testing', 'performance_optimization'],
  'network-engineer': ['devops', 'performance_optimization'],
  'nextjs-architecture-expert': ['nextjs_architecture', 'architecture', 'production_testing', 'content_creation_seo', 'code_review', 'performance_optimization'],
  'penetration-tester': ['security', 'production_testing'],
  'performance-profiler': ['performance_optimization', 'production_testing', 'code_review'],
  'performance-specialist': ['performance_optimization', 'design_token_compliance', 'production_testing', 'content_creation_seo', 'code_review'],
  'product-strategist': ['documentation', 'architecture', 'performance_optimization'],
  'prompt-engineer': ['code_review', 'architecture', 'performance_optimization'],
  'python-pro': ['code_review', 'production_testing', 'performance_optimization'],
  'quick-fix': ['code_review', 'design_token_compliance', 'pagelayout_architecture', 'content_creation_seo'],
  'react-performance-optimization': ['performance_optimization', 'code_review', 'nextjs_architecture'],
  'research-orchestrator': ['documentation', 'architecture'],
  'search-specialist': ['code_review', 'performance_optimization'],
  'security-engineer': ['security', 'code_review', 'architecture'],
  'security-specialist': ['security', 'code_review', 'architecture'],
  'seo-specialist': ['content_creation_seo', 'design_token_compliance', 'production_testing', 'code_review', 'performance_optimization', 'security'],
  'task-decomposition-expert': ['architecture', 'documentation'],
  'technical-researcher': ['documentation', 'production_testing', 'code_review'],
  'technical-writer': ['documentation', 'content_creation_seo'],
  'test-automator': ['testing', 'production_testing'],
  'test-engineer': ['testing', 'production_testing', 'code_review', 'security'],
  'test-specialist': ['testing', 'production_testing', 'code_review', 'performance_optimization'],
  'typescript-pro': ['code_review', 'performance_optimization', 'architecture'],
  'ui-ux-designer': ['design_token_compliance', 'production_testing', 'code_review'],
  'unused-code-cleaner': ['code_review', 'production_testing'],
};

const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  testing: ['test-', 'testing', 'unit-test', 'integration-test', 'e2e-test', 'test-driven'],
  debugging: ['debug', 'troubleshoot', 'diagnos', 'error', 'bug'],
  code_review: ['review', 'code quality', 'lint', 'code-review'],
  architecture: ['architect', 'design pattern', 'solid', 'structural', 'system design'],
  security: ['security', 'owasp', 'vulnerab', 'penetration', 'audit'],
  performance_optimization: ['performance', 'optimiz', 'profil', 'benchmark', 'speed'],
  documentation: ['document', 'technical writ', 'guide', 'strateg'],
  api_design: ['api', 'rest', 'graphql', 'endpoint'],
  database_design: ['database', 'schema', 'sql', 'query', 'postgresql', 'data model'],
  devops: ['devops', 'ci/cd', 'docker', 'deploy', 'infrastructure', 'kubernetes'],
  design_token_compliance: ['design token', 'token compliance', 'spacing', 'typography'],
  pagelayout_architecture: ['pagelayout', 'page layout', 'layout architecture'],
  production_testing: ['production test', 'production-grade', '99%', 'pass rate', 'quality gate'],
  content_creation_seo: ['seo', 'content creation', 'content creato', 'blog post', 'marketing', 'mdx'],
  nextjs_architecture: ['next.js', 'nextjs', 'app router', 'server component', 'ssr', 'isr'],
};

function detectCapabilities(name: string, description: string): string[] {
  const detected: string[] = [];
  const combined = (name + ' ' + description).toLowerCase();

  for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (combined.includes(keyword.toLowerCase())) {
        if (!detected.includes(capability)) {
          detected.push(capability);
        }
        break;
      }
    }
  }

  return detected;
}

function extractSpecializationsFromDescription(description: string): string[] {
  if (!description) return [];
  const specializations: string[] = [];
  const specPatterns = [
    /specializ(?:es|ing) in\s+(.+?)(?:\.|$)/i,
    /expert in\s+(.+?)(?:\.|$)/i,
    /primary:\s+(.+?)(?:\.|secondary|$)/i,
  ];

  for (const pattern of specPatterns) {
    const match = description.match(pattern);
    if (match) {
      const items = match[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map((s: string) => s.trim()).filter(Boolean);
      specializations.push(...items);
    }
  }
  return [...new Set(specializations)];
}

function extractSpecializations(agent: Agent): string[] {
  const specializations: string[] = [];
  const description = agent.description || agent.manifest.description || '';
  const fromDescription = extractSpecializationsFromDescription(description);
  specializations.push(...fromDescription);

  const name = agent.manifest.name.toLowerCase();
  if (name.includes('design')) specializations.push('UI/UX Design');
  if (name.includes('test')) specializations.push('Testing');
  if (name.includes('security')) specializations.push('Security');
  if (name.includes('performance')) specializations.push('Performance');
  if (name.includes('content')) specializations.push('Content Creation');
  if (name.includes('accessibility')) specializations.push('Accessibility');
  if (name.includes('mcp')) specializations.push('MCP Development');
  if (name.includes('prompt')) specializations.push('Prompt Engineering');
  if (name.includes('nextjs')) specializations.push('Next.js Development');
  if (name.includes('react')) specializations.push('React Development');

  const tags = agent.manifest.tags || [];
  if (tags.includes('design-tokens')) specializations.push('Design Token Compliance');
  if (tags.includes('testing')) specializations.push('Test Automation');
  if (tags.includes('patterns')) specializations.push('Architectural Patterns');
  if (tags.includes('enforcement')) specializations.push('Pattern Enforcement');

  return [...new Set(specializations)];
}

function extractPreferredTaskTypes(agent: Agent): string[] {
  const preferred: string[] = [];
  const name = agent.manifest.name.toLowerCase();
  if (name.includes('quick-fix')) preferred.push('Bug Fixes', 'Small Features');
  if (name.includes('specialist')) preferred.push('Complex Analysis', 'Deep Expertise');
  if (name.includes('core') || name === 'dcyfr') preferred.push('Full Features', 'Production Code');
  return preferred;
}

function extractAvoidedTaskTypes(agent: Agent): string[] {
  const avoided: string[] = [];
  const name = agent.manifest.name.toLowerCase();
  if (name.includes('design') && !name.includes('dcyfr-design-specialist')) {
    avoided.push('Backend Logic', 'Database Design');
  }
  if (name.includes('content') && !name.includes('specialist')) {
    avoided.push('Technical Implementation', 'Code Review');
  }
  if (name.includes('quick-fix')) {
    avoided.push('Large Features', 'Architecture Changes');
  }
  return avoided;
}

function determineMaxConcurrentTasks(agent: Agent): number {
  const name = agent.manifest.name.toLowerCase();
  if (name === 'dcyfr') return 5;
  if (name.includes('quick-fix')) return 3;
  if (name.includes('specialist')) return 2;
  return 1;
}

function calculateInitialReputationScore(agent: Agent): number {
  let score = 70;
  if (agent.manifest.tier === 'private') score += 10;
  if (agent.manifest.category === 'core') score += 15;
  if (agent.manifest.qualityGates && agent.manifest.qualityGates.length > 0) score += 5;
  return score;
}

function adjustConfidenceForAgent(baseConfidence: number, agentId: string, capabilityId: string): number {
  const primaryCapabilities: Record<string, string[]> = {
    'dcyfr-design-specialist': ['design_token_compliance'],
    'dcyfr-test-specialist': ['testing'],
    'dcyfr-security-specialist': ['security'],
    'dcyfr-performance-specialist': ['performance_optimization'],
    'dcyfr-accessibility-specialist': ['design_token_compliance'],
    'dcyfr-mcp-expert': ['architecture'],
    'dcyfr-prompt-engineer': ['security'],
    'security-engineer': ['security'],
    'test-engineer': ['testing'],
    'database-architect': ['database_design'],
    'devops-engineer': ['devops'],
    'architecture-reviewer': ['architecture'],
  };

  const primaryCaps = primaryCapabilities[agentId] || [];
  if (primaryCaps.includes(capabilityId)) {
    return Math.min(baseConfidence * 1.1, 1.0);
  }
  return baseConfidence;
}

function toExtendedCapability(cap: AgentCapability, adjustedConfidence: number): ExtendedCapability {
  return {
    ...cap,
    confidence_level: adjustedConfidence,
    capability: cap.capability_id,
    confidence: adjustedConfidence,
  };
}

export function generateCapabilityManifest(agent: Agent): AgentCapabilityManifest {
  const agentId = agent.manifest.name;

  if (!agentId) {
    throw new Error('Agent manifest must have a name');
  }

  let capabilityIds = AGENT_CAPABILITY_MAPPING[agentId];

  if (!capabilityIds || capabilityIds.length === 0) {
    const description = agent.description || agent.manifest.description || '';
    capabilityIds = detectCapabilities(agentId, description);
  }

  if (capabilityIds.length === 0) {
    capabilityIds = ['code_review'];
  }

  capabilityIds = capabilityIds.filter((id: string) => CAPABILITY_DATABASE[id]);

  const capabilities = capabilityIds.map((id: string) => {
    const baseCapability = CAPABILITY_DATABASE[id]!;
    const adjustedConfidence = adjustConfidenceForAgent(baseCapability.confidence_level, agentId, id);
    return toExtendedCapability(baseCapability, adjustedConfidence);
  });

  const overallConfidence = capabilities.length > 0
    ? capabilities.reduce((sum: number, cap: ExtendedCapability) => sum + cap.confidence_level, 0) / capabilities.length
    : 0;

  const avgCompletionTime = capabilities.length > 0
    ? capabilities.reduce((sum: number, cap: ExtendedCapability) => sum + cap.completion_time_estimate_ms, 0) / capabilities.length
    : 0;

  const totalCompletions = capabilities.reduce(
    (sum: number, cap: ExtendedCapability) => sum + (cap.successful_completions || 0),
    0
  );

  const specializations = extractSpecializations(agent);
  const preferredTaskTypes = extractPreferredTaskTypes(agent);
  const avoidedTaskTypes = extractAvoidedTaskTypes(agent);

  const now = new Date().toISOString();

  const manifest: AgentCapabilityManifest & { last_updated?: string } = {
    agent_id: agentId,
    agent_name: agent.manifest.name,
    version: agent.manifest.version || '1.0.0',
    capabilities: capabilities as AgentCapability[],
    overall_confidence: Math.round(overallConfidence * 100) / 100,
    availability: 'available',
    current_workload: 0,
    max_concurrent_tasks: determineMaxConcurrentTasks(agent),
    specializations,
    preferred_task_types: preferredTaskTypes,
    avoided_task_types: avoidedTaskTypes,
    reputation_score: calculateInitialReputationScore(agent),
    total_completions: totalCompletions,
    avg_completion_time_ms: Math.round(avgCompletionTime),
    metadata: {
      agent_category: agent.manifest.category,
      agent_tier: agent.manifest.tier,
      agent_model: agent.manifest.model,
      agent_tools: agent.manifest.tools,
      agent_tags: agent.manifest.tags,
      quality_gates: agent.manifest.qualityGates,
      proactive_triggers: agent.manifest.proactiveTriggers,
    },
    created_at: now,
    updated_at: now,
    last_updated: now,
  };

  return manifest as AgentCapabilityManifest;
}

export async function generateDcyfrCapabilityManifests(): Promise<AgentCapabilityManifest[]> {
  const dcyfrAgentsEntry = '../../../../dcyfr-workspace-agents/packages/agents/dcyfr-agents/index.js';
  const { loadDcyfrAgents } = await import(dcyfrAgentsEntry);
  const agents = await loadDcyfrAgents();
  return agents.map((agent: Agent) => generateCapabilityManifest(agent));
}

export function validateCapabilityManifest(manifest: AgentCapabilityManifest): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.agent_id) errors.push('Missing agent_id');
  if (!manifest.agent_name) errors.push('Missing agent_name');
  if (!manifest.version) errors.push('Missing version');
  if (!manifest.capabilities || manifest.capabilities.length === 0) {
    errors.push('Missing or empty capabilities array');
  }

  if (manifest.capabilities) {
    manifest.capabilities.forEach((capability: AgentCapability, index: number) => {
      if (!capability.capability_id) errors.push('Capability ' + index + ': missing capability_id');
      if (!capability.name) errors.push('Capability ' + index + ': missing name');
      if (!capability.description) errors.push('Capability ' + index + ': missing description');
      if (capability.confidence_level < 0 || capability.confidence_level > 1) {
        errors.push('Capability ' + index + ': confidence_level must be 0-1');
      }
    });
  }

  if (!manifest.overall_confidence) warnings.push('Missing overall_confidence');
  if (!manifest.specializations || manifest.specializations.length === 0) {
    warnings.push('Missing specializations');
  }
  if (!manifest.total_completions) warnings.push('Missing total_completions');

  return { isValid: errors.length === 0, errors, warnings };
}

export class CapabilityManifestGenerator {
  getAvailableCapabilities(): string[] {
    return Object.keys(CAPABILITY_DATABASE);
  }

  getCapabilityDescription(capability: string): string | undefined {
    const cap = CAPABILITY_DATABASE[capability];
    return cap ? cap.description : undefined;
  }

  generateCapabilityManifest(agent: Agent): AgentCapabilityManifest {
    return generateCapabilityManifest(agent);
  }

  generateManifests(agents: Agent[]): AgentCapabilityManifest[] {
    return agents.map((agent: Agent) => this.generateCapabilityManifest(agent));
  }

  validateCapabilityManifest(manifest: AgentCapabilityManifest) {
    return validateCapabilityManifest(manifest);
  }
}

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
  ResourceRequirements,
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
}

/**
 * Capability mapping for common agent functions
 */
const CAPABILITY_DATABASE: Record<string, AgentCapability> = {
  // Core Development Capabilities
  code_generation: {
    capability_id: 'code_generation',
    name: 'Code Generation',
    description: 'Generate TypeScript, React, and Next.js code following DCYFR patterns',
    confidence_level: 0.9,
    completion_time_estimate_ms: 30000, // 30 seconds
    success_rate: 0.95,
    successful_completions: 100,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.5,
      network_mbps: 1,
      dependencies: ['typescript', '@types/react', '@types/node'],
    },
    supported_patterns: [
      'React components',
      'Next.js API routes',
      'TypeScript interfaces',
      'Design token usage',
      'Barrel exports',
    ],
    limitations: ['No native code generation', 'Requires existing project structure'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['development', 'typescript', 'react', 'nextjs'],
    last_updated: new Date().toISOString(),
  },

  design_token_enforcement: {
    capability_id: 'design_token_enforcement',
    name: 'Design Token Enforcement',
    description: 'Enforce DCYFR design token compliance and detect hardcoded styles',
    confidence_level: 0.95,
    completion_time_estimate_ms: 15000, // 15 seconds
    success_rate: 0.98,
    successful_completions: 200,
    resource_requirements: {
      memory_mb: 128,
      cpu_cores: 0.3,
      dependencies: ['@dcyfr/design-tokens'],
    },
    supported_patterns: [
      'Design token compliance checking',
      'Hardcoded value detection',
      'SPACING token usage',
      'TYPOGRAPHY token usage',
      'SEMANTIC_COLORS token usage',
    ],
    limitations: ['DCYFR-specific patterns only'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['design', 'tokens', 'compliance', 'enforcement'],
    last_updated: new Date().toISOString(),
  },

  test_generation: {
    capability_id: 'test_generation',
    name: 'Test Generation',
    description: 'Generate comprehensive test suites with 99%+ pass rate targeting',
    confidence_level: 0.88,
    completion_time_estimate_ms: 45000, // 45 seconds
    success_rate: 0.92,
    successful_completions: 75,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.7,
      dependencies: ['vitest', '@testing-library/react', '@testing-library/user-event'],
    },
    supported_patterns: [
      'Unit tests',
      'Integration tests',
      'Component testing',
      'API route testing',
      'E2E scenarios',
    ],
    limitations: ['Requires test framework setup'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['testing', 'quality', 'vitest', 'validation'],
    last_updated: new Date().toISOString(),
  },

  pattern_enforcement: {
    capability_id: 'pattern_enforcement',
    name: 'Architectural Pattern Enforcement',
    description: 'Enforce DCYFR architectural patterns and code organization',
    confidence_level: 0.92,
    completion_time_estimate_ms: 20000, // 20 seconds
    success_rate: 0.94,
    successful_completions: 150,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.4,
      dependencies: ['eslint', 'typescript'],
    },
    supported_patterns: [
      'Barrel export patterns',
      'PageLayout architecture',
      'API route patterns (Validate→Queue→Respond)',
      'Server/Client component separation',
    ],
    limitations: ['DCYFR-specific patterns', 'Requires project context'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['patterns', 'architecture', 'enforcement'],
    last_updated: new Date().toISOString(),
  },

  security_scanning: {
    capability_id: 'security_scanning',
    name: 'Security Scanning',
    description: 'Security vulnerability detection and OWASP compliance validation',
    confidence_level: 0.85,
    completion_time_estimate_ms: 60000, // 60 seconds
    success_rate: 0.91,
    successful_completions: 50,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.8,
      dependencies: ['eslint-plugin-security', '@types/node'],
    },
    supported_patterns: [
      'OWASP vulnerability detection',
      'Hardcoded secret detection',
      'Input validation checks',
      'XSS prevention',
      'CSRF protection',
    ],
    limitations: ['Cannot detect all zero-day vulnerabilities'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['security', 'owasp', 'vulnerability', 'compliance'],
    last_updated: new Date().toISOString(),
  },

  content_creation: {
    capability_id: 'content_creation',
    name: 'Content Creation',
    description: 'Generate MDX blog posts, documentation, and marketing content',
    confidence_level: 0.87,
    completion_time_estimate_ms: 120000, // 2 minutes
    success_rate: 0.89,
    successful_completions: 80,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.5,
      network_mbps: 2, // For research
    },
    supported_patterns: [
      'MDX blog posts',
      'Technical documentation',
      'SEO optimization',
      'Marketing copy',
      'Social media content',
    ],
    limitations: ['Requires content guidelines', 'May need fact-checking'],
    tlp_clearance: 'TLP:GREEN',
    tags: ['content', 'mdx', 'seo', 'marketing', 'documentation'],
    last_updated: new Date().toISOString(),
  },

  performance_optimization: {
    capability_id: 'performance_optimization',
    name: 'Performance Optimization',
    description: 'React and Next.js performance optimization and analysis',
    confidence_level: 0.83,
    completion_time_estimate_ms: 90000, // 90 seconds
    success_rate: 0.87,
    successful_completions: 45,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.6,
      dependencies: ['@next/bundle-analyzer', 'lighthouse'],
    },
    supported_patterns: [
      'Bundle size optimization',
      'React component optimization',
      'Image optimization',
      'Core Web Vitals improvement',
      'Lazy loading implementation',
    ],
    limitations: ['Requires profiling tools', 'May need real traffic data'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['performance', 'optimization', 'react', 'nextjs', 'lighthouse'],
    last_updated: new Date().toISOString(),
  },

  accessibility_audit: {
    capability_id: 'accessibility_audit',
    name: 'Accessibility Audit',
    description: 'WCAG compliance validation and accessibility improvement',
    confidence_level: 0.81,
    completion_time_estimate_ms: 75000, // 75 seconds
    success_rate: 0.85,
    successful_completions: 35,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.4,
      dependencies: ['axe-core', '@testing-library/jest-dom'],
    },
    supported_patterns: [
      'WCAG 2.1 AA compliance',
      'Screen reader compatibility',
      'Keyboard navigation',
      'Color contrast validation',
      'Semantic HTML structure',
    ],
    limitations: ['Automated testing only', 'Manual validation may be needed'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['accessibility', 'wcag', 'a11y', 'compliance'],
    last_updated: new Date().toISOString(),
  },

  mcp_server_development: {
    capability_id: 'mcp_server_development',
    name: 'MCP Server Development',
    description: 'Model Context Protocol server design and implementation',
    confidence_level: 0.86,
    completion_time_estimate_ms: 180000, // 3 minutes
    success_rate: 0.88,
    successful_completions: 25,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.8,
      dependencies: ['@modelcontextprotocol/sdk', 'typescript'],
    },
    supported_patterns: [
      'MCP server architecture',
      'Tool registration',
      'Resource management',
      'Error handling',
      'Authentication flows',
    ],
    limitations: ['Requires MCP SDK knowledge', 'Complex debugging'],
    tlp_clearance: 'TLP:GREEN',
    tags: ['mcp', 'server', 'protocol', 'development'],
    last_updated: new Date().toISOString(),
  },

  prompt_engineering: {
    capability_id: 'prompt_engineering',
    name: 'Prompt Engineering',
    description: 'AI prompt design and optimization for agent systems',
    confidence_level: 0.84,
    completion_time_estimate_ms: 60000, // 60 seconds
    success_rate: 0.86,
    successful_completions: 60,
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.3,
      network_mbps: 1, // For API testing
    },
    supported_patterns: [
      'System prompt design',
      'Chain-of-thought prompting',
      'Few-shot examples',
      'Prompt security',
      'Response formatting',
    ],
    limitations: ['Model-specific optimizations', 'Requires testing iterations'],
    tlp_clearance: 'TLP:AMBER',
    tags: ['prompts', 'ai', 'engineering', 'optimization'],
    last_updated: new Date().toISOString(),
  },

  // PRODUCTION-SPECIFIC CAPABILITIES (dcyfr-labs agents)

  design_token_compliance: {
    capability_id: 'design_token_compliance',
    name: 'Design Token Compliance',
    description: 'Enforces 95%+ design token compliance in dcyfr-labs components',
    confidence_level: 0.94,
    completion_time_estimate_ms: 30000, // 30 seconds
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
    last_updated: new Date().toISOString(),
  },

  pagelayout_architecture: {
    capability_id: 'pagelayout_architecture',
    name: 'PageLayout Architecture',
    description: 'Enforces 90% PageLayout compliance across dcyfr-labs pages',
    confidence_level: 0.91,
    completion_time_estimate_ms: 25000, // 25 seconds
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
    last_updated: new Date().toISOString(),
  },

  production_testing: {
    capability_id: 'production_testing',
    name: 'Production Testing Excellence',
    description: 'Achieves 99%+ test pass rate for production environments',
    confidence_level: 0.93,
    completion_time_estimate_ms: 60000, // 60 seconds
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
    last_updated: new Date().toISOString(),
  },

  content_creation_seo: {
    capability_id: 'content_creation_seo',
    name: 'Content Creation & SEO',
    description: 'Creates SEO-optimized blog content and marketing materials',
    confidence_level: 0.89,
    completion_time_estimate_ms: 180000, // 3 minutes
    success_rate: 0.91,
    successful_completions: 120, 
    resource_requirements: {
      memory_mb: 256,
      cpu_cores: 0.6,
      network_mbps: 3, // For research and image processing
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
    last_updated: new Date().toISOString(),
  },

  nextjs_architecture: {
    capability_id: 'nextjs_architecture',
    name: 'Next.js Architecture Expertise',
    description: 'Next.js App Router, Server Components, and performance patterns',
    confidence_level: 0.92,
    completion_time_estimate_ms: 45000, // 45 seconds
    success_rate: 0.95,
    successful_completions: 180,
    resource_requirements: {
      memory_mb: 512,
      cpu_cores: 0.7,
      dependencies: ['next', 'react', 'typescript'],
    },
    supported_patterns: [
      'App Router architecture',
      'Server Components patterns',
      'API Validate→Queue→Respond',
      'ISR and SSG strategies',
      'Performance optimization',
    ],
    limitations: ['Next.js specific', 'Requires framework knowledge'],
    tlp_clearance: 'TLP:CLEAR',
    tags: ['nextjs', 'architecture', 'app-router', 'server-components', 'performance'],
    last_updated: new Date().toISOString(),
  },
};

/**
 * Agent name to capabilities mapping
 */
const AGENT_CAPABILITY_MAPPING: Record<string, string[]> = {
  'dcyfr': [
    'code_generation',
    'design_token_enforcement', 
    'test_generation',
    'pattern_enforcement',
    'security_scanning',
  ],
  'dcyfr-quick-fix': [
    'code_generation',
    'pattern_enforcement',
    'design_token_enforcement',
  ],
  'dcyfr-test-specialist': [
    'test_generation',
    'pattern_enforcement',
    'code_generation',
  ],
  'dcyfr-security-specialist': [
    'security_scanning',
    'pattern_enforcement',
    'code_generation',
  ],
  'dcyfr-performance-specialist': [
    'performance_optimization',
    'code_generation',
    'pattern_enforcement',
  ],
  'dcyfr-react-performance': [
    'performance_optimization',
    'code_generation',
  ],
  'dcyfr-content-creator': [
    'content_creation',
    'pattern_enforcement',
  ],
  'dcyfr-content-editor': [
    'content_creation',
  ],
  'dcyfr-seo-specialist': [
    'content_creation',
    'performance_optimization',
  ],
  'dcyfr-content-marketer': [
    'content_creation',
  ],
  'dcyfr-design-specialist': [
    'design_token_enforcement',
    'accessibility_audit',
    'code_generation',
  ],
  'dcyfr-ui-ux-designer': [
    'design_token_enforcement',
    'accessibility_audit',
    'code_generation',
  ],
  'dcyfr-accessibility-specialist': [
    'accessibility_audit',
    'design_token_enforcement',
    'code_generation',
  ],
  'dcyfr-nextjs-expert': [
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'dcyfr-mcp-expert': [
    'mcp_server_development',
    'code_generation',
    'pattern_enforcement',
  ],
  'dcyfr-mcp-server-architect': [
    'mcp_server_development',
    'pattern_enforcement',
    'security_scanning',
  ],
  'dcyfr-prompt-engineer': [
    'prompt_engineering',
    'security_scanning',
  ],
  'DCYFR': [
    'design_token_compliance',
    'pagelayout_architecture',
    'production_testing',
    'content_creation_seo',
    'nextjs_architecture',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
    'security_scanning',
    'accessibility_audit',
  ],
  'accessibility-specialist': [
    'design_token_compliance',
    'production_testing',
    'content_creation_seo',
    'code_generation',
    'pattern_enforcement',
    'accessibility_audit',
  ],
  'api-documenter': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
  ],
  'api-security-audit': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
    'security_scanning',
  ],
  'architecture-modernizer': [
    'production_testing',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'architecture-reviewer': [
    'design_token_compliance',
    'pagelayout_architecture',
    'production_testing',
    'content_creation_seo',
    'nextjs_architecture',
    'code_generation',
    'pattern_enforcement',
  ],
  'backend-architect': [
    'pattern_enforcement',
    'performance_optimization',
  ],
  'business-analyst': [
    'code_generation',
    'pattern_enforcement',
  ],
  'changelog-generator': [
    'code_generation',
    'pattern_enforcement',
  ],
  'cloud-architect': [
    'code_generation',
    'pattern_enforcement',
  ],
  'code-reviewer': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
  ],
  'command-expert': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
    'security_scanning',
  ],
  'content-creator': [
    'design_token_compliance',
    'production_testing',
    'content_creation_seo',
    'code_generation',
    'performance_optimization',
    'pattern_enforcement',
  ],
  'content-editor': [
    'production_testing',
    'content_creation_seo',
    'code_generation',
    'pattern_enforcement',
  ],
  'content-marketer': [
    'content_creation_seo',
    'pattern_enforcement',
  ],
  'context-manager': [
    'pattern_enforcement',
  ],
  'data-analyst': [
    'code_generation',
    'pattern_enforcement',
  ],
  'data-engineer': [
    'code_generation',
    'pattern_enforcement',
  ],
  'data-scientist': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
  ],
  'database-admin': [
    'code_generation',
    'pattern_enforcement',
  ],
  'database-architect': [
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'database-optimization': [
    'pattern_enforcement',
    'performance_optimization',
  ],
  'debugger': [
    'production_testing',
    'pattern_enforcement',
  ],
  'dependency-manager': [
    'design_token_compliance',
    'production_testing',
    'content_creation_seo',
    'nextjs_architecture',
    'code_generation',
    'performance_optimization',
    'security_scanning',
    'pattern_enforcement',
  ],
  'deployment-engineer': [
    'code_generation',
    'pattern_enforcement',
  ],
  'design-specialist': [
    'design_token_compliance',
    'pagelayout_architecture',
    'content_creation_seo',
    'code_generation',
    'pattern_enforcement',
  ],
  'devops-engineer': [
    'production_testing',
    'code_generation',
    'performance_optimization',
    'security_scanning',
    'pattern_enforcement',
  ],
  'devops-troubleshooter': [
    'code_generation',
    'pattern_enforcement',
  ],
  'documentation-expert': [
    'production_testing',
    'content_creation_seo',
    'code_generation',
    'pattern_enforcement',
  ],
  'error-detective': [
    'code_generation',
    'pattern_enforcement',
  ],
  'frontend-developer': [
    'code_generation',
    'performance_optimization',
    'accessibility_audit',
    'pattern_enforcement',
  ],
  'fullstack-developer': [
    'production_testing',
    'nextjs_architecture',
    'code_generation',
    'performance_optimization',
    'pattern_enforcement',
  ],
  'git-flow-manager': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
  ],
  'javascript-pro': [
    'performance_optimization',
    'pattern_enforcement',
  ],
  'mcp-expert': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'mcp-server-architect': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
  ],
  'ml-engineer': [
    'production_testing',
    'pattern_enforcement',
  ],
  'mobile-developer': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'network-engineer': [
    'performance_optimization',
    'pattern_enforcement',
  ],
  'nextjs-architecture-expert': [
    'production_testing',
    'content_creation_seo',
    'nextjs_architecture',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'penetration-tester': [
    'production_testing',
    'security_scanning',
    'pattern_enforcement',
  ],
  'performance-profiler': [
    'production_testing',
    'code_generation',
    'performance_optimization',
    'pattern_enforcement',
  ],
  'performance-specialist': [
    'design_token_compliance',
    'production_testing',
    'content_creation_seo',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'product-strategist': [
    'code_generation',
    'performance_optimization',
    'pattern_enforcement',
  ],
  'prompt-engineer': [
    'code_generation',
    'performance_optimization',
    'pattern_enforcement',
  ],
  'python-pro': [
    'production_testing',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'quick-fix': [
    'design_token_compliance',
    'pagelayout_architecture',
    'content_creation_seo',
    'code_generation',
    'pattern_enforcement',
  ],
  'react-performance-optimization': [
    'code_generation',
    'performance_optimization',
    'pattern_enforcement',
  ],
  'research-orchestrator': [
    'code_generation',
    'pattern_enforcement',
  ],
  'search-specialist': [
    'code_generation',
    'pattern_enforcement',
  ],
  'security-engineer': [
    'code_generation',
    'pattern_enforcement',
    'security_scanning',
  ],
  'security-specialist': [
    'code_generation',
    'pattern_enforcement',
    'security_scanning',
  ],
  'seo-specialist': [
    'design_token_compliance',
    'production_testing',
    'content_creation_seo',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
    'security_scanning',
  ],
  'task-decomposition-expert': [
    'code_generation',
    'pattern_enforcement',
  ],
  'technical-researcher': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
  ],
  'technical-writer': [
    'content_creation_seo',
    'pattern_enforcement',
  ],
  'test-automator': [
    'production_testing',
    'pattern_enforcement',
  ],
  'test-engineer': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
    'security_scanning',
  ],
  'test-specialist': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
    'performance_optimization',
  ],
  'typescript-pro': [
    'performance_optimization',
    'pattern_enforcement',
  ],
  'ui-ux-designer': [
    'design_token_compliance',
    'production_testing',
    'code_generation',
    'pattern_enforcement',
    'accessibility_audit',
  ],
  'unused-code-cleaner': [
    'production_testing',
    'code_generation',
    'pattern_enforcement',
  ]
};


/**
 * Generate capability manifest for a DCYFR agent
 */
export function generateCapabilityManifest(agent: Agent): AgentCapabilityManifest {
  const agentId = agent.manifest.name;
  const capabilityIds = AGENT_CAPABILITY_MAPPING[agentId] || [];
  
  // Get capabilities from database
  const capabilities: AgentCapability[] = capabilityIds.map(id => {
    const baseCapability = CAPABILITY_DATABASE[id];
    if (!baseCapability) {
      throw new Error(`Unknown capability: ${id}`);
    }
    
    return {
      ...baseCapability,
      // Adjust confidence based on agent specialization
      confidence_level: adjustConfidenceForAgent(baseCapability.confidence_level, agentId, id),
    };
  });

  // Calculate agent-specific metrics
  const overallConfidence = capabilities.length > 0
    ? capabilities.reduce((sum, cap) => sum + cap.confidence_level, 0) / capabilities.length
    : 0;

  const avgCompletionTime = capabilities.length > 0
    ? capabilities.reduce((sum, cap) => sum + cap.completion_time_estimate_ms, 0) / capabilities.length
    : 0;

  const totalCompletions = capabilities.reduce(
    (sum, cap) => sum + (cap.successful_completions || 0),
    0
  );

  // Determine specializations from agent manifest
  const specializations = extractSpecializations(agent);
  const preferredTaskTypes = extractPreferredTaskTypes(agent);
  const avoidedTaskTypes = extractAvoidedTaskTypes(agent);

  const manifest: AgentCapabilityManifest = {
    agent_id: agentId,
    agent_name: agent.manifest.name,
    version: agent.manifest.version || '1.0.0',
    capabilities,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return manifest;
}

/**
 * Generate capability manifests for all DCYFR agents
 */
export async function generateDcyfrCapabilityManifests(): Promise<AgentCapabilityManifest[]> {
  // Import all DCYFR agents via a runtime-computed path.
  // Keeping this as a computed string avoids TypeScript resolving the external
  // workspace package during compilation (which can pull in out-of-root sources).
  const dcyfrAgentsEntry = '../../../../dcyfr-workspace-agents/packages/agents/dcyfr-agents/index.js';
  const { loadDcyfrAgents } = await import(dcyfrAgentsEntry);
  const agents = await loadDcyfrAgents();
  
  return agents.map((agent: Agent) => generateCapabilityManifest(agent));
}

// Helper functions

function adjustConfidenceForAgent(baseConfidence: number, agentId: string, capabilityId: string): number {
  // Boost confidence for primary capabilities
  const primaryCapabilities: Record<string, string[]> = {
    'dcyfr-design-specialist': ['design_token_enforcement'],
    'dcyfr-test-specialist': ['test_generation'],
    'dcyfr-security-specialist': ['security_scanning'],
    'dcyfr-performance-specialist': ['performance_optimization'],
    'dcyfr-accessibility-specialist': ['accessibility_audit'],
    'dcyfr-mcp-expert': ['mcp_server_development'],
    'dcyfr-prompt-engineer': ['prompt_engineering'],
  };

  const primaryCaps = primaryCapabilities[agentId] || [];
  if (primaryCaps.includes(capabilityId)) {
    return Math.min(baseConfidence * 1.1, 1.0); // 10% boost, capped at 1.0
  }

  return baseConfidence;
}

function extractSpecializations(agent: Agent): string[] {
  const specializations: string[] = [];
  
  // Extract from agent name
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

  // Extract from tags
  const tags = agent.manifest.tags || [];
  if (tags.includes('design-tokens')) specializations.push('Design Token Compliance');
  if (tags.includes('testing')) specializations.push('Test Automation');
  if (tags.includes('patterns')) specializations.push('Architectural Patterns');
  if (tags.includes('enforcement')) specializations.push('Pattern Enforcement');

  return [...new Set(specializations)]; // Remove duplicates
}

function extractPreferredTaskTypes(agent: Agent): string[] {
  const preferred: string[] = [];
  
  // Based on agent capabilities and specializations
  const name = agent.manifest.name.toLowerCase();
  if (name.includes('quick-fix')) preferred.push('Bug Fixes', 'Small Features');
  if (name.includes('specialist')) preferred.push('Complex Analysis', 'Deep Expertise');
  if (name.includes('core') || name === 'dcyfr') preferred.push('Full Features', 'Production Code');

  return preferred;
}

function extractAvoidedTaskTypes(agent: Agent): string[] {
  const avoided: string[] = [];
  
  // Specialists typically avoid tasks outside their domain
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
  
  // Core agents can handle more concurrent tasks
  if (name === 'dcyfr') return 5;
  if (name.includes('quick-fix')) return 3;
  if (name.includes('specialist')) return 2;
  
  return 1; // Default for most agents
}

function calculateInitialReputationScore(agent: Agent): number {
  // Base reputation score based on agent tier and category
  let score = 70; // Base score
  
  if (agent.manifest.tier === 'private') score += 10;
  if (agent.manifest.category === 'core') score += 15;
  if (agent.manifest.qualityGates && agent.manifest.qualityGates.length > 0) score += 5;
  
  return score;
}

/**
 * Validate capability manifest completeness
 */
export function validateCapabilityManifest(manifest: AgentCapabilityManifest): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!manifest.agent_id) errors.push('Missing agent_id');
  if (!manifest.agent_name) errors.push('Missing agent_name');
  if (!manifest.version) errors.push('Missing version');
  if (!manifest.capabilities || manifest.capabilities.length === 0) {
    errors.push('Missing or empty capabilities array');
  }

  // Validate capabilities
  if (manifest.capabilities) {
    manifest.capabilities.forEach((capability, index) => {
      if (!capability.capability_id) errors.push(`Capability ${index}: missing capability_id`);
      if (!capability.name) errors.push(`Capability ${index}: missing name`);
      if (!capability.description) errors.push(`Capability ${index}: missing description`);
      if (capability.confidence_level < 0 || capability.confidence_level > 1) {
        errors.push(`Capability ${index}: confidence_level must be 0-1`);
      }
    });
  }

  // Warnings for missing optional but recommended fields
  if (!manifest.overall_confidence) warnings.push('Missing overall_confidence');
  if (!manifest.specializations || manifest.specializations.length === 0) {
    warnings.push('Missing specializations');
  }
  if (!manifest.total_completions) warnings.push('Missing total_completions');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * CapabilityManifestGenerator class wrapper for the functions
 * Provides object-oriented API for easier testing and usage
 */
export class CapabilityManifestGenerator {
  /**
   * Get list of available capability types
   */
  getAvailableCapabilities(): string[] {
    return Object.keys(CAPABILITY_DATABASE);
  }

  /**
   * Get description for a specific capability
   */
  getCapabilityDescription(capability: string): string | undefined {
    const cap = CAPABILITY_DATABASE[capability];
    return cap ? cap.description : undefined;
  }

  /**
   * Generate capability manifest for a DCYFR agent
   */
  generateCapabilityManifest(agent: Agent): AgentCapabilityManifest {
    return generateCapabilityManifest(agent);
  }

  /**
   * Generate capability manifests for multiple agents
   */
  generateManifests(agents: Agent[]): AgentCapabilityManifest[] {
    return agents.map(agent => this.generateCapabilityManifest(agent));
  }

  /**
   * Validate capability manifest completeness
   */
  validateCapabilityManifest(manifest: AgentCapabilityManifest) {
    return validateCapabilityManifest(manifest);
  }
}
/**
 * DCYFR Capability Bootstrap Utilities
 * TLP:AMBER - Internal Use Only
 * 
 * Tools to generate initial capability manifests from agent definitions.
 * Supports confidence score initialization and gradual validation.
 * 
 * @module capability-bootstrap
 * @version 1.0.0
 * @date 2026-02-15
 */

import type {
  AgentCapability,
  AgentCapabilityManifest,
  CapabilityCategory,
  ProficiencyLevel,
  ResourceRequirement,
  ConfidenceCalibration,
} from '../types/agent-capabilities.js';

/**
 * Agent definition from .agent.md file frontmatter
 */
export interface AgentDefinition {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  category?: string;
  tier?: string;
  version?: string;
  delegatesTo?: string[];
  qualityGates?: Array<{
    name: string;
    threshold: number;
    metric: string;
    failureMode: string;
  }>;
}

/**
 * Inferred capability from agent definition
 */
interface InferredCapability {
  capability_name: string;
  description: string;
  category: CapabilityCategory;
  proficiency_level: ProficiencyLevel;
  confidence_level: number;
  tags: string[];
}

/**
 * Bootstrap a capability manifest from an agent definition
 */
export function bootstrapCapabilityManifest(
  agentDef: AgentDefinition
): AgentCapabilityManifest {
  const agentId = agentDef.name.toLowerCase().replace(/\s+/g, '-');
  const inferredCapabilities = inferCapabilitiesFromDefinition(agentDef);
  
  const capabilities: AgentCapability[] = inferredCapabilities.map((inferred, index) => ({
    capability_id: `${agentId}_${inferred.capability_name.toLowerCase().replace(/\s+/g, '_')}`,
    capability_name: inferred.capability_name,
    description: inferred.description,
    category: inferred.category,
    proficiency_level: inferred.proficiency_level,
    confidence_level: inferred.confidence_level,
    estimated_completion_time_ms: estimateCompletionTime(inferred.category, inferred.proficiency_level),
    resource_requirements: inferResourceRequirements(agentDef, inferred.category),
    tags: inferred.tags,
    version: agentDef.version || '1.0.0',
    registered_at: new Date().toISOString(),
    calibration: initializeCalibration(),
  }));

  const manifest: AgentCapabilityManifest = {
    agent_id: agentId,
    agent_name: agentDef.name,
    agent_version: agentDef.version || '1.0.0',
    manifest_version: '1.0.0',
    capabilities,
    overall_confidence: calculateAverageConfidence(capabilities),
    specializations: inferSpecializations(capabilities),
    availability: 'available',
    tlp_clearance: inferTLPClearance(agentDef),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      tier: agentDef.tier,
      model: agentDef.model,
      delegatesTo: agentDef.delegatesTo,
      qualityGates: agentDef.qualityGates,
    },
  };

  return manifest;
}

/**
 * Infer capabilities from agent definition
 */
function inferCapabilitiesFromDefinition(agentDef: AgentDefinition): InferredCapability[] {
  const capabilities: InferredCapability[] = [];
  
  // Map agent category to capabilities
  const categoryMappings: Record<string, InferredCapability[]> = {
    'architecture': [
      {
        capability_name: 'System Design',
        description: 'Design and review system architecture and component interactions',
        category: 'architecture',
        proficiency_level: 'expert',
        confidence_level: 0.85,
        tags: ['design', 'patterns', 'architecture'],
      },
      {
        capability_name: 'Code Review',
        description: 'Review code for architectural patterns and best practices',
        category: 'code_review',
        proficiency_level: 'expert',
        confidence_level: 0.90,
        tags: ['review', 'patterns', 'quality'],
      },
    ],
    'testing': [
      {
        capability_name: 'Test Design',
        description: 'Design comprehensive test strategies and test cases',
        category: 'testing',
        proficiency_level: 'expert',
        confidence_level: 0.88,
        tags: ['testing', 'quality', 'validation'],
      },
      {
        capability_name: 'Test Implementation',
        description: 'Implement unit, integration, and E2E tests',
        category: 'testing',
        proficiency_level: 'advanced',
        confidence_level: 0.85,
        tags: ['testing', 'implementation'],
      },
    ],
    'security': [
      {
        capability_name: 'Security Analysis',
        description: 'Analyze code and systems for security vulnerabilities',
        category: 'security',
        proficiency_level: 'expert',
        confidence_level: 0.87,
        tags: ['security', 'analysis', 'vulnerabilities'],
      },
      {
        capability_name: 'Security Hardening',
        description: 'Implement security best practices and hardening measures',
        category: 'security',
        proficiency_level: 'advanced',
        confidence_level: 0.83,
        tags: ['security', 'hardening'],
      },
    ],
    'development': [
      {
        capability_name: 'Code Generation',
        description: 'Generate production-quality code following best practices',
        category: 'code_generation',
        proficiency_level: 'advanced',
        confidence_level: 0.80,
        tags: ['coding', 'implementation'],
      },
      {
        capability_name: 'Debugging',
        description: 'Identify and fix bugs in code',
        category: 'debugging',
        proficiency_level: 'advanced',
        confidence_level: 0.82,
        tags: ['debugging', 'troubleshooting'],
      },
      {
        capability_name: 'Refactoring',
        description: 'Refactor code for better quality and maintainability',
        category: 'refactoring',
        proficiency_level: 'advanced',
        confidence_level: 0.78,
        tags: ['refactoring', 'quality'],
      },
    ],
    'devops': [
      {
        capability_name: 'CI/CD Pipeline',
        description: 'Design and maintain CI/CD pipelines',
        category: 'deployment',
        proficiency_level: 'expert',
        confidence_level: 0.85,
        tags: ['cicd', 'automation', 'deployment'],
      },
      {
        capability_name: 'Infrastructure',
        description: 'Manage infrastructure and deployment configurations',
        category: 'deployment',
        proficiency_level: 'advanced',
        confidence_level: 0.80,
        tags: ['infrastructure', 'devops'],
      },
    ],
    'documentation': [
      {
        capability_name: 'Technical Documentation',
        description: 'Create comprehensive technical documentation',
        category: 'documentation',
        proficiency_level: 'expert',
        confidence_level: 0.88,
        tags: ['documentation', 'writing'],
      },
    ],
    'performance': [
      {
        capability_name: 'Performance Analysis',
        description: 'Analyze and optimize system performance',
        category: 'performance',
        proficiency_level: 'expert',
        confidence_level: 0.86,
        tags: ['performance', 'optimization'],
      },
    ],
  };

  // Get capabilities based on agent category
  const category = agentDef.category?.toLowerCase() || 'general';
  if (categoryMappings[category]) {
    capabilities.push(...categoryMappings[category]);
  } else {
    // Default general capability
    capabilities.push({
      capability_name: 'General Development',
      description: agentDef.description,
      category: 'general',
      proficiency_level: 'intermediate',
      confidence_level: 0.70,
      tags: [category],
    });
  }

  // Add tool-based capabilities
  if (agentDef.tools) {
    if (agentDef.tools.includes('read') || agentDef.tools.includes('search')) {
      capabilities.push({
        capability_name: 'Code Analysis',
        description: 'Analyze and understand existing codebases',
        category: 'code_review',
        proficiency_level: 'advanced',
        confidence_level: 0.80,
        tags: ['analysis', 'research'],
      });
    }
    
    if (agentDef.tools.includes('edit')) {
      capabilities.push({
        capability_name: 'Code Modification',
        description: 'Modify and update existing code',
        category: 'code_generation',
        proficiency_level: 'advanced',
        confidence_level: 0.78,
        tags: ['editing', 'implementation'],
      });
    }
    
    if (agentDef.tools.includes('execute')) {
      capabilities.push({
        capability_name: 'Testing and Validation',
        description: 'Execute tests and validate implementations',
        category: 'testing',
        proficiency_level: 'advanced',
        confidence_level: 0.82,
        tags: ['testing', 'validation'],
      });
    }
  }

  return capabilities;
}

/**
 * Estimate completion time based on category and proficiency
 */
function estimateCompletionTime(
  category: CapabilityCategory,
  proficiency: ProficiencyLevel
): number {
  // Base times in milliseconds by category
  const baseTimes: Record<CapabilityCategory, number> = {
    code_generation: 300000,      // 5 minutes
    code_review: 180000,          // 3 minutes
    testing: 240000,              // 4 minutes
    documentation: 420000,        // 7 minutes
    debugging: 360000,            // 6 minutes
    refactoring: 480000,          // 8 minutes
    architecture: 600000,         // 10 minutes
    security: 540000,             // 9 minutes
    performance: 720000,          // 12 minutes
    deployment: 300000,           // 5 minutes
    data_analysis: 600000,        // 10 minutes
    research: 900000,             // 15 minutes
    planning: 420000,             // 7 minutes
    validation: 240000,           // 4 minutes
    communication: 180000,        // 3 minutes
    general: 300000,              // 5 minutes
  };

  // Proficiency multipliers
  const proficiencyMultipliers: Record<ProficiencyLevel, number> = {
    novice: 2.0,
    intermediate: 1.5,
    advanced: 1.0,
    expert: 0.7,
    master: 0.5,
  };

  const baseTime = baseTimes[category] || 300000;
  const multiplier = proficiencyMultipliers[proficiency];

  return Math.round(baseTime * multiplier);
}

/**
 * Infer resource requirements
 */
function inferResourceRequirements(
  agentDef: AgentDefinition,
  category: CapabilityCategory
): ResourceRequirement[] {
  const requirements: ResourceRequirement[] = [];

  // CPU requirements
  requirements.push({
    type: 'cpu',
    minimum: 1,
    recommended: 2,
    maximum: 4,
    unit: 'cores',
  });

  // Memory requirements based on category
  const memoryByCategory: Record<CapabilityCategory, number> = {
    code_generation: 512,
    code_review: 256,
    testing: 1024,
    documentation: 256,
    debugging: 512,
    refactoring: 512,
    architecture: 256,
    security: 512,
    performance: 1024,
    deployment: 512,
    data_analysis: 2048,
    research: 512,
    planning: 256,
    validation: 512,
    communication: 128,
    general: 256,
  };

  requirements.push({
    type: 'memory',
    minimum: memoryByCategory[category] / 2,
    recommended: memoryByCategory[category],
    maximum: memoryByCategory[category] * 2,
    unit: 'MB',
  });

  // Time budget
  requirements.push({
    type: 'time_ms',
    recommended: estimateCompletionTime(category, 'advanced'),
    maximum: estimateCompletionTime(category, 'advanced') * 2,
    unit: 'milliseconds',
  });

  return requirements;
}

/**
 * Initialize confidence calibration
 */
function initializeCalibration(): ConfidenceCalibration {
  return {
    total_evaluations: 0,
    successful_outcomes: 0,
    calibration_accuracy: 0.0,
    last_calibrated_at: new Date().toISOString(),
    calibration_method: 'automated',
  };
}

/**
 * Calculate average confidence across capabilities
 */
function calculateAverageConfidence(capabilities: AgentCapability[]): number {
  if (capabilities.length === 0) return 0;
  const sum = capabilities.reduce((acc, cap) => acc + cap.confidence_level, 0);
  return sum / capabilities.length;
}

/**
 * Infer specializations from capabilities
 */
function inferSpecializations(capabilities: AgentCapability[]): CapabilityCategory[] {
  const categoryCounts = new Map<CapabilityCategory, number>();
  
  for (const capability of capabilities) {
    const count = categoryCounts.get(capability.category) || 0;
    categoryCounts.set(capability.category, count + 1);
  }

  // Get categories with 2+ capabilities
  const specializations: CapabilityCategory[] = [];
  for (const [category, count] of categoryCounts) {
    if (count >= 2) {
      specializations.push(category);
    }
  }

  return specializations;
}

/**
 * Infer TLP clearance based on agent tier
 */
function inferTLPClearance(
  agentDef: AgentDefinition
): Array<'CLEAR' | 'GREEN' | 'AMBER' | 'RED'> {
  const tier = agentDef.tier?.toLowerCase();
  
  switch (tier) {
    case 'proprietary':
    case 'executive':
      return ['CLEAR', 'GREEN', 'AMBER', 'RED'];
    case 'internal':
      return ['CLEAR', 'GREEN', 'AMBER'];
    case 'workspace':
      return ['CLEAR', 'GREEN'];
    default:
      return ['CLEAR'];
  }
}

/**
 * Parse agent definition from frontmatter
 */
export function parseAgentDefinition(frontmatter: string): AgentDefinition {
  const lines = frontmatter.split('\n');
  const definition: Partial<AgentDefinition> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('name:')) {
      definition.name = trimmed.substring(5).trim();
    } else if (trimmed.startsWith('description:')) {
      definition.description = trimmed.substring(12).trim();
    } else if (trimmed.startsWith('tools:')) {
      const toolsStr = trimmed.substring(6).trim();
      try {
        definition.tools = JSON.parse(toolsStr);
      } catch (e) {
        // Try with single quotes replaced
        try {
          const fixed = toolsStr.replace(/'/g, '"');
          definition.tools = JSON.parse(fixed);
        } catch (e2) {
          // Fallback: parse as array literal
          const matches = toolsStr.match(/'([^']+)'/g);
          if (matches) {
            definition.tools = matches.map(m => m.replace(/'/g, ''));
          }
        }
      }
    } else if (trimmed.startsWith('model:')) {
      definition.model = trimmed.substring(6).trim();
    } else if (trimmed.startsWith('category:')) {
      definition.category = trimmed.substring(9).trim();
    } else if (trimmed.startsWith('tier:')) {
      definition.tier = trimmed.substring(5).trim();
    } else if (trimmed.startsWith('version:')) {
      definition.version = trimmed.substring(8).trim();
    }
  }

  if (!definition.name || !definition.description) {
    throw new Error('Agent definition must include name and description');
  }

  return definition as AgentDefinition;
}

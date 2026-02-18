#!/usr/bin/env node
/**
 * Bootstrap Capability Manifests for Workspace Agents
 * 
 * Generates capability manifests for all workspace agents by parsing
 * their .agent.md files and creating structured capability declarations.
 * 
 * Usage:
 *   node scripts/bootstrap-agent-capabilities.mjs
 * 
 * @date 2026-02-15
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Workspace agents directory - path from dcyfr-ai/packages/ai/scripts to workspace root
const AGENTS_DIR = join(__dirname, '../../../../.ai/agents');
const OUTPUT_DIR = join(__dirname, '../manifests/capabilities');

/**
 * Safely parse an array literal from YAML frontmatter (no eval)
 */
function parseArrayValue(str) {
  try {
    return JSON.parse(str);
  } catch (_e) {
    const fixed = str.replace(/'/g, '"');
    try { return JSON.parse(fixed); } catch (_e2) { /* ignore */ }
    const matches = str.match(/'([^']+)'/g) || str.match(/"([^"]+)"/g);
    if (matches) return matches.map(m => m.replace(/'/g, '').replace(/"/g, ''));
    return [];
  }
}

/**
 * Parse agent frontmatter
 */
function parseAgentFrontmatter(content) {
  // Remove comments before frontmatter
  const withoutComments = content.replace(/<!--[\s\S]*?-->\n*/g, '');
  
  const match = withoutComments.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('No frontmatter found');
  }

  const frontmatter = match[1];
  const lines = frontmatter.split('\n');
  const agent = {};

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('name:')) {
      agent.name = trimmed.substring(5).trim();
    } else if (trimmed.startsWith('description:')) {
      agent.description = trimmed.substring(12).trim();
    } else if (trimmed.startsWith('tools:')) {
      agent.tools = parseArrayValue(trimmed.substring(6).trim());
    } else if (trimmed.startsWith('model:')) {
      agent.model = trimmed.substring(6).trim();
    } else if (trimmed.startsWith('category:')) {
      agent.category = trimmed.substring(9).trim();
    } else if (trimmed.startsWith('tier:')) {
      agent.tier = trimmed.substring(5).trim();
    } else if (trimmed.startsWith('version:')) {
      agent.version = trimmed.substring(8).trim();
    } else if (trimmed.startsWith('delegatesTo:')) {
      agent.delegatesTo = parseArrayValue(trimmed.substring(12).trim());
    }
  }

  return agent;
}

/**
 * Get capabilities based on agent tools list
 */
function getToolBasedCapabilities(tools) {
  if (!tools) return [];
  const result = [];
  if (tools.includes('read') || tools.includes('search')) {
    result.push({
      name: 'Code Analysis',
      description: 'Analyze and understand existing codebases',
      category: 'code_review',
      proficiency: 'advanced',
      confidence: 0.80,
      tags: ['analysis', 'research'],
    });
  }
  if (tools.includes('edit')) {
    result.push({
      name: 'Code Modification',
      description: 'Modify and update existing code',
      category: 'code_generation',
      proficiency: 'advanced',
      confidence: 0.78,
      tags: ['editing', 'implementation'],
    });
  }
  if (tools.includes('execute')) {
    result.push({
      name: 'Testing and Validation',
      description: 'Execute tests and validate implementations',
      category: 'testing',
      proficiency: 'advanced',
      confidence: 0.82,
      tags: ['testing', 'validation'],
    });
  }
  return result;
}

/**
 * Infer capabilities from agent definition
 */
function inferCapabilities(agent) {
  const capabilities = [];
  const agentId = agent.name.toLowerCase().replace(/\s+/g, '-');
  
  // Category-based capabilities
  const categoryMappings = {
    'architecture': [
      {
        name: 'System Design',
        description: 'Design and review system architecture and component interactions',
        category: 'architecture',
        proficiency: 'expert',
        confidence: 0.85,
        tags: ['design', 'patterns', 'architecture'],
      },
      {
        name: 'Code Review',
        description: 'Review code for architectural patterns and best practices',
        category: 'code_review',
        proficiency: 'expert',
        confidence: 0.90,
        tags: ['review', 'patterns', 'quality'],
      },
    ],
    'testing': [
      {
        name: 'Test Design',
        description: 'Design comprehensive test strategies and test cases',
        category: 'testing',
        proficiency: 'expert',
        confidence: 0.88,
        tags: ['testing', 'quality', 'validation'],
      },
      {
        name: 'Test Implementation',
        description: 'Implement unit, integration, and E2E tests',
        category: 'testing',
        proficiency: 'advanced',
        confidence: 0.85,
        tags: ['testing', 'implementation'],
      },
    ],
    'security': [
      {
        name: 'Security Analysis',
        description: 'Analyze code and systems for security vulnerabilities',
        category: 'security',
        proficiency: 'expert',
        confidence: 0.87,
        tags: ['security', 'analysis', 'vulnerabilities'],
      },
      {
        name: 'Security Hardening',
        description: 'Implement security best practices and hardening measures',
        category: 'security',
        proficiency: 'advanced',
        confidence: 0.83,
        tags: ['security', 'hardening'],
      },
    ],
    'development': [
      {
        name: 'Code Generation',
        description: 'Generate production-quality code following best practices',
        category: 'code_generation',
        proficiency: 'advanced',
        confidence: 0.80,
        tags: ['coding', 'implementation'],
      },
      {
        name: 'Debugging',
        description: 'Identify and fix bugs in code',
        category: 'debugging',
        proficiency: 'advanced',
        confidence: 0.82,
        tags: ['debugging', 'troubleshooting'],
      },
    ],
    'devops': [
      {
        name: 'CI/CD Pipeline',
        description: 'Design and maintain CI/CD pipelines',
        category: 'deployment',
        proficiency: 'expert',
        confidence: 0.85,
        tags: ['cicd', 'automation', 'deployment'],
      },
    ],
    'documentation': [
      {
        name: 'Technical Documentation',
        description: 'Create comprehensive technical documentation',
        category: 'documentation',
        proficiency: 'expert',
        confidence: 0.88,
        tags: ['documentation', 'writing'],
      },
    ],
    'performance': [
      {
        name: 'Performance Analysis',
        description: 'Analyze and optimize system performance',
        category: 'performance',
        proficiency: 'expert',
        confidence: 0.86,
        tags: ['performance', 'optimization'],
      },
    ],
  };

  const category = agent.category?.toLowerCase() || 'general';
  if (categoryMappings[category]) {
    capabilities.push(...categoryMappings[category]);
  } else {
    capabilities.push({
      name: 'General Development',
      description: agent.description,
      category: 'general',
      proficiency: 'intermediate',
      confidence: 0.70,
      tags: [category],
    });
  }

  // Tool-based capabilities
  capabilities.push(...getToolBasedCapabilities(agent.tools));

  // Remove duplicates by name
  const unique = [];
  const seen = new Set();
  for (const cap of capabilities) {
    if (!seen.has(cap.name)) {
      seen.add(cap.name);
      unique.push(cap);
    }
  }

  return unique;
}

/**
 * Estimate completion time
 */
function estimateCompletionTime(category, proficiency) {
  const baseTimes = {
    code_generation: 300000,
    code_review: 180000,
    testing: 240000,
    documentation: 420000,
    debugging: 360000,
    refactoring: 480000,
    architecture: 600000,
    security: 540000,
    performance: 720000,
    deployment: 300000,
    data_analysis: 600000,
    research: 900000,
    planning: 420000,
    validation: 240000,
    communication: 180000,
    general: 300000,
  };

  const proficiencyMultipliers = {
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
 * Infer TLP clearance
 */
function inferTLPClearance(agent) {
  const tier = agent.tier?.toLowerCase();
  
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
 * Generate capability manifest
 */
function generateManifest(agent) {
  const agentId = agent.name.toLowerCase().replace(/\s+/g, '-');
  const capabilities = inferCapabilities(agent);
  
  const fullCapabilities = capabilities.map((cap, index) => ({
    capability_id: `${agentId}_${cap.name.toLowerCase().replace(/\s+/g, '_')}`,
    capability_name: cap.name,
    description: cap.description,
    category: cap.category,
    proficiency_level: cap.proficiency,
    confidence_level: cap.confidence,
    estimated_completion_time_ms: estimateCompletionTime(cap.category, cap.proficiency),
    resource_requirements: [
      { type: 'cpu', minimum: 1, recommended: 2, maximum: 4, unit: 'cores' },
      { type: 'memory', minimum: 256, recommended: 512, maximum: 1024, unit: 'MB' },
    ],
    tags: cap.tags,
    version: agent.version || '1.0.0',
    registered_at: new Date().toISOString(),
    calibration: {
      total_evaluations: 0,
      successful_outcomes: 0,
      calibration_accuracy: 0.0,
      last_calibrated_at: new Date().toISOString(),
      calibration_method: 'automated',
    },
  }));

  const overallConfidence = fullCapabilities.reduce((sum, cap) => sum + cap.confidence_level, 0) / fullCapabilities.length;

  const manifest = {
    agent_id: agentId,
    agent_name: agent.name,
    agent_version: agent.version || '1.0.0',
    manifest_version: '1.0.0',
    capabilities: fullCapabilities,
    overall_confidence: overallConfidence,
    specializations: [...new Set(fullCapabilities.map(c => c.category))],
    availability: 'available',
    tlp_clearance: inferTLPClearance(agent),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      tier: agent.tier,
      model: agent.model,
      delegatesTo: agent.delegatesTo,
    },
  };

  return manifest;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Bootstrapping agent capability manifests...\n');

  // Create output directory
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch (e) {
    // Directory exists
  }

  // Read all agent files
  const agentFiles = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent.md'));
  
  console.log(`📋 Found ${agentFiles.length} agent definitions\n`);

  let successCount = 0;
  const manifests = [];

  for (const file of agentFiles) {
    try {
      const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
      const agent = parseAgentFrontmatter(content);
      
      // Infer name from filename if not in frontmatter
      if (!agent.name) {
        agent.name = file.replace('.agent.md', '');
        console.log(`ℹ️  Inferred name from filename: ${agent.name}`);
      }

      const manifest = generateManifest(agent);
      manifests.push(manifest);

      const outputFile = join(OUTPUT_DIR, `${manifest.agent_id}.json`);
      writeFileSync(outputFile, JSON.stringify(manifest, null, 2));

      console.log(`✅ ${agent.name}`);
      console.log(`   Capabilities: ${manifest.capabilities.length}`);
      console.log(`   Confidence: ${(manifest.overall_confidence * 100).toFixed(1)}%`);
      console.log(`   TLP: ${manifest.tlp_clearance.join(', ')}`);
      console.log(`   Output: ${outputFile}\n`);

      successCount++;
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  // Create index file
  const indexFile = join(OUTPUT_DIR, 'index.json');
  writeFileSync(indexFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_agents: successCount,
    manifests: manifests.map(m => ({
      agent_id: m.agent_id,
      agent_name: m.agent_name,
      capabilities_count: m.capabilities.length,
      overall_confidence: m.overall_confidence,
    })),
  }, null, 2));

  console.log(`\n📊 Summary:`);
  console.log(`   Total agents processed: ${successCount}/${agentFiles.length}`);
  console.log(`   Index file: ${indexFile}`);
  console.log(`\n✨ Done!`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

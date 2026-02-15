#!/usr/bin/env node

/**
 * Bootstrap script for dcyfr-labs production agent capability manifests
 * 
 * This script:
 * 1. Scans /dcyfr-labs/.claude/agents/ for agent files
 * 2. Analyzes agent content to determine appropriate capabilities
 * 3. Extends the capability manifest generator with dcyfr-labs mappings
 * 4. Generates capability manifests for all production agents
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Define capability keywords for automatic mapping
const CAPABILITY_KEYWORDS = {
  design_token_compliance: [
    'design token', 'SPACING', 'TYPOGRAPHY', 'SEMANTIC_COLORS', 
    'hardcoded', 'design system', 'token compliance', 'Tailwind'
  ],
  pagelayout_architecture: [
    'PageLayout', 'layout', 'ArchiveLayout', 'ArticleLayout', 'page structure'
  ],
  production_testing: [
    'test', 'testing', '99%', 'pass rate', 'quality', 'vitest', 'playwright'
  ],
  content_creation_seo: [
    'content', 'blog', 'SEO', 'MDX', 'marketing', 'writing'
  ],
  nextjs_architecture: [
    'Next.js', 'App Router', 'Server Component', 'API route', 'NextJS'
  ],
  code_generation: [
    'code', 'component', 'implementation', 'generate', 'develop'
  ],
  pattern_enforcement: [
    'pattern', 'architecture', 'enforce', 'convention', 'standard'
  ],
  performance_optimization: [
    'performance', 'optimization', 'speed', 'lighthouse', 'Core Web Vitals'
  ],
  security_scanning: [
    'security', 'vulnerability', 'audit', 'OWASP', 'penetration'
  ],
  accessibility_audit: [
    'accessibility', 'a11y', 'WCAG', 'screen reader', 'inclusive'
  ]
};

/**
 * Analyze agent content and determine capabilities
 */
function determineCapabilities(agentContent, agentName) {
  const capabilities = new Set();
  const contentLower = agentContent.toLowerCase();

  // Check each capability for keyword matches
  for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => 
      contentLower.includes(keyword.toLowerCase())
    ).length;

    // If we find 2+ keyword matches, include this capability
    if (matchCount >= 2) {
      capabilities.add(capability);
    }
    // Special cases for specific agents
    else if (matchCount >= 1) {
      if (agentName.includes('design') && capability === 'design_token_compliance') {
        capabilities.add(capability);
      }
      else if (agentName.includes('test') && capability === 'production_testing') {
        capabilities.add(capability);
      }
      else if (agentName.includes('content') && capability === 'content_creation_seo') {
        capabilities.add(capability);
      }
      else if (agentName.includes('nextjs') && capability === 'nextjs_architecture') {
        capabilities.add(capability);
      }
    }
  }

  // Ensure every agent has at least basic capabilities
  if (capabilities.size === 0) {
    capabilities.add('code_generation');
    capabilities.add('pattern_enforcement');
  }

  // Add pattern_enforcement to all production agents
  capabilities.add('pattern_enforcement');

  return Array.from(capabilities);
}

/**
 * Generate agent capability mapping for dcyfr-labs agents  
 */
async function generateDcyfrLabsMappings() {
  const agentsPath = '/Users/drew/DCYFR/code/dcyfr-workspace/dcyfr-labs/.claude/agents';
  const mappings = {};

  try {
    const files = await readdir(agentsPath);
    const agentFiles = files.filter(file => file.endsWith('.md') && file !== 'AGENT_TAXONOMY.md');

    console.log(`🔍 Found ${agentFiles.length} dcyfr-labs agents to process`);

    for (const file of agentFiles) {
      const agentName = file.replace('.md', '');
      const filePath = join(agentsPath, file);

      try {
        const content = await readFile(filePath, 'utf-8');
        const capabilities = determineCapabilities(content, agentName);
        
        mappings[agentName] = capabilities;
        console.log(`✅ ${agentName}: ${capabilities.join(', ')}`);
      } catch (error) {
        console.warn(`⚠️  Could not process ${file}: ${error}`);
      }
    }

    return mappings;
  } catch (error) {
    console.error('❌ Error scanning dcyfr-labs agents:', error);
    throw error;
  }
}

/**
 * Update the capability manifest generator with dcyfr-labs mappings
 */
async function updateCapabilityGenerator(dcyfrLabsMappings) {
  const generatorPath = '/Users/drew/DCYFR/code/dcyfr-workspace/dcyfr-ai/packages/ai/src/capability-manifest-generator.ts';
  
  try {
    const content = await readFile(generatorPath, 'utf-8');
    
    // Find the end of existing mappings
    const mappingEndIndex = content.indexOf('};', content.indexOf('const AGENT_CAPABILITY_MAPPING'));
    
    if (mappingEndIndex === -1) {
      throw new Error('Could not find AGENT_CAPABILITY_MAPPING section');
    }

    // Create dcyfr-labs mapping section
    const dcyfrLabsSection = `
  
  // DCYFR-LABS PRODUCTION AGENTS (${Object.keys(dcyfrLabsMappings).length} agents)
${Object.entries(dcyfrLabsMappings)
  .map(([agent, capabilities]) => `  '${agent}': [\n${capabilities.map(cap => `    '${cap}',`).join('\n')}\n  ],`)
  .join('\n')}`;

    // Insert the new mappings before the closing brace
    const updatedContent = 
      content.slice(0, mappingEndIndex) + 
      dcyfrLabsSection + '\n' + 
      content.slice(mappingEndIndex);

    await writeFile(generatorPath, updatedContent);
    console.log(`✅ Updated capability generator with ${Object.keys(dcyfrLabsMappings).length} dcyfr-labs agents`);
  } catch (error) {
    console.error('❌ Error updating capability generator:', error);
    throw error;
  }
}

/**
 * Generate capability manifests for dcyfr-labs agents
 */
async function generateManifests(dcyfrLabsMappings) {
  const { generateCapabilityManifest } = await import('../../../dist/ai/src/capability-manifest-generator.js');
  
  const manifestsDir = '/Users/drew/DCYFR/code/dcyfr-workspace/dcyfr-ai/packages/ai/manifests';
  
  let successCount = 0;
  let errorCount = 0;

  for (const [agentName, capabilities] of Object.entries(dcyfrLabsMappings)) {
    try {
      // Create agent object with proper structure expected by generateCapabilityManifest
      const agentObject = {
        manifest: {
          name: agentName,
          capabilities: capabilities,
          agent_type: 'dcyfr-labs-production'
        }
      };
      
      const manifest = generateCapabilityManifest(agentObject);
      
      const manifestPath = join(manifestsDir, `${agentName}.json`);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      
      successCount++;
      console.log(`✅ Generated manifest: ${agentName}.json`);
    } catch (error) {
      errorCount++;
      console.error(`❌ Failed to generate manifest for ${agentName}:`, error);
    }
  }

  return { successCount, errorCount };
}

/**
 * Main bootstrap function
 */
async function bootstrapDcyfrLabsCapabilities() {
  console.log('🚀 Bootstrapping dcyfr-labs production agent capabilities...\n');

  try {
    // Step 1: Generate mappings
    console.log('📋 Step 1: Analyzing dcyfr-labs agents...');
    const dcyfrLabsMappings = await generateDcyfrLabsMappings();
    
    // Step 2: Update generator
    console.log('\n🔧 Step 2: Updating capability generator...');
    await updateCapabilityGenerator(dcyfrLabsMappings);

    // Step 3: Generate manifests
    console.log('\n📦 Step 3: Generating capability manifests...');
    const { successCount, errorCount } = await generateManifests(dcyfrLabsMappings);

    // Summary
    console.log(`\n🎉 Bootstrap Complete!`);
    console.log(`✅ Agents processed: ${Object.keys(dcyfrLabsMappings).length}`);
    console.log(`✅ Manifests generated: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}`);
    }

    // Capability statistics
    const capabilityCount = {};
    Object.values(dcyfrLabsMappings).forEach(capabilities => {
      capabilities.forEach(cap => {
        capabilityCount[cap] = (capabilityCount[cap] || 0) + 1;
      });
    });

    console.log('\n📊 Capability Distribution:');
    Object.entries(capabilityCount)
      .sort(([,a], [,b]) => b - a)
      .forEach(([capability, count]) => {
        console.log(`   ${capability}: ${count} agents`);
      });

  } catch (error) {
    console.error(`\n❌ Bootstrap failed:`, error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapDcyfrLabsCapabilities();
}

export { bootstrapDcyfrLabsCapabilities };
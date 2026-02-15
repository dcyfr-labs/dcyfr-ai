/**
 * DCYFR Agent Capability Bootstrap Script
 * TLP:CLEAR
 *
 * Generates and registers capability manifests for all DCYFR agents.
 * Implements Task 7.1: Update existing workspace agents with capability manifests.
 *
 * @version 1.0.0
 * @date 2026-02-13
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import {
  generateDcyfrCapabilityManifests,
  validateCapabilityManifest,
  defaultCapabilityRegistry,
  type AgentCapabilityManifest,
} from '../src/capability-manifest-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Bootstrap DCYFR agent capabilities
 */
async function bootstrapDcyfrCapabilities() {
  console.log('🚀 DCYFR Agent Capability Bootstrap');
  console.log('=====================================\n');

  try {
    // Generate capability manifests
    console.log('📝 Generating capability manifests for DCYFR agents...');
    const manifests = await generateDcyfrCapabilityManifests();
    
    console.log(`✅ Generated ${manifests.length} capability manifests\n`);

    // Validate all manifests
    console.log('🔍 Validating capability manifests...');
    let totalErrors = 0;
    let totalWarnings = 0;

    const validationResults: Array<{
      agentId: string;
      result: ReturnType<typeof validateCapabilityManifest>;
    }> = [];

    for (const manifest of manifests) {
      const validation = validateCapabilityManifest(manifest);
      validationResults.push({
        agentId: manifest.agent_id,
        result: validation,
      });

      if (!validation.isValid) {
        console.log(`❌ ${manifest.agent_id}: ${validation.errors.length} errors`);
        validation.errors.forEach(error => console.log(`   • ${error}`));
        totalErrors += validation.errors.length;
      } else {
        console.log(`✅ ${manifest.agent_id}: Valid`);
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => console.log(`   ⚠️  ${warning}`));
        totalWarnings += validation.warnings.length;
      }
    }

    console.log(`\n📊 Validation Summary:`);
    console.log(`   • Valid manifests: ${validationResults.filter(r => r.result.isValid).length}/${manifests.length}`);
    console.log(`   • Total errors: ${totalErrors}`);
    console.log(`   • Total warnings: ${totalWarnings}\n`);

    if (totalErrors > 0) {
      throw new Error('Capability manifest validation failed');
    }

    // Register manifests with capability registry
    console.log('📋 Registering capability manifests...');
    for (const manifest of manifests) {
      await defaultCapabilityRegistry.registerManifest(manifest);
      console.log(`✅ Registered: ${manifest.agent_id}`);
    }

    // Save manifests to file system
    const outputDir = join(__dirname, '..', 'manifests');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    console.log('\n💾 Saving capability manifests to filesystem...');
    
    // Save individual manifests
    for (const manifest of manifests) {
      const filepath = join(outputDir, `${manifest.agent_id}.json`);
      writeFileSync(filepath, JSON.stringify(manifest, null, 2));
      console.log(`💾 Saved: ${manifest.agent_id}.json`);
    }

    // Save combined manifest index
    const indexManifest = {
      generated_at: new Date().toISOString(),
      total_agents: manifests.length,
      manifests: manifests.map(m => ({
        agent_id: m.agent_id,
        agent_name: m.agent_name,
        version: m.version,
        capabilities_count: m.capabilities.length,
        overall_confidence: m.overall_confidence,
        specializations: m.specializations,
      })),
    };

    const indexPath = join(outputDir, 'index.json');
    writeFileSync(indexPath, JSON.stringify(indexManifest, null, 2));
    console.log(`💾 Saved: index.json\n`);

    // Print capability statistics
    console.log('📈 Capability Statistics:');
    const totalCapabilities = manifests.reduce((sum, m) => sum + m.capabilities.length, 0);
    const avgConfidence = manifests.reduce((sum, m) => sum + (m.overall_confidence || 0), 0) / manifests.length;
    
    // Count capability types
    const capabilityTypeCount: Record<string, number> = {};
    const specializationCount: Record<string, number> = {};
    
    manifests.forEach(manifest => {
      manifest.capabilities.forEach(cap => {
        capabilityTypeCount[cap.capability_id] = (capabilityTypeCount[cap.capability_id] || 0) + 1;
      });
      
      (manifest.specializations || []).forEach(spec => {
        specializationCount[spec] = (specializationCount[spec] || 0) + 1;
      });
    });

    console.log(`   • Total agents: ${manifests.length}`);
    console.log(`   • Total capabilities: ${totalCapabilities}`);
    console.log(`   • Average confidence: ${Math.round(avgConfidence * 100)}%`);
    console.log(`   • Unique capability types: ${Object.keys(capabilityTypeCount).length}`);
    console.log(`   • Unique specializations: ${Object.keys(specializationCount).length}\n`);

    console.log('🔥 Most common capabilities:');
    Object.entries(capabilityTypeCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([cap, count]) => {
        console.log(`   • ${cap}: ${count} agents`);
      });

    console.log('\n🎯 Most common specializations:');
    Object.entries(specializationCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([spec, count]) => {
        console.log(`   • ${spec}: ${count} agents`);
      });

    // Test capability query
    console.log('\n🔍 Testing capability query system...');
    const queryResults = await defaultCapabilityRegistry.queryCapabilities({
      required_capabilities: ['code_generation'],
      min_confidence: 0.8,
      only_available: true,
    });

    console.log(`✅ Query test: Found ${queryResults.length} agents for code_generation (confidence ≥80%)`);
    queryResults.slice(0, 3).forEach(result => {
      console.log(`   • ${result.agent_name}: ${Math.round(result.match_score * 100)}% match`);
    });

    console.log('\n🎉 DCYFR Agent Capability Bootstrap Complete!');
    console.log(`   • ${manifests.length} agents registered`);
    console.log(`   • ${totalCapabilities} capabilities available`);
    console.log(`   • Manifests saved to: ${outputDir}`);
    console.log('\n✨ Ready for intelligent task delegation!\n');

  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

/**
 * Generate capability manifest summary for documentation
 */
async function generateCapabilitySummary() {
  const manifests = await generateDcyfrCapabilityManifests();
  
  let summary = '# DCYFR Agent Capability Manifests\n\n';
  summary += `Generated: ${new Date().toISOString()}\n`;
  summary += `Total Agents: ${manifests.length}\n\n`;

  summary += '## Agent Capabilities Overview\n\n';
  summary += '| Agent | Capabilities | Confidence | Specializations |\n';
  summary += '|-------|-------------|------------|----------------|\n';

  manifests.forEach(manifest => {
    const capNames = manifest.capabilities.map(c => c.name).join(', ');
    const confidence = Math.round((manifest.overall_confidence || 0) * 100);
    const specs = (manifest.specializations || []).join(', ');

    summary += `| ${manifest.agent_name} | ${manifest.capabilities.length} | ${confidence}% | ${specs} |\n`;
  });

  summary += '\n## Capability Distribution\n\n';
  
  // Count capabilities
  const capabilityCount: Record<string, number> = {};
  manifests.forEach(manifest => {
    manifest.capabilities.forEach(cap => {
      capabilityCount[cap.name] = (capabilityCount[cap.name] || 0) + 1;
    });
  });

  Object.entries(capabilityCount)
    .sort(([, a], [, b]) => b - a)
    .forEach(([capName, count]) => {
      summary += `- **${capName}**: ${count} agents\n`;
    });

  return summary;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (command === 'summary') {
    generateCapabilitySummary()
      .then(summary => console.log(summary))
      .catch(console.error);
  } else {
    bootstrapDcyfrCapabilities()
      .catch(console.error);
  }
}

export { bootstrapDcyfrCapabilities, generateCapabilitySummary };
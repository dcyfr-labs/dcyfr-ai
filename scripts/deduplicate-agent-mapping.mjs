#!/usr/bin/env node
/**
 * Deduplicate AGENT_CAPABILITY_MAPPING in capability-manifest-generator.ts
 * Removes duplicate agent entries while preserving first occurrence of each agent.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = join(__dirname, '../packages/ai/src/capability-manifest-generator.ts');
const content = readFileSync(filePath, 'utf-8');

// Find the AGENT_CAPABILITY_MAPPING object
const mappingStart = content.indexOf('const AGENT_CAPABILITY_MAPPING: Record<string, string[]> = {');
const mappingStartLine = content.substring(0, mappingStart).split('\n').length;

// Find the closing of the mapping object
let braceCount = 0;
let mappingEnd = mappingStart;
let foundStart = false;

for (let i = mappingStart; i < content.length; i++) {
  if (content[i] === '{') {
    braceCount++;
    foundStart = true;
  } else if (content[i] === '}') {
    braceCount--;
    if (foundStart && braceCount === 0) {
      mappingEnd = i + 2; // Include the closing brace and semicolon
      break;
    }
  }
}

const beforeMapping = content.substring(0, mappingStart);
const mappingContent = content.substring(mappingStart, mappingEnd);
const afterMapping = content.substring(mappingEnd);

console.log(`📍 Found AGENT_CAPABILITY_MAPPING at line ${mappingStartLine}`);
console.log(`📏 Mapping spans ${mappingContent.split('\n').length} lines`);

// Parse the mapping to extract entries
const entryRegex = /^\s{2}'([^']+)':\s*\[([^\]]+)\],?$/gm;
const entries = new Map(); // Use Map to preserve insertion order
let match;

while ((match = entryRegex.exec(mappingContent)) !== null) {
  const agentName = match[1];
  const capabilities = match[2];
  
  // Only keep first occurrence
  if (!entries.has(agentName)) {
    entries.set(agentName, capabilities);
  }
}

console.log(`✨ Found ${entries.size} unique agents (removed ${[...mappingContent.matchAll(entryRegex)].length - entries.size} duplicates)`);

// Build deduplicated mapping
const deduplicatedLines = [
  'const AGENT_CAPABILITY_MAPPING: Record<string, string[]> = {',
];

let count = 0;
for (const [agentName, capabilities] of entries) {
  count++;
  const isLast = count === entries.size;
  deduplicatedLines.push(`  '${agentName}': [${capabilities}]${isLast ? '' : ','}`);
}

deduplicatedLines.push('};');

const deduplicatedMapping = deduplicatedLines.join('\n');

// Reconstruct file
const newContent = beforeMapping + deduplicatedMapping + '\n' + afterMapping;

// Write back
writeFileSync(filePath, newContent, 'utf-8');

console.log(`✅ Deduplication complete!`);
console.log(`📝 File updated: ${filePath}`);
console.log(`📊 Reduced from ${mappingContent.split('\n').length} lines to ${deduplicatedLines.length} lines`);

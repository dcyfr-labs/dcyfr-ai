#!/usr/bin/env node

/**
 * Automated Changelog Generation Script
 * 
 * This script updates the CHANGELOG.md file based on changesets.
 * It's automatically run as part of the version bump process.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const CHANGELOG_PATH = './CHANGELOG.md';
const PACKAGE_JSON_PATH = './package.json';

function getPackageVersion() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

function getChangelog() {
  if (!existsSync(CHANGELOG_PATH)) {
    return `# Changelog

All notable changes to @dcyfr/ai will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;
  }
  return readFileSync(CHANGELOG_PATH, 'utf8');
}

function updateChangelog() {
  const version = getPackageVersion();
  const date = new Date().toISOString().split('T')[0];
  const changelog = getChangelog();

  console.log(`📝 Updating changelog for version ${version}...`);

  // Check if version already exists in changelog
  if (changelog.includes(`## [${version}]`)) {
    console.log(`✓ Version ${version} already in changelog`);
    return;
  }

  // Get git commits since last tag
  let commits = [];
  try {
    const commitLog = execSync('git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --pretty=format:"%s"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    
    commits = commitLog.split('\n').filter(Boolean);
  } catch (error) {
    console.log('⚠️  Could not get git commits, using manual update');
  }

  // Parse commits into categories
  const added = commits.filter(c => c.match(/^(feat|add|new):/i));
  const changed = commits.filter(c => c.match(/^(change|update|refactor):/i));
  const fixed = commits.filter(c => c.match(/^(fix|bug):/i));
  const deprecated = commits.filter(c => c.match(/^(deprecate):/i));
  const removed = commits.filter(c => c.match(/^(remove|delete):/i));
  const security = commits.filter(c => c.match(/^(security|sec):/i));

  // Build new version section
  let newSection = `## [${version}] - ${date}\n\n`;
  
  if (added.length) {
    newSection += `### Added\n${added.map(c => `- ${c.replace(/^(feat|add|new):\s*/i, '')}`).join('\n')}\n\n`;
  }
  if (changed.length) {
    newSection += `### Changed\n${changed.map(c => `- ${c.replace(/^(change|update|refactor):\s*/i, '')}`).join('\n')}\n\n`;
  }
  if (deprecated.length) {
    newSection += `### Deprecated\n${deprecated.map(c => `- ${c.replace(/^(deprecate):\s*/i, '')}`).join('\n')}\n\n`;
  }
  if (removed.length) {
    newSection += `### Removed\n${removed.map(c => `- ${c.replace(/^(remove|delete):\s*/i, '')}`).join('\n')}\n\n`;
  }
  if (fixed.length) {
    newSection += `### Fixed\n${fixed.map(c => `- ${c.replace(/^(fix|bug):\s*/i, '')}`).join('\n')}\n\n`;
  }
  if (security.length) {
    newSection += `### Security\n${security.map(c => `- ${c.replace(/^(security|sec):\s*/i, '')}`).join('\n')}\n\n`;
  }

  // Insert new section after the header
  const lines = changelog.split('\n');
  const headerEndIndex = lines.findIndex((line, idx) => 
    idx > 0 && line.startsWith('## ')
  );

  const updatedChangelog = [
    ...lines.slice(0, headerEndIndex === -1 ? lines.length : headerEndIndex),
    newSection.trim(),
    '',
    ...(headerEndIndex === -1 ? [] : lines.slice(headerEndIndex))
  ].join('\n');

  writeFileSync(CHANGELOG_PATH, updatedChangelog);
  console.log(`✓ Changelog updated for version ${version}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateChangelog();
}

export { updateChangelog };

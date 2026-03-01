/**
 * SkillRegistry Tests
 *
 * Tests for the dynamic skill injection system.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { SkillRegistry } from '../skill-registry.js';

const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  afterEach(() => {
    if (registry) {
      registry.close();
    }
  });

  describe('initialization', () => {
    it('should load skills from directory', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      expect(registry.size).toBe(5); // 5 fixture files
      expect(registry.isInitialized).toBe(true);
    });

    it('should parse YAML frontmatter', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      const skills = registry.getSkills();
      const vercel = skills.find((s) => s.frontmatter.name === 'deployment-vercel');

      expect(vercel).toBeDefined();
      expect(vercel!.frontmatter.description).toContain('Vercel');
      expect(vercel!.frontmatter.tags).toEqual(['deploy', 'vercel', 'hosting', 'ci-cd']);
      expect(vercel!.frontmatter.priority).toBe(5);
      expect(vercel!.frontmatter.trust_level).toBe('public');
    });

    it('should handle files without frontmatter', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      const skills = registry.getSkills();
      const noFm = skills.find((s) => s.id === 'no-frontmatter');

      expect(noFm).toBeDefined();
      expect(noFm!.frontmatter.name).toBe('no-frontmatter'); // derived from filename
      expect(noFm!.body).toContain('testing strategies');
    });

    it('should parse requires_tools array', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      const skills = registry.getSkills();
      const security = skills.find((s) => s.frontmatter.name === 'security-audit');

      expect(security).toBeDefined();
      expect(security!.frontmatter.requires_tools).toEqual(['code-scanner', 'dependency-checker']);
    });

    it('should calculate token count for each skill', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      const skills = registry.getSkills();
      for (const skill of skills) {
        expect(skill.tokenCount).toBeGreaterThan(0);
      }
    });

    it('should handle non-existent directory', async () => {
      registry = new SkillRegistry({ skillsDir: '/nonexistent/path' });
      await registry.initialize();

      expect(registry.size).toBe(0);
    });

    it('should only initialize once', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();
      const size1 = registry.size;

      await registry.initialize();
      expect(registry.size).toBe(size1);
    });
  });

  describe('search', () => {
    it('should find skills relevant to a query', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.1, // Low threshold for testing
      });
      await registry.initialize();

      const results = await registry.search('deploy to Vercel');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].skill.frontmatter.name).toBe('deployment-vercel');
      expect(results[0].relevance).toBeGreaterThan(0);
    });

    it('should find TypeScript skills', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.1,
      });
      await registry.initialize();

      const results = await registry.search('TypeScript generics patterns');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].skill.frontmatter.name).toBe('typescript-patterns');
    });

    it('should respect maxSkills limit', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        maxSkills: 2,
        minRelevance: 0.01,
      });
      await registry.initialize();

      const results = await registry.search('programming code');

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by minRelevance', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.5,
      });
      await registry.initialize();

      // Use a broad query - some results should be above threshold, some below
      const highThreshold = await registry.search('deploy vercel', { minRelevance: 0.99 });
      const lowThreshold = await registry.search('deploy vercel', { minRelevance: 0.01 });

      // Higher threshold should return fewer or equal results
      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
      // All returned results should meet the threshold
      for (const r of highThreshold) {
        expect(r.relevance).toBeGreaterThanOrEqual(0.99);
      }
    });

    it('should return empty for empty query', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.1,
      });
      await registry.initialize();

      const results = await registry.search('');

      expect(results).toEqual([]);
    });

    it('should auto-initialize if not initialized', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.1,
      });

      // Search without calling initialize()
      const results = await registry.search('deploy vercel');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should boost name/tag matches', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'confidential', // Allow restricted skills
        minRelevance: 0.1,
      });
      await registry.initialize();

      const results = await registry.search('security audit vulnerability');

      expect(results.length).toBeGreaterThan(0);
      // Security skill has these as name/tags - should rank highly
      expect(results[0].skill.frontmatter.name).toBe('security-audit');
    });

    it('should return relevance scores between 0 and 1', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.01,
      });
      await registry.initialize();

      const results = await registry.search('deploy database TypeScript');

      for (const result of results) {
        expect(result.relevance).toBeGreaterThanOrEqual(0);
        expect(result.relevance).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('trust level filtering', () => {
    it('should exclude restricted skills when session trust is public', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'public',
        minRelevance: 0.01,
      });
      await registry.initialize();

      const results = await registry.search('security audit vulnerability owasp');

      // security-audit requires 'restricted' trust, should be excluded
      const securitySkill = results.find((r) => r.skill.frontmatter.name === 'security-audit');
      expect(securitySkill).toBeUndefined();
    });

    it('should exclude internal skills when session trust is public', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'public',
        minRelevance: 0.01,
      });
      await registry.initialize();

      const results = await registry.search('database schema drizzle migration');

      // database-design requires 'internal' trust
      const dbSkill = results.find((r) => r.skill.frontmatter.name === 'database-design');
      expect(dbSkill).toBeUndefined();
    });

    it('should include restricted skills when session trust is restricted', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'restricted',
        minRelevance: 0.01,
      });
      await registry.initialize();

      const results = await registry.search('security audit vulnerability owasp');

      const securitySkill = results.find((r) => r.skill.frontmatter.name === 'security-audit');
      expect(securitySkill).toBeDefined();
    });

    it('should include all skills when session trust is confidential', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'confidential',
        minRelevance: 0.01,
      });
      await registry.initialize();

      const results = await registry.search('security audit vulnerability owasp');

      const securitySkill = results.find((r) => r.skill.frontmatter.name === 'security-audit');
      expect(securitySkill).toBeDefined();
    });

    it('should update trust level dynamically', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'public',
        minRelevance: 0.01,
      });
      await registry.initialize();

      // Initially excluded
      let results = await registry.search('security audit vulnerability owasp');
      expect(results.find((r) => r.skill.frontmatter.name === 'security-audit')).toBeUndefined();

      // Upgrade trust level
      registry.setSessionTrustLevel('restricted');

      // Now included
      results = await registry.search('security audit vulnerability owasp');
      expect(results.find((r) => r.skill.frontmatter.name === 'security-audit')).toBeDefined();
    });

    it('should allow per-search trust override', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'public',
        minRelevance: 0.01,
      });
      await registry.initialize();

      // Override trust level for single search
      const results = await registry.search('security audit', { trustLevel: 'confidential' });

      const securitySkill = results.find((r) => r.skill.frontmatter.name === 'security-audit');
      expect(securitySkill).toBeDefined();
    });
  });

  describe('injection', () => {
    it('should inject skills into system prompt', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.1,
      });
      await registry.initialize();

      const result = await registry.injectSkills(
        'You are a helpful assistant.',
        'deploy to Vercel',
      );

      expect(result.augmentedPrompt).toContain('You are a helpful assistant.');
      expect(result.augmentedPrompt).toContain('<!-- Skill: deployment-vercel');
      expect(result.augmentedPrompt).toContain('<!-- /Skill: deployment-vercel -->');
      expect(result.augmentedPrompt).toContain('<!-- Injected Skills -->');
      expect(result.injectedSkills.length).toBeGreaterThan(0);
      expect(result.totalSkillTokens).toBeGreaterThan(0);
    });

    it('should include relevance score in delimiter', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.1,
      });
      await registry.initialize();

      const result = await registry.injectSkills(
        'Base prompt.',
        'deploy to Vercel hosting',
      );

      // Should contain relevance score
      expect(result.augmentedPrompt).toMatch(/<!-- Skill: deployment-vercel \(relevance: [\d.]+\) -->/);
    });

    it('should respect maxTokenBudget', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.01,
        maxTokenBudget: 50, // Very small budget
      });
      await registry.initialize();

      const result = await registry.injectSkills(
        'Base prompt.',
        'deploy TypeScript database',
      );

      expect(result.totalSkillTokens).toBeLessThanOrEqual(50);
      // Some skills should be excluded due to budget
      if (result.excludedSkills.length > 0) {
        expect(result.excludedSkills[0].reason).toContain('Token budget exceeded');
      }
    });

    it('should return original prompt when no skills match', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        minRelevance: 0.99,
      });
      await registry.initialize();

      const basePrompt = 'You are a helpful assistant.';
      const result = await registry.injectSkills(basePrompt, 'xyznonexistent');

      expect(result.augmentedPrompt).toBe(basePrompt);
      expect(result.injectedSkills).toEqual([]);
      expect(result.totalSkillTokens).toBe(0);
    });

    it('should inject multiple skills', async () => {
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        sessionTrustLevel: 'confidential',
        minRelevance: 0.01,
        maxSkills: 5,
        maxTokenBudget: 10000,
      });
      await registry.initialize();

      const result = await registry.injectSkills(
        'Base prompt.',
        'deploy database TypeScript security',
      );

      expect(result.injectedSkills.length).toBeGreaterThan(1);
    });
  });

  describe('reindex', () => {
    it('should reload skills from directory', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      const initialSize = registry.size;
      registry.reindex();

      expect(registry.size).toBe(initialSize);
    });
  });

  describe('accessors', () => {
    it('should get skill by ID', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      const skill = registry.getSkill('deployment-vercel');
      expect(skill).toBeDefined();
      expect(skill!.frontmatter.name).toBe('deployment-vercel');
    });

    it('should return undefined for unknown skill', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      expect(registry.getSkill('nonexistent')).toBeUndefined();
    });

    it('should list all skills', async () => {
      registry = new SkillRegistry({ skillsDir: FIXTURES_DIR });
      await registry.initialize();

      const skills = registry.getSkills();
      expect(skills.length).toBe(5);
      expect(skills.every((s) => s.frontmatter.name)).toBe(true);
    });
  });

  describe('custom token counter', () => {
    it('should use custom token counter', async () => {
      const customCounter = (text: string) => text.split(' ').length;
      registry = new SkillRegistry({
        skillsDir: FIXTURES_DIR,
        tokenCounter: customCounter,
      });
      await registry.initialize();

      const skills = registry.getSkills();
      // With word-count tokenizer, counts will differ from char/4
      for (const skill of skills) {
        expect(skill.tokenCount).toBeGreaterThan(0);
      }
    });
  });
});

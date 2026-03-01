/**
 * Dynamic Skill Injection Module
 *
 * Provides automatic skill discovery, relevance-based search,
 * and injection into system prompts.
 *
 * @packageDocumentation
 */

export {
  SkillRegistry,
  type SkillRegistryConfig,
  type Skill,
  type SkillFrontmatter,
  type SkillSearchResult,
  type SkillInjectionResult,
  type TrustLevel,
} from './skill-registry.js';

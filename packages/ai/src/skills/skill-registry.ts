/**
 * Dynamic Skill Injection System
 *
 * Watches a directory of `.md` skill files, parses YAML frontmatter,
 * indexes content for semantic search, and injects relevant skills
 * into the system prompt per turn.
 *
 * @packageDocumentation
 */

import { readFileSync, readdirSync, existsSync, statSync, watch } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { FSWatcher } from 'node:fs';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Trust levels for skills — higher = more restrictive.
 */
export type TrustLevel = 'public' | 'internal' | 'restricted' | 'confidential';

/** Numeric ordering for trust levels */
const TRUST_LEVEL_ORDER: Record<TrustLevel, number> = {
  public: 0,
  internal: 1,
  restricted: 2,
  confidential: 3,
};

/**
 * Parsed YAML frontmatter from a skill `.md` file.
 */
export interface SkillFrontmatter {
  /** Skill name (required) */
  name: string;
  /** Short description (optional) */
  description?: string;
  /** Searchable tags */
  tags?: string[];
  /** Priority (higher = preferred when scores tie) */
  priority?: number;
  /** Tools this skill requires */
  requires_tools?: string[];
  /** Minimum trust level to use this skill */
  trust_level?: TrustLevel;
}

/**
 * A loaded skill with parsed content and metadata.
 */
export interface Skill {
  /** Unique ID derived from filename */
  id: string;
  /** Parsed frontmatter */
  frontmatter: SkillFrontmatter;
  /** Raw markdown body (after frontmatter) */
  body: string;
  /** Approximate token count of body */
  tokenCount: number;
  /** Source file path */
  sourcePath: string;
  /** Last modified time */
  lastModified: Date;
}

/**
 * Result from a skill search.
 */
export interface SkillSearchResult {
  skill: Skill;
  /** Relevance score 0-1 */
  relevance: number;
}

/**
 * Configuration for the SkillRegistry.
 */
export interface SkillRegistryConfig {
  /** Directory containing `.md` skill files */
  skillsDir: string;
  /** Maximum number of skills to return per query (default: 3) */
  maxSkills?: number;
  /** Minimum relevance threshold 0-1 (default: 0.6) */
  minRelevance?: number;
  /** Maximum total tokens for injected skills (default: 2000) */
  maxTokenBudget?: number;
  /** Session trust level (default: 'public') */
  sessionTrustLevel?: TrustLevel;
  /** Watch for file changes (default: false) */
  watch?: boolean;
  /** Custom token counter (default: chars÷4) */
  tokenCounter?: (text: string) => number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result of injecting skills into a system prompt.
 */
export interface SkillInjectionResult {
  /** The augmented system prompt */
  augmentedPrompt: string;
  /** Skills that were injected */
  injectedSkills: SkillSearchResult[];
  /** Total tokens used by injected skills */
  totalSkillTokens: number;
  /** Skills that were excluded (over budget or trust level) */
  excludedSkills: Array<{ skill: Skill; reason: string }>;
}

/* ------------------------------------------------------------------ */
/*  SkillRegistry                                                      */
/* ------------------------------------------------------------------ */

/**
 * Registry that loads, indexes, and retrieves skills from a directory
 * of markdown files with YAML frontmatter.
 *
 * @example
 * ```typescript
 * const registry = new SkillRegistry({ skillsDir: './.claude/skills' });
 * await registry.initialize();
 *
 * // Search for relevant skills
 * const results = await registry.search('How do I deploy to Vercel?');
 *
 * // Inject into system prompt
 * const injection = await registry.injectSkills(basePrompt, 'deploy to vercel');
 * console.log(injection.augmentedPrompt);
 * ```
 */
export class SkillRegistry {
  private config: Required<Omit<SkillRegistryConfig, 'watch' | 'debug'>> & {
    watch: boolean;
    debug: boolean;
  };
  private skills: Map<string, Skill> = new Map();
  private watcher: FSWatcher | null = null;
  private initialized = false;

  /** Term frequency index for BM25-like scoring */
  private termIndex: Map<string, Map<string, number>> = new Map(); // term -> { skillId -> tf }
  private documentFrequency: Map<string, number> = new Map(); // term -> df

  constructor(config: SkillRegistryConfig) {
    this.config = {
      skillsDir: config.skillsDir,
      maxSkills: config.maxSkills ?? 3,
      minRelevance: config.minRelevance ?? 0.6,
      maxTokenBudget: config.maxTokenBudget ?? 2000,
      sessionTrustLevel: config.sessionTrustLevel ?? 'public',
      watch: config.watch ?? false,
      debug: config.debug ?? false,
      tokenCounter: config.tokenCounter ?? ((text: string) => Math.ceil(text.length / 4)),
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Initialization                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Load all `.md` files from skillsDir and build the search index.
   * Call this once before using `search()` or `injectSkills()`.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.loadAllSkills();
    this.buildTermIndex();

    if (this.config.watch) {
      this.startWatcher();
    }

    this.initialized = true;

    if (this.config.debug) {
      console.log(`[SkillRegistry] Initialized with ${this.skills.size} skills`);
    }
  }

  /**
   * Stop watching for file changes and clean up.
   */
  close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  File Loading                                                     */
  /* ---------------------------------------------------------------- */

  private loadAllSkills(): void {
    const dir = this.config.skillsDir;
    if (!existsSync(dir)) {
      if (this.config.debug) {
        console.warn(`[SkillRegistry] Skills directory not found: ${dir}`);
      }
      return;
    }

    const entries = this.walkMarkdownFiles(dir);
    for (const filePath of entries) {
      this.loadSkillFile(filePath);
    }
  }

  private walkMarkdownFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.walkMarkdownFiles(fullPath));
        } else if (entry.isFile() && (extname(entry.name) === '.md' || extname(entry.name) === '.markdown')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
    return results;
  }

  private loadSkillFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const stat = statSync(filePath);
      const { frontmatter, body } = this.parseFrontmatter(content);

      if (!frontmatter.name) {
        // Use filename as name if not specified
        frontmatter.name = basename(filePath, extname(filePath));
      }

      const id = this.filePathToId(filePath);
      const skill: Skill = {
        id,
        frontmatter,
        body,
        tokenCount: this.config.tokenCounter(body),
        sourcePath: filePath,
        lastModified: stat.mtime,
      };

      this.skills.set(id, skill);

      if (this.config.debug) {
        console.log(`[SkillRegistry] Loaded skill: ${frontmatter.name} (${skill.tokenCount} tokens)`);
      }
    } catch (error) {
      if (this.config.debug) {
        console.error(`[SkillRegistry] Failed to load skill: ${filePath}`, error);
      }
    }
  }

  private filePathToId(filePath: string): string {
    return filePath
      .replace(this.config.skillsDir, '')
      .replace(/^\//, '')
      .replace(/\.(md|markdown)$/, '')
      .replace(/\//g, '-')
      .toLowerCase();
  }

  /* ---------------------------------------------------------------- */
  /*  Frontmatter Parsing                                              */
  /* ---------------------------------------------------------------- */

  private parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!fmMatch) {
      return {
        frontmatter: { name: '' },
        body: content.trim(),
      };
    }

    const yamlBlock = fmMatch[1];
    const body = fmMatch[2].trim();
    const frontmatter = this.parseYamlSimple(yamlBlock);

    return { frontmatter, body };
  }

  /**
   * Simple YAML parser for frontmatter (handles flat key-value pairs and arrays).
   * Avoids introducing a YAML dependency.
   */
  private parseYamlSimple(yaml: string): SkillFrontmatter {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');
    let currentKey = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Array item (- value)
      if (trimmed.startsWith('- ') && currentKey) {
        const value = trimmed.slice(2).trim().replace(/^['"]|['"]$/g, '');
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        (result[currentKey] as string[]).push(value);
        continue;
      }

      // Key-value pair
      const kvMatch = trimmed.match(/^(\w[\w_-]*)\s*:\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        let value: unknown = kvMatch[2].trim().replace(/^['"]|['"]$/g, '');

        // Handle inline arrays: [a, b, c]
        if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
          value = value
            .slice(1, -1)
            .split(',')
            .map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
          currentKey = '';
        } else if (value === '' || value === undefined) {
          // Next lines may be array items
          currentKey = key;
          result[key] = [];
          continue;
        } else {
          currentKey = key;
          // Parse numbers
          if (/^\d+(\.\d+)?$/.test(value as string)) {
            value = Number(value);
          }
        }

        result[key] = value;
      }
    }

    return {
      name: (result.name as string) || '',
      description: result.description as string | undefined,
      tags: result.tags as string[] | undefined,
      priority: result.priority as number | undefined,
      requires_tools: result.requires_tools as string[] | undefined,
      trust_level: result.trust_level as TrustLevel | undefined,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Term Index (BM25-like scoring)                                   */
  /* ---------------------------------------------------------------- */

  private buildTermIndex(): void {
    this.termIndex.clear();
    this.documentFrequency.clear();

    for (const [skillId, skill] of this.skills) {
      const terms = this.tokenize(
        `${skill.frontmatter.name} ${skill.frontmatter.description || ''} ${(skill.frontmatter.tags || []).join(' ')} ${skill.body}`,
      );

      const termFreq = new Map<string, number>();
      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
      }

      for (const [term, count] of termFreq) {
        if (!this.termIndex.has(term)) {
          this.termIndex.set(term, new Map());
        }
        this.termIndex.get(term)!.set(skillId, count);
        this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
      }
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  /* ---------------------------------------------------------------- */
  /*  Search                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Search for skills relevant to a query.
   * Uses BM25-like scoring over skill content and metadata.
   *
   * @param query - Natural language query
   * @param options - Override maxSkills and minRelevance for this call
   * @returns Sorted results above the relevance threshold
   */
  async search(
    query: string,
    options?: { maxSkills?: number; minRelevance?: number; trustLevel?: TrustLevel },
  ): Promise<SkillSearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const maxSkills = options?.maxSkills ?? this.config.maxSkills;
    const minRelevance = options?.minRelevance ?? this.config.minRelevance;
    const trustLevel = options?.trustLevel ?? this.config.sessionTrustLevel;

    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const N = this.skills.size;
    if (N === 0) return [];

    const scores: Array<{ skillId: string; score: number }> = [];

    // BM25 parameters
    const k1 = 1.2;
    const b = 0.75;

    // Calculate average document length
    let totalLen = 0;
    for (const skill of this.skills.values()) {
      totalLen += this.tokenize(
        `${skill.frontmatter.name} ${skill.frontmatter.description || ''} ${(skill.frontmatter.tags || []).join(' ')} ${skill.body}`,
      ).length;
    }
    const avgDl = totalLen / N;

    for (const [skillId, skill] of this.skills) {
      // Trust level filter
      if (!this.passesTrustFilter(skill, trustLevel)) continue;

      let score = 0;
      const docTerms = this.tokenize(
        `${skill.frontmatter.name} ${skill.frontmatter.description || ''} ${(skill.frontmatter.tags || []).join(' ')} ${skill.body}`,
      );
      const dl = docTerms.length;

      for (const term of queryTerms) {
        const tf = this.termIndex.get(term)?.get(skillId) || 0;
        if (tf === 0) continue;

        const df = this.documentFrequency.get(term) || 0;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDl)));

        score += idf * tfNorm;
      }

      // Boost for name/tag exact match
      const nameLower = skill.frontmatter.name.toLowerCase();
      const tagsLower = (skill.frontmatter.tags || []).map((t) => t.toLowerCase());
      for (const term of queryTerms) {
        if (nameLower.includes(term)) score *= 1.3;
        if (tagsLower.some((t) => t.includes(term))) score *= 1.15;
      }

      // Priority boost
      if (skill.frontmatter.priority) {
        score *= 1 + skill.frontmatter.priority * 0.05;
      }

      if (score > 0) {
        scores.push({ skillId, score });
      }
    }

    // Normalize scores to 0-1
    if (scores.length === 0) return [];
    const maxScore = Math.max(...scores.map((s) => s.score));
    const normalized = scores.map((s) => ({
      skillId: s.skillId,
      relevance: maxScore > 0 ? s.score / maxScore : 0,
    }));

    // Filter by min relevance, sort descending, take top K
    return normalized
      .filter((s) => s.relevance >= minRelevance)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxSkills)
      .map((s) => ({
        skill: this.skills.get(s.skillId)!,
        relevance: Math.round(s.relevance * 100) / 100,
      }));
  }

  /* ---------------------------------------------------------------- */
  /*  Trust Level Filtering                                            */
  /* ---------------------------------------------------------------- */

  private passesTrustFilter(skill: Skill, sessionTrust: TrustLevel): boolean {
    const required = skill.frontmatter.trust_level || 'public';
    return TRUST_LEVEL_ORDER[sessionTrust] >= TRUST_LEVEL_ORDER[required];
  }

  /**
   * Update the session trust level.
   * Skills requiring higher trust will be excluded from search results.
   */
  setSessionTrustLevel(level: TrustLevel): void {
    this.config.sessionTrustLevel = level;
  }

  /* ---------------------------------------------------------------- */
  /*  Skill Injection                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Search for relevant skills and inject them into the system prompt.
   *
   * @param basePrompt - The base system prompt
   * @param query - The user's message or task description
   * @returns The augmented prompt with skill delimiters
   */
  async injectSkills(basePrompt: string, query: string): Promise<SkillInjectionResult> {
    const results = await this.search(query);
    const injected: SkillSearchResult[] = [];
    const excluded: Array<{ skill: Skill; reason: string }> = [];
    let totalTokens = 0;

    const skillBlocks: string[] = [];

    for (const result of results) {
      const skillTokens = result.skill.tokenCount;

      // Check token budget
      if (totalTokens + skillTokens > this.config.maxTokenBudget) {
        excluded.push({
          skill: result.skill,
          reason: `Token budget exceeded (${totalTokens + skillTokens} > ${this.config.maxTokenBudget})`,
        });
        continue;
      }

      // Build delimited skill block
      const header = `<!-- Skill: ${result.skill.frontmatter.name} (relevance: ${result.relevance}) -->`;
      const footer = `<!-- /Skill: ${result.skill.frontmatter.name} -->`;
      skillBlocks.push(`${header}\n${result.skill.body}\n${footer}`);

      totalTokens += skillTokens;
      injected.push(result);
    }

    let augmentedPrompt = basePrompt;
    if (skillBlocks.length > 0) {
      augmentedPrompt = `${basePrompt}\n\n<!-- Injected Skills -->\n${skillBlocks.join('\n\n')}\n<!-- /Injected Skills -->`;
    }

    return {
      augmentedPrompt,
      injectedSkills: injected,
      totalSkillTokens: totalTokens,
      excludedSkills: excluded,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  File Watcher                                                     */
  /* ---------------------------------------------------------------- */

  private startWatcher(): void {
    try {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      this.watcher = watch(
        this.config.skillsDir,
        { recursive: true },
        (_eventType, filename) => {
          if (!filename) return;
          if (!filename.endsWith('.md') && !filename.endsWith('.markdown')) return;

          // Debounce: re-index after 1500ms of no changes
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            this.reindex();
          }, 1500);
        },
      );

      if (this.config.debug) {
        console.log(`[SkillRegistry] Watching for changes in ${this.config.skillsDir}`);
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn(`[SkillRegistry] Failed to start watcher:`, error);
      }
    }
  }

  /**
   * Manually trigger a re-index of all skills.
   */
  reindex(): void {
    this.skills.clear();
    this.loadAllSkills();
    this.buildTermIndex();

    if (this.config.debug) {
      console.log(`[SkillRegistry] Re-indexed ${this.skills.size} skills`);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Public Accessors                                                 */
  /* ---------------------------------------------------------------- */

  /** Get all loaded skills */
  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /** Get a skill by ID */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /** Get the number of loaded skills */
  get size(): number {
    return this.skills.size;
  }

  /** Check if initialized */
  get isInitialized(): boolean {
    return this.initialized;
  }
}

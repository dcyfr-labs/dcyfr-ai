/**
 * DCYFR Agent Capability Bootstrap Toolkit
 * TLP:CLEAR
 * 
 * Automated capability manifest generation system for new agent onboarding.
 * Analyzes agent definitions and generates capability manifests with intelligent
 * confidence score initialization and gradual validation support.
 * 
 * @version 1.0.0
 * @date 2026-02-14
 * @module dcyfr-ai/capability-bootstrap
 */

import type { AgentCapabilityManifest } from './types/agent-capabilities.js';

/**
 * Agent definition sources supported by the bootstrap system
 */
export type AgentSource = 
  | { type: 'markdown'; content: string; path?: string }
  | { type: 'typescript'; agentObject: any }
  | { type: 'json'; definition: any }
  | { type: 'file'; filePath: string };

/**
 * Capability detection configuration
 */
export interface CapabilityDetectionConfig {
  /**
   * Minimum keyword matches required to assign a capability (default: 2)
   */
  minimumKeywordMatches?: number;
  
  /**
   * Enable fuzzy matching for capability keywords (default: true)
   */
  fuzzyMatching?: boolean;
  
  /**
   * Custom capability keyword mappings to extend default detection
   */
  customKeywordMappings?: Record<string, string[]>;
  
  /**
   * Capabilities to always include regardless of detection (default: ['pattern_enforcement'])
   */
  mandatoryCapabilities?: string[];
  
  /**
   * Agent tier for specialized detection ('workspace' | 'production' | 'generic')
   */
  agentTier?: 'workspace' | 'production' | 'generic';
}

/**
 * Confidence score initialization configuration
 */
export interface ConfidenceInitConfig {
  /**
   * Initial confidence level for unvalidated capabilities (default: 0.50)
   */
  initialConfidence?: number;
  
  /**
   * Confidence boost for validated capabilities (default: 0.85)
   */
  validatedConfidence?: number;
  
  /**
   * Confidence boost for capabilities with successful completions (default: 0.92)
   */
  provenConfidence?: number;
  
  /**
   * Enable gradual validation approach with progressive confidence increases
   */
  gradualValidation?: boolean;
  
  /**
   * Number of successful completions needed to reach proven confidence
   */
  completionsForProvenStatus?: number;
}

/**
 * Bootstrap result metadata
 */
export interface BootstrapResult {
  /**
   * Agent identifier
   */
  agentId: string;
  
  /**
   * Generated capability manifest
   */
  manifest: AgentCapabilityManifest;
  
  /**
   * Detected capabilities with detection confidence
   */
  detectedCapabilities: Array<{
    capabilityId: string;
    detectionConfidence: number;
    matchedKeywords: string[];
  }>;
  
  /**
   * Bootstrap warnings (non-fatal issues)
   */
  warnings: string[];
  
  /**
   * Suggested next steps for improving the manifest
   */
  suggestions: string[];
}

/**
 * Agent analyzer that extracts metadata from various agent definition formats
 */
export class AgentAnalyzer {
  /**
   * Analyze an agent from any supported source format
   */
  async analyze(source: AgentSource): Promise<{
    name: string;
    description: string;
    content: string;
    metadata: Record<string, any>;
  }> {
    switch (source.type) {
      case 'markdown':
        return this.analyzeMarkdown(source.content, source.path);
      case 'typescript':
        return this.analyzeTypeScript(source.agentObject);
      case 'json':
        return this.analyzeJSON(source.definition);
      case 'file':
        return this.analyzeFile(source.filePath);
      default:
        throw new Error(`Unsupported agent source type: ${(source as any).type}`);
    }
  }
  
  /**
   * Parse Markdown agent definitions (Claude .agent.md format)
   */
  private async analyzeMarkdown(content: string, path?: string): Promise<{
    name: string;
    description: string;
    content: string;
    metadata: Record<string, any>;
  }> {
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const metadata: Record<string, any> = {};
    
    if (frontmatterMatch) {
      const frontmatterLines = frontmatterMatch[1].split('\n');
      for (const line of frontmatterLines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          metadata[key.trim()] = value;
        }
      }
    }
    
    // Extract name and description
    const name = metadata.name || this.extractNameFromPath(path) || 'unknown-agent';
    const description = metadata.description || this.extractDescription(content) || '';
    
    return {
      name,
      description,
      content,
      metadata,
    };
  }
  
  /**
   * Parse TypeScript agent objects
   */
  private async analyzeTypeScript(agentObject: any): Promise<{
    name: string;
    description: string;
    content: string;
    metadata: Record<string, any>;
  }> {
    return {
      name: agentObject.name || agentObject.id || 'unknown-agent',
      description: agentObject.description || '',
      content: JSON.stringify(agentObject, null, 2),
      metadata: { ...agentObject },
    };
  }
  
  /**
   * Parse JSON agent definitions
   */
  private async analyzeJSON(definition: any): Promise<{
    name: string;
    description: string;
    content: string;
    metadata: Record<string, any>;
  }> {
    return {
      name: definition.name || definition.id || 'unknown-agent',
      description: definition.description || '',
      content: JSON.stringify(definition, null, 2),
      metadata: { ...definition },
    };
  }
  
  /**
   * Read and analyze agent from file path
   */
  private async analyzeFile(filePath: string): Promise<{
    name: string;
    description: string;
    content: string;
    metadata: Record<string, any>;
  }> {
    const { readFile } = await import('fs/promises');
    const content = await readFile(filePath, 'utf-8');
    
    if (filePath.endsWith('.md')) {
      return this.analyzeMarkdown(content, filePath);
    } else if (filePath.endsWith('.json')) {
      return this.analyzeJSON(JSON.parse(content));
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      // For TypeScript/JavaScript files, we'd need to actually import/parse them
      // For now, treat as markdown-like content
      return this.analyzeMarkdown(content, filePath);
    } else {
      throw new Error(`Unsupported file type: ${filePath}`);
    }
  }
  
  /**
   * Extract agent name from file path
   */
  private extractNameFromPath(path?: string): string | null {
    if (!path) return null;
    const fileName = path.split('/').pop() || '';
    return fileName.replace(/\.(md|ts|js|json)$/, '');
  }
  
  /**
   * Extract description from content (first paragraph or summary)
   */
  private extractDescription(content: string): string | null {
    // Look for first paragraph after frontmatter
    const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    const firstParagraph = withoutFrontmatter.trim().split('\n\n')[0];
    
    if (firstParagraph && firstParagraph.length < 300) {
      return firstParagraph.replace(/^#+\s*/, '').trim();
    }
    
    return null;
  }
}

/**
 * Capability detector with intelligent keyword-based analysis
 */
export class CapabilityDetector {
  private config: Required<CapabilityDetectionConfig>;
  
  /**
   * Default capability keyword mappings (extended from bootstrap scripts)
   */
  private static readonly DEFAULT_KEYWORDS: Record<string, string[]> = {
    // Production capabilities
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
    
    // Core capabilities
    code_generation: [
      'code', 'component', 'implementation', 'generate', 'develop', 'build'
    ],
    pattern_enforcement: [
      'pattern', 'architecture', 'enforce', 'convention', 'standard', 'compliance'
    ],
    performance_optimization: [
      'performance', 'optimization', 'speed', 'lighthouse', 'Core Web Vitals', 'bundle'
    ],
    security_scanning: [
      'security', 'vulnerability', 'audit', 'OWASP', 'penetration', 'threat'
    ],
    accessibility_audit: [
      'accessibility', 'a11y', 'WCAG', 'screen reader', 'inclusive', 'contrast'
    ],
    test_generation: [
      'unit test', 'integration test', 'test suite', 'test coverage', 'TDD'
    ],
    design_token_enforcement: [
      'design token', 'token validation', 'style compliance', 'CSS tokens'
    ],
    mcp_server_development: [
      'MCP', 'Model Context Protocol', 'server development', 'protocol implementation'
    ],
    prompt_engineering: [
      'prompt', 'prompt design', 'prompt optimization', 'LLM prompting'
    ],
  };
  
  constructor(config?: CapabilityDetectionConfig) {
    this.config = {
      minimumKeywordMatches: config?.minimumKeywordMatches ?? 2,
      fuzzyMatching: config?.fuzzyMatching ?? true,
      customKeywordMappings: config?.customKeywordMappings ?? {},
      mandatoryCapabilities: config?.mandatoryCapabilities ?? ['pattern_enforcement'],
      agentTier: config?.agentTier ?? 'generic',
    };
  }
  
  /**
   * Detect capabilities from analyzed agent content
   */
  detect(
    agentContent: string,
    agentName: string,
  ): Array<{ capabilityId: string; detectionConfidence: number; matchedKeywords: string[] }> {
    const capabilities: Array<{ capabilityId: string; detectionConfidence: number; matchedKeywords: string[] }> = [];
    const contentLower = agentContent.toLowerCase();
    const nameLower = agentName.toLowerCase();
    
    // Merge default and custom keyword mappings
    const allKeywordMappings = {
      ...CapabilityDetector.DEFAULT_KEYWORDS,
      ...this.config.customKeywordMappings,
    };
    
    // Check each capability for keyword matches
    for (const [capabilityId, keywords] of Object.entries(allKeywordMappings)) {
      const matchedKeywords: string[] = [];
      
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        
        if (this.config.fuzzyMatching) {
          // Fuzzy matching: check if content contains keyword or keyword is in content
          if (contentLower.includes(keywordLower)) {
            matchedKeywords.push(keyword);
          }
        } else {
          // Exact matching: word boundary required
          const regex = new RegExp(`\\b${this.escapeRegex(keywordLower)}\\b`, 'i');
          if (regex.test(contentLower)) {
            matchedKeywords.push(keyword);
          }
        }
      }
      
      // Calculate detection confidence based on keyword matches
      const matchCount = matchedKeywords.length;
      const totalKeywords = keywords.length;
      const detectionConfidence = Math.min(matchCount / totalKeywords, 1.0);
      
      // Apply capability detection rules
      if (matchCount >= this.config.minimumKeywordMatches) {
        capabilities.push({ capabilityId, detectionConfidence, matchedKeywords });
      }
      // Special case: agent name matches capability
      else if (matchCount >= 1) {
        if (nameLower.includes(capabilityId.replace(/_/g, '-')) || 
            nameLower.includes(capabilityId.replace(/_/g, ' '))) {
          capabilities.push({ 
            capabilityId, 
            detectionConfidence: 0.75, 
            matchedKeywords: [...matchedKeywords, `name:${agentName}`] 
          });
        }
      }
    }
    
    // Add mandatory capabilities if not already detected
    for (const mandatoryCapability of this.config.mandatoryCapabilities) {
      if (!capabilities.some(c => c.capabilityId === mandatoryCapability)) {
        capabilities.push({
          capabilityId: mandatoryCapability,
          detectionConfidence: 1.0,
          matchedKeywords: ['mandatory'],
        });
      }
    }
    
    return capabilities;
  }
  
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Confidence score initializer with gradual validation support
 */
export class ConfidenceInitializer {
  private config: Required<ConfidenceInitConfig>;
  
  constructor(config?: ConfidenceInitConfig) {
    this.config = {
      initialConfidence: config?.initialConfidence ?? 0.50,
      validatedConfidence: config?.validatedConfidence ?? 0.85,
      provenConfidence: config?.provenConfidence ?? 0.92,
      gradualValidation: config?.gradualValidation ?? true,
      completionsForProvenStatus: config?.completionsForProvenStatus ?? 10,
    };
  }
  
  /**
   * Initialize confidence score based on detection confidence and validation status
   */
  initializeConfidence(
    detectionConfidence: number,
    hasValidation: boolean = false,
    successfulCompletions: number = 0,
  ): number {
    // If agent has proven track record
    if (successfulCompletions >= this.config.completionsForProvenStatus) {
      return this.config.provenConfidence;
    }
    
    // If agent has validation but not proven yet
    if (hasValidation) {
      if (this.config.gradualValidation && successfulCompletions > 0) {
        // Gradual confidence increase based on completions
        const progressRatio = successfulCompletions / this.config.completionsForProvenStatus;
        const confidenceRange = this.config.provenConfidence - this.config.validatedConfidence;
        return this.config.validatedConfidence + (confidenceRange * progressRatio);
      }
      return this.config.validatedConfidence;
    }
    
    // New/unvalidated agent: use detection confidence weighted with initial baseline
    const baselineWeight = 0.7;
    const detectionWeight = 0.3;
    return (this.config.initialConfidence * baselineWeight) + (detectionConfidence * detectionWeight);
  }
  
  /**
   * Get validation recommendations for improving confidence
   */
  getValidationRecommendations(
    currentConfidence: number,
    successfulCompletions: number,
  ): string[] {
    const recommendations: string[] = [];
    
    if (currentConfidence < this.config.validatedConfidence) {
      recommendations.push(
        `Add validation tests to increase confidence from ${currentConfidence.toFixed(2)} to ${this.config.validatedConfidence}`
      );
    }
    
    if (successfulCompletions < this.config.completionsForProvenStatus) {
      const remaining = this.config.completionsForProvenStatus - successfulCompletions;
      recommendations.push(
        `Complete ${remaining} more successful tasks to reach proven status (${this.config.provenConfidence} confidence)`
      );
    }
    
    if (this.config.gradualValidation && currentConfidence < this.config.provenConfidence) {
      recommendations.push(
        'Enable gradual validation to track progressive confidence improvements with each successful completion'
      );
    }
    
    return recommendations;
  }
}

/**
 * Complete capability bootstrap toolkit
 */
export class CapabilityBootstrap {
  private analyzer: AgentAnalyzer;
  private detector: CapabilityDetector;
  private confidenceInit: ConfidenceInitializer;
  
  constructor(
    detectionConfig?: CapabilityDetectionConfig,
    confidenceConfig?: ConfidenceInitConfig,
  ) {
    this.analyzer = new AgentAnalyzer();
    this.detector = new CapabilityDetector(detectionConfig);
    this.confidenceInit = new ConfidenceInitializer(confidenceConfig);
  }
  
  /**
   * Bootstrap a new agent from any supported source
   */
  async bootstrap(source: AgentSource): Promise<BootstrapResult> {
    // Step 1: Analyze agent source
    const analyzed = await this.analyzer.analyze(source);
    
    // Step 2: Detect capabilities
    const detected = this.detector.detect(analyzed.content, analyzed.name);
    
    // Step 3: Generate capability manifest
    const { generateCapabilityManifest } = await import('./capability-manifest-generator.js');
    
    const agentObject = {
      manifest: {
        name: analyzed.name,
        description: analyzed.description,
        capabilities: detected.map(d => d.capabilityId),
        ...analyzed.metadata,
      },
    };
    
    const manifest = generateCapabilityManifest(agentObject) as AgentCapabilityManifest;
    
    // Step 4: Initialize confidence scores
    manifest.capabilities = manifest.capabilities.map((capability, index) => {
      const detectedCapability = detected[index];
      const initializedConfidence = this.confidenceInit.initializeConfidence(
        detectedCapability?.detectionConfidence ?? 0.5,
        false, // No validation by default for new agents
        0, // No successful completions yet
      );
      
      // Ensure confidence is always a valid number
      const validConfidence = isNaN(initializedConfidence) ? 0.5 : 
                             Math.max(0, Math.min(1, initializedConfidence));
      
      return {
        ...capability,
        confidence_level: validConfidence,
      };
    });
    
    // Step 5: Calculate overall confidence with NaN protection
    const validCapabilities = manifest.capabilities.filter(c => 
      c.confidence_level !== undefined && !isNaN(c.confidence_level));
    
    const avgConfidence = validCapabilities.length > 0 ? 
      validCapabilities.reduce((sum, c) => sum + c.confidence_level, 0) / validCapabilities.length : 
      0.5; // Default confidence when no valid capabilities
      
    manifest.overall_confidence = avgConfidence;
    
    // Step 6: Generate warnings and suggestions
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    if (detected.length === 0) {
      warnings.push('No capabilities detected - agent may need manual capability assignment');
    }
    
    if (detected.length === 1 && detected[0].capabilityId === 'pattern_enforcement') {
      suggestions.push('Consider adding more specific capability keywords to agent description');
    }
    
    if (avgConfidence < 0.60) {
      suggestions.push('Low overall confidence - add validation tests to improve confidence scores');
    }
    
    // Add validation recommendations
    suggestions.push(...this.confidenceInit.getValidationRecommendations(avgConfidence, 0));
    
    return {
      agentId: analyzed.name,
      manifest,
      detectedCapabilities: detected,
      warnings,
      suggestions,
    };
  }
  
  /**
   * Bootstrap multiple agents in batch
   */
  async bootstrapBatch(sources: AgentSource[]): Promise<BootstrapResult[]> {
    const results: BootstrapResult[] = [];
    
    for (const source of sources) {
      try {
        const result = await this.bootstrap(source);
        results.push(result);
      } catch (error) {
        console.error(`Failed to bootstrap agent from source:`, error);
        // Continue with other agents
      }
    }
    
    return results;
  }
}

/**
 * Default bootstrap instance with standard configuration
 */
export const defaultBootstrap = new CapabilityBootstrap();

/**
 * Bootstrap an agent with default configuration
 */
export async function bootstrapAgent(source: AgentSource): Promise<BootstrapResult> {
  return defaultBootstrap.bootstrap(source);
}

/**
 * Bootstrap multiple agents with default configuration
 */
export async function bootstrapAgents(sources: AgentSource[]): Promise<BootstrapResult[]> {
  return defaultBootstrap.bootstrapBatch(sources);
}

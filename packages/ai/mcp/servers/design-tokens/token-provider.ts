/**
 * TokenProvider Interface
 *
 * Abstraction for design token sources to decouple Design Token MCP from dcyfr-labs.
 * Implementations provide token categories and definitions from design systems.
 */

export interface TokenCategory {
  name: string;
  tokens: Record<string, string | number>;
  patterns: RegExp[];
  description: string;
}

export interface TokenViolation {
  type: 'hardcoded-value' | 'missing-token' | 'incorrect-pattern';
  className: string;
  suggestion?: string;
  category?: string;
  line?: number;
}

export interface ValidationResult {
  isValid: boolean;
  violations: TokenViolation[];
  compliance: number;
  suggestions: string[];
}

export interface TokenSuggestion {
  hardcodedValue: string;
  category: string;
  suggestions: string[];
  recommended: string | null;
}

export interface ComplianceReport {
  percentage: number;
  totalFiles: number;
  totalViolations: number;
  fileBreakdown?: Record<string, number>;
}

/**
 * TokenProvider interface for abstracting design token sources
 */
export interface TokenProvider {
  /**
   * Get all token categories with patterns and descriptions
   */
  getTokenCategories(): TokenCategory[];

  /**
   * Get spacing tokens (for numeric value suggestions)
   */
  getSpacingTokens(): Record<string, number>;

  /**
   * Get import statement for tokens (used in suggestions)
   */
  getTokenImportStatement(): string;

  /**
   * Get documentation URL for design tokens
   */
  getDocumentationUrl(): string;
}

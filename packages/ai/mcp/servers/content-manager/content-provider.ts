/**
 * ContentProvider Interface
 *
 * Abstraction for content sources to decouple Content Manager MCP from dcyfr-labs.
 * Implementations can read from filesystem, database, CMS, or any other source.
 */

export interface ContentMetadata {
  title: string;
  description?: string;
  date?: string;
  tags?: string[];
  category?: string;
  published?: boolean;
  wordCount?: number;
  readingTime?: number;
}

export interface ContentItem {
  filePath: string;
  slug: string;
  type: 'blog' | 'project';
  metadata: ContentMetadata;
  excerpt?: string;
  body?: string;
}

export interface ContentSearchOptions {
  query?: string;
  tags?: string[];
  category?: string;
  limit?: number;
  includeUnpublished?: boolean;
}

/**
 * ContentProvider interface for abstracting content sources
 */
export interface ContentProvider {
  /**
   * List all content items of a given type
   */
  listContent(type: 'blog' | 'project', options?: ContentSearchOptions): Promise<ContentItem[]>;

  /**
   * Get a specific content item by slug
   */
  getContent(slug: string, type: 'blog' | 'project'): Promise<ContentItem | null>;

  /**
   * Search content by query string
   */
  searchContent(query: string, type?: 'blog' | 'project'): Promise<ContentItem[]>;

  /**
   * Get all unique tags across content
   */
  getTags(type?: 'blog' | 'project'): Promise<string[]>;

  /**
   * Get content by tag
   */
  getContentByTag(tag: string, type?: 'blog' | 'project'): Promise<ContentItem[]>;

  /**
   * Get content by category
   */
  getContentByCategory(category: string, type?: 'blog' | 'project'): Promise<ContentItem[]>;
}

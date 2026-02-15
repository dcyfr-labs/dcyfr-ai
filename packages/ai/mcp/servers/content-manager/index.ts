#!/usr/bin/env node
/**
 * Content Manager MCP Server
 *
 * Query and analyze MDX blog posts and project content for strategic insights.
 * AI assistants can discover content, analyze topics, and find related articles.
 *
 * Uses ContentProvider abstraction to decouple from specific content sources.
 * @see content-provider.ts for the provider interface
 */

import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { SimpleCache } from '../shared/cache.js';
import { emitDelegationEvent } from '../shared/utils.js';
import type { ContentProvider, ContentItem, ContentMetadata } from './content-provider.js';

/**
 * Create Content Manager MCP Server with a content provider
 * @param provider - ContentProvider implementation for reading content
 */
export function createContentManagerServer(provider: ContentProvider) {
  const server = new FastMCP({
    name: 'dcyfr-content',
    version: '1.0.0',
    instructions:
      'Query and analyze MDX blog posts and project content. Use these tools to discover content, analyze topics, and find related articles.',
  });

  // Cache for content queries (5 minutes)
  const contentCache = new SimpleCache<ContentItem[]>(300000);
  const topicsCache = new SimpleCache<string[]>(300000);

  // ============================================================================
  // Tool 1: Query content
  // ============================================================================

  server.addTool({
    name: 'content:query',
    description: 'Search for blog posts or projects with optional query filter',
    parameters: z.object({
      type: z.enum(['blog', 'project']).describe('Content type to search'),
      query: z
        .string()
        .optional()
        .describe('Search query (searches title, description, tags, content)'),
      limit: z.number().default(20).describe('Maximum results to return'),
      // Delegation context (optional)
      delegationContext: z.object({
        contractId: z.string().optional().describe('Delegation contract ID'),
        delegatorAgentId: z.string().optional().describe('ID of delegating agent'),
        taskId: z.string().optional().describe('Task ID within delegation'),
      }).optional().describe('Delegation context for task tracking'),
    }),
    execute: async ({
      type,
      query,
      limit,
      delegationContext,
    }: {
      type: 'blog' | 'project';
      query?: string;
      limit?: number;
      delegationContext?: { contractId?: string; delegatorAgentId?: string; taskId?: string };
    }) => {
      // Emit delegation event if context provided
      emitDelegationEvent('tool_executed', 'content:query', delegationContext, {
        type,
        query,
        limit,
      });
      const cacheKey = `query:${type}:${query || 'all'}:${limit}`;
      let results = contentCache.get(cacheKey);

      if (!results) {
        results = await provider.listContent(type, { query, limit });
        contentCache.set(cacheKey, results);
      }

      return {
        type: 'text',
        text: JSON.stringify(
          {
            type,
            query: query || 'all',
            count: results.length,
            results: results.map((item) => ({
              slug: item.slug,
              title: item.metadata.title,
              description: item.metadata.description,
              date: item.metadata.date,
              tags: item.metadata.tags,
              category: item.metadata.category,
              readingTime: item.metadata.readingTime,
            })),
          },
          null,
          2
        ),
      };
    },
  });

  // ============================================================================
  // Tool 2: Analyze content
  // ============================================================================

  server.addTool({
    name: 'content:analyze',
    description: 'Get detailed analysis of a specific content item',
    parameters: z.object({
      slug: z.string().describe('Content slug to analyze'),
      type: z.enum(['blog', 'project']).describe('Content type'),
      // Delegation context (optional)
      delegationContext: z.object({
        contractId: z.string().optional().describe('Delegation contract ID'),
        delegatorAgentId: z.string().optional().describe('ID of delegating agent'),
        taskId: z.string().optional().describe('Task ID within delegation'),
      }).optional().describe('Delegation context for task tracking'),
    }),
    execute: async ({ 
      slug, 
      type,
      delegationContext 
    }: { 
      slug: string; 
      type: 'blog' | 'project';
      delegationContext?: { contractId?: string; delegatorAgentId?: string; taskId?: string };
    }) => {
      // Emit delegation event if context provided
      emitDelegationEvent('tool_executed', 'content:analyze', delegationContext, {
        slug,
        type,
      });
      const content = await provider.getContent(slug, type);

      if (!content) {
        return {
          type: 'text',
          text: JSON.stringify({ error: 'Content not found', slug, type }, null, 2),
        };
      }

      return {
        type: 'text',
        text: JSON.stringify(
          {
            slug: content.slug,
            type: content.type,
            metadata: content.metadata,
            excerpt: content.excerpt,
            filePath: content.filePath,
          },
          null,
          2
        ),
      };
    },
  });

  // ============================================================================
  // Tool 3: Find related content
  // ============================================================================

  server.addTool({
    name: 'content:findRelated',
    description: 'Find content related to a specific item by tags and topics',
    parameters: z.object({
      slug: z.string().describe('Reference content slug'),
      type: z.enum(['blog', 'project']).describe('Content type'),
      limit: z.number().default(5).describe('Maximum related items to return'),
      // Delegation context (optional)
      delegationContext: z.object({
        contractId: z.string().optional().describe('Delegation contract ID'),
        delegatorAgentId: z.string().optional().describe('ID of delegating agent'),
        taskId: z.string().optional().describe('Task ID within delegation'),
      }).optional().describe('Delegation context for task tracking'),
    }),
    execute: async ({
      slug,
      type,
      limit,
      delegationContext,
    }: {
      slug: string;
      type: 'blog' | 'project';
      limit?: number;
      delegationContext?: { contractId?: string; delegatorAgentId?: string; taskId?: string };
    }) => {
      // Emit delegation event if context provided
      emitDelegationEvent('tool_executed', 'content:findRelated', delegationContext, {
        slug,
        type,
        limit,
      });
      const content = await provider.getContent(slug, type);

      if (!content) {
        return {
          type: 'text',
          text: JSON.stringify({ error: 'Content not found', slug, type }, null, 2),
        };
      }

      const tags = content.metadata.tags || [];
      const allContent = await provider.listContent(type);

      // Score by tag overlap
      const scored = allContent
        .filter((item) => item.slug !== slug)
        .map((item) => {
          const itemTags = item.metadata.tags || [];
          const overlap = tags.filter((tag) => itemTags.includes(tag)).length;
          return { item, score: overlap };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit || 5)
        .map(({ item }) => item);

      return {
        type: 'text',
        text: JSON.stringify(
          {
            slug,
            relatedCount: scored.length,
            related: scored.map((item) => ({
              slug: item.slug,
              title: item.metadata.title,
              tags: item.metadata.tags,
            })),
          },
          null,
          2
        ),
      };
    },
  });

  // ============================================================================
  // Tool 4: Get topics
  // ============================================================================

  server.addTool({
    name: 'content:getTopics',
    description: 'Get topic taxonomy with content counts',
    parameters: z.object({
      type: z.enum(['blog', 'project']).optional().describe('Filter by content type'),
      // Delegation context (optional)
      delegationContext: z.object({
        contractId: z.string().optional().describe('Delegation contract ID'),
        delegatorAgentId: z.string().optional().describe('ID of delegating agent'),
        taskId: z.string().optional().describe('Task ID within delegation'),
      }).optional().describe('Delegation context for task tracking'),
    }),
    execute: async ({ 
      type,
      delegationContext 
    }: { 
      type?: 'blog' | 'project';
      delegationContext?: { contractId?: string; delegatorAgentId?: string; taskId?: string };
    }) => {
      // Emit delegation event if context provided
      emitDelegationEvent('tool_executed', 'content:getTopics', delegationContext, {
        type,
      });
      const cacheKey = `topics:${type || 'all'}`;
      let tags = topicsCache.get(cacheKey);

      if (!tags) {
        tags = await provider.getTags(type);
        topicsCache.set(cacheKey, tags);
      }

      return {
        type: 'text',
        text: JSON.stringify(
          {
            type: type || 'all',
            totalTopics: tags.length,
            topics: tags,
          },
          null,
          2
        ),
      };
    },
  });

  // ============================================================================
  // Tool 5: Search content
  // ============================================================================

  server.addTool({
    name: 'content:search',
    description: 'Full-text search across blog posts and projects',
    parameters: z.object({
      query: z.string().describe('Search query'),
      type: z.enum(['blog', 'project']).optional().describe('Filter by content type'),
    }),
    execute: async ({ query, type }: { query: string; type?: 'blog' | 'project' }) => {
      const results = await provider.searchContent(query, type);

      return {
        type: 'text',
        text: JSON.stringify(
          {
            query,
            type: type || 'all',
            count: results.length,
            results: results.slice(0, 20).map((item) => ({
              type: item.type,
              slug: item.slug,
              title: item.metadata.title,
              description: item.metadata.description,
              excerpt: item.excerpt,
              tags: item.metadata.tags,
            })),
          },
          null,
          2
        ),
      };
    },
  });

  // ============================================================================
  // Tool 6: Get content by tag
  // ============================================================================

  server.addTool({
    name: 'content:getByTag',
    description: 'Get all content with a specific tag',
    parameters: z.object({
      tag: z.string().describe('Tag to filter by'),
      type: z.enum(['blog', 'project']).optional().describe('Filter by content type'),
    }),
    execute: async ({ tag, type }: { tag: string; type?: 'blog' | 'project' }) => {
      const results = await provider.getContentByTag(tag, type);

      return {
        type: 'text',
        text: JSON.stringify(
          {
            tag,
            type: type || 'all',
            count: results.length,
            results: results.map((item) => ({
              slug: item.slug,
              title: item.metadata.title,
              type: item.type,
            })),
          },
          null,
          2
        ),
      };
    },
  });

  return server;
}

// ============================================================================
// Standalone server (requires provider to be passed in)
// ============================================================================

// For standalone execution, this file should not auto-start the server.
// Instead, create a startup script that instantiates the provider and server.
// See dcyfr-labs/src/mcp/start-content-server.ts for example.

export default createContentManagerServer;

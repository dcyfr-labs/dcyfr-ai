/**
 * mem0 Client Integration
 * 
 * Factory functions and utilities for initializing mem0 memory client.
 * Handles connection to vector database and LLM configuration.
 * 
 * @module @dcyfr/ai/memory/mem0-client
 */

import type { MemoryConfig, VectorDBConfig, LLMConfig } from './config.js';

/**
 * mem0 Memory Item result
 */
export interface MemoryItem {
  id: string;
  memory: string;
  hash?: string;
  createdAt?: string;
  updatedAt?: string;
  score?: number;
  metadata?: Record<string, any>;
}

/**
 * mem0 Message format
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * mem0 Search Result
 */
export interface SearchResult {
  results: MemoryItem[];
  relations?: any[];
}

/**
 * Add Memory Options
 */
export interface AddMemoryOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, any>;
}

/**
 * Search Memory Options
 */
export interface SearchMemoryOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  limit?: number;
  filters?: Record<string, any>;
}

/**
 * Delete All Memory Options
 */
export interface DeleteAllMemoryOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
}

/**
 * mem0 OSS Memory instance interface (from mem0ai/oss)
 */
export interface Mem0Client {
  add(messages: string | Message[], config: AddMemoryOptions): Promise<SearchResult>;
  search(query: string, config: SearchMemoryOptions): Promise<SearchResult>;
  get(memoryId: string): Promise<MemoryItem | null>;
  update(memoryId: string, data: string): Promise<{ message: string }>;
  delete(memoryId: string): Promise<{ message: string }>;
  deleteAll(config: DeleteAllMemoryOptions): Promise<{ message:string }>;
}

/**
 * mem0 OSS configuration object (matches mem0ai/oss structure)
 */
interface Mem0OSSConfig {
  version?: string;
  embedder: {
    provider: string;
    config: {
      apiKey?: string;
      model?: string;
      url?: string;
      embeddingDims?: number;
    };
  };
  vectorStore: {
    provider: string;
    config: {
      collectionName?: string;
      host?: string;
      port?: number;
      url?: string;
      apiKey?: string;
      dimension?: number;
    };
  };
  llm: {
    provider: string;
    config: {
      model?: string;
      apiKey?: string;
      baseURL?: string;
    };
  };
  disableHistory?: boolean;
}

/**
 * Determine embedding/vector dimensions from configured embedder provider.
 */
function resolveEmbeddingDimension(config: LLMConfig): number {
  if (config.embeddingDims) {
    return config.embeddingDims;
  }

  const provider = config.embeddingProvider || config.provider;

  // Sensible provider defaults for common models
  if (provider === 'ollama') {
    return 1024;
  }

  // OpenAI text-embedding-3-small default
  return 1536;
}

/**
 * Convert DCYFR VectorDBConfig to mem0 OSS vector_store config
 */
function buildVectorStoreConfig(
  config: VectorDBConfig,
  embeddingDimension: number
): Mem0OSSConfig['vectorStore'] {
  switch (config.provider) {
    case 'qdrant':
      const qdrantConfig: any = {
        collectionName: config.index || 'dcyfr_memories',
        dimension: embeddingDimension,
      };

      if (config.url) {
        // Qdrant client expects either URL or host/port, not both.
        qdrantConfig.url = config.url;
      }

      if (config.apiKey) {
        qdrantConfig.apiKey = config.apiKey;
      }

      return {
        provider: 'qdrant',
        config: qdrantConfig,
      };

    case 'pinecone':
      return {
        provider: 'pinecone',
        config: {
          apiKey: config.apiKey,
          collectionName: config.index || 'dcyfr-memories',
          dimension: embeddingDimension,
        },
      };

    case 'weaviate':
      const weaviateConfig: any = {
        collectionName: config.index || 'dcyfr_memories',
        dimension: embeddingDimension,
      };

      if (config.url) {
        weaviateConfig.url = config.url;
      }

      if (config.apiKey) {
        weaviateConfig.apiKey = config.apiKey;
      }

      return {
        provider: 'weaviate',
        config: weaviateConfig,
      };

    default:
      throw new Error(`Unsupported vector DB provider: ${config.provider}`);
  }
}

/**
 * Convert DCYFR LLMConfig to mem0 OSS llm config
 */
function buildLLMConfig(config: LLMConfig): Mem0OSSConfig['llm'] {
  return {
    provider: config.provider,
    config: {
      model: config.model || 'gpt-4',
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    },
  };
}

/**
 * Convert DCYFR LLMConfig to mem0 OSS embedder config
 */
function buildEmbedderConfig(config: LLMConfig): Mem0OSSConfig['embedder'] {
  const provider = config.embeddingProvider || config.provider;

  // mem0 OSS embedder providers differ from LLM providers.
  // Fall back to OpenAI-compatible embeddings when no native embedder exists.
  const normalizedProvider = ['anthropic', 'groq', 'mistral'].includes(provider)
    ? 'openai'
    : provider;

  const defaultEmbeddingDims = normalizedProvider === 'ollama' ? 768 : 1536;

  return {
    provider: normalizedProvider,
    config: {
      model: config.embeddingModel || 'text-embedding-3-small',
      apiKey: config.embeddingApiKey || config.apiKey,
      url: config.embeddingBaseURL || (normalizedProvider === 'ollama' ? process.env.OLLAMA_URL : undefined),
      embeddingDims: config.embeddingDims || defaultEmbeddingDims,
    },
  };
}

/**
 * Create and initialize mem0 OSS client
 * 
 * This function:
 * 1. Converts DCYFR config to mem0 OSS config format
 * 2. Dynamically imports mem0ai/oss package
 * 3. Initializes Memory client with vector DB and LLM
 * 4. Tests connection (throws on failure)
 * 
 * @param config - DCYFR memory configuration
 * @returns Initialized mem0 Memory instance
 * @throws Error if mem0 initialization fails or connection test fails
 */
export async function createMem0Client(config: MemoryConfig): Promise<Mem0Client> {
  try {
    const embeddingDimension = resolveEmbeddingDimension(config.llm);

    // Build mem0 OSS configuration
    const mem0Config: Mem0OSSConfig = {
      version: 'v1.1',
      embedder: buildEmbedderConfig(config.llm),
      vectorStore: buildVectorStoreConfig(config.vectorDB, embeddingDimension),
      llm: buildLLMConfig(config.llm),
      disableHistory: true, // Disable history DB for simplicity
    };

    // Dynamic import of mem0ai/oss package
    const { Memory } = await import('mem0ai/oss');

    // Initialize client
    const client = new Memory(mem0Config);

    // Test connection with a simple search
    try {
      await client.search('_health_check', {
        userId: '_system',
        limit: 1,
      });
    } catch (error: any) {
      // If error is about connection, throw
      if (error.message?.includes('connection') || error.message?.includes('timeout')) {
        throw new Error(`mem0 connection test failed: ${error.message}`);
      }
      // Other errors (like no memories) are acceptable
    }

    return client as Mem0Client;
  } catch (error: any) {
    if (error.message?.includes('Cannot find module') || error.message?.includes('Cannot find package')) {
      throw new Error(
        'mem0ai runtime dependency missing. Ensure mem0ai and required provider SDKs (e.g. openai) are installed.\n' +
        'Original error: ' + error.message
      );
    }
    throw new Error(`Failed to initialize mem0 client: ${error.message}`);
  }
}

/**
 * Singleton mem0 client instance
 * Initialized lazily on first use
 */
let mem0ClientInstance: Mem0Client | null = null;
let mem0ClientConfigFingerprint: string | null = null;

function fingerprintConfig(config: MemoryConfig): string {
  return JSON.stringify(config);
}

/**
 * Get or create singleton mem0 client
 * 
 * Reuses existing client if already initialized, otherwise creates new one.
 * 
 * @param config - Memory configuration (required on first call)
 * @returns mem0 client instance
 * @throws Error if called without config before initialization
 */
export async function getMem0Client(config?: MemoryConfig): Promise<Mem0Client> {
  if (mem0ClientInstance) {
    if (!config) {
      return mem0ClientInstance;
    }

    const incomingFingerprint = fingerprintConfig(config);
    if (mem0ClientConfigFingerprint === incomingFingerprint) {
      return mem0ClientInstance;
    }

    // Runtime profile changed (provider/base URL/vector DB, etc) — recreate client.
    mem0ClientInstance = await createMem0Client(config);
    mem0ClientConfigFingerprint = incomingFingerprint;
    return mem0ClientInstance;
  }

  if (!config) {
    throw new Error('Memory configuration required for first-time initialization');
  }

  mem0ClientInstance = await createMem0Client(config);
  mem0ClientConfigFingerprint = fingerprintConfig(config);
  return mem0ClientInstance;
}

/**
 * Reset mem0 client singleton (for testing)
 */
export function resetMem0Client(): void {
  mem0ClientInstance = null;
  mem0ClientConfigFingerprint = null;
}

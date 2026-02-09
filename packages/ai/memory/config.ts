/**
 * Memory Layer Configuration Module
 * 
 * Loads and validates environment variables for mem0 memory integration.
 * Supports multiple vector database backends (Qdrant, Pinecone, Weaviate).
 * 
 * @module @dcyfr/ai/memory/config
 */

/**
 * Supported vector database providers
 */
export type VectorDBProvider = 'qdrant' | 'pinecone' | 'weaviate';

/**
 * Vector database configuration
 */
export interface VectorDBConfig {
  provider: VectorDBProvider;
  url?: string;           // For Qdrant, Weaviate
  apiKey?: string;        // For Pinecone, or authenticated Qdrant
  environment?: string;   // For Pinecone
  index?: string;         // Index/collection name
}

/**
 * LLM configuration for mem0 embeddings
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
}

/**
 * Complete memory system configuration
 */
export interface MemoryConfig {
  vectorDB: VectorDBConfig;
  llm: LLMConfig;
  caching?: {
    enabled: boolean;
    ttl: number;      // Time-to-live in seconds
    maxSize: number;  // Max cache entries
  };
}

/**
 * Default configuration for local development
 */
export const DEFAULT_CONFIG: MemoryConfig = {
  vectorDB: {
    provider: 'qdrant',
    url: 'http://localhost:6333',
    index: 'dcyfr_memories',
  },
  llm: {
    provider: 'openai',
    model: 'gpt-4',
    embeddingModel: 'text-embedding-3-small',
  },
  caching: {
    enabled: true,
    ttl: 300,        // 5 minutes
    maxSize: 1000,   // 1000 recent searches
  },
};

/**
 * Load memory configuration from environment variables
 * 
 * Environment variables:
 * - VECTOR_DB_PROVIDER: 'qdrant' | 'pinecone' | 'weaviate'
 * - VECTOR_DB_URL: Database URL (for Qdrant, Weaviate)
 * - VECTOR_DB_API_KEY: API key (for Pinecone, authenticated Qdrant)
 * - VECTOR_DB_ENVIRONMENT: Pinecone environment
 * - VECTOR_DB_INDEX: Index/collection name
 * - LLM_PROVIDER: 'openai' | 'anthropic' | 'custom'
 * - LLM_API_KEY: LLM API key (defaults to OPENAI_API_KEY if provider=openai)
 * - LLM_MODEL: Model name
 * - LLM_EMBEDDING_MODEL: Embedding model name
 * - MEMORY_CACHE_ENABLED: 'true' | 'false'
 * - MEMORY_CACHE_TTL: Cache TTL in seconds
 * - MEMORY_CACHE_MAX_SIZE: Max cache entries
 * 
 * @returns Complete memory configuration
 * @throws Error if required environment variables are missing
 */
export function loadMemoryConfig(): MemoryConfig {
  const env = process.env;

  // Vector DB configuration
  const vectorDBProvider = (env.VECTOR_DB_PROVIDER || 'qdrant') as VectorDBProvider;
  
  const vectorDBConfig: VectorDBConfig = {
    provider: vectorDBProvider,
    url: env.VECTOR_DB_URL,
    apiKey: env.VECTOR_DB_API_KEY,
    environment: env.VECTOR_DB_ENVIRONMENT,
    index: env.VECTOR_DB_INDEX || 'dcyfr_memories',
  };

  // Apply defaults based on provider
  if (vectorDBProvider === 'qdrant' && !vectorDBConfig.url) {
    vectorDBConfig.url = DEFAULT_CONFIG.vectorDB.url;
  }

  // LLM configuration
  const llmProvider = (env.LLM_PROVIDER || 'openai') as LLMConfig['provider'];
  const llmApiKey = env.LLM_API_KEY || (llmProvider === 'openai' ? env.OPENAI_API_KEY : undefined);

  const llmConfig: LLMConfig = {
    provider: llmProvider,
    apiKey: llmApiKey,
    model: env.LLM_MODEL || DEFAULT_CONFIG.llm.model,
    embeddingModel: env.LLM_EMBEDDING_MODEL || DEFAULT_CONFIG.llm.embeddingModel,
  };

  // Caching configuration
  const cachingConfig = {
    enabled: env.MEMORY_CACHE_ENABLED !== 'false', // Default true
    ttl: parseInt(env.MEMORY_CACHE_TTL || '300', 10),
    maxSize: parseInt(env.MEMORY_CACHE_MAX_SIZE || '1000', 10),
  };

  return {
    vectorDB: vectorDBConfig,
    llm: llmConfig,
    caching: cachingConfig,
  };
}

/**
 * Validate memory configuration
 * 
 * Ensures all required fields are present based on vector DB provider.
 * 
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid or missing required fields
 */
export function validateMemoryConfig(config: MemoryConfig): void {
  const { vectorDB, llm } = config;

  // Validate vector DB configuration
  if (!vectorDB.provider) {
    throw new Error('VECTOR_DB_PROVIDER is required');
  }

  switch (vectorDB.provider) {
    case 'qdrant':
      if (!vectorDB.url) {
        throw new Error('VECTOR_DB_URL is required for Qdrant');
      }
      break;

    case 'pinecone':
      if (!vectorDB.apiKey) {
        throw new Error('VECTOR_DB_API_KEY is required for Pinecone');
      }
      if (!vectorDB.environment) {
        throw new Error('VECTOR_DB_ENVIRONMENT is required for Pinecone');
      }
      break;

    case 'weaviate':
      if (!vectorDB.url) {
        throw new Error('VECTOR_DB_URL is required for Weaviate');
      }
      break;

    default:
      throw new Error(`Unsupported vector DB provider: ${vectorDB.provider}`);
  }

  // Validate LLM configuration
  if (!llm.provider) {
    throw new Error('LLM_PROVIDER is required');
  }

  if (llm.provider === 'openai' && !llm.apiKey) {
    throw new Error('LLM_API_KEY or OPENAI_API_KEY is required for OpenAI provider');
  }

  if (!llm.embeddingModel) {
    throw new Error('LLM_EMBEDDING_MODEL is required');
  }

  // Validate caching configuration
  if (config.caching) {
    if (config.caching.ttl <= 0) {
      throw new Error('MEMORY_CACHE_TTL must be greater than 0');
    }
    if (config.caching.maxSize <= 0) {
      throw new Error('MEMORY_CACHE_MAX_SIZE must be greater than 0');
    }
  }
}

/**
 * Get validated memory configuration
 * 
 * Convenience function that loads and validates configuration in one call.
 * 
 * @returns Validated memory configuration
 * @throws Error if configuration is invalid
 */
export function getMemoryConfig(): MemoryConfig {
  const config = loadMemoryConfig();
  validateMemoryConfig(config);
  return config;
}

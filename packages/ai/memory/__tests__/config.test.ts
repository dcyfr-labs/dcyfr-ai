/**
 * Unit tests for memory configuration module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadMemoryConfig,
  validateMemoryConfig,
  getMemoryConfig,
  DEFAULT_CONFIG,
  type MemoryConfig,
} from '../config.js';

describe('Memory Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadMemoryConfig', () => {
    it('loads default configuration when no env vars set', () => {
      const config = loadMemoryConfig();

      expect(config.vectorDB.provider).toBe('qdrant');
      expect(config.vectorDB.url).toBe('http://localhost:6333');
      expect(config.llm.provider).toBe('openai');
      expect(config.caching?.enabled).toBe(true);
    });

    it('loads Qdrant configuration from env vars', () => {
      process.env.VECTOR_DB_PROVIDER = 'qdrant';
      process.env.VECTOR_DB_URL = 'http://custom-qdrant:6333';
      process.env.VECTOR_DB_INDEX = 'custom_memories';

      const config = loadMemoryConfig();

      expect(config.vectorDB.provider).toBe('qdrant');
      expect(config.vectorDB.url).toBe('http://custom-qdrant:6333');
      expect(config.vectorDB.index).toBe('custom_memories');
    });

    it('loads Pinecone configuration from env vars', () => {
      process.env.VECTOR_DB_PROVIDER = 'pinecone';
      process.env.VECTOR_DB_API_KEY = 'test-api-key';
      process.env.VECTOR_DB_ENVIRONMENT = 'us-west1-gcp';
      process.env.VECTOR_DB_INDEX = 'test-index';

      const config = loadMemoryConfig();

      expect(config.vectorDB.provider).toBe('pinecone');
      expect(config.vectorDB.apiKey).toBe('test-api-key');
      expect(config.vectorDB.environment).toBe('us-west1-gcp');
      expect(config.vectorDB.index).toBe('test-index');
    });

    it('loads LLM configuration from env vars', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test-key';
      process.env.LLM_MODEL = 'gpt-4-turbo';
      process.env.LLM_EMBEDDING_MODEL = 'text-embedding-3-large';

      const config = loadMemoryConfig();

      expect(config.llm.provider).toBe('openai');
      expect(config.llm.apiKey).toBe('sk-test-key');
      expect(config.llm.model).toBe('gpt-4-turbo');
      expect(config.llm.embeddingModel).toBe('text-embedding-3-large');
    });

    it('loads caching configuration from env vars', () => {
      process.env.MEMORY_CACHE_ENABLED = 'false';
      process.env.MEMORY_CACHE_TTL = '600';
      process.env.MEMORY_CACHE_MAX_SIZE = '2000';

      const config = loadMemoryConfig();

      expect(config.caching?.enabled).toBe(false);
      expect(config.caching?.ttl).toBe(600);
      expect(config.caching?.maxSize).toBe(2000);
    });
  });

  describe('validateMemoryConfig', () => {
    it('validates Qdrant configuration successfully', () => {
      const config: MemoryConfig = {
        vectorDB: {
          provider: 'qdrant',
          url: 'http://localhost:6333',
          index: 'test',
        },
        llm: {
          provider: 'openai',
          apiKey: 'sk-test',
          embeddingModel: 'text-embedding-3-small',
        },
      };

      expect(() => validateMemoryConfig(config)).not.toThrow();
    });

    it('validates Pinecone configuration successfully', () => {
      const config: MemoryConfig = {
        vectorDB: {
          provider: 'pinecone',
          apiKey: 'test-key',
          environment: 'us-west1-gcp',
          index: 'test',
        },
        llm: {
          provider: 'openai',
          apiKey: 'sk-test',
          embeddingModel: 'text-embedding-3-small',
        },
      };

      expect(() => validateMemoryConfig(config)).not.toThrow();
    });

    it('throws error when Qdrant URL missing', () => {
      const config: MemoryConfig = {
        vectorDB: {
          provider: 'qdrant',
          index: 'test',
        },
        llm: {
          provider: 'openai',
          apiKey: 'sk-test',
          embeddingModel: 'text-embedding-3-small',
        },
      };

      expect(() => validateMemoryConfig(config)).toThrow('VECTOR_DB_URL is required for Qdrant');
    });

    it('throws error when Pinecone API key missing', () => {
      const config: MemoryConfig = {
        vectorDB: {
          provider: 'pinecone',
          environment: 'us-west1-gcp',
          index: 'test',
        },
        llm: {
          provider: 'openai',
          apiKey: 'sk-test',
          embeddingModel: 'text-embedding-3-small',
        },
      };

      expect(() => validateMemoryConfig(config)).toThrow('VECTOR_DB_API_KEY is required for Pinecone');
    });

    it('throws error when LLM API key missing for OpenAI', () => {
      const config: MemoryConfig = {
        vectorDB: {
          provider: 'qdrant',
          url: 'http://localhost:6333',
          index: 'test',
        },
        llm: {
          provider: 'openai',
          embeddingModel: 'text-embedding-3-small',
        },
      };

      expect(() => validateMemoryConfig(config)).toThrow('LLM_API_KEY or OPENAI_API_KEY is required');
    });

    it('throws error when embedding model missing', () => {
      const config: MemoryConfig = {
        vectorDB: {
          provider: 'qdrant',
          url: 'http://localhost:6333',
          index: 'test',
        },
        llm: {
          provider: 'openai',
          apiKey: 'sk-test',
        },
      };

      expect(() => validateMemoryConfig(config)).toThrow('LLM_EMBEDDING_MODEL is required');
    });
  });

  describe('getMemoryConfig', () => {
    it('loads and validates configuration', () => {
      process.env.VECTOR_DB_URL = 'http://localhost:6333';
      process.env.OPENAI_API_KEY = 'sk-test-key';
      process.env.LLM_EMBEDDING_MODEL = 'text-embedding-3-small';

      const config = getMemoryConfig();

      expect(config.vectorDB.provider).toBe('qdrant');
      expect(config.llm.apiKey).toBe('sk-test-key');
    });

    it('throws error on invalid configuration', () => {
      process.env.VECTOR_DB_PROVIDER = 'pinecone';
// Missing required Pinecone env vars

      expect(() => getMemoryConfig()).toThrow();
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('has valid default configuration', () => {
      expect(DEFAULT_CONFIG.vectorDB.provider).toBe('qdrant');
      expect(DEFAULT_CONFIG.vectorDB.url).toBe('http://localhost:6333');
      expect(DEFAULT_CONFIG.llm.provider).toBe('openai');
      expect(DEFAULT_CONFIG.caching?.enabled).toBe(true);
      expect(DEFAULT_CONFIG.caching?.ttl).toBe(300);
    });
  });
});

/**
 * Storage utilities and adapters
 * @module @dcyfr/ai/utils/storage
 */

import type { StorageAdapter, StorageType } from '../types';

/**
 * In-memory storage adapter (default, no persistence)
 */
export class MemoryStorageAdapter implements StorageAdapter {
  type: StorageType = 'memory';
  private store: Map<string, unknown> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    return value !== undefined ? (value as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.store.keys());
    if (!prefix) return keys;
    return keys.filter(key => key.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * File-based storage adapter (Node.js only)
 */
export class FileStorageAdapter implements StorageAdapter {
  type: StorageType = 'file';
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.join(this.basePath, `${key}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.basePath, `${key}.json`);
    
    // Ensure directory exists
    await fs.mkdir(this.basePath, { recursive: true });
    
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
  }

  async delete(key: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.basePath, `${key}.json`);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const files = await fs.readdir(this.basePath);
      const jsonFiles = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
      
      if (!prefix) return jsonFiles;
      return jsonFiles.filter(key => key.startsWith(prefix));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const files = await this.list();
      await Promise.all(
        files.map(key => {
          const filePath = path.join(this.basePath, `${key}.json`);
          return fs.unlink(filePath);
        })
      );
    } catch (error) {
      // Ignore errors during clear
    }
  }
}

/**
 * Storage adapter factory
 */
export function createStorageAdapter(type: StorageType, options?: { basePath?: string }): StorageAdapter {
  switch (type) {
    case 'memory':
      return new MemoryStorageAdapter();
    case 'file':
      if (!options?.basePath) {
        throw new Error('FileStorageAdapter requires basePath option');
      }
      return new FileStorageAdapter(options.basePath);
    case 'redis':
    case 'database':
      throw new Error(`Storage type '${type}' not yet implemented. Use 'memory' or 'file'.`);
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

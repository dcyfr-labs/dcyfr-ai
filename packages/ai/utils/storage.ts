/**
 * Storage utilities and adapters
 * @module @dcyfr/ai/utils/storage
 */

import type { StorageAdapter, StorageType } from '../types';

/**
 * Check if running in browser environment
 */
const isBrowser = typeof globalThis !== 'undefined' &&
  typeof (globalThis as any).window !== 'undefined' &&
  typeof (globalThis as any).window.document !== 'undefined';

/**
 * In-memory storage adapter (default, works in both browser and Node.js)
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
 *
 * This adapter requires Node.js and will throw an error if used in a browser environment.
 */
export class FileStorageAdapter implements StorageAdapter {
  type: StorageType = 'file';
  private basePath: string;

  constructor(basePath: string) {
    if (isBrowser) {
      throw new Error(
        'FileStorageAdapter is not available in browser environments. ' +
        'Use MemoryStorageAdapter instead, or run this code on the server.'
      );
    }
    this.basePath = basePath;
  }

  async get<T>(key: string): Promise<T | null> {
    if (isBrowser) {
      throw new Error('FileStorageAdapter.get() is not available in browser environments.');
    }

    try {
      // Dynamic imports for Node.js modules
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const filePath = join(this.basePath, `${key}.json`);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (isBrowser) {
      throw new Error('FileStorageAdapter.set() is not available in browser environments.');
    }

    const { writeFile, mkdir } = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(this.basePath, `${key}.json`);

    // Ensure directory exists
    await mkdir(this.basePath, { recursive: true });

    await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
  }

  async delete(key: string): Promise<void> {
    if (isBrowser) {
      throw new Error('FileStorageAdapter.delete() is not available in browser environments.');
    }

    const { unlink } = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(this.basePath, `${key}.json`);

    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async list(prefix?: string): Promise<string[]> {
    if (isBrowser) {
      throw new Error('FileStorageAdapter.list() is not available in browser environments.');
    }

    const { readdir } = await import('fs/promises');

    try {
      const files = await readdir(this.basePath);
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
    if (isBrowser) {
      throw new Error('FileStorageAdapter.clear() is not available in browser environments.');
    }

    const { unlink } = await import('fs/promises');
    const { join } = await import('path');

    try {
      const files = await this.list();
      await Promise.all(
        files.map(key => {
          const filePath = join(this.basePath, `${key}.json`);
          return unlink(filePath);
        })
      );
    } catch {
      // Ignore errors during clear
    }
  }
}

/**
 * Storage adapter factory
 *
 * In browser environments, only 'memory' storage is available.
 * File-based storage requires a Node.js environment.
 */
export function createStorageAdapter(type: StorageType, options?: { basePath?: string }): StorageAdapter {
  switch (type) {
    case 'memory':
      return new MemoryStorageAdapter();
    case 'file':
      if (isBrowser) {
        console.warn(
          '⚠️ FileStorageAdapter requested in browser environment. ' +
          'Falling back to MemoryStorageAdapter. Data will not persist.'
        );
        return new MemoryStorageAdapter();
      }
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

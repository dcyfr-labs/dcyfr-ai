declare module 'mem0ai/oss' {
  export class Memory {
    constructor(config: unknown);
    add(messages: unknown, config: unknown): Promise<any>;
    search(query: string, config: unknown): Promise<any>;
    get(memoryId: string): Promise<any>;
    update(memoryId: string, data: string): Promise<any>;
    delete(memoryId: string): Promise<any>;
    deleteAll(config: unknown): Promise<any>;
  }
}

declare module 'sqlite3' {
  export class Database {
    constructor(path: string, callback: (err: Error | null) => void);
    all(query: string, callback: (err: Error | null, rows: any[]) => void): void;
    close(callback: (err: Error | null) => void): void;
  }

  const sqlite3: {
    Database: typeof Database;
  };

  export default sqlite3;
}

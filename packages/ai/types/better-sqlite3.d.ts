/**
 * Minimal ambient module declaration for better-sqlite3.
 * Install @types/better-sqlite3 to get full, accurate typings.
 */
declare module 'better-sqlite3' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Statement<T = any> {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
    pluck(toggle?: boolean): this;
    expand(toggle?: boolean): this;
    raw(toggle?: boolean): this;
    columns(): Array<{ name: string; type: string | null }>;
    iterate(...params: unknown[]): IterableIterator<T>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Database {
    prepare<T = any>(sql: string): Statement<T>;
    exec(sql: string): this;
    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
    pragma(pragma: string, options?: { simple?: boolean }): unknown;
    close(): void;
    readonly open: boolean;
    readonly inTransaction: boolean;
    readonly name: string;
    readonly memory: boolean;
    readonly readonly: boolean;
  }

  interface DatabaseConstructor {
    new(filename: string, options?: Record<string, unknown>): Database;
    (filename: string, options?: Record<string, unknown>): Database;
  }

  const Database: DatabaseConstructor & {
    Database: DatabaseConstructor;
    Statement: Statement;
  };

  export = Database;
}

// Augment the namespace so `Database.Database` and `Database.Statement` resolve.
declare namespace Database {
  interface Statement<T = any> {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
    pluck(toggle?: boolean): this;
    expand(toggle?: boolean): this;
    raw(toggle?: boolean): this;
    columns(): Array<{ name: string; type: string | null }>;
    iterate(...params: unknown[]): IterableIterator<T>;
  }

  interface Database {
    prepare<T = any>(sql: string): Statement<T>;
    exec(sql: string): this;
    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
    pragma(pragma: string, options?: { simple?: boolean }): unknown;
    close(): void;
    readonly open: boolean;
    readonly inTransaction: boolean;
    readonly name: string;
    readonly memory: boolean;
    readonly readonly: boolean;
  }
}

export interface FirebirdConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  lowercase_keys?: boolean;
  role?: string;
  pageSize?: number;
}

export interface FirebirdPoolConfig extends FirebirdConnectionConfig {
  min: number;
  max: number;
  idleTimeoutMillis: number;
  queryTimeout: number;
  role?: string;
}

export interface FirebirdQueryOptions {
  timeout?: number;
  params?: unknown[];
}

export interface FirebirdQueryResult<T = unknown> {
  rows: T[];
  count: number;
  executionTime: number;
}

export interface FirebirdConnection {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  detach(): Promise<void>;
}

export interface FirebirdDatabase {
  attach(): Promise<FirebirdConnection>;
  detach(): Promise<void>;
}

export interface FirebirdPoolConnection extends FirebirdConnection {
  release(): void;
}

export interface FirebirdConnectionPool {
  getConnection(): Promise<FirebirdPoolConnection>;
  destroy(): Promise<void>;
  getPoolInfo(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
  };
}
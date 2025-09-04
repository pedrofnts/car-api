import Firebird from 'node-firebird';
import { config } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { DatabaseError } from '@/utils/errors.js';
import type { 
  FirebirdConnectionConfig, 
  FirebirdPoolConfig,
  FirebirdConnectionPool,
  FirebirdPoolConnection,
  FirebirdQueryResult
} from '@/types/firebird.js';

class FirebirdConnectionService {
  private pool: FirebirdConnectionPool | null = null;
  private poolConfig: FirebirdPoolConfig;

  constructor() {
    this.poolConfig = {
      host: config.FIREBIRD_HOST,
      port: config.FIREBIRD_PORT,
      database: config.FIREBIRD_DATABASE,
      user: config.FIREBIRD_USER,
      password: config.FIREBIRD_PASSWORD,
      min: config.FIREBIRD_POOL_MIN,
      max: config.FIREBIRD_POOL_MAX,
      idleTimeoutMillis: config.FIREBIRD_POOL_IDLE_TIMEOUT,
      queryTimeout: config.FIREBIRD_QUERY_TIMEOUT,
      lowercase_keys: true,
      role: null,
      pageSize: 4096,
    };
  }

  async initialize(): Promise<void> {
    try {
      logger.info({ 
        host: this.poolConfig.host,
        database: this.poolConfig.database,
        poolSize: { min: this.poolConfig.min, max: this.poolConfig.max }
      }, 'Initializing Firebird connection pool');

      this.pool = await this.createPool();
      
      // Test connection
      const testConnection = await this.getConnection();
      await testConnection.query('SELECT 1 FROM RDB$DATABASE');
      testConnection.release();

      logger.info('Firebird connection pool initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Firebird connection pool');
      throw new DatabaseError(
        'Failed to initialize Firebird connection pool',
        'FIREBIRD_INIT_ERROR',
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  private async createPool(): Promise<FirebirdConnectionPool> {
    return new Promise((resolve, reject) => {
      const poolOptions = {
        host: this.poolConfig.host,
        port: this.poolConfig.port,
        database: this.poolConfig.database,
        user: this.poolConfig.user,
        password: this.poolConfig.password,
        lowercase_keys: this.poolConfig.lowercase_keys,
        role: this.poolConfig.role,
        pageSize: this.poolConfig.pageSize,
        min: this.poolConfig.min,
        max: this.poolConfig.max,
        idleTimeoutMillis: this.poolConfig.idleTimeoutMillis,
      };

      Firebird.pool(poolOptions, (err, pool) => {
        if (err) {
          reject(err);
          return;
        }

        const wrappedPool: FirebirdConnectionPool = {
          getConnection: (): Promise<FirebirdPoolConnection> => {
            return new Promise((resolveConn, rejectConn) => {
              pool.get((connErr, connection) => {
                if (connErr) {
                  rejectConn(connErr);
                  return;
                }

                const wrappedConnection: FirebirdPoolConnection = {
                  query: <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
                    return new Promise((resolveQuery, rejectQuery) => {
                      const startTime = Date.now();
                      
                      connection.query(sql, params || [], (queryErr, result) => {
                        const executionTime = Date.now() - startTime;
                        
                        if (queryErr) {
                          logger.error({ 
                            error: queryErr, 
                            sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                            executionTime 
                          }, 'Firebird query error');
                          rejectQuery(new DatabaseError(
                            `Query failed: ${queryErr.message}`,
                            'FIREBIRD_QUERY_ERROR',
                            { sql, executionTime }
                          ));
                          return;
                        }

                        logger.debug({ 
                          sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                          rowCount: Array.isArray(result) ? result.length : 0,
                          executionTime 
                        }, 'Firebird query executed');

                        resolveQuery(Array.isArray(result) ? result : []);
                      });
                    });
                  },

                  execute: (sql: string, params?: unknown[]): Promise<void> => {
                    return new Promise((resolveExec, rejectExec) => {
                      connection.execute(sql, params || [], (execErr) => {
                        if (execErr) {
                          rejectExec(new DatabaseError(
                            `Execute failed: ${execErr.message}`,
                            'FIREBIRD_EXECUTE_ERROR',
                            { sql }
                          ));
                          return;
                        }
                        resolveExec();
                      });
                    });
                  },

                  detach: (): Promise<void> => {
                    return new Promise((resolveDetach, rejectDetach) => {
                      connection.detach((detachErr) => {
                        if (detachErr) {
                          rejectDetach(detachErr);
                          return;
                        }
                        resolveDetach();
                      });
                    });
                  },

                  release: (): void => {
                    connection.detach(() => {
                      // Connection released back to pool
                    });
                  }
                };

                resolveConn(wrappedConnection);
              });
            });
          },

          destroy: (): Promise<void> => {
            return new Promise((resolveDestroy, rejectDestroy) => {
              pool.destroy((destroyErr) => {
                if (destroyErr) {
                  rejectDestroy(destroyErr);
                  return;
                }
                resolveDestroy();
              });
            });
          },

          getPoolInfo: () => ({
            totalConnections: pool._used.length + pool._pool.length,
            activeConnections: pool._used.length,
            idleConnections: pool._pool.length
          })
        };

        resolve(wrappedPool);
      });
    });
  }

  async getConnection(): Promise<FirebirdPoolConnection> {
    if (!this.pool) {
      throw new DatabaseError(
        'Connection pool not initialized',
        'FIREBIRD_POOL_NOT_INITIALIZED'
      );
    }

    try {
      return await this.pool.getConnection();
    } catch (error) {
      logger.error({ error }, 'Failed to get connection from pool');
      throw new DatabaseError(
        'Failed to get database connection',
        'FIREBIRD_CONNECTION_ERROR',
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  async executeQuery<T = unknown>(
    sql: string, 
    params?: unknown[]
  ): Promise<FirebirdQueryResult<T>> {
    const startTime = Date.now();
    const connection = await this.getConnection();

    try {
      const rows = await connection.query<T>(sql, params);
      const executionTime = Date.now() - startTime;

      return {
        rows,
        count: rows.length,
        executionTime
      };
    } finally {
      connection.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.executeQuery('SELECT 1 as health FROM RDB$DATABASE');
      return result.count > 0;
    } catch (error) {
      logger.error({ error }, 'Firebird health check failed');
      return false;
    }
  }

  getPoolInfo() {
    if (!this.pool) {
      return {
        totalConnections: 0,
        activeConnections: 0,
        idleConnections: 0
      };
    }
    return this.pool.getPoolInfo();
  }

  async destroy(): Promise<void> {
    if (this.pool) {
      logger.info('Destroying Firebird connection pool');
      await this.pool.destroy();
      this.pool = null;
      logger.info('Firebird connection pool destroyed');
    }
  }
}

export const firebirdService = new FirebirdConnectionService();
import Firebird from 'node-firebird';
import { config } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { DatabaseError } from '@/utils/errors.js';

interface FirebirdOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  lowercase_keys?: boolean;
  role?: string;
  pageSize?: number;
}

class SimpleFirebirdService {
  private options: FirebirdOptions;

  constructor() {
    this.options = {
      host: config.FIREBIRD_HOST,
      port: config.FIREBIRD_PORT,
      database: config.FIREBIRD_DATABASE,
      user: config.FIREBIRD_USER,
      password: config.FIREBIRD_PASSWORD,
      lowercase_keys: false,
      pageSize: 4096
    };
  }

  async initialize(): Promise<void> {
    logger.info({
      host: this.options.host,
      database: this.options.database,
      user: this.options.user,
      hasPassword: !!this.options.password,
      passwordLength: this.options.password?.length
    }, 'Initializing Firebird connection');

    // Test connection
    try {
      await this.testConnection();
      logger.info('Firebird connection initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Firebird connection');
      throw new DatabaseError(
        'Failed to initialize Firebird connection',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  private async testConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      Firebird.attach(this.options, (err: any, db: any) => {
        if (err) {
          reject(err);
          return;
        }

        db.query('SELECT 1 FROM RDB$DATABASE', [], (queryErr: any) => {
          db.detach();
          
          if (queryErr) {
            reject(queryErr);
            return;
          }
          
          resolve();
        });
      });
    });
  }

  private connectionPool: any[] = [];
  private maxConnections = 5;
  private connectionQueue: Array<{ resolve: Function; reject: Function }> = [];

  private async getConnection(): Promise<any> {
    return new Promise((resolve, reject) => {
      // Check if there's an available connection in the pool
      if (this.connectionPool.length > 0) {
        const connection = this.connectionPool.pop();
        resolve(connection);
        return;
      }

      // Add to queue if max connections reached
      if (this.connectionQueue.length >= this.maxConnections) {
        this.connectionQueue.push({ resolve, reject });
        return;
      }

      // Create new connection
      Firebird.attach(this.options, (err: any, db: any) => {
        if (err) {
          reject(new DatabaseError(
            `Connection failed: ${err.message}`,
            err
          ));
          return;
        }
        resolve(db);
      });
    });
  }

  private releaseConnection(connection: any): void {
    // Check if there are queued requests
    if (this.connectionQueue.length > 0) {
      const { resolve } = this.connectionQueue.shift()!;
      resolve(connection);
      return;
    }

    // Return to pool if under limit
    if (this.connectionPool.length < this.maxConnections) {
      this.connectionPool.push(connection);
    } else {
      // Close excess connections
      connection.detach();
    }
  }

  async executeQuery<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; count: number; executionTime: number }> {
    const startTime = Date.now();
    let connection: any = null;
    
    try {
      connection = await this.getConnection();
      
      return new Promise((resolve, reject) => {
        connection.query(sql, params, (queryErr: any, result: any) => {
          const executionTime = Date.now() - startTime;
          
          if (queryErr) {
            logger.error({ 
              error: queryErr, 
              sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
              executionTime 
            }, 'Firebird query error');
            
            this.releaseConnection(connection);
            reject(new DatabaseError(
              `Query failed: ${queryErr.message}`,
              queryErr
            ));
            return;
          }

          const rows = Array.isArray(result) ? result : [];
          
          logger.debug({ 
            sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
            rowCount: rows.length,
            executionTime 
          }, 'Firebird query executed');

          this.releaseConnection(connection);
          resolve({
            rows,
            count: rows.length,
            executionTime
          });
        });
      });
    } catch (error) {
      if (connection) {
        this.releaseConnection(connection);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.executeQuery('SELECT 1 as health FROM RDB$DATABASE');
      return true;
    } catch (error) {
      logger.error({ error }, 'Firebird health check failed');
      return false;
    }
  }

  async closeAllConnections(): Promise<void> {
    // Close all pooled connections
    while (this.connectionPool.length > 0) {
      const connection = this.connectionPool.pop();
      try {
        connection.detach();
      } catch (error) {
        logger.error({ error }, 'Error closing pooled connection');
      }
    }

    // Reject all queued requests
    while (this.connectionQueue.length > 0) {
      const { reject } = this.connectionQueue.shift()!;
      reject(new Error('Service shutting down'));
    }
  }

  async destroy(): Promise<void> {
    logger.info('Firebird service destroyed');
  }
}

export const firebirdService = new SimpleFirebirdService();
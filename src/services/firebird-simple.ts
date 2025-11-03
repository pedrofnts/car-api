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

  async executeQuery<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; count: number; executionTime: number }> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      Firebird.attach(this.options, (err: any, db: any) => {
        if (err) {
          reject(new DatabaseError(
            `Connection failed: ${err.message}`,
            err
          ));
          return;
        }

        db.query(sql, params, (queryErr: any, result: any) => {
          const executionTime = Date.now() - startTime;
          
          db.detach();
          
          if (queryErr) {
            logger.error({ 
              error: queryErr, 
              sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
              executionTime 
            }, 'Firebird query error');
            
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

          resolve({
            rows,
            count: rows.length,
            executionTime
          });
        });
      });
    });
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

  async destroy(): Promise<void> {
    logger.info('Firebird service destroyed');
  }
}

export const firebirdService = new SimpleFirebirdService();
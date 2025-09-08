import { firebirdService } from '@/services/firebird-simple.js';
import { logger } from '@/utils/logger.js';
import type { FirebirdQueryResult } from '@/types/firebird.js';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface QueryOptions extends PaginationOptions {
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export abstract class BaseRepository<T> {
  protected readonly tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  protected async executeQuery<U = T>(
    sql: string, 
    params?: unknown[]
  ): Promise<FirebirdQueryResult<U>> {
    const startTime = Date.now();
    
    try {
      const result = await firebirdService.executeQuery<U>(sql, params);
      
      logger.debug({
        table: this.tableName,
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        rowCount: result.count,
        executionTime: result.executionTime
      }, 'Repository query executed');

      return result;
    } catch (error) {
      logger.error({
        table: this.tableName,
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        params,
        error,
        executionTime: Date.now() - startTime
      }, 'Repository query failed');
      
      throw error;
    }
  }

  protected buildPaginationClause(options?: QueryOptions): string {
    if (!options) return '';

    const clauses: string[] = [];

    if (options.orderBy) {
      const direction = options.orderDirection || 'ASC';
      clauses.push(`ORDER BY ${options.orderBy} ${direction}`);
    }

    if (options.limit) {
      clauses.push(`ROWS ${options.offset || 0} TO ${(options.offset || 0) + options.limit}`);
    }

    return clauses.join(' ');
  }

  protected buildWhereClause(conditions: Record<string, unknown>): { clause: string; params: unknown[] } {
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        whereConditions.push(`${key} = ?`);
        params.push(value);
      }
    });

    return {
      clause: whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '',
      params
    };
  }

  async findById(id: string | number): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE ID = ? ROWS 1`;
    const result = await this.executeQuery<T>(sql, [id]);
    return result.rows[0] || null;
  }

  async findAll(options?: QueryOptions): Promise<{ items: T[]; total: number }> {
    const paginationClause = this.buildPaginationClause(options);
    
    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM ${this.tableName}`;
    const countResult = await this.executeQuery<{ total: number }>(countSql);
    const total = countResult.rows[0]?.total || 0;

    // Get paginated data
    const dataSql = `SELECT * FROM ${this.tableName} ${paginationClause}`;
    const dataResult = await this.executeQuery<T>(dataSql);

    return {
      items: dataResult.rows,
      total
    };
  }

  async findWhere(
    conditions: Record<string, unknown>, 
    options?: QueryOptions
  ): Promise<{ items: T[]; total: number }> {
    const { clause: whereClause, params } = this.buildWhereClause(conditions);
    const paginationClause = this.buildPaginationClause(options);

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
    const countResult = await this.executeQuery<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total || 0;

    // Get paginated data
    const dataSql = `SELECT * FROM ${this.tableName} ${whereClause} ${paginationClause}`;
    const dataResult = await this.executeQuery<T>(dataSql, params);

    return {
      items: dataResult.rows,
      total
    };
  }

  async findOne(conditions: Record<string, unknown>): Promise<T | null> {
    const { clause: whereClause, params } = this.buildWhereClause(conditions);
    const sql = `SELECT * FROM ${this.tableName} ${whereClause} ROWS 1`;
    const result = await this.executeQuery<T>(sql, params);
    return result.rows[0] || null;
  }

  async exists(conditions: Record<string, unknown>): Promise<boolean> {
    const { clause: whereClause, params } = this.buildWhereClause(conditions);
    const sql = `SELECT 1 FROM ${this.tableName} ${whereClause} ROWS 1`;
    const result = await this.executeQuery(sql, params);
    return result.count > 0;
  }

  async count(conditions?: Record<string, unknown>): Promise<number> {
    if (!conditions || Object.keys(conditions).length === 0) {
      const sql = `SELECT COUNT(*) as total FROM ${this.tableName}`;
      const result = await this.executeQuery<{ total: number }>(sql);
      return result.rows[0]?.total || 0;
    }

    const { clause: whereClause, params } = this.buildWhereClause(conditions);
    const sql = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
    const result = await this.executeQuery<{ total: number }>(sql, params);
    return result.rows[0]?.total || 0;
  }

  // Custom query method for complex queries
  async customQuery<U = T>(sql: string, params?: unknown[]): Promise<FirebirdQueryResult<U>> {
    return this.executeQuery<U>(sql, params);
  }
}
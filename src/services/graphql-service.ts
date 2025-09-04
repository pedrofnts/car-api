import { graphqlClient } from './graphql-client.js';
import { GraphQLQueries } from './graphql-queries.js';
import { logger } from '@/utils/logger.js';
import type { Connection, PaginationInput } from '@/types/graphql.js';

export class GraphQLService {
  private queries = new GraphQLQueries(graphqlClient);

  async healthCheck(): Promise<boolean> {
    try {
      await this.queries.healthCheck();
      return true;
    } catch (error) {
      logger.error({ error }, 'GraphQL service health check failed');
      return false;
    }
  }

  async getSchema(): Promise<unknown> {
    return this.queries.getSchema();
  }

  // Generic method for executing any GraphQL query
  async executeQuery<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    return graphqlClient.request<T>(query, variables);
  }

  // Generic method for paginated queries
  async executePaginatedQuery<T = unknown>(
    query: string,
    pagination?: PaginationInput,
    variables?: Record<string, unknown>
  ): Promise<Connection<T>> {
    const paginationVars = {
      first: pagination?.first || 10,
      after: pagination?.after,
      last: pagination?.last,
      before: pagination?.before,
    };

    return graphqlClient.request<Connection<T>>(query, {
      ...variables,
      ...paginationVars,
    });
  }

  // Batch multiple queries in a single request
  async batchQueries<T = unknown[]>(
    queries: Array<{
      query: string;
      variables?: Record<string, unknown>;
    }>
  ): Promise<T> {
    return graphqlClient.batchRequest<T>(queries);
  }

  // Execute query with fragments
  async executeQueryWithFragments<T = unknown>(
    query: string,
    fragments: string[],
    variables?: Record<string, unknown>
  ): Promise<T> {
    return graphqlClient.queryWithFragments<T>(query, fragments, variables);
  }

  // Get client metrics for monitoring
  getMetrics() {
    return graphqlClient.getMetrics();
  }

  // Example domain-specific methods (customize based on your schema)
  
  // Product-related queries (example - adjust based on actual schema)
  async getProducts(pagination?: PaginationInput, filter?: Record<string, unknown>) {
    const params: any = {
      first: pagination?.first ?? 10,
      filter: filter ?? {},
    };
    if (pagination?.after) {
      params.after = pagination.after;
    }
    return this.queries.getAllProducts(params);
  }

  async getProductById(id: string) {
    return this.queries.getProductById(id);
  }

  async searchProducts(searchQuery: string, pagination?: PaginationInput) {
    const params: any = {
      first: pagination?.first ?? 10,
    };
    if (pagination?.after) {
      params.after = pagination.after;
    }
    return this.queries.searchProducts(searchQuery, params);
  }

  // Custom query builder for complex filters
  buildFilteredQuery(
    baseQuery: string,
    filters: Record<string, unknown>,
    sortBy?: string,
    sortDirection?: 'ASC' | 'DESC'
  ): { query: string; variables: Record<string, unknown> } {
    // Build dynamic filter conditions
    const filterConditions: string[] = [];
    const variables: Record<string, unknown> = {};

    Object.entries(filters).forEach(([key, value], index) => {
      if (value !== undefined && value !== null && value !== '') {
        filterConditions.push(`${key}: $filter_${index}`);
        variables[`filter_${index}`] = value;
      }
    });

    let modifiedQuery = baseQuery;
    
    if (filterConditions.length > 0) {
      const filterString = `filter: { ${filterConditions.join(', ')} }`;
      modifiedQuery = modifiedQuery.replace('(', `(${filterString}, `);
    }

    if (sortBy) {
      variables.sortBy = sortBy;
      variables.sortDirection = sortDirection || 'ASC';
    }

    return { query: modifiedQuery, variables };
  }
}

export const graphqlService = new GraphQLService();
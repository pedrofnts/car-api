import { request } from 'undici';
import { getEnv } from '@/config/env.js';
import { logger, createRequestLogger } from '@/utils/logger.js';
import { ExternalServiceError, AuthenticationError, createErrorFromStatusCode } from '@/utils/errors.js';
import { oauthService } from '@/services/oauth.js';
import { generateRequestId } from '@/utils/request-id.js';
import type { 
  GraphQLRequest, 
  GraphQLResponse, 
  GraphQLClientOptions,
  GraphQLClientMetrics 
} from '@/types/graphql.js';

export class GraphQLClient {
  private readonly env = getEnv();
  private readonly metrics: GraphQLClientMetrics = {
    requestCount: 0,
    errorCount: 0,
    averageResponseTime: 0,
  };

  async request<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: GraphQLClientOptions
  ): Promise<T> {
    const requestId = generateRequestId();
    const requestLogger = createRequestLogger(requestId);
    const startTime = Date.now();

    try {
      const operationName = this.extractOperationName(query);
      const response = await this.performRequest({
        query,
        variables: variables || {},
        ...(operationName && { operationName }),
      }, options, requestId);

      if (response.errors && response.errors.length > 0) {
        const errorMessages = response.errors.map(error => error.message).join('; ');
        requestLogger.error({
          errors: response.errors,
          query: this.sanitizeQuery(query),
          variables,
        }, 'GraphQL query returned errors');

        throw new ExternalServiceError(
          'GraphQL API',
          `GraphQL errors: ${errorMessages}`,
          undefined,
          { 
            errors: response.errors,
            query: this.sanitizeQuery(query),
            variables,
          }
        );
      }

      if (!response.data) {
        throw new ExternalServiceError(
          'GraphQL API',
          'GraphQL response missing data field',
          undefined,
          { response }
        );
      }

      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, false);

      requestLogger.info({
        responseTime,
        operationName: this.extractOperationName(query),
      }, 'GraphQL request completed successfully');

      return response.data as T;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, true);

      requestLogger.error({
        error,
        responseTime,
        query: this.sanitizeQuery(query),
        variables,
      }, 'GraphQL request failed');

      throw error;
    }
  }

  private async performRequest(
    graphqlRequest: GraphQLRequest,
    options?: GraphQLClientOptions,
    requestId?: string
  ): Promise<GraphQLResponse> {
    const timeout = options?.timeout || this.env.GRAPHQL_TIMEOUT;
    const retryAttempts = options?.retryAttempts || 3;
    const retryDelay = options?.retryDelay || 1000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(retryDelay * Math.pow(2, attempt - 1)); // Exponential backoff
          logger.info({ attempt, requestId }, 'Retrying GraphQL request');
        }

        const authHeader = await oauthService.getAuthorizationHeaderAsync();
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authHeader,
          ...(requestId && { 'X-Request-ID': requestId }),
          ...options?.headers,
        };

        const { statusCode, body } = await request(this.env.GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify(graphqlRequest),
          bodyTimeout: timeout,
          headersTimeout: timeout,
          throwOnError: false,
        });

        if (statusCode === 401 || statusCode === 403) {
          // Token might be invalid, clear it and retry once
          if (attempt === 0) {
            logger.warn({ statusCode }, 'Authentication failed, clearing token and retrying');
            oauthService.clearToken();
            continue;
          }
          
          throw new AuthenticationError('GraphQL API authentication failed');
        }

        if (statusCode >= 500) {
          const errorText = await body.text();
          throw new ExternalServiceError(
            'GraphQL API',
            `Server error: ${statusCode}`,
            undefined,
            { statusCode, response: errorText }
          );
        }

        if (statusCode === 429) {
          if (attempt < retryAttempts) {
            const retryAfter = parseInt('5') * 1000;
            await this.delay(Math.max(retryAfter, retryDelay * Math.pow(2, attempt)));
            continue;
          }
          
          throw createErrorFromStatusCode(statusCode, 'Rate limit exceeded');
        }

        if (statusCode !== 200) {
          const errorText = await body.text();
          throw createErrorFromStatusCode(
            statusCode,
            `GraphQL request failed with status ${statusCode}`,
            { statusCode, response: errorText }
          );
        }

        const response: GraphQLResponse = await body.json() as GraphQLResponse;
        return response;

      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on authentication errors or client errors (4xx except 429)
        if (error instanceof AuthenticationError ||
            (error instanceof ExternalServiceError && 
             error.statusCode >= 400 && 
             error.statusCode < 500 && 
             error.statusCode !== 429)) {
          break;
        }

        if (attempt === retryAttempts) {
          break;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new ExternalServiceError('GraphQL API', 'Request failed after all retry attempts');
  }

  async queryWithFragments<T = unknown>(
    query: string,
    fragments: string[],
    variables?: Record<string, unknown>,
    options?: GraphQLClientOptions
  ): Promise<T> {
    const fullQuery = fragments.join('\n\n') + '\n\n' + query;
    return this.request<T>(fullQuery, variables, options);
  }

  async batchRequest<T = unknown[]>(
    requests: Array<{
      query: string;
      variables?: Record<string, unknown>;
    }>,
    options?: GraphQLClientOptions
  ): Promise<T> {
    // GraphQL batch requests (if supported by the server)
    const batchQuery = requests.map((req, index) => 
      `query_${index}: ${req.query.replace(/^(query|mutation|subscription)\s*/, '')}`
    ).join('\n\n');

    // Merge all variables
    const mergedVariables = requests.reduce((acc, req, index) => {
      if (req.variables) {
        Object.entries(req.variables).forEach(([key, value]) => {
          acc[`${key}_${index}`] = value;
        });
      }
      return acc;
    }, {} as Record<string, unknown>);

    return this.request<T>(`query { ${batchQuery} }`, mergedVariables, options);
  }

  private extractOperationName(query: string): string | undefined {
    const match = query.match(/(query|mutation|subscription)\s+(\w+)/);
    return match?.[2];
  }

  private sanitizeQuery(query: string): string {
    return query.replace(/\s+/g, ' ').trim().substring(0, 200) + '...';
  }

  private updateMetrics(responseTime: number, isError: boolean): void {
    this.metrics.requestCount++;
    this.metrics.lastRequestTime = Date.now();
    
    if (isError) {
      this.metrics.errorCount++;
    }

    // Calculate rolling average
    const weight = 0.1; // Give more weight to recent requests
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (1 - weight)) + (responseTime * weight);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMetrics(): GraphQLClientMetrics {
    return { ...this.metrics };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple introspection query to test connectivity
      await this.request(`
        query HealthCheck {
          __schema {
            queryType {
              name
            }
          }
        }
      `);
      return true;
    } catch (error) {
      logger.error({ error }, 'GraphQL health check failed');
      return false;
    }
  }
}

export const graphqlClient = new GraphQLClient();
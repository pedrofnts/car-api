// Service exports for easy importing
export { OAuthService, oauthService } from './oauth.js';
export { GraphQLClient, graphqlClient } from './graphql-client.js';
export { GraphQLQueries, queries, fragments } from './graphql-queries.js';

// Re-export types
export type { OAuthTokenInfo, OAuthTokenResponse } from '@/types/oauth.js';
export type { 
  GraphQLRequest, 
  GraphQLResponse, 
  GraphQLClientOptions,
  GraphQLClientMetrics,
  Connection,
  PageInfo 
} from '@/types/graphql.js';
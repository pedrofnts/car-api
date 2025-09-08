// Common fragments that can be reused across queries
export const fragments = {
  // Example fragments - adjust based on your actual schema
  productInfo: `
    fragment ProductInfo on Product {
      id
      name
      description
      price
      sku
      category
      createdAt
      updatedAt
    }
  `,

  pageInfo: `
    fragment PageInfo on PageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  `,
} as const;

// Example queries - customize based on your actual GraphQL schema
export const queries = {
  // Introspection query for schema discovery
  getSchema: `
    query GetSchema {
      __schema {
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          name
          kind
          description
        }
      }
    }
  `,

  // Health check query
  healthCheck: `
    query HealthCheck {
      __schema {
        queryType {
          name
        }
      }
    }
  `,

  // Example product queries - adjust field names based on actual schema
  getAllProducts: `
    ${fragments.productInfo}
    ${fragments.pageInfo}
    
    query GetAllProducts($first: Int, $after: String, $filter: ProductFilter) {
      products(first: $first, after: $after, filter: $filter) {
        edges {
          node {
            ...ProductInfo
          }
          cursor
        }
        pageInfo {
          ...PageInfo
        }
        totalCount
      }
    }
  `,

  getProductById: `
    ${fragments.productInfo}
    
    query GetProductById($id: ID!) {
      product(id: $id) {
        ...ProductInfo
      }
    }
  `,

  searchProducts: `
    ${fragments.productInfo}
    ${fragments.pageInfo}
    
    query SearchProducts($query: String!, $first: Int, $after: String) {
      searchProducts(query: $query, first: $first, after: $after) {
        edges {
          node {
            ...ProductInfo
          }
          cursor
        }
        pageInfo {
          ...PageInfo
        }
        totalCount
      }
    }
  `,

  catalogSearchByPlate: `
    query CatalogSearchByPlate($plate: String!, $skip: Int, $take: Int) {
      catalogSearchByPlate(plate: $plate, skip: $skip, take: $take) {
        pageInfo {
          total
          skip
          take
        }
        nodes {
          product {
            partNumber
            brand {
              name
            }
            summaryApplication
            applicationDescription
            specifications {
              description
              value
            }
          }
        }
      }
    }
  `,
} as const;

// Type-safe query execution helpers
export class GraphQLQueries {
  constructor(private client: { request: <T>(query: string, variables?: Record<string, unknown>) => Promise<T> }) {}

  async getSchema() {
    return this.client.request(queries.getSchema);
  }

  async healthCheck() {
    return this.client.request(queries.healthCheck);
  }

  async getAllProducts(variables?: {
    first?: number;
    after?: string;
    filter?: Record<string, unknown>;
  }) {
    return this.client.request(queries.getAllProducts, variables);
  }

  async getProductById(id: string) {
    return this.client.request(queries.getProductById, { id });
  }

  async searchProducts(query: string, variables?: {
    first?: number;
    after?: string;
  }) {
    return this.client.request(queries.searchProducts, { 
      query, 
      ...variables 
    });
  }

  async catalogSearchByPlate(plate: string, variables?: {
    skip?: number;
    take?: number;
  }) {
    return this.client.request(queries.catalogSearchByPlate, {
      plate,
      skip: variables?.skip || 0,
      take: variables?.take || 10
    });
  }
}

// Utility function to build dynamic queries
export function buildQuery(
  operation: 'query' | 'mutation' | 'subscription',
  name: string,
  fields: string[],
  variables?: Record<string, string>
): string {
  const variablesDef = variables 
    ? `(${Object.entries(variables).map(([key, type]) => `$${key}: ${type}`).join(', ')})`
    : '';
    
  return `
    ${operation} ${name}${variablesDef} {
      ${fields.join('\n      ')}
    }
  `;
}

// Utility to extract operation name from query string
export function extractOperationName(query: string): string | null {
  const match = query.match(/(query|mutation|subscription)\s+(\w+)/);
  return match?.[2] || null;
}
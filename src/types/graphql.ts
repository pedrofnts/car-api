export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLError {
  message: string;
  locations?: Array<{
    line: number;
    column: number;
  }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export interface GraphQLClientOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface PaginationInput {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface Connection<T> {
  edges: Array<{
    node: T;
    cursor: string;
  }>;
  pageInfo: PageInfo;
  totalCount?: number;
}

export interface GraphQLClientMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastRequestTime?: number;
}

// Types for catalogSearchByPlate query
export interface CatalogPageInfo {
  total: number;
  skip: number;
  take: number;
}

export interface ProductSpecification {
  description: string;
  value: string;
}

export interface ProductBrand {
  name: string;
}

export interface CatalogProduct {
  partNumber: string;
  brand: ProductBrand;
  summaryApplication: string;
  applicationDescription: string;
  specifications: ProductSpecification[];
}

export interface CatalogNode {
  product: CatalogProduct;
}

export interface CatalogSearchByPlateResponse {
  catalogSearchByPlate: {
    pageInfo: CatalogPageInfo;
    nodes: CatalogNode[];
  };
}

export interface CatalogSearchByPlateVariables {
  plate: string;
  skip?: number;
  take?: number;
}
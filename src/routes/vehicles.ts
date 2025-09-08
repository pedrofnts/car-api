import type { FastifyInstance } from 'fastify';
import { graphqlService } from '@/services/graphql-service.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/utils/errors.js';
import { z } from 'zod';
import type { CatalogSearchByPlateResponse, CatalogProduct } from '@/types/graphql.js';

const vehicleByPlateQuery = `
  query VehicleByPlate($plate: String!) {
    vehicleByPlate(plate: $plate) {
      plate
      brand
      color
      madeYear
      modelYear
      models {
        name
        engines
      }
    }
  }
`;

const catalogSearchByPlateQuery = `
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
`;

const plateParamsSchema = z.object({
  plate: z.string().min(1, 'Plate is required').max(10, 'Plate must be at most 10 characters')
});

const productsQuerySchema = z.object({
  skip: z.coerce.number().min(0).default(0),
  take: z.coerce.number().min(1).max(100).default(10)
});

const searchQuerySchema = z.object({
  search: z.string().min(1, 'Search term is required').max(100, 'Search term must be at most 100 characters')
});

interface VehicleModel {
  name: string;
  engines: string[];
}

interface VehicleData {
  plate: string;
  brand: string;
  color: string;
  madeYear: number;
  modelYear: number;
  models: VehicleModel[];
}

interface VehicleByPlateResponse {
  vehicleByPlate: VehicleData | null;
}

// Function to fetch all products from all pages
async function fetchAllProductsByPlate(plate: string): Promise<CatalogProduct[]> {
  const allProducts: CatalogProduct[] = [];
  let skip = 0;
  const take = 50; // Maximum items per page (GraphQL API limit)
  let hasMoreData = true;

  while (hasMoreData) {
    const result = await graphqlService.executeQuery<CatalogSearchByPlateResponse>(
      catalogSearchByPlateQuery,
      { plate: plate.toUpperCase(), skip, take }
    );

    const products = result.catalogSearchByPlate.nodes.map(node => node.product);
    allProducts.push(...products);

    // Check if we have more data
    const { total } = result.catalogSearchByPlate.pageInfo;
    skip += take;
    hasMoreData = skip < total;
  }

  return allProducts;
}

// Function to search products by application description
function searchProductsByDescription(products: CatalogProduct[], searchTerm: string): CatalogProduct[] {
  const searchLower = searchTerm.toLowerCase();
  return products.filter(product => 
    product.applicationDescription.toLowerCase().includes(searchLower)
  );
}

export async function vehicleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { plate: string };
  }>('/vehicles/:plate', {
    schema: {
      description: 'Get vehicle information by plate',
      tags: ['vehicles'],
      params: {
        type: 'object',
        properties: {
          plate: {
            type: 'string',
            description: 'Vehicle plate number',
            minLength: 1,
            maxLength: 10
          }
        },
        required: ['plate']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                plate: { type: 'string' },
                brand: { type: 'string' },
                color: { type: 'string' },
                madeYear: { type: 'number' },
                modelYear: { type: 'number' },
                models: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      engines: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = request.id;
    const startTime = Date.now();
    
    try {
      const { plate } = plateParamsSchema.parse(request.params);
      
      logger.info({ requestId, plate }, 'Fetching vehicle by plate');

      const result = await graphqlService.executeQuery<VehicleByPlateResponse>(
        vehicleByPlateQuery,
        { plate: plate.toUpperCase() }
      );

      if (!result.vehicleByPlate) {
        logger.warn({ requestId, plate }, 'Vehicle not found');
        
        return reply.status(404).send({
          success: false,
          error: {
            message: 'Vehicle not found',
            code: 'VEHICLE_NOT_FOUND'
          }
        });
      }

      const duration = Date.now() - startTime;
      logger.info({ requestId, plate, duration }, 'Vehicle fetched successfully');

      return reply.send({
        success: true,
        data: result.vehicleByPlate
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Error fetching vehicle');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            message: 'Invalid plate parameter',
            code: 'VALIDATION_ERROR'
          }
        });
      }

      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            message: error.message,
            code: error.code
          }
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  });

  // Get products by plate endpoint
  fastify.get<{
    Params: { plate: string };
    Querystring: { skip?: number; take?: number };
  }>('/vehicles/:plate/products', {
    schema: {
      description: 'Get products catalog by vehicle plate',
      tags: ['vehicles'],
      params: {
        type: 'object',
        properties: {
          plate: {
            type: 'string',
            description: 'Vehicle plate number',
            minLength: 1,
            maxLength: 10
          }
        },
        required: ['plate']
      },
      querystring: {
        type: 'object',
        properties: {
          skip: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Number of items to skip for pagination'
          },
          take: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 10,
            description: 'Number of items to take (max 100)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                pageInfo: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    skip: { type: 'number' },
                    take: { type: 'number' }
                  }
                },
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      partNumber: { type: 'string' },
                      brand: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' }
                        }
                      },
                      summaryApplication: { type: 'string' },
                      applicationDescription: { type: 'string' },
                      specifications: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            description: { type: 'string' },
                            value: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = request.id;
    const startTime = Date.now();
    
    try {
      const { plate } = plateParamsSchema.parse(request.params);
      const { skip, take } = productsQuerySchema.parse(request.query);
      
      logger.info({ requestId, plate, skip, take }, 'Fetching products by plate');

      const result = await graphqlService.executeQuery<CatalogSearchByPlateResponse>(
        catalogSearchByPlateQuery,
        { plate: plate.toUpperCase(), skip, take }
      );

      const products = result.catalogSearchByPlate.nodes.map(node => node.product);
      const duration = Date.now() - startTime;
      
      logger.info({ 
        requestId, 
        plate, 
        productsCount: products.length,
        total: result.catalogSearchByPlate.pageInfo.total,
        duration 
      }, 'Products fetched successfully');

      return reply.send({
        success: true,
        data: {
          pageInfo: result.catalogSearchByPlate.pageInfo,
          products
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Error fetching products');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            message: 'Invalid parameters',
            code: 'VALIDATION_ERROR',
            details: error.errors
          }
        });
      }

      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            message: error.message,
            code: error.code
          }
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  });

  // Search products by application description endpoint
  fastify.get<{
    Params: { plate: string };
    Querystring: { search: string };
  }>('/vehicles/:plate/products/search', {
    schema: {
      description: 'Search products by application description for a specific vehicle plate',
      tags: ['vehicles'],
      params: {
        type: 'object',
        properties: {
          plate: {
            type: 'string',
            description: 'Vehicle plate number',
            minLength: 1,
            maxLength: 10
          }
        },
        required: ['plate']
      },
      querystring: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search term for application description (e.g., "rolamento")',
            minLength: 1,
            maxLength: 100
          }
        },
        required: ['search']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                searchTerm: { type: 'string' },
                totalFound: { type: 'number' },
                totalScanned: { type: 'number' },
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      partNumber: { type: 'string' },
                      brand: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' }
                        }
                      },
                      summaryApplication: { type: 'string' },
                      applicationDescription: { type: 'string' },
                      specifications: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            description: { type: 'string' },
                            value: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = request.id;
    const startTime = Date.now();
    
    try {
      const { plate } = plateParamsSchema.parse(request.params);
      const { search } = searchQuerySchema.parse(request.query);
      
      logger.info({ requestId, plate, search }, 'Searching products by application description');

      // Fetch all products from all pages
      const allProducts = await fetchAllProductsByPlate(plate);
      
      // Filter products by application description
      const filteredProducts = searchProductsByDescription(allProducts, search);
      
      const duration = Date.now() - startTime;
      
      logger.info({ 
        requestId, 
        plate, 
        search,
        totalScanned: allProducts.length,
        totalFound: filteredProducts.length,
        duration 
      }, 'Product search completed successfully');

      return reply.send({
        success: true,
        data: {
          searchTerm: search,
          totalFound: filteredProducts.length,
          totalScanned: allProducts.length,
          products: filteredProducts
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Error searching products');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            message: 'Invalid parameters',
            code: 'VALIDATION_ERROR',
            details: error.errors
          }
        });
      }

      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            message: error.message,
            code: error.code
          }
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  });

  // Health check endpoint
  fastify.get('/vehicles/health', {
    schema: {
      description: 'Check GraphQL service health',
      tags: ['vehicles'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                graphql: { type: 'boolean' },
                timestamp: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = request.id;
    
    try {
      logger.info({ requestId }, 'Checking service health');
      
      const isHealthy = await graphqlService.healthCheck();
      
      return reply.send({
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          graphql: isHealthy,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error({ requestId, error }, 'Health check failed');
      
      return reply.status(503).send({
        success: false,
        data: {
          status: 'unhealthy',
          graphql: false,
          timestamp: new Date().toISOString()
        }
      });
    }
  });
}
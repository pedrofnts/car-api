import type { FastifyInstance } from 'fastify';
import { graphqlService } from '@/services/graphql-service.js';
import { vehicleSearchService } from '@/services/vehicle-search-service.js';
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

const vehicleSearchQuerySchema = z.object({
  brand: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(50).optional(),
  model: z.string().min(1).max(50).optional(),
  year: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  engineConfiguration: z.string().max(100).optional(),
  engineTechnicalCode: z.string().max(50).optional(),
  release: z.string().max(50).optional(),
  q: z.string().max(100).optional().default(''),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20),
  onlyAvailable: z.string().optional().transform(val => val === 'true')
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
  // New endpoint: Identify vehicle variations (year, engine, generation)
  fastify.get<{
    Querystring: { query: string; market?: string; limit?: string };
  }>('/vehicles/identify', {
    schema: {
      description: 'Identificar variações específicas de um veículo (ano, motor, geração) para seleção precisa',
      tags: ['vehicles'],
      querystring: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Busca do veículo (ex: "FORD KA", "VOLKSWAGEN GOL")',
            minLength: 1,
            maxLength: 100
          },
          market: {
            type: 'string',
            description: 'Mercado (ex: "BRA")',
            default: 'BRA'
          },
          limit: {
            type: 'string',
            description: 'Número máximo de resultados',
            default: '20'
          }
        },
        required: ['query']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                totalFound: { type: 'number' },
                vehicles: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      brand: { type: 'string' },
                      name: { type: 'string' },
                      line: { type: 'string' },
                      release: { type: 'string' },
                      category: { type: 'string' },
                      engineConfiguration: { type: 'string' },
                      engineTechnicalCode: { type: 'string' },
                      image: { type: 'string' },
                      years: {
                        type: 'array',
                        items: { type: 'number' }
                      },
                      summary: { type: 'string' }
                    }
                  }
                },
                suggestions: {
                  type: 'array',
                  items: { type: 'string' }
                }
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
      const { query, market = 'BRA', limit: limitStr = '20' } = request.query;
      const limit = parseInt(limitStr, 10);

      logger.info({ requestId, query, market, limit }, 'Identificando variações de veículo');

      const graphqlQuery = `
        query VehicleSearch($query: String!, $skip: Int, $take: Int) {
          vehicleSearch(query: $query, market: BRA, skip: $skip, take: $take) {
            nodes {
              vehicle {
                brand
                line
                name
                release
                category
                engineConfiguration
                engineTechnicalCode
                image
                years
              }
            }
            pageInfo {
              total
              skip
              take
            }
          }
        }
      `;

      const variables = {
        query,
        skip: 0,
        take: limit,
      };

      const response = await graphqlService.executeQuery<{
        vehicleSearch: {
          nodes: Array<{
            vehicle: {
              brand: string;
              line: string;
              name: string;
              release: string;
              category: string;
              engineConfiguration: string;
              engineTechnicalCode: string;
              image: string;
              years: number[];
            };
          }>;
          pageInfo: {
            total: number;
            skip: number;
            take: number;
          };
        };
      }>(graphqlQuery, variables);

      const { nodes, pageInfo } = response.vehicleSearch;
      const duration = Date.now() - startTime;

      // Format vehicles with user-friendly summaries
      const vehicles = nodes.map((node, index) => {
        const vehicle = node.vehicle;
        const yearRange = vehicle.years.length > 0 
          ? `${Math.min(...vehicle.years)}-${Math.max(...vehicle.years)}`
          : 'N/A';
        
        const summary = `${vehicle.brand} ${vehicle.name}${vehicle.release ? ` ${vehicle.release}` : ''} ${vehicle.engineConfiguration} (${yearRange})`;
        
        return {
          ...vehicle,
          summary,
          id: `${vehicle.brand}_${vehicle.name}_${vehicle.engineTechnicalCode}_${index}` // Unique identifier for selection
        };
      });

      // Generate suggestions based on common variations
      const suggestions = vehicles.length > 0 && vehicles[0]
        ? [`Confirme o ano específico do ${vehicles[0].brand} ${vehicles[0].name}`, 'Verifique a motorização correta']
        : ['Tente uma busca mais específica'];

      logger.info({
        requestId,
        query,
        vehiclesFound: vehicles.length,
        total: pageInfo.total,
        duration
      }, 'Identificação de veículos concluída');

      return reply.send({
        success: true,
        data: {
          query,
          totalFound: pageInfo.total,
          vehicles,
          suggestions
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Erro ao identificar variações de veículo');

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
          message: 'Erro interno do servidor',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  });

  // Enhanced endpoint: Search by vehicle with detailed specifications
  fastify.get<{
    Querystring: {
      brand?: string;
      name?: string;
      model?: string;
      year?: string;
      engineConfiguration?: string;
      engineTechnicalCode?: string;
      release?: string;
      q?: string;
      limit?: string;
      onlyAvailable?: string;
    };
  }>('/vehicles/search', {
    schema: {
      description: 'Buscar produtos por especificações detalhadas do veículo (marca, modelo, ano, motor)',
      tags: ['vehicles'],
      querystring: {
        type: 'object',
        properties: {
          brand: {
            type: 'string',
            description: 'Marca do veículo (ex: FORD, VOLKSWAGEN)',
            minLength: 1,
            maxLength: 50
          },
          name: {
            type: 'string',
            description: 'Nome/modelo do veículo (ex: KA, GOL)',
            minLength: 1,
            maxLength: 50
          },
          model: {
            type: 'string',
            description: 'Versão do modelo (opcional)',
            minLength: 1,
            maxLength: 50
          },
          year: {
            type: 'string',
            description: 'Ano específico do veículo (ex: "2015")'
          },
          engineConfiguration: {
            type: 'string',
            description: 'Configuração do motor (ex: "1.0 L 8V SOHC L4")',
            maxLength: 100
          },
          engineTechnicalCode: {
            type: 'string',
            description: 'Código técnico do motor (ex: "C4C", "TI-VCT")',
            maxLength: 50
          },
          release: {
            type: 'string',
            description: 'Geração do veículo (ex: "G 1", "G 2", "G 3")',
            maxLength: 50
          },
          q: {
            type: 'string',
            description: 'Termo de busca adicional para peças específicas (ex: "freio", "filtro")',
            maxLength: 100
          },
          limit: {
            type: 'string',
            description: 'Número máximo de resultados',
            default: '20'
          },
          onlyAvailable: {
            type: 'string',
            description: 'Filtrar apenas produtos disponíveis em estoque (true/false)',
            default: 'false'
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
                vehicle: {
                  type: 'object',
                  properties: {
                    brand: { type: 'string' },
                    name: { type: 'string' },
                    model: { type: 'string' },
                    modelYear: { type: 'number' }
                  }
                },
                totalFound: { type: 'number' },
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      cproduto: { type: 'string' },
                      name: { type: 'string' },
                      reference: { type: 'string' },
                      price: {
                        type: 'object',
                        properties: {
                          amount: { type: 'number' },
                          currency: { type: 'string' },
                          formatted: { type: 'string' }
                        }
                      },
                      availability: {
                        type: 'object',
                        properties: {
                          available: { type: 'boolean' },
                          quantity: { type: 'number' }
                        }
                      },
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
      const {
        brand,
        name,
        model,
        year,
        engineConfiguration,
        engineTechnicalCode,
        release,
        q,
        limit,
        onlyAvailable
      } = vehicleSearchQuerySchema.parse(request.query);

      // At least one filter must be provided
      if (!brand && !name && !model) {
        return reply.status(400).send({
          success: false,
          error: {
            message: 'Pelo menos um filtro (brand, name, ou model) deve ser fornecido',
            code: 'VALIDATION_ERROR'
          }
        });
      }

      logger.info({
        requestId,
        brand,
        name,
        model,
        year,
        engineConfiguration,
        engineTechnicalCode,
        release,
        q,
        limit,
        onlyAvailable
      }, 'Buscando produtos por veículo com especificações detalhadas');

      const result = await vehicleSearchService.searchByVehicleDetailed(
        brand,
        name,
        model,
        year,
        engineConfiguration,
        engineTechnicalCode,
        release,
        q,
        limit
      );

      // Filter only available products if requested
      if (onlyAvailable) {
        const originalCount = result.totalFound;
        result.products = result.products.filter(product => product.availability.available);
        result.totalFound = result.products.length;
        logger.info({
          requestId,
          originalCount,
          availableCount: result.products.length
        }, 'Filtered products by availability');
      }

      const duration = Date.now() - startTime;

      logger.info({
        requestId,
        brand,
        name,
        model,
        productsFound: result.totalFound,
        duration
      }, 'Busca por veículo concluída');

      return reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Erro ao buscar produtos por veículo');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            message: 'Parâmetros inválidos',
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
          message: 'Erro interno do servidor',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  });

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
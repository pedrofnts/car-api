import type { FastifyInstance } from 'fastify';
import { firebirdService } from '@/services/firebird-simple.js';
import { unifiedProductService } from '@/services/unified-product-service.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/utils/errors.js';
import { z } from 'zod';

const productSearchSchema = z.object({
  referencia: z.string().min(1, 'Referência é obrigatória').max(50, 'Referência deve ter no máximo 50 caracteres')
});

const productDescriptionSearchSchema = z.object({
  q: z.string().min(1, 'Query é obrigatória').max(100, 'Query deve ter no máximo 100 caracteres'),
  includeDetails: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20)
});

const productParamsSchema = z.object({
  cproduto: z.string().min(1, 'CPRODUTO é obrigatório').max(20, 'CPRODUTO deve ter no máximo 20 caracteres')
});

const batchProductsSchema = z.object({
  cprodutos: z.array(z.string().min(1).max(20)).min(1).max(50),
  includeDetails: z.boolean().optional().default(true)
});

interface ProductResult {
  CPRODUTO: string;
  DESCRICAO: string;
  REFERENCIA: string;
}

interface PriceResult {
  PRECO: number;
}

interface StockResult {
  SALDO: number;
}

export async function productRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { referencia: string };
  }>('/products/search', {
    schema: {
      description: 'Buscar produto por referência',
      tags: ['products'],
      querystring: {
        type: 'object',
        properties: {
          referencia: {
            type: 'string',
            description: 'Referência do produto (ex: SK-385S)',
            minLength: 1,
            maxLength: 50
          }
        },
        required: ['referencia']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      CPRODUTO: { type: 'string' },
                      DESCRICAO: { type: 'string' }
                    }
                  }
                },
                searchTerm: { type: 'string' },
                totalFound: { type: 'number' }
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
      const { referencia } = productSearchSchema.parse(request.query);
      
      logger.info({ requestId, referencia }, 'Buscando produto por referência');

      // Normalizar a referência removendo hífens para busca alternativa
      const referenciaLimpa = referencia.replace(/[-\s]/g, '');
      
      // Query SQL para buscar tanto com hífen quanto sem hífen, case insensitive
      const sql = `
        SELECT DISTINCT CPRODUTO, DESCRICAO, REFERENCIA
        FROM PRODUTO
        WHERE UPPER(REFERENCIA) = UPPER(?)
           OR UPPER(REFERENCIA) = UPPER(?)
           OR UPPER(REPLACE(REFERENCIA, '-', '')) = UPPER(?)
           OR UPPER(REPLACE(REFERENCIA, ' ', '')) = UPPER(?)
        ORDER BY CPRODUTO
      `;

      const params = [
        referencia,           // Busca exata
        referenciaLimpa,      // Busca sem hífens/espaços
        referenciaLimpa,      // Busca removendo hífens da coluna
        referenciaLimpa       // Busca removendo espaços da coluna
      ];

      const result = await firebirdService.executeQuery<ProductResult>(sql, params);
      const duration = Date.now() - startTime;

      // Debug: log o resultado exato
      logger.info({ 
        requestId, 
        referencia, 
        rawResult: result.rows,
        firstRow: result.rows[0],
        keys: result.rows[0] ? Object.keys(result.rows[0]) : [],
        duration 
      }, 'Debug: resultado da query');

      if (result.rows.length === 0) {
        logger.info({ requestId, referencia, duration }, 'Nenhum produto encontrado');
        
        return reply.status(404).send({
          success: false,
          error: {
            message: 'Produto não encontrado',
            code: 'PRODUCT_NOT_FOUND'
          }
        });
      }

      logger.info({ 
        requestId, 
        referencia, 
        productsFound: result.rows.length,
        duration 
      }, 'Produtos encontrados com sucesso');

      return reply.send({
        success: true,
        data: {
          products: result.rows,
          searchTerm: referencia,
          totalFound: result.rows.length
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Erro ao buscar produto');

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

  // New endpoint: Search by description (natural language)
  fastify.get<{
    Querystring: { q: string; includeDetails?: string; limit?: string };
  }>('/products/search/description', {
    schema: {
      description: 'Buscar produtos por descrição (texto natural)',
      tags: ['products'],
      querystring: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            description: 'Texto de busca (ex: freio, óleo, vela)',
            minLength: 1,
            maxLength: 100
          },
          includeDetails: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Incluir preço e estoque na resposta',
            default: 'false'
          },
          limit: {
            type: 'string',
            description: 'Número máximo de resultados',
            default: '20'
          }
        },
        required: ['q']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                totalFound: { type: 'number' },
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      cproduto: { type: 'string' },
                      name: { type: 'string' },
                      reference: { type: 'string' },
                      quickDescription: { type: 'string' },
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
                          status: { type: 'string' },
                          quantity: { type: 'number' },
                          message: { type: 'string' }
                        }
                      }
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
      const { q, includeDetails, limit } = productDescriptionSearchSchema.parse(request.query);

      logger.info({ requestId, q, includeDetails, limit }, 'Buscando produtos por descrição');

      const result = await unifiedProductService.searchByDescription(q, includeDetails, limit);
      const duration = Date.now() - startTime;

      logger.info({
        requestId,
        q,
        productsFound: result.totalFound,
        duration
      }, 'Busca por descrição concluída');

      return reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Erro ao buscar produtos por descrição');

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

  // New endpoint: Batch product details
  fastify.post<{
    Body: { cprodutos: string[]; includeDetails?: boolean };
  }>('/products/batch', {
    schema: {
      description: 'Buscar múltiplos produtos de uma vez',
      tags: ['products'],
      body: {
        type: 'object',
        properties: {
          cprodutos: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 50,
            description: 'Lista de códigos de produtos'
          },
          includeDetails: {
            type: 'boolean',
            default: true,
            description: 'Incluir preço e estoque (sempre true para batch)'
          }
        },
        required: ['cprodutos']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                totalFound: { type: 'number' },
                totalRequested: { type: 'number' },
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      cproduto: { type: 'string' },
                      name: { type: 'string' },
                      reference: { type: 'string' },
                      price: { type: 'object' },
                      availability: { type: 'object' }
                    }
                  }
                },
                notFound: {
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
      const { cprodutos } = batchProductsSchema.parse(request.body);

      logger.info({ requestId, count: cprodutos.length }, 'Buscando produtos em lote');

      const result = await unifiedProductService.getBatch(cprodutos);
      const duration = Date.now() - startTime;

      logger.info({
        requestId,
        totalRequested: result.totalRequested,
        totalFound: result.totalFound,
        duration
      }, 'Busca em lote concluída');

      return reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Erro ao buscar produtos em lote');

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
    Params: { cproduto: string };
    Querystring: { referencia?: string; includeDetails?: string };
  }>('/products/:cproduto', {
    schema: {
      description: 'Get product price and stock information by CPRODUTO or referencia (with optional details)',
      tags: ['products'],
      params: {
        type: 'object',
        properties: {
          cproduto: {
            type: 'string',
            description: 'Product code (ex: 39357014)',
            minLength: 1,
            maxLength: 20
          }
        },
        required: ['cproduto']
      },
      querystring: {
        type: 'object',
        properties: {
          referencia: {
            type: 'string',
            description: 'Product reference (ex: SK-385S) - if provided, overrides cproduto parameter',
            minLength: 1,
            maxLength: 50
          },
          includeDetails: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Include chatbot-friendly formatted response',
            default: 'false'
          }
        },
        required: []
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              oneOf: [
                {
                  // Simple format (includeDetails=false)
                  type: 'object',
                  properties: {
                    cproduto: { type: 'string' },
                    price: { type: 'number' },
                    stock: {
                      type: 'object',
                      properties: {
                        quantity: { type: 'number' },
                        available: { type: 'boolean' }
                      }
                    }
                  }
                },
                {
                  // Detailed format (includeDetails=true)
                  type: 'object',
                  properties: {
                    cproduto: { type: 'string' },
                    name: { type: 'string' },
                    reference: { type: 'string' },
                    quickDescription: { type: 'string' },
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
                        status: { 
                          type: 'string',
                          enum: ['in_stock', 'low_stock', 'out_of_stock', 'on_order']
                        },
                        quantity: { type: 'number' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              ]
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
      const { cproduto: cprodutoParam } = productParamsSchema.parse(request.params);
      const { referencia, includeDetails: includeDetailsStr } = request.query;
      const includeDetails = includeDetailsStr === 'true';

      let cproduto = cprodutoParam;
      
      // Se referencia foi fornecida, buscar o CPRODUTO baseado na referência
      if (referencia) {
        logger.info({ requestId, referencia }, 'Buscando CPRODUTO por referência');
        
        // Validar referência
        const referenciaValidation = productSearchSchema.safeParse({ referencia });
        if (!referenciaValidation.success) {
          return reply.status(400).send({
            success: false,
            error: {
              message: 'Referência inválida',
              code: 'VALIDATION_ERROR',
              details: referenciaValidation.error.errors
            }
          });
        }
        
        // Normalizar a referência seguindo a mesma lógica do endpoint de search
        const referenciaLimpa = referencia.replace(/[-\s]/g, '');
        
        const searchSql = `
          SELECT DISTINCT CPRODUTO
          FROM PRODUTO
          WHERE UPPER(REFERENCIA) = UPPER(?)
             OR UPPER(REFERENCIA) = UPPER(?)
             OR UPPER(REPLACE(REFERENCIA, '-', '')) = UPPER(?)
             OR UPPER(REPLACE(REFERENCIA, ' ', '')) = UPPER(?)
          ROWS 1
        `;

        const searchParams = [
          referencia,           // Busca exata
          referenciaLimpa,      // Busca sem hífens/espaços
          referenciaLimpa,      // Busca removendo hífens da coluna
          referenciaLimpa       // Busca removendo espaços da coluna
        ];

        const searchResult = await firebirdService.executeQuery<ProductResult>(searchSql, searchParams);
        
        if (searchResult.rows.length === 0) {
          logger.info({ requestId, referencia }, 'Produto não encontrado pela referência');
          
          return reply.status(404).send({
            success: false,
            error: {
              message: 'Produto não encontrado pela referência',
              code: 'PRODUCT_NOT_FOUND'
            }
          });
        }
        
        cproduto = searchResult.rows[0]!.CPRODUTO;
        logger.info({ requestId, referencia, cproduto }, 'CPRODUTO encontrado pela referência');
      }

      // If includeDetails is true, use unified service for chatbot-friendly response
      if (includeDetails) {
        logger.info({ requestId, cproduto }, 'Buscando detalhes completos do produto');

        const productDetails = await unifiedProductService.getProductDetails(cproduto);
        const duration = Date.now() - startTime;

        if (!productDetails) {
          logger.info({ requestId, cproduto, duration }, 'Produto não encontrado');

          return reply.status(404).send({
            success: false,
            error: {
              message: 'Produto não encontrado',
              code: 'PRODUCT_NOT_FOUND'
            }
          });
        }

        logger.info({
          requestId,
          cproduto,
          duration
        }, 'Detalhes do produto encontrados');

        return reply.send({
          success: true,
          data: productDetails
        });
      }

      logger.info({ requestId, cproduto }, 'Fetching product price and stock information');

      // Query for price
      const priceQuery = `
        SELECT PRECO
        FROM PRECO
        WHERE CPRODUTO = ?
        ROWS 1
      `;

      // Query for stock
      const stockQuery = `
        SELECT SALDO
        FROM SALDO
        WHERE CPRODUTO = ?
        ROWS 1
      `;

      // Execute both queries in parallel
      const [priceResult, stockResult] = await Promise.all([
        firebirdService.executeQuery<PriceResult>(priceQuery, [cproduto]),
        firebirdService.executeQuery<StockResult>(stockQuery, [cproduto])
      ]);

      const duration = Date.now() - startTime;

      logger.info({ 
        requestId, 
        cproduto, 
        priceRows: priceResult.rows.length,
        stockRows: stockResult.rows.length,
        duration 
      }, 'Debug: query results');

      // Check if product price exists
      if (priceResult.rows.length === 0) {
        logger.info({ requestId, cproduto, duration }, 'Product price not found');
        
        return reply.status(404).send({
          success: false,
          error: {
            message: 'Product not found',
            code: 'PRODUCT_NOT_FOUND'
          }
        });
      }

      const priceData = priceResult.rows[0];
      const stockData = stockResult.rows[0];
      
      // Additional safety check for priceData (should not be needed due to length check above)
      if (!priceData) {
        logger.error({ requestId, cproduto, duration }, 'Price data is unexpectedly undefined');
        return reply.status(500).send({
          success: false,
          error: {
            message: 'Internal server error',
            code: 'INTERNAL_ERROR'
          }
        });
      }
      
      // Get stock information
      const stockQuantity = stockData ? stockData.SALDO : 0;
      const isAvailable = stockQuantity > 0;
      
      logger.info({ 
        requestId, 
        cproduto, 
        price: priceData.PRECO,
        stockQuantity,
        isAvailable,
        duration 
      }, 'Product information found successfully');

      return reply.send({
        success: true,
        data: {
          cproduto: cproduto,
          price: priceData.PRECO,
          stock: {
            quantity: stockQuantity,
            available: isAvailable
          }
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ requestId, error, duration }, 'Error fetching product information');

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
}
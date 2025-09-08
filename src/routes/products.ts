import type { FastifyInstance } from 'fastify';
import { firebirdService } from '@/services/firebird-simple.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/utils/errors.js';
import { z } from 'zod';

const productSearchSchema = z.object({
  referencia: z.string().min(1, 'Referência é obrigatória').max(50, 'Referência deve ter no máximo 50 caracteres')
});

const productParamsSchema = z.object({
  cproduto: z.string().min(1, 'CPRODUTO é obrigatório').max(20, 'CPRODUTO deve ter no máximo 20 caracteres')
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

  fastify.get<{
    Params: { cproduto: string };
  }>('/products/:cproduto', {
    schema: {
      description: 'Get product price and stock information by CPRODUTO',
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
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
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
      const { cproduto } = productParamsSchema.parse(request.params);
      
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
import type { FastifyInstance } from 'fastify';
import { graphqlService } from '@/services/graphql-service.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/utils/errors.js';
import { z } from 'zod';

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

const plateParamsSchema = z.object({
  plate: z.string().min(1, 'Plate is required').max(10, 'Plate must be at most 10 characters')
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
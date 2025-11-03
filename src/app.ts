import Fastify, { type FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { vehicleRoutes } from '@/routes/vehicles.js';
import { productRoutes } from '@/routes/products.js';
import { AppError } from '@/utils/errors.js';
import { generateRequestId } from '@/utils/request-id.js';

export function createApp(): FastifyInstance {
  const fastify = Fastify({
    logger: false,
    genReqId: () => generateRequestId(),
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    trustProxy: true
  });

  // Security middleware
  fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    }
  });

  // CORS
  fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
  });

  // Rate limiting
  fastify.register(fastifyRateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    errorResponseBuilder: (_request, context) => {
      return {
        success: false,
        error: {
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.round(context.ttl / 1000)
        }
      };
    }
  });

  // Swagger documentation
  fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Car API',
        description: 'Node.js API with GraphQL consumption, OAuth 2.0, and Firebird integration',
        version: '1.0.0'
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: 'Development server'
        },
        {
          url: 'https://carapi.iszap.com.br',
          description: 'Production server'
        }
      ],
      tags: [
        { name: 'vehicles', description: 'Vehicle-related endpoints' },
        { name: 'products', description: 'Product-related endpoints' }
      ]
    }
  });

  fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    }
  });

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    
    if (error instanceof AppError) {
      logger.warn({ requestId, error: error.message, code: error.code }, 'Application error');
      
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          message: error.message,
          code: error.code
        }
      });
    }

    // Fastify validation errors
    if (error.validation) {
      logger.warn({ requestId, validation: error.validation }, 'Validation error');
      
      return reply.status(400).send({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.validation
        }
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      logger.warn({ requestId }, 'Rate limit exceeded');
      
      return reply.status(429).send({
        success: false,
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED'
        }
      });
    }

    // Unhandled errors
    logger.error({ requestId, error }, 'Unhandled error');
    
    return reply.status(500).send({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((request, reply) => {
    const requestId = request.id;
    
    logger.warn({ requestId, url: request.url, method: request.method }, 'Route not found');
    
    return reply.status(404).send({
      success: false,
      error: {
        message: 'Route not found',
        code: 'NOT_FOUND'
      }
    });
  });

  // Register routes
  fastify.register(vehicleRoutes, { prefix: '/api/v1' });
  fastify.register(productRoutes, { prefix: '/api/v1' });

  // Root health check
  fastify.get('/', async () => {
    return {
      success: true,
      data: {
        name: 'Car API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      }
    };
  });

  return fastify as FastifyInstance;
}
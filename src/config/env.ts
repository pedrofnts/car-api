import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  OAUTH_CLIENT_ID: z.string().min(1, 'OAuth Client ID is required'),
  OAUTH_CLIENT_SECRET: z.string().min(1, 'OAuth Client Secret is required'),
  OAUTH_TOKEN_URL: z.string().url('OAuth Token URL must be a valid URL'),
  OAUTH_SCOPE: z.string().optional(),
  
  GRAPHQL_ENDPOINT: z.string().url('GraphQL endpoint must be a valid URL'),
  GRAPHQL_TIMEOUT: z.coerce.number().default(30000),
  
  FIREBIRD_HOST: z.string().min(1, 'Firebird host is required'),
  FIREBIRD_PORT: z.coerce.number().default(3050),
  FIREBIRD_DATABASE: z.string().min(1, 'Firebird database path is required'),
  FIREBIRD_USER: z.string().min(1, 'Firebird user is required'),
  FIREBIRD_PASSWORD: z.string().min(1, 'Firebird password is required'),
  FIREBIRD_POOL_MIN: z.coerce.number().default(5),
  FIREBIRD_POOL_MAX: z.coerce.number().default(20),
  FIREBIRD_POOL_IDLE_TIMEOUT: z.coerce.number().default(30000),
  FIREBIRD_QUERY_TIMEOUT: z.coerce.number().default(10000),
  
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
  
  CIRCUIT_BREAKER_TIMEOUT: z.coerce.number().default(60000),
  CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE: z.coerce.number().default(50),
  CIRCUIT_BREAKER_RESET_TIMEOUT: z.coerce.number().default(30000),
  
  CACHE_TTL: z.coerce.number().default(300000),
  ENABLE_CACHE: z.coerce.boolean().default(false),
});

export type Environment = z.infer<typeof envSchema>;

let cachedEnv: Environment | null = null;

export function getEnv(): Environment {
  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    cachedEnv = envSchema.parse(process.env);
    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      throw new Error(
        `Environment validation failed:\n${errorMessages.join('\n')}`
      );
    }
    throw error;
  }
}

export const config = getEnv();
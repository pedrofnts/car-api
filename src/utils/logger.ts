import pino from 'pino';
import { getEnv } from '@/config/env.js';

const env = getEnv();

const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  serializers: {
    error: pino.stdSerializers.err,
  },
});

export { logger };

export function createRequestLogger(requestId: string, correlationId?: string) {
  return logger.child({
    requestId,
    correlationId,
  });
}
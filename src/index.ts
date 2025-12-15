import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { firebirdService } from './services/firebird-simple.js';

async function startServer(): Promise<void> {
  try {
    // Initialize Firebird connection
    logger.info('Initializing Firebird connection...');
    await firebirdService.initialize();

    const app = createApp();
    const address = await app.listen({
      port: config.PORT,
      host: '0.0.0.0'
    });
    
    logger.info({
      address,
      port: config.PORT,
      env: config.NODE_ENV,
      docs: `http://localhost:${config.PORT}/docs`
    }, 'Server started successfully');

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Shutting down server');
      
      try {
        await app.close();
        await firebirdService.destroy();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  process.exit(1);
});

void startServer();
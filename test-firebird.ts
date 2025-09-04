#!/usr/bin/env tsx

import { firebirdService } from './src/services/firebird-connection.js';
import { logger } from './src/utils/logger.js';

async function testFirebirdConnection(): Promise<void> {
  try {
    logger.info('Testing Firebird connection...');

    // Initialize connection pool
    await firebirdService.initialize();
    logger.info('Connection pool initialized successfully');

    // Test health check
    logger.info('Testing health check...');
    const isHealthy = await firebirdService.healthCheck();
    logger.info({ isHealthy }, 'Health check result');

    if (!isHealthy) {
      logger.error('Health check failed');
      return;
    }

    // Get pool info
    const poolInfo = firebirdService.getPoolInfo();
    logger.info({ poolInfo }, 'Connection pool info');

    // Test basic query - List tables in database
    logger.info('Listing database tables...');
    const tablesResult = await firebirdService.executeQuery(`
      SELECT RDB$RELATION_NAME as table_name
      FROM RDB$RELATIONS
      WHERE RDB$VIEW_BLR IS NULL
        AND RDB$SYSTEM_FLAG = 0
      ORDER BY RDB$RELATION_NAME
      ROWS 20
    `);

    logger.info({ 
      tableCount: tablesResult.count,
      executionTime: tablesResult.executionTime,
      tables: tablesResult.rows.map(row => (row as any).table_name?.trim())
    }, 'Database tables listed');

    // Test another query - Get database info
    logger.info('Getting database information...');
    const dbInfoResult = await firebirdService.executeQuery(`
      SELECT
        RDB$CHARACTER_SET_NAME as charset,
        RDB$NUMBER_OF_CHARACTERS as char_length
      FROM RDB$DATABASE
      CROSS JOIN RDB$CHARACTER_SETS
      WHERE RDB$CHARACTER_SET_ID = (
        SELECT RDB$CHARACTER_SET_ID 
        FROM RDB$DATABASE
      )
    `);

    logger.info({ 
      dbInfo: dbInfoResult.rows[0],
      executionTime: dbInfoResult.executionTime
    }, 'Database information');

    logger.info('All Firebird tests completed successfully!');

  } catch (error) {
    logger.error({ error }, 'Firebird test failed');
    
    if (error instanceof Error) {
      console.error('\nError details:');
      console.error('Message:', error.message);
      console.error('Name:', error.name);
      if ('code' in error) {
        console.error('Code:', (error as any).code);
      }
      if ('statusCode' in error) {
        console.error('Status Code:', (error as any).statusCode);
      }
      if ('details' in error) {
        console.error('Details:', JSON.stringify((error as any).details, null, 2));
      }
    }
    
    process.exit(1);
  } finally {
    // Clean up
    await firebirdService.destroy();
  }
}

async function main(): Promise<void> {
  console.log('🔥 Starting Firebird connection tests...\n');
  await testFirebirdConnection();
  console.log('\n✅ Tests completed!');
}

void main();
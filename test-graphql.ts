#!/usr/bin/env tsx

import { graphqlService } from './src/services/graphql-service.js';
import { logger } from './src/utils/logger.js';

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

async function testVehicleQuery(): Promise<void> {
  try {
    logger.info('Testing GraphQL connection and vehicle query...');

    // Test 1: Health check
    logger.info('1. Testing health check...');
    const isHealthy = await graphqlService.healthCheck();
    logger.info({ isHealthy }, 'Health check result');

    if (!isHealthy) {
      logger.error('Health check failed, aborting tests');
      return;
    }

    // Test 2: Vehicle by plate query
    logger.info('2. Testing vehicle by plate query...');
    const plate = 'ASC0158';
    
    const result = await graphqlService.executeQuery(vehicleByPlateQuery, {
      plate
    });

    logger.info({ plate, result }, 'Vehicle query result');

    // Test 3: Check metrics
    const metrics = graphqlService.getMetrics();
    logger.info({ metrics }, 'GraphQL client metrics');

    logger.info('All tests completed successfully!');

  } catch (error) {
    logger.error({ error }, 'GraphQL test failed');
    
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
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting GraphQL tests...\n');
  await testVehicleQuery();
  console.log('\n✅ Tests completed!');
}

void main();
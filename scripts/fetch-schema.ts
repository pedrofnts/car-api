#!/usr/bin/env tsx

import { fetchAndSaveSchema } from '@/services/graphql-schema-fetcher.js';
import { logger } from '@/utils/logger.js';

async function main(): Promise<void> {
  try {
    await fetchAndSaveSchema();
    logger.info('Schema fetch completed successfully');
  } catch (error) {
    logger.error({ error }, 'Schema fetch failed');
    process.exit(1);
  }
}

void main();
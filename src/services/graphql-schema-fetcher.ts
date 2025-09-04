import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { graphqlClient } from './graphql-client.js';
import { logger } from '@/utils/logger.js';

export async function fetchAndSaveSchema(): Promise<void> {
  try {
    logger.info('Fetching GraphQL schema...');

    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            ...FullType
          }
          directives {
            name
            description
            locations
            args {
              ...InputValue
            }
          }
        }
      }

      fragment FullType on __Type {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            ...InputValue
          }
          type {
            ...TypeRef
          }
          isDeprecated
          deprecationReason
        }
        inputFields {
          ...InputValue
        }
        interfaces {
          ...TypeRef
        }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        possibleTypes {
          ...TypeRef
        }
      }

      fragment InputValue on __InputValue {
        name
        description
        type { ...TypeRef }
        defaultValue
      }

      fragment TypeRef on __Type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await graphqlClient.request(introspectionQuery);

    // Save the schema to file
    const schemaPath = resolve('src/generated/schema.json');
    await writeFile(schemaPath, JSON.stringify(result, null, 2));

    logger.info({ schemaPath }, 'GraphQL schema saved successfully');

    // Extract available operations for logging
    const schema = result as any;
    const queryType = schema.__schema.queryType;
    const mutationType = schema.__schema.mutationType;
    
    const queryFields = schema.__schema.types
      .find((type: any) => type.name === queryType?.name)
      ?.fields?.map((field: any) => field.name) || [];

    const mutationFields = schema.__schema.types
      .find((type: any) => type.name === mutationType?.name)
      ?.fields?.map((field: any) => field.name) || [];

    logger.info({
      queryFields: queryFields.slice(0, 10), // Show first 10
      mutationFields: mutationFields.slice(0, 10), // Show first 10
      totalQueries: queryFields.length,
      totalMutations: mutationFields.length,
    }, 'GraphQL schema analysis');

  } catch (error) {
    logger.error({ error }, 'Failed to fetch GraphQL schema');
    throw error;
  }
}

export async function generateTypes(): Promise<void> {
  try {
    logger.info('Generating TypeScript types from GraphQL schema...');
    
    // For now, just fetch the schema
    // The actual type generation will be done by graphql-code-generator
    await fetchAndSaveSchema();
    
    logger.info('Schema fetched. Run "npm run generate" to generate TypeScript types');
    
  } catch (error) {
    logger.error({ error }, 'Failed to generate types');
    throw error;
  }
}
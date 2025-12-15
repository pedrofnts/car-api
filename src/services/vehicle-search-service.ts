/**
 * Vehicle Search Service
 * Handles vehicle searches by brand/model and enriches results with product pricing/stock
 */

import { graphqlClient } from './graphql-client.js';
import { logger } from '@/utils/logger.js';
import { unifiedProductService } from './unified-product-service.js';
import type { ChatbotVehicleSearchResult, ChatbotProductDetails, ChatbotVehicleInfo } from '@/types/chatbot-responses.js';

interface CatalogSearchInput {
  query?: string;
  vehicles?: {
    brands?: string;
    names?: string;
    models?: string;
  };
  skip?: number;
  take?: number;
}


interface ProductNode {
  product: {
    partNumber?: string;
    brand?: {
      id: string;
      imageUrl?: string;
      name: string;
    };
    components?: Array<{
      partNumber: string;
      productGroup?: string;
      productId?: string;
    }>;
    summaryApplication?: string;
    applicationDescription?: string;
    specifications?: Array<{
      description: string;
      value: string;
    }>;
  };
}

interface CatalogSearchResponse {
  catalogSearch: {
    nodes: ProductNode[];
  };
}

class VehicleSearchService {
  /**
   * Search products by detailed vehicle specifications
   * Includes year, engine configuration, technical code, and generation
   */
  async searchByVehicleDetailed(
    brand?: string,
    name?: string,
    model?: string,
    year?: number,
    engineConfiguration?: string,
    engineTechnicalCode?: string,
    release?: string,
    query = '',
    limit = 20
  ): Promise<ChatbotVehicleSearchResult> {
    try {
      // Build vehicles filter with detailed specifications
      const vehicles: CatalogSearchInput['vehicles'] = {};
      if (brand) vehicles.brands = brand;
      if (name) vehicles.names = name;
      if (model) vehicles.models = model;

      // Build a more specific query that includes vehicle specifications
      let searchQuery = query;
      if (year) {
        searchQuery += ` ${year}`;
      }
      if (engineConfiguration) {
        searchQuery += ` ${engineConfiguration}`;
      }
      if (engineTechnicalCode) {
        searchQuery += ` ${engineTechnicalCode}`;
      }
      if (release) {
        searchQuery += ` ${release}`;
      }

      // Use the existing catalogSearch but with enhanced filtering
      const graphqlQuery = `
        query CatalogSearch($query: String!, $vehicles: VehicleFilterInput) {
          catalogSearch(query: $query, vehicles: $vehicles) {
            nodes {
              product {
                partNumber
                brand {
                  id
                  imageUrl
                  name
                }
                components {
                  partNumber
                  productGroup
                  productId
                }
                summaryApplication
                applicationDescription
                specifications {
                  description
                  value
                }
              }
            }
          }
        }
      `;

      const variables = {
        query: searchQuery.trim(),
        vehicles,
      };

      logger.info({ 
        brand, 
        name, 
        model, 
        year, 
        engineConfiguration, 
        engineTechnicalCode, 
        release, 
        searchQuery: searchQuery.trim(), 
        limit 
      }, 'Searching products by detailed vehicle specifications');

      const response = await graphqlClient.request<CatalogSearchResponse>(graphqlQuery, variables);
      const { nodes } = response.catalogSearch;

      // Extract vehicle info from input parameters
      const vehicleInfo: ChatbotVehicleInfo = {};
      if (brand) vehicleInfo.brand = brand;
      if (name) vehicleInfo.name = name;
      if (model) vehicleInfo.model = model;
      if (year) vehicleInfo.modelYear = year;

      // Enrich with Firebird data (CPRODUTO, stock, price)
      const products = await this.enrichProductsWithFirebirdData(nodes.slice(0, limit));

      return {
        vehicle: vehicleInfo,
        totalFound: products.length,
        products,
      };
    } catch (error) {
      logger.error({ brand, name, model, year, engineConfiguration, error }, 'Error searching by detailed vehicle specifications');
      throw error;
    }
  }

  /**
   * Search products by vehicle brand, name, and model (legacy method)
   * Enriches results with pricing and stock from Firebird
   */
  async searchByVehicle(
    brand?: string,
    name?: string,
    model?: string,
    query = '',
    limit = 20
  ): Promise<ChatbotVehicleSearchResult> {
    try {
      // Build vehicles filter
      const vehicles: CatalogSearchInput['vehicles'] = {};
      if (brand) vehicles.brands = brand;
      if (name) vehicles.names = name;
      if (model) vehicles.models = model;

      // Build GraphQL query based on the correct API structure
      const graphqlQuery = `
        query CatalogSearch($query: String!, $vehicles: VehicleFilterInput) {
          catalogSearch(query: $query, vehicles: $vehicles) {
            nodes {
              product {
                partNumber
                brand {
                  id
                  imageUrl
                  name
                }
                components {
                  partNumber
                  productGroup
                  productId
                }
                summaryApplication
                applicationDescription
                specifications {
                  description
                  value
                }
              }
            }
          }
        }
      `;

      const variables = {
        query,
        vehicles,
      };

      logger.info({ brand, name, model, query, limit }, 'Searching products by vehicle');

      const response = await graphqlClient.request<CatalogSearchResponse>(graphqlQuery, variables);
      const { nodes } = response.catalogSearch;

      // Extract vehicle info from input parameters (since API doesn't return vehicle info in this query)
      const vehicleInfo: ChatbotVehicleInfo = {};
      if (brand) vehicleInfo.brand = brand;
      if (name) vehicleInfo.name = name;
      if (model) vehicleInfo.model = model;

      // Return GraphQL data only (no Firebird enrichment)
      const products: ChatbotProductDetails[] = nodes.slice(0, limit).map((node) => {
        const partNumber = node.product.partNumber || 'N/A';
        const product: ChatbotProductDetails = {
          cproduto: partNumber,
          name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
          reference: partNumber,
          availability: { available: false }, // No stock info from GraphQL
        };
        if (node.product.specifications) {
          product.specifications = node.product.specifications;
        }
        return product;
      });

      return {
        vehicle: vehicleInfo,
        totalFound: products.length,
        products,
      };
    } catch (error) {
      logger.error({ brand, name, model, error }, 'Error searching by vehicle');
      throw error;
    }
  }

  /**
   * Search products by vehicle plate
   * Uses existing catalogSearchByPlate query
   */
  async searchByPlate(
    plate: string,
    skip = 0,
    take = 20
  ): Promise<ChatbotVehicleSearchResult> {
    try {
      const graphqlQuery = `
        query CatalogSearchByPlate($plate: String!, $skip: Int, $take: Int) {
          catalogSearchByPlate(plate: $plate, skip: $skip, take: $take) {
            pageInfo {
              total
              skip
              take
            }
            vehicle {
              plate
              brand
              color
              madeYear
              modelYear
              model
            }
            nodes {
              product {
                partNumber
                brand {
                  name
                }
                summaryApplication
                applicationDescription
                specifications {
                  description
                  value
                }
              }
            }
          }
        }
      `;

      logger.info({ plate, skip, take }, 'Searching products by plate');

      const response = await graphqlClient.request<{ catalogSearchByPlate: CatalogSearchResponse['catalogSearch'] }>(
        graphqlQuery,
        { plate, skip, take }
      );

      const { nodes } = response.catalogSearchByPlate;

      const vehicleInfo: ChatbotVehicleInfo = {};
      if (plate) vehicleInfo.plate = plate;

      // Return GraphQL data only (no Firebird enrichment)
      const products: ChatbotProductDetails[] = nodes.map((node) => {
        const partNumber = node.product.partNumber || 'N/A';
        const product: ChatbotProductDetails = {
          cproduto: partNumber,
          name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
          reference: partNumber,
          availability: { available: false }, // No stock info from GraphQL
        };
        if (node.product.specifications) {
          product.specifications = node.product.specifications;
        }
        return product;
      });

      return {
        vehicle: vehicleInfo,
        totalFound: products.length,
        products,
      };
    } catch (error) {
      logger.error({ plate, error }, 'Error searching by plate');
      throw error;
    }
  }

  /**
   * Private helper: Enrich GraphQL products with Firebird data
   * Maps partNumber (reference) to CPRODUTO and fetches stock/price
   */
  private async enrichProductsWithFirebirdData(nodes: ProductNode[]): Promise<ChatbotProductDetails[]> {
    const enrichedProducts: ChatbotProductDetails[] = [];

    logger.info({ totalNodes: nodes.length }, 'Starting Firebird enrichment for products');

    for (const node of nodes) {
      const partNumber = node.product.partNumber || 'N/A';

      try {
        // Try to find CPRODUTO by reference in Firebird
        logger.info({ partNumber }, 'Looking up CPRODUTO by reference');
        const cproduto = await unifiedProductService.findCprodutoByReference(partNumber);

        if (cproduto) {
          logger.info({ partNumber, cproduto }, 'CPRODUTO found, fetching details');

          // Found in Firebird - get detailed info with stock
          const firebirdData = await unifiedProductService.getProductDetails(cproduto);

          logger.info({
            cproduto,
            hasPrice: !!firebirdData?.price,
            price: firebirdData?.price,
            hasAvailability: !!firebirdData?.availability
          }, 'Firebird data retrieved');

          if (firebirdData) {
            enrichedProducts.push({
              cproduto: firebirdData.cproduto,
              name: firebirdData.name,
              reference: firebirdData.reference,
              ...(firebirdData.price && { price: firebirdData.price }),
              availability: firebirdData.availability,
              specifications: node.product.specifications || []
            });
          } else {
            // CPRODUTO found but no details - use GraphQL data
            logger.warn({ cproduto, partNumber }, 'CPRODUTO found but getProductDetails returned null');
            enrichedProducts.push({
              cproduto: cproduto,
              name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
              reference: partNumber,
              availability: { available: false },
              specifications: node.product.specifications || []
            });
          }
        } else {
          // Not found in Firebird - return GraphQL data only
          logger.info({ partNumber }, 'Product not found in Firebird, using GraphQL data only');

          enrichedProducts.push({
            cproduto: partNumber,
            name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
            reference: partNumber,
            availability: { available: false },
            specifications: node.product.specifications || []
          });
        }
      } catch (error) {
        // Error fetching from Firebird - return GraphQL data only
        logger.warn({ partNumber, error }, 'Error enriching product with Firebird data');

        enrichedProducts.push({
          cproduto: partNumber,
          name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
          reference: partNumber,
          availability: { available: false },
          specifications: node.product.specifications || []
        });
      }
    }

    logger.info({ totalEnriched: enrichedProducts.length }, 'Firebird enrichment completed');
    return enrichedProducts;
  }

}

export const vehicleSearchService = new VehicleSearchService();

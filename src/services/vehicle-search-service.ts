/**
 * Vehicle Search Service
 * Handles vehicle searches by brand/model and enriches results with product pricing/stock
 */

import { graphqlClient } from './graphql-client.js';
import { unifiedProductService } from './unified-product-service.js';
import { logger } from '@/utils/logger.js';
import type { ChatbotVehicleSearchResult, ChatbotProductDetails, ChatbotVehicleInfo } from '@/types/chatbot-responses.js';
import { formatPrice, formatAvailability } from '@/types/chatbot-responses.js';

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
    includeDetails = false,
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

      let products: ChatbotProductDetails[];

      if (includeDetails && nodes.length > 0) {
        // Enrich with pricing and stock from Firebird
        products = await this.enrichProductsWithFirebirdData(nodes);
      } else {
        // Return basic GraphQL data only
        products = nodes.map((node) => {
          // Extract partNumber from applicationDescription since components is always null
          const productName = node.product.applicationDescription || node.product.summaryApplication || '';
          const match = productName.match(/- ([A-Z0-9\-\/]+)$/);
          const partNumber = match?.[1] || 'N/A';
          return {
            cproduto: partNumber,
            name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
            reference: partNumber,
            quickDescription: this.createQuickDescription(node.product),
            price: formatPrice(0),
            availability: formatAvailability(0),
          };
        }).slice(0, limit); // Apply limit here since API doesn't support pagination
      }

      const vehicleDescription = this.formatVehicleDescription(vehicleInfo);
      const summary = `Encontrado${products.length !== 1 ? 's' : ''} ${products.length} produto${products.length !== 1 ? 's' : ''} compatível${products.length !== 1 ? 'is' : ''} com ${vehicleDescription}${year ? ` ${year}` : ''}${engineConfiguration ? ` (${engineConfiguration})` : ''}`;

      return {
        vehicle: vehicleInfo,
        summary,
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
    includeDetails = false,
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

      let products: ChatbotProductDetails[];

      if (includeDetails && nodes.length > 0) {
        // Enrich with pricing and stock from Firebird
        products = await this.enrichProductsWithFirebirdData(nodes);
      } else {
        // Return basic GraphQL data only
        products = nodes.map((node) => {
          // Extract partNumber from applicationDescription since components is always null
          const productName = node.product.applicationDescription || node.product.summaryApplication || '';
          const match = productName.match(/- ([A-Z0-9\-\/]+)$/);
          const partNumber = match?.[1] || 'N/A';
          return {
            cproduto: partNumber,
            name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
            reference: partNumber,
            quickDescription: this.createQuickDescription(node.product),
            price: formatPrice(0),
            availability: formatAvailability(0),
          };
        }).slice(0, limit); // Apply limit here since API doesn't support pagination
      }

      const vehicleDescription = this.formatVehicleDescription(vehicleInfo);
      const summary = `Encontrado${products.length !== 1 ? 's' : ''} ${products.length} produto${products.length !== 1 ? 's' : ''} compatível${products.length !== 1 ? 'is' : ''} com ${vehicleDescription}`;

      return {
        vehicle: vehicleInfo,
        summary,
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
    includeDetails = false,
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

      let products: ChatbotProductDetails[];

      if (includeDetails && nodes.length > 0) {
        products = await this.enrichProductsWithFirebirdData(nodes);
      } else {
        products = nodes.map((node) => {
          // Extract partNumber from applicationDescription since components is always null
          const productName = node.product.applicationDescription || node.product.summaryApplication || '';
          const match = productName.match(/- ([A-Z0-9\-\/]+)$/);
          const partNumber = match?.[1] || 'N/A';
          return {
            cproduto: partNumber,
            name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
            reference: partNumber,
            quickDescription: this.createQuickDescription(node.product),
            price: formatPrice(0),
            availability: formatAvailability(0),
          };
        });
      }

      const vehicleDescription = this.formatVehicleDescription(vehicleInfo);
      const summary = `Encontrado${products.length !== 1 ? 's' : ''} ${products.length} produto${products.length !== 1 ? 's' : ''} compatível${products.length !== 1 ? 'is' : ''} com ${vehicleDescription}`;

      return {
        vehicle: vehicleInfo,
        summary,
        totalFound: products.length,
        products,
      };
    } catch (error) {
      logger.error({ plate, error }, 'Error searching by plate');
      throw error;
    }
  }

  // Private helper methods

  private async enrichProductsWithFirebirdData(
    nodes: ProductNode[]
  ): Promise<ChatbotProductDetails[]> {
    const enriched = await Promise.allSettled(
      nodes.slice(0, 20).map(async (node) => { // Limit to 20 to avoid too many requests
        // Extract partNumber from applicationDescription since components is always null
        const productName = node.product.applicationDescription || node.product.summaryApplication || '';
        let partNumber: string | undefined;
        
        // Extract partNumber from patterns like "FILTRO DE AR FRAM - CA9511"
        const match = productName.match(/- ([A-Z0-9\-\/]+)$/);
        if (match) {
          partNumber = match[1];
          logger.debug({ 
            productName, 
            extractedPartNumber: partNumber 
          }, 'Extracted partNumber from applicationDescription');
        }
        
        // Simplified debug log
        logger.debug({ partNumber, productName: node.product.summaryApplication || node.product.applicationDescription }, 'Processing product');
        
        if (!partNumber) {
          // No partNumber available, return basic GraphQL data
          logger.warn({ 
            productName: node.product.summaryApplication || node.product.applicationDescription 
          }, 'No partNumber found in GraphQL response or product name');
          return {
            cproduto: 'N/A',
            name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
            reference: 'N/A',
            quickDescription: this.createQuickDescription(node.product),
            price: formatPrice(0),
            availability: {
              status: 'out_of_stock' as const,
              quantity: 0,
              message: 'Consultar disponibilidade',
            },
          };
        }

        // Try to find the product in Firebird by reference (partNumber)
        const cproduto = await unifiedProductService.findCprodutoByReference(partNumber);

        logger.debug({ partNumber, cproduto }, 'CPRODUTO found');

        if (!cproduto) {
          // Product not found in Firebird, return GraphQL data only
          return {
            cproduto: partNumber,
            name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
            reference: partNumber,
            quickDescription: this.createQuickDescription(node.product),
            price: formatPrice(0),
            availability: {
              status: 'out_of_stock' as const,
              quantity: 0,
              message: 'Consultar disponibilidade',
            },
          };
        }

        // Get full details from Firebird
        const productDetails = await unifiedProductService.getProductDetails(cproduto);

        logger.debug({ cproduto, hasDetails: !!productDetails }, 'Product details result');

        if (!productDetails) {
          return {
            cproduto: partNumber,
            name: node.product.summaryApplication || node.product.applicationDescription || 'Sem descrição',
            reference: partNumber,
            quickDescription: this.createQuickDescription(node.product),
            price: formatPrice(0),
            availability: {
              status: 'out_of_stock' as const,
              quantity: 0,
              message: 'Consultar disponibilidade',
            },
          };
        }

        logger.info({ 
          cproduto, 
          productDetails: JSON.stringify(productDetails, null, 2)
        }, 'Successfully enriched product with Firebird data');
        
        return productDetails;
      })
    );

    const successfulResults = enriched
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<ChatbotProductDetails>).value);
    
    logger.info({ 
      totalNodes: nodes.length,
      processedNodes: enriched.length,
      successfulResults: successfulResults.length,
      failedResults: enriched.filter(r => r.status === 'rejected').length
    }, 'Firebird enrichment summary');
    
    return successfulResults;
  }

  private createQuickDescription(product: ProductNode['product']): string {
    const description = product.summaryApplication || product.applicationDescription || '';
    const maxLength = 80;

    if (description.length <= maxLength) {
      return description;
    }

    return description.substring(0, maxLength).trim() + '...';
  }

  private formatVehicleDescription(vehicle: {
    brand?: string;
    name?: string;
    model?: string;
    plate?: string;
    madeYear?: number;
    modelYear?: number;
  }): string {
    const parts: string[] = [];

    if (vehicle.brand) parts.push(vehicle.brand);
    if (vehicle.name) parts.push(vehicle.name);
    if (vehicle.model && vehicle.model !== vehicle.name) parts.push(vehicle.model);

    if (vehicle.madeYear || vehicle.modelYear) {
      const year = vehicle.modelYear || vehicle.madeYear;
      parts.push(String(year));
    }

    if (vehicle.plate) {
      parts.push(`(${vehicle.plate})`);
    }

    return parts.length > 0 ? parts.join(' ') : 'veículo informado';
  }
}

export const vehicleSearchService = new VehicleSearchService();

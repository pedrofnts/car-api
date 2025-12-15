/**
 * Unified Product Service
 * Combines product data, price, and stock information in a single service
 * Optimized for AI chatbot interactions
 */

import { firebirdService } from '@/services/firebird-simple.js';
import { logger } from '@/utils/logger.js';
import type {
  ChatbotProductDetails,
  ChatbotSearchResult,
  ChatbotBatchResult,
} from '@/types/chatbot-responses.js';
import { formatPrice, formatAvailability } from '@/types/chatbot-responses.js';

interface ProductResult {
  CPRODUTO: string;
  DESCRICAO: string;
  REFERENCIA: string;
}

interface PriceResult {
  PRECO: number;
}

interface StockResult {
  SALDO: number;
}

class UnifiedProductService {
  /**
   * Get complete product details including price and stock
   */
  async getProductDetails(cproduto: string): Promise<ChatbotProductDetails | null> {
    try {
      logger.info({ cproduto }, 'Getting product details (info, stock, price)');

      // Get product info, stock, and price in parallel
      const [productResult, stockResult, priceResult] = await Promise.all([
        this.getProductInfo(cproduto),
        this.getProductStock(cproduto),
        this.getProductPrice(cproduto),
      ]);

      logger.info({
        cproduto,
        hasProduct: !!productResult,
        hasStock: !!stockResult,
        hasPrice: !!priceResult,
        stockValue: stockResult?.SALDO,
        priceValue: priceResult?.PRECO
      }, 'Product details fetched from Firebird');

      if (!productResult) {
        logger.warn({ cproduto }, 'Product not found in PRODUTO table');
        return null;
      }

      const result = {
        cproduto: String(productResult.CPRODUTO),
        name: productResult.DESCRICAO,
        reference: productResult.REFERENCIA,
        quickDescription: this.createQuickDescription(productResult.DESCRICAO),
        ...(priceResult && {
          price: {
            amount: priceResult.PRECO,
            currency: 'BRL',
            formatted: `R$ ${priceResult.PRECO.toFixed(2).replace('.', ',')}`
          }
        }),
        availability: formatAvailability(stockResult?.SALDO || 0),
      };

      logger.info({ cproduto, hasPrice: !!result.price }, 'Returning product details');

      return result;
    } catch (error) {
      logger.error({ cproduto, error }, 'Error getting product details');
      throw error;
    }
  }

  /**
   * Search products by reference with full details
   */
  async searchByReference(
    referencia: string,
    includeDetails = false
  ): Promise<ChatbotSearchResult> {
    try {
      // Remove hífens e espaços da referência (GraphQL: "WO-156" → Firebird: "WO156")
      const referenciaLimpa = referencia.replace(/[-\s]/g, '');

      const sql = `
        SELECT DISTINCT CPRODUTO, DESCRICAO, REFERENCIA
        FROM PRODUTO
        WHERE UPPER(REFERENCIA) = UPPER(?)
        ORDER BY CPRODUTO
        ROWS 20
      `;

      logger.info({ 
        referenciaOriginal: referencia, 
        referenciaLimpa 
      }, 'Buscando produtos por referência limpa');

      const result = await firebirdService.executeQuery<ProductResult>(sql, [referenciaLimpa]);

      let products: ChatbotProductDetails[];

      if (includeDetails && result.rows.length > 0) {
        // Fetch price and stock for all products in parallel
        products = await this.enrichProductsWithDetails(result.rows);
      } else {
        // Return basic info only
        products = result.rows.map((row) => ({
          cproduto: String(row.CPRODUTO),
          name: row.DESCRICAO,
          reference: row.REFERENCIA,
          quickDescription: this.createQuickDescription(row.DESCRICAO),
          price: formatPrice(0), // Placeholder
          availability: formatAvailability(0), // Placeholder
        }));
      }

      const summary = this.createSearchSummary(products.length, 'referência', referencia);

      return {
        summary,
        totalFound: products.length,
        products,
      };
    } catch (error) {
      logger.error({ referencia, error }, 'Error searching by reference');
      throw error;
    }
  }

  /**
   * Search products by description (natural language)
   */
  async searchByDescription(
    query: string,
    includeDetails = false,
    limit = 20
  ): Promise<ChatbotSearchResult> {
    try {
      const sql = `
        SELECT DISTINCT CPRODUTO, DESCRICAO, REFERENCIA
        FROM PRODUTO
        WHERE UPPER(DESCRICAO) LIKE UPPER(?)
        ORDER BY DESCRICAO
        ROWS ?
      `;

      const searchTerm = `%${query}%`;
      const result = await firebirdService.executeQuery<ProductResult>(sql, [searchTerm, limit]);

      let products: ChatbotProductDetails[];

      if (includeDetails && result.rows.length > 0) {
        products = await this.enrichProductsWithDetails(result.rows);
      } else {
        products = result.rows.map((row) => ({
          cproduto: String(row.CPRODUTO),
          name: row.DESCRICAO,
          reference: row.REFERENCIA,
          quickDescription: this.createQuickDescription(row.DESCRICAO),
          price: formatPrice(0),
          availability: formatAvailability(0),
        }));
      }

      const summary = this.createSearchSummary(products.length, 'descrição', query);

      return {
        summary,
        totalFound: products.length,
        products,
        suggestions: this.generateSearchSuggestions(query, products),
      };
    } catch (error) {
      logger.error({ query, error }, 'Error searching by description');
      throw error;
    }
  }

  /**
   * Get multiple products with full details (batch operation)
   */
  async getBatch(cprodutos: string[]): Promise<ChatbotBatchResult> {
    try {
      const uniqueCprodutos = [...new Set(cprodutos)];
      const results = await Promise.allSettled(
        uniqueCprodutos.map((cproduto) => this.getProductDetails(cproduto))
      );

      const products: ChatbotProductDetails[] = [];
      const notFound: string[] = [];

      results.forEach((result, index) => {
        const cproduto = uniqueCprodutos[index]!;
        if (result.status === 'fulfilled' && result.value) {
          products.push(result.value);
        } else {
          notFound.push(cproduto);
        }
      });

      const summary = `Encontrado${products.length !== 1 ? 's' : ''} ${products.length} de ${cprodutos.length} produto${cprodutos.length !== 1 ? 's' : ''} solicitado${cprodutos.length !== 1 ? 's' : ''}`;

      return {
        summary,
        totalFound: products.length,
        totalRequested: cprodutos.length,
        products,
        notFound,
      };
    } catch (error) {
      logger.error({ cprodutos, error }, 'Error in batch operation');
      throw error;
    }
  }

  /**
   * Find product by reference and return CPRODUTO
   */
  async findCprodutoByReference(referencia: string): Promise<string | null> {
    try {
      const sql = `
        SELECT DISTINCT CPRODUTO
        FROM PRODUTO
        WHERE UPPER(REFERENCIA) = UPPER(?)
        ROWS 1
      `;

      // Primeiro tenta sem hífens e espaços (GraphQL: "WO-156" → Firebird: "WO156")
      const referenciaLimpa = referencia.replace(/[-\s]/g, '');

      logger.debug({
        referenciaOriginal: referencia,
        referenciaLimpa
      }, 'Buscando CPRODUTO por referência limpa (sem hífen)');

      let result = await firebirdService.executeQuery<ProductResult>(sql, [referenciaLimpa]);

      if (result.rows.length > 0) {
        logger.debug({
          referencia,
          referenciaLimpa,
          cproduto: result.rows[0]!.CPRODUTO
        }, 'CPRODUTO encontrado sem hífen');
        return result.rows[0]!.CPRODUTO;
      }

      // Se não encontrou sem hífen, tenta com a referência original (com hífen)
      logger.debug({
        referenciaOriginal: referencia
      }, 'Não encontrado sem hífen, tentando com hífen');

      result = await firebirdService.executeQuery<ProductResult>(sql, [referencia]);

      if (result.rows.length > 0) {
        logger.debug({
          referencia,
          cproduto: result.rows[0]!.CPRODUTO
        }, 'CPRODUTO encontrado com hífen');
        return result.rows[0]!.CPRODUTO;
      }

      logger.debug({ referencia, referenciaLimpa }, 'CPRODUTO não encontrado nem sem nem com hífen');
      return null;
    } catch (error) {
      logger.error({ referencia, error }, 'Error finding CPRODUTO by reference');
      // NÃO fazer throw do erro - retornar null para não quebrar toda a query
      return null;
    }
  }

  /**
   * Busca múltiplos produtos por referências em uma única query
   * Retorna todas as informações necessárias (CPRODUTO, DESCRICAO, REFERENCIA, SALDO)
   */
  async findProductsByReferences(referencias: string[]): Promise<Map<string, ChatbotProductDetails>> {
    if (referencias.length === 0) {
      return new Map();
    }

    try {
      // Limpa as referências (remove hífens e espaços)
      const referenciasLimpas = referencias.map(ref => ref.replace(/[-\s]/g, '').toUpperCase());

      logger.info({
        totalReferences: referencias.length,
        referenciasOriginais: referencias,
        referenciasLimpas: referenciasLimpas
      }, 'DEBUG: Iniciando busca em lote');

      // Cria placeholders para a query IN (?, ?, ?)
      const placeholders = referenciasLimpas.map(() => '?').join(', ');

      const sql = `
        SELECT DISTINCT
          p.CPRODUTO,
          p.DESCRICAO,
          p.REFERENCIA,
          COALESCE(s.SALDO, 0) AS SALDO
        FROM PRODUTO p
        LEFT JOIN SALDO s ON p.CPRODUTO = s.CPRODUTO
        WHERE UPPER(p.REFERENCIA) IN (${placeholders})
      `;

      logger.info({
        sql: sql.substring(0, 200),
        parametros: referenciasLimpas
      }, 'DEBUG: Executando query SQL');

      const result = await firebirdService.executeQuery<ProductResult & StockResult>(
        sql,
        referenciasLimpas
      );

      logger.info({
        rowsRetornadas: result.rows.length,
        rows: result.rows.map(r => ({
          CPRODUTO: r.CPRODUTO,
          REFERENCIA: r.REFERENCIA,
          SALDO: r.SALDO
        }))
      }, 'DEBUG: Resultado da query Firebird');

      // Cria um mapa de referência limpa -> produto
      const productMap = new Map<string, ChatbotProductDetails>();

      result.rows.forEach(row => {
        const referenciaLimpaDB = row.REFERENCIA.replace(/[-\s]/g, '').toUpperCase();
        const availability = formatAvailability(row.SALDO || 0);

        logger.info({
          cproduto: row.CPRODUTO,
          referenciaOriginalDB: row.REFERENCIA,
          referenciaLimpaDB: referenciaLimpaDB,
          saldoRaw: row.SALDO,
          availabilityFormatted: availability
        }, 'DEBUG: Criando produto com availability');

        productMap.set(referenciaLimpaDB, {
          cproduto: String(row.CPRODUTO),
          name: row.DESCRICAO,
          reference: row.REFERENCIA,
          quickDescription: this.createQuickDescription(row.DESCRICAO),
          availability: availability,
        });
      });

      logger.info({
        requestedCount: referencias.length,
        foundCount: productMap.size,
        mapKeys: Array.from(productMap.keys())
      }, 'DEBUG: Busca em lote concluída - Mapa criado');

      return productMap;
    } catch (error) {
      logger.error({ referencias, error }, 'Error finding products by references in batch');
      throw error;
    }
  }

  // Private helper methods

  private async getProductInfo(cproduto: string): Promise<ProductResult | null> {
    const sql = `
      SELECT CPRODUTO, DESCRICAO, REFERENCIA
      FROM PRODUTO
      WHERE CPRODUTO = ?
      ROWS 1
    `;

    const result = await firebirdService.executeQuery<ProductResult>(sql, [cproduto]);
    return result.rows.length > 0 ? result.rows[0]! : null;
  }

  private async getProductPrice(cproduto: string): Promise<PriceResult | null> {
    const sql = `
      SELECT PRECO
      FROM PRECO
      WHERE CPRODUTO = ?
      ROWS 1
    `;

    const result = await firebirdService.executeQuery<PriceResult>(sql, [cproduto]);
    return result.rows.length > 0 ? result.rows[0]! : null;
  }

  private async getProductStock(cproduto: string): Promise<StockResult | null> {
    const sql = `
      SELECT SALDO
      FROM SALDO
      WHERE CPRODUTO = ?
      ROWS 1
    `;

    const result = await firebirdService.executeQuery<StockResult>(sql, [cproduto]);
    return result.rows.length > 0 ? result.rows[0]! : null;
  }

  private async enrichProductsWithDetails(
    products: ProductResult[]
  ): Promise<ChatbotProductDetails[]> {
    const enriched = await Promise.all(
      products.map(async (product) => {
        const [priceResult, stockResult] = await Promise.all([
          this.getProductPrice(String(product.CPRODUTO)),
          this.getProductStock(String(product.CPRODUTO)),
        ]);

        return {
          cproduto: String(product.CPRODUTO),
          name: product.DESCRICAO,
          reference: product.REFERENCIA,
          quickDescription: this.createQuickDescription(product.DESCRICAO),
          price: formatPrice(priceResult?.PRECO || 0),
          availability: formatAvailability(stockResult?.SALDO || 0),
        };
      })
    );

    return enriched;
  }

  private createQuickDescription(descricao: string): string {
    // Truncate long descriptions for chatbot context
    const maxLength = 80;
    if (descricao.length <= maxLength) {
      return descricao;
    }
    return descricao.substring(0, maxLength).trim() + '...';
  }

  private createSearchSummary(count: number, searchType: string, term: string): string {
    if (count === 0) {
      return `Nenhum produto encontrado para ${searchType} "${term}"`;
    }
    if (count === 1) {
      return `Encontrado 1 produto para ${searchType} "${term}"`;
    }
    return `Encontrados ${count} produtos para ${searchType} "${term}"`;
  }

  private generateSearchSuggestions(_query: string, products: ChatbotProductDetails[]): string[] {
    // Simple suggestion generation based on common product terms
    const suggestions: string[] = [];

    // If no results, suggest related terms
    if (products.length === 0) {
      return suggestions;
    }

    // Extract common words from product descriptions (simple approach)
    const words = new Set<string>();
    products.forEach((product) => {
      const productWords = product.name
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .map((word) => word.toLowerCase());
      productWords.forEach((word) => words.add(word));
    });

    // Return up to 3 suggestions
    return Array.from(words).slice(0, 3);
  }
}

export const unifiedProductService = new UnifiedProductService();

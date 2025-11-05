/**
 * Types optimized for AI chatbot responses
 * Includes user-friendly messages and structured data for conversational interfaces
 */

export interface ChatbotPrice {
  amount: number;
  currency: string;
  formatted: string;
}

export interface ChatbotAvailability {
  available: boolean; // true if product is available in stock, false otherwise
}

export interface ProductSpecification {
  description: string;
  value: string;
}

export interface ChatbotProduct {
  cproduto: string;
  name: string; // DESCRICAO
  reference: string; // REFERENCIA
  quickDescription?: string; // Short summary for chatbot
  price?: ChatbotPrice;
  availability?: ChatbotAvailability;
  specifications?: ProductSpecification[];
}

export interface ChatbotProductDetails extends ChatbotProduct {
  price?: ChatbotPrice;
  availability: ChatbotAvailability;
  specifications?: ProductSpecification[];
}

export interface ChatbotSearchResult {
  summary: string; // "Encontrei 3 opções de freio para seu veículo"
  totalFound: number;
  products: ChatbotProductDetails[];
  suggestions?: string[]; // Related search terms
}

export interface ChatbotVehicleInfo {
  brand?: string;
  name?: string;
  model?: string;
  plate?: string;
  madeYear?: number;
  modelYear?: number;
}

export interface ChatbotVehicleSearchResult {
  vehicle: ChatbotVehicleInfo;
  totalFound: number;
  products: ChatbotProductDetails[];
}

export interface ChatbotBatchResult {
  summary: string;
  totalFound: number;
  totalRequested: number;
  products: ChatbotProductDetails[];
  notFound: string[];
}

// Helper function to format prices
export function formatPrice(amount: number, currency = 'BRL'): ChatbotPrice {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(amount);

  return {
    amount,
    currency,
    formatted,
  };
}

// Helper function to determine availability
export function formatAvailability(quantity: number): ChatbotAvailability {
  return {
    available: quantity > 0,
  };
}

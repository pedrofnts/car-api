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
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'on_order';
  quantity: number;
  message: string; // User-friendly message: "Disponível para entrega imediata"
}

export interface ChatbotProduct {
  cproduto: string;
  name: string; // DESCRICAO
  reference: string; // REFERENCIA
  quickDescription?: string; // Short summary for chatbot
  price?: ChatbotPrice;
  availability?: ChatbotAvailability;
}

export interface ChatbotProductDetails extends ChatbotProduct {
  price: ChatbotPrice;
  availability: ChatbotAvailability;
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
  summary: string;
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

// Helper function to determine availability status and message
export function formatAvailability(quantity: number): ChatbotAvailability {
  let status: ChatbotAvailability['status'];
  let message: string;

  if (quantity === 0) {
    status = 'out_of_stock';
    message = 'Produto esgotado no momento';
  } else if (quantity <= 3) {
    status = 'low_stock';
    message = `Últimas ${quantity} unidades disponíveis`;
  } else if (quantity <= 10) {
    status = 'in_stock';
    message = `${quantity} unidades em estoque`;
  } else {
    status = 'in_stock';
    message = 'Disponível para entrega imediata';
  }

  return {
    status,
    quantity,
    message,
  };
}

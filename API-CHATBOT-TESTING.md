# Guia de Testes - API Otimizada para Chatbot

## 📋 Resumo das Implementações

Foram implementados **4 novos endpoints** e aprimorado 1 endpoint existente para facilitar a integração com uma IA de atendimento que vende peças para veículos.

---

## 🆕 Novos Endpoints

### 1. Busca por Descrição Natural
**Endpoint:** `GET /api/v1/products/search/description`

**Descrição:** Permite buscar produtos usando texto livre (linguagem natural).

**Query Parameters:**
- `q` (required): Texto de busca (ex: "freio", "óleo", "pastilha")
- `includeDetails` (optional): `true` | `false` (default: `false`)
- `limit` (optional): Número máximo de resultados (default: 20, max: 100)

**Exemplos de Uso:**

```bash
# Busca simples
curl "http://localhost:3000/api/v1/products/search/description?q=freio"

# Busca com detalhes completos (preço + estoque)
curl "http://localhost:3000/api/v1/products/search/description?q=pastilha&includeDetails=true&limit=5"

# Busca por óleo
curl "http://localhost:3000/api/v1/products/search/description?q=oleo&includeDetails=true"
```

**Resposta com includeDetails=true:**
```json
{
  "success": true,
  "data": {
    "summary": "Encontrados 3 produtos para descrição \"freio\"",
    "totalFound": 3,
    "products": [
      {
        "cproduto": "123456",
        "name": "Pastilha de Freio Dianteira Cerâmica",
        "reference": "SK-385S",
        "quickDescription": "Pastilha de freio cerâmica premium para veículos de passeio...",
        "price": {
          "amount": 289.90,
          "currency": "BRL",
          "formatted": "R$ 289,90"
        },
        "availability": {
          "status": "in_stock",
          "quantity": 15,
          "message": "Disponível para entrega imediata"
        }
      }
    ],
    "suggestions": ["disco de freio", "fluido"]
  }
}
```

---

### 2. Busca por Veículo (sem placa)
**Endpoint:** `GET /api/v1/vehicles/search`

**Descrição:** Busca produtos compatíveis com um veículo usando marca e modelo (sem necessidade de placa).

**Query Parameters:**
- `brand` (optional): Marca do veículo (ex: "AUDI", "VOLKSWAGEN")
- `name` (optional): Nome/modelo do veículo (ex: "A3", "GOL")
- `model` (optional): Versão do modelo
- `q` (optional): Termo de busca adicional
- `includeDetails` (optional): `true` | `false` (default: `false`)
- `limit` (optional): Número máximo de resultados (default: 20)

**Nota:** Pelo menos um dos parâmetros (`brand`, `name` ou `model`) deve ser fornecido.

**Exemplos de Uso:**

```bash
# Busca por marca e modelo
curl "http://localhost:3000/api/v1/vehicles/search?brand=AUDI&name=A3&includeDetails=true"

# Busca apenas por marca
curl "http://localhost:3000/api/v1/vehicles/search?brand=VOLKSWAGEN&includeDetails=true&limit=10"

# Busca com termo adicional
curl "http://localhost:3000/api/v1/vehicles/search?brand=AUDI&name=A3&q=filtro&includeDetails=true"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "vehicle": {
      "brand": "AUDI",
      "name": "A3",
      "model": "A3 1.8 TFSI",
      "modelYear": 2020
    },
    "summary": "Encontrados 12 produtos compatíveis com AUDI A3 2020",
    "totalFound": 12,
    "products": [
      {
        "cproduto": "39357014",
        "name": "Filtro de Óleo",
        "reference": "OC619",
        "quickDescription": "Filtro de óleo para motores TFSI...",
        "price": {
          "amount": 45.90,
          "currency": "BRL",
          "formatted": "R$ 45,90"
        },
        "availability": {
          "status": "in_stock",
          "quantity": 25,
          "message": "Disponível para entrega imediata"
        }
      }
    ]
  }
}
```

---

### 3. Batch de Produtos
**Endpoint:** `POST /api/v1/products/batch`

**Descrição:** Busca detalhes completos de múltiplos produtos em uma única chamada.

**Body (JSON):**
```json
{
  "cprodutos": ["123456", "789012", "345678"],
  "includeDetails": true
}
```

**Parâmetros:**
- `cprodutos` (required): Array de códigos de produtos (min: 1, max: 50)
- `includeDetails` (optional): boolean (default: true)

**Exemplo de Uso:**

```bash
curl -X POST "http://localhost:3000/api/v1/products/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "cprodutos": ["39357014", "123456", "789012"],
    "includeDetails": true
  }'
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "summary": "Encontrados 2 de 3 produtos solicitados",
    "totalFound": 2,
    "totalRequested": 3,
    "products": [
      {
        "cproduto": "39357014",
        "name": "BORR AMORT KIT TS ONIX 19/",
        "reference": "SK385S",
        "price": { "amount": 150.50, "formatted": "R$ 150,50" },
        "availability": { "status": "in_stock", "quantity": 10, "message": "10 unidades em estoque" }
      },
      {
        "cproduto": "123456",
        "name": "Filtro de Ar Esportivo",
        "reference": "AF-5500",
        "price": { "amount": 320.00, "formatted": "R$ 320,00" },
        "availability": { "status": "low_stock", "quantity": 2, "message": "Últimas 2 unidades disponíveis" }
      }
    ],
    "notFound": ["789012"]
  }
}
```

---

## ✨ Endpoint Aprimorado

### 4. Detalhes de Produto com includeDetails
**Endpoint:** `GET /api/v1/products/:cproduto`

**Novo Query Parameter:**
- `includeDetails`: `true` | `false` (default: `false`)

**Quando `includeDetails=false` (comportamento original):**
```json
{
  "success": true,
  "data": {
    "cproduto": "39357014",
    "price": 150.50,
    "stock": {
      "quantity": 10,
      "available": true
    }
  }
}
```

**Quando `includeDetails=true` (novo formato otimizado para chatbot):**
```json
{
  "success": true,
  "data": {
    "cproduto": "39357014",
    "name": "BORR AMORT KIT TS ONIX 19/ BATENTE/ COIFA (01 LADO)",
    "reference": "SK385S",
    "quickDescription": "BORR AMORT KIT TS ONIX 19/ BATENTE/ COIFA (01 LADO)",
    "price": {
      "amount": 150.50,
      "currency": "BRL",
      "formatted": "R$ 150,50"
    },
    "availability": {
      "status": "in_stock",
      "quantity": 10,
      "message": "10 unidades em estoque"
    }
  }
}
```

**Exemplos:**

```bash
# Formato original
curl "http://localhost:3000/api/v1/products/39357014"

# Formato otimizado para chatbot
curl "http://localhost:3000/api/v1/products/39357014?includeDetails=true"

# Por referência com detalhes
curl "http://localhost:3000/api/v1/products/39357014?referencia=SK-385S&includeDetails=true"
```

---

## 🎯 Endpoints Existentes (sem alterações)

### 5. Busca por Placa
**Endpoint:** `GET /api/v1/vehicles/:plate`

```bash
curl "http://localhost:3000/api/v1/vehicles/ABC1234"
```

### 6. Produtos por Placa
**Endpoint:** `GET /api/v1/vehicles/:plate/products`

```bash
curl "http://localhost:3000/api/v1/vehicles/ABC1234/products?skip=0&take=10"
```

### 7. Busca de Produtos por Placa
**Endpoint:** `GET /api/v1/vehicles/:plate/products/search`

```bash
curl "http://localhost:3000/api/v1/vehicles/ABC1234/products/search?search=freio"
```

### 8. Busca por Referência
**Endpoint:** `GET /api/v1/products/search`

```bash
curl "http://localhost:3000/api/v1/products/search?referencia=SK-385S"
```

---

## 🤖 Formato de Resposta Otimizado para IA

Todos os novos endpoints seguem um formato consistente e amigável para chatbots:

### Status de Disponibilidade
```typescript
{
  "status": "in_stock" | "low_stock" | "out_of_stock" | "on_order",
  "quantity": number,
  "message": string  // Mensagem pronta para verbalização
}
```

**Exemplos de mensagens:**
- `quantity = 0`: "Produto esgotado no momento"
- `quantity <= 3`: "Últimas 2 unidades disponíveis"
- `quantity <= 10`: "8 unidades em estoque"
- `quantity > 10`: "Disponível para entrega imediata"

### Formato de Preço
```typescript
{
  "amount": number,      // 289.90
  "currency": string,    // "BRL"
  "formatted": string    // "R$ 289,90"
}
```

### Campo Summary
Todos os endpoints de busca incluem um campo `summary` com uma descrição pronta para a IA verbalizar:
- "Encontrados 3 produtos para descrição 'freio'"
- "Encontrado 1 produto compatível com AUDI A3 2020"
- "Encontrados 5 de 6 produtos solicitados"

---

## 📊 Comparação: Antes vs Depois

### Cenário: Cliente pede "Preciso de freios para meu Audi A3"

**ANTES (múltiplas chamadas):**
```bash
# 1. Buscar veículo por marca/modelo (não existia)
# 2. Buscar produtos compatíveis
# 3. Para cada produto, buscar preço
# 4. Para cada produto, buscar estoque
# Total: 1 + N + N + N chamadas
```

**DEPOIS (uma chamada):**
```bash
curl "http://localhost:3000/api/v1/vehicles/search?brand=AUDI&name=A3&q=freio&includeDetails=true&limit=5"

# Retorna TUDO de uma vez:
# - Informações do veículo
# - Lista de produtos compatíveis
# - Preço formatado de cada produto
# - Disponibilidade com mensagem amigável
# - Resumo pronto para verbalizar
```

---

## 🧪 Script de Testes Completo

Salve este script como `test-chatbot-api.sh`:

```bash
#!/bin/bash

API_BASE="http://localhost:3000/api/v1"

echo "=== Teste 1: Busca por Descrição ==="
curl -s "$API_BASE/products/search/description?q=amortecedor&includeDetails=true&limit=3" | jq '.data.summary, .data.totalFound'

echo -e "\n=== Teste 2: Busca por Veículo (Marca + Modelo) ==="
curl -s "$API_BASE/vehicles/search?brand=VOLKSWAGEN&name=GOL&includeDetails=true&limit=5" | jq '.data.summary, .data.vehicle'

echo -e "\n=== Teste 3: Batch de Produtos ==="
curl -s -X POST "$API_BASE/products/batch" \
  -H "Content-Type: application/json" \
  -d '{"cprodutos": ["39357014"], "includeDetails": true}' | jq '.data.summary, .data.products[0].name'

echo -e "\n=== Teste 4: Produto com Detalhes ==="
curl -s "$API_BASE/products/39357014?includeDetails=true" | jq '.data.name, .data.price.formatted, .data.availability.message'

echo -e "\n=== Teste 5: Busca Existente (Referência) ==="
curl -s "$API_BASE/products/search?referencia=SK-385S" | jq '.data.totalFound, .data.products[0].DESCRICAO'
```

Executar:
```bash
chmod +x test-chatbot-api.sh
./test-chatbot-api.sh
```

---

## 📝 Notas Importantes

### Problemas Conhecidos

1. **Conectividade Firebird**
   - O teste de conexão inicial funciona
   - Queries individuais às vezes falham com erro de autenticação
   - Isso é um problema intermitente do driver `node-firebird`
   - **Solução temporária:** Reiniciar o servidor (`npm run dev`)

2. **Mapeamento partNumber ↔ CPRODUTO**
   - O serviço tenta mapear `partNumber` da API GraphQL para `CPRODUTO` do Firebird
   - Se o mapeamento falhar, retorna produto sem preço/estoque (availability: "Consultar disponibilidade")

### Melhorias Futuras Sugeridas

1. **Connection Pool** para Firebird (já configurado, não ativo)
2. **Cache Redis** para produtos frequentes
3. **Elasticsearch** para busca fuzzy/inteligente
4. **Carrinho de compras** e gestão de pedidos
5. **Recomendações** baseadas em ML

---

## 🚀 Como Iniciar

```bash
# 1. Instalar dependências
npm install

# 2. Configurar .env (já configurado)
cp .env.example .env

# 3. Iniciar servidor de desenvolvimento
npm run dev

# 4. Acessar Swagger UI
open http://localhost:3000/docs

# 5. Testar endpoints
curl "http://localhost:3000/api/v1/products/search/description?q=filtro&includeDetails=true"
```

---

## 📞 Suporte

- **Documentação Swagger:** http://localhost:3000/docs
- **Health Check:** http://localhost:3000/
- **Logs:** Console do servidor (`npm run dev`)

---

**Data de Implementação:** 03/11/2025
**Versão da API:** 1.0.0
**Status:** ✅ Implementado e pronto para testes com banco estável

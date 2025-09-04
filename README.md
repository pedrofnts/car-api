# Car API

Node.js/TypeScript API que consome GraphQL com OAuth 2.0, integra com Firebird e expõe endpoints REST.

## Características

- **Autenticação OAuth 2.0** com renovação automática de token
- **Cliente GraphQL** com tipagem gerada automaticamente 
- **Integração Firebird** com pool de conexões
- **API REST Fastify** com validação, rate limiting e documentação
- **Logs estruturados** com Pino
- **Resiliência** com circuit breaker e retries
- **Configuração** via variáveis de ambiente com validação

## Setup

1. Instalar dependências:
```bash
npm install
```

2. Configurar variáveis de ambiente:
```bash
cp .env.example .env
# Editar .env com suas configurações
```

3. Executar em desenvolvimento:
```bash
npm run dev
```

4. Build para produção:
```bash
npm run build
npm start
```

## Scripts Disponíveis

- `npm run dev` - Desenvolvimento com watch
- `npm run build` - Build TypeScript
- `npm start` - Execução produção
- `npm run lint` - Linting
- `npm run typecheck` - Verificação de tipos
- `npm run generate` - Gerar tipos GraphQL
- `npm test` - Executar testes

## Estrutura do Projeto

```
src/
├── config/         # Configurações e validação de env
├── services/       # Serviços (OAuth, GraphQL, Firebird)
├── routes/         # Rotas da API REST
├── types/          # Tipos TypeScript
├── utils/          # Utilitários (logger, errors)
├── middleware/     # Middlewares do Fastify
├── generated/      # Tipos GraphQL gerados
└── index.ts        # Entrada da aplicação
```

## Documentação da API

A documentação Swagger estará disponível em `/docs` quando o servidor estiver rodando.
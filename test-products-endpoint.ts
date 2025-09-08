import { createApp } from './src/app.js';
import { config } from './src/config/env.js';
import { firebirdService } from './src/services/firebird-simple.js';

async function testProductsEndpoint() {
  console.log('🔧 Inicializando aplicação...');
  
  try {
    // Inicializar o serviço Firebird
    await firebirdService.initialize();
    console.log('✅ Conexão com Firebird estabelecida');

    // Criar app Fastify
    const app = createApp();
    
    // Iniciar servidor
    await app.listen({ 
      port: config.PORT, 
      host: '0.0.0.0' 
    });
    
    console.log(`🚀 Servidor rodando em http://localhost:${config.PORT}`);
    console.log(`📚 Documentação disponível em http://localhost:${config.PORT}/docs`);
    console.log('\n🔍 Testando endpoints de produtos:');
    console.log(`GET http://localhost:${config.PORT}/api/v1/products/search?referencia=SK-385S`);
    console.log(`GET http://localhost:${config.PORT}/api/v1/products/search?referencia=SK385S`);
    console.log(`GET http://localhost:${config.PORT}/api/v1/products/price?cproduto=P001`);
    
    // Teste com fetch
    console.log('\n🧪 Executando teste automático...');
    
    const productTestCases = ['SK-385S', 'SK385S', 'test123'];
    const priceTestCases = ['P001', 'INVALID_CODE'];
    
    // Test product search
    console.log('\n🔍 Testando busca de produtos por referência...');
    for (const referencia of productTestCases) {
      try {
        const response = await fetch(`http://localhost:${config.PORT}/api/v1/products/search?referencia=${referencia}`);
        const data = await response.json();
        
        console.log(`\n📋 Teste para referência "${referencia}":`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error(`❌ Erro no teste para "${referencia}":`, error);
      }
    }

    // Test price search  
    console.log('\n💰 Testando busca de preços por CPRODUTO...');
    for (const cproduto of priceTestCases) {
      try {
        const response = await fetch(`http://localhost:${config.PORT}/api/v1/products/price?cproduto=${cproduto}`);
        const data = await response.json();
        
        console.log(`\n💵 Teste para CPRODUTO "${cproduto}":`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error(`❌ Erro no teste para "${cproduto}":`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao inicializar:', error);
    process.exit(1);
  }
}

// Tratar encerramento graceful
process.on('SIGINT', async () => {
  console.log('\n🔄 Encerrando aplicação...');
  await firebirdService.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Encerrando aplicação...');
  await firebirdService.destroy();
  process.exit(0);
});

testProductsEndpoint().catch(console.error);
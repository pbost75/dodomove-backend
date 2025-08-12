// ===============================================
// TEST SPÉCIFIQUE CONFIGURATION OPENAI
// ===============================================

const https = require('https');

const BACKEND_URL = 'https://web-production-7b738.up.railway.app';

async function testOpenAIConfig() {
  console.log('🔍 Test configuration OpenAI sur Railway...\n');
  
  try {
    // Test 1: Stats endpoint
    console.log('1️⃣ Test stats endpoint...');
    const statsResponse = await fetch(`${BACKEND_URL}/api/dodo-lens/stats`);
    const stats = await statsResponse.json();
    
    console.log('📊 Stats:', JSON.stringify(stats, null, 2));
    
    // Test 2: Vision endpoint (petit test)
    console.log('\n2️⃣ Test vision endpoint...');
    const visionResponse = await fetch(`${BACKEND_URL}/api/dodo-lens/analyze-vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        prompt: 'Test de configuration: que vois-tu ?'
      })
    });
    
    const visionResult = await visionResponse.json();
    console.log('🎨 Vision result:', JSON.stringify(visionResult, null, 2));
    
    // Analyse des résultats
    console.log('\n📋 ANALYSE:');
    
    if (stats.openai?.configured === true) {
      console.log('✅ OpenAI configuré dans stats');
    } else {
      console.log('❌ OpenAI NON configuré dans stats');
    }
    
    if (visionResponse.status === 200) {
      console.log('✅ Vision endpoint fonctionne');
    } else if (visionResponse.status === 503) {
      console.log('❌ Vision endpoint: Service indisponible (OpenAI non configuré)');
    } else {
      console.log(`⚠️ Vision endpoint: Status ${visionResponse.status}`);
    }
    
    // Recommandations
    console.log('\n🎯 RECOMMANDATIONS:');
    
    if (!stats.openai?.configured) {
      console.log('1. Vérifier variable OPENAI_API_KEY dans Railway');
      console.log('2. Clé doit commencer par "sk-proj-" ou "sk-"');
      console.log('3. Pas d\'espaces avant/après la clé');
      console.log('4. Redéployer après modification');
    } else {
      console.log('✅ Configuration semble correcte!');
    }
    
  } catch (error) {
    console.error('❌ Erreur test:', error.message);
  }
}

// Polyfill fetch si nécessaire
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

testOpenAIConfig();

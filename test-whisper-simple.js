require('dotenv').config();
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');

async function testWhisperAPI() {
  console.log('🧪 Test Whisper API Backend...');
  
  // Créer un fichier audio de test simple (silence de 1 seconde)
  const testAudioBuffer = Buffer.alloc(1024); // Simple buffer vide
  
  try {
    // Test 1: Vérifier que le backend est accessible
    console.log('\n1️⃣ Test accès backend...');
    const backendUrl = 'https://web-production-7b738.up.railway.app';
    const statsResponse = await fetch(`${backendUrl}/api/dodo-lens/stats`);
    const stats = await statsResponse.json();
    console.log('✅ Backend accessible:', stats);
    
    // Test 2: Tester la route Whisper
    console.log('\n2️⃣ Test route Whisper...');
    const formData = new FormData();
    formData.append('audioFile', testAudioBuffer, {
      filename: 'test.webm',
      contentType: 'audio/webm'
    });
    
    const whisperResponse = await fetch(`${backendUrl}/api/dodo-lens/analyze-audio`, {
      method: 'POST',
      body: formData
    });
    
    console.log('📊 Status Whisper:', whisperResponse.status);
    const whisperResult = await whisperResponse.text();
    console.log('📝 Réponse brute:', whisperResult);
    
    if (whisperResponse.ok) {
      try {
        const jsonResult = JSON.parse(whisperResult);
        console.log('✅ JSON parsé:', jsonResult);
      } catch (e) {
        console.log('⚠️ Réponse non-JSON');
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur test:', error.message);
  }
}

testWhisperAPI();

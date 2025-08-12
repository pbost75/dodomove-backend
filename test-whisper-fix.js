// Test du fix Whisper avec fichier audio réel
const fs = require('fs');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testWhisperFix() {
  console.log('🧪 Test fix Whisper avec audio réel...\n');
  
  try {
    const backendUrl = 'https://web-production-7b738.up.railway.app';
    
    // Test 1: Vérifier backend opérationnel
    console.log('1️⃣ Vérification backend...');
    const statsResponse = await fetch(`${backendUrl}/api/dodo-lens/stats`);
    const stats = await statsResponse.json();
    console.log('✅ Backend status:', stats.status);
    console.log('✅ OpenAI configuré:', stats.openai?.configured);
    
    // Test 2: Créer un fichier audio de test minimal mais valide
    console.log('\n2️⃣ Création fichier audio test...');
    
    // Créer un header WAV minimal valide (44 bytes + quelques samples)
    const createMinimalWav = () => {
      const sampleRate = 16000;
      const channels = 1;
      const bitsPerSample = 16;
      const duration = 0.1; // 100ms
      const samples = Math.floor(sampleRate * duration);
      const dataSize = samples * channels * (bitsPerSample / 8);
      const fileSize = 36 + dataSize;
      
      const buffer = Buffer.alloc(44 + dataSize);
      let offset = 0;
      
      // WAV Header
      buffer.write('RIFF', offset); offset += 4;
      buffer.writeUInt32LE(fileSize, offset); offset += 4;
      buffer.write('WAVE', offset); offset += 4;
      buffer.write('fmt ', offset); offset += 4;
      buffer.writeUInt32LE(16, offset); offset += 4; // PCM chunk size
      buffer.writeUInt16LE(1, offset); offset += 2;  // PCM format
      buffer.writeUInt16LE(channels, offset); offset += 2;
      buffer.writeUInt32LE(sampleRate, offset); offset += 4;
      buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), offset); offset += 4; // Byte rate
      buffer.writeUInt16LE(channels * (bitsPerSample / 8), offset); offset += 2; // Block align
      buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
      buffer.write('data', offset); offset += 4;
      buffer.writeUInt32LE(dataSize, offset); offset += 4;
      
      // Générer un signal audio simple (silence + quelques bips)
      for (let i = 0; i < samples; i++) {
        const value = i < samples / 2 ? 0 : Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16000;
        buffer.writeInt16LE(Math.floor(value), offset);
        offset += 2;
      }
      
      return buffer;
    };
    
    const audioBuffer = createMinimalWav();
    console.log(`✅ Fichier WAV créé: ${audioBuffer.length} bytes`);
    
    // Test 3: Envoyer à Whisper
    console.log('\n3️⃣ Test Whisper avec fichier WAV...');
    
    const formData = new FormData();
    formData.append('audioFile', audioBuffer, {
      filename: 'test.wav',
      contentType: 'audio/wav'
    });
    
    const whisperResponse = await fetch(`${backendUrl}/api/dodo-lens/analyze-audio`, {
      method: 'POST',
      body: formData
    });
    
    console.log('📊 Status Whisper:', whisperResponse.status);
    const whisperResult = await whisperResponse.text();
    
    if (whisperResponse.ok) {
      try {
        const json = JSON.parse(whisperResult);
        console.log('✅ SUCCESS ! Whisper fonctionne !');
        console.log('📝 Transcript:', json.transcript || '(silence)');
        console.log('💰 Coût:', json.usage?.cost + '€');
        console.log('⏱️ Temps:', json.usage?.processing_time_ms + 'ms');
      } catch (e) {
        console.log('⚠️ Réponse Whisper non-JSON:', whisperResult);
      }
    } else {
      console.log('❌ Erreur Whisper:', whisperResult);
    }
    
    console.log('\n📋 RÉSULTAT:');
    if (whisperResponse.ok) {
      console.log('🎉 FIX WHISPER RÉUSSI !');
      console.log('✅ Le problème de format audio est résolu');
      console.log('✅ Backend peut maintenant traiter les fichiers audio');
      console.log('\n🎯 Prochaine étape: Tester sur mobile avec vraie voix');
    } else {
      console.log('❌ Le problème persiste, investigation plus poussée nécessaire');
    }
    
  } catch (error) {
    console.error('❌ Erreur test:', error.message);
  }
}

testWhisperFix();

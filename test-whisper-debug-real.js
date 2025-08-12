// Debug avancé pour logs Railway Whisper
const express = require('express');
const multer = require('multer');
const fs = require('fs');

// Créer un petit serveur local pour capturer les détails des requêtes
const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  console.log(`📊 Headers:`, Object.keys(req.headers));
  console.log(`📏 Content-Length:`, req.headers['content-length']);
  console.log(`📱 User-Agent:`, req.headers['user-agent']);
  next();
});

app.post('/debug-audio', upload.single('audioFile'), (req, res) => {
  try {
    console.log('\n🔍 === ANALYSE FICHIER AUDIO ===');
    
    if (!req.file) {
      console.log('❌ Pas de fichier reçu');
      return res.status(400).json({ error: 'Pas de fichier' });
    }
    
    console.log('📊 Détails fichier:');
    console.log(`   - fieldname: ${req.file.fieldname}`);
    console.log(`   - originalname: ${req.file.originalname}`);
    console.log(`   - mimetype: ${req.file.mimetype}`);
    console.log(`   - size: ${req.file.size} bytes`);
    console.log(`   - buffer length: ${req.file.buffer.length}`);
    
    // Analyser les premiers bytes
    const header = Array.from(req.file.buffer.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(`   - Header hex: ${header}`);
    
    // Sauvegarder pour inspection
    const filename = `debug-audio-${Date.now()}.webm`;
    fs.writeFileSync(filename, req.file.buffer);
    console.log(`💾 Fichier sauvé: ${filename}`);
    
    // Simuler les mêmes vérifications que le backend
    console.log('\n🔍 Vérifications backend simulées:');
    
    // Test 1: Mimetype
    const validMimes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/mpeg'];
    const mimeOk = validMimes.some(mime => req.file.mimetype.includes(mime));
    console.log(`   - Mimetype valide: ${mimeOk ? '✅' : '❌'} (${req.file.mimetype})`);
    
    // Test 2: Taille minimale
    const sizeOk = req.file.size > 100;
    console.log(`   - Taille minimale: ${sizeOk ? '✅' : '❌'} (${req.file.size} bytes)`);
    
    // Test 3: Contenu non-vide
    const nonZeroBytes = req.file.buffer.filter(b => b !== 0).length;
    const contentRatio = nonZeroBytes / req.file.buffer.length;
    console.log(`   - Contenu non-nul: ${contentRatio > 0.1 ? '✅' : '❌'} (${(contentRatio * 100).toFixed(1)}%)`);
    
    // Test 4: Format détection
    let detectedFormat = 'unknown';
    if (req.file.buffer[0] === 0x1A && req.file.buffer[1] === 0x45) {
      detectedFormat = 'WebM/Matroska';
    } else if (req.file.buffer[0] === 0x52 && req.file.buffer[1] === 0x49) {
      detectedFormat = 'WAV/RIFF';
    } else if (req.file.buffer[0] === 0x66 && req.file.buffer[1] === 0x74) {
      detectedFormat = 'MP4';
    }
    console.log(`   - Format détecté: ${detectedFormat}`);
    
    res.json({
      success: true,
      analysis: {
        filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        detectedFormat,
        contentRatio,
        header,
        recommendations: [
          mimeOk ? null : 'Mimetype invalide',
          sizeOk ? null : 'Fichier trop petit',
          contentRatio > 0.1 ? null : 'Audio semble vide',
          detectedFormat !== 'unknown' ? null : 'Format non reconnu'
        ].filter(Boolean)
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur analyse:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, '0.0.0.0', () => {
  console.log('🔍 Serveur debug audio démarré sur http://localhost:3001');
  console.log('📱 Testez avec: curl -X POST -F "audioFile=@test.webm" http://localhost:3001/debug-audio');
  console.log('\n⚡ OU modifiez temporairement debug-whisper-mobile-deep.html:');
  console.log('   backendUrl = "http://localhost:3001"');
  console.log('   et changez /api/dodo-lens/analyze-audio en /debug-audio');
});

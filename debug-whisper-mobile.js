// Serveur debug Whisper mobile avec CORS
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');

const app = express();

// Configuration CORS pour mobile
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Middleware de logging
app.use((req, res, next) => {
  console.log(`\n📥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log(`📊 Headers:`, Object.keys(req.headers).join(', '));
  console.log(`📏 Content-Length:`, req.headers['content-length'] || 'N/A');
  console.log(`📱 User-Agent:`, req.headers['user-agent'] || 'N/A');
  console.log(`🌍 Origin:`, req.headers['origin'] || 'N/A');
  next();
});

// Route principale de debug
app.post('/debug-audio', upload.single('audioFile'), (req, res) => {
  try {
    console.log('\n🔍 === ANALYSE FICHIER AUDIO MOBILE ===');
    
    if (!req.file) {
      console.log('❌ Pas de fichier reçu');
      return res.status(400).json({ 
        error: 'Pas de fichier reçu',
        received_fields: Object.keys(req.body),
        received_files: req.files ? Object.keys(req.files) : []
      });
    }
    
    console.log('📊 Détails fichier reçu:');
    console.log(`   - fieldname: ${req.file.fieldname}`);
    console.log(`   - originalname: ${req.file.originalname}`);
    console.log(`   - mimetype: ${req.file.mimetype}`);
    console.log(`   - size: ${req.file.size} bytes (${(req.file.size / 1024).toFixed(1)} KB)`);
    console.log(`   - buffer length: ${req.file.buffer.length}`);
    
    // Analyser les premiers bytes
    const headerSize = Math.min(32, req.file.buffer.length);
    const header = Array.from(req.file.buffer.slice(0, headerSize))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(`   - Header hex (${headerSize} bytes): ${header}`);
    
    // Analyser le contenu
    const nonZeroBytes = req.file.buffer.filter(b => b !== 0).length;
    const contentRatio = nonZeroBytes / req.file.buffer.length;
    console.log(`   - Bytes non-nuls: ${nonZeroBytes}/${req.file.buffer.length} (${(contentRatio * 100).toFixed(1)}%)`);
    
    // Détection de format
    let detectedFormat = 'unknown';
    let formatDetails = {};
    
    if (req.file.buffer.length >= 4) {
      const first4 = req.file.buffer.slice(0, 4);
      
      if (first4[0] === 0x1A && first4[1] === 0x45 && first4[2] === 0xDF && first4[3] === 0xA3) {
        detectedFormat = 'WebM/Matroska';
        formatDetails = { signature: 'EBML', compatible: 'OpenAI: OUI' };
      } else if (first4[0] === 0x52 && first4[1] === 0x49 && first4[2] === 0x46 && first4[3] === 0x46) {
        detectedFormat = 'WAV/RIFF';
        formatDetails = { signature: 'RIFF', compatible: 'OpenAI: OUI' };
      } else if (req.file.buffer.length >= 8 && 
                 req.file.buffer[4] === 0x66 && req.file.buffer[5] === 0x74 && 
                 req.file.buffer[6] === 0x79 && req.file.buffer[7] === 0x70) {
        detectedFormat = 'MP4';
        formatDetails = { signature: 'ftyp', compatible: 'OpenAI: OUI' };
      } else if (first4[0] === 0xFF && (first4[1] & 0xE0) === 0xE0) {
        detectedFormat = 'MP3';
        formatDetails = { signature: 'MPEG sync', compatible: 'OpenAI: OUI' };
      } else {
        // Chercher des patterns WebM plus profond
        for (let i = 0; i < Math.min(100, req.file.buffer.length - 4); i++) {
          if (req.file.buffer[i] === 0x1A && req.file.buffer[i+1] === 0x45) {
            detectedFormat = 'WebM (décalé)';
            formatDetails = { offset: i, compatible: 'OpenAI: PROBABLE' };
            break;
          }
        }
      }
    }
    
    console.log(`   - Format détecté: ${detectedFormat}`);
    console.log(`   - Détails format:`, formatDetails);
    
    // Sauvegarder pour inspection manuelle
    const timestamp = Date.now();
    const filename = `debug-mobile-${timestamp}.${req.file.mimetype.split('/')[1] || 'webm'}`;
    const filepath = `/tmp/${filename}`;
    
    try {
      fs.writeFileSync(filepath, req.file.buffer);
      console.log(`💾 Fichier sauvé: ${filepath}`);
    } catch (saveError) {
      console.log(`⚠️ Échec sauvegarde: ${saveError.message}`);
    }
    
    // Simulations des vérifications backend
    console.log('\n🔍 Simulations vérifications Whisper:');
    
    // Test 1: Mimetype
    const acceptedMimes = [
      'audio/webm', 'audio/wav', 'audio/mp3', 'audio/mp4', 
      'audio/mpeg', 'audio/m4a', 'audio/ogg', 'video/webm'
    ];
    const mimeOk = acceptedMimes.some(mime => 
      req.file.mimetype.toLowerCase().includes(mime.split('/')[1])
    );
    console.log(`   ✓ Mimetype valide: ${mimeOk ? '✅' : '❌'} (${req.file.mimetype})`);
    
    // Test 2: Taille
    const sizeOk = req.file.size > 100 && req.file.size < 25 * 1024 * 1024;
    console.log(`   ✓ Taille acceptable: ${sizeOk ? '✅' : '❌'} (${req.file.size} bytes)`);
    
    // Test 3: Contenu
    const contentOk = contentRatio > 0.05; // Au moins 5% de contenu non-nul
    console.log(`   ✓ Contenu détecté: ${contentOk ? '✅' : '❌'} (${(contentRatio * 100).toFixed(1)}%)`);
    
    // Test 4: Format OpenAI
    const formatOk = detectedFormat !== 'unknown' && !detectedFormat.includes('unknown');
    console.log(`   ✓ Format supporté: ${formatOk ? '✅' : '❌'} (${detectedFormat})`);
    
    // Analyse globale
    const allOk = mimeOk && sizeOk && contentOk && formatOk;
    console.log(`\n📋 RÉSULTAT GLOBAL: ${allOk ? '✅ DEVRAIT FONCTIONNER' : '❌ PROBLÈMES DÉTECTÉS'}`);
    
    // Recommandations
    const recommendations = [];
    if (!mimeOk) recommendations.push(`Mimetype "${req.file.mimetype}" non supporté par OpenAI`);
    if (!sizeOk) recommendations.push(`Taille ${req.file.size} bytes hors limites OpenAI`);
    if (!contentOk) recommendations.push(`Audio semble vide (${(contentRatio * 100).toFixed(1)}% contenu)`);
    if (!formatOk) recommendations.push(`Format "${detectedFormat}" non reconnu par OpenAI`);
    
    if (recommendations.length === 0) {
      recommendations.push('Fichier semble correct pour OpenAI Whisper');
    }
    
    // Réponse détaillée
    const analysis = {
      filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      detectedFormat,
      formatDetails,
      contentRatio: Math.round(contentRatio * 1000) / 1000,
      header: header.substring(0, 50) + (header.length > 50 ? '...' : ''),
      checks: {
        mimetype: mimeOk,
        size: sizeOk,
        content: contentOk,
        format: formatOk
      },
      recommendations,
      shouldWorkWithOpenAI: allOk,
      debugInfo: {
        timestamp,
        userAgent: req.headers['user-agent'] || 'N/A',
        origin: req.headers['origin'] || 'N/A'
      }
    };
    
    console.log('\n📤 Envoi réponse analyse complète...');
    
    res.json({
      success: true,
      message: allOk ? 'Fichier audio valide pour OpenAI' : 'Problèmes détectés',
      analysis
    });
    
  } catch (error) {
    console.error('\n❌ ERREUR CRITIQUE:', error);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      error: 'Erreur serveur debug',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Whisper Mobile Debug Server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Démarrer le serveur
const PORT = 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🔍 === SERVEUR DEBUG WHISPER MOBILE DÉMARRÉ ===');
  console.log(`📡 URL locale: http://localhost:${PORT}`);
  console.log(`🌍 URL publique: Utiliser ngrok pour tunnel HTTPS`);
  console.log(`📋 Routes disponibles:`);
  console.log(`   - POST /debug-audio (analyse fichier audio)`);
  console.log(`   - GET /health (status serveur)`);
  console.log('\n📱 Pour tester depuis mobile:');
  console.log(`   1. Démarrer ngrok: npx ngrok http ${PORT}`);
  console.log(`   2. Utiliser URL HTTPS dans l'app mobile`);
  console.log(`   3. Envoyer POST avec FormData: audioFile`);
  console.log('\n🎯 Objectif: Identifier pourquoi Whisper échoue avec audio mobile réel\n');
});

// ===============================================
// ROUTES DODO-LENS - SÉCURISATION OPENAI
// ===============================================

const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const router = express.Router();

// Configuration OpenAI avec debug avancé et fallbacks pour Railway
let openai;
try {
  // Essayer plusieurs noms de variables à cause des bugs Railway
  let apiKey = process.env.OPENAI_API_KEY || 
               process.env.OPENAI_KEY || 
               process.env.DODO_OPENAI_KEY ||
               process.env.OPENAI_SECRET;
               
  // Si pas de clé directe, essayer la version Base64 encodée
  if (!apiKey && process.env.OPENAI_KEY_B64) {
    try {
      apiKey = Buffer.from(process.env.OPENAI_KEY_B64, 'base64').toString('utf8');
      console.log('🔐 Clé OpenAI décodée depuis Base64');
    } catch (error) {
      console.error('❌ Erreur décodage Base64:', error.message);
    }
  }
  
  console.log('🔍 Debug OpenAI Key Variables:', {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENAI_KEY: !!process.env.OPENAI_KEY,
    DODO_OPENAI_KEY: !!process.env.DODO_OPENAI_KEY,
    OPENAI_SECRET: !!process.env.OPENAI_SECRET,
    selected_key_exists: !!apiKey,
    selected_key_length: apiKey ? apiKey.length : 0,
    selected_key_starts: apiKey ? apiKey.substring(0, 7) : 'N/A',
    selected_key_ends: apiKey ? '...' + apiKey.substring(apiKey.length - 4) : 'N/A'
  });
  
  if (!apiKey || apiKey.trim() === '') {
    console.log('⚠️ OPENAI_API_KEY non configurée - Routes DodoLens en mode dégradé');
    openai = null;
  } else {
    const cleanedKey = apiKey.trim();
    openai = new OpenAI({
      apiKey: cleanedKey
    });
    console.log('✅ OpenAI SDK initialisé pour DodoLens avec clé valide');
  }
} catch (error) {
  console.error('❌ Erreur initialisation OpenAI SDK:', error.message);
  console.log('🔄 Routes DodoLens disponibles en mode dégradé');
  openai = null;
}

// Rate limiting spécifique pour DodoLens
const dodoLensLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 heures
  max: 10, // 10 requêtes par IP par jour
  message: {
    error: 'Limite quotidienne DodoLens atteinte (10 analyses/jour)',
    retryAfter: '24h',
    contact: 'Support technique disponible si besoin'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true // FIX RAILWAY: Trust proxy headers pour X-Forwarded-For
  // Pas de keyGenerator personnalisé = utilise req.ip par défaut (gère IPv6 correctement)
});

// Middleware upload pour audio (mémoire temporaire)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 25 * 1024 * 1024, // 25MB max (généreusement pour vidéos audio longues)
    files: 1
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 FileFilter - MIME reçu:', file.mimetype || 'undefined');
    // MOBILE FIX: Accepter TOUS les fichiers car mobile peut envoyer MIME vide
    // On validera le contenu côté OpenAI plutôt qu'ici
    cb(null, true);
  }
});

// ===============================================
// MIDDLEWARE JSON POUR ROUTES DODO-LENS
// ===============================================
router.use(express.json({ limit: '50mb' })); // Middleware JSON pour parser req.body - FIX v1.1

// ===============================================
// ROUTE EXPÉRIMENTALE: AUDIO RAW (BYPASS MULTER)
// ===============================================
router.post('/analyze-audio-raw', dodoLensLimiter, express.raw({type: 'audio/*', limit: '25mb'}), async (req, res) => {
  // Vérification OpenAI inline car requireOpenAI pas encore défini
  if (!openai) {
    return res.status(503).json({ 
      error: 'Service OpenAI temporairement indisponible',
      status: 'retry_later'
    });
  }
  
  // POLYFILL FILE GLOBAL pour route RAW (SOLUTION DÉFINITIVE)
  if (!globalThis.File) {
    try {
      const { File } = await import('node:buffer');
      globalThis.File = File;
      console.log('✅ File global défini pour route RAW');
    } catch (error) {
      console.log('⚠️ node:buffer non disponible, polyfill custom...');
      // Polyfill simple si node:buffer échoue
      globalThis.File = class File {
        constructor(parts, name, options = {}) {
          this.name = name;
          this.type = options.type || '';
          this.buffer = Buffer.concat(parts.map(p => Buffer.from(p)));
          this.size = this.buffer.length;
        }
        stream() {
          const { Readable } = require('stream');
          return Readable.from(this.buffer);
        }
      };
      console.log('✅ File polyfill custom installé');
    }
  }
  
  try {
    const startTime = Date.now();
    
    console.log('🎙️ Audio RAW reçu - BYPASS MULTER COMPLET:', {
      body_type: typeof req.body,
      body_constructor: req.body.constructor.name,
      body_length: req.body.length,
      content_type: req.headers['content-type']
    });
    
    // Validation basique
    if (!req.body || req.body.length === 0) {
      throw new Error('Aucun fichier audio reçu');
    }
    
    // Le req.body EST DÉJÀ UN BUFFER avec express.raw !
    const audioBuffer = req.body;
    console.log('✅ Buffer direct depuis express.raw:', audioBuffer.length, 'bytes');
    
    // Créer fichier temporaire DIRECTEMENT
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempFileName = `whisper_raw_${Date.now()}.webm`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);
    
    console.log('💾 Écriture directe Buffer → fichier temporaire');
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    console.log('📊 Fichier temporaire RAW créé:', {
      path: tempFilePath,
      size: audioBuffer.length,
      exists: fs.existsSync(tempFilePath)
    });
    
    // Appel OpenAI Whisper SANS CONVERSION
    console.log('🚀 OpenAI Whisper (méthode RAW - sans conversion)...');
    
    let response;
    try {
      const audioFileStream = fs.createReadStream(tempFilePath);
      audioFileStream.path = tempFilePath;
      
      response = await openai.audio.transcriptions.create({
        file: audioFileStream,
        model: "whisper-1",
        language: "fr",
        response_format: "json",
        temperature: 0.1
      });
      
      console.log('🎉 SUCCESS RAW! Texte transcrit:', response.text);
      
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log('🗑️ Fichier temporaire RAW supprimé');
        }
      } catch (cleanupError) {
        console.log('⚠️ Erreur cleanup:', cleanupError.message);
      }
    }
    
    // Retourner résultats
    const processingTime = Date.now() - startTime;
    const cost = calculateOpenAICost('whisper-1', { file_size: audioBuffer.length });
    
    res.json({
      success: true,
      transcript: response.text,
      method: 'raw-bypass-multer',
      usage: {
        file_size: audioBuffer.length,
        cost: Math.round(cost * 10000) / 10000,
        processing_time_ms: processingTime,
        transcript_length: response.text.length
      }
    });
    
  } catch (error) {
    console.error('❌ Whisper RAW Error:', error);
    res.status(500).json({ 
      error: 'Erreur transcription RAW',
      details: error.message
    });
  }
});

// ===============================================
// MIDDLEWARE DE VÉRIFICATION OPENAI
// ===============================================
const requireOpenAI = (req, res, next) => {
  if (!openai) {
    return res.status(503).json({ 
      error: 'Service DodoLens temporairement indisponible',
      details: 'Configuration OpenAI manquante - Contactez le support',
      debug: {
        hasEnvVar: !!process.env.OPENAI_API_KEY,
        envVarLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
      }
    });
  }
  next();
};

// ===============================================
// ROUTE 1: ANALYSE VISION (FRAMES VIDÉO)
// ===============================================
router.post('/analyze-vision', dodoLensLimiter, requireOpenAI, async (req, res) => {
  try {
    const { imageData, prompt } = req.body;
    
    // Validation des données
    if (!imageData || !prompt) {
      return res.status(400).json({ 
        error: 'imageData et prompt requis',
        received: {
          hasImageData: !!imageData,
          hasPrompt: !!prompt
        }
      });
    }
    
    // Validation format image
    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({ 
        error: 'imageData doit être au format data:image/...' 
      });
    }
    
    console.log('🔄 DodoLens Vision Analysis - IP:', hashIP(req.ip));
    const startTime = Date.now();
    
    // Appel OpenAI Vision avec gestion d'erreur robuste
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Modèle OpenAI le plus récent
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { 
              type: "image_url", 
              image_url: { 
                url: imageData,
                detail: "high"
              } 
            }
          ]
        }
      ],
      max_tokens: 1500,
      temperature: 0.1
    });
    
    const processingTime = Date.now() - startTime;
    
    // Log usage pour monitoring
    const usage = response.usage;
    const cost = calculateOpenAICost('gpt-4o', usage);
    
    await logDodoLensUsage(req.ip, 'vision', {
      tokens: usage.total_tokens,
      cost: cost,
      processing_time_ms: processingTime,
      timestamp: new Date()
    });
    
    console.log(`✅ Vision analysis success - Tokens: ${usage.total_tokens}, Cost: €${cost.toFixed(4)}, Time: ${processingTime}ms`);
    
    res.json({
      success: true,
      result: response.choices[0].message.content,
      usage: {
        tokens: usage.total_tokens,
        cost: Math.round(cost * 10000) / 10000, // 4 décimales
        processing_time_ms: processingTime
      }
    });
    
  } catch (error) {
    console.error('❌ OpenAI Vision Error DÉTAILLÉ:', error);
    console.error('❌ Error status:', error.status);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error type:', error.type);
    
    // Gestion des erreurs spécifiques OpenAI
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Limite OpenAI atteinte, réessayez dans quelques minutes',
        retry_after: 60
      });
    }
    
    if (error.status === 401) {
      return res.status(503).json({ 
        error: 'Configuration OpenAI invalide, contactez le support',
        details: 'Clé API invalide ou expirée'
      });
    }
    
    if (error.status === 400) {
      return res.status(400).json({ 
        error: 'Requête OpenAI invalide',
        details: error.message
      });
    }
    
    if (error.status === 403) {
      return res.status(403).json({ 
        error: 'Accès refusé - Vérifiez les permissions de votre clé OpenAI',
        details: 'Clé n\'a pas accès à GPT-4 Vision ou compte sans crédit'
      });
    }
    
    res.status(500).json({ 
      error: 'Erreur analyse IA',
      details: error.message || 'Erreur interne',
      debug: {
        status: error.status,
        code: error.code,
        type: error.type
      }
    });
  }
});

// ===============================================
// ROUTE 2: TRANSCRIPTION AUDIO (WHISPER)
// ===============================================
router.post('/analyze-audio', dodoLensLimiter, requireOpenAI, upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Fichier audio requis (champ: audioFile)' 
      });
    }
    
    console.log(`🔄 DodoLens Audio Transcription - IP: ${hashIP(req.ip)}, Size: ${(req.file.size / 1024 / 1024).toFixed(2)}MB`);
    const startTime = Date.now();
    
    // Préparation stream pour OpenAI Whisper
    console.log('🔧 Préparation stream audio pour OpenAI Whisper...');
    
    // SOLUTION ULTRA-ROBUSTE: Polyfill File optimisé pour Railway
    console.log('🔧 Création File polyfill robuste pour Railway...');
    
    // Toujours utiliser notre polyfill pour éviter les warnings expérimentaux
    globalThis.File = class File {
      constructor(fileBits, fileName, options = {}) {
        this.name = fileName;
        this.type = options.type || '';
        this.lastModified = Date.now();
        
        // Créer un buffer combiné optimisé
        if (fileBits.length === 1 && Buffer.isBuffer(fileBits[0])) {
          this._buffer = fileBits[0];
          this.size = fileBits[0].length;
        } else {
          const buffers = fileBits.map(bit => {
            if (Buffer.isBuffer(bit)) return bit;
            if (bit instanceof ArrayBuffer) return Buffer.from(bit);
            if (typeof bit === 'string') return Buffer.from(bit);
            return Buffer.from(bit);
          });
          this._buffer = Buffer.concat(buffers);
          this.size = this._buffer.length;
        }
        
        console.log(`📦 File polyfill créé: ${this.name} (${this.size} bytes, ${this.type})`);
      }
      
      // Méthode stream() compatible OpenAI
      stream() {
        const { Readable } = require('stream');
        const stream = Readable.from(this._buffer);
        
        // Propriétés nécessaires pour OpenAI
        stream.path = this.name;
        stream.filename = this.name;
        stream.mimetype = this.type;
        
        return stream;
      }
      
      // Méthodes Web API standards
      arrayBuffer() {
        return Promise.resolve(this._buffer.buffer.slice(
          this._buffer.byteOffset, 
          this._buffer.byteOffset + this._buffer.byteLength
        ));
      }
      
      text() {
        return Promise.resolve(this._buffer.toString('utf8'));
      }
      
      // Méthode pour récupérer le buffer directement
      buffer() {
        return this._buffer;
      }
    };
    
    console.log('✅ File polyfill robuste installé');
    
    // Logs détaillés du fichier reçu (version ultra-sécurisée)
    console.log('📊 Analyse fichier reçu:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer_type: typeof req.file.buffer
    });
    
    // Log constructor séparé pour éviter crash
    try {
      console.log('🔍 Buffer constructor:', req.file.buffer.constructor.name);
    } catch (e) {
      console.log('⚠️ Impossible de lire constructor:', e.message);
    }
    
    // Validation basique (adaptée pour Blob)
    if (!req.file.buffer || req.file.size === 0) {
      throw new Error('Fichier audio vide');
    }
    
    if (req.file.size > 25 * 1024 * 1024) {
      throw new Error('Fichier audio trop volumineux (>25MB)');
    }
    
    // SOLUTION DÉFINITIVE: File System temporaire - La seule qui marche avec OpenAI SDK
    console.log('🎙️ Utilisation fichier temporaire pour OpenAI compatibility...');
    
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // DIAGNOSTIC COMPLET et conversion forcée
    console.log('🔍 DIAGNOSTIC req.file.buffer:');
    console.log('  - Type:', typeof req.file.buffer);
    console.log('  - Constructor:', req.file.buffer.constructor.name);
    console.log('  - instanceof Buffer:', req.file.buffer instanceof Buffer);
    console.log('  - Has arrayBuffer method:', typeof req.file.buffer.arrayBuffer === 'function');
    console.log('  - Is array-like:', Array.isArray(req.file.buffer));
    
    let finalBuffer;
    
    // CONVERSION FORCÉE - Toutes les méthodes
    try {
      if (Buffer.isBuffer(req.file.buffer)) {
        console.log('✅ Déjà un Buffer Node.js');
        finalBuffer = req.file.buffer;
      } else if (req.file.buffer instanceof ArrayBuffer) {
        console.log('🔄 Conversion depuis ArrayBuffer...');
        finalBuffer = Buffer.from(req.file.buffer);
      } else if (typeof req.file.buffer.arrayBuffer === 'function') {
        console.log('🔄 Conversion depuis Blob via arrayBuffer...');
        const arrayBuffer = await req.file.buffer.arrayBuffer();
        finalBuffer = Buffer.from(arrayBuffer);
      } else if (req.file.buffer.buffer) {
        console.log('🔄 Conversion depuis TypedArray...');
        finalBuffer = Buffer.from(req.file.buffer.buffer);
      } else {
        console.log('🔄 Conversion générique...');
        finalBuffer = Buffer.from(req.file.buffer);
      }
      
      console.log('✅ Conversion réussie - Buffer final:', finalBuffer.length, 'bytes');
      
    } catch (convError) {
      console.log('❌ TOUTES conversions ont échoué:', convError.message);
      console.log('🆘 Type détaillé:', Object.prototype.toString.call(req.file.buffer));
      throw new Error(`Conversion impossible: ${convError.message}`);
    }
    
    // Créer fichier temporaire
    const tempFileName = `whisper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webm`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);
    
    console.log('💾 Écriture fichier temporaire:', tempFilePath);
    fs.writeFileSync(tempFilePath, finalBuffer);
    
    console.log('📊 Fichier temporaire créé:', {
      path: tempFilePath,
      size: finalBuffer.length,
      exists: fs.existsSync(tempFilePath)
    });
    
    // Appel OpenAI Whisper avec fichier temporaire (SOLUTION DÉFINITIVE)
    console.log('🚀 Début appel OpenAI Whisper API...');
    console.log('📋 Paramètres Whisper:', {
      model: "whisper-1",
      language: "fr", 
      response_format: "json",
      temperature: 0.1,
      file_path: tempFilePath,
      file_size: finalBuffer.length
    });
    
    let response;
    try {
      // Créer ReadStream depuis le fichier temporaire (standard Node.js)
      const audioFileStream = fs.createReadStream(tempFilePath);
      audioFileStream.path = tempFilePath; // Important pour OpenAI SDK
      
      console.log('📁 ReadStream natif créé depuis fichier temporaire');
      
      response = await openai.audio.transcriptions.create({
        file: audioFileStream,
        model: "whisper-1",
        language: "fr",
        response_format: "json",
        temperature: 0.1
      });
      
      console.log('🎉 Réponse OpenAI Whisper reçue!');
      console.log('📝 Longueur transcription:', response.text.length, 'caractères');
      console.log('📝 Texte transcrit:', response.text);
      
    } catch (whisperApiError) {
      console.error('💥 Erreur OpenAI Whisper API:', {
        message: whisperApiError.message,
        status: whisperApiError.status,
        type: whisperApiError.type,
        error_details: whisperApiError.error || 'N/A'
      });
      throw whisperApiError;
    } finally {
      // Nettoyer le fichier temporaire (TOUJOURS)
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log('🗑️ Fichier temporaire supprimé:', tempFilePath);
        }
      } catch (cleanupError) {
        console.log('⚠️ Erreur suppression fichier temporaire:', cleanupError.message);
      }
    }
    
    // Calcul du temps de traitement et coût
    const processingTime = Date.now() - startTime;
    const cost = calculateOpenAICost('whisper-1', { file_size: req.file.size });
    
    // Log usage
    await logDodoLensUsage(req.ip, 'whisper', {
      file_size: req.file.size,
      cost: cost,
      processing_time_ms: processingTime,
      transcript_length: response.text.length,
      timestamp: new Date()
    });
    
    console.log(`✅ Audio transcription success - Text: ${response.text.length} chars, Cost: €${cost.toFixed(4)}, Time: ${processingTime}ms`);
    
    // Retourner les résultats
    res.json({
      success: true,
      transcript: response.text,
      usage: {
        file_size: req.file.size,
        cost: Math.round(cost * 10000) / 10000,
        processing_time_ms: processingTime,
        transcript_length: response.text.length
      }
    });
    
  } catch (error) {
    console.error('❌ Whisper Error:', error);
    
    if (error.status === 400 && error.message.includes('file')) {
      return res.status(400).json({ 
        error: 'Format audio non supporté ou fichier corrompu' 
      });
    }
    
    res.status(500).json({ 
      error: 'Erreur transcription audio',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne'
    });
  }
});

// ===============================================
// ROUTE 3: ANALYSE FUSION GPT-4
// ===============================================
router.post('/analyze-fusion', dodoLensLimiter, requireOpenAI, async (req, res) => {
  try {
    const { visualResults, audioTranscript, prompt } = req.body;
    
    if (!visualResults || !audioTranscript) {
      return res.status(400).json({ 
        error: 'visualResults et audioTranscript requis',
        received: {
          hasVisualResults: !!visualResults,
          hasAudioTranscript: !!audioTranscript
        }
      });
    }
    
    console.log(`🔄 DodoLens Fusion Analysis - IP: ${hashIP(req.ip)}`);
    const startTime = Date.now();
    
    // Prompt par défaut optimisé
    const defaultPrompt = `Fusionne intelligemment ces données pour un déménagement DOM-TOM:

OBJETS DÉTECTÉS VISUELLEMENT:
${Array.isArray(visualResults) ? JSON.stringify(visualResults, null, 2) : visualResults}

COMMENTAIRES AUDIO DE L'UTILISATEUR:
"${audioTranscript}"

Retourne UNIQUEMENT un JSON valide avec cette structure:
{
  "objects": [
    {
      "name": "nom de l'objet en français",
      "quantity": nombre_final,
      "volume": volume_en_m3,
      "category": "salon|cuisine|chambre|bureau|autre",
      "confidence": score_0_a_1,
      "source": "vision|audio|fusion"
    }
  ],
  "totalVolume": somme_volumes_m3,
  "confidence": score_global_0_a_1
}

Règles:
- Si l'utilisateur dit "je prends" → inclure l'objet
- Si l'utilisateur dit "je laisse" → exclure l'objet  
- Fusionner objets similaires (ex: "canapé" + "canapé 3 places")
- Volumes réalistes pour DOM-TOM (pas de meubles géants)`;
    
    // Appel GPT-4 pour fusion
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: prompt || defaultPrompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });
    
    const processingTime = Date.now() - startTime;
    
    // Log usage
    const usage = response.usage;
    const cost = calculateOpenAICost('gpt-4', usage);
    
    await logDodoLensUsage(req.ip, 'fusion', {
      tokens: usage.total_tokens,
      cost: cost,
      processing_time_ms: processingTime,
      timestamp: new Date()
    });
    
    console.log(`✅ Fusion analysis success - Tokens: ${usage.total_tokens}, Cost: €${cost.toFixed(4)}, Time: ${processingTime}ms`);
    
    res.json({
      success: true,
      result: response.choices[0].message.content,
      usage: {
        tokens: usage.total_tokens,
        cost: Math.round(cost * 10000) / 10000,
        processing_time_ms: processingTime
      }
    });
    
  } catch (error) {
    console.error('❌ GPT-4 Fusion Error:', error);
    
    res.status(500).json({ 
      error: 'Erreur fusion IA',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne'
    });
  }
});

// ===============================================
// ROUTE 4: STATISTIQUES USAGE (POUR MONITORING)
// ===============================================
router.get('/stats', async (req, res) => {
  try {
    // Statistiques simples du cache/logs
    const stats = {
      service: 'DodoLens Routes',
      status: openai ? 'operational' : 'degraded',
      uptime: Math.round(process.uptime()),
      cache_size: global.dodoLensUsageCache ? global.dodoLensUsageCache.size : 0,
      timestamp: new Date().toISOString(),
      openai: {
        configured: !!openai, // Vraie détection basée sur l'initialisation réussie
        initialized: !!openai,
        key_length: (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.DODO_OPENAI_KEY || process.env.OPENAI_SECRET)?.length || 0,
        // Debug Railway - Tester tous les noms de variables
        debug_vars: {
          OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
          OPENAI_KEY: !!process.env.OPENAI_KEY,
          DODO_OPENAI_KEY: !!process.env.DODO_OPENAI_KEY,
          OPENAI_SECRET: !!process.env.OPENAI_SECRET,
          OPENAI_KEY_B64: !!process.env.OPENAI_KEY_B64
        }
      },
      routes: [
        '/api/dodo-lens/analyze-vision',
        '/api/dodo-lens/analyze-audio', 
        '/api/dodo-lens/analyze-fusion',
        '/api/dodo-lens/stats'
      ]
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ 
      error: 'Erreur récupération stats',
      details: error.message 
    });
  }
});

// ===============================================
// UTILITAIRES
// ===============================================

// Calcul coût OpenAI (prix août 2025)
function calculateOpenAICost(model, usage) {
  const prices = {
    'gpt-4o': {
      input: 0.00250 / 1000,  // $2.50 per 1M input tokens
      output: 0.01000 / 1000  // $10.00 per 1M output tokens
    },
    'gpt-4': {
      input: 0.03000 / 1000,  // $30.00 per 1M input tokens
      output: 0.06000 / 1000  // $60.00 per 1M output tokens
    },
    'whisper-1': 0.006 / 60 // $0.006 per minute
  };
  
  if (model === 'whisper-1') {
    // Approximation: 1MB ≈ 1 minute audio
    const estimatedMinutes = usage.file_size / (1024 * 1024);
    return Math.max(0.001, estimatedMinutes * prices['whisper-1']); // Minimum 0.1 centime
  } else {
    const modelPrices = prices[model];
    if (!modelPrices || !usage.prompt_tokens) return 0.001;
    
    return (usage.prompt_tokens * modelPrices.input) + 
           ((usage.completion_tokens || 0) * modelPrices.output);
  }
}

// Log usage en mémoire simple (remplacer par DB si besoin)
async function logDodoLensUsage(ip, type, data) {
  try {
    // Cache global simple pour éviter la création multiple
    if (!global.dodoLensUsageCache) {
      global.dodoLensUsageCache = new Map();
    }
    
    const logEntry = {
      ip_hash: hashIP(ip),
      type,
      ...data
    };
    
    // Stocker avec TTL de 24h
    const key = `${Date.now()}_${type}_${hashIP(ip)}`;
    global.dodoLensUsageCache.set(key, logEntry);
    
    // Console log pour Railway logs
    console.log('📊 DodoLens Usage:', logEntry);
    
    // Nettoyage périodique (garder que les 1000 dernières entrées)
    if (global.dodoLensUsageCache.size > 1000) {
      const keys = Array.from(global.dodoLensUsageCache.keys()).sort();
      const toDelete = keys.slice(0, keys.length - 1000);
      toDelete.forEach(key => global.dodoLensUsageCache.delete(key));
    }
    
  } catch (error) {
    console.error('Error logging DodoLens usage:', error);
  }
}

// Hash IP pour RGPD
function hashIP(ip) {
  const salt = process.env.IP_SALT || 'dodo-lens-default-salt-2025';
  return crypto.createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .substring(0, 16);
}

module.exports = router;

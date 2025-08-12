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
  legacyHeaders: false
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
    // Accepter seulement audio/vidéo
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers audio/vidéo sont acceptés'));
    }
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
      model: "gpt-4o",
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
    console.error('❌ OpenAI Vision Error:', error);
    
    // Gestion des erreurs spécifiques OpenAI
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Limite OpenAI atteinte, réessayez dans quelques minutes',
        retry_after: 60
      });
    }
    
    if (error.status === 401) {
      return res.status(503).json({ 
        error: 'Configuration OpenAI invalide, contactez le support' 
      });
    }
    
    if (error.status === 400 && error.message.includes('image')) {
      return res.status(400).json({ 
        error: 'Format d\'image non supporté ou image corrompue' 
      });
    }
    
    res.status(500).json({ 
      error: 'Erreur analyse IA',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne'
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
    
    // Créer un fichier temporaire pour Whisper
    const audioFile = new File([req.file.buffer], 'audio.webm', {
      type: req.file.mimetype
    });
    
    // Appel OpenAI Whisper
    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "fr", // Français pour DOM-TOM
      response_format: "json",
      temperature: 0.1 // Plus déterministe
    });
    
    const processingTime = Date.now() - startTime;
    
    // Log usage
    const cost = calculateOpenAICost('whisper-1', { file_size: req.file.size });
    
    await logDodoLensUsage(req.ip, 'whisper', {
      file_size: req.file.size,
      cost: cost,
      processing_time_ms: processingTime,
      transcript_length: response.text.length,
      timestamp: new Date()
    });
    
    console.log(`✅ Audio transcription success - Text: ${response.text.length} chars, Cost: €${cost.toFixed(4)}, Time: ${processingTime}ms`);
    
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
        configured: !!process.env.OPENAI_API_KEY,
        initialized: !!openai,
        key_length: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
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

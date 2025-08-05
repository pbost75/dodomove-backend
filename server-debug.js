console.log('=== SERVEUR DE DIAGNOSTIC RAILWAY ===');
console.log('Démarrage:', new Date().toISOString());

// Vérifier les variables d'environnement critiques
console.log('--- VARIABLES D\'ENVIRONNEMENT ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
console.log('AIRTABLE_API_KEY existe:', !!process.env.AIRTABLE_API_KEY);
console.log('AIRTABLE_BASE_ID existe:', !!process.env.AIRTABLE_BASE_ID);
console.log('RESEND_API_KEY existe:', !!process.env.RESEND_API_KEY);

const express = require('express');
const app = express();

// Configuration basique
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Middleware de logs
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Route healthcheck ULTRA SIMPLE
app.get('/', (req, res) => {
  console.log('🩺 Healthcheck appelé');
  
  const status = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    port: PORT,
    host: HOST,
    environment: process.env.NODE_ENV || 'development',
    railway: process.env.RAILWAY_ENVIRONMENT || 'none',
    hasAirtable: !!process.env.AIRTABLE_API_KEY,
    hasResend: !!process.env.RESEND_API_KEY,
    uptime: process.uptime()
  };
  
  console.log('📋 Status:', JSON.stringify(status, null, 2));
  res.status(200).json(status);
});

// Route de ping simple
app.get('/ping', (req, res) => {
  console.log('🏓 Ping appelé');
  res.status(200).send('pong');
});

// Route de test sans dépendances externes
app.get('/test-simple', (req, res) => {
  console.log('🧪 Test simple appelé');
  res.status(200).json({
    message: 'Test réussi',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    versions: process.versions
  });
});

// Gestion d'erreurs globales
process.on('uncaughtException', (error) => {
  console.error('❌ Exception non gérée:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promesse rejetée:', reason);
});

// Démarrage du serveur
console.log(`🚀 Tentative de démarrage sur ${HOST}:${PORT}`);

app.listen(PORT, HOST, () => {
  console.log('✅ SERVEUR DÉMARRÉ AVEC SUCCÈS !');
  console.log(`📍 Adresse: http://${HOST}:${PORT}`);
  console.log('🩺 Healthcheck: GET /');
  console.log('🏓 Ping: GET /ping');
  console.log('🧪 Test: GET /test-simple');
  console.log('=================================');
}).on('error', (error) => {
  console.error('❌ ERREUR DE DÉMARRAGE:', error);
  process.exit(1);
});

// Log toutes les 30 secondes pour montrer que le serveur fonctionne
setInterval(() => {
  console.log(`💓 Serveur actif - Uptime: ${Math.floor(process.uptime())}s`);
}, 30000); 
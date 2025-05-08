console.log('=== Dodomove backend: démarrage du serveur ===');
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const host = '0.0.0.0';

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// CORS configuration simple
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// Health route
app.get('/health', (req, res) => {
  console.log('GET /health appelé');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Le serveur fonctionne correctement'
  });
});

// Ping route
app.get('/ping', (req, res) => {
  console.log('GET /ping appelé');
  res.send('pong');
});

// Endpoint simple pour tester l'application
app.get('/', (req, res) => {
  res.send('Bienvenue sur le backend de Dodomove!');
});

// Démarrer le serveur
app.listen(PORT, host, () => {
  console.log(`Serveur démarré sur ${host}:${PORT}`);
  console.log('Routes disponibles:');
  console.log('- GET /');
  console.log('- GET /health');
  console.log('- GET /ping');
}); 
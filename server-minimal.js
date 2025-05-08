// Serveur Express minimal pour tester le déploiement Railway
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware de base
app.use(cors());
app.use(express.json());

// Logging simple
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes de base
app.get('/', (req, res) => {
  res.status(200).send('OK - Serveur en ligne');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API fonctionne correctement',
    timestamp: new Date().toISOString()
  });
});

// Démarrer le serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur minimal démarré sur le port ${PORT}`);
}); 
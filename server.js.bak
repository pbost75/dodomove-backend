console.log('=== Dodomove backend: démarrage du serveur ===');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const Airtable = require('airtable');

const app = express();

// Configuration des timeouts
app.use((req, res, next) => {
  // Augmente le timeout à 120 secondes
  req.setTimeout(120000);
  res.setTimeout(120000);
  next();
});

// Route de debug
app.get('/ping', (req, res) => {
  console.log('GET /ping appelé');
  res.send('pong');
});

// Route de santé (health check) pour Railway
app.get('/health', (req, res) => {
  console.log('GET /health appelé');
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Configuration CORS
const allowedOrigins = [
  process.env.FRONTEND_URL, // domaine de production
  "http://localhost:8080"  // pour le développement local
].filter(Boolean); // retire undefined

const corsOptions = {
  origin: (origin, callback) => {
    console.log('CORS origin reçu:', origin);
    console.log('Origins autorisés:', allowedOrigins);
    // En développement, on accepte toutes les origines
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    // En production, on vérifie l'origine
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Origine refusée:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Appliquer CORS globalement
app.use(cors(corsOptions));

// Gestionnaire explicite pour les requêtes OPTIONS
app.options('*', (req, res) => {
  console.log('Requête OPTIONS reçue:', {
    path: req.path,
    headers: req.headers
  });
  res.status(204).end();
});

// Middleware pour les en-têtes CORS supplémentaires
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  next();
});

app.use(express.json());

// Initialisation des clients
console.log('Initialisation Resend et Airtable');
console.log('AIRTABLE_API_KEY:', process.env.AIRTABLE_API_KEY);
console.log('AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID);
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
const resend = new Resend(process.env.RESEND_API_KEY);
const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY})
  .base(process.env.AIRTABLE_BASE_ID);

// Endpoint pour Airtable
app.post('/submit-airtable', async (req, res) => {
  console.log('POST /submit-airtable appelé');
  try {
    const { email, items, totalVolume, movingTimelineText } = req.body;
    console.log('Données reçues:', req.body);
    const record = await base('tblEBCktaZB4BSKAJ').create([{
      fields: {
        Email: email,
        Items: JSON.stringify(items),
        TotalVolume: parseFloat(totalVolume.toFixed(2)),
        MovingTimelineText: movingTimelineText
      }
    }]);
    console.log('Airtable record créé:', record);
    res.status(200).json({ success: true, record });
  } catch (error) {
    console.error('Erreur Airtable:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint pour l'envoi d'email
app.post('/send-email', async (req, res) => {
  console.log('=== POST /send-email appelé ===');
  console.log('Headers reçus:', req.headers);
  console.log('Body reçu:', req.body);
  
  // Définir un timeout pour la requête
  const timeout = setTimeout(() => {
    console.error('Timeout atteint pour /send-email');
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        error: 'Timeout lors de l\'envoi de l\'email'
      });
    }
  }, 30000); // 30 secondes de timeout

  try {
    const { email, items, totalVolume } = req.body;
    
    if (!email || !items || totalVolume === undefined) {
      clearTimeout(timeout);
      console.error('Données manquantes:', { email, items, totalVolume });
      return res.status(400).json({ 
        success: false, 
        error: 'Données manquantes',
        received: { email, items, totalVolume }
      });
    }

    console.log('Données validées, création du tableau HTML...');
    // Création du tableau HTML pour l'email
    const itemsTable = `
      <table style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Item</th>
            <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Quantité</th>
            <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Volume</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${item.name}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${item.quantity}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${(item.volume * item.quantity).toFixed(2)} m³</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    console.log('Envoi de l\'email via Resend...');
    const emailResult = await resend.emails.send({
      from: "Dodomove <onboarding@resend.dev>",
      to: email,
      subject: "Estimation de votre volume de déménagement",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #000080;">Estimation de votre volume de déménagement</h1>
          <p>Bonjour,</p>
          <p>Prêts à découvrir le volume de votre déménagement ? Conformément à ce que vous avez saisi dans le calculateur, nous estimons le volume de déménagement à <strong>${totalVolume.toFixed(1)} m³</strong></p>
          <h2>Liste des biens que vous planifiez de déménager :</h2>
          ${itemsTable}
        </div>
      `
    });
    
    console.log('Email envoyé avec succès:', emailResult);
    clearTimeout(timeout);
    res.status(200).json({ success: true, emailResult });
    
  } catch (error) {
    clearTimeout(timeout);
    console.error('Erreur détaillée Resend:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response ? error.response.data : null
    });
  }
});

// Middleware de gestion d'erreur global
app.use((err, req, res, next) => {
  console.error('Erreur Express globale:', err);
  res.status(500).send('Erreur serveur');
});

const PORT = process.env.PORT || 3001;
const host = '0.0.0.0'; // S'assurer que le serveur écoute sur toutes les interfaces

console.log('=== Dodomove backend: juste avant listen, PORT =', PORT);
console.log('=== Dodomove backend: environnement =', process.env.NODE_ENV || 'development');
console.log('=== Dodomove backend: interface d\'écoute =', host);

const server = app.listen(PORT, host, () => {
  console.log(`Serveur démarré sur ${host}:${PORT}`);
  console.log('=== Routes disponibles ===');
  app._router.stack
    .filter(r => r.route)
    .forEach(r => {
      Object.keys(r.route.methods).forEach(method => {
        if (r.route.methods[method]) {
          console.log(`${method.toUpperCase()} ${r.route.path}`);
        }
      });
    });
}); 

// Gestion des erreurs au niveau du serveur
server.on('error', (error) => {
  console.error('Erreur au démarrage du serveur:', error);
}); 
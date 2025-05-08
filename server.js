console.log('=== Dodomove backend: démarrage du serveur ===');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const Airtable = require('airtable');

const app = express();

// Route de debug
app.get('/ping', (req, res) => {
  console.log('GET /ping appelé');
  res.send('pong');
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
  preflightContinue: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Gère les requêtes preflight CORS
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
  try {
    const { email, items, totalVolume } = req.body;
    if (!email || !items || totalVolume === undefined) {
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
    await resend.emails.send({
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
    console.log('Email envoyé via Resend');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erreur Resend:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Middleware de gestion d'erreur global
app.use((err, req, res, next) => {
  console.error('Erreur Express globale:', err);
  res.status(500).send('Erreur serveur');
});

const PORT = process.env.PORT || 3001;
console.log('=== Dodomove backend: juste avant listen, PORT =', PORT);
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
}); 
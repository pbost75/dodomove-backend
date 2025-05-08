require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const Airtable = require('airtable');

const app = express();

// Configuration CORS
const allowedOrigins = [
  process.env.FRONTEND_URL, // domaine de production
  "http://localhost:8080"  // pour le développement local
].filter(Boolean); // retire undefined

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Initialisation des clients
const resend = new Resend(process.env.RESEND_API_KEY);
const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY})
  .base(process.env.AIRTABLE_BASE_ID);

// Endpoint pour Airtable
app.post('/submit-airtable', async (req, res) => {
  try {
    const { email, items, totalVolume, movingTimelineText } = req.body;
    
    const record = await base('tblEBCktaZB4BSKAJ').create([{
      fields: {
        Email: email,
        Items: JSON.stringify(items),
        TotalVolume: parseFloat(totalVolume.toFixed(2)),
        MovingTimelineText: movingTimelineText
      }
    }]);

    res.status(200).json({ success: true, record });
  } catch (error) {
    console.error('Erreur Airtable:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint pour l'envoi d'email
app.post('/send-email', async (req, res) => {
  try {
    const { email, items, totalVolume } = req.body;
    
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

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erreur Resend:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
}); 
console.log('=== Dodomove backend: démarrage du serveur ===');
require('dotenv').config();

// Import des modules pour l'envoi d'emails et Airtable
const { Resend } = require('resend');
const Airtable = require('airtable');
const crypto = require('crypto');

// Log toutes les variables d'environnement au démarrage
console.log('=== Variables d\'environnement ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
// Masquer les valeurs sensibles mais vérifier si elles existent
console.log('AIRTABLE_API_KEY existe:', !!process.env.AIRTABLE_API_KEY);
console.log('AIRTABLE_BASE_ID existe:', !!process.env.AIRTABLE_BASE_ID);
console.log('RESEND_API_KEY existe:', !!process.env.RESEND_API_KEY);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);

const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
// Railway recommande d'utiliser le port qu'ils fournissent
const PORT = process.env.PORT || 8080;
const host = '0.0.0.0';

// Logging middleware avec plus de détails
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} - Response: ${res.statusCode}`);
  });
  next();
});

// CORS configuration plus permissive
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Health route spécifique pour Railway (/) - recommandée pour les healthchecks
app.get('/', (req, res) => {
  console.log('GET / appelé (healthcheck)');
  res.status(200).send('OK');
});

// Route healthcheck supplémentaire au chemin standard
app.get('/_health', (req, res) => {
  console.log('GET /_health appelé');
  res.status(200).send('OK');
});

// Route pour tester directement la connexion Airtable
app.get('/test-airtable', async (req, res) => {
  console.log('GET /test-airtable appelé');
  try {
    // Vérifier si les variables d'environnement sont définies
    console.log('AIRTABLE_API_KEY défini:', !!process.env.AIRTABLE_API_KEY);
    console.log('AIRTABLE_BASE_ID défini:', !!process.env.AIRTABLE_BASE_ID);
    
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Variables d\'environnement Airtable manquantes',
        env: {
          AIRTABLE_API_KEY: !!process.env.AIRTABLE_API_KEY,
          AIRTABLE_BASE_ID: !!process.env.AIRTABLE_BASE_ID
        }
      });
    }
    
    // Test de connexion à Airtable
    const testReference = `TEST-${Date.now()}`;
    const demandesTableId = 'tblic0CaPaaKZwouK'; // ID de la table des demandes
    
    // Créer un enregistrement de test simple
    const record = await base(demandesTableId).create([
      {
        fields: {
          "Référence": testReference,
          "Prénom": "Test",
          "Nom": "Connexion",
          "Email": "test@example.com",
          "Date de soumission": new Date().toISOString(),
          "Statut": "Test"
        }
      }
    ]);
    
    return res.status(200).json({
      success: true,
      message: 'Connexion à Airtable réussie',
      record: record,
      testReference: testReference
    });
  } catch (error) {
    console.error('Erreur lors du test Airtable:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion à Airtable',
      details: error.message,
      stack: error.stack
    });
  }
});

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

// Route pour afficher les variables d'environnement (valeurs masquées pour la sécurité)
app.get('/env', (req, res) => {
  console.log('GET /env appelé');
  res.status(200).json({
    NODE_ENV: process.env.NODE_ENV || 'non défini',
    PORT: process.env.PORT || 'non défini',
    AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY ? '[DÉFINI]' : 'non défini',
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID ? '[DÉFINI]' : 'non défini',
    RESEND_API_KEY: process.env.RESEND_API_KEY ? '[DÉFINI]' : 'non défini',
    FRONTEND_URL: process.env.FRONTEND_URL || 'non défini'
  });
});

// Route de test complètement indépendante des variables d'environnement
app.get('/test', (req, res) => {
  console.log('GET /test appelé');
  
  // Générer un objet de test simple
  const testData = {
    message: "Cette route est indépendante des variables d'environnement",
    timestamp: new Date().toISOString(),
    random: Math.random(),
    serverInfo: {
      platform: process.platform,
      nodeVersion: process.version,
      uptime: process.uptime()
    }
  };
  
  // Répondre avec les données de test
  res.status(200).json(testData);
});

// Simple API message route
app.get('/api/message', (req, res) => {
  console.log('GET /api/message appelé');
  res.json({ message: "Hello from Express API!" });
});

// Configuration de Resend pour l'envoi d'emails
const resend = new Resend(process.env.RESEND_API_KEY);
console.log('Resend configuré:', !!process.env.RESEND_API_KEY);

// Configuration d'Airtable
Airtable.configure({
  apiKey: process.env.AIRTABLE_API_KEY,
});
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
console.log('Airtable configuré:', !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID);

// Fonction utilitaire pour générer le HTML des items
function generateItemsHTML(items) {
  let html = '<table style="width:100%; border-collapse: collapse; margin-bottom: 20px;">';
  html += '<tr style="background-color: #f8f9fa;"><th style="padding: 10px; text-align: left; border: 1px solid #dee2e6;">Objet</th><th style="padding: 10px; text-align: center; border: 1px solid #dee2e6;">Quantité</th><th style="padding: 10px; text-align: right; border: 1px solid #dee2e6;">Volume</th></tr>';
  
  items.forEach(item => {
    const totalItemVolume = item.volume * item.quantity;
    html += `<tr>
      <td style="padding: 10px; border: 1px solid #dee2e6;">${item.name}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #dee2e6;">${item.quantity}</td>
      <td style="padding: 10px; text-align: right; border: 1px solid #dee2e6;">${totalItemVolume.toFixed(2)} m³</td>
    </tr>`;
  });
  
  html += '</table>';
  return html;
}

// Route pour envoyer les emails
app.post('/send-email', async (req, res) => {
  console.log('POST /send-email appelé');
  console.log('Body reçu:', req.body);
  
  try {
    // Détecter le type d'email selon les données reçues
    const { type, email, name, items, totalVolume, movingTimelineText, 
            requestId, customerEmail, customerPhone, subject, message } = req.body;
    
    // ROUTE POUR LES EMAILS DE CONTACT DU FUNNEL
    if (type === 'contact_support' || (requestId && customerEmail && subject && message)) {
      console.log('🎯 Email de contact du funnel détecté');
      
      const clientEmail = customerEmail || email;
      
      // Vérification des données requises pour le contact
      if (!clientEmail || !subject || !message) {
        console.error('Données de contact manquantes:', { clientEmail, subject, message });
        return res.status(400).json({ 
          success: false, 
          error: 'Données de contact manquantes',
          received: { 
            hasEmail: !!clientEmail, 
            hasSubject: !!subject, 
            hasMessage: !!message 
          }
        });
      }
      
      // Envoyer l'email de contact via Resend
      console.log('Envoi de l\'email de contact via Resend...');
      const { data, error } = await resend.emails.send({
        from: 'DodoMove Support <noreply@dodomove.fr>',
        to: ['bost.analytics@gmail.com'], // Email de support
        replyTo: [clientEmail], // Permettre de répondre directement au client
        subject: `[Contact Funnel] ${subject}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden;">
          <!-- En-tête -->
          <div style="background-color: #4285F4; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">DodoMove - Contact Funnel</h1>
          </div>
          
          <!-- Contenu principal -->
          <div style="padding: 20px; background-color: white;">
            <h2 style="color: #333; font-size: 22px;">Nouveau message de contact 📧</h2>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              <p><strong>Référence de demande :</strong> ${requestId || 'Non spécifiée'}</p>
              <p><strong>Email client :</strong> ${clientEmail}</p>
              ${customerPhone ? `<p><strong>Téléphone :</strong> ${customerPhone}</p>` : ''}
              <p><strong>Sujet :</strong> ${subject}</p>
              <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
            </div>
            
            <div style="background-color: white; border: 1px solid #ddd; padding: 20px; border-radius: 5px;">
              <h3 style="margin-top: 0; color: #333;">Message du client :</h3>
              <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="mailto:${clientEmail}" style="display: inline-block; background-color: #4285F4; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: 500;">
                Répondre au client
              </a>
            </div>
          </div>
          
          <!-- Pied de page -->
          <div style="text-align: center; padding: 15px; background-color: #f8f9fa; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
            <p>© 2024 DodoMove - Email automatique depuis le funnel</p>
          </div>
        </div>
        `,
      });
      
      if (error) {
        console.error('Erreur Resend pour email de contact:', error);
        return res.status(500).json({ 
          success: false, 
          error: `Erreur lors de l'envoi de l'email de contact: ${error.message}` 
        });
      }
      
      console.log('Email de contact envoyé avec succès, ID:', data.id);
      
      // Répondre avec succès
      return res.status(200).json({ 
        success: true,
        message: `Email de contact envoyé avec succès depuis ${clientEmail}`,
        emailId: data.id
      });
    }
    
    // ROUTE POUR LES ESTIMATIONS DE VOLUME (comportement original)
    console.log('📦 Email d\'estimation de volume détecté');
    
    // Vérification des données requises pour l'estimation
    if (!email || !items || totalVolume === undefined) {
      console.error('Données d\'estimation manquantes:', { email, items, totalVolume });
      return res.status(400).json({ 
        success: false, 
        error: 'Données d\'estimation manquantes',
        received: { 
          hasEmail: !!email, 
          hasItems: !!items, 
          hasTotalVolume: totalVolume !== undefined 
        }
      });
    }

    console.log('Données validées, création du tableau HTML...');
    const itemsHTML = generateItemsHTML(items);
    
    // Préparer la période de déménagement si disponible
    let timelineHTML = '';
    if (movingTimelineText) {
      timelineHTML = `
      <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
        <p style="margin-top: 0;"><strong>Période de déménagement :</strong> ${movingTimelineText}</p>
      </div>`;
    }
    
    // Envoyer l'email via Resend
    console.log('Envoi de l\'email via Resend...');
    const { data, error } = await resend.emails.send({
      from: 'Dodomove <noreply@dodomove.fr>',
      to: [email],
      subject: 'Estimation de votre volume de déménagement 📦',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden;">
        <!-- En-tête avec logo et image -->
        <div style="background-color: #4285F4; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Dodomove</h1>
          <div style="background-image: url('https://volume.dodomove.fr/images/dodomove-header.jpg'); height: 120px; background-position: center; background-size: cover; margin-top: 15px; border-radius: 5px;"></div>
        </div>
        
        <!-- Contenu principal -->
        <div style="padding: 20px; background-color: white;">
          <h2 style="color: #333; font-size: 22px;">Estimation de votre <span style="color: #4CAF50;">volume de déménagement</span> 📦</h2>
          
          <p>Bonjour${name ? ' ' + name : ''},</p>
          
          <p>Prêts à découvrir le volume de votre déménagement ? Conformément à ce que vous avez saisi dans le calculateur, <strong>nous estimons le volume de déménagement à ${totalVolume.toFixed(2)} m³</strong>${totalVolume > 0 ? ' / ' + Math.ceil(totalVolume * 35.315) + ' ft³' : ''}.</p>
          
          <p style="background-color: #f8f9fa; padding: 10px; border-left: 4px solid #4285F4; font-style: italic;"><strong>Attention :</strong> Ce calculateur ne vous fournit <strong>qu'une simple estimation</strong>. Le calculateur de volume a pour but de vous aider à estimer vos frais de déménagement, le nombre de cartons de déménagement dont vous aurez besoin ainsi que la taille du camion de déménagement nécessaire pour votre déménagement.</p>
          
          <p><strong>Vous souhaitez faire des économies sur votre déménagement ?</strong> Nous sommes là pour vous aider.</p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="https://dodomove.fr" style="display: inline-block; background-color: #f47d6c; color: white; padding: 15px 25px; text-decoration: none; border-radius: 30px; font-weight: 500; font-size: 16px;">
              <span style="margin-right: 10px;">Demandez jusqu'à 5 devis</span>
              <span style="font-weight: bold;">→</span>
            </a>
            <div style="margin-top: 10px; color: #333; font-size: 14px; display: flex; align-items: center; justify-content: center;">
              <span style="display: inline-flex; align-items: center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;">
                  <path d="M3 3h12v10H3z"></path>
                  <path d="M15 6h3a3 3 0 0 1 3 3v4h-6"></path>
                  <path d="M6 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
                  <path d="M18 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
                </svg>
                en 2 minutes
              </span>
            </div>
          </div>
          
          <p>Vous trouverez ci-dessous la liste des biens que vous planifiez de déménager :</p>
          
          ${itemsHTML}
          
          <div style="background-color: #4CAF50; color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <h3 style="margin: 0; font-size: 18px;">Volume total estimé: ${totalVolume.toFixed(2)} m³${totalVolume > 0 ? ' / ' + Math.ceil(totalVolume * 35.315) + ' ft³' : ''}</h3>
          </div>
          
          <p>Bonne chance pour votre déménagement 🍀</p>
          
          <p>L'équipe Dodomove</p>
        </div>
        
        <!-- Pied de page -->
        <div style="text-align: center; padding: 15px; background-color: #f8f9fa; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p>© 2024 Dodomove - Estimateur de volume de déménagement</p>
        </div>
      </div>
      `,
    });
    
    if (error) {
      console.error('Erreur Resend:', error);
      return res.status(500).json({ 
        success: false, 
        error: `Erreur lors de l'envoi de l'email: ${error.message}` 
      });
    }
    
    console.log('Email envoyé avec succès, ID:', data.id);
    
    // Enregistrer les données dans Airtable
    try {
      console.log('Enregistrement des données dans Airtable...');
      console.log('AIRTABLE_API_KEY défini:', !!process.env.AIRTABLE_API_KEY);
      console.log('AIRTABLE_BASE_ID défini:', !!process.env.AIRTABLE_BASE_ID);
      
      // Utiliser l'ID direct de la table pour une meilleure robustesse
      // appyuDiWXUzpy9DTT est l'ID de la base, tblEBCktaZB4BSKAJ est l'ID de la table
      try {
        // Créer les données dans Airtable avec l'ID direct de la table
        await base('tblEBCktaZB4BSKAJ').create([
          {
            fields: {
              // Identifier les noms de champs exacts dans Airtable
              'Email': email,
              'Items': JSON.stringify(items),
              'TotalVolume': totalVolume,
              'MovingTimeline': movingTimelineText || ''
            }
          }
        ]);
        console.log('Données enregistrées dans Airtable avec succès (via ID de table)');
      } catch (error) {
        console.error('Erreur avec l\'ID de table:', error);
        console.error('Détails de l\'erreur:', error.message);
        
        // Si cela échoue, essayer avec le nom de la table
        try {
          await base('LeadMagnet - VolumeCalculator').create([
            {
              fields: {
                'Email': email,
                'Items': JSON.stringify(items),
                'TotalVolume': totalVolume,
                'MovingTimeline': movingTimelineText || ''
              }
            }
          ]);
          console.log('Données enregistrées dans Airtable (via nom de table) avec succès');
        } catch (tableNameError) {
          console.error('Erreur avec le nom de table:', tableNameError);
          
          // Dernière tentative avec l'ancienne configuration
          try {
            await base('Estimations').create([
              {
                fields: {
                  'Email': email,
                  'Nom': name || '',
                  'Volume Total': totalVolume,
                  'Date': new Date().toISOString(),
                  'Période Déménagement': movingTimelineText || '',
                  'Détails': JSON.stringify(items)
                }
              }
            ]);
            console.log('Données enregistrées dans Airtable (via table Estimations) avec succès');
          } catch (fallbackError) {
            throw new Error(`Échecs multiples: ID direct (${error.message}), nom de table (${tableNameError.message}), et fallback (${fallbackError.message})`);
          }
        }
      }
    } catch (airtableError) {
      // Ne pas échouer si Airtable échoue
      console.error('Erreur Airtable complète (non bloquante):', airtableError);
      // Log plus détaillé pour comprendre la structure de l'erreur
      if (airtableError.error) {
        console.error('Détails de l\'erreur Airtable:', JSON.stringify(airtableError.error));
      }
    }
    
    // Répondre avec succès
    res.status(200).json({ 
      success: true,
      message: `Estimation envoyée avec succès à ${email}`,
      emailId: data.id
    });
    
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de l\'envoi de l\'email',
      details: error.message
    });
  }
});

// Route pour traiter les leads du funnel de devis
app.post('/submit-funnel', async (req, res) => {
  console.log('POST /submit-funnel appelé');
  console.log('Body reçu:', JSON.stringify(req.body).substring(0, 500) + '...'); // Affichage partiel pour éviter les logs trop longs
  
  try {
    // Vérification explicite des variables d'environnement Airtable
    console.log('Vérification des variables d\'environnement Airtable:');
    console.log('- AIRTABLE_API_KEY défini:', !!process.env.AIRTABLE_API_KEY);
    console.log('- AIRTABLE_BASE_ID défini:', !!process.env.AIRTABLE_BASE_ID);
    console.log('- AIRTABLE_API_KEY (premiers caractères):', process.env.AIRTABLE_API_KEY ? process.env.AIRTABLE_API_KEY.substring(0, 5) + '...' : 'non défini');
    console.log('- AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID);
    
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      console.error('ERROR: Variables d\'environnement Airtable manquantes');
      // On continue le traitement mais on log l'erreur
    }
    
    // Déstructuration initiale avec variables modifiables (let au lieu de const)
    let { 
      contactInfo, 
      departureAddress, 
      arrivalAddress, 
      movingDate, 
      pickupMethod, 
      deliveryMethod, 
      pickupHousingInfo, 
      deliveryHousingInfo, 
      shippingReason, 
      taxExemptionEligibility, 
      shippingItems, 
      personalBelongingsDetails, 
      vehicleDetails,
      // Nouveaux formats de données (format Airtable)
      addressFormat,
      dateFormat,
      vehiclesFormat,
      // Nouvelles données du funnel
      belongingsPhotos
    } = req.body;
    
    console.log('Vérification des nouveaux champs du funnel:');
    console.log('- personnalBelongingsDetails:', !!personalBelongingsDetails);
    if (personalBelongingsDetails) {
      console.log('  - knowsVolume:', personalBelongingsDetails.knowsVolume);
      console.log('  - housingSize:', personalBelongingsDetails.housingSize);
      console.log('  - movingScope:', personalBelongingsDetails.movingScope);
      console.log('  - estimatedVolume:', personalBelongingsDetails.estimatedVolume);
      console.log('  - description:', !!personalBelongingsDetails.description);
      // Nouveaux champs pour le calculateur de volume
      console.log('  - usedCalculator:', personalBelongingsDetails.usedCalculator);
      console.log('  - calculatedVolumeFromCalculator:', personalBelongingsDetails.calculatedVolumeFromCalculator);
    }
    console.log('- belongingsPhotos:', !!belongingsPhotos);
    if (belongingsPhotos) {
      console.log('  - hasPhotos:', belongingsPhotos.hasPhotos);
      console.log('  - photoUrls:', Array.isArray(belongingsPhotos.photoUrls) ? 
        `Array de ${belongingsPhotos.photoUrls.length} photos` : 'Non disponible');
    }
    
    // Support pour le nouveau format de données
    if (addressFormat) {
      console.log('Utilisation du format d\'adresse préformaté');
      if (addressFormat.departure) departureAddress = addressFormat.departure;
      if (addressFormat.arrival) arrivalAddress = addressFormat.arrival;
    }
    
    if (dateFormat) {
      console.log('Utilisation du format de date préformaté');
      console.log('dateFormat reçu:', JSON.stringify(dateFormat));
      movingDate = dateFormat;
      console.log('movingDate après affectation:', JSON.stringify(movingDate));
    }
    
    if (vehiclesFormat && vehiclesFormat.length > 0) {
      console.log('Utilisation du format de véhicules préformaté');
      vehicleDetails = vehiclesFormat;
    }
    
    // Vérification des données requises
    if (!contactInfo) {
      console.error('Données de contact complètement manquantes');
      return res.status(400).json({ 
        success: false, 
        error: 'Données de contact manquantes',
        received: { 
          body: req.body
        }
      });
    }
    
    console.log('Structure de contactInfo:', JSON.stringify(contactInfo));
    
    // Reconstruire l'objet contactInfo pour s'assurer de sa structure
    const normalizedContactInfo = {
      firstName: contactInfo.firstName || '',
      lastName: contactInfo.lastName || '',
      email: contactInfo.email || '',
      phone: contactInfo.phone || '',
      comment: contactInfo.comment || ''
    };
    
    console.log('ContactInfo normalisé:', JSON.stringify(normalizedContactInfo));
    
    // Vérification des champs requis avec plus de tolérance
    if (!normalizedContactInfo.email) {
      console.error('Email manquant dans les données de contact');
      return res.status(400).json({ 
        success: false, 
        error: 'Email manquant',
        received: normalizedContactInfo
      });
    }
    
    // Remplacer l'original par la version normalisée
    contactInfo = normalizedContactInfo;

    // Générer une référence unique pour la demande
    const generateReference = () => {
      const prefix = 'DM';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `${prefix}-${timestamp}-${random}`;
    };
    
    const reference = generateReference();

    // Vérification explicite de la connexion Airtable AVANT d'envoyer les données
    console.log('Test préliminaire de connexion à Airtable...');
    try {
      // Utiliser l'ID direct de la table pour les demandes du funnel
      const demandesTableId = 'tblic0CaPaaKZwouK'; // ID spécifique pour les demandes du funnel
      console.log('Tentative d\'enregistrement SIMPLIFIÉ dans Airtable avec l\'ID de table:', demandesTableId);
      
      // Au lieu de créer un enregistrement de test, vérifions simplement la connexion à Airtable
      console.log('Vérification de la connexion à Airtable...');
      
      try {
        // Vérifier la connexion à Airtable en listant un seul enregistrement
        // Cela permet de tester la connexion sans créer d'enregistrement de test
        await base(demandesTableId).select({
          maxRecords: 1,
          view: "Grid view"
        }).firstPage();
        
        console.log('✅ TEST RÉUSSI: Connexion à Airtable vérifiée!');
        
        // Si nous arrivons ici, la connexion à Airtable est établie,
        // nous pouvons préparer l'enregistrement complet
        
        // Si le test simplifié réussit, nous pouvons poursuivre avec l'enregistrement complet
        console.log('Préparation des champs complets...');
        
        // Compter le nombre de véhicules par type
        const vehicleCounts = {
          total: vehicleDetails?.length || 0,
          car: 0,
          motorcycle: 0,
          scooter: 0,
          quad: 0,
          boat: 0,
          other: 0
        };
        
        // Calculer les compteurs par type de véhicule
        if (vehicleDetails && vehicleDetails.length > 0) {
          vehicleDetails.forEach(vehicle => {
            const type = vehicle.type || 'other';
            switch (type) {
              case 'car':
                vehicleCounts.car++;
                break;
              case 'motorcycle':
                vehicleCounts.motorcycle++;
                break;
              case 'scooter':
                vehicleCounts.scooter++;
                break;
              case 'quad':
                vehicleCounts.quad++;
                break;
              case 'boat':
                vehicleCounts.boat++;
                break;
              default:
                vehicleCounts.other++;
            }
          });
        }
        
        // Afficher clairement ce qui sera envoyé à Airtable
        console.log('LISTE COMPLÈTE DES CHAMPS À ENVOYER:');
        const formatAddress = (address) => {
          if (!address) return '';
          if (address.unknownExactAddress) {
            return `${address.city || ''}, ${address.postalCode || ''}, ${address.country || ''}`;
          }
          
          let result = '';
          if (address.number) result += address.number + ' ';
          if (address.street) result += address.street + ', ';
          if (address.postalCode) result += address.postalCode + ' ';
          if (address.city) result += address.city + ', ';
          if (address.country) result += address.country;
          
          return result.trim();
        };
          
        // Fonction auxiliaire pour formater les dates pour Airtable
        const formatDateForAirtable = () => {
          if (!movingDate) return { date_type: 'Non spécifiée' };
          
          console.log('formatDateForAirtable - movingDate:', JSON.stringify(movingDate));
          console.log('Propriétés disponibles dans movingDate:', Object.keys(movingDate));
          
          if (movingDate.isFlexible) {
            console.log('Date flexible - startDate:', movingDate.startDate);
            console.log('Date flexible - endDate:', movingDate.endDate);
            return {
              date_type: 'Flexible',
              exact_date: null,
              start_date: movingDate.startDate,
              end_date: movingDate.endDate
            };
          } else {
            console.log('Date exacte - exactDate:', movingDate.exactDate);
            return {
              date_type: 'Exacte',
              exact_date: movingDate.exactDate,
              start_date: null,
              end_date: null
            };
          }
        };
        
        // Préparer les champs à envoyer avec une validation supplémentaire
        const fields = {
          // Métadonnées
          // "created_at": new Date().toISOString(), // Supprimé car c'est un champ calculé par Airtable
          "status": "New",
          "reference": reference, // Stockage de la référence dans Airtable
          
          // Informations de contact (déjà validées)
          "contact_first_name": contactInfo.firstName,
          "contact_last_name": contactInfo.lastName,
          "contact_email": contactInfo.email,
          "contact_phone": contactInfo.phone || '',
          "attached_note": contactInfo.comment || '',
          
          // Adresses avec validation de nullité
          "departure_country": departureAddress?.country || '',
          "departure_postal_code": departureAddress?.postalCode || '',
          "departure_city": departureAddress?.city || '',
          "departure_street": departureAddress?.street || '',
          "departure_number": departureAddress?.number || '',
          "departure_additional_info": '',
          
          "arrival_country": arrivalAddress?.country || '',
          "arrival_unknown_exact_address": arrivalAddress?.unknownExactAddress ? true : false,
          "arrival_city": arrivalAddress?.city || '',
          "arrival_postal_code": arrivalAddress?.postalCode || '',
          "arrival_street": arrivalAddress?.street || '',
          "arrival_number": arrivalAddress?.number || '',
          "arrival_additional_info": '',
          
          // Dates avec validation
          "moving_is_flexible": movingDate?.isFlexible || false,
          "moving_exact_date": movingDate?.exactDate || null,
          "moving_start_date": movingDate?.startDate || null,
          "moving_end_date": movingDate?.endDate || null,
          
          // Méthodes et logements (validation pour les champs de sélection)
          "pickup_method": (pickupMethod === 'home' || pickupMethod === 'port') ? pickupMethod : 'home',
          
          // Validation pour les champs de type et conversion en options valides
          "pickup_housing_type": (() => {
            // Vérifier si c'est une option valide et la normaliser
            const validTypes = ['house', 'apartment', 'office', 'other'];
            const type = pickupHousingInfo?.type || '';
            return validTypes.includes(type) ? type : null; // Renvoyer null si invalide
          })(),
          
          "pickup_housing_floor": pickupHousingInfo?.floor || 0,
          "pickup_housing_has_elevator": pickupHousingInfo?.hasElevator || false,
          
          "delivery_method": (deliveryMethod === 'home' || deliveryMethod === 'port') ? deliveryMethod : 'home',
          
          // Validation pour les champs de type et conversion en options valides
          "delivery_housing_type": (() => {
            // Vérifier si c'est une option valide et la normaliser
            const validTypes = ['house', 'apartment', 'office', 'other'];
            const type = deliveryHousingInfo?.type || '';
            return validTypes.includes(type) ? type : null; // Renvoyer null si invalide
          })(),
          
          "delivery_housing_floor": deliveryHousingInfo?.floor || 0,
          "delivery_housing_has_elevator": deliveryHousingInfo?.hasElevator || false,
          
          // Motif et exonération avec validation pour les champs de sélection
          "shipping_reason": (shippingReason === 'moving' || shippingReason === 'purchase') ? shippingReason : null,
          "tax_exemption_eligible": taxExemptionEligibility === 'yes' ? true : false,
          
          // Objets à expédier avec validation
          "has_personal_belongings": shippingItems?.personalBelongings || false,
          "has_vehicles": shippingItems?.vehicles || false,
          
          // NOUVEAUX CHAMPS pour les étapes intermédiaires du funnel (Volume et Item Details)
          // Volume Knowledge
          "knowsVolume": personalBelongingsDetails?.knowsVolume || false,
          
          // Volume Estimation
          "housingSize": (() => {
            // Convertir les valeurs de l'application en options valides Airtable
            // En français: le nombre inclut le salon + chambres
            // En anglais: on compte uniquement les chambres (bedroom)
            const sizeMap = {
              'studio': 'Studio',
              '1piece': 'Studio',  // Cas rare en France
              '2pieces': '1-bedroom', // 1 salon + 1 chambre
              '3pieces': '2-bedroom', // 1 salon + 2 chambres
              '4pieces': '3-bedroom', // 1 salon + 3 chambres
              '5pieces': '4-bedroom', // 1 salon + 4 chambres
              '6pieces': '5+ bedrooms' // 1 salon + 5 chambres ou plus
            };
            const size = personalBelongingsDetails?.housingSize || '';
            // Si la taille est vide, ne pas inclure ce champ du tout
            return size ? (sizeMap[size] || size) : undefined;
          })(),
          "movingScope": (() => {
            // Convertir les valeurs de l'application en options valides Airtable
            const scopeMap = {
              'full': 'full',
              'partial': 'partial',
              'boxes': 'boxes'
            };
            const scope = personalBelongingsDetails?.movingScope || '';
            // Si le scope est vide, ne pas inclure ce champ du tout
            return scope ? (scopeMap[scope] || scope) : undefined;
          })(),
          "calculatedVolume": !personalBelongingsDetails?.knowsVolume ? 
            (() => {
              const value = personalBelongingsDetails?.estimatedVolume;
              if (value === undefined || value === null || value === '') return 0;
              const numValue = Number(value);
              return isNaN(numValue) ? 0 : numValue;
            })() : 0,
          
          // Item Details
          "itemDetails_description": personalBelongingsDetails?.description || '',
          
          // Nouveaux champs pour le calculateur de volume
          "usedCalculator": personalBelongingsDetails?.usedCalculator || false,
          "calculatedVolumeFromCalculator": (() => {
            const value = personalBelongingsDetails?.calculatedVolumeFromCalculator;
            if (value === undefined || value === null || value === '') return null;
            const numValue = Number(value);
            return isNaN(numValue) ? null : numValue;
          })(),
          
          // Véhicules - compteurs
          "vehicles_count_total": vehicleCounts.total,
          "vehicles_count_cars": vehicleCounts.car,
          "vehicles_count_motorcycles": vehicleCounts.motorcycle,
          "vehicles_count_boats": vehicleCounts.boat,
          "vehicles_count_other": vehicleCounts.other,
          
          // Belongings Photos (après les véhicules comme demandé)
          // Commenté temporairement car les champs liés aux photos ne sont pas configurés dans Airtable
          /*"hasPhotos": req.body.belongingsPhotos?.hasPhotos || false,
          "belongings_photos_urls": Array.isArray(req.body.belongingsPhotos?.photoUrls) ? 
            JSON.stringify(req.body.belongingsPhotos?.photoUrls) : ''*/
        };
        
        // Ajouter userEstimatedVolume UNIQUEMENT si knowsVolume est true
        if (personalBelongingsDetails?.knowsVolume) {
          fields.userEstimatedVolume = (() => {
            const value = personalBelongingsDetails?.estimatedVolume;
            if (value === undefined || value === null || value === '') return 0;
            const numValue = Number(value);
            return isNaN(numValue) ? 0 : numValue;
          })();
        }
        
        // Pour éviter les erreurs de champs non attendus, loggons chaque champ individuellement
        Object.keys(fields).forEach(key => {
          console.log(`Champ: "${key}" = ${fields[key]}`);
        });
        
        // Supprimer les propriétés avec des valeurs undefined
        Object.keys(fields).forEach(key => {
          if (fields[key] === undefined) {
            console.log(`Suppression du champ "${key}" car sa valeur est undefined`);
            delete fields[key];
          }
        });
        
        // Avec le test simplifié réussi, on peut maintenant envoyer les données complètes
        try {
          const completeRecord = await base(demandesTableId).create([
            {
              fields: fields
            }
          ]);
          
          console.log('🎉 SUCCÈS: Données complètes enregistrées dans Airtable!');
          console.log('ID du nouvel enregistrement complet:', completeRecord ? JSON.stringify(completeRecord) : 'Non disponible');
          
          // Si des véhicules sont présents, les enregistrer dans la table véhicules avec son ID spécifique
          if (vehicleDetails && vehicleDetails.length > 0) {
            console.log(`Enregistrement de ${vehicleDetails.length} véhicules dans Airtable...`);
            console.log('Structure vehicleDetails:', JSON.stringify(vehicleDetails));
            
            const typeMap = {
              'car': 'Car',
              'motorcycle': 'Motorcycle',
              'scooter': 'Scooter',
              'quad': 'Quad',
              'boat': 'Boat',
              'other': 'Other'
            };
            
            const vehiclesTableId = 'tblVffkJ0XQx5wB9L'; // ID spécifique pour les véhicules
            
            // Vérifier si nous avons un ID de demande valide pour la relation
            console.log('Structure completeRecord:', JSON.stringify(completeRecord));
            
            // Nous devons avoir un ID valide de l'enregistrement principal et il doit être au format attendu
            let quoteId = null;
            if (completeRecord && completeRecord[0] && completeRecord[0].id) {
              quoteId = [completeRecord[0].id]; // Doit être un tableau avec l'ID
              console.log('quoteId extrait:', JSON.stringify(quoteId));
            } else {
              console.warn("⚠️ Impossible de créer des véhicules sans ID de demande valide pour la relation");
              console.error('Structure completeRecord invalide ou inattendue:', JSON.stringify(completeRecord));
              // Retourner ici pour éviter de traiter les véhicules sans ID valide
              return res.status(200).json({ 
                success: true,
                message: `Demande de devis enregistrée avec succès pour ${contactInfo.email} mais les véhicules n'ont pas pu être enregistrés`,
                reference: reference,
                airtableStatus: 'Entrée principale créée, véhicules non créés (ID manquant)'
              });
            }
            
            // Attendons un peu pour s'assurer que l'enregistrement principal est bien créé dans Airtable
            console.log("Attente de 1 seconde pour s'assurer que l'enregistrement principal est bien créé...");
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Garde une trace des véhicules réussis/échoués
            const vehicleResults = {
              success: 0,
              failed: 0,
              errors: []
            };
            
            // Enregistrer chaque véhicule avec la référence de la demande
            for (const vehicle of vehicleDetails) {
              try {
                // Format des dimensions du véhicule si disponible
                let dimensions = [];
                if (vehicle.size) {
                  console.log(`Dimensions d'origine: "${vehicle.size}" (type: ${typeof vehicle.size})`);
                  // Essayer différents séparateurs possibles (×, x, *) et afficher le résultat
                  if (vehicle.size.includes('×')) {
                    dimensions = vehicle.size.split('×').map(dim => dim.trim());
                  } else if (vehicle.size.includes('x')) {
                    dimensions = vehicle.size.split('x').map(dim => dim.trim());
                  } else if (vehicle.size.includes('*')) {
                    dimensions = vehicle.size.split('*').map(dim => dim.trim());
                  } else {
                    // Si aucun séparateur trouvé, traiter comme une seule dimension
                    dimensions = [vehicle.size.trim()];
                  }
                  console.log('Dimensions après split:', JSON.stringify(dimensions));
                }
                console.log('Dimensions extraites:', dimensions);
                
                // Normaliser le type de véhicule pour s'assurer qu'il est valide
                const vehicleType = (() => {
                  const validTypes = ['car', 'motorcycle', 'scooter', 'quad', 'boat', 'other'];
                  return validTypes.includes(vehicle.type) ? vehicle.type : 'other';
                })();
                
                // Préparer les champs du véhicule à enregistrer
                const vehicleFields = {
                  "status": "New",
                  "quote_id": quoteId,
                  "type": vehicleType,
                  "registration": '', // Champ optionnel non fourni actuellement
                  "brand": vehicle.brand || '',
                  "model": vehicle.model || '',
                  // Traitement spécial pour value - conversion explicite et log détaillé
                  "value": (() => {
                    console.log(`Valeur d'origine: "${vehicle.value}" (type: ${typeof vehicle.value})`);
                    // Nettoyer la valeur si c'est une chaîne (retirer espaces, remplacer virgules par points)
                    let cleanValue = typeof vehicle.value === 'string' 
                      ? vehicle.value.replace(/\s/g, '').replace(',', '.') 
                      : vehicle.value;
                    // Convertir en nombre
                    let numValue = Number(cleanValue);
                    console.log(`Valeur après conversion: ${numValue} (type: ${typeof numValue})`);
                    return isNaN(numValue) ? 0 : numValue;
                  })(),
                  // Pour les champs numériques, utiliser null plutôt qu'une chaîne vide
                  "year": null, // Champ optionnel non fourni actuellement
                  // Traitement des dimensions comme des nombres
                  "length": (() => {
                    const dim = dimensions[0];
                    if (!dim) return null;
                    const cleanDim = typeof dim === 'string' ? dim.replace(/\s/g, '').replace(',', '.') : dim;
                    const numValue = Number(cleanDim);
                    return isNaN(numValue) ? null : numValue;
                  })(),
                  "width": (() => {
                    const dim = dimensions[1];
                    if (!dim) return null;
                    const cleanDim = typeof dim === 'string' ? dim.replace(/\s/g, '').replace(',', '.') : dim;
                    const numValue = Number(cleanDim);
                    return isNaN(numValue) ? null : numValue;
                  })(),
                  "height": (() => {
                    const dim = dimensions[2];
                    if (!dim) return null;
                    const cleanDim = typeof dim === 'string' ? dim.replace(/\s/g, '').replace(',', '.') : dim;
                    const numValue = Number(cleanDim);
                    return isNaN(numValue) ? null : numValue;
                  })(),
                  "weight": null,  // Utiliser null pour ce champ numérique vide
                  "reference": reference  // Ajouter la même référence pour lier avec l'entrée principale
                };
                
                console.log(`Tentative d'enregistrement du véhicule ${vehicle.brand} ${vehicle.model}`);
                console.log('Champs du véhicule:', JSON.stringify(vehicleFields));
                console.log('Quote ID utilisé:', quoteId);
                
                // Créer l'enregistrement du véhicule dans Airtable
                const vehicleRecord = await base(vehiclesTableId).create([
                  {
                    fields: vehicleFields
                  }
                ]);
                
                vehicleResults.success++;
                console.log(`Véhicule ${vehicle.brand} ${vehicle.model} enregistré avec succès`);
                console.log('ID du véhicule:', vehicleRecord ? JSON.stringify(vehicleRecord) : 'Non disponible');
              } catch (vehicleError) {
                vehicleResults.failed++;
                vehicleResults.errors.push(vehicleError.message);
                
                console.error(`Erreur lors de l'enregistrement du véhicule:`, vehicleError.message);
                console.error(`Détails de l'erreur:`, vehicleError);
                
                // Tentative avec uniquement les champs essentiels
                try {
                  console.log('Tentative avec champs minimaux...');
                  console.log('Quote ID utilisé (minimal):', quoteId);
                  
                  const minimalVehicleRecord = await base(vehiclesTableId).create([
                    {
                      fields: {
                        "status": "New",
                        "quote_id": quoteId,
                        "type": vehicle.type || 'other',
                        "brand": vehicle.brand || '',
                        "model": vehicle.model || '',
                        "value": typeof vehicle.value === 'number' ? vehicle.value : 
                                (typeof vehicle.value === 'string' ? Number(vehicle.value.replace(/\s/g, '').replace(',', '.')) : 0),
                        "reference": reference // Ajouter la référence aussi pour la version minimale
                      }
                    }
                  ]);
                  
                  vehicleResults.success++; // Comptabiliser comme réussi car la version minimale a fonctionné
                  vehicleResults.failed--; // Annuler l'échec précédent
                  
                  console.log(`Véhicule ${vehicle.brand} ${vehicle.model} enregistré avec champs minimaux`);
                  console.log('ID du véhicule (minimal):', minimalVehicleRecord ? JSON.stringify(minimalVehicleRecord) : 'Non disponible');
                } catch (minimalVehicleError) {
                  console.error(`Échec de l'enregistrement minimal du véhicule:`, minimalVehicleError.message);
                  console.error('Détails complets de l\'erreur:', JSON.stringify(minimalVehicleError));
                }
              }
            }
            
            console.log('Traitement des véhicules terminé');
            console.log('Résumé des véhicules:', JSON.stringify(vehicleResults));
            
            // Répondre avec le statut final incluant les résultats des véhicules
            return res.status(200).json({ 
              success: true,
              message: `Demande de devis enregistrée avec succès pour ${contactInfo.email}`,
              reference: reference,
              airtableStatus: 'Entrée complète créée',
              vehicleResults: vehicleResults
            });
          } else {
            // Si pas de véhicules, répondre directement
            return res.status(200).json({ 
              success: true,
              message: `Demande de devis enregistrée avec succès pour ${contactInfo.email}`,
              reference: reference,
              airtableStatus: 'Entrée complète créée (pas de véhicules)'
            });
          }
        } catch (fullRecordError) {
          console.error('❌ ERREUR avec les données complètes:', fullRecordError);
          console.error('Message d\'erreur:', fullRecordError.message);
          if (fullRecordError.error) {
            console.error('Détails de l\'erreur:', JSON.stringify(fullRecordError.error));
          }
          
          // Nous avons au moins enregistré les données simplifiées, donc on considère ça comme un succès partiel
          return res.status(200).json({ 
            success: true,
            warning: true,
            message: `Demande de devis partiellement enregistrée pour ${contactInfo.email}`,
            error: fullRecordError.message,
            reference: reference,
            airtableStatus: 'Entrée de base créée, données complètes échouées'
          });
        }
      } catch (testError) {
        console.error('❌ ÉCHEC DU TEST SIMPLIFIÉ:', testError);
        console.error('Type d\'erreur:', testError.name);
        console.error('Message d\'erreur:', testError.message);
        console.error('Stack trace:', testError.stack);
        
        if (testError.error) {
          console.error('Détails spécifiques de l\'erreur Airtable:', JSON.stringify(testError.error, null, 2));
        }
        
        if (testError.statusCode) {
          console.error('Code de statut HTTP:', testError.statusCode);
        }
        
                  // Tentative fallback avec le nom de table au lieu de l'ID pour vérifier la connexion
          try {
            console.log('🔄 TENTATIVE FALLBACK: vérification avec le nom de table...');
            // Au lieu de créer un enregistrement, juste vérifier l'accès
            await base('Quote Funnel').select({
              maxRecords: 1,
              view: "Grid view"
            }).firstPage();
            console.log('FALLBACK RÉUSSI: Connexion vérifiée avec le nom de table');
          } catch (fallbackError) {
            console.error('FALLBACK ÉCHOUÉ:', fallbackError.message);
            console.error('Impossible de se connecter à Airtable, abandon de l\'enregistrement');
            return res.status(500).json({
              success: false,
              error: 'Erreur de connexion à Airtable',
              details: fallbackError.message,
              reference: reference
            });
          }
      }
    } catch (airtableSetupError) {
      console.error('ERREUR DE CONFIGURATION AIRTABLE:', airtableSetupError);
    }
    
    // Répondre avec succès même si Airtable a échoué (pour ne pas bloquer l'utilisateur)
    res.status(200).json({ 
      success: true,
      message: `Demande de devis enregistrée avec succès pour ${contactInfo.email}`,
      reference: reference,
      airtableStatus: 'Voir les logs pour détails sur le statut d\'Airtable'
    });
    
  } catch (error) {
    console.error('Erreur générale lors du traitement de la demande de devis:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors du traitement de la demande de devis',
      details: error.message
    });
  }
});

// Route pour récupérer les détails d'une demande par ID ou référence
app.get('/request/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'ID ou référence manquant' });
    }
    
    // Valider que l'API key et l'ID de base Airtable sont configurés
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      console.error('Configuration Airtable manquante');
      return res.status(500).json({ error: 'Erreur de configuration serveur' });
    }
    
    // Configuration Airtable
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    const quoteFunnelTable = process.env.AIRTABLE_TABLE_NAME || 'Quote Funnel';
    const vehiclesTable = process.env.AIRTABLE_VEHICLES_TABLE_NAME || 'Quote Funnel - Vehicles details';
    
    // Recherche par ID ou référence dans Airtable
    const records = await base(quoteFunnelTable).select({
      filterByFormula: `OR({ID} = '${id}', {reference} = '${id}')`,
      maxRecords: 1
    }).firstPage();
    
    if (!records || records.length === 0) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    
    const record = records[0];
    
    // Récupérer les détails des véhicules associés (si nécessaire)
    let vehicles = [];
    if (record.fields['vehicles_count_total'] > 0) {
      const vehicleRecords = await base(vehiclesTable).select({
        filterByFormula: `{quote_id} = '${record.id}'`
      }).firstPage();
      
      vehicles = vehicleRecords.map(vr => ({
        type: vr.fields['type'] || '',
        brand: vr.fields['brand'] || '',
        model: vr.fields['model'] || '',
        dimensions: [
          vr.fields['length'] || 0,
          vr.fields['width'] || 0, 
          vr.fields['height'] || 0
        ].filter(dim => dim > 0).join(' x '), // Reconstituer les dimensions
        value: vr.fields['value'] || 0,
        registration: vr.fields['registration'] || '',
        year: vr.fields['year'] || null
      }));
    }
    
    // Mapper les données d'Airtable vers le format attendu par le frontend
    const requestDetails = {
      id: record.id,
      reference: record.fields['reference'] || id,
      firstName: record.fields['contact_first_name'] || '',
      lastName: record.fields['contact_last_name'] || '',
      email: record.fields['contact_email'] || '',
      phoneNumber: record.fields['contact_phone'] || '',
      submitDate: record.fields['created_at'] || new Date().toISOString(),
      status: mapAirtableStatusToApi(record.fields['status'] || 'New'),
      
      departureAddress: {
        street: record.fields['departure_street'] || '',
        city: record.fields['departure_city'] || '',
        zipCode: record.fields['departure_postal_code'] || '',
        country: record.fields['departure_country'] || 'France',
      },
      
      arrivalAddress: {
        street: record.fields['arrival_street'] || '',
        city: record.fields['arrival_city'] || '',
        zipCode: record.fields['arrival_postal_code'] || '',
        country: record.fields['arrival_country'] || '',
        isApproximate: record.fields['arrival_unknown_exact_address'] === true,
      },
      
      movingDate: {
        type: record.fields['moving_is_flexible'] === true ? 'flexible' : 'exact',
        exactDate: record.fields['moving_exact_date'] || null,
        flexibleStartDate: record.fields['moving_start_date'] || null,
        flexibleEndDate: record.fields['moving_end_date'] || null,
      },
      
      pickupMethod: (record.fields['pickup_method'] || '').toLowerCase() === 'home' ? 'domicile' : 'port',
      deliveryMethod: (record.fields['delivery_method'] || '').toLowerCase() === 'home' ? 'domicile' : 'port',
      
      departureHousing: record.fields['pickup_housing_type'] || '',
      departureFloor: record.fields['pickup_housing_floor'] || 0,
      departureElevator: record.fields['pickup_housing_has_elevator'] === true,
      
      arrivalHousing: record.fields['delivery_housing_type'] || '',
      arrivalFloor: record.fields['delivery_housing_floor'] || 0,
      arrivalElevator: record.fields['delivery_housing_has_elevator'] === true,
      
      purpose: record.fields['shipping_reason'] || '',
      taxExemption: record.fields['tax_exemption_eligible'] === true ? 'Oui' : 'Non',
      
      hasPersonalEffects: record.fields['has_personal_belongings'] === true,
      estimatedVolume: record.fields['calculatedVolume'] || record.fields['userEstimatedVolume'] || 0,
      personalEffectsDescription: record.fields['itemDetails_description'] || '',
      imageUrl: '', // Ce champ n'existe pas encore dans Airtable
      
      hasVehicles: record.fields['has_vehicles'] === true,
      vehiclesCount: record.fields['vehicles_count_total'] || 0,
      vehicles: vehicles,
      
      comment: record.fields['attached_note'] || '',
    };
    
    res.json(requestDetails);
  } catch (error) {
    console.error('Erreur lors de la récupération des détails de la demande:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Fonction pour mapper les statuts Airtable vers les statuts API
function mapAirtableStatusToApi(airtableStatus) {
  const statusMap = {
    'New': 'verification',
    'Verification': 'verification', 
    'In Progress': 'verification',
    'Verified': 'transmise',
    'Transmitted': 'transmise',
    'Quotes Sent': 'choix',
    'Completed': 'complete'
  };
  
  return statusMap[airtableStatus] || 'verification';
}

// ========================================
// ROUTES DODOPARTAGE - Plateforme de groupage
// ========================================

// Map pour stocker les soumissions en cours (protection contre doublons simultanés)
const submissionInProgress = new Map();

// Route pour soumettre une annonce DodoPartage
app.post('/api/partage/submit-announcement', async (req, res) => {
  console.log('POST /api/partage/submit-announcement appelé');
  console.log('Body reçu:', JSON.stringify(req.body, null, 2));
  
  try {
    const data = req.body;

    // Protection contre les soumissions simultanées IDENTIQUES
    const userEmail = data.contact?.email;
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email requis'
      });
    }

    // Créer une empreinte unique de la soumission pour éviter les doublons IDENTIQUES
    const submissionFingerprint = `${userEmail}-${data.departure.displayName}-${data.arrival.displayName}-${data.shippingDate}-${data.container.type}-${data.container.availableVolume}`;
    
    if (submissionInProgress.has(submissionFingerprint)) {
      console.log('⚠️ Soumission IDENTIQUE déjà en cours:', submissionFingerprint);
      return res.status(429).json({
        success: false,
        error: 'Une soumission identique est déjà en cours',
        message: 'Veuillez patienter...'
      });
    }
    
    // Marquer cette soumission spécifique comme en cours
    submissionInProgress.set(submissionFingerprint, Date.now());
    console.log('🔒 Soumission verrouillée:', submissionFingerprint);

    // Nettoyer automatiquement après 30 secondes
    setTimeout(() => {
      submissionInProgress.delete(submissionFingerprint);
      console.log('🔓 Verrou libéré automatiquement pour:', submissionFingerprint);
    }, 30000);

    // Validation des données requises
    if (!data.contact?.email || !data.contact?.firstName) {
      return res.status(400).json({
        success: false,
        error: 'Email et prénom sont requis'
      });
    }

    if (!data.departure?.country || !data.arrival?.country) {
      return res.status(400).json({
        success: false,
        error: 'Destinations de départ et d\'arrivée sont requises'
      });
    }

    if (!data.container?.type || !data.container?.availableVolume) {
      return res.status(400).json({
        success: false,
        error: 'Informations du conteneur sont requises'
      });
    }

    if (!data.shippingDate) {
      return res.status(400).json({
        success: false,
        error: 'Date d\'expédition est requise'
      });
    }

    if (!data.announcementText || data.announcementText.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Description de l\'annonce doit contenir au moins 10 caractères'
      });
    }

    // Générer une référence unique pour l'annonce
    const generateAnnouncementReference = () => {
      const timestamp = Date.now().toString();
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `PARTAGE-${timestamp.slice(-6)}-${randomSuffix}`;
    };

    const reference = generateAnnouncementReference();
    console.log('Référence générée:', reference);

    // Protection contre les doublons : vérifier si une annonce similaire existe déjà
    try {
      const partageTableName = process.env.AIRTABLE_PARTAGE_TABLE_NAME || 'DodoPartage - Announcement';
      const recentRecords = await base(partageTableName).select({
        filterByFormula: `AND({contact_email} = '${data.contact.email}', DATETIME_DIFF(NOW(), {created_at}, 'minutes') < 2)`,
        maxRecords: 1
      }).firstPage();
      
      if (recentRecords.length > 0) {
        console.log('⚠️ Doublon détecté - annonce récente trouvée pour cet email (moins de 2 minutes)');
        // Libérer le verrou avant de retourner l'erreur
        submissionInProgress.delete(submissionFingerprint);
        console.log('🔓 Verrou libéré après détection de doublon pour:', submissionFingerprint);
        
        return res.status(409).json({
          success: false,
          error: 'duplicate',
          message: 'Une annonce a déjà été créée récemment avec cet email',
          details: 'Veuillez attendre 2 minutes avant de créer une nouvelle annonce'
        });
      }
    } catch (duplicateCheckError) {
      console.log('⚠️ Impossible de vérifier les doublons, on continue:', duplicateCheckError.message);
    }

    // Préparer les données complètes pour Airtable
    const airtableData = {
      fields: {
        // Identifiant et statut
        'reference': reference,
        'created_at': new Date().toISOString(),
        'status': 'pending',
        'validation_token': crypto.randomUUID(),
        'expired_at': new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(), // 7 jours
        
        // Contact
        'contact_first_name': data.contact.firstName,
        'contact_email': data.contact.email,
        'contact_phone': data.contact.phone || '',
        
        // Départ
        'departure_country': data.departure.country,
        'departure_city': data.departure.city,
        'departure_postal_code': data.departure.postalCode || '',
        
        // Arrivée
        'arrival_country': data.arrival.country,
        'arrival_city': data.arrival.city,
        'arrival_postal_code': data.arrival.postalCode || '',
        
        // Date d'expédition
        'shipping_date': data.shippingDate,
        
        // Conteneur
        'container_type': data.container.type,
        'container_available_volume': parseFloat(data.container.availableVolume) || 0,
        'container_minimum_volume': parseFloat(data.container.minimumVolume) || 0,
        
        // Type d'offre
        'offer_type': data.offerType,
        
        // Texte de l'annonce
        'announcement_text': data.announcementText || ''
      }
    };
    
    console.log('🔍 Données envoyées à Airtable:', JSON.stringify(airtableData, null, 2));

    // Enregistrer dans Airtable
    let airtableRecordId = null;
    try {
      console.log('📤 Envoi vers Airtable...');
      
      // Utiliser la table DodoPartage (cohérente avec les autres tables)
      const partageTableName = process.env.AIRTABLE_PARTAGE_TABLE_NAME || 'DodoPartage - Announcement';
      
      const records = await base(partageTableName).create([airtableData]);
      airtableRecordId = records[0].id;
      
      console.log('✅ Annonce enregistrée dans Airtable:', airtableRecordId);
      
    } catch (airtableError) {
      console.error('❌ Erreur Airtable:', airtableError);
      
      // En cas d'erreur Airtable, on continue quand même pour ne pas bloquer l'utilisateur
      console.log('⚠️ Continuons sans Airtable pour ne pas bloquer l\'utilisateur');
    }

    // Envoyer l'email de validation via Resend
    try {
      console.log('📧 Envoi de l\'email de validation...');
      
      // Utiliser le token de validation déjà stocké dans Airtable
      const validationToken = airtableData.fields.validation_token;
      const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://partage.dodomove.fr';
      const validationUrl = `${frontendUrl}/api/validate-announcement?token=${validationToken}`;
      
      console.log('🔑 Token de validation utilisé:', validationToken);
      
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <noreply@dodomove.fr>',
        to: [data.contact.email],
        subject: '🚨 ACTION REQUISE : Confirmez votre annonce DodoPartage',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Confirmez votre annonce DodoPartage</title>
        </head>
        <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
            
            <!-- Header moderne avec les bonnes couleurs -->
            <div style="background: linear-gradient(135deg, #243163 0%, #1e2951 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: white; font-family: 'Inter', sans-serif; font-size: 28px; margin: 0; font-weight: 700;">
                🚢 DodoPartage
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
                Groupage collaboratif DOM-TOM
              </p>
            </div>
            
            <!-- Contenu principal -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">
                Bonjour ${data.contact.firstName} 👋
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
                Votre annonce de groupage <strong>${data.departure.displayName} → ${data.arrival.displayName}</strong> 
                a bien été reçue !
              </p>
              
              <!-- Message d'urgence clair -->
              <div style="background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%); border: 2px solid #F59E0B; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center;">
                <h3 style="color: #92400E; font-size: 18px; margin: 0 0 15px 0; font-weight: 700;">
                  ⚠️ ÉTAPE OBLIGATOIRE
                </h3>
                <p style="color: #78350F; font-size: 16px; margin: 0; font-weight: 600;">
                  Votre annonce <strong>ne sera PAS visible</strong> tant que vous n'aurez pas cliqué sur le bouton ci-dessous
                </p>
              </div>
              
              <!-- Bouton de validation principal plus gros -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="${validationUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #F47D6C 0%, #E11D48 100%); 
                          color: white; padding: 20px 40px; text-decoration: none; border-radius: 12px; 
                          font-weight: 700; font-size: 18px; box-shadow: 0 6px 20px rgba(244, 125, 108, 0.4); 
                          transition: all 0.2s; border: 3px solid #F47D6C;">
                  ✅ JE CONFIRME MON ANNONCE
                </a>
              </div>
              
              <!-- Explications pédagogiques -->
              <div style="background-color: #F0F9FF; border-left: 4px solid #0284C7; padding: 25px; border-radius: 8px; margin: 30px 0;">
                <h4 style="color: #0C4A6E; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">
                  📋 Que se passe-t-il après confirmation ?
                </h4>
                <ul style="color: #075985; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li><strong>Votre annonce devient visible</strong> sur partage.dodomove.fr</li>
                  <li><strong>Les autres utilisateurs peuvent vous contacter</strong> directement</li>
                  <li><strong>Vous recevez les demandes par email</strong> en temps réel</li>
                  <li><strong>Vous organisez votre groupage</strong> avec vos partenaires</li>
                </ul>
              </div>
              
              <!-- Message de sécurité plus visible -->
              <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
                <p style="color: #B91C1C; margin: 0; font-size: 14px; font-weight: 600;">
                  🔒 Cette confirmation sécurise votre annonce et évite le spam
                </p>
              </div>
              
              <!-- Expiration plus visible -->
              <div style="text-align: center; background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 30px 0;">
                <p style="color: #374151; font-size: 14px; margin: 0; font-weight: 600;">
                  ⏰ Ce lien expire dans 7 jours
                </p>
                <p style="color: #6B7280; font-size: 13px; margin: 5px 0 0 0;">
                  Passé ce délai, vous devrez recréer votre annonce
                </p>
              </div>
              
              <!-- Note finale encourageante -->
              <p style="color: #059669; font-size: 15px; text-align: center; margin: 20px 0 0 0; font-weight: 600;">
                💚 Merci de faire confiance à DodoPartage pour votre transport !
              </p>
            </div>
            
            <!-- Footer simple -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="https://dodomove.fr" style="color: #243163; text-decoration: none;">Dodomove</a>
              </p>
              <p style="color: #9CA3AF; font-size: 11px; margin: 5px 0 0 0;">
                Si vous n'êtes pas à l'origine de cette demande, ignorez cet email
              </p>
            </div>
            
          </div>
        </body>
        </html>
        `,
      });

      if (emailError) {
        console.error('❌ Erreur email:', emailError);
      } else {
        console.log('✅ Email de validation envoyé avec succès:', emailData.id);
      }
      
    } catch (emailError) {
      console.error('❌ Erreur lors de l\'envoi de l\'email:', emailError);
      // On continue même si l'email échoue
    }

    // Libérer le verrou avant la réponse
    submissionInProgress.delete(submissionFingerprint);
    console.log('🔓 Verrou libéré après succès pour:', submissionFingerprint);

    // Réponse de succès
    res.status(200).json({
      success: true,
      message: 'Annonce créée avec succès !',
      data: {
        reference: reference,
        recordId: airtableRecordId,
        email: data.contact.email,
        departure: data.departure.displayName,
        arrival: data.arrival.displayName,
        shippingDate: data.shippingDate,
        status: 'En attente de validation'
      },
      nextSteps: [
        'Votre annonce a été enregistrée dans notre base de données',
        'Elle sera visible sur la plateforme après validation',
        'Vous recevrez un email de confirmation sous peu'
      ]
    });

  } catch (error) {
    console.error('❌ Erreur lors de la soumission DodoPartage:', error);
    
    // Libérer le verrou en cas d'erreur aussi
    const userEmail = req.body?.contact?.email;
    if (userEmail && req.body?.departure && req.body?.arrival) {
      const submissionFingerprint = `${userEmail}-${req.body.departure.displayName}-${req.body.arrival.displayName}-${req.body.shippingDate}-${req.body.container.type}-${req.body.container.availableVolume}`;
      submissionInProgress.delete(submissionFingerprint);
      console.log('🔓 Verrou libéré après erreur pour:', submissionFingerprint);
    }
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la soumission de l\'annonce',
      message: 'Une erreur technique s\'est produite. Veuillez réessayer.',
      details: error.message
    });
  }
});

// Route pour tester la connexion DodoPartage
app.get('/api/partage/test', async (req, res) => {
  console.log('GET /api/partage/test appelé');
  
  try {
    // Vérifier les variables d'environnement
    const hasAirtableConfig = !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);
    const hasResendConfig = !!process.env.RESEND_API_KEY;
    
    // Test simple de connexion Airtable si configuré
    let airtableTest = { success: false, message: 'Non configuré' };
    if (hasAirtableConfig) {
             try {
         const partageTableName = process.env.AIRTABLE_PARTAGE_TABLE_NAME || 'DodoPartage - Announcement';
         await base(partageTableName).select({ maxRecords: 1 }).firstPage();
        airtableTest = { success: true, message: 'Connexion réussie' };
      } catch (error) {
        airtableTest = { success: false, message: error.message };
      }
    }

    res.status(200).json({
      success: true,
      message: 'Test DodoPartage',
      config: {
        airtable: {
          configured: hasAirtableConfig,
          test: airtableTest
        },
        resend: {
          configured: hasResendConfig
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur test DodoPartage:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors du test',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Route pour valider une annonce DodoPartage via email
app.get('/api/partage/validate-announcement', async (req, res) => {
  console.log('GET /api/partage/validate-announcement appelé');
  
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token de validation manquant',
        message: 'Le lien de validation est invalide'
      });
    }
    
    console.log('🔍 Validation du token:', token);
    
    // Vérifier les variables d'environnement Airtable
    const hasAirtableConfig = !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);
    if (!hasAirtableConfig) {
      console.error('❌ Configuration Airtable manquante pour la validation');
      return res.status(500).json({
        success: false,
        error: 'Configuration base de données manquante',
        message: 'Erreur de configuration serveur'
      });
    }

    // Nom de la table DodoPartage
    const partageTableName = process.env.AIRTABLE_PARTAGE_TABLE_NAME || 'DodoPartage - Announcement';
    console.log('🔍 Recherche du token dans la table:', partageTableName);

    // Rechercher l'annonce avec ce token de validation
    const records = await base(partageTableName).select({
      filterByFormula: `{validation_token} = '${token}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      console.log('❌ Token non trouvé dans Airtable');
      return res.status(404).json({
        success: false,
        error: 'Token de validation non trouvé',
        message: 'Ce lien de validation est invalide ou a expiré'
      });
    }

    const record = records[0];
    const currentStatus = record.fields.status;
    
    console.log('📋 Annonce trouvée:', {
      id: record.id,
      reference: record.fields.reference,
      currentStatus: currentStatus,
      email: record.fields.contact_email
    });

    // Vérifier si l'annonce n'est pas déjà validée
    if (currentStatus === 'published') {
      console.log('ℹ️ Annonce déjà validée');
      return res.status(200).json({
        success: true,
        message: 'Annonce déjà validée',
        data: {
          reference: record.fields.reference,
          status: 'published',
          validatedAt: record.fields.validated_at || new Date().toISOString()
        }
      });
    }

    // Mettre à jour le statut de l'annonce
    console.log('🔄 Mise à jour du statut vers "published"...');
    
    const updatedRecord = await base(partageTableName).update(record.id, {
      status: 'published',
      validated_at: new Date().toISOString(),
      validation_token: '' // Supprimer le token après utilisation
    });

    console.log('✅ Annonce validée avec succès:', {
      id: updatedRecord.id,
      reference: updatedRecord.fields.reference,
      newStatus: updatedRecord.fields.status
    });
    
    // Réponse de succès pour redirection côté frontend
    res.status(200).json({
      success: true,
      message: 'Annonce validée avec succès',
      data: {
        reference: updatedRecord.fields.reference,
        status: 'published',
        validatedAt: updatedRecord.fields.validated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de la validation:', error);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la validation',
      message: 'Une erreur technique s\'est produite',
      details: error.message
    });
  }
});

// Route pour récupérer les annonces DodoPartage
app.get('/api/partage/get-announcements', async (req, res) => {
  console.log('GET /api/partage/get-announcements appelé');
  
  try {
    // Récupération des paramètres de filtrage
    const { 
      type = 'all',           // offer, request, all
      departure = '',         // filtrer par lieu de départ
      arrival = '',           // filtrer par lieu d'arrivée  
      volumeMin = '',         // volume minimum
      volumeMax = '',         // volume maximum
      status = 'published'    // published, pending_validation, all
    } = req.query;

    console.log('🔍 Paramètres de filtrage reçus:', {
      type, departure, arrival, volumeMin, volumeMax, status
    });

    // Vérifier les variables d'environnement
    const hasAirtableConfig = !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);
    if (!hasAirtableConfig) {
      console.error('❌ Configuration Airtable manquante');
      return res.status(500).json({
        success: false,
        error: 'Configuration base de données manquante',
        data: [],
        total: 0
      });
    }

    // Nom de la table DodoPartage
    const partageTableName = process.env.AIRTABLE_PARTAGE_TABLE_NAME || 'DodoPartage - Announcement';
    console.log('📋 Récupération depuis la table:', partageTableName);

    // Construction des filtres Airtable
    let filterFormula = '';
    const filters = [];

    // Filtre par statut
    if (status !== 'all') {
      filters.push(`{status} = '${status}'`);
    }

    // TODO: Ajouter d'autres filtres selon les besoins
    // if (type !== 'all') {
    //   filters.push(`{offer_type} = '${type}'`);
    // }
    
    if (filters.length > 0) {
      filterFormula = `AND(${filters.join(', ')})`;
    }

    console.log('🔍 Formule de filtre Airtable:', filterFormula || 'Aucun filtre');

    // Récupération des enregistrements depuis Airtable
    const selectOptions = {
      maxRecords: 100, // Limiter à 100 annonces
      sort: [{ field: 'created_at', direction: 'desc' }], // Plus récentes en premier
    };

    if (filterFormula) {
      selectOptions.filterByFormula = filterFormula;
    }

    const records = await base(partageTableName).select(selectOptions).all();
    
    console.log(`📊 ${records.length} enregistrement(s) récupéré(s) depuis Airtable`);

    // Transformation des données Airtable vers le format API
    const announcements = records.map(record => {
      const fields = record.fields;
      
      return {
        id: record.id,
        reference: fields.reference || '',
        status: fields.status || 'pending_validation',
        created_at: fields.created_at || new Date().toISOString(),
        contact_first_name: fields.contact_first_name || '',
        contact_email: fields.contact_email || '',
        contact_phone: fields.contact_phone || '',
        departure_country: fields.departure_country || '',
        departure_city: fields.departure_city || '',
        departure_postal_code: fields.departure_postal_code || '',
        arrival_country: fields.arrival_country || '',
        arrival_city: fields.arrival_city || '',
        arrival_postal_code: fields.arrival_postal_code || '',
        shipping_date: fields.shipping_date || '',
        shipping_date_formatted: fields.shipping_date_formatted || '',
        container_type: fields.container_type || '20',
        container_available_volume: fields.container_available_volume || 0,
        container_minimum_volume: fields.container_minimum_volume || 0,
        offer_type: fields.offer_type || 'free',
        announcement_text: fields.announcement_text || '',
        announcement_text_length: fields.announcement_text_length || 0
      };
    });

    // Fonction pour normaliser les textes (supprime accents et caractères spéciaux)
    const normalizeText = (text) => {
      if (!text) return '';
      return text
        .toLowerCase()
        .normalize('NFD') // Décompose les caractères accentués
        .replace(/[\u0300-\u036f]/g, '') // Supprime les marques diacritiques (accents)
        .replace(/[^a-z0-9\s]/g, '') // Supprime les caractères spéciaux
        .trim();
    };

    // Filtrage côté serveur si nécessaire (pour les filtres non supportés par Airtable)
    let filteredAnnouncements = announcements;

    // Filtre par départ (avec normalisation pour gérer les accents)
    if (departure) {
      const normalizedDeparture = normalizeText(departure);
      filteredAnnouncements = filteredAnnouncements.filter(ann => {
        const normalizedCountry = normalizeText(ann.departure_country);
        const normalizedCity = normalizeText(ann.departure_city);
        return normalizedCountry.includes(normalizedDeparture) || 
               normalizedCity.includes(normalizedDeparture);
      });
    }

    // Filtre par arrivée (avec normalisation pour gérer les accents)
    if (arrival) {
      const normalizedArrival = normalizeText(arrival);
      filteredAnnouncements = filteredAnnouncements.filter(ann => {
        const normalizedCountry = normalizeText(ann.arrival_country);
        const normalizedCity = normalizeText(ann.arrival_city);
        return normalizedCountry.includes(normalizedArrival) || 
               normalizedCity.includes(normalizedArrival);
      });
    }

    // Filtre par volume
    if (volumeMin) {
      const minVol = parseFloat(volumeMin);
      filteredAnnouncements = filteredAnnouncements.filter(ann => 
        ann.container_available_volume >= minVol
      );
    }

    if (volumeMax) {
      const maxVol = parseFloat(volumeMax);
      filteredAnnouncements = filteredAnnouncements.filter(ann => 
        ann.container_available_volume <= maxVol
      );
    }

    // Statistiques pour le debug
    const stats = {
      total: filteredAnnouncements.length,
      byType: {
        offers: filteredAnnouncements.filter(a => a.offer_type === 'free' || a.offer_type === 'paid').length,
        requests: 0 // Pour l'instant, toutes les annonces sont des offres
      },
      byStatus: {
        published: filteredAnnouncements.filter(a => a.status === 'published').length,
        pending: filteredAnnouncements.filter(a => a.status === 'pending_validation').length
      }
    };

    console.log('📊 Statistiques des annonces:', stats);

    // Réponse de succès
    res.status(200).json({
      success: true,
      data: filteredAnnouncements,
      message: `${filteredAnnouncements.length} annonce${filteredAnnouncements.length > 1 ? 's' : ''} trouvée${filteredAnnouncements.length > 1 ? 's' : ''}`,
      total: filteredAnnouncements.length,
      stats,
      filters: {
        applied: { type, departure, arrival, volumeMin, volumeMax, status },
        resultsFiltered: filteredAnnouncements.length < records.length
      },
      backend: {
        source: 'airtable',
        table: partageTableName,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des annonces:', error);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des annonces',
      message: 'Une erreur technique s\'est produite',
      details: error.message,
      data: [], // Retourner un tableau vide en cas d'erreur
      total: 0,
      backend: {
        source: 'airtable',
        timestamp: new Date().toISOString(),
        error: true
      }
    });
  }
});

// Route pour envoyer un message de contact pour une annonce DodoPartage
app.post('/api/partage/contact-announcement', async (req, res) => {
  console.log('POST /api/partage/contact-announcement appelé');
  
  try {
    const {
      announcementId,
      contactName,
      contactEmail,
      message,
      announcementDetails,
      timestamp,
      source
    } = req.body;

    console.log('📬 Nouvelle demande de contact:', {
      announcementId,
      contactName,
      contactEmail,
      messageLength: message?.length,
      source
    });

    // Validation des données obligatoires
    if (!announcementId || !contactName || !contactEmail || !message) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes',
        message: 'Tous les champs sont obligatoires'
      });
    }

    // Vérifier les variables d'environnement
    const hasAirtableConfig = !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);
    const hasResendConfig = !!process.env.RESEND_API_KEY;
    
    if (!hasAirtableConfig) {
      console.error('❌ Configuration Airtable manquante pour le contact');
      return res.status(500).json({
        success: false,
        error: 'Configuration base de données manquante'
      });
    }

    if (!hasResendConfig) {
      console.error('❌ Configuration Resend manquante pour l\'email');
      return res.status(500).json({
        success: false,
        error: 'Configuration email manquante'
      });
    }

    // Récupérer les détails de l'annonce depuis Airtable
    const partageTableName = process.env.AIRTABLE_PARTAGE_TABLE_NAME || 'DodoPartage - Announcement';
    console.log('🔍 Recherche de l\'annonce dans:', partageTableName);

    let announcementRecord = null;
    try {
      announcementRecord = await base(partageTableName).find(announcementId);
      console.log('📋 Annonce trouvée:', {
        id: announcementRecord.id,
        reference: announcementRecord.fields.reference,
        author: announcementRecord.fields.contact_first_name,
        authorEmail: announcementRecord.fields.contact_email
      });
    } catch (airtableError) {
      console.error('❌ Annonce non trouvée:', airtableError);
      return res.status(404).json({
        success: false,
        error: 'Annonce non trouvée',
        message: 'L\'annonce demandée n\'existe pas ou n\'est plus disponible'
      });
    }

    const authorEmail = announcementRecord.fields.contact_email;
    const authorName = announcementRecord.fields.contact_first_name;
    const reference = announcementRecord.fields.reference;

    // Enregistrer le contact dans Airtable (table des contacts)
    let contactRecordId = null;
    try {
      console.log('💾 Enregistrement du contact dans Airtable...');
      
      // Utiliser une table séparée pour les contacts (optionnel)
      const contactsTableName = process.env.AIRTABLE_CONTACTS_TABLE_NAME || 'DodoPartage - Contacts';
      
      const contactData = {
        fields: {
          'announcement_id': announcementId,
          'announcement_reference': reference,
          'contact_name': contactName,
          'contact_email': contactEmail,
          'message': message,
          'contacted_at': new Date().toISOString(),
          'ip_address': req.ip || 'unknown'
        }
      };

      const contactRecords = await base(contactsTableName).create([contactData]);
      contactRecordId = contactRecords[0].id;
      
      console.log('✅ Contact enregistré:', contactRecordId);
      
    } catch (airtableError) {
      console.error('❌ Erreur enregistrement contact:', airtableError);
      // On continue même si l'enregistrement échoue
    }

    // Envoyer l'email à l'auteur de l'annonce
    try {
      console.log('📧 Envoi de l\'email de contact...');
      
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <noreply@dodomove.fr>',
        to: [authorEmail],
        cc: [contactEmail], // Copie à l'expéditeur
        subject: `📬 Nouveau contact pour votre annonce ${reference}`,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Nouveau contact - DodoPartage</title>
        </head>
        <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #243163 0%, #1e2951 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: white; font-family: 'Inter', sans-serif; font-size: 28px; margin: 0; font-weight: 700;">
                📬 DodoPartage
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
                Nouveau contact pour votre annonce
              </p>
            </div>
            
            <!-- Contenu principal -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">
                Bonjour ${authorName} 👋
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 30px 0;">
                <strong>${contactName}</strong> souhaite vous contacter au sujet de votre annonce 
                <strong>${reference}</strong> :
              </p>
              
              <!-- Message -->
              <div style="background-color: #f1f5f9; border-left: 4px solid #243163; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <p style="color: #334155; margin: 0; font-size: 14px; white-space: pre-wrap;">${message}</p>
              </div>
              
              <!-- Informations de contact -->
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <h3 style="color: #1e293b; font-size: 16px; margin: 0 0 10px 0;">Coordonnées :</h3>
                <p style="color: #475569; margin: 0; font-size: 14px;">
                  <strong>Nom :</strong> ${contactName}<br>
                  <strong>Email :</strong> <a href="mailto:${contactEmail}" style="color: #243163;">${contactEmail}</a>
                </p>
              </div>
              
              <!-- Bouton de réponse -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="mailto:${contactEmail}?subject=Re: ${reference} - DodoPartage&body=Bonjour ${contactName},%0A%0AMerci pour votre message concernant mon annonce ${reference}.%0A%0A" 
                   style="display: inline-block; background-color: #F47D6C; color: white; padding: 18px 36px; 
                          text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; 
                          box-shadow: 0 4px 12px rgba(244, 125, 108, 0.3);">
                  📧 Répondre à ${contactName}
                </a>
              </div>
              
              <p style="color: #64748b; font-size: 14px; text-align: center; margin: 30px 0 0 0;">
                Vous recevez cet email car quelqu'un souhaite vous contacter via DodoPartage
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="https://dodomove.fr" style="color: #243163; text-decoration: none;">Dodomove</a>
              </p>
            </div>
            
          </div>
        </body>
        </html>
        `,
      });

      if (emailError) {
        console.error('❌ Erreur email:', emailError);
        throw new Error('Erreur lors de l\'envoi de l\'email');
      } else {
        console.log('✅ Email de contact envoyé avec succès:', emailData.id);
      }
      
    } catch (emailError) {
      console.error('❌ Erreur lors de l\'envoi de l\'email:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email',
        message: 'Votre message n\'a pas pu être envoyé'
      });
    }

    // Réponse de succès
    res.status(200).json({
      success: true,
      message: 'Votre message a été envoyé avec succès !',
      data: {
        contactId: contactRecordId,
        emailSent: true,
        contactName,
        contactEmail,
        announcementId,
        announcementReference: reference,
        authorName,
        authorEmail,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors du contact:', error);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du contact',
      message: 'Une erreur technique s\'est produite',
      details: error.message
    });
  }
});

// Création du serveur HTTP
const server = http.createServer(app);

// Démarrer le serveur avec plus de logs
server.listen(PORT, host, () => {
  console.log(`Serveur démarré sur ${host}:${PORT}`);
  console.log('Routes disponibles:');
  console.log('- GET / (healthcheck)');
  console.log('- GET /_health');
  console.log('- GET /health');
  console.log('- GET /ping');
  console.log('- GET /env');
  console.log('- GET /test');
  console.log('- GET /api/message');
  console.log('- POST /send-email');
  console.log('- POST /submit-funnel');
  console.log('- POST /api/partage/submit-announcement (DodoPartage)');
  console.log('- GET /api/partage/test (DodoPartage)');
  console.log('- GET /api/partage/get-announcements (DodoPartage)');
  console.log('- GET /api/partage/validate-announcement (DodoPartage)');
  console.log('- POST /api/partage/contact-announcement (DodoPartage)');
});

// Gestion des erreurs
server.on('error', (error) => {
  console.error('Erreur du serveur:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Exception non gérée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse rejetée non gérée:', reason);
}); 
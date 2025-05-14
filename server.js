console.log('=== Dodomove backend: démarrage du serveur ===');
require('dotenv').config();

// Import des modules pour l'envoi d'emails et Airtable
const { Resend } = require('resend');
const Airtable = require('airtable');

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
    const { email, name, items, totalVolume, movingTimelineText } = req.body;
    
    // Vérification des données requises
    if (!email || !items || totalVolume === undefined) {
      console.error('Données manquantes:', { email, items, totalVolume });
      return res.status(400).json({ 
        success: false, 
        error: 'Données manquantes',
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
      from: 'Dodomove <pierre.bost.pro@resend.dev>',
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
      vehiclesFormat
    } = req.body;
    
    // Support pour le nouveau format de données
    if (addressFormat) {
      console.log('Utilisation du format d\'adresse préformaté');
      if (addressFormat.departure) departureAddress = addressFormat.departure;
      if (addressFormat.arrival) arrivalAddress = addressFormat.arrival;
    }
    
    if (dateFormat) {
      console.log('Utilisation du format de date préformaté');
      movingDate = dateFormat;
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
      
      // -------------------------------------------------------
      // SIMPLIFIÉ: Juste les champs essentiels pour le test
      // -------------------------------------------------------
      const simplifiedFields = {
        // "created_at": new Date().toISOString(), // Supprimé car c'est un champ calculé par Airtable
        "status": "New",
        "contact_first_name": contactInfo.firstName,
        "contact_last_name": contactInfo.lastName,
        "contact_email": contactInfo.email
      };
      
      console.log('Champs SIMPLIFIÉS pour Airtable:', JSON.stringify(simplifiedFields));
      
      // Essai d'enregistrement avec gestion d'erreur détaillée
      let testRecord;
      try {
        testRecord = await base(demandesTableId).create([
          {
            fields: simplifiedFields
          }
        ]);
        
        console.log('TEST SIMPLIFIÉ RÉUSSI: Airtable a accepté les données simplifiées!');
        console.log('ID du nouvel enregistrement:', testRecord ? JSON.stringify(testRecord) : 'Non disponible');
        
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
          
        // Formater les dates pour Airtable
        const formatDateForAirtable = () => {
          if (!movingDate) return { date_type: 'Non spécifiée' };
          
          if (movingDate.isFlexible) {
            return {
              date_type: 'Flexible',
              exact_date: null,
              start_date: movingDate.startDate,
              end_date: movingDate.endDate
            };
          } else {
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
          
          // Méthodes et logements
          "pickup_method": pickupMethod || '',
          "pickup_housing_type": pickupHousingInfo?.type || '',
          "pickup_housing_floor": pickupHousingInfo?.floor || 0,
          "pickup_housing_has_elevator": pickupHousingInfo?.hasElevator || false,
          
          "delivery_method": deliveryMethod || '',
          "delivery_housing_type": deliveryHousingInfo?.type || '',
          "delivery_housing_floor": deliveryHousingInfo?.floor || 0,
          "delivery_housing_has_elevator": deliveryHousingInfo?.hasElevator || false,
          
          // Motif et exonération
          "shipping_reason": shippingReason || '',
          "tax_exemption_eligible": taxExemptionEligibility === 'yes' ? true : false,
          
          // Objets à expédier avec validation
          "has_personal_belongings": shippingItems?.personalBelongings || false,
          "has_vehicles": shippingItems?.vehicles || false,
          "personal_belongings_volume": personalBelongingsDetails?.estimatedVolume || '',
          "personal_belongings_details": personalBelongingsDetails?.description || '',
          "belongings_photos": personalBelongingsDetails?.imageUrl || '',
          
          // Véhicules - compteurs
          "vehicles_count_total": vehicleCounts.total,
          "vehicles_count_cars": vehicleCounts.car,
          "vehicles_count_motorcycles": vehicleCounts.motorcycle,
          "vehicles_count_boats": vehicleCounts.boat,
          "vehicles_count_other": vehicleCounts.other
        };
        
        // Pour éviter les erreurs de champs non attendus, loggons chaque champ individuellement
        Object.keys(fields).forEach(key => {
          console.log(`Champ: "${key}" = ${fields[key]}`);
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
            const quoteId = completeRecord && completeRecord[0] && completeRecord[0].id ? [completeRecord[0].id] : null;
            if (!quoteId) {
              console.warn("⚠️ Impossible de créer des véhicules sans ID de demande valide pour la relation");
            } else {
              // Enregistrer chaque véhicule avec la référence de la demande
              for (const vehicle of vehicleDetails) {
                try {
                  // Format des dimensions du véhicule si disponible
                  const dimensions = vehicle.size ? vehicle.size.split('x').map(dim => dim.trim()) : [];
                  
                  await base(vehiclesTableId).create([
                    {
                      fields: {
                        "status": "New",
                        "quote_id": quoteId,
                        "type": vehicle.type || '',
                        "registration": '', // Champ optionnel non fourni actuellement
                        "brand": vehicle.brand || '',
                        "model": vehicle.model || '',
                        "value": parseFloat(vehicle.value) || 0,
                        "year": '', // Champ optionnel non fourni actuellement
                        "length": dimensions[0] || '', // Optionnel - première dimension si disponible
                        "width": dimensions[1] || '',  // Optionnel - deuxième dimension si disponible
                        "height": dimensions[2] || '', // Optionnel - troisième dimension si disponible
                        "weight": ''  // Champ optionnel non fourni actuellement
                      }
                    }
                  ]);
                  console.log(`Véhicule ${vehicle.brand} ${vehicle.model} enregistré avec succès`);
                } catch (vehicleError) {
                  console.error(`Erreur lors de l'enregistrement du véhicule:`, vehicleError.message);
                  console.error(`Détails de l'erreur:`, vehicleError);
                  
                  // Tentative avec uniquement les champs essentiels
                  try {
                    await base(vehiclesTableId).create([
                      {
                        fields: {
                          "status": "New",
                          "quote_id": quoteId,
                          "type": vehicle.type || '',
                          "brand": vehicle.brand || '',
                          "model": vehicle.model || ''
                        }
                      }
                    ]);
                    console.log(`Véhicule ${vehicle.brand} ${vehicle.model} enregistré avec champs minimaux`);
                  } catch (minimalVehicleError) {
                    console.error(`Échec de l'enregistrement minimal du véhicule:`, minimalVehicleError.message);
                  }
                }
              }
            }
            
            console.log('Traitement des véhicules terminé');
          }
        } catch (fullRecordError) {
          console.error('❌ ERREUR avec les données complètes:', fullRecordError);
          console.error('Message d\'erreur:', fullRecordError.message);
          if (fullRecordError.error) {
            console.error('Détails de l\'erreur:', JSON.stringify(fullRecordError.error));
          }
          // Nous avons au moins enregistré les données simplifiées, donc on considère ça comme un succès partiel
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
        
        // Tentative fallback avec le nom de table au lieu de l'ID
        try {
          console.log('🔄 TENTATIVE FALLBACK: utilisation du nom de table...');
          const fallbackRecord = await base('Quote Funnel').create([
            {
              fields: simplifiedFields
            }
          ]);
          console.log('FALLBACK RÉUSSI:', fallbackRecord);
        } catch (fallbackError) {
          console.error('FALLBACK ÉCHOUÉ:', fallbackError.message);
          
          // Dernier fallback avec juste l'ID
          try {
            console.log('🔄 DERNIÈRE TENTATIVE: ajout minimal avec uniquement email...');
            const minimalFields = {
              "contact_email": contactInfo.email
              // "created_at": new Date().toISOString() // Supprimé car c'est un champ calculé par Airtable
            };
            
            const minimalRecord = await base(demandesTableId).create([
              {
                fields: minimalFields
              }
            ]);
            console.log('ENREGISTREMENT MINIMAL RÉUSSI:', minimalRecord);
          } catch (minimalError) {
            console.error('ENREGISTREMENT MINIMAL ÉCHOUÉ:', minimalError.message);
          }
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
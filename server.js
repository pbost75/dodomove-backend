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
  console.log('Body reçu:', req.body);
  
  try {
    const { 
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
      vehicleDetails 
    } = req.body;
    
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
    
    if (!normalizedContactInfo.firstName) {
      console.error('Prénom manquant dans les données de contact');
      return res.status(400).json({ 
        success: false, 
        error: 'Prénom manquant',
        received: normalizedContactInfo
      });
    }
    
    if (!normalizedContactInfo.lastName) {
      console.error('Nom manquant dans les données de contact');
      return res.status(400).json({ 
        success: false, 
        error: 'Nom manquant',
        received: normalizedContactInfo
      });
    }
    
    // Remplacer l'original par la version normalisée
    contactInfo = normalizedContactInfo;

    // Formater les adresses
    const formatAddress = (address) => {
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
    
    // Formater la date de déménagement
    const formatMovingDate = () => {
      if (movingDate.isFlexible) {
        return `Entre le ${new Date(movingDate.startDate).toLocaleDateString('fr-FR')} et le ${new Date(movingDate.endDate).toLocaleDateString('fr-FR')}`;
      } else {
        return `Le ${new Date(movingDate.exactDate).toLocaleDateString('fr-FR')}`;
      }
    };
    
    // Formater le type de logement
    const formatHousingType = (type) => {
      const typeMap = {
        'house': 'Maison',
        'apartment': 'Appartement',
        'office': 'Bureau',
        'other': 'Autre'
      };
      return typeMap[type] || 'Non spécifié';
    };
    
    // Formater la méthode de transport
    const formatMethod = (method) => {
      return method === 'home' ? 'À domicile' : 'Au port';
    };
    
    // Générer une référence unique pour la demande
    const generateReference = () => {
      const prefix = 'DM';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `${prefix}-${timestamp}-${random}`;
    };
    
    const reference = generateReference();
    
    // Générer le HTML pour les véhicules
    const generateVehiclesHTML = (vehicles) => {
      if (!vehicles || vehicles.length === 0) {
        return '';
      }
      
      let html = '<h3 style="margin-top: 25px;">Véhicules</h3>';
      html += '<table style="width:100%; border-collapse: collapse; margin-bottom: 20px;">';
      html += '<tr style="background-color: #f8f9fa;"><th style="padding: 10px; text-align: left; border: 1px solid #dee2e6;">Type</th><th style="padding: 10px; text-align: left; border: 1px solid #dee2e6;">Marque/Modèle</th><th style="padding: 10px; text-align: right; border: 1px solid #dee2e6;">Valeur</th></tr>';
      
      const typeMap = {
        'car': 'Voiture',
        'motorcycle': 'Moto',
        'scooter': 'Scooter',
        'quad': 'Quad',
        'boat': 'Bateau',
        'other': 'Autre'
      };
      
      vehicles.forEach(vehicle => {
        html += `<tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${typeMap[vehicle.type] || 'Autre'}</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${vehicle.brand} ${vehicle.model}</td>
          <td style="padding: 10px; text-align: right; border: 1px solid #dee2e6;">${vehicle.value ? vehicle.value + ' €' : 'Non spécifié'}</td>
        </tr>`;
      });
      
      html += '</table>';
      return html;
    };
    
    // Génération des détails pour les effets personnels
    const generatePersonalBelongingsHTML = (details) => {
      if (!shippingItems.personalBelongings) {
        return '';
      }
      
      let html = '<h3 style="margin-top: 25px;">Effets personnels</h3>';
      html += '<div style="margin-bottom: 20px; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px;">';
      
      if (details.estimatedVolume) {
        html += `<p><strong>Volume estimé:</strong> ${details.estimatedVolume} m³</p>`;
      }
      
      if (details.description) {
        html += `<p><strong>Description:</strong> ${details.description}</p>`;
      }
      
      html += '</div>';
      return html;
    };

    // Envoyer l'email au client via Resend
    console.log('Envoi de l\'email de confirmation au client via Resend...');
    const { data: clientEmailData, error: clientEmailError } = await resend.emails.send({
      from: 'Dodomove <pierre.bost.pro@resend.dev>',
      to: [contactInfo.email],
      subject: 'Confirmation de votre demande de devis de déménagement',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden;">
        <!-- En-tête avec logo et image -->
        <div style="background-color: #4285F4; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Dodomove</h1>
          <div style="background-image: url('https://dodomove.fr/images/header-bg.jpg'); height: 120px; background-position: center; background-size: cover; margin-top: 15px; border-radius: 5px;"></div>
        </div>
        
        <!-- Contenu principal -->
        <div style="padding: 20px; background-color: white;">
          <h2 style="color: #333; font-size: 22px;">Confirmation de votre <span style="color: #4CAF50;">demande de devis</span> 📦</h2>
          
          <p>Bonjour ${contactInfo.firstName},</p>
          
          <p>Nous avons bien reçu votre demande de devis de déménagement. Nos déménageurs partenaires vous contacteront très prochainement avec leurs meilleures offres.</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; font-weight: 500; color: #333;">Référence de votre demande: <span style="color: #4285F4; font-weight: bold;">${reference}</span></p>
          </div>
          
          <h3 style="margin-top: 25px; color: #4285F4;">Détails de votre demande</h3>
          
          <div style="border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden; margin-bottom: 20px;">
            <div style="background-color: #f8f9fa; padding: 10px 15px; border-bottom: 1px solid #e0e0e0;">
              <h4 style="margin: 0; color: #333;">Adresses</h4>
            </div>
            <div style="padding: 15px;">
              <p><strong>Départ:</strong> ${formatAddress(departureAddress)}</p>
              <p><strong>Arrivée:</strong> ${formatAddress(arrivalAddress)}</p>
            </div>
          </div>
          
          <div style="border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden; margin-bottom: 20px;">
            <div style="background-color: #f8f9fa; padding: 10px 15px; border-bottom: 1px solid #e0e0e0;">
              <h4 style="margin: 0; color: #333;">Date de déménagement</h4>
            </div>
            <div style="padding: 15px;">
              <p>${formatMovingDate()}</p>
            </div>
          </div>
          
          <div style="border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden; margin-bottom: 20px;">
            <div style="background-color: #f8f9fa; padding: 10px 15px; border-bottom: 1px solid #e0e0e0;">
              <h4 style="margin: 0; color: #333;">Modalités</h4>
            </div>
            <div style="padding: 15px;">
              <p><strong>Ramassage:</strong> ${formatMethod(pickupMethod)}
                ${pickupMethod === 'home' ? ` (${formatHousingType(pickupHousingInfo.type)}, ${pickupHousingInfo.floor || 0} étage${pickupHousingInfo.hasElevator ? ' avec ascenseur' : ' sans ascenseur'})` : ''}
              </p>
              <p><strong>Livraison:</strong> ${formatMethod(deliveryMethod)}
                ${deliveryMethod === 'home' ? ` (${formatHousingType(deliveryHousingInfo.type)}, ${deliveryHousingInfo.floor || 0} étage${deliveryHousingInfo.hasElevator ? ' avec ascenseur' : ' sans ascenseur'})` : ''}
              </p>
            </div>
          </div>
          
          <div style="border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden; margin-bottom: 20px;">
            <div style="background-color: #f8f9fa; padding: 10px 15px; border-bottom: 1px solid #e0e0e0;">
              <h4 style="margin: 0; color: #333;">Objets à transporter</h4>
            </div>
            <div style="padding: 15px;">
              ${shippingItems.personalBelongings ? generatePersonalBelongingsHTML(personalBelongingsDetails) : ''}
              ${shippingItems.vehicles ? generateVehiclesHTML(vehicleDetails) : ''}
            </div>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <p style="font-weight: 500; color: #333; margin-bottom: 10px;">Vous avez des questions sur votre demande ?</p>
            <a href="mailto:contact@dodomove.fr" style="display: inline-block; background-color: #4285F4; color: white; padding: 12px 20px; text-decoration: none; border-radius: 30px; font-weight: 500; font-size: 16px;">
              Contactez-nous
            </a>
          </div>
          
          <p>Merci de votre confiance,</p>
          <p>L'équipe Dodomove</p>
        </div>
        
        <!-- Pied de page -->
        <div style="text-align: center; padding: 15px; background-color: #f8f9fa; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p>© 2024 Dodomove - Tous droits réservés</p>
        </div>
      </div>
      `,
    });
    
    if (clientEmailError) {
      console.error('Erreur lors de l\'envoi de l\'email de confirmation au client:', clientEmailError);
      // On continue quand même pour sauvegarder les données dans Airtable
    } else {
      console.log('Email de confirmation envoyé au client avec succès, ID:', clientEmailData.id);
    }
    
    // Envoyer l'email de notification à l'admin
    console.log('Envoi de l\'email de notification à l\'admin via Resend...');
    const adminEmail = process.env.ADMIN_EMAIL || 'pierre.bost.pro@gmail.com';
    const { data: adminEmailData, error: adminEmailError } = await resend.emails.send({
      from: 'Dodomove <pierre.bost.pro@resend.dev>',
      to: [adminEmail],
      subject: `Nouvelle demande de devis: ${contactInfo.firstName} ${contactInfo.lastName}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px; overflow: hidden;">
        <div style="padding: 20px; background-color: white;">
          <h2 style="color: #333;">Nouvelle demande de devis</h2>
          
          <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; font-weight: 500; color: #333;">Référence: <span style="color: #4285F4; font-weight: bold;">${reference}</span></p>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3 style="color: #4285F4;">Informations de contact</h3>
            <p><strong>Nom:</strong> ${contactInfo.firstName} ${contactInfo.lastName}</p>
            <p><strong>Email:</strong> ${contactInfo.email}</p>
            <p><strong>Téléphone:</strong> ${contactInfo.phone}</p>
            ${contactInfo.comment ? `<p><strong>Commentaire:</strong> ${contactInfo.comment}</p>` : ''}
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3 style="color: #4285F4;">Adresses</h3>
            <p><strong>Départ:</strong> ${formatAddress(departureAddress)}</p>
            <p><strong>Arrivée:</strong> ${formatAddress(arrivalAddress)}</p>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3 style="color: #4285F4;">Date</h3>
            <p>${formatMovingDate()}</p>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3 style="color: #4285F4;">Modalités</h3>
            <p><strong>Ramassage:</strong> ${formatMethod(pickupMethod)}
              ${pickupMethod === 'home' ? ` (${formatHousingType(pickupHousingInfo.type)}, ${pickupHousingInfo.floor || 0} étage${pickupHousingInfo.hasElevator ? ' avec ascenseur' : ' sans ascenseur'})` : ''}
            </p>
            <p><strong>Livraison:</strong> ${formatMethod(deliveryMethod)}
              ${deliveryMethod === 'home' ? ` (${formatHousingType(deliveryHousingInfo.type)}, ${deliveryHousingInfo.floor || 0} étage${deliveryHousingInfo.hasElevator ? ' avec ascenseur' : ' sans ascenseur'})` : ''}
            </p>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3 style="color: #4285F4;">Objets à transporter</h3>
            ${shippingItems.personalBelongings ? generatePersonalBelongingsHTML(personalBelongingsDetails) : '<p>Aucun effet personnel</p>'}
            ${shippingItems.vehicles ? generateVehiclesHTML(vehicleDetails) : '<p>Aucun véhicule</p>'}
          </div>
        </div>
      </div>
      `,
    });
    
    if (adminEmailError) {
      console.error('Erreur lors de l\'envoi de l\'email de notification à l\'admin:', adminEmailError);
      // On continue quand même pour sauvegarder les données dans Airtable
    } else {
      console.log('Email de notification envoyé à l\'admin avec succès, ID:', adminEmailData.id);
    }
    
    // Enregistrer les données dans Airtable
    try {
      console.log('Enregistrement des données du funnel dans Airtable...');
      
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
      
      // Formater les dates pour Airtable
      const formatDateForAirtable = () => {
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
      
      // Utiliser l'ID direct de la table pour une meilleure robustesse
      try {
        // Utiliser l'ID direct de la table pour les demandes du funnel
        const demandesTableId = 'tblic0CaPaaKZwouK'; // ID spécifique pour les demandes du funnel
        await base(demandesTableId).create([
          {
            fields: {
              // Référence et métadonnées
              "Référence": reference,
              "Date de soumission": new Date().toISOString(),
              "Statut": "Nouveau",
              
              // Informations de contact
              "Prénom": contactInfo.firstName,
              "Nom": contactInfo.lastName,
              "Email": contactInfo.email,
              "Téléphone": contactInfo.phone,
              "Commentaire": contactInfo.comment || '',
              
              // Adresses
              "Adresse de départ": formatAddress(departureAddress),
              "Ville de départ": departureAddress.city,
              "Code postal départ": departureAddress.postalCode,
              "Pays de départ": departureAddress.country,
              
              "Adresse d'arrivée": formatAddress(arrivalAddress),
              "Adresse arrivée approximative": arrivalAddress.unknownExactAddress ? "Oui" : "Non",
              "Ville d'arrivée": arrivalAddress.city,
              "Code postal arrivée": arrivalAddress.postalCode,
              "Pays d'arrivée": arrivalAddress.country,
              
              // Dates
              "Type de date": formatDateForAirtable().date_type,
              "Date exacte": formatDateForAirtable().exact_date,
              "Date début": formatDateForAirtable().start_date,
              "Date fin": formatDateForAirtable().end_date,
              
              // Méthodes et logements
              "Méthode de ramassage": pickupMethod === 'home' ? 'Domicile' : 'Port',
              "Méthode de livraison": deliveryMethod === 'home' ? 'Domicile' : 'Port',
              
              "Type de logement départ": pickupHousingInfo.type,
              "Étage départ": pickupHousingInfo.floor,
              "Ascenseur départ": pickupHousingInfo.hasElevator ? "Oui" : "Non",
              
              "Type de logement arrivée": deliveryHousingInfo.type,
              "Étage arrivée": deliveryHousingInfo.floor,
              "Ascenseur arrivée": deliveryHousingInfo.hasElevator ? "Oui" : "Non",
              
              // Motif et exonération
              "Motif d'envoi": shippingReason === 'moving' ? 'Déménagement' : 'Achat',
              "Éligible exonération fiscale": taxExemptionEligibility === 'yes' ? 'Oui' : 'Non',
              
              // Objets à expédier
              "Effets personnels": shippingItems.personalBelongings ? "Oui" : "Non",
              "Volume estimé": personalBelongingsDetails.estimatedVolume,
              "Description effets personnels": personalBelongingsDetails.description || '',
              "Image URL": personalBelongingsDetails.imageUrl || '',
              
              // Véhicules - compteurs
              "Nombre de véhicules": vehicleCounts.total,
              "Nombre de voitures": vehicleCounts.car,
              "Nombre de motos": vehicleCounts.motorcycle,
              "Nombre de scooters": vehicleCounts.scooter,
              "Nombre de quads": vehicleCounts.quad,
              "Nombre de bateaux": vehicleCounts.boat,
              "Nombre d'autres véhicules": vehicleCounts.other
            }
          }
        ]);
        console.log('Données du funnel enregistrées dans Airtable (table ID tblic0CaPaaKZwouK) avec succès');
        
        // Si des véhicules sont présents, les enregistrer dans la table véhicules avec son ID spécifique
        if (vehicleDetails && vehicleDetails.length > 0) {
          console.log(`Enregistrement de ${vehicleDetails.length} véhicules dans Airtable...`);
          
          const typeMap = {
            'car': 'Voiture',
            'motorcycle': 'Moto',
            'scooter': 'Scooter',
            'quad': 'Quad',
            'boat': 'Bateau',
            'other': 'Autre'
          };
          
          const vehiclesTableId = 'tblVffkJ0XQx5wB9L'; // ID spécifique pour les véhicules
          
          // Enregistrer chaque véhicule avec la référence de la demande
          for (const vehicle of vehicleDetails) {
            await base(vehiclesTableId).create([
              {
                fields: {
                  "Référence demande": reference,
                  "Type de véhicule": typeMap[vehicle.type || 'other'] || 'Autre',
                  "Marque": vehicle.brand || '',
                  "Modèle": vehicle.model || '',
                  "Dimensions": vehicle.size || '',
                  "Valeur": vehicle.value || '',
                  "Puissance (CV)": vehicle.power || ''
                }
              }
            ]);
          }
          
          console.log('Véhicules enregistrés dans Airtable (table ID tblVffkJ0XQx5wB9L) avec succès');
        }
        
      } catch (funnelTableError) {
        console.error('Erreur avec les tables spécifiques au funnel:', funnelTableError);
        
        // Fallback sur les noms de tables en cas d'erreur avec les IDs
        try {
          await base('DemandesFunnel').create([
            {
              fields: {
                "Source": "Funnel",
                "Référence": reference,
                "Prénom": contactInfo.firstName,
                "Nom": contactInfo.lastName,
                "Email": contactInfo.email,
                "Téléphone": contactInfo.phone,
                "Commentaire": contactInfo.comment || '',
                "Adresse Départ": formatAddress(departureAddress),
                "Adresse Arrivée": formatAddress(arrivalAddress),
                "Date Déménagement": formatMovingDate(),
                "Nombre de Véhicules": vehicleCounts.total,
                "Volume Estimé": personalBelongingsDetails.estimatedVolume || '',
                "Date de Soumission": new Date().toISOString()
              }
            }
          ]);
          console.log('Données du funnel enregistrées dans Airtable (fallback sur nom de table) avec succès');
        } catch (nameTableError) {
          // Dernier fallback sur la table générique
          try {
            await base('Demandes').create([
              {
                fields: {
                  "Source": "Funnel",
                  "Référence": reference,
                  "Prénom": contactInfo.firstName,
                  "Nom": contactInfo.lastName,
                  "Email": contactInfo.email,
                  "Téléphone": contactInfo.phone,
                  "Commentaire": contactInfo.comment || '',
                  "Adresse Départ": formatAddress(departureAddress),
                  "Adresse Arrivée": formatAddress(arrivalAddress),
                  "Date Déménagement": formatMovingDate(),
                  "Nombre de Véhicules": vehicleCounts.total,
                  "Volume Estimé": personalBelongingsDetails.estimatedVolume || '',
                  "Date de Soumission": new Date().toISOString()
                }
              }
            ]);
            console.log('Données du funnel enregistrées dans Airtable (table générique) avec succès');
          } catch (genericTableError) {
            throw new Error(`Échecs multiples: ID tables (${funnelTableError.message}), nom de table (${nameTableError.message}), table générique (${genericTableError.message})`);
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
      message: `Demande de devis enregistrée avec succès pour ${contactInfo.email}`,
      reference: reference
    });
    
  } catch (error) {
    console.error('Erreur lors du traitement de la demande de devis:', error);
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
console.log('=== Dodomove backend: démarrage du serveur (WhatsApp URLs corrigées) ===');
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

// ========================================
// FONCTIONS HELPER GLOBALES
// ========================================

// Fonction helper pour générer des UTM cohérents pour les emails DodoPartage
function generateUTMUrl(baseUrl, emailType, content = 'link') {
  const utm = new URLSearchParams({
    utm_source: 'transactionnel',
    utm_medium: 'email',
    utm_campaign: `dodopartage-${emailType}`,
    utm_content: content
  });
  
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${utm.toString()}`;
}

// Fonction helper pour générer un message personnalisé (WhatsApp ou Email)
function generatePersonalizedMessage(requestType, announcementData, contactName) {
  // Extraire les informations de l'annonce
  const authorName = announcementData.contact_first_name || 'Bonjour';
  const arrivalCity = announcementData.arrival_city || '';
  const arrivalCountry = announcementData.arrival_country || '';
  const shippingDate = announcementData.shipping_date || '';
  
  // Construire la destination
  let destination = arrivalCountry;
  if (arrivalCity && arrivalCity !== arrivalCountry) {
    destination = `${arrivalCity} (${arrivalCountry})`;
  }
  
  // Construire la date si disponible (seulement pour les offres)
  let dateInfo = '';
  if (requestType === 'offer' && shippingDate) {
    try {
      const date = new Date(shippingDate);
      dateInfo = ` le ${date.toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      })}`;
    } catch (e) {
      console.warn('❌ Erreur parsing date:', shippingDate);
    }
  }
  
  // Générer le message selon le type d'annonce
  // Note: le message va DE l'auteur de l'annonce VERS la personne qui contacte
  let message = '';
  if (requestType === 'offer') {
    message = `Bonjour ${contactName}, je vous contacte suite à votre message concernant mon annonce de partage de conteneur pour ${destination}${dateInfo}. Cordialement, ${authorName}`;
  } else if (requestType === 'search') {
    message = `Bonjour ${contactName}, je vous contacte suite à votre message au sujet de ma recherche de place dans un conteneur pour ${destination}. Cordialement, ${authorName}`;
  } else {
    message = `Bonjour ${contactName}, je vous contacte suite à votre message concernant mon annonce sur DodoPartage pour ${destination}. Cordialement, ${authorName}`;
  }
  
  return message;
}

// Fonction helper pour générer une URL WhatsApp avec message pré-rempli
function generateWhatsAppUrl(phoneNumber, requestType, announcementData, contactName) {
  if (!phoneNumber) return null;
  
  // Nettoyer le numéro de téléphone (enlever tout sauf les chiffres)
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  // Validation basique du numéro (entre 8 et 15 chiffres)
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    console.warn('❌ Numéro de téléphone invalide:', phoneNumber);
    return null;
  }
  
  // Générer le message personnalisé
  const message = generatePersonalizedMessage(requestType, announcementData, contactName);
  
  // Encoder le message pour URL
  const encodedMessage = encodeURIComponent(message);
  
  // Créer l'URL WhatsApp
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
  
  console.log('📱 URL WhatsApp générée pour:', cleanPhone.substring(0, 4) + '****');
  return whatsappUrl;
}

// Fonction helper pour générer une URL Email avec message pré-rempli
function generateEmailUrl(contactEmail, requestType, announcementData, contactName, reference) {
  if (!contactEmail) return null;
  
  // Générer le message personnalisé (même que WhatsApp)
  const message = generatePersonalizedMessage(requestType, announcementData, contactName);
  
  // Encoder le message pour URL (remplacer les sauts de ligne par %0A)
  const encodedMessage = encodeURIComponent(message.replace(/\n/g, '\n'));
  
  // Créer l'URL Email avec sujet et corps personnalisés
  const emailUrl = `mailto:${contactEmail}?subject=Re: ${reference} - DodoPartage&body=${encodedMessage}`;
  
  console.log('📧 URL Email générée pour:', contactEmail);
  return emailUrl;
}

// ========================================
// FONCTION EMAIL DE RAPPEL VALIDATION
// ========================================

/**
 * Crée et envoie un email de rappel pour une annonce non validée
 * Appelé 24h après la création si l'annonce est toujours en status 'pending'
 */
async function sendValidationReminderEmail(announcementRecord) {
  try {
    const announcement = announcementRecord.fields;
    const validationToken = announcement.validation_token;
    const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
    const validationUrl = `${frontendUrl}/validating/${validationToken}`;
    
    console.log('📧 Envoi email de rappel de validation pour:', announcement.contact_email);
    
    // Déterminer le type d'annonce pour personnaliser le message
    const isSearchRequest = announcement.request_type === 'search';
    const departureLocation = `${announcement.departure_city}, ${announcement.departure_country}`;
    const arrivalLocation = `${announcement.arrival_city}, ${announcement.arrival_country}`;
    
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DodoPartage <hello@dodomove.fr>',
      to: [announcement.contact_email],
      subject: '📬 Votre annonce DodoPartage attend toujours votre validation',
      headers: {
        'X-Entity-Ref-ID': `dodopartage-reminder-${validationToken}`
      },
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rappel de validation - DodoPartage</title>
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
              Bonjour ${announcement.contact_first_name} 👋
            </h2>
            
            <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
              Nous avons bien reçu votre ${isSearchRequest ? 'demande de place' : 'offre de groupage'} pour le trajet <strong>${departureLocation} → ${arrivalLocation}</strong>.
            </p>
            
            <!-- Message de rappel gentle -->
            <div style="border-left: 4px solid #3b82f6; background-color: #eff6ff; padding: 20px; margin: 30px 0;">
              <div style="display: flex; align-items: center;">
                <span style="font-size: 20px; margin-right: 12px;">📬</span>
                <div>
                  <h3 style="color: #1d4ed8; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                    Validation en attente
                  </h3>
                  <p style="color: #1e40af; font-size: 14px; margin: 0; line-height: 1.4;">
                    Votre ${isSearchRequest ? 'demande' : 'annonce'} sera visible dès que vous confirmerez votre email
                  </p>
                </div>
              </div>
            </div>
            
            <!-- Bouton CTA -->
            <div style="text-align: center; margin: 32px 0;">
              <a href="${validationUrl}" 
                 style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); transition: all 0.2s ease;">
                ✅ Confirmer mon email
              </a>
            </div>
            
            <!-- FAQ mini -->
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin: 30px 0;">
              <h3 style="color: #374151; font-size: 16px; margin: 0 0 12px 0; font-weight: 600;">
                Email non reçu ? 🤔
              </h3>
              <ul style="color: #6b7280; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.5;">
                <li>Vérifiez vos <strong>spams/indésirables</strong></li>
                <li>Ajoutez hello@dodomove.fr à vos contacts</li>
                <li>Si problème persiste, contactez-nous</li>
              </ul>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 30px 0 0 0; line-height: 1.5;">
              Nous sommes là pour faciliter vos expéditions entre la France et les DOM-TOM.<br>
              Merci de votre confiance ! 🙏
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              DodoPartage • Groupage collaboratif DOM-TOM
            </p>
          </div>
        </div>
      </body>
      </html>
      `
    });

    if (emailError) {
      console.error('❌ Erreur Resend lors du rappel:', emailError);
      return { success: false, error: emailError };
    }

    console.log('✅ Email de rappel envoyé:', emailData.id);
    return { success: true, emailId: emailData.id };
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du rappel:', error);
    return { success: false, error: error.message };
  }
}

// ========================================
// SYSTÈME D'ALERTES EMAIL AUTOMATIQUES
// ========================================

// Fonction pour trouver les alertes correspondant à une annonce
async function findMatchingAlerts(announcement) {
  try {
    console.log('🔍 Recherche d\'alertes correspondantes pour:', announcement.reference);
    
    const emailAlertTableId = process.env.AIRTABLE_EMAIL_ALERT_TABLE_ID || 'tblVuVneCZTot07sB';
    
    // Récupérer toutes les alertes actives
    const alertRecords = await base(emailAlertTableId).select({
      filterByFormula: `{status} = 'active'`,
      fields: ['type', 'departure', 'arrival', 'volume_min', 'email', 'delete_token']
    }).all();

    console.log(`📋 ${alertRecords.length} alerte(s) active(s) trouvée(s)`);
    
    const matchingAlerts = [];
    
    for (const alertRecord of alertRecords) {
      const alert = alertRecord.fields;
      
      // Vérifier la correspondance
      if (isAlertMatch(alert, announcement)) {
        matchingAlerts.push({
          id: alertRecord.id,
          ...alert
        });
        console.log(`✅ Alerte correspondante: ${alert.email} (${alert.type})`);
      }
    }
    
    console.log(`🎯 ${matchingAlerts.length} alerte(s) correspondante(s) trouvée(s)`);
    return matchingAlerts;
    
  } catch (error) {
    console.error('❌ Erreur lors de la recherche d\'alertes:', error);
    return [];
  }
}

// Fonction pour vérifier si une alerte correspond à une annonce  
function isAlertMatch(alert, announcement) {
  // 1. Vérifier le type (logique identique)
  if (alert.type === 'offer' && announcement.request_type !== 'offer') {
    return false; // Alerte pour offres, mais l'annonce n'est pas une offre
  }
  if (alert.type === 'request' && announcement.request_type !== 'search') {
    return false; // Alerte pour demandes, mais l'annonce n'est pas une recherche
  }
  
  // 2. Vérifier le trajet (normalisation des noms de pays)
  const normalizeLocation = (location) => {
    return location?.toLowerCase()
      .replace(/é/g, 'e')
      .replace(/è/g, 'e') 
      .replace(/ç/g, 'c')
      .replace(/à/g, 'a')
      .trim();
  };
  
  const alertDeparture = normalizeLocation(alert.departure);
  const alertArrival = normalizeLocation(alert.arrival);
  const announcementDeparture = normalizeLocation(announcement.departure_country);
  const announcementArrival = normalizeLocation(announcement.arrival_country);
  
  if (alertDeparture !== announcementDeparture || alertArrival !== announcementArrival) {
    return false;
  }
  
  // 3. Vérifier le volume
  const alertVolumeMin = parseFloat(alert.volume_min) || 0;
  let announcementVolume = 0;
  
  if (announcement.request_type === 'offer') {
    // Pour les offres : volume disponible dans le conteneur
    announcementVolume = parseFloat(announcement.container_available_volume) || 0;
  } else if (announcement.request_type === 'search') {
    // Pour les recherches : volume recherché
    announcementVolume = parseFloat(announcement.volume_needed) || 0;
  }
  
  if (alertVolumeMin > announcementVolume) {
    return false; // Volume de l'annonce insuffisant
  }
  
  return true; // Toutes les conditions sont remplies
}

// Fonction pour envoyer une notification d'alerte par email
async function sendAlertNotification(alert, announcement) {
  try {
    console.log(`📧 Envoi notification alerte à: ${alert.email}`);
    
    // Préparer les données pour l'email
    const announcementType = announcement.request_type === 'offer' ? 'propose' : 'cherche';
    const alertType = alert.type === 'offer' ? 'personnes qui proposent' : 'personnes qui cherchent';
    const trajet = `${announcement.departure_country} → ${announcement.arrival_country}`;
    
    // Volume à afficher
    let volumeText = '';
    if (announcement.request_type === 'offer') {
      volumeText = `${announcement.container_available_volume}m³ disponibles`;
    } else {
      volumeText = `${announcement.volume_needed}m³ recherchés`;
    }
    
    // Date de départ
    let dateText = '';
    if (announcement.shipping_date) {
      const shippingDate = new Date(announcement.shipping_date);
      dateText = shippingDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } else if (announcement.shipping_period_formatted) {
      dateText = announcement.shipping_period_formatted;
    }
    
    // URL vers l'annonce
    const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
    const announcementUrl = `${frontendUrl}/annonce/${announcement.reference}`;
    
    // URL de désabonnement
    const unsubscribeUrl = `${frontendUrl}/supprimer-alerte/${alert.delete_token}`;
    
    // Envoyer l'email avec design cohérent DodoPartage
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DodoPartage <notifications@dodomove.fr>',
      to: [alert.email],
      subject: `Nouvelle annonce trouvée : ${trajet}`,
      headers: {
        'X-Entity-Ref-ID': `dodopartage-alert-${alert.delete_token}`,
        'List-Unsubscribe': `<${frontendUrl}/supprimer-alerte/${alert.delete_token}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nouvelle annonce DodoPartage</title>
      </head>
      <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #243163 0%, #1e2951 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; font-family: 'Inter', sans-serif; font-size: 28px; margin: 0; font-weight: 700;">
              🔔 DodoPartage
            </h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
              Nouvelle annonce trouvée !
            </p>
          </div>
          
          <!-- Contenu principal -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1e293b; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">
              📦 ${announcement.contact_first_name} ${announcementType} de la place
            </h2>
            
            <p style="color: #475569; font-size: 16px; margin: 0 0 30px 0;">
              Une nouvelle annonce correspond à votre alerte <strong>"${alertType}"</strong> !
            </p>
            
            <!-- Détails de l'annonce -->
            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 24px; margin: 30px 0;">
              <h3 style="color: #334155; font-size: 18px; margin: 0 0 16px 0; font-weight: 600;">
                📋 Détails de l'annonce
              </h3>
              <div style="color: #64748b; font-size: 14px; line-height: 1.6;">
                <div style="margin-bottom: 8px;">
                  <strong>🗺️ Trajet:</strong> ${trajet}
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>📦 Volume:</strong> ${volumeText}
                </div>
                ${dateText ? `<div style="margin-bottom: 8px;"><strong>📅 Date:</strong> ${dateText}</div>` : ''}
                <div style="margin-bottom: 8px;">
                  <strong>📞 Contact:</strong> ${announcement.contact_first_name}
                </div>
                <div>
                  <strong>📧 Référence:</strong> ${announcement.reference}
                </div>
              </div>
            </div>
            
            <!-- Description de l'annonce -->
            ${announcement.announcement_text ? `
            <div style="border-left: 4px solid #F47D6C; background-color: #fef2f2; padding: 20px; margin: 30px 0;">
              <h4 style="color: #dc2626; font-size: 16px; margin: 0 0 8px 0; font-weight: 600;">
                💬 Message de ${announcement.contact_first_name}
              </h4>
              <p style="color: #7f1d1d; font-size: 14px; margin: 0; line-height: 1.4;">
                ${announcement.announcement_text.substring(0, 200)}${announcement.announcement_text.length > 200 ? '...' : ''}
              </p>
            </div>
            ` : ''}
            
            <!-- Bouton principal -->
            <div style="text-align: center; margin: 32px 0;">
              <a href="${generateUTMUrl(announcementUrl, 'alert-notification', 'view_announcement')}" 
                 style="display: inline-block; background-color: #F47D6C; color: white; padding: 16px 32px; 
                        text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                🔍 Voir l'annonce complète
              </a>
            </div>
            
            <!-- Information sur l'alerte -->
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 30px 0;">
              <h4 style="color: #374151; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">
                🎯 Votre alerte : "${alertType}"
              </h4>
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                Trajet: ${alert.departure} → ${alert.arrival} | Volume min: ${alert.volume_min}m³
              </p>
            </div>
            
            <!-- Lien de désabonnement -->
            <div style="text-align: center; margin: 24px 0;">
              <p style="color: #6b7280; font-size: 13px; margin: 0;">
                <a href="${generateUTMUrl(unsubscribeUrl, 'alert-notification', 'unsubscribe')}" style="color: #6b7280; text-decoration: underline;">
                  Se désabonner de cette alerte
                </a>
              </p>
            </div>
            
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              © 2024 DodoPartage - Une initiative 
              <a href="${generateUTMUrl('https://dodomove.fr', 'alert-notification', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
            </p>
          </div>
          
        </div>
      </body>
      </html>
      `
    });

    if (emailError) {
      console.error('❌ Erreur envoi email alerte:', emailError);
      return false;
    }

    console.log(`✅ Email alerte envoyé avec succès: ${emailData.id}`);
    return true;
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de notification d\'alerte:', error);
    return false;
  }
}

// Fonction principale pour vérifier et envoyer toutes les notifications d'alertes
async function checkAndSendAlertNotifications(announcement) {
  try {
    console.log('🔔 Vérification des alertes pour l\'annonce:', announcement.reference);
    
    // Trouver les alertes correspondantes
    const matchingAlerts = await findMatchingAlerts(announcement);
    
    if (matchingAlerts.length === 0) {
      console.log('📭 Aucune alerte correspondante trouvée');
      return { success: true, alertsSent: 0, details: 'Aucune alerte correspondante' };
    }
    
    // Envoyer les notifications
    let successCount = 0;
    const results = [];
    
    for (const alert of matchingAlerts) {
      const sent = await sendAlertNotification(alert, announcement);
      if (sent) {
        successCount++;
        results.push({ email: alert.email, status: 'sent' });
      } else {
        results.push({ email: alert.email, status: 'failed' });
      }
      
      // Petite pause entre les envois pour éviter le rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`📊 Résumé notifications: ${successCount}/${matchingAlerts.length} envoyées`);
    
    return {
      success: true,
      alertsSent: successCount,
      totalAlerts: matchingAlerts.length,
      results: results,
      details: `${successCount} notification(s) envoyée(s) sur ${matchingAlerts.length} alerte(s) correspondante(s)`
    };
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des alertes:', error);
    return {
      success: false,
      alertsSent: 0,
      error: error.message,
      details: 'Erreur lors de la vérification des alertes'
    };
  }
}

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
      from: 'DodoPartage <hello@dodomove.fr>',
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
      from: 'Dodomove <hello@dodomove.fr>',
      to: [email],
              subject: 'Estimation de votre volume de déménagement',
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
          "contact_last_name": contactInfo.lastName || '',
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
    const submissionFingerprint = `${userEmail}-${data.departureLocation}-${data.arrivalLocation}-${data.shippingDate}-${data.container.type}-${data.container.availableVolume}`;
    
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
      const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
      const recentRecords = await base(partageTableId).select({
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
        'expires_at': (() => {
          // Pour les offres : expiration le lendemain de shipping_date
          if (data.shippingDate) {
            const shippingDate = new Date(data.shippingDate);
            const dayAfterShipping = new Date(shippingDate);
            dayAfterShipping.setDate(dayAfterShipping.getDate() + 1);
            return dayAfterShipping.toISOString();
          }
          // Fallback si pas de shipping_date : 7 jours
          return new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
        })(),
        
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
        'announcement_text': data.announcementText || '',

        // Type de requête
        'request_type': data.request_type || 'offer'
      }
    };
    
    console.log('🔍 Données envoyées à Airtable:', JSON.stringify(airtableData, null, 2));

    // Enregistrer dans Airtable
    let airtableRecordId = null;
    let airtableSuccess = false;
    try {
      console.log('📤 Envoi vers Airtable...');
      console.log('🔍 Type d\'offre:', data.offerType);
      
      // Utiliser la table DodoPartage (cohérente avec les autres tables)
      const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
      console.log('📋 Table Airtable utilisée:', partageTableId);
      
      const records = await base(partageTableId).create([airtableData]);
      airtableRecordId = records[0].id;
      airtableSuccess = true;
      
      console.log('✅ Annonce enregistrée dans Airtable:', airtableRecordId);
      console.log('✅ Token validation stocké:', airtableData.fields.validation_token);
      
    } catch (airtableError) {
      console.error('❌ Erreur Airtable détaillée:', airtableError);
      console.error('❌ Message d\'erreur:', airtableError.message);
      console.error('❌ Stack trace:', airtableError.stack);
      
      // Afficher plus de détails sur l'erreur
      if (airtableError.error) {
        console.error('❌ Détails erreur Airtable:', JSON.stringify(airtableError.error, null, 2));
      }
      
      // En cas d'erreur Airtable, on continue quand même pour ne pas bloquer l'utilisateur
      console.log('⚠️ Continuons sans Airtable pour ne pas bloquer l\'utilisateur');
      console.log('⚠️ ATTENTION: Le token de validation ne sera pas disponible pour la validation !');
    }

    // Envoyer l'email de validation via Resend (seulement si Airtable a réussi)
    if (airtableSuccess) {
      try {
        console.log('📧 Envoi de l\'email de validation...');
        
        // Utiliser le token de validation déjà stocké dans Airtable
        const validationToken = airtableData.fields.validation_token;
        const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
        const validationUrl = `${frontendUrl}/validating/${validationToken}`;
        
        console.log('🔑 Token de validation utilisé:', validationToken);
      
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [data.contact.email],
        subject: 'Confirmez votre annonce DodoPartage',
        headers: {
          'X-Entity-Ref-ID': `dodopartage-validation-${validationToken}`
        },
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
                Votre annonce de groupage <strong>${data.departureLocation} → ${data.arrivalLocation}</strong> 
                a bien été reçue !
              </p>
              
              <!-- Message d'urgence minimaliste -->
              <div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 20px; margin: 30px 0;">
                <div style="display: flex; align-items: center;">
                  <span style="font-size: 20px; margin-right: 12px;">⚠️</span>
                  <div>
                    <h3 style="color: #92400e; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                      Confirmation requise
                    </h3>
                    <p style="color: #b45309; font-size: 14px; margin: 0; line-height: 1.4;">
                      Votre annonce sera visible après validation de votre email
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Bouton CTA minimaliste -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${validationUrl}" 
                   style="display: inline-block; background-color: #F47D6C; color: white; padding: 14px 28px; 
                          text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">
                  Confirmer mon email
                </a>
              </div>
              
              <!-- Explications simplifiées -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 30px 0;">
                <h4 style="color: #374151; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">
                  Après confirmation :
                </h4>
                
                <div style="space-y: 8px;">
                  <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                    <span style="color: #4b5563; font-size: 14px;">Votre annonce devient visible</span>
                  </div>
                  <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                    <span style="color: #4b5563; font-size: 14px;">Vous recevez les demandes par email</span>
                  </div>
                  <div style="display: flex; align-items: center;">
                    <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                    <span style="color: #4b5563; font-size: 14px;">Vous organisez votre groupage</span>
                  </div>
                </div>
              </div>
              
              <!-- Informations expiration -->
              <div style="text-align: center; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 13px; margin: 0;">
                  ⏰ Lien valide 7 jours
                </p>
              </div>
              

            </div>
            
            <!-- Footer simple -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="${generateUTMUrl('https://dodomove.fr', 'confirmation-offer', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
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
    } else {
      console.log('⚠️ Email de validation NON envoyé car l\'enregistrement Airtable a échoué');
      console.log('⚠️ L\'utilisateur recevra un message d\'erreur car son annonce ne pourra pas être validée');
    }

    // Libérer le verrou avant la réponse
    submissionInProgress.delete(submissionFingerprint);
    console.log('🔓 Verrou libéré après succès pour:', submissionFingerprint);

    // Réponse de succès ou d'erreur selon le statut Airtable
    if (airtableSuccess) {
      res.status(200).json({
        success: true,
        message: 'Annonce créée avec succès !',
        data: {
          reference: reference,
          recordId: airtableRecordId,
          email: data.contact.email,
          departure: data.departureLocation,
          arrival: data.arrivalLocation,
          shippingDate: data.shippingDate,
          status: 'En attente de validation'
        },
        nextSteps: [
          'Votre annonce a été enregistrée dans notre base de données',
          'Elle sera visible sur la plateforme après validation',
          'Vous recevrez un email de confirmation sous peu'
        ]
      });
    } else {
      // Si Airtable a échoué, retourner une erreur
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'enregistrement de l\'annonce',
        message: 'Une erreur technique s\'est produite lors de l\'enregistrement. Veuillez réessayer.',
        details: 'Impossible d\'enregistrer l\'annonce dans la base de données'
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la soumission DodoPartage:', error);
    
    // Libérer le verrou en cas d'erreur aussi
    const userEmail = req.body?.contact?.email;
    if (userEmail && req.body?.departureLocation && req.body?.arrivalLocation) {
      const submissionFingerprint = `${userEmail}-${req.body.departureLocation}-${req.body.arrivalLocation}-${req.body.shippingDate}-${req.body.container.type}-${req.body.container.availableVolume}`;
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
         const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
         await base(partageTableId).select({ maxRecords: 1 }).firstPage();
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


// ========================================
// FONCTION UTILITAIRE POUR LES PÉRIODES
// ========================================

/**
 * Convertit une liste de mois sélectionnés en dates de début et fin
 * Format attendu: ['Janvier 2025', 'Février 2025']
 */
function convertSelectedMonthsToDates(selectedMonths) {
  if (!selectedMonths || selectedMonths.length === 0) {
    return {
      startDate: null,
      endDate: null,
      formattedPeriod: 'Période flexible'
    };
  }

  console.log('🗓️ Conversion des mois sélectionnés:', selectedMonths);

  // Mapping des mois français
  const MONTHS_MAP = {
    'Janvier': 0, 'Février': 1, 'Mars': 2, 'Avril': 3, 'Mai': 4, 'Juin': 5,
    'Juillet': 6, 'Août': 7, 'Septembre': 8, 'Octobre': 9, 'Novembre': 10, 'Décembre': 11
  };

  // Parser et trier les mois
  const parsedMonths = selectedMonths
    .map(monthStr => {
      const [monthName, yearStr] = monthStr.split(' ');
      const year = parseInt(yearStr);
      const monthIndex = MONTHS_MAP[monthName];
      
      if (monthIndex === undefined || isNaN(year)) {
        console.log('⚠️ Mois invalide ignoré:', monthStr);
        return null;
      }
      
      return {
        year,
        month: monthIndex,
        monthName,
        date: new Date(year, monthIndex, 1)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (parsedMonths.length === 0) {
    return {
      startDate: null,
      endDate: null,
      formattedPeriod: 'Période flexible'
    };
  }

  // Premier mois = début de période (1er du mois)
  const firstMonth = parsedMonths[0];
  const startDate = new Date(Date.UTC(firstMonth.year, firstMonth.month, 1));

  // Dernier mois = fin de période (dernier jour du mois)
  const lastMonth = parsedMonths[parsedMonths.length - 1];
  const endDate = new Date(Date.UTC(lastMonth.year, lastMonth.month + 1, 0));

  // Formatage pour l'affichage
  let formattedPeriod = '';
  if (parsedMonths.length === 1) {
    formattedPeriod = `${firstMonth.monthName} ${firstMonth.year}`;
  } else {
    formattedPeriod = `${firstMonth.monthName} ${firstMonth.year} - ${lastMonth.monthName} ${lastMonth.year}`;
  }

  const result = {
    startDate: startDate.toISOString().split('T')[0], // Format YYYY-MM-DD
    endDate: endDate.toISOString().split('T')[0],
    formattedPeriod
  };

  console.log('📅 Résultat de la conversion:', result);
  return result;
}

/**
 * Convertit des dates de début/fin en liste de mois sélectionnés
 * @param startDate Date de début (format YYYY-MM-DD)
 * @param endDate Date de fin (format YYYY-MM-DD)
 * @returns Liste des mois sélectionnés
 */
function convertDatesToSelectedMonths(startDate, endDate) {
  if (!startDate || !endDate) {
    return [];
  }

  console.log('🗓️ Conversion des dates vers mois:', { startDate, endDate });

  const MONTHS_NAMES = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const start = new Date(startDate + 'T00:00:00Z'); // Force UTC
  const end = new Date(endDate + 'T00:00:00Z'); // Force UTC
  const selectedMonths = [];

  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (current <= endMonth) {
    const monthName = MONTHS_NAMES[current.getUTCMonth()];
    const year = current.getUTCFullYear();
    selectedMonths.push(`${monthName} ${year}`);
    
    // Passer au mois suivant
    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  console.log('📅 Mois sélectionnés récupérés:', selectedMonths);
  return selectedMonths;
}

// ========================================
// FONCTIONS POUR ALERTES AUTOMATIQUES INVERSES
// ========================================

/**
 * Génère les critères d'alerte inverse pour une annonce publiée
 * Si quelqu'un PROPOSE du transport, on lui crée une alerte pour CHERCHER des demandes
 * Si quelqu'un CHERCHE de la place, on lui crée une alerte pour TROUVER des offres
 */
function generateInverseAlertCriteria(announcementFields) {
  try {
    const requestType = announcementFields.request_type || 'offer';
    const departureCountry = announcementFields.departure_country;
    const arrivalCountry = announcementFields.arrival_country;
    
    // Vérifier qu'on a les données nécessaires
    if (!departureCountry || !arrivalCountry) {
      console.log('⚠️ Données manquantes pour alerte inverse:', { departureCountry, arrivalCountry });
      return null;
    }
    
    // Normaliser les pays pour les alertes (compatible Airtable)
    const normalizeCountry = (country) => {
      return country.toLowerCase()
        .replace(/é|è|ê|ë/g, 'e')
        .replace(/à|á|â|ã|ä/g, 'a')
        .replace(/ù|ú|û|ü/g, 'u')
        .replace(/ì|í|î|ï/g, 'i')
        .replace(/ò|ó|ô|õ|ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/ñ/g, 'n');
    };
    
    const departure = normalizeCountry(departureCountry);
    const arrival = normalizeCountry(arrivalCountry);
    
    let inverseType;
    let volumeMin;
    
    if (requestType === 'offer') {
      // Si quelqu'un PROPOSE du transport → créer alerte REQUEST (chercher des demandes)
      inverseType = 'request';
      
      // Volume min = le volume minimum accepté dans l'offre
      // (pour être alerté de gens qui cherchent ce qu'il peut transporter)
      volumeMin = Math.max(1, announcementFields.container_minimum_volume || 1);
      
      console.log(`🔄 Alerte inverse OFFER→REQUEST: chercher des demandes ${departure}→${arrival} avec ≥${volumeMin}m³`);
      
    } else if (requestType === 'search') {
      // Si quelqu'un CHERCHE de la place → créer alerte OFFER (chercher des offres)
      inverseType = 'offer';
      
      // Volume min = le volume qu'il recherche
      // (pour être alerté de gens qui proposent assez de place)
      volumeMin = Math.max(1, announcementFields.volume_needed || 1);
      
      console.log(`🔄 Alerte inverse SEARCH→OFFER: chercher des offres ${departure}→${arrival} avec ≥${volumeMin}m³`);
      
    } else {
      console.log('⚠️ Type d\'annonce non reconnu pour alerte inverse:', requestType);
      return null;
    }
    
    return {
      type: inverseType,
      departure: departure,
      arrival: arrival,
      volume_min: volumeMin
    };
    
  } catch (error) {
    console.error('❌ Erreur lors de la génération des critères d\'alerte inverse:', error);
    return null;
  }
}

/**
 * Crée une alerte automatiquement sans envoyer l'email de confirmation
 * Utilisée pour les alertes inverses après publication d'annonce
 */
async function createAutomaticAlert(alertCriteria, email, options = {}) {
  try {
    const {
      skipConfirmationEmail = true,
      source = 'automatic',
      authorName = '',
      originalAnnouncement = ''
    } = options;
    
    console.log('🤖 Création alerte automatique:', {
      email: email,
      type: alertCriteria.type,
      departure: alertCriteria.departure,
      arrival: alertCriteria.arrival,
      volume_min: alertCriteria.volume_min,
      skipEmail: skipConfirmationEmail
    });
    
    // Validation des données requises
    if (!alertCriteria.type || !alertCriteria.departure || !alertCriteria.arrival || 
        alertCriteria.volume_min === undefined || !email) {
      return {
        success: false,
        error: 'Données manquantes pour création alerte automatique'
      };
    }

    // Validation du type
    if (alertCriteria.type !== 'offer' && alertCriteria.type !== 'request') {
      return {
        success: false,
        error: 'Type invalide pour alerte automatique'
      };
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: false,
        error: 'Format d\'email invalide pour alerte automatique'
      };
    }

    // Vérifier s'il n'existe pas déjà une alerte similaire pour cet utilisateur
    const emailAlertTableId = process.env.AIRTABLE_EMAIL_ALERT_TABLE_ID || 'tblVuVneCZTot07sB';
    
    try {
      // Échapper les guillemets dans les valeurs pour éviter les erreurs de formule
      const escapedEmail = email.replace(/'/g, "''");
      const escapedType = alertCriteria.type.replace(/'/g, "''");
      const escapedDeparture = alertCriteria.departure.replace(/'/g, "''");
      const escapedArrival = alertCriteria.arrival.replace(/'/g, "''");
      
      const existingAlerts = await base(emailAlertTableId).select({
        filterByFormula: `AND(
          {email} = '${escapedEmail}',
          {type} = '${escapedType}',
          {departure} = '${escapedDeparture}',
          {arrival} = '${escapedArrival}',
          {status} = 'active'
        )`,
        maxRecords: 1
      }).firstPage();
      
      if (existingAlerts.length > 0) {
        console.log('⚠️ Alerte similaire déjà existante pour cet utilisateur - pas de création');
        return {
          success: false,
          error: 'Alerte similaire déjà existante',
          duplicate: true,
          existingAlert: {
            id: existingAlerts[0].id,
            email: existingAlerts[0].fields.email,
            type: existingAlerts[0].fields.type
          }
        };
      }
    } catch (checkError) {
      console.log('⚠️ Erreur lors de la vérification de doublon (on continue quand même):', checkError.message);
      // On continue quand même la création car c'est juste une vérification
    }

    // Générer un token unique pour la suppression
    const deleteToken = 'del_auto_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15);
    
    // Créer l'enregistrement dans Airtable avec gestion robuste des champs
    // Champs obligatoires (compatibles avec alertes classiques)
    const baseFields = {
      "email": email,
      "type": alertCriteria.type,
      "departure": alertCriteria.departure,
      "arrival": alertCriteria.arrival,
      "volume_min": alertCriteria.volume_min,
      "status": 'active',
      "delete_token": deleteToken
    };
    
    // Champs optionnels (nouveaux) pour traçabilité
    const extendedFields = {
      ...baseFields,
      "created_source": source || 'automatic',
      "original_announcement": originalAnnouncement || '',
      "author_name": authorName || '',
      "auto_created": true,
      "confirmation_email_sent": false
    };
    
    let alertRecord;
    
    try {
      // Essayer d'abord avec tous les champs (nouveaux + anciens)
      console.log('📝 Tentative création avec champs étendus...');
      alertRecord = await base(emailAlertTableId).create([
        {
          fields: extendedFields
        }
      ]);
      console.log('✅ Alerte créée avec champs étendus');
      
    } catch (extendedError) {
      console.log('⚠️ Échec avec champs étendus, tentative avec champs de base...');
      console.log('   Erreur:', extendedError.message);
      
      try {
        // Retry avec seulement les champs de base (compatibilité totale)
        alertRecord = await base(emailAlertTableId).create([
          {
            fields: baseFields
          }
        ]);
        console.log('✅ Alerte créée avec champs de base uniquement');
        
      } catch (baseError) {
        console.error('❌ Échec même avec champs de base:', baseError.message);
        throw baseError; // Re-throw l'erreur si même les champs de base échouent
      }
    }

    console.log('✅ Alerte automatique créée avec succès dans Airtable:', alertRecord[0].id);

    // 📧 PAS d'email de confirmation si skipConfirmationEmail = true
    if (!skipConfirmationEmail) {
      console.log('📧 Envoi email de confirmation d\'alerte automatique...');
      // Ici on pourrait ajouter l'envoi d'email si nécessaire dans le futur
    } else {
      console.log('📧 Email de confirmation ignoré (alerte automatique)');
    }

    // Déterminer si les champs étendus ont été utilisés
    const usedExtendedFields = alertRecord[0].fields.hasOwnProperty('auto_created');
    
    return {
      success: true,
      message: 'Alerte automatique créée avec succès',
      data: {
        recordId: alertRecord[0].id,
        email: email,
        type: alertCriteria.type,
        departure: alertCriteria.departure,
        arrival: alertCriteria.arrival,
        volume_min: alertCriteria.volume_min,
        deleteToken: deleteToken,
        autoCreated: usedExtendedFields,
        confirmationEmailSent: false,
        source: source,
        fieldsUsed: usedExtendedFields ? 'extended' : 'base-only',
        compatibility: usedExtendedFields ? 'full' : 'fallback'
      }
    };

  } catch (error) {
    console.error('❌ Erreur lors de la création d\'alerte automatique:', error);
    return {
      success: false,
      error: 'Erreur technique lors de la création d\'alerte automatique',
      details: error.message
    };
  }
}

// Route pour soumettre une demande de recherche de place DodoPartage
app.post('/api/partage/submit-search-request', async (req, res) => {
  console.log('POST /api/partage/submit-search-request appelé');
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

    // Créer une empreinte unique pour les demandes de recherche
    const submissionFingerprint = `PARTAGE-${userEmail}-${data.departureLocation}-${data.arrivalLocation}-${data.volumeNeeded.neededVolume}-${data.budget.acceptsFees}`;
    
    if (submissionInProgress.has(submissionFingerprint)) {
      console.log('⚠️ Demande de recherche IDENTIQUE déjà en cours:', submissionFingerprint);
      return res.status(429).json({
        success: false,
        error: 'Une demande identique est déjà en cours',
        message: 'Veuillez patienter...'
      });
    }
    
    // Marquer cette demande comme en cours
    submissionInProgress.set(submissionFingerprint, Date.now());
    console.log('🔒 Demande de recherche verrouillée:', submissionFingerprint);

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

    if (!data.volumeNeeded?.neededVolume || data.volumeNeeded.neededVolume <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Volume recherché doit être supérieur à 0'
      });
    }

    if (data.budget.acceptsFees === null || data.budget.acceptsFees === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Position sur la participation aux frais est requise'
      });
    }

    if (!data.announcementText || data.announcementText.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Description de la demande doit contenir au moins 10 caractères'
      });
    }

    // Générer une référence unique pour la demande
    const generateSearchReference = () => {
      const timestamp = Date.now().toString();
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `PARTAGE-${timestamp.slice(-6)}-${randomSuffix}`;
    };

    const reference = generateSearchReference();
    console.log('Référence de demande générée:', reference);

    // Protection contre les doublons : vérifier si une demande similaire existe déjà
    try {
      const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
      const recentRecords = await base(partageTableId).select({
        filterByFormula: `AND({contact_email} = '${data.contact.email}', {request_type} = 'search', DATETIME_DIFF(NOW(), {created_at}, 'minutes') < 2)`,
        maxRecords: 1
      }).firstPage();
      
      if (recentRecords.length > 0) {
        console.log('⚠️ Doublon détecté - demande récente trouvée pour cet email (moins de 2 minutes)');
        // Libérer le verrou avant de retourner l'erreur
        submissionInProgress.delete(submissionFingerprint);
        console.log('🔓 Verrou libéré après détection de doublon pour:', submissionFingerprint);
        
        return res.status(409).json({
          success: false,
          error: 'duplicate',
          message: 'Une demande a déjà été créée récemment avec cet email',
          details: 'Veuillez attendre 2 minutes avant de créer une nouvelle demande'
        });
      }
    } catch (duplicateCheckError) {
      console.log('⚠️ Impossible de vérifier les doublons, on continue:', duplicateCheckError.message);
    }


    // ========================================
    // TRAITEMENT DES PÉRIODES D'EXPÉDITION
    // ========================================
    
    let periodDates = { startDate: null, endDate: null, formattedPeriod: 'Flexible' };
    
    // 🔧 CORRECTION : Utiliser les données déjà converties par le frontend
    if (data.shipping_period_start && data.shipping_period_end) {
      console.log('📅 Dates de période reçues du frontend (déjà converties):', {
        start: data.shipping_period_start,
        end: data.shipping_period_end,
        formatted: data.shipping_period_formatted
      });
      periodDates = {
        startDate: data.shipping_period_start,
        endDate: data.shipping_period_end,
        formattedPeriod: data.shipping_period_formatted || 'Flexible'
      };
      console.log('✅ Périodes utilisées directement depuis le frontend');
    } 
    // Fallback : traiter les données de période envoyées par le frontend (ancien format)
    else if (data.shippingPeriod && Array.isArray(data.shippingPeriod) && data.shippingPeriod.length > 0) {
      console.log('📅 Période reçue du frontend (ancien format):', data.shippingPeriod);
      periodDates = convertSelectedMonthsToDates(data.shippingPeriod);
      console.log('✅ Périodes converties côté backend:', periodDates);
    } else {
      console.log('⚠️ Aucune période spécifique reçue, utilisation de "Flexible"');
    }
    
    // Préparer les données complètes pour Airtable
    const airtableData = {
      fields: {
        // Identifiant et statut
        'reference': reference,
        'created_at': new Date().toISOString(),
        'status': 'pending',
        'validation_token': crypto.randomUUID(),
        'expires_at': (() => {
          // Pour les demandes : expiration le lendemain du 1er jour du mois suivant shipping_period_end
          if (periodDates.endDate) {
            const endDate = new Date(periodDates.endDate);
            // Aller au 1er jour du mois suivant
            const nextMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
            // Le lendemain du 1er jour du mois suivant
            const dayAfter = new Date(nextMonth);
            dayAfter.setDate(dayAfter.getDate() + 1);
            
            console.log(`📅 Calcul expiration SEARCH:`);
            console.log(`   Fin période recherche: ${endDate.toISOString()}`);
            console.log(`   1er jour mois suivant: ${nextMonth.toISOString()}`);
            console.log(`   Expiration calculée: ${dayAfter.toISOString()}`);
            
            return dayAfter.toISOString();
          }
          // Fallback si pas de shipping_period_end : 60 jours
          console.log(`⚠️ SEARCH sans shipping_period_end, utilisation fallback 60j`);
          const fallbackDate = new Date();
          fallbackDate.setDate(fallbackDate.getDate() + 60);
          return fallbackDate.toISOString();
        })(),
        'request_type': 'search', // Différencier des annonces "propose"
        
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
        
        // Période d'expédition (pour les demandes)
        'shipping_period_formatted': periodDates.formattedPeriod || data.shippingMonthsFormatted || 'Flexible',
        
        // Nouveaux champs de dates exploitables pour filtrage
        'shipping_period_start': periodDates.startDate,
        'shipping_period_end': periodDates.endDate,        
        // Volume recherché (au lieu d'un conteneur)
        'volume_needed': parseFloat(data.volumeNeeded.neededVolume) || 0,
        'volume_used_calculator': data.volumeNeeded.usedCalculator || false,
        
        // Participation aux frais
        'accepts_fees': data.budget.acceptsFees || false,
        
        // Texte de la demande
        'announcement_text': data.announcementText || '',

        // Type de requête
        'request_type': data.request_type || 'offer'
      }
    };
    
    console.log('🔍 Données de demande envoyées à Airtable:', JSON.stringify(airtableData, null, 2));

    // Enregistrer dans Airtable
    let airtableRecordId = null;
    let airtableSuccess = false;
    try {
      console.log('📤 Envoi demande vers Airtable...');
      
      // Utiliser la même table que les annonces mais avec request_type = 'search'
      const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
      console.log('📋 Table Airtable utilisée:', partageTableId);
      
      const records = await base(partageTableId).create([airtableData]);
      airtableRecordId = records[0].id;
      airtableSuccess = true;
      
      console.log('✅ Demande enregistrée dans Airtable:', airtableRecordId);
      console.log('✅ Token validation stocké:', airtableData.fields.validation_token);
      
    } catch (airtableError) {
      console.error('❌ Erreur Airtable détaillée:', airtableError);
      console.error('❌ Message d\'erreur:', airtableError.message);
      
      // En cas d'erreur Airtable, on continue quand même
      console.log('⚠️ Continuons sans Airtable pour ne pas bloquer l\'utilisateur');
    }

    // Envoyer l'email de validation via Resend (seulement si Airtable a réussi)
    if (airtableSuccess) {
      try {
        console.log('📧 Envoi de l\'email de validation pour demande...');
        
        // Utiliser le token de validation déjà stocké dans Airtable
        const validationToken = airtableData.fields.validation_token;
        const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
        const validationUrl = `${frontendUrl}/validating/${validationToken}`;
        
        console.log('🔑 Token de validation utilisé:', validationToken);
      
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [data.contact.email],
        subject: '🔍 Confirmez votre demande de place DodoPartage',
        headers: {
          'X-Entity-Ref-ID': `dodopartage-search-validation-${validationToken}`
        },
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Confirmez votre demande DodoPartage</title>
        </head>
        <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
            
            <!-- Header moderne avec les bonnes couleurs -->
            <div style="background: linear-gradient(135deg, #243163 0%, #1e2951 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: white; font-family: 'Inter', sans-serif; font-size: 28px; margin: 0; font-weight: 700;">
                🔍 DodoPartage
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
                Recherche de place pour groupage
              </p>
            </div>
            
            <!-- Contenu principal -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">
                Bonjour ${data.contact.firstName} 👋
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
                Votre demande de place <strong>${data.departureLocation || `${data.departure.city}, ${data.departure.country}`} → ${data.arrivalLocation || `${data.arrival.city}, ${data.arrival.country}`}</strong>
                a bien été reçue !
              </p>
              
              <!-- Récap de la demande -->
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h4 style="color: #334155; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">
                  📦 Votre demande :
                </h4>
                <p style="color: #64748b; font-size: 14px; margin: 5px 0;">
                  <strong>Volume recherché :</strong> ${data.volumeNeeded.neededVolume} m³
                </p>
                <p style="color: #64748b; font-size: 14px; margin: 5px 0;">
                  <strong>Participation aux frais :</strong> ${data.budget.acceptsFees ? 'Accepte de participer' : 'Ne souhaite pas participer'}
                </p>
                <p style="color: #64748b; font-size: 14px; margin: 5px 0;">
                  <strong>Période :</strong> ${data.shippingMonthsFormatted || 'Flexible'}
                </p>
              </div>
              
              <!-- Message d'urgence minimaliste -->
              <div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 20px; margin: 30px 0;">
                <div style="display: flex; align-items: center;">
                  <span style="font-size: 20px; margin-right: 12px;">⚠️</span>
                  <div>
                    <h3 style="color: #92400e; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                      Confirmation requise
                    </h3>
                    <p style="color: #b45309; font-size: 14px; margin: 0; line-height: 1.4;">
                      Votre demande sera visible après validation de votre email
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Bouton CTA minimaliste -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${validationUrl}" 
                   style="display: inline-block; background-color: #F47D6C; color: white; padding: 14px 28px;
                          text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">
                  Confirmer mon email
                </a>
              </div>
              
              <!-- Explications simplifiées -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 30px 0;">
                <h4 style="color: #374151; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">
                  Après confirmation :
                </h4>
                
                <div style="space-y: 8px;">
                  <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                    <span style="color: #4b5563; font-size: 14px;">Votre demande devient visible</span>
                  </div>
                  <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                    <span style="color: #4b5563; font-size: 14px;">Les transporteurs vous contactent</span>
                  </div>
                  <div style="display: flex; align-items: center;">
                    <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                    <span style="color: #4b5563; font-size: 14px;">Vous organisez votre expédition</span>
                  </div>
                </div>
              </div>
              
              <!-- Informations expiration -->
              <div style="text-align: center; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 13px; margin: 0;">
                  ⏰ Lien valide 7 jours
                </p>
              </div>
            </div>
            
            <!-- Footer simple -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="${generateUTMUrl('https://dodomove.fr', 'confirmation-search', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
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
        console.error('❌ Erreur Resend:', emailError);
        throw new Error(`Erreur email: ${emailError.message}`);
      }

      console.log('✅ Email de validation envoyé:', emailData);

      } catch (emailError) {
        console.error('❌ Erreur lors de l\'envoi de l\'email:', emailError);
        // Note: On ne bloque pas le processus, la demande est enregistrée
      }
    }

    // Libérer le verrou après succès
    submissionInProgress.delete(submissionFingerprint);
    console.log('🔓 Verrou libéré après succès pour:', submissionFingerprint);

    // Réponse de succès
    console.log('✅ Demande de place soumise avec succès');
    res.status(200).json({
      success: true,
      message: 'Demande de place soumise avec succès',
      data: {
        reference: reference,
        email: data.contact.email,
        status: 'pending_validation',
        recordId: airtableRecordId
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la soumission de la demande:', error);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la soumission de la demande',
      message: 'Une erreur technique s\'est produite. Veuillez réessayer.',
      details: error.message
    });
  }
}); // Route pour valider une annonce DodoPartage via email
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
    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    console.log('🔍 Recherche du token dans la table:', partageTableId);

    // Rechercher l'annonce avec ce token de validation
    const records = await base(partageTableId).select({
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
    
    const updatedRecord = await base(partageTableId).update(record.id, {
      status: 'published',
      validated_at: new Date().toISOString(),
      validation_token: '' // Supprimer le token après utilisation
    });

    console.log('✅ Annonce validée avec succès:', {
      id: updatedRecord.id,
      reference: updatedRecord.fields.reference,
      newStatus: updatedRecord.fields.status
    });

    // Générer des tokens pour la gestion de l'annonce
    const editToken = 'edit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15);
    const deleteToken = 'del_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15);
    
    // Mettre à jour avec les tokens de gestion
    await base(partageTableId).update(record.id, {
      edit_token: editToken,
      delete_token: deleteToken
    });

    // Envoyer l'email de confirmation post-validation
    try {
      const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
      const viewUrl = `${frontendUrl}/annonce/${updatedRecord.fields.reference}`;
      const editUrl = `${frontendUrl}/modifier/${editToken}`;
      const deleteUrl = `${frontendUrl}/supprimer/${deleteToken}`;
      
      console.log('📧 Envoi de l\'email de confirmation post-validation...');
      
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [updatedRecord.fields.contact_email],
        subject: '✅ Votre annonce DodoPartage est maintenant publiée !',
        headers: {
          'X-Entity-Ref-ID': `dodopartage-published-${updatedRecord.fields.reference}`
        },
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Annonce publiée - DodoPartage</title>
        </head>
        <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
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
                Félicitations ${updatedRecord.fields.contact_first_name} ! 🎉
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
                Votre annonce <strong>${updatedRecord.fields.reference}</strong> est maintenant <strong style="color: #10b981;">publiée</strong> et visible par tous les utilisateurs !
              </p>
              
              <!-- Message de succès -->
              <div style="border-left: 4px solid #10b981; background-color: #f0fdf4; padding: 20px; margin: 30px 0;">
                <div style="display: flex; align-items: center;">
                  <span style="font-size: 20px; margin-right: 12px;">✅</span>
                  <div>
                    <h3 style="color: #15803d; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                      Annonce active
                    </h3>
                    <p style="color: #166534; font-size: 14px; margin: 0; line-height: 1.4;">
                      Les utilisateurs peuvent maintenant vous contacter pour organiser un groupage
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Bouton principal -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${viewUrl}" 
                   style="display: inline-block; background-color: #F47D6C; color: white; padding: 16px 32px; 
                          text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  🔍 Voir mon annonce
                </a>
              </div>
              
              <!-- Actions de gestion -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 30px 0;">
                <h4 style="color: #374151; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">
                  Gérer votre annonce :
                </h4>
                
                <div style="text-align: center;">
                  <a href="${editUrl}" 
                     style="display: inline-block; background-color: #6b7280; color: white; padding: 12px 24px; 
                            text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; margin: 0 8px 8px 0;">
                    ✏️ Modifier
                  </a>
                  
                  <a href="${deleteUrl}" 
                     style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; 
                            text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; margin: 0 8px 8px 0;">
                    🗑️ Supprimer
                  </a>
                </div>
              </div>
              
              <!-- Informations utiles -->
              <div style="text-align: center; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 13px; margin: 0;">
                  💡 Vous recevrez un email à chaque nouvelle demande de contact
                </p>
              </div>
              
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="${generateUTMUrl('https://dodomove.fr', 'published', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
              </p>
            </div>
            
          </div>
        </body>
        </html>
        `,
      });

      if (emailError) {
        console.error('❌ Erreur email confirmation:', emailError);
      } else {
        console.log('✅ Email de confirmation envoyé:', emailData.id);
      }
      
    } catch (emailError) {
      console.error('❌ Erreur lors de l\'envoi de l\'email de confirmation:', emailError);
      // On continue même si l'email échoue
    }
    
    // 🔔 VÉRIFICATION AUTOMATIQUE DES ALERTES après publication
    try {
      console.log('🔔 Vérification automatique des alertes après publication...');
      
      // Préparer les données de l'annonce pour la vérification d'alertes
      const announcementForAlerts = {
        ...updatedRecord.fields,
        reference: updatedRecord.fields.reference
      };
      
      const alertResult = await checkAndSendAlertNotifications(announcementForAlerts);
      
      if (alertResult.success && alertResult.alertsSent > 0) {
        console.log(`✅ ${alertResult.alertsSent} notification(s) d'alerte envoyée(s) automatiquement`);
      } else {
        console.log('📭 Aucune alerte correspondante pour cette annonce');
      }
      
    } catch (alertError) {
      console.error('⚠️ Erreur lors de la vérification automatique des alertes:', alertError);
      // On continue même si les alertes échouent - l'annonce est déjà publiée
    }

    // 🤖 CRÉATION AUTOMATIQUE D'UNE ALERTE INVERSE pour l'auteur de l'annonce
    try {
      console.log('🤖 Création automatique d\'une alerte inverse pour l\'auteur...');
      
      const authorEmail = updatedRecord.fields.contact_email;
      const authorName = updatedRecord.fields.contact_first_name;
      
      if (!authorEmail) {
        console.log('⚠️ Pas d\'email auteur - alerte inverse non créée');
      } else {
        // Générer les critères d'alerte inverse
        const inverseAlertCriteria = generateInverseAlertCriteria(updatedRecord.fields);
        
        if (inverseAlertCriteria) {
          console.log('📝 Critères d\'alerte inverse:', inverseAlertCriteria);
          
          // Créer l'alerte inverse automatiquement (sans email de confirmation)
          const autoAlertResult = await createAutomaticAlert(inverseAlertCriteria, authorEmail, {
            skipConfirmationEmail: true,
            source: 'auto-created-after-publication',
            authorName: authorName,
            originalAnnouncement: updatedRecord.fields.reference
          });
          
          if (autoAlertResult.success) {
            console.log(`✅ Alerte inverse créée automatiquement pour ${authorEmail}`);
          } else {
            console.log('⚠️ Échec création alerte inverse:', autoAlertResult.error);
          }
        } else {
          console.log('📭 Aucune alerte inverse pertinente pour cette annonce');
        }
      }
      
    } catch (autoAlertError) {
      console.error('⚠️ Erreur lors de la création automatique d\'alerte inverse:', autoAlertError);
      // On continue même si la création d'alerte automatique échoue
    }
    
    // Réponse de succès pour redirection côté frontend
    res.status(200).json({
      success: true,
      message: 'Annonce validée avec succès',
      data: {
        reference: updatedRecord.fields.reference,
        status: 'published',
        validatedAt: updatedRecord.fields.validated_at,
        editToken: editToken,
        deleteToken: deleteToken
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
      periods = '',           // périodes sélectionnées (format: "Septembre 2025,Octobre 2025")
      status = 'published'    // published, pending_validation, all
    } = req.query;

    console.log('🔍 Paramètres de filtrage reçus:', {
      type, departure, arrival, volumeMin, volumeMax, periods, status
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
    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    console.log('📋 Récupération depuis la table:', partageTableId);

    // Construction des filtres Airtable
    let filterFormula = '';
    const filters = [];

    // Filtre par statut avec exclusion explicite des annonces supprimées
    if (status === 'all') {
      // Si status = 'all', on affiche toutes les annonces SAUF les supprimées
      filters.push(`{status} != 'deleted'`);
    } else if (status === 'deleted') {
      // Cas particulier : afficher uniquement les annonces supprimées (pour admin/debug)
      filters.push(`{status} = 'deleted'`);
    } else {
      // Statut spécifique (published, pending_validation, etc.)
      filters.push(`{status} = '${status}'`);
    }

    // Filtre par type d'annonce (offer/request)
    if (type !== 'all') {
      if (type === 'offer') {
        filters.push(`{request_type} = 'offer'`);
      } else if (type === 'request') {
        filters.push(`{request_type} = 'search'`);
      }
    }
    
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

    const records = await base(partageTableId).select(selectOptions).all();
    
    console.log(`📊 ${records.length} enregistrement(s) récupéré(s) depuis Airtable`);

    // Transformation des données Airtable vers le format API
    const announcements = records.map(record => {
      const fields = record.fields;
      
      // Détecter le type d'annonce
      const isSearchRequest = fields.request_type === 'search';
      
      // Champs communs à tous les types d'annonces
      const baseAnnouncement = {
        id: record.id,
        reference: fields.reference || '',
        status: fields.status || 'pending_validation',
        created_at: fields.created_at || new Date().toISOString(),
        expires_at: fields.expires_at || null,
        expired_at: fields.expired_at || null,
        contact_first_name: fields.contact_first_name || '',
        contact_email: fields.contact_email || '',
        contact_phone: fields.contact_phone || '',
        departure_country: fields.departure_country || '',
        departure_city: fields.departure_city || '',
        departure_postal_code: fields.departure_postal_code || '',
        arrival_country: fields.arrival_country || '',
        arrival_city: fields.arrival_city || '',
        arrival_postal_code: fields.arrival_postal_code || '',
        announcement_text: fields.announcement_text || '',
        announcement_text_length: fields.announcement_text_length || 0,
        request_type: fields.request_type || 'offer' // Nouveau champ pour différencier
      };
      
      if (isSearchRequest) {
        // Champs spécifiques aux demandes de place
        return {
          ...baseAnnouncement,
          // Champs pour les demandes search
          volume_needed: fields.volume_needed || 0,
          accepts_fees: fields.accepts_fees || false,
          shipping_period_start: fields.shipping_period_start || '',
          shipping_period_end: fields.shipping_period_end || '',
          shipping_period_formatted: fields.shipping_period_formatted || 'Période flexible',
          // Champs offer mis à null pour cohérence
          shipping_date: '',
          shipping_date_formatted: '',
          container_type: '',
          container_available_volume: 0,
          container_minimum_volume: 0,
          offer_type: ''
        };
      } else {
        // Champs spécifiques aux offres de place
        return {
          ...baseAnnouncement,
          // Champs pour les offres offer
          shipping_date: fields.shipping_date || '',
          shipping_date_formatted: fields.shipping_date_formatted || '',
          container_type: fields.container_type || '20',
          container_available_volume: fields.container_available_volume || 0,
          container_minimum_volume: fields.container_minimum_volume || 0,
          offer_type: fields.offer_type || 'free',
          // Champs search mis à valeur par défaut pour cohérence
          volume_needed: 0,
          accepts_fees: false,
          shipping_period_start: '',
          shipping_period_end: '',
          shipping_period_formatted: ''
        };
      }
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

    // Filtre par volume (prendre en compte les deux types d'annonces)
    if (volumeMin) {
      const minVol = parseFloat(volumeMin);
      filteredAnnouncements = filteredAnnouncements.filter(ann => {
        const volume = ann.request_type === 'search' 
          ? ann.volume_needed 
          : ann.container_available_volume;
        return volume >= minVol;
      });
    }

    if (volumeMax) {
      const maxVol = parseFloat(volumeMax);
      filteredAnnouncements = filteredAnnouncements.filter(ann => {
        const volume = ann.request_type === 'search' 
          ? ann.volume_needed 
          : ann.container_available_volume;
        return volume <= maxVol;
      });
    }

    // Filtre par périodes sélectionnées (nouveau)
    if (periods) {
      console.log('🗓️ Filtrage par périodes:', periods);
      
      // Parser les périodes sélectionnées "Septembre 2025,Octobre 2025"
      const selectedPeriods = periods.split(',').map(p => p.trim()).filter(p => p.length > 0);
      
      if (selectedPeriods.length > 0) {
        filteredAnnouncements = filteredAnnouncements.filter(ann => {
          if (ann.request_type === 'offer') {
            // Pour les offres : vérifier la shipping_date
            if (ann.shipping_date) {
              try {
                const shippingDate = new Date(ann.shipping_date);
                const monthNames = [
                  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
                ];
                
                const monthYear = `${monthNames[shippingDate.getMonth()]} ${shippingDate.getFullYear()}`;
                const matches = selectedPeriods.includes(monthYear);
                
                console.log('🗓️ Offer match:', {
                  reference: ann.reference,
                  shippingDate: ann.shipping_date,
                  monthYear,
                  selectedPeriods,
                  matches
                });
                
                return matches;
              } catch (error) {
                console.warn('🗓️ Erreur parsing date offer:', ann.shipping_date, error);
                return false;
              }
            }
            return false;
          } else if (ann.request_type === 'search') {
            // Pour les demandes : vérifier la période formatée ou flexible
            if (ann.shipping_period_formatted === 'Période flexible') {
              console.log('🗓️ Request flexible acceptée:', ann.reference);
              return true; // Inclure les périodes flexibles
            }
            
            if (ann.shipping_period_formatted) {
              // Parser "Septembre - Octobre 2025" ou "Septembre 2025"
              const periodMatch = ann.shipping_period_formatted.match(/([A-Za-zàâäéèêëïîôöùûüÿç]+)(?:\s*-\s*([A-Za-zàâäéèêëïîôöùûüÿç]+))?\s+(\d{4})/);
              
              if (periodMatch) {
                const [, startMonth, endMonth, year] = periodMatch;
                const requestPeriods = [];
                
                if (endMonth) {
                  // Période avec plusieurs mois
                  const monthsOrder = [
                    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
                  ];
                  
                  const startIndex = monthsOrder.indexOf(startMonth);
                  const endIndex = monthsOrder.indexOf(endMonth);
                  
                  if (startIndex !== -1 && endIndex !== -1) {
                    for (let i = startIndex; i <= endIndex; i++) {
                      requestPeriods.push(`${monthsOrder[i]} ${year}`);
                    }
                  }
                } else {
                  // Mois unique
                  requestPeriods.push(`${startMonth} ${year}`);
                }
                
                const hasMatch = requestPeriods.some(requestPeriod => 
                  selectedPeriods.includes(requestPeriod)
                );
                
                console.log('🗓️ Request match:', {
                  reference: ann.reference,
                  periodFormatted: ann.shipping_period_formatted,
                  requestPeriods,
                  selectedPeriods,
                  hasMatch
                });
                
                return hasMatch;
              } else {
                console.warn('🗓️ Format période request non reconnu:', ann.shipping_period_formatted);
                return true; // Inclure en cas de format non reconnu
              }
            }
            return false;
          }
          return false;
        });
        
        console.log(`🗓️ Filtrage terminé: ${filteredAnnouncements.length} annonces correspondent aux périodes`);
      }
    }

    // Statistiques pour le debug
    const stats = {
      total: filteredAnnouncements.length,
      byType: {
        offers: filteredAnnouncements.filter(a => a.request_type === 'offer').length,
        requests: filteredAnnouncements.filter(a => a.request_type === 'search').length
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
        applied: { type, departure, arrival, volumeMin, volumeMax, periods, status },
        resultsFiltered: filteredAnnouncements.length < records.length
      },
      backend: {
        source: 'airtable',
        table: partageTableId,
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

// Route pour afficher le formulaire de suppression avec questionnaire
app.get('/api/partage/delete-form/:token', async (req, res) => {
  console.log('GET /api/partage/delete-form appelé avec token:', req.params.token);
  
  try {
    const deleteToken = req.params.token;
    
    if (!deleteToken) {
      return res.status(400).json({
        success: false,
        error: 'Token de suppression manquant'
      });
    }

    // Vérifier que l'annonce existe avec ce token
    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    const records = await base(partageTableId).select({
      filterByFormula: `{delete_token} = '${deleteToken}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Annonce non trouvée ou token invalide'
      });
    }

    const announcement = records[0];
    
    // Retourner les informations de l'annonce pour affichage
    res.status(200).json({
      success: true,
      data: {
        reference: announcement.fields.reference,
        departure: announcement.fields.departure_city,
        arrival: announcement.fields.arrival_city,
        contact_name: announcement.fields.contact_first_name
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération pour suppression:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur technique',
      details: error.message
    });
  }
});

// Route pour traiter la suppression avec raison
app.post('/api/partage/confirm-deletion', async (req, res) => {
  console.log('POST /api/partage/confirm-deletion appelé');
  
  try {
    const { deleteToken, reason } = req.body;
    
    if (!deleteToken || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Token et raison requis'
      });
    }

    // Valider la raison
    const validReasons = ['found_solution', 'plans_changed', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        error: 'Raison invalide'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    // Trouver l'annonce
    const records = await base(partageTableId).select({
      filterByFormula: `{delete_token} = '${deleteToken}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Annonce non trouvée'
      });
    }

    const recordId = records[0].id;
    const announcement = records[0].fields;
    
    // Mettre à jour l'enregistrement avec la raison et le statut supprimé
    await base(partageTableId).update(recordId, {
      status: 'deleted',
      deletion_reason: reason,
      deleted_at: new Date().toISOString(),
      delete_token: null // Supprimer le token pour éviter les suppressions multiples
    });

    console.log('✅ Annonce supprimée:', {
      reference: announcement.reference,
      reason: reason
    });

    // Envoyer un email de confirmation de suppression
    try {
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [announcement.contact_email],
        subject: '🗑️ Annonce DodoPartage supprimée',
        headers: {
          'X-Entity-Ref-ID': `dodopartage-deleted-${announcement.reference}`
        },
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Annonce supprimée - DodoPartage</title>
        </head>
        <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
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
                Annonce supprimée ✅
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
                Votre annonce <strong>${announcement.reference}</strong> a été supprimée avec succès.
              </p>
              
              <!-- Message de confirmation -->
              <div style="border-left: 4px solid #6b7280; background-color: #f9fafb; padding: 20px; margin: 30px 0;">
                <div style="display: flex; align-items: center;">
                  <span style="font-size: 20px; margin-right: 12px;">ℹ️</span>
                  <div>
                    <h3 style="color: #374151; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                      Suppression confirmée
                    </h3>
                    <p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.4;">
                      Votre annonce n'est plus visible sur la plateforme
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Bouton pour créer une nouvelle annonce -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${frontendUrl}/funnel/propose" 
                   style="display: inline-block; background-color: #F47D6C; color: white; padding: 16px 32px; 
                          text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  ➕ Créer une nouvelle annonce
                </a>
              </div>
              
              <!-- Message de remerciement -->
              <div style="text-align: center; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  Merci d'avoir utilisé DodoPartage ! 💙
                </p>
              </div>
              
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="${generateUTMUrl('https://dodomove.fr', 'deleted', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
              </p>
            </div>
            
          </div>
        </body>
        </html>
        `,
      });

      if (!emailError) {
        console.log('✅ Email de confirmation de suppression envoyé:', emailData.id);
      }
    } catch (emailError) {
      console.error('❌ Erreur email confirmation suppression:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Annonce supprimée avec succès',
      data: {
        reference: announcement.reference,
        reason: reason
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression',
      details: error.message
    });
  }
});

// Route pour récupérer les données d'une annonce pour modification
app.get('/api/partage/edit-form/:token', async (req, res) => {
  console.log('GET /api/partage/edit-form appelé avec token:', req.params.token);
  
  try {
    const editToken = req.params.token;
    
    if (!editToken) {
      return res.status(400).json({
        success: false,
        error: 'Token de modification manquant'
      });
    }

    // Vérifier que l'annonce existe avec ce token
    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    const records = await base(partageTableId).select({
      filterByFormula: `{edit_token} = '${editToken}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Annonce non trouvée ou token invalide'
      });
    }

    const announcement = records[0];
    const fields = announcement.fields;
    
    // Retourner toutes les données nécessaires pour le formulaire de modification
    const baseData = {
      id: announcement.id,
      reference: fields.reference,
      contact: {
        firstName: fields.contact_first_name,
        lastName: fields.contact_last_name,
        email: fields.contact_email,
        phone: fields.contact_phone
      },
      departure: {
        country: fields.departure_country,
        city: fields.departure_city,
        postalCode: fields.departure_postal_code,
        displayName: `${fields.departure_country} (${fields.departure_city})`
      },
      arrival: {
        country: fields.arrival_country,
        city: fields.arrival_city,
        postalCode: fields.arrival_postal_code,
        displayName: `${fields.arrival_country} (${fields.arrival_city})`
      },
      announcementText: fields.announcement_text,
      requestType: fields.request_type // Type de demande (search/offer)
    };

    // Ajouter les données spécifiques selon le type d'annonce
    if (fields.request_type === 'search') {
      // Pour les demandes de place
      baseData.volumeNeeded = {
        neededVolume: fields.volume_needed || 0,
        usedCalculator: fields.volume_used_calculator || false
      };
      baseData.budget = {
        acceptsFees: fields.accepts_fees || false
      };
      
      // Récupérer la période formatée et les dates si disponibles
      if (fields.shipping_period_start && fields.shipping_period_end) {
        baseData.shippingPeriod = convertDatesToSelectedMonths(
          fields.shipping_period_start, 
          fields.shipping_period_end
        );
      } else {
        baseData.shippingPeriod = [];
      }
      baseData.shippingPeriodFormatted = fields.shipping_period_formatted || 'Flexible';
      
    } else {
      // Pour les offres de place (comportement existant)
      baseData.shippingDate = fields.shipping_date;
      baseData.container = {
        type: fields.container_type,
        availableVolume: fields.container_available_volume,
        minimumVolume: fields.container_minimum_volume
      };
      baseData.offerType = fields.offer_type;
    }

    res.status(200).json({
      success: true,
      data: baseData
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération pour modification:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur technique',
      details: error.message
    });
  }
});

// Route pour sauvegarder les modifications d'une annonce
app.post('/api/partage/update-announcement', async (req, res) => {
  console.log('POST /api/partage/update-announcement appelé');
  
  try {
    const { editToken, data } = req.body;
    
    if (!editToken || !data) {
      return res.status(400).json({
        success: false,
        error: 'Token et données requis'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    // Trouver l'annonce pour détecter son type
    const records = await base(partageTableId).select({
      filterByFormula: `{edit_token} = '${editToken}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Annonce non trouvée'
      });
    }

    const recordId = records[0].id;
    const oldData = records[0].fields;
    const requestType = data.request_type || oldData.request_type || 'offer';

    // Validation des champs communs
    const commonRequiredFields = [
      'contact.firstName', 'contact.email', 
      'departure.country', 'departure.city',
      'arrival.country', 'arrival.city',
      'announcementText'
    ];

    for (const field of commonRequiredFields) {
      const fieldValue = field.split('.').reduce((obj, key) => obj?.[key], data);
      if (!fieldValue) {
        return res.status(400).json({
          success: false,
          error: `Champ manquant: ${field}`
        });
      }
    }

    // Validation spécifique selon le type
    if (requestType === 'search') {
      // Pour les demandes de place
      if (!data.volumeNeeded?.neededVolume || data.volumeNeeded.neededVolume <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Volume recherché doit être supérieur à 0'
        });
      }
      
      if (data.acceptsFees === null || data.acceptsFees === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Position sur la participation aux frais est requise'
        });
      }
    } else {
      // Pour les offres de place (type 'offer')
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
      
      if (!data.offerType) {
        return res.status(400).json({
          success: false,
          error: 'Type d\'offre est requis'
        });
      }
    }


    
    // Préparer les données communes
    const baseUpdatedFields = {
      contact_first_name: data.contact.firstName,
      contact_email: data.contact.email,
      contact_phone: data.contact.phone || '',
      departure_country: data.departure.country,
      departure_city: data.departure.city,
      departure_postal_code: data.departure.postalCode || '',
      arrival_country: data.arrival.country,
      arrival_city: data.arrival.city,
      arrival_postal_code: data.arrival.postalCode || '',
      announcement_text: data.announcementText,
      updated_at: new Date().toISOString()
    };

    // Ajouter les champs spécifiques selon le type
    let updatedFields;
    if (requestType === 'search') {
      // Pour les demandes de place
      updatedFields = {
        ...baseUpdatedFields,
        request_type: 'search',
        volume_needed: parseFloat(data.volumeNeeded.neededVolume),
        accepts_fees: data.acceptsFees,
        // Traitement des périodes d'expédition
        shipping_period_start: data.shippingPeriod?.[0] || '',
        shipping_period_end: data.shippingPeriod?.[data.shippingPeriod.length - 1] || '',
        shipping_period_formatted: data.shippingPeriod?.length > 0 
          ? `${data.shippingPeriod[0]} - ${data.shippingPeriod[data.shippingPeriod.length - 1]}`
          : 'Période flexible'
        // NOTE: Les champs container et offer restent inchangés (ne sont pas mis à jour)
      };
    } else {
      // Pour les offres de place
      updatedFields = {
        ...baseUpdatedFields,
        request_type: 'offer',
        shipping_date: data.shippingDate,
        container_type: data.container.type,
        container_available_volume: parseFloat(data.container.availableVolume),
        container_minimum_volume: parseFloat(data.container.minimumVolume || 0),
        offer_type: data.offerType
        // NOTE: Les champs search restent inchangés (ne sont pas mis à jour)
      };
    }

    // ✅ CORRECTION CRITIQUE: Recalculer expires_at quand les dates changent
    console.log('🔄 Recalcul de expires_at suite à modification...');
    
    if (requestType === 'search' && updatedFields.shipping_period_end) {
      // SEARCHES: lendemain du 1er jour du mois suivant shipping_period_end
      const endDate = new Date(updatedFields.shipping_period_end);
      const nextMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
      const dayAfter = new Date(nextMonth);
      dayAfter.setDate(dayAfter.getDate() + 1);
      updatedFields.expires_at = dayAfter.toISOString();
      
      console.log(`📅 Nouveau expires_at SEARCH: ${updatedFields.expires_at} (période: ${updatedFields.shipping_period_end})`);
    } else if (requestType === 'offer' && updatedFields.shipping_date) {
      // OFFERS: lendemain de shipping_date
      const shippingDate = new Date(updatedFields.shipping_date);
      const dayAfterShipping = new Date(shippingDate);
      dayAfterShipping.setDate(dayAfterShipping.getDate() + 1);
      updatedFields.expires_at = dayAfterShipping.toISOString();
      
      console.log(`📅 Nouveau expires_at OFFER: ${updatedFields.expires_at} (départ: ${updatedFields.shipping_date})`);
    } else {
      console.log('⚠️ Pas de recalcul expires_at nécessaire (dates inchangées)');
    }

    // Mettre à jour l'enregistrement
    const updatedRecord = await base(partageTableId).update(recordId, updatedFields);

    console.log('✅ Annonce modifiée:', {
      reference: oldData.reference,
      updatedFields: Object.keys(updatedFields)
    });

    // Envoyer un email de confirmation de modification
    try {
      const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
      const viewUrl = `${frontendUrl}/annonce/${oldData.reference}`;
      
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [data.contact.email],
        subject: '✏️ Annonce DodoPartage modifiée avec succès',
        headers: {
          'X-Entity-Ref-ID': `dodopartage-modified-${oldData.reference}`
        },
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Annonce modifiée - DodoPartage</title>
        </head>
        <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
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
                Modifications enregistrées ✏️
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
                Votre annonce <strong>${oldData.reference}</strong> a été mise à jour avec succès.
              </p>
              
              <!-- Message de confirmation -->
              <div style="border-left: 4px solid #3b82f6; background-color: #eff6ff; padding: 20px; margin: 30px 0;">
                <div style="display: flex; align-items: center;">
                  <span style="font-size: 20px; margin-right: 12px;">✏️</span>
                  <div>
                    <h3 style="color: #1d4ed8; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                      Annonce mise à jour
                    </h3>
                    <p style="color: #1e40af; font-size: 14px; margin: 0; line-height: 1.4;">
                      Vos modifications sont maintenant visibles sur la plateforme
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Bouton pour voir l'annonce -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${viewUrl}" 
                   style="display: inline-block; background-color: #F47D6C; color: white; padding: 16px 32px; 
                          text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  🔍 Voir mon annonce mise à jour
                </a>
              </div>
              
              <!-- Informations utiles -->
              <div style="text-align: center; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 13px; margin: 0;">
                  💡 Les utilisateurs verront immédiatement vos modifications
                </p>
              </div>
              
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="${generateUTMUrl('https://dodomove.fr', 'modified', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
              </p>
            </div>
            
          </div>
        </body>
        </html>
        `,
      });

      if (!emailError) {
        console.log('✅ Email de confirmation de modification envoyé:', emailData.id);
      }
    } catch (emailError) {
      console.error('❌ Erreur email confirmation modification:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Annonce modifiée avec succès',
      data: {
        reference: oldData.reference,
        updatedAt: updatedFields.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la modification:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la modification',
      details: error.message
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
      contactPhone,
      message,
      announcementDetails,
      timestamp,
      source,
      skipSenderCc // Nouveau paramètre pour désactiver le cc automatique
    } = req.body;

    console.log('📬 Nouvelle demande de contact:', {
      announcementId,
      contactName,
      contactEmail,
      contactPhone: contactPhone ? '[FOURNI]' : '[NON FOURNI]',
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
    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    console.log('🔍 Recherche de l\'annonce dans:', partageTableId);

    let announcementRecord = null;
    try {
      announcementRecord = await base(partageTableId).find(announcementId);
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
    const requestType = announcementRecord.fields.request_type;

    // Générer l'URL WhatsApp si un numéro est fourni
    const whatsappUrl = generateWhatsAppUrl(contactPhone, requestType, announcementRecord.fields, contactName);
    const hasWhatsApp = !!whatsappUrl;

    // Générer l'URL Email avec le même message personnalisé que WhatsApp
    const emailUrl = generateEmailUrl(contactEmail, requestType, announcementRecord.fields, contactName, reference);

    // Enregistrer le contact dans Airtable (table des contacts)
    let contactRecordId = null;
    try {
      console.log('💾 Enregistrement du contact dans Airtable...');
      
      // Utiliser l'ID de table (plus robuste que le nom)
      const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
      
      const contactData = {
        fields: {
          'announcement_reference': reference,
          'created_at': new Date().toISOString(),
          'ad_type': requestType === 'search' ? 'search' : 'offer', // Type d'annonce
          'status': 'new', // Statut initial ('new' → 'read' → 'replied')
          'requester_name': contactName,
          'requester_email': contactEmail,
          'requester_phone': contactPhone || '',
          'requester_message': message,
          'requested_volume': 0, // Volume par défaut (à ajuster si disponible)
          'forwarded_to_owner': true, // Email envoyé au propriétaire
          'forwarded_at': new Date().toISOString(),
          'has_whatsapp': hasWhatsApp,
          'whatsapp_url': whatsappUrl || '',
          'email_sent': false, // Sera mis à jour après envoi
          'email_opened': false,
          'whatsapp_clicked': false,
          'response_method': 'none', // Aucune réponse pour l'instant
          'contact_source': 'dodo-partage-frontend'
        }
      };

      const contactRecords = await base(contactsTableId).create([contactData]);
      contactRecordId = contactRecords[0].id;
      
      console.log('✅ Contact enregistré:', contactRecordId);
      
    } catch (airtableError) {
      console.error('❌ Erreur enregistrement contact:', airtableError);
      // On continue même si l'enregistrement échoue
    }

    // Envoyer l'email à l'auteur de l'annonce
    try {
      console.log('📧 Envoi de l\'email de contact...');
      
      const emailConfig = {
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [authorEmail],
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
                  ${contactPhone ? `<br><strong>Téléphone :</strong> ${contactPhone}` : ''}
                </p>
              </div>
              
              <!-- Boutons de réponse -->
              <div style="text-align: center; margin: 40px 0;">
                ${hasWhatsApp ? `
                <!-- Bouton WhatsApp (prioritaire avec tracking automatique) -->
                <a href="${process.env.BACKEND_URL || 'https://web-production-7b738.up.railway.app'}/api/partage/track-owner-whatsapp/${contactRecordId}?whatsappUrl=${encodeURIComponent(whatsappUrl)}" 
                   style="display: inline-block; background-color: #25D366; color: white; padding: 16px 32px; 
                          text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; 
                          box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); margin: 0 8px 10px 0; min-width: 180px; text-align: center;">
                  <img src="https://www.dodomove.fr/wp-content/uploads/2025/07/whatsapp-white-icon-1.png" 
                       width="20" height="20" 
                       alt="WhatsApp" 
                       style="vertical-align: middle; margin-right: 8px; border: none; display: inline-block;" />
                  Répondre par WhatsApp
                </a>
                <br style="display: block; margin: 8px 0;">
                ` : ''}
                
                <!-- Bouton Email (avec tracking automatique et message personnalisé) -->
                <a href="${process.env.BACKEND_URL || 'https://web-production-7b738.up.railway.app'}/api/partage/track-owner-email/${contactRecordId}?emailUrl=${encodeURIComponent(emailUrl)}" 
                   style="display: inline-block; background-color: #F17A69; color: white; padding: 16px 32px; 
                          text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; 
                          box-shadow: 0 4px 12px rgba(241, 122, 105, 0.3); margin: 0 8px 10px 0; min-width: 180px; text-align: center;">
                   📧 Répondre par email
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
                <a href="${generateUTMUrl('https://dodomove.fr', 'contact', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
              </p>
            </div>
            
          </div>
        </body>
        </html>
        `,
      };

      // Ajouter cc seulement si skipSenderCc n'est pas true
      if (!skipSenderCc) {
        emailConfig.cc = [contactEmail];
        console.log('📧 Copie (cc) envoyée à l\'expéditeur:', contactEmail);
      } else {
        console.log('🚫 Copie (cc) désactivée par skipSenderCc');
      }

      const { data: emailData, error: emailError } = await resend.emails.send(emailConfig);

      if (emailError) {
        console.error('❌ Erreur email:', emailError);
        throw new Error('Erreur lors de l\'envoi de l\'email');
      } else {
        console.log('✅ Email de contact envoyé avec succès:', emailData.id);
        
        // Mettre à jour le record contact pour marquer l'email comme envoyé
        if (contactRecordId) {
          try {
            const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
            await base(contactsTableId).update(contactRecordId, {
              'email_sent': true,
              'status': 'read' // Auto-progression : 'new' → 'read' quand email envoyé
            });
            console.log('✅ Statut email_sent et status mis à jour pour:', contactRecordId);
          } catch (updateError) {
            console.error('❌ Erreur mise à jour statut email:', updateError);
          }
        }
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
        hasWhatsApp,
        whatsappUrl: hasWhatsApp ? whatsappUrl : null,
        contactName,
        contactEmail,
        contactPhone: contactPhone || null,
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

// Route de test pour mail-tester.com (score délivrabilité)
app.get('/test-mail-tester', async (req, res) => {
  console.log('GET /test-mail-tester appelé pour tester la délivrabilité');
  
  try {
    const testEmail = req.query.email || 'test-9lbwa5zcm@srv1.mail-tester.com';
    
    // Données de test réalistes
    const testData = {
      contact: {
        firstName: 'TestUser',
        email: testEmail
      },
      departure: {
        displayName: 'France (Paris)'
      },
      arrival: {
        displayName: 'Martinique (Fort-de-France)'
      }
    };
    
    const testValidationToken = 'mail-tester-' + Date.now();
    const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
    const validationUrl = `${frontendUrl}/validating/${testValidationToken}`;
    
    console.log('📧 Envoi vers mail-tester.com:', testEmail);
    
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DodoPartage <hello@dodomove.fr>',
      to: [testEmail],
      subject: 'Confirmez votre annonce DodoPartage',
      headers: {
        'X-Entity-Ref-ID': `dodopartage-mail-tester-${testValidationToken}`
      },
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
              Bonjour ${testData.contact.firstName} 👋
            </h2>
            
            <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
              Votre annonce de groupage <strong>${testData.departureLocation} → ${testData.arrivalLocation}</strong> 
              a bien été reçue !
            </p>
            
            <!-- Message d'urgence minimaliste -->
            <div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 20px; margin: 30px 0;">
              <div style="display: flex; align-items: center;">
                <span style="font-size: 20px; margin-right: 12px;">⚠️</span>
                <div>
                  <h3 style="color: #92400e; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                    Confirmation requise
                  </h3>
                  <p style="color: #b45309; font-size: 14px; margin: 0; line-height: 1.4;">
                    Votre annonce sera visible après validation de votre email
                  </p>
                </div>
              </div>
            </div>
            
                         <!-- Bouton CTA minimaliste -->
             <div style="text-align: center; margin: 32px 0;">
               <a href="${validationUrl}" 
                  style="display: inline-block; background-color: #F47D6C; color: white; padding: 14px 28px; 
                         text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">
                 Confirmer mon email
               </a>
             </div>
            
            <!-- Explications simplifiées -->
            <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 30px 0;">
              <h4 style="color: #374151; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">
                Après confirmation :
              </h4>
              
              <div style="space-y: 8px;">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                  <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                  <span style="color: #4b5563; font-size: 14px;">Votre annonce devient visible</span>
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                  <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                  <span style="color: #4b5563; font-size: 14px;">Vous recevez les demandes par email</span>
                </div>
                <div style="display: flex; align-items: center;">
                  <span style="color: #10b981; margin-right: 10px; font-size: 14px;">✓</span>
                  <span style="color: #4b5563; font-size: 14px;">Vous organisez votre groupage</span>
                </div>
              </div>
            </div>
            
            <!-- Informations expiration -->
            <div style="text-align: center; margin: 24px 0;">
              <p style="color: #6b7280; font-size: 13px; margin: 0;">
                ⏰ Lien valide 7 jours
              </p>
            </div>
            

          </div>
          
          <!-- Footer simple -->
          <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              © 2024 DodoPartage - Une initiative 
              <a href="${generateUTMUrl('https://dodomove.fr', 'test-email', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
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
      console.error('❌ Erreur email test:', emailError);
      return res.status(500).json({ 
        success: false, 
        error: emailError.message 
      });
    }

    console.log('✅ Email mail-tester envoyé avec succès:', emailData.id);
    
    res.status(200).json({
      success: true,
      message: `Email de test délivrabilité envoyé à ${testEmail}`,
      emailId: emailData.id,
      testToken: testValidationToken,
      mailTesterUrl: 'https://www.mail-tester.com',
      instructions: 'Retournez sur mail-tester.com et cliquez sur "Ensuite, vérifiez votre score"'
    });

  } catch (error) {
    console.error('❌ Erreur lors du test email:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du test',
      details: error.message
    });
  }
});

// Route de test pour développeur (email personnel)
app.get('/test-email-validation', async (req, res) => {
  console.log('GET /test-email-validation appelé');
  
  try {
    const testValidationToken = 'dev-test-' + Date.now();
    const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
    
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DodoPartage <hello@dodomove.fr>',
      to: ['bost.analytics@gmail.com'],
      subject: '🚨 [DEV TEST] Confirmez votre annonce DodoPartage',
      headers: {
        'X-Entity-Ref-ID': `dodopartage-dev-test-${testValidationToken}`
      },
      html: `<h1>Test développeur DodoPartage</h1><p>Email de validation fonctionnel !</p>`
    });

    if (emailError) {
      throw emailError;
    }

    res.status(200).json({
      success: true,
      message: 'Email de dev test envoyé à bost.analytics@gmail.com',
      emailId: emailData.id
    });

  } catch (error) {
    console.error('❌ Erreur test dev:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route de test pour email d'alerte matching (notifications@dodomove.fr)
app.get('/test-mail-tester-alert', async (req, res) => {
  console.log('GET /test-mail-tester-alert appelé pour tester email d\'alerte');
  
  try {
    const testEmail = req.query.email || 'test-9lbwa5zcm@srv1.mail-tester.com';
    const deleteToken = 'test-alert-' + Date.now();
    const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage';
    
    console.log('📧 Envoi alerte mail-tester vers:', testEmail);
    
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DodoPartage <notifications@dodomove.fr>',
      to: [testEmail],
      subject: 'Nouvelle annonce trouvée : Paris → Martinique',
      headers: {
        'X-Entity-Ref-ID': `dodopartage-alert-test-${deleteToken}`,
        'List-Unsubscribe': `<${frontendUrl}/supprimer-alerte/${deleteToken}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nouvelle annonce DodoPartage</title>
      </head>
      <body style="font-family: 'Inter', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #243163 0%, #1e2951 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; font-size: 28px; margin: 0; font-weight: 700;">
              🚢 DodoPartage
            </h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
              Groupage collaboratif DOM-TOM
            </p>
          </div>

          <!-- Contenu principal -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">
              🔔 Nouvelle annonce trouvée !
            </h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Une nouvelle annonce correspond à votre recherche :
            </p>

            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <h3 style="color: #243163; font-size: 18px; margin: 0 0 10px 0;">
                📍 Trajet : Paris → Martinique
              </h3>
              <p style="color: #6b7280; margin: 5px 0;">
                <strong>Type :</strong> Recherche de place dans un conteneur
              </p>
              <p style="color: #6b7280; margin: 5px 0;">
                <strong>Volume :</strong> 5m³ disponible
              </p>
              <p style="color: #6b7280; margin: 5px 0;">
                <strong>Date :</strong> Février 2024
              </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://www.dodomove.fr/partage/" 
                 style="display: inline-block; background: #243163; color: white; padding: 16px 32px; 
                        text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
                📱 Voir l'annonce
              </a>
            </div>

            <div style="text-align: center; margin: 20px 0;">
              <a href="${frontendUrl}/supprimer-alerte/${deleteToken}" 
                 style="color: #9ca3af; font-size: 14px; text-decoration: underline;">
                🗑️ Me désabonner de cette alerte
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              © 2024 DodoPartage - Une initiative Dodomove
            </p>
          </div>
        </div>
      </body>
      </html>
      `
    });

    if (emailError) {
      throw emailError;
    }

    console.log('✅ Email alerte mail-tester envoyé:', emailData.id);
    
    res.status(200).json({
      success: true,
      message: `Email d'alerte test envoyé à ${testEmail}`,
      emailId: emailData.id,
      emailType: 'Alert Matching (notifications@dodomove.fr)',
      headers: ['X-Entity-Ref-ID', 'List-Unsubscribe', 'List-Unsubscribe-Post'],
      mailTesterUrl: 'https://www.mail-tester.com',
      instructions: 'Retournez sur mail-tester.com pour voir le score de l\'email d\'alerte'
    });

  } catch (error) {
    console.error('❌ Erreur test alerte:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour ajouter des tokens aux annonces existantes (temporaire pour migration)
app.post('/api/partage/add-missing-tokens', async (req, res) => {
  console.log('POST /api/partage/add-missing-tokens appelé');
  
  try {
    const { action } = req.body;
    
    if (action !== 'add_tokens_to_existing') {
      return res.status(400).json({
        success: false,
        error: 'Action non autorisée'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    console.log('🔍 Recherche des annonces sans tokens...');
    
    // Récupérer toutes les annonces publiées sans tokens
    const records = await base(partageTableId).select({
      filterByFormula: 'AND({status} = "published", OR(NOT({edit_token}), NOT({delete_token})))',
      maxRecords: 50
    }).firstPage();

    console.log(`📋 Trouvé ${records.length} annonce(s) sans tokens complets`);
    
    if (records.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Toutes les annonces ont déjà leurs tokens',
        updated: 0
      });
    }

    const updates = [];
    
    for (const record of records) {
      const fields = record.fields;
      
      // Générer de nouveaux tokens s'ils manquent
      const editToken = fields.edit_token || ('edit_retro_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15));
      const deleteToken = fields.delete_token || ('del_retro_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15));
      
      console.log(`🔧 Ajout tokens pour ${fields.reference}:`);
      console.log(`   Edit: ${editToken.substring(0, 25)}...`);
      console.log(`   Delete: ${deleteToken.substring(0, 25)}...`);
      
      // Mettre à jour l'enregistrement
      await base(partageTableId).update(record.id, {
        edit_token: editToken,
        delete_token: deleteToken
      });
      
      updates.push({
        id: record.id,
        reference: fields.reference,
        editToken,
        deleteToken
      });
      
      // Petite pause pour éviter de surcharger l'API Airtable
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ ${updates.length} annonce(s) mise(s) à jour avec succès`);
    
    res.status(200).json({
      success: true,
      message: `${updates.length} annonce(s) mise(s) à jour avec des tokens`,
      updated: updates.length,
      details: updates.map(u => ({
        reference: u.reference,
        hasTokens: true
      }))
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout des tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'ajout des tokens',
      details: error.message
    });
  }
});

// Route pour créer une alerte email
app.post('/api/partage/create-alert', async (req, res) => {
  console.log('POST /api/partage/create-alert appelé');
  console.log('Body reçu:', req.body);
  
  try {
    const { type, departure, arrival, volume_min, email } = req.body;

    // Validation des données requises
    if (!type || !departure || !arrival || volume_min === undefined || !email) {
      console.error('❌ Données manquantes:', { type, departure, arrival, volume_min, email });
      return res.status(400).json({
        success: false,
        error: 'Données manquantes. Requis: type, departure, arrival, volume_min, email'
      });
    }

    // Validation du type
    if (type !== 'offer' && type !== 'request') {
      console.error('❌ Type invalide:', type);
      return res.status(400).json({
        success: false,
        error: 'Type invalide. Doit être "offer" ou "request"'
      });
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('❌ Email invalide:', email);
      return res.status(400).json({
        success: false,
        error: 'Format d\'email invalide'
      });
    }

    // Validation du volume minimum
    if (typeof volume_min !== 'number' || volume_min <= 0) {
      console.error('❌ Volume minimum invalide:', volume_min);
      return res.status(400).json({
        success: false,
        error: 'Volume minimum doit être un nombre positif'
      });
    }

    // Générer un token unique pour la suppression
    const deleteToken = 'del_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15);
    
    // Générer un ID d'alerte unique
    const alertId = 'ALERT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8).toUpperCase();

    const emailAlertTableId = process.env.AIRTABLE_EMAIL_ALERT_TABLE_ID || 'tblVuVneCZTot07sB';
    
    console.log('📝 Création de l\'alerte email dans Airtable...');
    
    // Créer l'enregistrement dans Airtable
    const alertRecord = await base(emailAlertTableId).create([
      {
        fields: {
          "email": email,
          "type": type, // 'offer' ou 'request'
          "departure": departure,
          "arrival": arrival,
          "volume_min": volume_min,
          "status": 'active',
          "delete_token": deleteToken
        }
      }
    ]);

    console.log('✅ Alerte créée avec succès:', alertId);

    // Optionnel : Envoyer un email de confirmation
    try {
      const typeLabel = type === 'offer' ? 'personnes qui proposent de la place' : 'personnes qui cherchent de la place';
      const volumeLabel = volume_min === 1 ? 'peu importe' : `${volume_min}m³ minimum`;
      
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [email],
        subject: 'Alerte DodoPartage créée avec succès',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Alerte DodoPartage créée</title>
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
                🔔 Alerte créée avec succès !
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
                Vous serez maintenant notifié(e) dès qu'une nouvelle opportunité correspondra à vos critères.
              </p>
              
              <!-- Bloc alerte avec le style cohérent -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 30px 0; border-left: 4px solid #F47D6C;">
                <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
                  🎯 Votre alerte pour :
                </h3>
                <div style="space-y: 8px;">
                  <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="color: #F47D6C; margin-right: 10px; font-size: 14px;">📦</span>
                    <span style="color: #4b5563; font-size: 14px;">Des <strong>${typeLabel}</strong></span>
                  </div>
                  <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="color: #F47D6C; margin-right: 10px; font-size: 14px;">🗺️</span>
                    <span style="color: #4b5563; font-size: 14px;">Depuis <strong>${departure}</strong> vers <strong>${arrival}</strong></span>
                  </div>
                  <div style="display: flex; align-items: center;">
                    <span style="color: #F47D6C; margin-right: 10px; font-size: 14px;">📏</span>
                    <span style="color: #4b5563; font-size: 14px;">Volume : <strong>${volumeLabel}</strong></span>
                  </div>
                </div>
              </div>
              
              <!-- Message info -->
              <div style="border-left: 4px solid #10b981; background-color: #ecfdf5; padding: 20px; margin: 30px 0;">
                <div style="display: flex; align-items: center;">
                  <span style="font-size: 20px; margin-right: 12px;">📧</span>
                  <div>
                    <h4 style="color: #065f46; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                      Notifications activées
                    </h4>
                    <p style="color: #047857; font-size: 14px; margin: 0; line-height: 1.4;">
                      Vous recevrez un email dès qu'une annonce correspondra à vos critères
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Bouton suppression avec le style cohérent -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${process.env.PARTAGE_APP_URL || 'https://www.dodomove.fr/partage'}/supprimer-alerte/${deleteToken}" 
                   style="display: inline-block; background-color: #6b7280; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                  Supprimer cette alerte
                </a>
              </div>
              
              <!-- Informations supplémentaires -->
              <div style="text-align: center; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 13px; margin: 0;">
                  💡 Vous pouvez supprimer cette alerte à tout moment
                </p>
              </div>

            </div>
            
            <!-- Footer simple -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="${generateUTMUrl('https://dodomove.fr', 'alert-created', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
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
        console.error('⚠️ Erreur email de confirmation (alerte créée quand même):', emailError);
      } else {
        console.log('📧 Email de confirmation envoyé:', emailData.id);
      }
    } catch (emailErr) {
      console.error('⚠️ Erreur lors de l\'envoi email de confirmation:', emailErr);
      // On continue même si l'email échoue
    }

    res.status(200).json({
      success: true,
      message: 'Alerte email créée avec succès !',
      data: {
        alertId: alertId,
        recordId: alertRecord[0].id,
        email: email,
        type: type,
        departure: departure,
        arrival: arrival,
        volume_min: volume_min,
        status: 'active',
        confirmationEmailSent: true,
        deleteToken: deleteToken
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'alerte:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création de l\'alerte',
      details: error.message
    });
  }
});

// Route pour supprimer une alerte (avec collecte de raison)
app.post('/api/partage/delete-alert', async (req, res) => {
  console.log('POST /api/partage/delete-alert appelé');
  console.log('Body reçu:', req.body);
  
  try {
    const { token, reason, customReason } = req.body;

    // Validation des données requises
    if (!token) {
      console.error('❌ Token manquant:', token);
      return res.status(400).json({
        success: false,
        error: 'Token de suppression manquant'
      });
    }

    // Validation de la raison
    const validReasons = ['found_solution', 'plans_changed', 'other', 'too_many_emails', 'not_relevant'];
    if (reason && !validReasons.includes(reason)) {
      console.error('❌ Raison invalide:', reason);
      return res.status(400).json({
        success: false,
        error: 'Raison de suppression invalide'
      });
    }

    const emailAlertTableId = process.env.AIRTABLE_EMAIL_ALERT_TABLE_ID || 'tblVuVneCZTot07sB';
    
    console.log('🔍 Recherche de l\'alerte avec le token...');
    
    // Chercher l'alerte par token
    const records = await base(emailAlertTableId).select({
      filterByFormula: `{delete_token} = '${token}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      console.error('❌ Aucune alerte trouvée avec ce token:', token);
      return res.status(404).json({
        success: false,
        error: 'Alerte non trouvée ou token invalide'
      });
    }

    const alertRecord = records[0];
    console.log('✅ Alerte trouvée:', alertRecord.fields.email);

    // VERSION TEMPORAIRE : Retour à l'ancien système en attendant les colonnes Airtable
    // TODO: Activer la nouvelle logique quand les colonnes delete_reason, delete_reason_other, deleted_at existent
    
    console.log('⚠️ Mode compatibilité: utilisation de l\'ancienne structure Airtable');
    
    // Préparer les données de mise à jour
    const updateData = {
      status: 'deleted',
      deleted_reason: reason || 'not_specified'
    };
    
    // Si la raison est "other" et qu'il y a un customReason, l'ajouter dans le champ séparé
    if (reason === 'other' && customReason) {
      updateData.delete_reason_other = customReason;
      console.log('📝 Raison personnalisée sauvegardée dans delete_reason_other:', customReason);
    }

    // Mettre à jour avec la structure correcte
    await base(emailAlertTableId).update(alertRecord.id, updateData);

    console.log('✅ Alerte supprimée avec succès');

    // Optionnel : Envoyer un email de confirmation de suppression
    try {
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: 'DodoPartage <hello@dodomove.fr>',
        to: [alertRecord.fields.email],
        subject: '🗑️ Alerte DodoPartage supprimée',
        headers: {
          'X-Entity-Ref-ID': `dodopartage-alert-deleted-${token}`
        },
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Alerte DodoPartage supprimée</title>
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
                🗑️ Alerte supprimée
              </h2>
              
              <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
                Votre alerte pour <strong>${alertRecord.fields.departure} → ${alertRecord.fields.arrival}</strong> 
                a été supprimée avec succès.
              </p>
              
              <!-- Message confirmation -->
              <div style="border-left: 4px solid #6b7280; background-color: #f9fafb; padding: 20px; margin: 30px 0;">
                <div style="display: flex; align-items: center;">
                  <span style="font-size: 20px; margin-right: 12px;">✅</span>
                  <div>
                    <h4 style="color: #374151; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                      Confirmation
                    </h4>
                    <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.4;">
                      Vous ne recevrez plus de notifications pour cette alerte
                    </p>
                  </div>
                </div>
              </div>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${generateUTMUrl(process.env.PARTAGE_APP_URL || 'https://www.dodomove.fr/partage', 'alert-deleted', 'return_button')}" 
                   style="display: inline-block; background-color: #F47D6C; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                  Retour à DodoPartage
                </a>
              </div>

            </div>
            
            <!-- Footer simple -->
            <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                © 2024 DodoPartage - Une initiative 
                <a href="${generateUTMUrl('https://dodomove.fr', 'alert-deleted', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
              </p>
            </div>
            
          </div>
        </body>
        </html>
        `,
      });

      if (emailError) {
        console.error('⚠️ Erreur email confirmation suppression:', emailError);
      } else {
        console.log('📧 Email de confirmation suppression envoyé:', emailData.id);
      }
    } catch (emailErr) {
      console.error('⚠️ Erreur lors de l\'envoi email confirmation:', emailErr);
      // On continue même si l'email échoue
    }

    res.status(200).json({
      success: true,
      message: 'Alerte supprimée avec succès',
      data: {
        email: alertRecord.fields.email,
        reason: reason || 'not_specified',
        customReason: customReason || null,
        savedToAirtable: updateData
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la suppression de l\'alerte:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la suppression de l\'alerte',
      details: error.message
    });
  }
});

// Route CRON pour expirer les annonces automatiquement
app.post('/api/cron/expire-announcements', async (req, res) => {
  console.log('POST /api/cron/expire-announcements appelé');
  
  const startTime = Date.now();
  
  try {
    // Vérification des variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      console.error('❌ Variables d\'environnement manquantes: AIRTABLE_API_KEY et AIRTABLE_BASE_ID');
      return res.status(500).json({
        success: false,
        error: 'Variables d\'environnement manquantes',
        message: 'Configuration Airtable manquante',
        duration: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    console.log('📋 Traitement d\'expiration pour la table:', partageTableId);

    // 1. Récupérer toutes les annonces publiées avec expires_at rempli ET dépassé
    console.log('🔍 Recherche des annonces expirées...');
    
    const now = new Date().toISOString();
    const expiredRecords = await base(partageTableId).select({
      filterByFormula: `AND({status} = 'published', {expires_at} != '', {expires_at} <= '${now}')`,
      fields: ['id', 'status', 'request_type', 'shipping_date', 'created_at', 'expires_at', 'contact_first_name', 'departure_country', 'arrival_country']
    }).all();

    console.log(`📊 ${expiredRecords.length} annonce(s) expirée(s) trouvée(s)`);

    if (expiredRecords.length === 0) {
      const duration = Date.now() - startTime;
      return res.status(200).json({
        success: true,
        message: 'Aucune annonce expirée à traiter',
        processed: 0,
        expired: 0,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Mettre à jour le statut des annonces expirées
    console.log('⏰ Mise à jour du statut vers "expired"...');
    
    const updatePromises = expiredRecords.map(async (record) => {
      try {
        await base(partageTableId).update(record.id, {
          status: 'expired',
          expired_at: new Date().toISOString()
        });
        
        console.log(`✅ Annonce ${record.fields.contact_first_name} (${record.fields.departure_country} → ${record.fields.arrival_country}) expirée`);
        
        return {
          id: record.id,
          success: true,
          name: record.fields.contact_first_name,
          route: `${record.fields.departure_country} → ${record.fields.arrival_country}`
        };
      } catch (error) {
        console.error(`❌ Erreur mise à jour annonce ${record.id}:`, error.message);
        return {
          id: record.id,
          success: false,
          error: error.message
        };
      }
    });

    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;

    console.log(`📊 Résultat: ${successCount} succès, ${errorCount} erreurs`);

    // 3. Statistiques finales
    const allPublishedRecords = await base(partageTableId).select({
      filterByFormula: `AND({status} = 'published')`,
      fields: ['id', 'request_type', 'shipping_date', 'created_at', 'expired_at']
    }).all();

    const stats = {
      total_published: allPublishedRecords.length,
      by_type: {
        offers: allPublishedRecords.filter(r => r.fields.request_type === 'offer').length,
        requests: allPublishedRecords.filter(r => r.fields.request_type === 'search').length
      }
    };

    const duration = Date.now() - startTime;

    res.status(200).json({
      success: true,
      message: `Expiration terminée: ${successCount} annonce(s) expirée(s)`,
      processed: expiredRecords.length,
      expired: successCount,
      errors: errorCount,
      remaining_published: stats.total_published,
      stats,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      details: results.filter(r => r.success).map(r => ({
        name: r.name,
        route: r.route
      }))
    });

  } catch (error) {
    console.error('❌ Erreur lors du processus d\'expiration:', error);
    
    const duration = Date.now() - startTime;
    res.status(500).json({
      success: false,
      error: 'Erreur lors du processus d\'expiration',
      message: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  }
});

// Route pour mettre à jour expires_at (migration)
app.post('/api/partage/update-expires-at', async (req, res) => {
  console.log('POST /api/partage/update-expires-at appelé');
  
  try {
    const { recordId, expiresAt, reason } = req.body;
    
    if (!recordId || !expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants: recordId et expiresAt requis'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    console.log(`🔄 Mise à jour expires_at pour ${recordId}: ${expiresAt}`);
    console.log(`📝 Raison: ${reason}`);

    // Mettre à jour l'enregistrement
    await base(partageTableId).update(recordId, {
      expires_at: expiresAt
    });

    console.log(`✅ Mise à jour réussie pour ${recordId}`);

    res.status(200).json({
      success: true,
      message: 'expires_at mis à jour avec succès',
      data: {
        recordId,
        expiresAt,
        reason
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour expires_at:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour',
      details: error.message
    });
  }
});

// ===================================
// 📧 ROUTES NOTIFICATIONS D'EXPIRATION  
// ===================================

// Route pour récupérer les annonces expirant bientôt (J-3)
app.get('/api/partage/get-expiring-soon', async (req, res) => {
  console.log('GET /api/partage/get-expiring-soon appelé');
  
  try {
    const { reminderDate } = req.query;
    
    if (!reminderDate) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre reminderDate requis (format YYYY-MM-DD)'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    console.log(`📅 Recherche d'annonces expirant le: ${reminderDate}`);

    // Construire les dates pour le filtre (début et fin de journée)
    const startDate = `${reminderDate}T00:00:00.000Z`;
    const endDate = `${reminderDate}T23:59:59.999Z`;

    // Récupérer les annonces qui expirent à cette date
    const expiringRecords = await base(partageTableId).select({
      filterByFormula: `AND(
        {status} = 'published',
        {expires_at} != '',
        {expires_at} >= '${startDate}',
        {expires_at} <= '${endDate}'
      )`,
      fields: [
        'id', 'reference', 'contact_first_name', 'contact_email', 'request_type',
        'departure_country', 'arrival_country', 'expires_at', 'edit_token', 'delete_token'
      ]
    }).all();

    console.log(`✅ ${expiringRecords.length} annonce(s) expirant le ${reminderDate}`);

    // Formater les données pour les scripts
    const announcements = expiringRecords.map(record => ({
      id: record.id,
      reference: record.fields.reference,
      contact_first_name: record.fields.contact_first_name,
      contact_email: record.fields.contact_email,
      request_type: record.fields.request_type,
      departure_country: record.fields.departure_country,
      arrival_country: record.fields.arrival_country,
      expires_at: record.fields.expires_at,
      edit_token: record.fields.edit_token,
      delete_token: record.fields.delete_token
    }));

    res.status(200).json({
      success: true,
      message: `${announcements.length} annonce(s) expirant le ${reminderDate}`,
      data: announcements,
      reminderDate,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des annonces expirant bientôt:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération',
      details: error.message
    });
  }
});

// Route pour envoyer un email de rappel avant expiration
app.post('/api/partage/send-expiration-reminder', async (req, res) => {
  console.log('POST /api/partage/send-expiration-reminder appelé');
  
  try {
    const { announcementId, reminderType } = req.body;
    
    if (!announcementId || !reminderType) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants: announcementId et reminderType requis'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    console.log(`📧 Envoi rappel ${reminderType} pour annonce: ${announcementId}`);

    // Récupérer les détails de l'annonce
    const record = await base(partageTableId).find(announcementId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Annonce introuvable'
      });
    }

    const announcement = record.fields;
    
    // Formater la date d'expiration
    const expiresAt = new Date(announcement.expires_at);
    const formattedDate = expiresAt.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });

    // Calculer les jours restants
    const now = new Date();
    const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    // URLs d'action
    const frontendUrl = process.env.DODO_PARTAGE_FRONTEND_URL || 'https://partage.dodomove.fr';
    const editUrl = `${frontendUrl}/modifier/${announcement.edit_token}`;
    const deleteUrl = `${frontendUrl}/supprimer/${announcement.delete_token}`;

    // Envoyer l'email de rappel
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DodoPartage <hello@dodomove.fr>',
      to: [announcement.contact_email],
      subject: `⚠️ Votre annonce DodoPartage expire dans ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}`,
      headers: {
        'X-Entity-Ref-ID': `dodopartage-expiring-${announcement.reference}`
      },
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rappel d'expiration - DodoPartage</title>
      </head>
      <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; font-family: 'Inter', sans-serif; font-size: 28px; margin: 0; font-weight: 700;">
              ⚠️ DodoPartage
            </h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
              Rappel d'expiration
            </p>
          </div>
          
          <!-- Contenu principal -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1e293b; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">
              Bonjour ${announcement.contact_first_name} 👋
            </h2>
            
            <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
              Votre annonce DodoPartage <strong>${announcement.reference}</strong> expire dans <strong>${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}</strong>.
            </p>
            
            <!-- Détails de l'annonce -->
            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 24px; margin: 30px 0;">
              <h3 style="color: #334155; font-size: 18px; margin: 0 0 16px 0; font-weight: 600;">
                📦 Votre annonce
              </h3>
              <div style="color: #64748b; font-size: 14px; line-height: 1.6;">
                <div style="margin-bottom: 8px;">
                  <strong>Type:</strong> ${announcement.request_type === 'offer' ? 'Propose de la place' : 'Cherche une place'}
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>Trajet:</strong> ${announcement.departure_country} → ${announcement.arrival_country}
                </div>
                <div>
                  <strong>Expire le:</strong> ${formattedDate}
                </div>
              </div>
            </div>
            
            <!-- Alerte -->
            <div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 20px; margin: 30px 0;">
              <div style="display: flex; align-items: center;">
                <span style="font-size: 20px; margin-right: 12px;">⚠️</span>
                <div>
                  <h3 style="color: #92400e; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                    Action requise
                  </h3>
                  <p style="color: #a16207; font-size: 14px; margin: 0; line-height: 1.4;">
                    Votre annonce sera automatiquement supprimée après expiration
                  </p>
                </div>
              </div>
            </div>
            
            <!-- Boutons d'action -->
            <div style="text-align: center; margin: 32px 0;">
              <a href="${editUrl}" 
                 style="display: inline-block; background-color: #3b82f6; color: white; padding: 16px 32px; 
                        text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 12px 8px;">
                ✏️ Modifier l'annonce
              </a>
              <br>
              <a href="${deleteUrl}" 
                 style="display: inline-block; background-color: #ef4444; color: white; padding: 14px 28px; 
                        text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; margin: 0 8px;">
                🗑️ Supprimer maintenant
              </a>
            </div>
            
            <!-- Informations utiles -->
            <div style="text-align: center; margin: 24px 0;">
              <p style="color: #6b7280; font-size: 13px; margin: 0;">
                💡 Vous pouvez modifier les dates pour prolonger votre annonce
              </p>
            </div>
            
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              © 2024 DodoPartage - Une initiative 
              <a href="${generateUTMUrl('https://dodomove.fr', 'expiration-reminder', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
            </p>
          </div>
          
        </div>
      </body>
      </html>
      `
    });

    if (emailError) {
      console.error('❌ Erreur envoi email rappel:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email',
        details: emailError.message
      });
    }

    console.log(`✅ Email de rappel envoyé avec succès à ${announcement.contact_email}`);

    res.status(200).json({
      success: true,
      message: 'Email de rappel envoyé avec succès',
      data: {
        announcementId,
        reference: announcement.reference,
        contactEmail: announcement.contact_email,
        daysRemaining,
        emailId: emailData.id
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du rappel:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du rappel',
      details: error.message
    });
  }
});

// Route pour récupérer les annonces récemment expirées (dernières 24h)
app.get('/api/partage/get-recently-expired', async (req, res) => {
  console.log('GET /api/partage/get-recently-expired appelé');
  
  try {
    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    // Calculer la date d'il y a 24 heures
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const cutoffDate = twentyFourHoursAgo.toISOString();

    console.log(`📅 Recherche d'annonces expirées depuis: ${cutoffDate}`);

    // Récupérer les annonces expirées dans les dernières 24h
    const expiredRecords = await base(partageTableId).select({
      filterByFormula: `AND(
        {status} = 'expired',
        {expired_at} != '',
        {expired_at} >= '${cutoffDate}'
      )`,
      fields: [
        'id', 'reference', 'contact_first_name', 'contact_email', 'request_type',
        'departure_country', 'arrival_country', 'expired_at'
      ]
    }).all();

    console.log(`✅ ${expiredRecords.length} annonce(s) récemment expirée(s)`);

    // Formater les données pour les scripts
    const announcements = expiredRecords.map(record => ({
      id: record.id,
      reference: record.fields.reference,
      contact_first_name: record.fields.contact_first_name,
      contact_email: record.fields.contact_email,
      request_type: record.fields.request_type,
      departure_country: record.fields.departure_country,
      arrival_country: record.fields.arrival_country,
      expired_at: record.fields.expired_at
    }));

    res.status(200).json({
      success: true,
      message: `${announcements.length} annonce(s) récemment expirée(s)`,
      data: announcements,
      cutoffDate,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des annonces récemment expirées:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération',
      details: error.message
    });
  }
});

// Route pour vérifier et envoyer les notifications d'alertes pour une annonce
app.post('/api/partage/check-alert-matches', async (req, res) => {
  console.log('POST /api/partage/check-alert-matches appelé');
  
  try {
    const { announcementId } = req.body;
    
    if (!announcementId) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre announcementId requis'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    console.log(`🔍 Vérification des alertes pour l'annonce: ${announcementId}`);

    // Récupérer les détails de l'annonce
    const record = await base(partageTableId).find(announcementId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Annonce introuvable'
      });
    }

    const announcement = record.fields;
    
    // Vérifier et envoyer les notifications d'alertes
    const alertResult = await checkAndSendAlertNotifications(announcement);
    
    res.status(200).json({
      success: true,
      message: 'Vérification des alertes terminée',
      data: {
        announcementId,
        reference: announcement.reference,
        alertResult
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la vérification des alertes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification',
      details: error.message
    });
  }
});

// Route pour envoyer un email de notification post-expiration
app.post('/api/partage/send-post-expiration-notification', async (req, res) => {
  console.log('POST /api/partage/send-post-expiration-notification appelé');
  
  try {
    const { announcementId, expiredAt } = req.body;
    
    if (!announcementId) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre announcementId requis'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    console.log(`📧 Envoi notification post-expiration pour: ${announcementId}`);

    // Récupérer les détails de l'annonce
    const record = await base(partageTableId).find(announcementId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Annonce introuvable'
      });
    }

    const announcement = record.fields;
    
    // Formater la date d'expiration
    const expiredDate = new Date(expiredAt || announcement.expired_at);
    const formattedDate = expiredDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });

    // Message d'expiration générique (plus de logique complexe de raison)
    const reasonMessage = announcement.request_type === 'offer' 
      ? 'La date de départ de votre conteneur est passée.'
      : 'La durée de validité de votre recherche s\'est écoulée.';

    // URLs pour créer une nouvelle annonce - redirige vers dodomove.fr/partage avec popup ouverte
    const createNewUrl = 'https://dodomove.fr/partage/?modal=open';

    // Envoyer l'email de notification
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DodoPartage <hello@dodomove.fr>',
      to: [announcement.contact_email],
      subject: '📅 Votre annonce DodoPartage a expiré',
      headers: {
        'X-Entity-Ref-ID': `dodopartage-expired-${announcement.reference}`
      },
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Annonce expirée - DodoPartage</title>
      </head>
      <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; font-family: 'Inter', sans-serif; font-size: 28px; margin: 0; font-weight: 700;">
              📅 DodoPartage
            </h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
              Notification d'expiration
            </p>
          </div>
          
          <!-- Contenu principal -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1e293b; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">
              Bonjour ${announcement.contact_first_name} 👋
            </h2>
            
            <p style="color: #475569; font-size: 16px; margin: 0 0 20px 0;">
              Votre annonce DodoPartage <strong>${announcement.reference}</strong> a expiré le ${formattedDate}.
            </p>
            
            <!-- Détails de l'annonce expirée -->
            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 24px; margin: 30px 0;">
              <h3 style="color: #334155; font-size: 18px; margin: 0 0 16px 0; font-weight: 600;">
                📦 Annonce expirée
              </h3>
              <div style="color: #64748b; font-size: 14px; line-height: 1.6;">
                <div style="margin-bottom: 8px;">
                  <strong>Type:</strong> ${announcement.request_type === 'offer' ? 'Propose de la place' : 'Cherche une place'}
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>Trajet:</strong> ${announcement.departure_country} → ${announcement.arrival_country}
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>Expirée le:</strong> ${formattedDate}
                </div>
                <div>
                  <strong>Raison:</strong> ${reasonMessage}
                </div>
              </div>
            </div>
            
            <!-- Information -->
            <div style="border-left: 4px solid #6b7280; background-color: #f8fafc; padding: 20px; margin: 30px 0;">
              <div style="display: flex; align-items: center;">
                <span style="font-size: 20px; margin-right: 12px;">ℹ️</span>
                <div>
                  <h3 style="color: #374151; font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">
                    Votre annonce n'est plus visible
                  </h3>
                  <p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.4;">
                    Elle a été automatiquement retirée de la plateforme pour maintenir la fraîcheur des offres
                  </p>
                </div>
              </div>
            </div>
            
            <!-- Encouragement nouvelle annonce -->
            <div style="text-align: center; margin: 32px 0;">
              <h3 style="color: #1e293b; font-size: 20px; margin: 0 0 16px 0; font-weight: 600;">
                🚀 Nouveau projet de groupage ?
              </h3>
              <p style="color: #475569; font-size: 16px; margin: 0 0 24px 0;">
                Publiez une nouvelle annonce en quelques minutes
              </p>
              <a href="${generateUTMUrl(createNewUrl, 'post-expiration', 'create_new_button')}" 
                 style="display: inline-block; background-color: #F47D6C; color: white; padding: 16px 32px; 
                        text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                ✨ Créer une nouvelle annonce
              </a>
            </div>
            
            <!-- Merci -->
            <div style="text-align: center; margin: 24px 0;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                Merci d'avoir utilisé DodoPartage pour votre groupage ! 🙏
              </p>
            </div>
            
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              © 2024 DodoPartage - Une initiative 
              <a href="${generateUTMUrl('https://dodomove.fr', 'post-expiration', 'footer')}" style="color: #243163; text-decoration: none;">Dodomove</a>
            </p>
          </div>
          
        </div>
      </body>
      </html>
      `
    });

    if (emailError) {
      console.error('❌ Erreur envoi email post-expiration:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email',
        details: emailError.message
      });
    }

    console.log(`✅ Email post-expiration envoyé avec succès à ${announcement.contact_email}`);

    res.status(200).json({
      success: true,
      message: 'Email post-expiration envoyé avec succès',
      data: {
        announcementId,
        reference: announcement.reference,
        contactEmail: announcement.contact_email,
        expiredAt: expiredDate.toISOString(),
        emailId: emailData.id
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de la notification post-expiration:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi de la notification',
      details: error.message
    });
  }
});

// ===================================
// 📊 ROUTES DE TRACKING CONTACT LOGS  
// ===================================

// Route pour tracker l'ouverture d'email (pixel de tracking)
app.get('/api/partage/track-email-open/:contactId', async (req, res) => {
  console.log('GET /api/partage/track-email-open appelé pour:', req.params.contactId);
  
  try {
    const { contactId } = req.params;
    
    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID requis'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
    
    console.log(`📧 Marquage email ouvert pour contact: ${contactId}`);

    // Mettre à jour le statut du contact
    await base(contactsTableId).update(contactId, {
      'status': 'read',
      'email_opened': true
    });

    console.log(`✅ Email marqué comme ouvert pour: ${contactId}`);

    // Retourner un pixel transparent 1x1
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Pixel transparent 1x1 PNG en base64
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.send(pixel);

  } catch (error) {
    console.error('❌ Erreur lors du tracking d\'ouverture email:', error);
    
    // Même en cas d'erreur, on retourne un pixel pour ne pas casser l'email
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.send(pixel);
  }
});

// Route pour tracker le clic sur WhatsApp
app.get('/api/partage/track-whatsapp-click/:contactId', async (req, res) => {
  console.log('GET /api/partage/track-whatsapp-click appelé pour:', req.params.contactId);
  
  try {
    const { contactId } = req.params;
    const { whatsappUrl } = req.query;
    
    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID requis'
      });
    }

    if (!whatsappUrl) {
      return res.status(400).json({
        success: false,
        error: 'URL WhatsApp requise'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
    
    console.log(`📱 Marquage clic WhatsApp pour contact: ${contactId}`);

    // Mettre à jour le statut du contact
    await base(contactsTableId).update(contactId, {
      'whatsapp_clicked': true,
      'response_method': 'whatsapp' // L'utilisateur a privilégié WhatsApp
    });

    console.log(`✅ Clic WhatsApp tracké pour: ${contactId}`);

    // Rediriger vers WhatsApp
    res.redirect(decodeURIComponent(whatsappUrl));

  } catch (error) {
    console.error('❌ Erreur lors du tracking de clic WhatsApp:', error);
    
    // En cas d'erreur, rediriger quand même vers WhatsApp
    if (req.query.whatsappUrl) {
      res.redirect(decodeURIComponent(req.query.whatsappUrl));
    } else {
      res.status(500).json({
        success: false,
        error: 'Erreur lors du tracking WhatsApp',
        details: error.message
      });
    }
  }
});

// Route pour marquer un contact comme ayant reçu une réponse
app.post('/api/partage/mark-replied/:contactId', async (req, res) => {
  console.log('POST /api/partage/mark-replied appelé pour:', req.params.contactId);
  
  try {
    const { contactId } = req.params;
    const { responseMethod } = req.body;
    
    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID requis'
      });
    }

    // Valider la méthode de réponse
    const validMethods = ['email', 'whatsapp', 'none'];
    if (responseMethod && !validMethods.includes(responseMethod)) {
      return res.status(400).json({
        success: false,
        error: 'Méthode de réponse invalide. Doit être: email, whatsapp, none'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
    
    console.log(`💬 Marquage réponse pour contact: ${contactId}`);

    // Préparer les données de mise à jour
    const updateData = {
      'status': 'replied'
    };

    // Ajouter la méthode de réponse si fournie
    if (responseMethod) {
      updateData['response_method'] = responseMethod;
    }

    // Mettre à jour le statut du contact
    const updatedRecord = await base(contactsTableId).update(contactId, updateData);

    console.log(`✅ Contact marqué comme ayant reçu une réponse: ${contactId}`);

    res.status(200).json({
      success: true,
      message: 'Contact marqué comme ayant reçu une réponse',
      data: {
        contactId,
        status: 'replied',
        responseMethod: responseMethod || null,
        updatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors du marquage de réponse:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du marquage de réponse',
      details: error.message
    });
  }
});

// Route de tracking pour les actions du propriétaire (WhatsApp)
app.get('/api/partage/track-owner-whatsapp/:contactId', async (req, res) => {
  console.log('GET /api/partage/track-owner-whatsapp appelé');
  
  try {
    const { contactId } = req.params;
    const { whatsappUrl } = req.query;
    
    if (!contactId || !whatsappUrl) {
      return res.status(400).json({
        success: false,
        error: 'contactId et whatsappUrl requis'
      });
    }
    
    console.log('📱 Tracking action proprietaire WhatsApp pour contact:', contactId);
    
    // Mettre à jour le contact dans Airtable (tracking automatique)
    try {
      const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
      
      await base(contactsTableId).update(contactId, {
        'response_method': 'whatsapp', // Auto-tracking: propriétaire utilise WhatsApp
        'status': 'replied' // Auto-progression vers "replied"
      });
      
      console.log('✅ Action propriétaire WhatsApp trackée avec auto-progression');
      
    } catch (airtableError) {
      console.error('❌ Erreur tracking action proprietaire WhatsApp:', airtableError);
      // Continue pour ne pas bloquer la redirection
    }
    
    // Rediriger vers WhatsApp
    res.redirect(decodeURIComponent(whatsappUrl));
    
  } catch (error) {
    console.error('❌ Erreur lors du tracking action proprietaire WhatsApp:', error);
    // En cas d'erreur, rediriger quand même
    const { whatsappUrl } = req.query;
    if (whatsappUrl) {
      res.redirect(decodeURIComponent(whatsappUrl));
    } else {
      res.status(500).json({
        success: false,
        error: 'Erreur lors du tracking'
      });
    }
  }
});

// Route de tracking pour les actions du propriétaire (Email)
app.get('/api/partage/track-owner-email/:contactId', async (req, res) => {
  console.log('GET /api/partage/track-owner-email appelé');
  
  try {
    const { contactId } = req.params;
    const { emailUrl } = req.query;
    
    if (!contactId || !emailUrl) {
      return res.status(400).json({
        success: false,
        error: 'contactId et emailUrl requis'
      });
    }
    
    console.log('📧 Tracking action proprietaire Email pour contact:', contactId);
    
    // Mettre à jour le contact dans Airtable (tracking automatique)
    try {
      const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
      
      await base(contactsTableId).update(contactId, {
        'response_method': 'email', // Auto-tracking: propriétaire utilise email
        'status': 'replied' // Auto-progression vers "replied"
      });
      
      console.log('✅ Action propriétaire Email trackée avec auto-progression');
      
    } catch (airtableError) {
      console.error('❌ Erreur tracking action proprietaire Email:', airtableError);
      // Continue pour ne pas bloquer la redirection
    }
    
    // Rediriger vers l'email
    res.redirect(decodeURIComponent(emailUrl));
    
  } catch (error) {
    console.error('❌ Erreur lors du tracking action proprietaire Email:', error);
    // En cas d'erreur, rediriger quand même
    const { emailUrl } = req.query;
    if (emailUrl) {
      res.redirect(decodeURIComponent(emailUrl));
    } else {
      res.status(500).json({
        success: false,
        error: 'Erreur lors du tracking'
      });
    }
  }
});

// ========================================
// ENDPOINT RAPPEL VALIDATION ANNONCES
// ========================================

// Endpoint pour envoyer les rappels de validation (à appeler via cron job)
app.post('/api/partage/send-validation-reminders', async (req, res) => {
  console.log('POST /api/partage/send-validation-reminders appelé');
  
  try {
    // Utiliser la table DodoPartage
    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    // Calculer la date limite (24h ago)
    const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
    const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();
    
    console.log('🕐 Recherche des annonces créées avant:', twentyFourHoursAgoISO);
    
    // Rechercher les annonces qui :
    // 1. Sont en status 'pending' (pas encore validées)
    // 2. Ont été créées il y a plus de 24h
    // 3. N'ont pas encore reçu de rappel (reminder_sent != true)
    const pendingRecords = await base(partageTableId).select({
      filterByFormula: `
        AND(
          {status} = 'pending',
          DATETIME_DIFF(NOW(), {created_at}, 'hours') >= 24,
          OR(
            {reminder_sent} != TRUE(),
            {reminder_sent} = BLANK()
          )
        )
      `,
      fields: [
        'reference', 'created_at', 'status', 'contact_email', 'contact_first_name',
        'validation_token', 'departure_city', 'departure_country', 
        'arrival_city', 'arrival_country', 'request_type', 'reminder_sent'
      ]
    }).all();
    
    console.log(`📋 ${pendingRecords.length} annonce(s) en attente de rappel trouvée(s)`);
    
    if (pendingRecords.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucune annonce nécessitant un rappel',
        remindersSent: 0
      });
    }
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    // Traiter chaque annonce une par une
    for (const record of pendingRecords) {
      const announcement = record.fields;
      
      console.log(`📧 Traitement rappel pour: ${announcement.contact_email} (${announcement.reference})`);
      
      try {
        // Envoyer l'email de rappel
        const emailResult = await sendValidationReminderEmail(record);
        
        if (emailResult.success) {
          // Marquer le rappel comme envoyé dans Airtable
          try {
            await base(partageTableId).update([{
              id: record.id,
              fields: {
                reminder_sent: true,
                reminder_sent_at: new Date().toISOString()
              }
            }]);
            
            console.log(`✅ Rappel envoyé et marqué pour: ${announcement.contact_email}`);
            successCount++;
            
            results.push({
              reference: announcement.reference,
              email: announcement.contact_email,
              status: 'success',
              emailId: emailResult.emailId
            });
            
          } catch (updateError) {
            console.error(`❌ Erreur mise à jour Airtable pour ${announcement.reference}:`, updateError);
            // On continue même si la mise à jour échoue
            results.push({
              reference: announcement.reference,
              email: announcement.contact_email,
              status: 'email_sent_update_failed',
              emailId: emailResult.emailId,
              error: updateError.message
            });
            successCount++; // L'email a bien été envoyé
          }
          
        } else {
          console.error(`❌ Erreur envoi email pour ${announcement.reference}:`, emailResult.error);
          errorCount++;
          
          results.push({
            reference: announcement.reference,
            email: announcement.contact_email,
            status: 'email_failed',
            error: emailResult.error
          });
        }
        
        // Attendre un peu entre chaque envoi pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Erreur traitement ${announcement.reference}:`, error);
        errorCount++;
        
        results.push({
          reference: announcement.reference,
          email: announcement.contact_email,
          status: 'processing_failed',
          error: error.message
        });
      }
    }
    
    console.log(`✅ Rappels terminés: ${successCount} succès, ${errorCount} erreurs`);
    
    res.status(200).json({
      success: true,
      message: `Rappels de validation traités`,
      remindersSent: successCount,
      errors: errorCount,
      totalProcessed: pendingRecords.length,
      details: results
    });
    
  } catch (error) {
    console.error('❌ Erreur lors du traitement des rappels:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement des rappels',
      message: error.message
    });
  }
});

// Endpoint pour tester un rappel sur une annonce spécifique
app.post('/api/partage/test-reminder', async (req, res) => {
  console.log('POST /api/partage/test-reminder appelé');
  
  try {
    const { reference } = req.body;
    
    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Référence d\'annonce requise'
      });
    }
    
    // Rechercher l'annonce par référence
    const partageTableId = process.env.AIRTABLE_PARTAGE_TABLE_ID || 'tbleQhqlXzWrzToit';
    
    const records = await base(partageTableId).select({
      filterByFormula: `{reference} = '${reference}'`,
      maxRecords: 1
    }).firstPage();
    
    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Annonce non trouvée'
      });
    }
    
    const record = records[0];
    const announcement = record.fields;
    
    console.log(`🧪 Test rappel pour: ${announcement.contact_email} (${reference})`);
    
    // Envoyer l'email de rappel
    const emailResult = await sendValidationReminderEmail(record);
    
    if (emailResult.success) {
      console.log(`✅ Email de test envoyé à: ${announcement.contact_email}`);
      
      res.status(200).json({
        success: true,
        message: 'Email de rappel test envoyé avec succès',
        details: {
          reference: reference,
          email: announcement.contact_email,
          emailId: emailResult.emailId,
          status: announcement.status
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi du rappel test',
        details: emailResult.error
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test de rappel:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du test de rappel',
      message: error.message
    });
  }
});

// Route pour obtenir les statistiques de tracking d'un contact
app.get('/api/partage/contact-stats/:contactId', async (req, res) => {
  console.log('GET /api/partage/contact-stats appelé pour:', req.params.contactId);
  
  try {
    const { contactId } = req.params;
    
    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID requis'
      });
    }

    // Vérifier les variables d'environnement
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Airtable manquante'
      });
    }

    const contactsTableId = process.env.AIRTABLE_CONTACTS_TABLE_ID || 'tblBZrRkcc1cdTlcZ';
    
    console.log(`📊 Récupération stats pour contact: ${contactId}`);

    // Récupérer les données du contact
    const record = await base(contactsTableId).find(contactId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Contact introuvable'
      });
    }

    const fields = record.fields;
    
    // Formater les statistiques
    const stats = {
      contactId,
      status: fields.status || 'new',
      emailSent: fields.email_sent || false,
      emailOpened: fields.email_opened || false,
      hasWhatsApp: fields.has_whatsapp || false,
      whatsappClicked: fields.whatsapp_clicked || false,
      responseMethod: fields.response_method || 'none',
      contactSource: fields.contact_source || 'unknown',
      createdAt: fields.created_at,
      forwardedAt: fields.forwarded_at,
      requesterName: fields.requester_name,
      requesterEmail: fields.requester_email,
      requesterPhone: fields.requester_phone || null
    };

    console.log(`✅ Stats récupérées pour: ${contactId}`);

    res.status(200).json({
      success: true,
      message: 'Statistiques du contact récupérées',
      data: stats
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des stats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques',
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
  console.log('- POST /api/partage/submit-search-request (DodoPartage)');  console.log('- GET /api/partage/test (DodoPartage)');
  console.log('- GET /api/partage/get-announcements (DodoPartage)');
  console.log('- GET /api/partage/validate-announcement (DodoPartage)');
  console.log('- GET /api/partage/edit-form/:token (DodoPartage)');
  console.log('- POST /api/partage/update-announcement (DodoPartage)');
  console.log('- GET /api/partage/delete-form/:token (DodoPartage)');
  console.log('- POST /api/partage/confirm-deletion (DodoPartage)');
  console.log('- POST /api/partage/contact-announcement (DodoPartage)');
  console.log('- POST /api/partage/add-missing-tokens (DodoPartage - Migration)');
  console.log('- POST /api/partage/create-alert (DodoPartage - Alertes)');
  console.log('- POST /api/partage/delete-alert (DodoPartage - Alertes)');
  console.log('- POST /api/cron/expire-announcements (DodoPartage - Expiration)');
  console.log('- POST /api/partage/update-expires-at (DodoPartage - Migration)');
  console.log('- GET /api/partage/get-expiring-soon (DodoPartage - Notifications)');
  console.log('- POST /api/partage/send-expiration-reminder (DodoPartage - Notifications)');
  console.log('- GET /api/partage/get-recently-expired (DodoPartage - Notifications)');
  console.log('- POST /api/partage/send-post-expiration-notification (DodoPartage - Notifications)');
  console.log('- POST /api/partage/check-alert-matches (DodoPartage - Alertes Automatiques)');
  console.log('- GET /test-email-validation (Test email)');
  console.log('- GET /api/partage/track-email-open/:contactId (Tracking - Email ouvert)');
  console.log('- GET /api/partage/track-whatsapp-click/:contactId (Tracking - Clic WhatsApp)');
  console.log('- POST /api/partage/mark-replied/:contactId (Tracking - Marquer répondu)');
  console.log('- GET /api/partage/contact-stats/:contactId (Tracking - Statistiques contact)');
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
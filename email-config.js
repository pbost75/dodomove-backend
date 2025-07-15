// Configuration globale pour améliorer la délivrabilité des emails DodoPartage
// Créé pour résoudre les problèmes de délivrabilité (emails en spam)

const EMAIL_CONFIG = {
  // Adresses d'envoi améliorées (plus de noreply!)
  FROM_ADDRESSES: {
    DODOPARTAGE_MAIN: 'DodoPartage <hello@dodomove.fr>',
    DODOPARTAGE_NOTIFICATIONS: 'DodoPartage <notifications@dodomove.fr>', 
    DODOMOVE_MAIN: 'Dodomove <hello@dodomove.fr>',
    DODOMOVE_SUPPORT: 'Dodomove Support <support@dodomove.fr>'
  },

  // Domaines et URLs
  FRONTEND_URLS: {
    DODOPARTAGE: process.env.DODO_PARTAGE_FRONTEND_URL || 'https://www.dodomove.fr/partage',
    DODOMOVE: process.env.DODOMOVE_FRONTEND_URL || 'https://www.dodomove.fr'
  }
};

// Fonction helper pour générer des headers de délivrabilité optimaux
function generateDeliverabilityHeaders(emailType, referenceId, frontendUrl = EMAIL_CONFIG.FRONTEND_URLS.DODOPARTAGE) {
  const headers = {
    'X-Entity-Ref-ID': `dodopartage-${emailType}-${referenceId}`,
    'X-Mailer': 'DodoPartage-System-v1.0'
  };

  // Ajouter List-Unsubscribe seulement pour les emails marketing/notifications
  if (['alert', 'notification', 'marketing'].includes(emailType)) {
    headers['List-Unsubscribe'] = `<${frontendUrl}/supprimer-alerte/${referenceId}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  return headers;
}

// Configuration d'envoi standardisée selon le type d'email
function getEmailConfig(emailType, data = {}) {
  const configs = {
    // Email de validation d'annonce
    validation: {
      from: EMAIL_CONFIG.FROM_ADDRESSES.DODOPARTAGE_MAIN,
      subject: 'Confirmez votre annonce DodoPartage',
      headers: generateDeliverabilityHeaders('validation', data.validationToken)
    },

    // Email de contact/mise en relation
    contact: {
      from: EMAIL_CONFIG.FROM_ADDRESSES.DODOPARTAGE_MAIN,
      subject: `Nouveau contact pour votre annonce DodoPartage`,
      headers: generateDeliverabilityHeaders('contact', data.contactId),
      replyTo: data.contactEmail // Important: permettre la réponse directe
    },

    // Email d'alerte/notification
    alert: {
      from: EMAIL_CONFIG.FROM_ADDRESSES.DODOPARTAGE_NOTIFICATIONS,
      subject: `Nouvelle annonce trouvée : ${data.trajet || 'Votre recherche'}`,
      headers: generateDeliverabilityHeaders('alert', data.alertId)
    },

    // Email de confirmation d'alerte
    alertConfirmation: {
      from: EMAIL_CONFIG.FROM_ADDRESSES.DODOPARTAGE_MAIN,
      subject: 'Alerte DodoPartage créée avec succès',
      headers: generateDeliverabilityHeaders('alert-confirmation', data.alertId)
    },

    // Email d'estimation de volume (Dodomove)
    volumeEstimation: {
      from: EMAIL_CONFIG.FROM_ADDRESSES.DODOMOVE_MAIN,
      subject: 'Estimation de votre volume de déménagement',
      headers: generateDeliverabilityHeaders('volume', data.estimationId, EMAIL_CONFIG.FRONTEND_URLS.DODOMOVE)
    }
  };

  return configs[emailType] || configs.validation;
}

// Mots à éviter dans les sujets (triggers spam)
const SPAM_TRIGGER_WORDS = [
  'URGENT', 'GRATUIT', 'PROMOTION', 'OFFRE LIMITÉE', 
  'CLIQUEZ ICI', 'FÉLICITATIONS', 'GAGNANT'
];

// Validation du contenu pour éviter le spam
function validateEmailContent(subject, content) {
  const issues = [];

  // Vérifier les mots spam dans le sujet
  const subjectUpper = subject.toUpperCase();
  SPAM_TRIGGER_WORDS.forEach(word => {
    if (subjectUpper.includes(word)) {
      issues.push(`Mot potentiellement spam détecté dans le sujet: "${word}"`);
    }
  });

  // Vérifier la longueur du sujet
  if (subject.length > 50) {
    issues.push('Sujet trop long (>50 caractères)');
  }

  // Vérifier les emojis excessifs
  const emojiCount = (subject.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
  if (emojiCount > 2) {
    issues.push(`Trop d'emojis dans le sujet (${emojiCount})`);
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

// Guide de configuration DNS pour une délivrabilité optimale
const DNS_REQUIREMENTS = {
  SPF: 'v=spf1 include:_spf.google.com include:sendgrid.net ~all',
  DMARC: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@dodomove.fr',
  DKIM: 'Configuré automatiquement par Resend pour dodomove.fr'
};

module.exports = {
  EMAIL_CONFIG,
  getEmailConfig,
  generateDeliverabilityHeaders,
  validateEmailContent,
  SPAM_TRIGGER_WORDS,
  DNS_REQUIREMENTS
}; 
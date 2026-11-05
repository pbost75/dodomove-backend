// Emails du circuit partenaires (lot 2).
// Textes provisoires : ils seront repris au lot 3 avec le guide de ton
// (kompasio/dodomove/site-web/emails/TON.md côté Pierre). Seul ce fichier change alors.

const NAVY = '#243163';
const CORAL = '#F47D6C';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEuros(amount) {
  return `${Number(amount).toLocaleString("fr-FR")}\u00a0€\u00a0HT`;
}

// Gabarit commun : une colonne de 560 px, tableaux pour Outlook
function layout({ preheader, title, body }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;">
<tr><td style="padding:28px 28px 8px 28px;font-family:Georgia,'Roboto Slab',serif;font-size:22px;line-height:1.3;color:${NAVY};font-weight:bold;">${escapeHtml(title)}</td></tr>
<tr><td style="padding:8px 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#333333;">${body}</td></tr>
</table>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888;margin:16px 0 0 0;">Dodomove, service de Kompasio SAS · RCS Saint-Pierre 999 521 982</p>
</td></tr></table>
</body></html>`;
}

// Salutation au prénom du contact (fiche partenaire), jamais au nom de l'entreprise
function greeting(firstName) {
  return firstName ? `Bonjour ${escapeHtml(firstName)},` : 'Bonjour,';
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="background:${CORAL};border-radius:6px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function rows(pairs) {
  const lines = pairs
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#777777;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#222222;">${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:14px;border-top:1px solid #eeeeee;margin:12px 0;">${lines}</table>`;
}

function summaryRows(summary) {
  return rows([
    ['Départ', summary.departure],
    ['Arrivée', summary.arrival],
    ['Date', summary.date],
    ['Enlèvement', summary.pickup],
    ['Livraison', summary.delivery],
    ['Motif', summary.reason],
    ['Volume', summary.volume],
    ['Objets', summary.description],
    ['Véhicules', summary.vehicles],
  ]);
}

function priceLine(offer) {
  if (offer.free) {
    return `Cette demande fait partie de vos demandes offertes (il vous en reste ${offer.freeRemaining}). Elle ne vous sera pas facturée.`;
  }
  return `Prix du déblocage : <strong>${escapeHtml(formatEuros(offer.amount))}</strong> (${escapeHtml(offer.categoryLabel)}), sur votre facture mensuelle.`;
}

// 1. Au partenaire : nouvelle demande, sans coordonnées
function newRequestEmail({ contactFirstName, summary, offer, recipientsCount, unlockUrl, expiresLabel }) {
  const others = recipientsCount > 1
    ? `Cette demande a été transmise à ${recipientsCount} professionnels, vous compris.`
    : 'Vous êtes le seul professionnel à recevoir cette demande.';
  const body = `<p>${greeting(contactFirstName)}</p>
<p>Un particulier cherche un transporteur pour le projet ci-dessous. Ses coordonnées s'affichent quand vous débloquez la demande.</p>
${summaryRows(summary)}
<p>${priceLine(offer)}</p>
<p>${escapeHtml(others)}</p>
${button(unlockUrl, 'Débloquer cette demande')}
<p style="font-size:13px;color:#777777;">Le bouton ouvre une page de confirmation : rien n'est débloqué ni facturé avant que vous confirmiez. Lien valable jusqu'au ${escapeHtml(expiresLabel)}.</p>`;
  return {
    subject: `Nouvelle demande : ${summary.routeShort}`,
    html: layout({ preheader: `${summary.routeShort}, ${summary.volume || summary.vehicles || ''}`, title: 'Nouvelle demande de devis', body }),
  };
}

// 2. Au partenaire : demande débloquée, coordonnées complètes (sa preuve)
function unlockedEmail({ contactFirstName, summary, contact, offer, reference, unlockUrl }) {
  const billing = offer.free
    ? 'Demande offerte, non facturée.'
    : `${formatEuros(offer.amount)} sur votre facture mensuelle.`;
  const body = `<p>${greeting(contactFirstName)}</p>
<p>Vous avez débloqué la demande ${escapeHtml(reference)}. Merci de contacter ce particulier sous 24 heures ouvrées, en vous présentant de la part de Dodomove et en citant cette référence : nous la lui avons annoncée.</p>
${rows([
    ['Nom', contact.name],
    ['Téléphone', contact.phone],
    ['Email', contact.email],
    ['Adresse de départ', contact.departureStreet],
    ['Adresse d\'arrivée', contact.arrivalStreet],
    ['Message', contact.comment],
  ])}
${summaryRows(summary)}
<p>${escapeHtml(billing)}</p>
<p style="font-size:13px;color:#777777;">Vous pouvez revoir la demande ici : <a href="${escapeHtml(unlockUrl)}" style="color:${NAVY};">${escapeHtml(unlockUrl)}</a></p>`;
  return {
    subject: `Demande débloquée ${reference} : ${contact.name}`,
    html: layout({ preheader: `${contact.name}, ${contact.phone}`, title: 'Demande débloquée', body }),
  };
}

// Emails au particulier. Ton : site-web/emails/TON.md côté Pierre (rassurant, concret, vouvoiement)

function steps(items) {
  const lines = items.map((text, i) => `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:#FDECE9;color:${CORAL};font-weight:bold;font-size:13px;text-align:center;">${i + 1}</span></td><td style="padding:6px 0;color:#333333;">${text}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;margin:8px 0 4px 0;">${lines}</table>`;
}

function subtitle(text) {
  return `<p style="font-family:Georgia,'Roboto Slab',serif;font-size:17px;font-weight:bold;color:${NAVY};margin:24px 0 4px 0;">${escapeHtml(text)}</p>`;
}

function requestRows(summary, reference) {
  return rows([
    ['Trajet', summary.routeShort],
    ['Date', summary.date],
    ['Volume', summary.volume],
    ['Véhicules', summary.vehicles],
    ['Référence', reference],
  ]);
}

function carriersLabel(count) {
  return count > 1 ? `${count} transporteurs` : 'un transporteur';
}

// 3. Au particulier, dès l'envoi aux transporteurs : demande reçue et transmise
function requestSentEmail({ firstName, summary, reference, carriersCount, requestUrl }) {
  const body = `<p>Bonjour ${escapeHtml(firstName)},</p>
<p>Votre demande de devis ${escapeHtml(summary.routeShort)} est bien enregistrée. Nous venons de la transmettre à <strong>${carriersLabel(carriersCount)}</strong> qui couvre${carriersCount > 1 ? 'nt' : ''} votre trajet. Jamais plus de trois : vous ne serez pas submergé d'appels.</p>
${subtitle('Ce qui va se passer')}
${steps([
    'Chaque transporteur étudie votre projet. Dès que l\'un d\'eux s\'engage à vous faire un devis, nous vous envoyons son nom par email.',
    `Il vous contacte par téléphone ou par email dans les trois jours, en citant votre demande Dodomove ${escapeHtml(reference)}.`,
    'Vous comparez les devis et choisissez librement. Notre service est gratuit et sans engagement.',
  ])}
${subtitle('En attendant')}
<p style="margin:4px 0;">Décrochez aux numéros que vous ne connaissez pas ces prochains jours : l'appel peut venir de métropole comme d'outre-mer. Sans nouvelles, jetez un œil à vos courriers indésirables.</p>
${requestRows(summary, reference)}
${button(requestUrl, 'Suivre ma demande')}
<p style="font-size:13px;color:#777777;">Une question, une erreur dans votre demande ? Répondez simplement à cet email.</p>`;
  return {
    subject: `Votre demande de devis ${summary.routeShort} est transmise`,
    html: layout({ preheader: `${carriersLabel(carriersCount)} vous contacte${carriersCount > 1 ? 'nt' : ''} dans les trois jours, jamais plus de trois.`, title: 'Votre demande est transmise', body }),
  };
}

// 4. Au particulier, à chaque déblocage : un transporteur va le contacter (décision D13)
function customerNotifiedEmail({ firstName, partnerName, summary, reference, requestUrl }) {
  const body = `<p>Bonjour ${escapeHtml(firstName)},</p>
<p><strong>${escapeHtml(partnerName)}</strong> a étudié votre projet ${escapeHtml(summary.routeShort)} et va vous contacter pour vous proposer un devis, par téléphone ou par email, dans les prochaines 24 heures ouvrées.</p>
<p>Pour le reconnaître : il se présentera de la part de Dodomove et citera votre demande ${escapeHtml(reference)}.</p>
${subtitle('Pour comparer les devis')}
<p style="margin:4px 0 8px 0;">Demandez à chaque transporteur, pour pouvoir comparer :</p>
${steps([
    'le volume qu\'il a retenu, et comment il l\'a estimé ;',
    'livraison jusqu\'à votre porte ou retrait au port ;',
    'ce que couvre l\'assurance, et pour quelle valeur ;',
    'ce qui n\'est pas compris : taxes à l\'arrivée, stockage, frais d\'attente au chargement.',
  ])}
${button(requestUrl, 'Suivre ma demande')}
<p style="font-size:13px;color:#777777;">Pas de nouvelles de ${escapeHtml(partnerName)} d'ici deux jours ouvrés ? Répondez à cet email, nous nous en occupons.</p>`;
  return {
    subject: `${partnerName} va vous contacter pour votre devis`,
    html: layout({ preheader: `Il citera votre demande Dodomove ${reference}.`, title: 'Un transporteur va vous contacter', body }),
  };
}

// 5. Au particulier : aucun transporteur partenaire sur ce trajet pour l'instant
function noCarrierEmail({ firstName, summary, reference }) {
  const body = `<p>Bonjour ${escapeHtml(firstName)},</p>
<p>Merci pour votre demande de devis ${escapeHtml(summary.routeShort)}. Nous préférons vous le dire tout de suite : aucun de nos transporteurs partenaires ne couvre encore ce trajet ou ces prestations. Votre demande n'a donc été transmise à personne, et personne ne vous appellera de notre part.</p>
<p>Nous la gardons de côté : si un transporteur vérifié couvre bientôt votre trajet, nous vous écrirons avant de la lui transmettre.</p>
${requestRows(summary, reference)}
<p style="font-size:13px;color:#777777;">Vous préférez que nous supprimions votre demande ? Répondez simplement à cet email.</p>`;
  return {
    subject: `Votre demande ${summary.routeShort} : pas encore de transporteur sur ce trajet`,
    html: layout({ preheader: 'Votre demande n\'a été transmise à personne. Nous vous expliquons.', title: 'Pas encore de transporteur sur ce trajet', body }),
  };
}

// 6. Interne : aucun partenaire éligible, ou envoi en échec
function adminAlertEmail({ title, reference, details }) {
  const body = `<p>Demande ${escapeHtml(reference)}.</p><p>${escapeHtml(details)}</p>`;
  return {
    subject: `[Dodomove] ${title} : ${reference}`,
    html: layout({ preheader: title, title, body }),
  };
}

module.exports = {
  escapeHtml,
  newRequestEmail,
  unlockedEmail,
  requestSentEmail,
  customerNotifiedEmail,
  noCarrierEmail,
  adminAlertEmail,
};

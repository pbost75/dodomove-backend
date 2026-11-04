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
function newRequestEmail({ partnerName, summary, offer, recipientsCount, unlockUrl, expiresLabel }) {
  const others = recipientsCount > 1
    ? `Cette demande a été transmise à ${recipientsCount} professionnels, vous compris.`
    : 'Vous êtes le seul professionnel à recevoir cette demande.';
  const body = `<p>Bonjour ${escapeHtml(partnerName)},</p>
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
function unlockedEmail({ partnerName, summary, contact, offer, reference, unlockUrl }) {
  const billing = offer.free
    ? 'Demande offerte, non facturée.'
    : `${formatEuros(offer.amount)} sur votre facture mensuelle.`;
  const body = `<p>Bonjour ${escapeHtml(partnerName)},</p>
<p>Vous avez débloqué la demande ${escapeHtml(reference)}. Merci de contacter ce particulier sous 24 heures ouvrées.</p>
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
<p style="font-size:13px;color:#777777;">Doublon ou demande invalide ? Répondez à cet email sous 72 heures : elle ne vous sera pas facturée. Vous pouvez revoir la demande ici : <a href="${escapeHtml(unlockUrl)}" style="color:${NAVY};">${escapeHtml(unlockUrl)}</a></p>`;
  return {
    subject: `Demande débloquée ${reference} : ${contact.name}`,
    html: layout({ preheader: `${contact.name}, ${contact.phone}`, title: 'Demande débloquée', body }),
  };
}

// 3. Au particulier : un transporteur va le contacter (décision D13)
function customerNotifiedEmail({ firstName, partnerName, summary }) {
  const body = `<p>Bonjour ${escapeHtml(firstName)},</p>
<p><strong>${escapeHtml(partnerName)}</strong> a pris connaissance de votre projet ${escapeHtml(summary.routeShort)} et va vous contacter par téléphone ou par email pour vous proposer un devis.</p>
<p>Pensez à répondre aux numéros que vous ne connaissez pas ces prochains jours.</p>`;
  return {
    subject: `${partnerName} va vous contacter pour votre devis`,
    html: layout({ preheader: `${partnerName} va vous contacter`, title: 'Un transporteur va vous contacter', body }),
  };
}

// 4. Interne : aucun partenaire éligible, ou envoi en échec
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
  customerNotifiedEmail,
  adminAlertEmail,
};

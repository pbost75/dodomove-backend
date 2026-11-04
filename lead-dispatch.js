// Circuit partenaires (lot 2) : choix des partenaires, envoi des demandes sans
// coordonnées, déblocage confirmé et facturable.
// Règles : convention de partenariat Kompasio du 29/10/2026 et
// kompasio/dodomove/site-web/PLAN-funnel-deblocage.md (décisions D1, D5, D6, D10, D13).

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const emails = require('./lead-emails');

const REQUESTS_TABLE = 'tblic0CaPaaKZwouK';
const VEHICLES_TABLE = 'tblVffkJ0XQx5wB9L';
const PARTNERS_TABLE = process.env.AIRTABLE_PARTNERS_TABLE || 'Partenaires';
const DISPATCH_TABLE = process.env.AIRTABLE_DISPATCH_TABLE || 'Envois';

const MAX_PARTNERS_PER_REQUEST = 3;      // convention, art. 2
const LINK_VALIDITY_HOURS = 72;          // D6
const CONVENTION_VERSION = 'convention-2026-10-29';
const FUNNEL_URL = process.env.FUNNEL_URL || 'https://devis.dodomove.fr';
const ALERT_EMAIL = process.env.LEAD_ALERT_EMAIL || 'bost.analytics@gmail.com';
const SENDER = 'Dodomove <hello@dodomove.fr>';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

// Tarifs HT, convention art. 3.2
const CATEGORIES = {
  small: { amount: 10, label: 'moins de 10 m³ ou colis' },
  vehicle: { amount: 15, label: 'véhicule seul' },
  medium: { amount: 20, label: 'de 10 à 25 m³' },
  large: { amount: 30, label: 'plus de 25 m³' },
};

function dispatchEnabled() {
  return process.env.LEAD_DISPATCH_ENABLED === 'true';
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Volume retenu : calculateur, sinon saisi, sinon estimé d'après le logement
function requestVolume(fields) {
  if (fields.usedCalculator) {
    const fromCalculator = toNumber(fields.calculatedVolumeFromCalculator);
    if (fromCalculator) return fromCalculator;
  }
  return toNumber(fields.userEstimatedVolume) || toNumber(fields.calculatedVolume);
}

// D1 : demande mixte = le tarif le plus élevé ; 10 et 25 m³ pile = 20 €
function priceCategory(fields) {
  const options = [];
  if (fields.has_vehicles) options.push('vehicle');
  if (fields.has_personal_belongings) {
    const volume = requestVolume(fields);
    if (volume === null) options.push('medium');
    else if (volume < 10) options.push('small');
    else if (volume <= 25) options.push('medium');
    else options.push('large');
  }
  if (options.length === 0) options.push('medium');
  return options.reduce((best, key) => (CATEGORIES[key].amount > CATEGORIES[best].amount ? key : best));
}

function normalizePlace(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/^(la|l')\s*/, '').trim();
}

// Territoires d'outre-mer concernés par la demande (hors Métropole)
function requestTerritories(fields) {
  return [fields.departure_country, fields.arrival_country]
    .map(normalizePlace)
    .filter(place => place && place !== 'france' && place !== 'metropole');
}

function requestServices(fields) {
  const services = [];
  if (fields.has_personal_belongings) services.push('Effets personnels');
  if (fields.has_vehicles) services.push('Véhicules');
  return services;
}

// Seul un partenaire « prêt » dont l'annexe couvre le trajet et les prestations reçoit
function isEligible(partner, fields) {
  const p = partner.fields;
  if (p.statut !== 'prêt' || !p.email) return false;
  const routes = (p.trajets || []).map(normalizePlace);
  const covered = requestTerritories(fields).every(t => routes.includes(t));
  const services = p.prestations || [];
  const served = requestServices(fields).every(s => services.includes(s));
  return covered && served;
}

// Retire emails et numéros glissés dans un texte libre destiné au partenaire
function stripContactDetails(text) {
  return String(text || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[masqué]')
    .replace(/(\+?\d[\d .-]{7,}\d)/g, '[masqué]')
    .slice(0, 600);
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const HOUSING = { house: 'maison', apartment: 'appartement', office: 'bureau', other: 'autre' };
const VEHICLE_TYPES = { car: 'voiture', motorcycle: 'moto', scooter: 'scooter', quad: 'quad', boat: 'bateau', other: 'autre' };

function place(city, postalCode, country) {
  return [postalCode, city].filter(Boolean).join(' ') + (country ? ` (${country})` : '');
}

function handling(method, type, floor, elevator) {
  if (method === 'port') return 'au port';
  const parts = ['à domicile'];
  if (type) parts.push(HOUSING[type] || type);
  if (type === 'apartment' || floor) parts.push(`étage ${floor || 0}${elevator ? ', ascenseur' : ', sans ascenseur'}`);
  return parts.join(', ');
}

// Résumé sans nom, adresse, email ni téléphone : ville et code postal seulement
function buildSummary(fields, vehicles) {
  const date = fields.moving_is_flexible
    ? `entre le ${formatDate(fields.moving_start_date)} et le ${formatDate(fields.moving_end_date)}`
    : formatDate(fields.moving_exact_date);
  const volume = fields.has_personal_belongings
    ? (requestVolume(fields) ? `${requestVolume(fields)} m³${fields.usedCalculator ? ' (calculateur)' : ''}` : 'non précisé')
    : '';
  const vehicleText = (vehicles || [])
    .map(v => [VEHICLE_TYPES[v.type] || v.type, v.brand, v.model].filter(Boolean).join(' '))
    .join(', ');
  return {
    departure: place(fields.departure_city, fields.departure_postal_code, fields.departure_country),
    arrival: place(fields.arrival_city, fields.arrival_postal_code, fields.arrival_country),
    routeShort: `${fields.departure_city || fields.departure_country || '?'} → ${fields.arrival_city || fields.arrival_country || '?'}`,
    date,
    pickup: handling(fields.pickup_method, fields.pickup_housing_type, fields.pickup_housing_floor, fields.pickup_housing_has_elevator),
    delivery: handling(fields.delivery_method, fields.delivery_housing_type, fields.delivery_housing_floor, fields.delivery_housing_has_elevator),
    reason: fields.shipping_reason === 'purchase'
      ? 'achat'
      : fields.shipping_reason === 'moving'
        ? `déménagement${fields.tax_exemption_eligible ? ', éligible à l\'exonération de taxes' : ''}`
        : '',
    volume,
    description: stripContactDetails(fields.itemDetails_description),
    vehicles: vehicleText || (fields.has_vehicles ? `${fields.vehicles_count_total || 1} véhicule(s)` : ''),
  };
}

function offerFor(partner, categoryKey) {
  const freeRemaining = Math.max(0, Number(partner.fields.demandes_offertes_restantes ?? 5));
  const category = CATEGORIES[categoryKey];
  return {
    free: freeRemaining > 0,
    freeRemaining,
    amount: category.amount,
    categoryKey,
    categoryLabel: category.label,
  };
}

function expiresLabel(date) {
  return date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' (heure de Paris)';
}

function createLeadDispatch({ base, resend }) {
  async function sendEmail(to, { subject, html }, extra = {}) {
    const { error } = await resend.emails.send({ from: SENDER, to, subject, html, ...extra });
    if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  }

  async function alertAdmin(title, reference, details) {
    try {
      await sendEmail(ALERT_EMAIL, emails.adminAlertEmail({ title, reference, details }));
    } catch (error) {
      console.error('Alerte interne non envoyée:', error.message);
    }
  }

  async function loadVehicles(reference) {
    if (!/^DM-\d{6}-\d{3}$/.test(reference || '')) return [];
    const records = await base(VEHICLES_TABLE).select({ filterByFormula: `{reference} = '${reference}'` }).all();
    return records.map(r => r.fields);
  }

  // D5 : à plus de trois éligibles, ceux qui ont reçu le moins de demandes ce mois-ci
  async function sendsThisMonth() {
    const records = await base(DISPATCH_TABLE).select({
      filterByFormula: "IS_SAME({envoye_le}, TODAY(), 'month')",
      fields: ['partenaire'],
    }).all();
    const counts = {};
    records.forEach(r => (r.fields.partenaire || []).forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
    return counts;
  }

  // Appelé après l'enregistrement d'une demande. Ne lève jamais d'erreur.
  async function dispatchRequest(recordId, fields, vehicles) {
    const reference = fields.reference;
    if (!dispatchEnabled()) {
      console.log(`Envoi aux partenaires désactivé (LEAD_DISPATCH_ENABLED), demande ${reference} gardée dans Airtable`);
      return { sent: 0, disabled: true };
    }
    try {
      const partners = await base(PARTNERS_TABLE).select({ filterByFormula: "{statut} = 'prêt'" }).all();
      const eligible = partners.filter(p => isEligible(p, fields));

      if (eligible.length === 0) {
        await base(REQUESTS_TABLE).update(recordId, { status: 'Sans partenaire' }, { typecast: true });
        await alertAdmin('Aucun partenaire disponible', reference,
          `Trajet ${buildSummary(fields, vehicles).routeShort}, prestations : ${requestServices(fields).join(', ') || 'non précisées'}. La demande n'a été envoyée à personne.`);
        return { sent: 0 };
      }

      const counts = eligible.length > MAX_PARTNERS_PER_REQUEST ? await sendsThisMonth() : {};
      const chosen = eligible
        .map(p => ({ p, n: counts[p.id] || 0, r: Math.random() }))
        .sort((a, b) => a.n - b.n || a.r - b.r)
        .slice(0, MAX_PARTNERS_PER_REQUEST)
        .map(x => x.p);

      const summary = buildSummary(fields, vehicles);
      const categoryKey = priceCategory(fields);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + LINK_VALIDITY_HOURS * 3600 * 1000);
      let sent = 0;

      for (const partner of chosen) {
        const token = crypto.randomBytes(24).toString('base64url');
        const offer = offerFor(partner, categoryKey);
        const unlockUrl = `${FUNNEL_URL}/debloquer/${token}`;
        const [row] = await base(DISPATCH_TABLE).create([{ fields: {
          reference,
          demande_id: recordId,
          partenaire: [partner.id],
          email_partenaire: partner.fields.email,
          lien: token,
          statut: 'Envoyé',
          envoye_le: now.toISOString(),
          expire_le: expiresAt.toISOString(),
          categorie: CATEGORIES[categoryKey].label,
          montant_ht: CATEGORIES[categoryKey].amount,
          destinataires: chosen.length,
        } }], { typecast: true });
        try {
          await sendEmail(partner.fields.email, emails.newRequestEmail({
            partnerName: partner.fields.nom || '',
            summary,
            offer,
            recipientsCount: chosen.length,
            unlockUrl,
            expiresLabel: expiresLabel(expiresAt),
          }), { reply_to: ALERT_EMAIL });
          sent++;
        } catch (error) {
          await base(DISPATCH_TABLE).update(row.id, { statut: 'Échec d\'envoi' }, { typecast: true });
          await alertAdmin('Email partenaire non envoyé', reference, `${partner.fields.nom} : ${error.message}`);
        }
      }

      await base(REQUESTS_TABLE).update(recordId, { status: 'Transmitted' }, { typecast: true });
      return { sent };
    } catch (error) {
      console.error(`Envoi aux partenaires en échec pour ${reference}:`, error.message);
      await alertAdmin('Envoi aux partenaires en échec', reference, error.message);
      return { sent: 0, error: error.message };
    }
  }

  async function findDispatch(token) {
    if (!TOKEN_PATTERN.test(token || '')) return null;
    const [row] = await base(DISPATCH_TABLE).select({ filterByFormula: `{lien} = '${token}'`, maxRecords: 1 }).firstPage();
    return row || null;
  }

  function fullContact(fields) {
    const street = (number, streetName, postalCode, city) =>
      [[number, streetName].filter(Boolean).join(' '), [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return {
      name: [fields.contact_first_name, fields.contact_last_name].filter(Boolean).join(' '),
      firstName: fields.contact_first_name || '',
      phone: fields.contact_phone || '',
      email: fields.contact_email || '',
      departureStreet: street(fields.departure_number, fields.departure_street, fields.departure_postal_code, fields.departure_city),
      arrivalStreet: fields.arrival_unknown_exact_address
        ? 'adresse exacte pas encore connue'
        : street(fields.arrival_number, fields.arrival_street, fields.arrival_postal_code, fields.arrival_city),
      comment: fields.attached_note || '',
    };
  }

  // Ce que voit la page /debloquer : résumé seul, ou tout si déjà débloqué
  async function viewFor(dispatch) {
    const d = dispatch.fields;
    const [request, partner] = await Promise.all([
      base(REQUESTS_TABLE).find(d.demande_id),
      base(PARTNERS_TABLE).find((d.partenaire || [])[0]),
    ]);
    const vehicles = await loadVehicles(d.reference);
    const unlocked = d.statut === 'Débloqué';
    const offer = unlocked
      ? { free: !!d.offerte, freeRemaining: Number(partner.fields.demandes_offertes_restantes || 0), amount: d.montant_ht, categoryLabel: d.categorie }
      : offerFor(partner, priceCategory(request.fields));
    return {
      reference: d.reference,
      partnerName: partner.fields.nom || '',
      summary: buildSummary(request.fields, vehicles),
      offer: { free: offer.free, freeRemaining: offer.freeRemaining, amount: offer.amount, categoryLabel: offer.categoryLabel },
      recipientsCount: d.destinataires || 1,
      unlocked,
      unlockedAt: d.debloque_le || null,
      expired: !unlocked && d.expire_le && new Date(d.expire_le) < new Date(),
      expiresAt: d.expire_le || null,
      contact: unlocked ? fullContact(request.fields) : null,
      request,
      partner,
      vehicles,
    };
  }

  function publicView(view) {
    const { request, partner, vehicles, ...rest } = view;
    return rest;
  }

  const router = express.Router();
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

  router.get('/:token', async (req, res) => {
    try {
      const dispatch = await findDispatch(req.params.token);
      if (!dispatch) return res.status(404).json({ error: 'Lien inconnu' });
      // Ouvrir le lien ne débloque rien (les messageries ouvrent les liens toutes seules)
      res.json(publicView(await viewFor(dispatch)));
    } catch (error) {
      console.error('Lecture d\'un lien de déblocage en échec:', error.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // Deux confirmations simultanées sur le même lien : une seule passe
  const confirming = new Set();

  router.post('/:token/confirm', async (req, res) => {
    const { token } = req.params;
    if (confirming.has(token)) return res.status(429).json({ error: 'Confirmation déjà en cours' });
    confirming.add(token);
    try {
      const dispatch = await findDispatch(req.params.token);
      if (!dispatch) return res.status(404).json({ error: 'Lien inconnu' });
      const view = await viewFor(dispatch);

      // Second clic : on réaffiche, sans nouvelle facturation
      if (view.unlocked) return res.json(publicView(view));
      if (view.expired) return res.status(410).json({ error: 'Lien expiré', ...publicView(view) });
      if (dispatch.fields.statut !== 'Envoyé') return res.status(409).json({ error: 'Demande indisponible' });

      // Le montant affiché doit être celui qu'on facture
      const shown = req.body || {};
      if (Boolean(shown.free) !== view.offer.free || (!view.offer.free && Number(shown.amount) !== view.offer.amount)) {
        return res.status(409).json({ error: 'Le montant a changé, rechargez la page', ...publicView(view) });
      }

      const now = new Date();
      const proof = {
        confirme_le: now.toISOString(),
        ip: req.ip,
        navigateur: String(req.get('user-agent') || '').slice(0, 300),
        montant_affiche: view.offer.free ? 0 : view.offer.amount,
        offerte: view.offer.free,
        texte_affiche: String(shown.text || '').slice(0, 2000),
        convention: CONVENTION_VERSION,
      };
      await base(DISPATCH_TABLE).update(dispatch.id, {
        statut: 'Débloqué',
        debloque_le: now.toISOString(),
        offerte: view.offer.free,
        montant_ht: view.offer.free ? 0 : view.offer.amount,
        preuve: JSON.stringify(proof, null, 2),
      }, { typecast: true });
      if (view.offer.free) {
        await base(PARTNERS_TABLE).update(view.partner.id, { demandes_offertes_restantes: view.offer.freeRemaining - 1 });
      }

      const contact = fullContact(view.request.fields);
      const unlockUrl = `${FUNNEL_URL}/debloquer/${req.params.token}`;
      const offer = { ...view.offer, freeRemaining: view.offer.free ? view.offer.freeRemaining - 1 : view.offer.freeRemaining };
      await Promise.allSettled([
        sendEmail(view.partner.fields.email, emails.unlockedEmail({
          partnerName: view.partnerName, summary: view.summary, contact, offer, reference: view.reference, unlockUrl,
        }), { reply_to: ALERT_EMAIL }),
        contact.email && sendEmail(contact.email, emails.customerNotifiedEmail({
          firstName: contact.firstName, partnerName: view.partnerName, summary: view.summary,
        })),
      ]).then(results => results.forEach(r => r.status === 'rejected' && console.error('Email après déblocage:', r.reason?.message)));

      res.json(publicView({ ...view, unlocked: true, unlockedAt: now.toISOString(), offer, contact }));
    } catch (error) {
      console.error('Déblocage en échec:', error.message);
      res.status(500).json({ error: 'Erreur serveur' });
    } finally {
      confirming.delete(token);
    }
  });

  return { dispatchRequest, router, alertAdmin };
}

module.exports = {
  createLeadDispatch,
  priceCategory,
  buildSummary,
  isEligible,
  stripContactDetails,
};

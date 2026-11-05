#!/usr/bin/env node
// Bilan mensuel Dodomove (lot 4) : ce qu'il faut facturer à chaque partenaire, et le suivi du mois.
// Usage : node scripts/bilan-mensuel.js [AAAA-MM]   (par défaut le mois écoulé, art. 3.4 de la convention)
// Lit Airtable avec AIRTABLE_SCHEMA_TOKEN (clé locale de Pierre, .env). N'écrit rien.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appyuDiWXUzpy9DTT';
const TOKEN = process.env.AIRTABLE_SCHEMA_TOKEN || process.env.AIRTABLE_API_KEY;
const TIME_ZONE = 'Indian/Reunion'; // siège de Kompasio
const TABLES = { requests: 'tblic0CaPaaKZwouK', sends: 'Envois', partners: 'Partenaires' };

function monthOf(isoDate) {
  if (!isoDate) return null;
  const parts = new Intl.DateTimeFormat('fr-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(new Date(isoDate));
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}

function previousMonth(now = new Date()) {
  const [year, month] = monthOf(now.toISOString()).split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

function euros(amount) {
  return `${Number(amount).toLocaleString('fr-FR')} €`;
}

function dayLabel(isoDate) {
  return new Date(isoDate).toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' });
}

async function fetchAll(table, fields) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    fields.forEach(f => params.append('fields[]', f));
    if (offset) params.set('offset', offset);
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}?${params}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Airtable ${table} : ${data.error?.message || data.error?.type || res.status}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// Calcul pur, testable sans Airtable
function summarize({ requests, sends, partners, month }) {
  const partnerName = id => partners.find(p => p.id === id)?.fields.nom || 'Partenaire inconnu';
  const received = requests.filter(r => monthOf(r.fields.created_at || r.createdTime) === month);
  const sent = sends.filter(s => monthOf(s.fields.envoye_le) === month);
  const unlocked = sends.filter(s => s.fields.statut === 'Débloqué' && monthOf(s.fields.debloque_le) === month);
  const reported = sends.filter(s => s.fields.statut === 'Signalé' && monthOf(s.fields.debloque_le) === month);

  const billing = {};
  unlocked.forEach(s => {
    const name = partnerName((s.fields.partenaire || [])[0]);
    billing[name] = billing[name] || { lines: [], total: 0, free: 0 };
    const amount = s.fields.offerte ? 0 : Number(s.fields.montant_ht || 0);
    billing[name].lines.push({ date: s.fields.debloque_le, reference: s.fields.reference, category: s.fields.categorie, amount, free: !!s.fields.offerte });
    billing[name].total += amount;
    if (s.fields.offerte) billing[name].free += 1;
  });
  Object.values(billing).forEach(b => b.lines.sort((a, c) => a.date.localeCompare(c.date)));

  const delivered = sent.filter(s => s.fields.statut !== "Échec d'envoi");
  return {
    month,
    received: received.length,
    transmitted: received.filter(r => r.fields.status === 'Transmitted').length,
    noCarrier: received.filter(r => r.fields.status === 'Sans partenaire').length,
    sends: delivered.length,
    failedSends: sent.length - delivered.length,
    unlocked: unlocked.length,
    reported: reported.length,
    unlockRate: delivered.length ? Math.round((sent.filter(s => s.fields.statut === 'Débloqué').length / delivered.length) * 100) : null,
    billing,
    totalHT: Object.values(billing).reduce((sum, b) => sum + b.total, 0),
  };
}

function render(s) {
  const out = [`# Bilan Dodomove ${s.month}`, '', '## À facturer (hors taxes)', ''];
  const names = Object.keys(s.billing).sort();
  if (!names.length) out.push('Aucune demande débloquée ce mois-ci : rien à facturer.', '');
  names.forEach(name => {
    const b = s.billing[name];
    out.push(`### ${name} : ${euros(b.total)} HT${b.free ? ` (dont ${b.free} demande${b.free > 1 ? 's' : ''} offerte${b.free > 1 ? 's' : ''})` : ''}`, '');
    out.push('| Débloquée le | Référence | Catégorie | Montant HT |', '|---|---|---|---|');
    b.lines.forEach(l => out.push(`| ${dayLabel(l.date)} | ${l.reference} | ${l.category || ''} | ${l.free ? 'offerte' : euros(l.amount)} |`));
    out.push('');
  });
  if (names.length) out.push(`**Total du mois : ${euros(s.totalHT)} HT.** Facture payable sous 15 jours (art. 3.4). Demandes signalées et acceptées (non facturées) : ${s.reported}.`, '');
  out.push('## Suivi', '',
    '| Indicateur | Valeur |', '|---|---|',
    `| Demandes reçues | ${s.received} |`,
    `| Transmises à au moins un partenaire | ${s.transmitted} |`,
    `| Sans partenaire | ${s.noCarrier} |`,
    `| Envois aux partenaires | ${s.sends}${s.failedSends ? ` (+ ${s.failedSends} en échec)` : ''} |`,
    `| Déblocages | ${s.unlocked} |`,
    `| Taux de déblocage des envois du mois | ${s.unlockRate === null ? 'sans objet' : `${s.unlockRate} %`} |`,
    `| Montant facturable | ${euros(s.totalHT)} HT |`);
  return out.join('\n');
}

async function main() {
  const month = process.argv[2] || previousMonth();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mois attendu au format AAAA-MM, par exemple 2026-11');
  if (!TOKEN) throw new Error('AIRTABLE_SCHEMA_TOKEN absent du fichier .env');
  const [requests, sends, partners] = await Promise.all([
    fetchAll(TABLES.requests, ['created_at', 'status']),
    fetchAll(TABLES.sends, ['reference', 'partenaire', 'statut', 'envoye_le', 'debloque_le', 'categorie', 'montant_ht', 'offerte']),
    fetchAll(TABLES.partners, ['nom']),
  ]);
  console.log(render(summarize({ requests, sends, partners, month })));
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Bilan impossible : ${error.message}`);
    process.exit(1);
  });
}

module.exports = { summarize, render, monthOf, previousMonth };

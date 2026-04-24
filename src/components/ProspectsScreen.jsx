import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, MessageSquare, Archive, X, ChevronDown, ExternalLink, Check, Sparkles, RefreshCw, Send, Bot } from 'lucide-react';
import { searchProspects, enrichProspect, generateProspectMessage, generateMessageVariants, fetchCompetitorContext, deepIntelligenceReport, RateLimitError } from '../api.js';
import { AGENT_CONFIG } from '../prompts.js';

// ─── Cost estimation helpers ──────────────────────────────────────────────────
function calcSearchCost(count, depth, autoEnrich) {
  if (!autoEnrich) return 0.001; // discovery only: one cheap generation call
  const perProspect = { surface: 0.008, approfondie: 0.013, maximale: 0.018 }[depth] ?? 0.013;
  return 0.001 + count * perProspect;
}
function fmtCost(c) { return c < 0.005 ? '<0.01$' : `${c.toFixed(2)}$`; }
function costColor(c) {
  if (c < 0.05)  return '#3B6D11';
  if (c < 0.20)  return '#BA7517';
  return '#993C1D';
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LS_KEY         = 'hq_prospects';
const MEMORY_KEY     = 'hq_prospect_memory';
const INTEL_KEY      = 'hq_search_intelligence';

// ─── Conversion Intelligence ─────────────────────────────────────────────────
function loadSearchIntelligence() {
  try { const d = localStorage.getItem(INTEL_KEY); return d ? JSON.parse(d) : []; }
  catch { return []; }
}
function recordConversion({ prospect, params, agentUsed, messageVariant, rank }) {
  try {
    const records = loadSearchIntelligence();
    const contactedAt = (prospect.contactHistory || []).find((h) => h.date)?.date;
    const daysToClose = contactedAt ? Math.floor((Date.now() - contactedAt) / 86400000) : null;
    records.push({
      convertedAt:      Date.now(),
      convertedProspect: prospect.businessName,
      searchQuery:      params ? { niches: params.niches, region: params.region } : null,
      signals:          detectSignals(prospect),
      agentUsed,
      messageVariant,
      daysToClose,
      rank,
      type:             prospect.type,
      city:             prospect.city,
    });
    localStorage.setItem(INTEL_KEY, JSON.stringify(records));
  } catch {}
}
function getConversionInsights() {
  const records = loadSearchIntelligence();
  if (records.length < 5) return null;

  // Top business type
  const typeCounts = {};
  records.forEach((r) => { if (r.type) typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  // Top signal
  const sigCounts = {};
  records.forEach((r) => (r.signals || []).forEach((s) => { sigCounts[s] = (sigCounts[s] || 0) + 1; }));
  const topSignal = Object.entries(sigCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const topSignalLabel = SIGNAL_CONFIG[topSignal]?.label || topSignal;

  // Top agent
  const agentCounts = {};
  records.forEach((r) => { if (r.agentUsed) agentCounts[r.agentUsed] = (agentCounts[r.agentUsed] || 0) + 1; });
  const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const topAgentLabel = PROSPECT_AGENTS[topAgent]?.commercialName || topAgent;

  // Average days to close
  const closingDays = records.filter((r) => r.daysToClose != null).map((r) => r.daysToClose);
  const avgDays = closingDays.length > 0 ? Math.round(closingDays.reduce((a, b) => a + b, 0) / closingDays.length) : null;

  return { topType, topSignalLabel, topAgentLabel, avgDays, count: records.length };
}

// ─── Prospect Memory System ───────────────────────────────────────────────────
function loadMemory() {
  try { const d = localStorage.getItem(MEMORY_KEY); return d ? JSON.parse(d) : { seen: [], contacted: [], converted: [] }; }
  catch { return { seen: [], contacted: [], converted: [] }; }
}
function saveMemory(mem) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(mem)); } catch {}
}
function normalizeKey(name, city) {
  return `${(name || '').toLowerCase().trim().replace(/\s+/g, ' ')}||${(city || '').toLowerCase().trim()}`;
}
function addToMemory(prospects) {
  const mem = loadMemory();
  const seenKeys = new Set(mem.seen.map((s) => normalizeKey(s.name, s.city)));
  const now = Date.now();
  for (const p of prospects) {
    const key = normalizeKey(p.businessName, p.city);
    if (!seenKeys.has(key)) {
      mem.seen.push({ name: p.businessName, city: p.city, firstSeen: now, lastSearched: now });
      seenKeys.add(key);
    } else {
      const entry = mem.seen.find((s) => normalizeKey(s.name, s.city) === key);
      if (entry) entry.lastSearched = now;
    }
  }
  saveMemory(mem);
}
function getMemoryEntry(name, city) {
  const mem = loadMemory();
  const key = normalizeKey(name, city);
  return mem.seen.find((s) => normalizeKey(s.name, s.city) === key) || null;
}
function markAsContacted(name, city, response = '') {
  const mem = loadMemory();
  const key = normalizeKey(name, city);
  const existing = mem.contacted.find((c) => normalizeKey(c.name, c.city) === key);
  if (existing) { existing.contactedAt = Date.now(); existing.response = response; }
  else mem.contacted.push({ name, city, contactedAt: Date.now(), response });
  saveMemory(mem);
}
function markAsConverted(name, city, mrr = 0) {
  const mem = loadMemory();
  const key = normalizeKey(name, city);
  const existing = mem.converted.find((c) => normalizeKey(c.name, c.city) === key);
  if (!existing) mem.converted.push({ name, city, convertedAt: Date.now(), mrr });
  saveMemory(mem);
}

const STATUS_CONFIG = {
  // ── Pré-contact (auto-géré par les faits) ──────────────────────────────────
  'Incomplet':    { bg: '#FEF9EC', color: '#92400E' },  // amber  — aucune info de contact
  'Cible':        { bg: '#F0F9FF', color: '#0369A1' },  // bleu   — info partielle, pas de message
  'Prêt':         { bg: '#EEF2FF', color: '#4338CA' },  // violet — email + message, envoi en 1 clic
  // ── Post-contact (flow manuel) ──────────────────────────────────────────────
  'Contacté':     { bg: '#EEEDFE', color: '#534AB7' },  // indigo — 1er envoi fait
  'Répondu':      { bg: '#E1F5EE', color: '#0F6E56' },  // vert   — ils ont répondu
  'Chaud':        { bg: '#FAEEDA', color: '#854F0B' },  // orange — intérêt exprimé
  'Démo':         { bg: '#E6F1FB', color: '#185FA5' },  // bleu   — démo planifiée
  'Signé':        { bg: '#0F172A', color: '#F5F4F0' },  // noir   — deal fermé
  'Client actif': { bg: '#F0FDF4', color: '#15803D' },  // vert   — client en cours
  'Perdu':        { bg: '#F1EFE8', color: '#888780' },  // gris   — perdu
};

// Strict flow — seuls les statuts valides suivants sont proposés
const STATUS_FLOW = {
  // Pré-contact → auto, mais on peut forcer manuellement
  'Incomplet':    ['Cible', 'Contacté', 'Perdu'],
  'Cible':        ['Prêt', 'Contacté', 'Chaud', 'Perdu'],
  'Prêt':         ['Contacté', 'Chaud', 'Perdu'],
  // Post-contact → flow normal
  'Contacté':     ['Répondu', 'Chaud', 'Démo', 'Perdu'],
  'Répondu':      ['Chaud', 'Démo', 'Perdu'],
  'Chaud':        ['Contacté', 'Répondu', 'Démo', 'Perdu'],
  'Démo':         ['Signé', 'Perdu'],
  'Signé':        ['Client actif', 'Perdu'],
  'Client actif': ['Perdu'],
  'Perdu':        ['Cible'],
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG);
const BUSINESS_TYPES = ['Restaurant', 'Salon', 'Garage', 'Clinique', 'Boulangerie', 'Dépanneur', 'Gym', 'Spa', 'Autre'];
const FOOD_TYPES = ['restaurant', 'boulangerie', 'dépanneur', 'café', 'bar', 'traiteur', 'pizzeria'];

// Six agents available for prospect messages
const PROSPECT_AGENTS = {
  VOSS:    { ...AGENT_CONFIG.VOSS,    key: 'VOSS',    label: 'Empathie tactique · négociation' },
  CARDONE: { ...AGENT_CONFIG.CARDONE, key: 'CARDONE', label: 'Outreach direct · volume' },
  HORMOZI: { ...AGENT_CONFIG.HORMOZI, key: 'HORMOZI', label: 'ROI mathématique · valeur' },
  GARYV:   { ...AGENT_CONFIG.GARYV,   key: 'GARYV',   label: "Contenu d'abord · jeu long" },
  NAVAL:   { ...AGENT_CONFIG.NAVAL,   key: 'NAVAL',   label: 'Systèmes · levier' },
  ROBBINS: { ...AGENT_CONFIG.ROBBINS, key: 'ROBBINS', label: 'Mindset · énergie · confiance' },
};

// Agents for Chirurgical mode — 2 rows of 3, ordered by prospecting style
const CHIRURGICAL_AGENTS = [
  ['VOSS', 'CARDONE', 'HORMOZI'],
  ['GARYV', 'NAVAL',  'ROBBINS'],
];

// ─── Smart agent selection ─────────────────────────────────────────────────────
function selectBestAgent(prospect) {
  const reviews = parseFloat(prospect.googleReviews) || 0;
  const rating  = parseFloat(prospect.googleRating)  || 3;
  const type    = (prospect.type || '').toLowerCase();

  if (FOOD_TYPES.some((f) => type.includes(f)))
    return { agentKey: 'GARYV',   rationale: 'Secteur alimentaire → contenu avant tout' };
  if (reviews >= 20)
    return { agentKey: 'NAVAL',   rationale: '20+ avis → leviers systèmes' };
  if (rating >= 4.5 && reviews > 5)
    return { agentKey: 'HORMOZI', rationale: 'Note élevée → ROI prouvable' };
  if (reviews === 0)
    return { agentKey: 'CARDONE', rationale: 'Zéro avis → besoin urgence' };
  return { agentKey: 'VOSS',    rationale: 'Profil mixte → empathie calibrée' };
}

// ─── Intelligence Score System ────────────────────────────────────────────────
function calculateIntelligenceScore(prospect) {
  let score = 0;
  const signals = [];

  // DATA COMPLETENESS (40 points max)
  if (prospect.phone?.trim())       { score += 10; signals.push('Téléphone vérifié'); }
  if (prospect.email?.trim())       { score += 12; signals.push('Email trouvé'); }
  if (prospect.website?.trim())     { score +=  8; signals.push('Site web actif'); }
  if (prospect.facebookUrl?.trim() || prospect.fbPage?.trim()) { score += 5; signals.push('Facebook actif'); }
  if (prospect.contactName?.trim()) { score +=  5; signals.push('Propriétaire identifié'); }

  // OPPORTUNITY SIGNALS (35 points max)
  const reviews = parseFloat(prospect.googleReviews) || 0;
  const rating  = parseFloat(prospect.googleRating)  || 0;
  if (reviews > 0 && reviews < 20)                   { score += 15; signals.push('Peu d\'avis — opportunité claire'); }
  if (rating > 0 && rating < 4.0)                    { score += 10; signals.push('Note améliorable'); }
  if (rating >= 4.0 && reviews > 0 && reviews < 30)  { score += 12; signals.push('Bonne note mais peu visible'); }
  if (prospect.recentNegativeReview)                  { score +=  8; signals.push('Avis négatif récent'); }
  if (prospect.lastPostDays > 30)                     { score +=  5; signals.push('Inactif en ligne depuis 30j+'); }

  // REACHABILITY (25 points max)
  if (prospect.email?.trim() && prospect.phone?.trim()) { score += 15; signals.push('Contact direct possible'); }
  if (prospect.facebookMessenger)                       { score +=  5; signals.push('Messenger disponible'); }
  if (prospect.ownerLinkedIn?.trim())                   { score +=  5; signals.push('Propriétaire sur LinkedIn'); }

  const tier = score >= 80 ? 'S' : score >= 60 ? 'A' : score >= 40 ? 'B' : 'C';
  const tierLabel = score >= 80 ? 'Prospect Élite'
                  : score >= 60 ? 'Prospect Solide'
                  : score >= 40 ? 'Prospect Potentiel'
                  : 'Prospect Froid';
  return { score, signals, tier, tierLabel };
}

const TIER_STYLE = {
  S: { bg: '#1A1917', color: '#F5F4F0', label: 'Élite'    },
  A: { bg: '#6366F1', color: '#F5F4F0', label: 'Solide'   },
  B: { bg: '#FAEEDA', color: '#854F0B', label: 'Potentiel'},
  C: { bg: '#F1EFE8', color: '#888780', label: 'Froid'    },
};

function TierBadge({ tier }) {
  const cfg = TIER_STYLE[tier] || TIER_STYLE.C;
  return (
    <span title={`Tier ${tier} — ${cfg.label}`} style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
      letterSpacing: '0.03em', flexShrink: 0,
    }}>
      {tier} · {cfg.label}
    </span>
  );
}

// ─── Master Ranking Algorithm ─────────────────────────────────────────────────
function calcMasterRank(prospect) {
  // Data quality score (0-100) — use intelligence score
  const intel = calculateIntelligenceScore(prospect);
  const intelScore = Math.min(100, intel.score);

  // Opportunity score (0-100) — based on Google gap and rating
  const reviews = parseFloat(prospect.googleReviews) || 0;
  const rating  = parseFloat(prospect.googleRating)  || 0;
  const reviewGap = Math.max(0, Math.min(100, (30 - reviews) * 3));  // 0-30 reviews → 0-90 pts
  const ratingGap = rating > 0 && rating < 4.5 ? Math.min(10, (4.5 - rating) * 10) : 0;
  const opportunityScore = Math.min(100, reviewGap + ratingGap);

  // Reachability (0-100)
  const reachability = Math.min(100,
    (prospect.email?.trim()   ? 40 : 0) +
    (prospect.phone?.trim()   ? 30 : 0) +
    (prospect.website?.trim() ? 20 : 0) +
    (prospect.fbPage?.trim()  ? 10 : 0)
  );

  // Timing score (0-100) — recent activity = better timing
  const lastDays = prospect.lastPostDays != null ? parseInt(prospect.lastPostDays, 10) : 90;
  const timingScore = lastDays <= 14  ? 100
    : lastDays <= 30  ? 80
    : lastDays <= 60  ? 60
    : lastDays <= 120 ? 40
    : 20;

  // Competitive gap (0-100) — placeholder, enriched later by competitor context
  const competitiveGap = 50; // neutral default

  const rank = Math.round(
    intelScore     * 0.30 +
    opportunityScore * 0.25 +
    reachability   * 0.25 +
    timingScore    * 0.15 +
    competitiveGap * 0.05
  );

  const label = rank >= 90 ? 'Priorité absolue'
    : rank >= 75 ? 'Contacter aujourd\'hui'
    : rank >= 60 ? 'Cette semaine'
    : rank >= 40 ? 'Quand tu as le temps'
    : 'Archiver';

  return { rank: Math.min(100, Math.max(1, rank)), label };
}

// ─── Signal Detection Engine ──────────────────────────────────────────────────
const SIGNAL_CONFIG = {
  pain: {
    label: 'Sensible aux avis négatifs',
    color: '#DC2626', bg: 'rgba(220,38,38,0.08)',
    agent: 'VOSS',
    approach: 'Empathie en premier, solution ensuite',
  },
  growth: {
    label: 'En croissance',
    color: '#059669', bg: 'rgba(5,150,105,0.08)',
    agent: 'NAVAL',
    approach: 'Scalabilité et systèmes',
  },
  invisible: {
    label: 'Sous-représenté en ligne',
    color: '#6366F1', bg: 'rgba(99,102,241,0.08)',
    agent: 'HORMOZI',
    approach: 'ROI mathématique pur',
  },
  ghost: {
    label: 'Propriétaire débordé',
    color: '#D97706', bg: 'rgba(217,119,6,0.08)',
    agent: 'CARDONE',
    approach: 'Urgence + volume',
  },
  content: {
    label: 'Actif contenu, faible SEO',
    color: '#0EA5E9', bg: 'rgba(14,165,233,0.08)',
    agent: 'GARYV',
    approach: 'Google comme canal de distribution',
  },
  personal: {
    label: 'Réputation personnelle en jeu',
    color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)',
    agent: 'ROBBINS',
    approach: 'Identité et héritage',
  },
};

function detectSignals(prospect) {
  const signals = [];
  const reviews = parseFloat(prospect.googleReviews) || 0;
  const rating  = parseFloat(prospect.googleRating)  || 0;

  if (prospect.recentNegativeReview)                         signals.push('pain');
  if (prospect.hiringSignal || prospect.expansionSignal)     signals.push('growth');
  if (rating >= 4.0 && reviews > 0 && reviews < 20)         signals.push('invisible');
  if ((prospect.lastPostDays || 0) > 60 && reviews < 15)    signals.push('ghost');
  if (prospect.instagramActive && reviews < 30)              signals.push('content');
  if (prospect.contactName || prospect.ownerLinkedIn)        signals.push('personal');

  return signals; // array of signal keys
}

function SignalTag({ signalKey, onClick }) {
  const cfg = SIGNAL_CONFIG[signalKey];
  if (!cfg) return null;
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick?.(signalKey); }}
      title={`${cfg.label} → Agent recommandé : ${cfg.agent}`}
      style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
        background: cfg.bg, color: cfg.color, cursor: onClick ? 'pointer' : 'default',
        border: `1px solid ${cfg.color}22`, whiteSpace: 'nowrap',
        transition: 'all 0.12s',
      }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Data priority tier (fallback inference when API doesn't return it) ───────
function getDataPriorityTier(prospect) {
  if (prospect.priorityTier) return parseInt(prospect.priorityTier, 10);
  const hasRichData = !!(prospect.website?.trim() || prospect.fbPage?.trim() || prospect.facebookUrl?.trim());
  if (hasRichData) return 1;
  const hasModerateData = !!(
    (parseFloat(prospect.googleReviews) > 0) ||
    prospect.phone?.trim()
  );
  if (hasModerateData) return 2;
  return 3;
}

const PRIORITY_DOT = {
  1: { color: '#D4AF37', tooltip: 'Données publiques disponibles: Élevées — Tier 1' },
  2: { color: '#A8A8A8', tooltip: 'Données publiques disponibles: Modérées — Tier 2' },
  3: { color: '#D1CFC8', tooltip: 'Données publiques disponibles: Limitées — Tier 3' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function calcScore(googleReviews = 0, googleRating = 3) {
  const r = Math.max(0, parseFloat(googleReviews) || 0);
  const g = Math.min(5, Math.max(1, parseFloat(googleRating) || 3));
  const raw = (10 - Math.min(r, 25)) * 0.4 + (5 - g) * 0.6;
  return Math.max(1, Math.min(10, parseFloat(raw.toFixed(1))));
}

function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

function initials(name = '') {
  const w = name.trim().split(/\s+/);
  return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase() || '?';
}

function scoreColor(s) {
  if (s >= 8) return '#3B6D11';
  if (s >= 6) return '#6366F1';
  if (s >= 4) return '#BA7517';
  return '#993C1D';
}

function loadProspects() {
  try { const d = localStorage.getItem(LS_KEY); return d ? JSON.parse(d) : []; } catch { return []; }
}
function saveProspects(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
}

function addRetainerForClient(prospect) {
  try {
    const retainers = JSON.parse(localStorage.getItem('hq_retainers') || '[]');
    retainers.push({
      id: genId(),
      clientName: prospect.businessName,
      amount: 150,
      startDate: Date.now(),
      sourceProspectId: prospect.id,
    });
    localStorage.setItem('hq_retainers', JSON.stringify(retainers));
  } catch {}
}

function gmailUrl(email, subject, body) {
  const params = new URLSearchParams();
  params.set('view', 'cm');
  params.set('fs', '1');
  if (email)   params.set('to', email);
  if (subject) params.set('su', subject);
  if (body)    params.set('body', body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

// ─── Fact-based auto-classification ───────────────────────────────────────────
// Deux fonctions :
//  · calcStatusFromFacts(p) — évaluation pure basée sur les données, sans verrou
//  · autoStatus(p)          — idem mais respecte les statuts post-contact manuels
//                             (Répondu, Chaud, Démo, Signé… ne peuvent reculer seuls)

const POST_CONTACT = new Set(['Contacté','Répondu','Chaud','Démo','Signé','Client actif','Perdu']);

function calcStatusFromFacts(prospect) {
  const hasHistory = (prospect.contactHistory || []).some((e) => e.note?.trim());
  const hasEmail   = !!prospect.email?.trim();
  const hasPhone   = !!prospect.phone?.trim();
  const hasMsg     = !!prospect.suggestedMessage?.trim();

  if (hasHistory)         return 'Contacté';  // contact loggé
  if (hasEmail && hasMsg) return 'Prêt';       // email + message → envoi 1 clic
  if (hasEmail || hasPhone) return 'Cible';   // a une info de contact
  return 'Incomplet';                          // aucune info
}

function autoStatus(prospect) {
  // Les statuts manuels avancés (Répondu, Chaud, Démo, Signé…) ne reculent jamais seuls
  const manualLocked = new Set(['Répondu','Chaud','Démo','Signé','Client actif','Perdu']);
  if (manualLocked.has(prospect.status)) return prospect.status;
  return calcStatusFromFacts(prospect);
}

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { bg: '#F5F4F0', color: '#9B9890' };
  const icons = {
    'Incomplet':    <span style={{ fontSize: 9 }}>○</span>,
    'Cible':        <span style={{ fontSize: 9 }}>◎</span>,
    'Prêt':         <Sparkles size={9} strokeWidth={2.5} />,
    'Signé':        <Check size={9} strokeWidth={2.5} />,
    'Client actif': <Check size={9} strokeWidth={2.5} />,
  };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 20,
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
      ...(status === 'Prêt' && { fontWeight: 600, letterSpacing: '0.02em' }),
    }}>
      {icons[status] || null}
      {status}
    </span>
  );
}

// ─── Score circle ──────────────────────────────────────────────────────────────
function ScoreCircle({ score, size = 28 }) {
  const c = scoreColor(score);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid ${c}`, display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: size === 28 ? 11 : 18, fontWeight: 600, color: c, lineHeight: 1 }}>{score}</span>
    </div>
  );
}

// ─── Source badge (multi-stream intelligence) ─────────────────────────────────
const SOURCE_LABELS = { G: 'Google', W: 'Site web', F: 'Facebook', D: 'Annuaire', N: 'Actualités' };
const SOURCE_COLORS = { G: '#4285F4', W: '#059669', F: '#1877F2', D: '#F59E0B', N: '#8B5CF6' };
function SourceBadge({ src }) {
  if (!src) return null;
  const key = src.toUpperCase();
  const color = SOURCE_COLORS[key] || '#9B9890';
  const label = SOURCE_LABELS[key] || src;
  return (
    <span title={`Source : ${label}`} style={{
      fontSize: 9, fontWeight: 700, color: '#fff',
      background: color, padding: '1px 5px', borderRadius: 4,
      letterSpacing: '0.04em', marginLeft: 4, flexShrink: 0,
    }}>
      {key}
    </span>
  );
}

// ─── Step 9: Real-time verification badge ─────────────────────────────────────
function VerificationBadge({ prospect }) {
  const count  = prospect._verifiedCount || 0;
  const confs  = prospect._confidences   || {};
  const n      = Object.values(confs).filter((c) => c?.status === 'verified').length;
  const single = Object.values(confs).filter((c) => c?.status === 'single_source').length;

  if (!prospect.enriched) return null;

  if (n >= 3) {
    return (
      <div title={`Données confirmées par plusieurs sources — ${n} champ${n > 1 ? 's' : ''} vérifié${n > 1 ? 's' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)' }}>
        <span style={{ fontSize: 11, color: '#059669' }}>🛡</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', letterSpacing: '0.04em' }}>Profil vérifié</span>
        <span style={{ fontSize: 10, color: 'rgba(5,150,105,0.7)' }}>· {n} sources</span>
      </div>
    );
  }
  if (n >= 2 || single >= 2) {
    return (
      <div title="Certaines données à confirmer — sources partielles"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
        <span style={{ fontSize: 11, color: '#6366F1' }}>🛡</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', letterSpacing: '0.04em' }}>Profil partiel</span>
        <span style={{ fontSize: 10, color: 'rgba(99,102,241,0.7)' }}>· à confirmer</span>
      </div>
    );
  }
  return (
    <div title="Confirmer les infos avant de contacter"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)' }}>
      <span style={{ fontSize: 11, color: '#D97706' }}>🛡</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', letterSpacing: '0.04em' }}>À vérifier</span>
      <span style={{ fontSize: 10, color: 'rgba(217,119,6,0.7)' }}>· données non confirmées</span>
    </div>
  );
}

// ─── Agent attribution chip ────────────────────────────────────────────────────
function AgentChip({ agentKey }) {
  const agent = PROSPECT_AGENTS[agentKey] || PROSPECT_AGENTS.CARDONE;
  const rgb = agent.glowRgb;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      background: `rgba(${rgb},0.08)`, borderRadius: 20,
      padding: '4px 10px 4px 6px', marginBottom: 10,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: `rgb(${rgb})`, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, flexShrink: 0,
      }}>
        {agent.initial}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: `rgb(${rgb})`, lineHeight: 1.2 }}>
          {agent.commercialName}
        </div>
        <div style={{ fontSize: 10, color: '#9B9890', lineHeight: 1 }}>{agent.label}</div>
      </div>
    </div>
  );
}

// ─── Prospect row ──────────────────────────────────────────────────────────────
function ProspectRow({ prospect, onClick, onArchive, onEnrich, isNew, isEnriching }) {
  const [hovered, setHovered] = useState(false);
  const days = daysSince(prospect.lastContactAt || prospect.createdAt);
  const needsFollowUp = days !== null && days >= 5 && prospect.status !== 'Signé' && prospect.status !== 'Client actif' && prospect.status !== 'Perdu';
  const statusCfg = STATUS_CONFIG[prospect.status] || { bg: '#F5F4F0', color: '#9B9890' };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: hovered ? '#FAFAF8' : '#F5F4F0',
        border: `1px solid ${isNew ? 'rgba(99,102,241,0.35)' : '#E8E6E0'}`, borderRadius: 12,
        padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.06)' : isNew ? '0 2px 12px rgba(99,102,241,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s ease',
        animation: isNew ? 'prospectSlideIn 0.45s cubic-bezier(0.16,1,0.3,1) forwards'
          : isEnriching ? 'enrich-pulse 2s ease infinite' : 'none',
      }}
    >
      {/* Avatar + priority dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: statusCfg.bg === '#0F172A' ? '#E8E6E0' : statusCfg.bg,
          color: statusCfg.color === '#F5F4F0' ? '#0F172A' : statusCfg.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600, position: 'relative',
        }}>
          {initials(prospect.businessName)}
          {prospect.source === 'ai' && (
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 14, height: 14, borderRadius: '50%',
              background: '#6366F1', border: '2px solid #FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={7} color="#fff" />
            </div>
          )}
        </div>
        {/* Priority tier dot */}
        {(() => {
          const tier = getDataPriorityTier(prospect);
          const dot  = PRIORITY_DOT[tier];
          return (
            <div
              title={dot.tooltip}
              style={{
                position: 'absolute', top: -2, left: -2,
                width: 9, height: 9, borderRadius: '50%',
                background: dot.color, border: '1.5px solid #FFFFFF',
                flexShrink: 0,
              }}
            />
          );
        })()}
      </div>

      {/* Name + details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1917', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {prospect.businessName || 'Sans nom'}
        </div>
        <div style={{ fontSize: 12, color: '#9B9890', marginTop: 2 }}>
          {[prospect.type, prospect.city].filter(Boolean).join(' · ')}
          {prospect.googleReviews != null && prospect.googleRating != null && (
            <span style={{ marginLeft: 6, fontSize: 11 }}>{prospect.googleReviews} avis · {prospect.googleRating}★</span>
          )}
        </div>
        {prospect.whyThisOne && (
          <div style={{
            fontSize: 11, color: '#6366F1', fontStyle: 'italic',
            marginTop: 3, lineHeight: 1.4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}>
            🎯 {prospect.whyThisOne}
          </div>
        )}
        {/* Memory badge — shown if seen before or needs follow-up */}
        {(() => {
          const mem = getMemoryEntry(prospect.businessName, prospect.city);
          if (!mem) return null;
          const contactEntry = loadMemory().contacted.find(
            (c) => normalizeKey(c.name, c.city) === normalizeKey(prospect.businessName, prospect.city)
          );
          const daysSinceContact = contactEntry
            ? Math.floor((Date.now() - contactEntry.contactedAt) / 86400000)
            : null;
          const needsFollowUpMem = daysSinceContact !== null && daysSinceContact >= 7 && !contactEntry.response;
          if (needsFollowUpMem) {
            return (
              <div style={{ fontSize: 10, color: '#D97706', fontWeight: 600, marginTop: 2 }}>
                🔔 Relance recommandée — sans réponse depuis {daysSinceContact}j
              </div>
            );
          }
          const seenDate = new Date(mem.firstSeen).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
          return (
            <div style={{ fontSize: 10, color: '#9B9890', marginTop: 2 }}>
              Déjà recherché le {seenDate}
            </div>
          );
        })()}

        {/* Buying signal tags — max 2 visible + overflow badge */}
        {(() => {
          const sigs = detectSignals(prospect);
          if (sigs.length === 0) return null;
          const visible = sigs.slice(0, 2);
          const rest    = sigs.length - 2;
          return (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
              {visible.map((k) => <SignalTag key={k} signalKey={k} />)}
              {rest > 0 && (
                <span style={{ fontSize: 10, fontWeight: 600, color: '#9B9890', background: '#F5F4F0', padding: '2px 7px', borderRadius: 20 }}>
                  +{rest}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Data quality dots ── */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {/* 5 dots: Phone · Email · Website · Facebook · Reviews */}
        <div style={{ display: 'flex', gap: 3 }}>
          {[
            { key: 'phone',   label: 'Téléphone',   has: !!prospect.phone?.trim() },
            { key: 'email',   label: 'Email',        has: !!prospect.email?.trim() },
            { key: 'website', label: 'Site web',     has: !!prospect.website?.trim() },
            { key: 'fb',      label: 'Facebook',     has: !!prospect.fbPage?.trim() },
            { key: 'reviews', label: 'Avis Google',  has: !!(prospect.googleReviews && prospect.googleReviews > 0) },
          ].map(({ key, label, has }) => (
            <div
              key={key}
              title={`${label} : ${has ? '✓ présent' : '✗ manquant'}`}
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: has ? '#10b981' : 'rgba(0,0,0,0.1)',
                flexShrink: 0, transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
        {/* LinkedIn hint — only when email is missing */}
        {!prospect.email?.trim() && (
          <a
            href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(`${prospect.businessName || ''} ${prospect.city || ''}`.trim())}`}
            target="_blank" rel="noopener"
            onClick={(e) => e.stopPropagation()}
            title="Trouver l'email sur LinkedIn"
            style={{
              fontSize: 9, fontWeight: 700, color: '#0077b5',
              textDecoration: 'none', lineHeight: 1,
              padding: '1px 4px', borderRadius: 3,
              background: 'rgba(0,119,181,0.08)',
              letterSpacing: '0.02em',
            }}
          >
            in
          </a>
        )}
      </div>

      {/* Status badge */}
      <StatusBadge status={prospect.status || 'Nouveau'} />

      {/* Intelligence tier badge */}
      {(() => {
        const intel = calculateIntelligenceScore(prospect);
        return <TierBadge tier={intel.tier} />;
      })()}

      {/* Master rank */}
      {(() => {
        const { rank, label } = calcMasterRank(prospect);
        const intel = calculateIntelligenceScore(prospect);
        const tierCfg = TIER_STYLE[intel.tier] || TIER_STYLE.C;
        return (
          <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 44 }} title={label}>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: tierCfg.color !== '#F5F4F0' ? tierCfg.bg === '#1A1917' ? '#1A1917' : tierCfg.color : '#6366F1' }}>
              {rank}
            </div>
            <div style={{ fontSize: 9, color: '#9B9890', lineHeight: 1.2, maxWidth: 60, textAlign: 'right' }}>{label}</div>
          </div>
        );
      })()}

      {/* Last contact */}
      <div style={{ fontSize: 11, color: '#9B9890', textAlign: 'right', minWidth: 72, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        {needsFollowUp && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />}
        {days !== null ? `il y a ${days}j` : 'Jamais'}
      </div>

      {/* Enrichir button — visible when prospect hasn't been web-enriched yet */}
      {prospect.source === 'ai' && !prospect.enriched && onEnrich && (
        <button
          onClick={(e) => { e.stopPropagation(); onEnrich(prospect.id); }}
          disabled={isEnriching}
          style={{
            padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.35)',
            background: 'rgba(99,102,241,0.06)', color: '#6366F1',
            fontSize: 11, fontWeight: 600, cursor: isEnriching ? 'wait' : 'pointer',
            flexShrink: 0, transition: 'all 0.12s',
            opacity: isEnriching ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!isEnriching) { e.currentTarget.style.background = 'rgba(99,102,241,0.14)'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; }}
        >
          {isEnriching ? '…' : 'Enrichir →'}
        </button>
      )}

      {/* Action buttons (hover only) */}
      <div style={{ display: 'flex', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s ease', flexShrink: 0 }}>
        {[
          { icon: <Edit2 size={12} />, title: 'Modifier' },
          { icon: <MessageSquare size={12} />, title: 'Note rapide' },
          { icon: <Archive size={12} />, title: 'Archiver', cb: (e) => { e.stopPropagation(); onArchive(prospect.id); } },
        ].map(({ icon, title, cb }) => (
          <button key={title} title={title}
            onClick={cb || ((e) => e.stopPropagation())}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#F5F4F0', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9B9890', transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#E8E6E0'; e.currentTarget.style.color = '#3D3D3A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F4F0'; e.currentTarget.style.color = '#9B9890'; }}>
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Prospect slide-in panel ───────────────────────────────────────────────────
function ProspectPanel({ prospect, onClose, onUpdate, onDelete }) {
  const [noteInput, setNoteInput]         = useState('');
  const [noteChannel, setNoteChannel]     = useState('Email');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editField, setEditField]         = useState(null);
  const [editVal, setEditVal]             = useState('');
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [localMsg, setLocalMsg]           = useState(prospect.suggestedMessage || '');
  const [localSubject, setLocalSubject]   = useState(prospect.emailSubject || '');
  const [localAgent, setLocalAgent]       = useState(
    prospect.agentKey || selectBestAgent(prospect).agentKey
  );
  const [showSignModal, setShowSignModal]   = useState(false);
  const [showLostModal, setShowLostModal]   = useState(false);
  const [lostReason, setLostReason]         = useState('');
  const [msgVariants, setMsgVariants]       = useState(prospect.messageVariants || []);
  const [activeVariant, setActiveVariant]   = useState(0);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [competitorData, setCompetitorData] = useState(null);
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);
  const [deepIntel, setDeepIntel]       = useState(null);
  const [loadingDeep, setLoadingDeep]   = useState(false);
  const [deepStatus, setDeepStatus]     = useState('');

  // Auto-gen message on open if none exists
  const didAutoGen = useRef(false);
  useEffect(() => {
    if (!didAutoGen.current && !prospect.suggestedMessage) {
      didAutoGen.current = true;
      autoGenerate(selectBestAgent(prospect).agentKey);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch competitor context for S and A tier prospects
  useEffect(() => {
    const intel = calculateIntelligenceScore(prospect);
    if ((intel.tier === 'S' || intel.tier === 'A') && prospect.enriched) {
      setLoadingCompetitors(true);
      fetchCompetitorContext(prospect)
        .then((d) => setCompetitorData(d))
        .catch(() => {})
        .finally(() => setLoadingCompetitors(false));
    }
    // Step 10: Auto-trigger deep intelligence for Tier S only
    if (intel.tier === 'S' && prospect.enriched) {
      setLoadingDeep(true);
      deepIntelligenceReport(prospect, { onStatus: setDeepStatus })
        .then((d) => setDeepIntel(d))
        .catch(() => {})
        .finally(() => { setLoadingDeep(false); setDeepStatus(''); });
    }
  }, [prospect.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = scoreColor(prospect.score || 5);

  async function autoGenerate(agentKey) {
    setLocalAgent(agentKey);
    setGeneratingMsg(true);
    try {
      const msg  = await generateProspectMessage({ prospect, agentKey });
      const subj = `Améliorer votre présence Google — ${prospect.businessName}`;
      setLocalMsg(msg);
      setLocalSubject(subj);
      const draft = { ...prospect, suggestedMessage: msg, emailSubject: subj, agentKey };
      onUpdate({ ...draft, status: autoStatus(draft) });
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingMsg(false);
    }
  }

  async function switchAgent(key) {
    setLocalAgent(key);
    setGeneratingMsg(true);
    try {
      const msg  = await generateProspectMessage({ prospect, agentKey: key });
      const subj = `Améliorer votre présence Google — ${prospect.businessName}`;
      setLocalMsg(msg);
      setLocalSubject(subj);
      const draft = { ...prospect, suggestedMessage: msg, emailSubject: subj, agentKey: key };
      onUpdate({ ...draft, status: autoStatus(draft) });
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingMsg(false);
    }
  }

  async function regenerateMessage() {
    setGeneratingMsg(true);
    try {
      const msg  = await generateProspectMessage({ prospect, agentKey: localAgent });
      const subj = `Améliorer votre présence Google — ${prospect.businessName}`;
      setLocalMsg(msg);
      setLocalSubject(subj);
      const draft = { ...prospect, suggestedMessage: msg, emailSubject: subj, agentKey: localAgent };
      onUpdate({ ...draft, status: autoStatus(draft) });
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingMsg(false);
    }
  }

  async function handleGenerateVariants() {
    setGeneratingVariants(true);
    try {
      const variants = await generateMessageVariants(prospect);
      setMsgVariants(variants);
      setActiveVariant(0);
      if (variants[0]) {
        setLocalMsg(variants[0].message);
        setLocalAgent(variants[0].agentKey);
        const subj = `Améliorer votre présence Google — ${prospect.businessName}`;
        setLocalSubject(subj);
        const draft = { ...prospect, suggestedMessage: variants[0].message, emailSubject: subj, agentKey: variants[0].agentKey, messageVariants: variants };
        onUpdate({ ...draft, status: autoStatus(draft) });
      }
    } catch (e) { console.error(e); }
    finally { setGeneratingVariants(false); }
  }

  function startEdit(f, v) { setEditField(f); setEditVal(v || ''); }
  function commitEdit() {
    if (!editField) return;
    const updated = { ...prospect, [editField]: editVal };
    if (editField === 'googleReviews' || editField === 'googleRating') {
      const newScore = calcScore(
        editField === 'googleReviews' ? editVal : prospect.googleReviews,
        editField === 'googleRating'  ? editVal : prospect.googleRating
      );
      updated.score = newScore;
      const best = selectBestAgent({ ...prospect, ...updated });
      updated.agentKey = best.agentKey;
      setLocalAgent(best.agentKey);
    }
    // Re-evaluate classification chaque fois qu'un champ change
    updated.status = autoStatus(updated);
    onUpdate(updated);
    setEditField(null);
  }

  function addNote() {
    if (!noteInput.trim()) return;
    const entry   = { date: Date.now(), channel: noteChannel, note: noteInput.trim() };
    const updated = {
      ...prospect,
      lastContactAt:  Date.now(),
      contactHistory: [entry, ...(prospect.contactHistory || [])],
    };
    // Loguer un contact → passe automatiquement à "Contacté" si encore en pré-contact
    onUpdate({ ...updated, status: autoStatus(updated) });
    // Track in prospect memory
    markAsContacted(prospect.businessName, prospect.city, '');
    setNoteInput('');
  }

  // Status flow handlers
  function handleStatusSelect(newStatus) {
    setShowStatusMenu(false);
    if (newStatus === 'Signé') { setShowSignModal(true); return; }
    if (newStatus === 'Perdu') { setShowLostModal(true); return; }
    onUpdate({ ...prospect, status: newStatus });
  }

  function confirmSignature() {
    onUpdate({ ...prospect, status: 'Signé' });
    addRetainerForClient(prospect);
    markAsConverted(prospect.businessName, prospect.city, 150); // default MRR
    // Record conversion for learning loop
    const { rank } = calcMasterRank(prospect);
    recordConversion({
      prospect,
      params: null, // search params not available inside panel
      agentUsed: localAgent,
      messageVariant: msgVariants.length > 0 ? activeVariant : 0,
      rank,
    });
    setShowSignModal(false);
  }

  function confirmLost() {
    if (!lostReason.trim()) return;
    onUpdate({ ...prospect, status: 'Perdu', lostReason: lostReason.trim() });
    setShowLostModal(false);
    setLostReason('');
  }

  const displayMsg     = localMsg || '';
  const displaySubject = localSubject || `Améliorer la visibilité Google de ${prospect.businessName}`;
  const activeAgent    = PROSPECT_AGENTS[localAgent] || PROSPECT_AGENTS.CARDONE;
  const nextStatuses   = STATUS_FLOW[prospect.status || 'Nouveau'] || [];
  const altAgents      = Object.keys(PROSPECT_AGENTS).filter((k) => k !== localAgent);

  function Field({ label, field, value, href, sourceKey }) {
    const editing = editField === field;
    // Step 7 confidence from cross-validation
    const cv = prospect._confidences?.[field];
    // Conflict data
    const conflict = prospect._conflicts?.[field];

    // Confidence indicator
    const ConfidenceDot = () => {
      if (!cv || !value) return null;
      if (cv.status === 'verified')      return <span title={`Vérifié par ${(cv.sources||[]).join('+')} — 95% confiance`} style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>✓✓</span>;
      if (cv.status === 'single_source') return <span title={`Source unique (${cv.source}) — 50% confiance`} style={{ fontSize: 10, color: '#6366F1', fontWeight: 700 }}>✓</span>;
      if (cv.status === 'conflict')      return <span title="Données conflictuelles — voir détails" style={{ fontSize: 10, color: '#D97706', fontWeight: 700 }}>⚠</span>;
      return null;
    };

    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          {label}
          {sourceKey && value && <SourceBadge src={sourceKey} />}
          <ConfidenceDot />
        </div>
        {editing ? (
          <input autoFocus value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditField(null); }}
            style={{ width: '100%', background: '#F5F4F0', border: '1px solid #6366F1', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#1A1917', outline: 'none' }}
          />
        ) : value ? (
          <>
            <div onClick={() => startEdit(field, value)}
              style={{ fontSize: 13, color: '#1A1917', cursor: 'text', padding: '4px 0', borderBottom: '1px solid transparent', transition: 'border-color 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = '#E8E6E0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; }}>
              {href
                ? <a href={href} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ color: '#6366F1', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{value} <ExternalLink size={10} /></a>
                : value}
            </div>
            {/* Step 8: Conflict display — show both values, never auto-pick */}
            {conflict && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: '#FFFBEB', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', marginBottom: 4 }}>
                  ⚠ Données conflictuelles — à vérifier
                </div>
                {conflict.map((c, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#5F5E5A', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600, color: '#1A1917' }}>{c.source}</span> : {String(c.value)}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Step 8: Intelligent null handling — actionable next steps */
          (() => {
            let domain = null;
            try { if (prospect.website) domain = new URL(prospect.website.startsWith('http') ? prospect.website : 'https://' + prospect.website).hostname.replace('www.',''); } catch {}
            const nullGuides = {
              phone: {
                msg: 'Numéro non trouvé publiquement',
                actions: [
                  { label: 'Chercher sur Facebook', href: `https://www.facebook.com/search/top?q=${encodeURIComponent(prospect.businessName + ' ' + prospect.city)}` },
                ],
              },
              email: {
                msg: 'Email non trouvé',
                actions: [
                  ...(domain ? [
                    { label: `Essayer info@${domain}`, href: `mailto:info@${domain}` },
                    { label: `Essayer contact@${domain}`, href: `mailto:contact@${domain}` },
                  ] : []),
                  { label: 'Chercher sur LinkedIn', href: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(prospect.businessName + ' ' + prospect.city)}` },
                ],
              },
              contactName: {
                msg: 'Propriétaire non identifié',
                actions: [
                  { label: 'LinkedIn', href: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(prospect.businessName + ' ' + prospect.city)}` },
                  { label: 'Facebook About', href: `https://www.facebook.com/search/top?q=${encodeURIComponent(prospect.businessName + ' ' + prospect.city)}` },
                ],
              },
              website: {
                msg: null, // handled specially below — no website = strong buying signal
                actions: [],
                signal: true,
              },
            };
            const guide = nullGuides[field];
            if (field === 'website') {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div onClick={() => startEdit(field, '')} style={{ fontSize: 12, color: '#C4C2BB', cursor: 'text', padding: '4px 0' }}>Cliquer pour ajouter…</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#6366F1' }}>🎯 Sans site web — cible idéale NT Solutions</span>
                  </div>
                </div>
              );
            }
            if (guide) {
              return (
                <div>
                  <div style={{ fontSize: 12, color: '#C4C2BB', marginBottom: 4 }}>{guide.msg}</div>
                  {guide.actions.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {guide.actions.map((a, i) => (
                        <a key={i} href={a.href} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 10, fontWeight: 600, color: '#6366F1', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '2px 8px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          {a.label} →
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return <div onClick={() => startEdit(field, '')} style={{ fontSize: 13, color: '#C4C2BB', cursor: 'text', padding: '4px 0' }}>Cliquer pour ajouter…</div>;
          })()
        )}
      </div>
    );
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.06)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: '#F5F4F0', borderLeft: '1px solid #E8E6E0',
        zIndex: 50, overflowY: 'auto', padding: 24,
        boxShadow: '-4px 0 32px rgba(0,0,0,0.08)',
        animation: 'panelSlideIn 280ms cubic-bezier(0.16,1,0.3,1) forwards',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#1A1917', lineHeight: 1.2 }}>
              {prospect.businessName || 'Sans nom'}
            </div>
            <div style={{ fontSize: 12, color: '#9B9890', marginTop: 4 }}>
              {[prospect.type, prospect.city, prospect.googleRating ? `${prospect.googleRating}★` : null].filter(Boolean).join(' · ')}
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status={prospect.status || 'Nouveau'} />
              <VerificationBadge prospect={prospect} />
              {prospect.source === 'ai' && (
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6366F1', background: 'rgba(99,102,241,0.08)', padding: '2px 8px', borderRadius: 10 }}>
                  🤖 Trouvé par l'IA
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#F5F4F0', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B9890' }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Buying signals ── */}
        {(() => {
          const sigs = detectSignals(prospect);
          if (sigs.length === 0) return null;
          return (
            <div style={{ marginBottom: 16, padding: '12px 14px', background: '#FAFAF8', border: '1px solid #E8E6E0', borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 8 }}>
                Signaux d'achat détectés
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sigs.map((k) => {
                  const cfg = SIGNAL_CONFIG[k];
                  return (
                    <SignalTag
                      key={k}
                      signalKey={k}
                      onClick={() => switchAgent(cfg.agent)}
                    />
                  );
                })}
              </div>
              {sigs[0] && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#9B9890', fontStyle: 'italic' }}>
                  Approche recommandée : {SIGNAL_CONFIG[sigs[0]]?.approach}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Chirurgical reasoning — "Pourquoi ce prospect" ── */}
        {prospect.whyThisOne && (
          <div style={{
            marginBottom: 16,
            background: 'rgba(99,102,241,0.05)',
            border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: 12, padding: '12px 14px',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>🎯</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366F1', marginBottom: 4 }}>
                Pourquoi ce prospect
              </div>
              <div style={{ fontSize: 12, color: '#3730A3', lineHeight: 1.55, fontStyle: 'italic' }}>
                {prospect.whyThisOne}
              </div>
            </div>
          </div>
        )}

        {/* ── Score card ── */}
        <div style={{ background: '#F5F4F0', borderRadius: 12, padding: '16px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 52, fontWeight: 300, color: c, lineHeight: 1 }}>{prospect.score || 5}</div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginTop: 6 }}>
            Score d'opportunité
          </div>
          {prospect.googleReviews != null && (
            <div style={{ fontSize: 11, color: '#9B9890', marginTop: 4 }}>
              {Math.max(0, 50 - (prospect.googleReviews || 0))} avis manquants pour maximiser la visibilité
            </div>
          )}
          {/* Smart agent rationale */}
          <div style={{ marginTop: 8, fontSize: 10, color: '#9B9890', fontStyle: 'italic' }}>
            {selectBestAgent(prospect).rationale}
          </div>
        </div>

        {/* ── Improvements (AI-found only) ── */}
        {(prospect.improvements || []).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 10 }}>
              Ce qui manque sur leur profil Google
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {prospect.improvements.map((imp, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 20,
                  background: '#FEF9EC', color: '#854F0B',
                  border: '1px solid rgba(133,79,11,0.15)',
                }}>
                  ⚠ {imp}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Competitive context (S/A tier only) ── */}
        {(loadingCompetitors || competitorData) && (
          <div style={{ marginBottom: 20, padding: '14px', background: '#F5F4F0', border: '1px solid #E8E6E0', borderRadius: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 10 }}>
              Contexte concurrentiel
            </div>
            {loadingCompetitors && !competitorData ? (
              <div style={{ fontSize: 12, color: '#9B9890', fontStyle: 'italic' }}>Analyse des concurrents…</div>
            ) : competitorData ? (
              <>
                {/* Subject vs competitors table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {/* Subject row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1917', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ▶ {competitorData.subject?.name || prospect.businessName}
                    </span>
                    <span style={{ fontSize: 12, color: '#6366F1', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                      {competitorData.subject?.reviews ?? prospect.googleReviews ?? '—'} avis · {competitorData.subject?.rating ?? prospect.googleRating ?? '—'}★
                    </span>
                  </div>
                  {/* Competitor rows */}
                  {(competitorData.competitors || []).filter((c) => c.name).map((comp, i) => {
                    const gap = (competitorData.subject?.reviews || 0) - (comp.reviews || 0);
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#F5F4F0', borderRadius: 8, border: '1px solid #E8E6E0' }}>
                        <span style={{ fontSize: 12, color: '#3D3D3A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {comp.name}
                        </span>
                        <span style={{ fontSize: 12, color: gap > 0 ? '#059669' : '#DC2626', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                          {comp.reviews ?? '—'} avis · {comp.rating ?? '—'}★
                        </span>
                      </div>
                    );
                  })}
                </div>
                {competitorData.gapAnalysis && (
                  <div style={{ fontSize: 11, color: '#5F5E5A', fontStyle: 'italic', lineHeight: 1.5 }}>
                    💡 {competitorData.gapAnalysis}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ── Step 10: Deep Intelligence Report (Tier S only) ── */}
        {(loadingDeep || deepIntel) && (
          <div style={{ marginBottom: 20, padding: '14px', background: '#0F172A', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366F1', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔬</span> Analyse Profonde — Élite
            </div>
            {loadingDeep && !deepIntel ? (
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)', fontStyle: 'italic' }}>
                {deepStatus || 'Analyse des traces numériques…'}
              </div>
            ) : deepIntel ? (
              <>
                {deepIntel.ownerProfile && (
                  <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5, borderLeft: '2px solid rgba(99,102,241,0.4)', paddingLeft: 10 }}>
                    {deepIntel.ownerProfile}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(deepIntel.insights || []).map((ins, i) => (
                    <div key={i} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, borderLeft: `3px solid ${i === 0 ? '#6366F1' : 'rgba(99,102,241,0.3)'}` }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#E2E8F0', marginBottom: 2 }}>{ins.fact}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>→ {ins.reveals}</div>
                      {ins.opportunity && (
                        <div style={{ fontSize: 10, color: '#818CF8', fontWeight: 600 }}>💡 {ins.opportunity}</div>
                      )}
                    </div>
                  ))}
                </div>
                {deepIntel.urgencyLevel && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: deepIntel.urgencyLevel === 'high' ? 'rgba(220,38,38,0.2)' : deepIntel.urgencyLevel === 'medium' ? 'rgba(217,119,6,0.2)' : 'rgba(5,150,105,0.2)',
                      color: deepIntel.urgencyLevel === 'high' ? '#FCA5A5' : deepIntel.urgencyLevel === 'medium' ? '#FCD34D' : '#6EE7B7',
                    }}>
                      Urgence : {deepIntel.urgencyLevel === 'high' ? 'ÉLEVÉE' : deepIntel.urgencyLevel === 'medium' ? 'MODÉRÉE' : 'FAIBLE'}
                    </span>
                    {deepIntel.bestApproachTime && (
                      <span style={{ fontSize: 10, color: '#64748B' }}>Meilleur moment : {deepIntel.bestApproachTime}</span>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ── Contact info ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 12 }}>
            Informations de contact
          </div>
          <Field label={prospect.ownerVerifiedCanada411 ? "Nom contact · Propriétaire vérifié Canada411" : "Nom contact"}  field="contactName"    value={prospect.contactName} sourceKey={prospect.sources?.contactName} />
          <Field label="Email"        field="email"          value={prospect.email}        sourceKey={prospect.sources?.email} />
          <Field label="Téléphone"    field="phone"          value={prospect.phone}        sourceKey={prospect.sources?.phone} />
          <Field label="Site web"     field="website"        value={prospect.website}      href={prospect.website} sourceKey={prospect.sources?.website} />
          {prospect.fbPage && (
            <Field label="Facebook"   field="fbPage"         value={prospect.fbPage}       href={prospect.fbPage}  sourceKey="F" />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Avis Google"  field="googleReviews" value={prospect.googleReviews != null ? String(prospect.googleReviews) : ''} sourceKey="G" />
            <Field label="Note Google"  field="googleRating"  value={prospect.googleRating  != null ? String(prospect.googleRating)  : ''} sourceKey="G" />
          </div>
        </div>

        {/* ── Message de prospection ── */}
        <div style={{
          border: `1px solid rgba(${activeAgent.glowRgb},0.25)`,
          borderRadius: 14, padding: 16, marginBottom: 20,
          background: `rgba(${activeAgent.glowRgb},0.03)`,
        }}>
          {/* header row: label + alternative agent circles */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: `rgb(${activeAgent.glowRgb})` }}>
              Message de prospection
            </div>
            {/* 4 alternative agent circles */}
            <div style={{ display: 'flex', gap: 4 }}>
              {altAgents.map((key) => {
                const a = PROSPECT_AGENTS[key];
                return (
                  <button key={key} onClick={() => !generatingMsg && switchAgent(key)}
                    title={`${a.commercialName} — ${a.label}`}
                    disabled={generatingMsg}
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      border: '2px solid transparent',
                      background: `rgba(${a.glowRgb},0.1)`,
                      color: `rgb(${a.glowRgb})`,
                      fontSize: 8, fontWeight: 700, cursor: generatingMsg ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', opacity: generatingMsg ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (!generatingMsg) { e.currentTarget.style.border = `2px solid rgba(${a.glowRgb},0.5)`; e.currentTarget.style.background = `rgba(${a.glowRgb},0.2)`; }}}
                    onMouseLeave={(e) => { e.currentTarget.style.border = '2px solid transparent'; e.currentTarget.style.background = `rgba(${a.glowRgb},0.1)`; }}
                  >
                    {a.initial}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary agent chip */}
          <AgentChip agentKey={localAgent} />

          {/* Message content */}
          {generatingMsg ? (
            <p style={{ fontSize: 13, color: '#9B9890', fontStyle: 'italic', lineHeight: 1.7, marginBottom: 14 }}>
              Rédaction en cours…
            </p>
          ) : displayMsg ? (
            <p style={{ fontSize: 13, color: '#3D3D3A', lineHeight: 1.7, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
              {displayMsg}
            </p>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#C4C2BB', marginBottom: 12 }}>Aucun message généré</div>
            </div>
          )}

          {/* Subject line */}
          {localSubject && (
            <div style={{ fontSize: 11, color: '#9B9890', marginBottom: 12, padding: '6px 10px', background: '#F5F4F0', borderRadius: 8 }}>
              <span style={{ fontWeight: 600 }}>Objet : </span>{localSubject}
            </div>
          )}

          {/* Variant switcher — shown when variants exist */}
          {msgVariants.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '6px 10px', background: '#F5F4F0', borderRadius: 8 }}>
              <button
                onClick={() => {
                  const prev = (activeVariant - 1 + msgVariants.length) % msgVariants.length;
                  setActiveVariant(prev);
                  setLocalMsg(msgVariants[prev].message);
                  setLocalAgent(msgVariants[prev].agentKey);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6366F1', padding: '0 4px' }}
              >‹</button>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#9B9890', letterSpacing: '0.06em' }}>
                VARIANTE {activeVariant + 1} / {msgVariants.length} — {PROSPECT_AGENTS[msgVariants[activeVariant]?.agentKey]?.commercialName || ''}
              </span>
              <button
                onClick={() => {
                  const next = (activeVariant + 1) % msgVariants.length;
                  setActiveVariant(next);
                  setLocalMsg(msgVariants[next].message);
                  setLocalAgent(msgVariants[next].agentKey);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6366F1', padding: '0 4px' }}
              >›</button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => displayMsg && navigator.clipboard.writeText(displayMsg)}
              disabled={!displayMsg || generatingMsg}
              style={{ height: 36, borderRadius: 8, border: '1px solid #E8E6E0', background: '#F5F4F0', color: '#3D3D3A', fontSize: 11, fontWeight: 500, cursor: displayMsg ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: !displayMsg ? 0.4 : 1 }}>
              Copier
            </button>

            <button
              onClick={handleGenerateVariants}
              disabled={generatingVariants || generatingMsg}
              title="Générer 3 variantes adaptées aux signaux détectés"
              style={{ height: 36, borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)', color: '#6366F1', fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: (generatingVariants || generatingMsg) ? 0.6 : 1 }}>
              <Sparkles size={10} />
              {generatingVariants ? '3 en cours…' : '3 variantes'}
            </button>

            <a
              href={gmailUrl(prospect.email, displaySubject, displayMsg)}
              target="_blank" rel="noopener"
              onClick={(e) => { if (!prospect.email || generatingMsg) e.preventDefault(); }}
              style={{
                height: 36, borderRadius: 8, border: 'none',
                background: prospect.email && !generatingMsg ? `rgb(${activeAgent.glowRgb})` : '#E8E6E0',
                color: prospect.email && !generatingMsg ? '#fff' : '#9B9890',
                fontSize: 11, fontWeight: 600,
                cursor: prospect.email && !generatingMsg ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                textDecoration: 'none', transition: 'opacity 0.15s',
              }}>
              <Send size={10} /> Gmail →
            </a>
          </div>

          {prospect.email ? (
            <div style={{ fontSize: 10, color: '#9B9890', textAlign: 'center' }}>
              Envoi à <span style={{ color: '#6366F1' }}>{prospect.email}</span> · Approuver avant envoi
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#C4C2BB', textAlign: 'center' }}>
              Ajoute l'email pour activer l'envoi en un clic
            </div>
          )}
        </div>

        {/* ── Notes libres ── */}
        {prospect.notes && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 13, color: '#3D3D3A', lineHeight: 1.6 }}>{prospect.notes}</div>
          </div>
        )}

        {/* ── Raison perdu ── */}
        {prospect.status === 'Perdu' && prospect.lostReason && (
          <div style={{ marginBottom: 20, padding: '10px 14px', background: '#FEF2F2', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B91C1C', marginBottom: 4 }}>Raison</div>
            <div style={{ fontSize: 12, color: '#3D3D3A', lineHeight: 1.5 }}>{prospect.lostReason}</div>
          </div>
        )}

        {/* ── Prospect timeline — digital activity footprint ── */}
        {(() => {
          // Build timeline items from available enrichment data
          const items = [];
          if (prospect.lastReviewDate) {
            const d = new Date(prospect.lastReviewDate);
            const label = d.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', year: 'numeric' });
            const neg = prospect.lastReviewSentiment === 'negative';
            items.push({ date: label, event: `Dernier avis Google reçu${neg ? ' (négatif)' : ''}`, color: neg ? '#DC2626' : '#059669' });
          }
          if (prospect.lastPostDays != null) {
            const days = parseInt(prospect.lastPostDays, 10);
            items.push({ date: `Il y a ${days}j`, event: 'Dernier post Facebook', color: days > 60 ? '#DC2626' : days > 30 ? '#D97706' : '#059669' });
          }
          if (prospect.website) {
            items.push({ date: '—', event: 'Site web actif détecté', color: '#059669' });
          }
          if (prospect.newsSnippet) {
            items.push({ date: '2024–2025', event: prospect.newsSnippet, color: '#8B5CF6' });
          }
          if (prospect.createdAt) {
            const d = new Date(prospect.createdAt);
            items.push({ date: d.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' }), event: 'Ajouté à ta liste', color: '#9B9890' });
          }
          if (items.length === 0) return null;

          // Fenêtre d'opportunité — based on most recent activity
          const activityDays = prospect.lastPostDays != null ? parseInt(prospect.lastPostDays, 10)
            : prospect.lastReviewDate ? Math.floor((Date.now() - new Date(prospect.lastReviewDate)) / 86400000)
            : null;
          let window = null;
          if (activityDays !== null) {
            if (activityDays <= 60)       window = { label: 'Fenêtre ouverte — contacter maintenant', color: '#059669', bg: 'rgba(5,150,105,0.08)' };
            else if (activityDays <= 120)  window = { label: 'Fenêtre se ferme', color: '#D97706', bg: 'rgba(217,119,6,0.08)' };
            else                           window = { label: 'Prospect dormant — approche douce', color: '#DC2626', bg: 'rgba(220,38,38,0.08)' };
          }

          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 10 }}>
                Activité détectée
              </div>
              {window && (
                <div style={{ marginBottom: 10, padding: '6px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6, background: window.bg, border: `1px solid ${window.color}33` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: window.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: window.color, letterSpacing: '0.04em' }}>{window.label}</span>
                </div>
              )}
              <div style={{ position: 'relative', paddingLeft: 16 }}>
                <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1, background: '#E8E6E0' }} />
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -14, top: 5, width: 8, height: 8, borderRadius: '50%', background: item.color, border: '2px solid #FFFFFF', flexShrink: 0 }} />
                    <div style={{ fontSize: 10, color: '#9B9890', minWidth: 60, whiteSpace: 'nowrap', paddingTop: 1 }}>{item.date}</div>
                    <div style={{ fontSize: 12, color: '#3D3D3A', lineHeight: 1.4 }}>{item.event}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Historique ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 12 }}>
            Historique des contacts
          </div>
          {(prospect.contactHistory || []).length === 0 && (
            <div style={{ fontSize: 12, color: '#C4C2BB', marginBottom: 12 }}>Aucun contact enregistré.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {(prospect.contactHistory || []).map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#9B9890' }}>
                    {new Date(entry.date).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' })} · {entry.channel}
                  </div>
                  <div style={{ fontSize: 12, color: '#3D3D3A', marginTop: 1 }}>{entry.note}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: '#F5F4F0', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {['Email', 'Téléphone', 'Messenger', 'En personne'].map((ch) => (
                <button key={ch} onClick={() => setNoteChannel(ch)}
                  style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: noteChannel === ch ? '#6366F1' : '#E8E6E0',
                    color: noteChannel === ch ? '#fff' : '#5F5E5A', fontWeight: 500, transition: 'all 0.12s',
                  }}>
                  {ch}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
                placeholder="Ajouter une note…"
                style={{ flex: 1, background: '#F5F4F0', border: '1px solid #E8E6E0', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', color: '#1A1917' }}
              />
              <button onClick={addNote} style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>+</button>
            </div>
          </div>
        </div>

        {/* ── Status actions ── */}
        <div style={{ borderTop: '1px solid #E8E6E0', paddingTop: 16 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <button onClick={() => nextStatuses.length > 0 && setShowStatusMenu((s) => !s)}
              disabled={nextStatuses.length === 0}
              style={{
                width: '100%', height: 40, borderRadius: 10, border: '1px solid #E8E6E0',
                background: '#F5F4F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 14px', fontSize: 13, color: '#3D3D3A', cursor: nextStatuses.length > 0 ? 'pointer' : 'default',
                fontWeight: 500, opacity: nextStatuses.length === 0 ? 0.5 : 1,
              }}>
              <span>Statut actuel : <strong>{prospect.status || 'Nouveau'}</strong></span>
              {nextStatuses.length > 0 && <ChevronDown size={13} />}
            </button>
            {showStatusMenu && (
              <div style={{ position: 'absolute', bottom: '110%', left: 0, right: 0, background: '#F5F4F0', border: '1px solid #E8E6E0', borderRadius: 10, overflow: 'hidden', zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890' }}>
                  Avancer vers
                </div>
                {nextStatuses.map((s) => {
                  const cfg = STATUS_CONFIG[s] || {};
                  return (
                    <button key={s}
                      onClick={() => handleStatusSelect(s)}
                      style={{
                        width: '100%', padding: '10px 14px', textAlign: 'left',
                        background: '#F5F4F0', border: 'none', cursor: 'pointer',
                        fontSize: 13, color: '#1A1917',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F4F0'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F4F0'; }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color === '#F5F4F0' ? '#0F172A' : (cfg.color || '#9B9890'), flexShrink: 0 }} />
                      {s}
                      {s === 'Signé'  && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9B9890' }}>🎉 + retainer</span>}
                      {s === 'Perdu'  && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9B9890' }}>raison requise</span>}
                      {s === 'Prêt'   && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4338CA' }}>auto si email+msg</span>}
                      {s === 'Cible'  && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9B9890' }}>a du contact info</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button onClick={() => { if (window.confirm(`Supprimer ${prospect.businessName} ?`)) onDelete(prospect.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#E74C3C', padding: 0 }}>
            Supprimer ce prospect
          </button>
        </div>
      </div>

      {/* ── Signature confirmation modal ── */}
      {showSignModal && (
        <>
          <div onClick={() => setShowSignModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 80 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, background: '#F5F4F0', borderRadius: 16, zIndex: 90, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: '#1A1917', margin: '0 0 8px' }}>Confirmer la signature</h3>
            <p style={{ fontSize: 13, color: '#9B9890', margin: '0 0 20px', lineHeight: 1.6 }}>
              <strong>{prospect.businessName}</strong> devient un client. Un retainer de <strong>150 $/mois</strong> sera automatiquement ajouté au dashboard.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSignModal(false)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E8E6E0', background: '#F5F4F0', color: '#5F5E5A', fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={confirmSignature}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: '#0F172A', color: '#F5F4F0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ✓ Confirmer la signature
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Lost reason modal ── */}
      {showLostModal && (
        <>
          <div onClick={() => setShowLostModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 80 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, background: '#F5F4F0', borderRadius: 16, zIndex: 90, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: '#1A1917', margin: '0 0 6px' }}>Pourquoi ce prospect est perdu ?</h3>
            <p style={{ fontSize: 13, color: '#9B9890', margin: '0 0 16px', lineHeight: 1.5 }}>
              Cette info aide à améliorer ta stratégie.
            </p>
            <textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex : Prix trop élevé, pas intéressé, concurrent choisi…"
              style={{ width: '100%', background: '#F5F4F0', border: '1px solid #E8E6E0', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#1A1917', outline: 'none', resize: 'vertical', minHeight: 80, boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowLostModal(false); setLostReason(''); }}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E8E6E0', background: '#F5F4F0', color: '#5F5E5A', fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={confirmLost} disabled={!lostReason.trim()}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: lostReason.trim() ? '#E74C3C' : '#E8E6E0', color: lostReason.trim() ? '#F5F4F0' : '#9B9890', fontSize: 13, fontWeight: 600, cursor: lostReason.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                Marquer comme perdu
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Search Modal static data ─────────────────────────────────────────────────
const SM_NICHES = [
  [
    { key: 'restaurant',  label: 'Restaurant' },
    { key: 'salon',       label: 'Salon / Coiffure' },
    { key: 'garage',      label: 'Garage / Mécanique' },
    { key: 'clinique',    label: 'Clinique' },
  ],
  [
    { key: 'immobilier',  label: 'Agent immobilier' },
    { key: 'plombier',    label: 'Plombier / Électricien' },
    { key: 'gym',         label: 'Gym / Fitness' },
    { key: 'coach',       label: 'Coach / Consultant' },
    { key: 'toiturier',   label: 'Toiturier' },
    { key: 'autre',       label: 'Autre' },
  ],
];

const SM_REGIONS = [
  [
    { key: 'montreal',    label: 'Montréal' },
    { key: 'laval',       label: 'Laval' },
    { key: 'longueuil',   label: 'Longueuil' },
    { key: 'rive-sud',    label: 'Rive-Sud' },
    { key: 'rive-nord',   label: 'Rive-Nord' },
  ],
  [
    { key: 'quebec',      label: 'Québec' },
    { key: 'lanaudiere',  label: 'Lanaudière' },
    { key: 'laurentides', label: 'Laurentides' },
    { key: 'estrie',      label: 'Estrie' },
    { key: 'tout',        label: 'Tout le Québec' },
  ],
];

const SM_FILTERS = [
  { key: 'few_reviews', label: 'Moins de 20 avis Google' },
  { key: 'low_rating',  label: 'Note inférieure à 4 étoiles' },
  { key: 'no_website',  label: 'Sans site web' },
];

// Niche key → prompt text used in auto-query
const NICHE_PROMPT = {
  restaurant:  'restaurants',
  salon:       'salons de coiffure',
  garage:      'garages / ateliers mécaniques',
  clinique:    'cliniques',
  immobilier:  'agents immobiliers',
  plombier:    'plombiers et électriciens',
  gym:         'gyms et studios de fitness',
  coach:       'coachs et consultants',
  toiturier:   'toituriers',
  autre:       'commerces locaux',
};

// ─── Search Modal ──────────────────────────────────────────────────────────────
function SearchModal({ onClose, onStartSearch }) {
  const [searchMode, setSearchMode]                 = useState('standard'); // 'standard' | 'chirurgical'
  const [selectedChirurgicalAgent, setSelectedChirurgicalAgent] = useState('VOSS');
  const [searchDepth, setSearchDepth]               = useState('approfondie'); // 'surface' | 'approfondie' | 'maximale'
  const [autoEnrich, setAutoEnrich]                 = useState(false); // smart default applied below
  const [showMaximaleConfirm, setShowMaximaleConfirm] = useState(false);
  const [query, setQuery]                   = useState('');
  const [selectedNiches, setSelectedNiches] = useState(new Set());
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [activeFilters, setActiveFilters]   = useState(new Set());
  const [count, setCount]                   = useState(6);

  // Smart auto-enrich default: ON only when it's cheap enough to be safe
  useEffect(() => {
    if (searchDepth === 'maximale') { setAutoEnrich(true);  return; }
    if (searchDepth === 'surface')  { setAutoEnrich(false); return; }
    setAutoEnrich(count <= 6); // approfondie: free for small batches
  }, [count, searchDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-populate textarea whenever toggles change ──
  useEffect(() => {
    const nicheLabels = SM_NICHES.flat().filter((n) => selectedNiches.has(n.key)).map((n) => NICHE_PROMPT[n.key] || n.label);
    const regionItem  = SM_REGIONS.flat().find((r) => r.key === selectedRegion);

    const filterParts = [];
    if (activeFilters.has('few_reviews')) filterParts.push('moins de 20 avis Google');
    if (activeFilters.has('low_rating'))  filterParts.push('note inférieure à 4 étoiles');
    if (activeFilters.has('no_website'))  filterParts.push('sans site web');

    let main = nicheLabels.length > 0
      ? nicheLabels.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(' et ')
      : '';
    if (regionItem) {
      const loc = selectedRegion === 'tout' ? 'partout au Québec' : `à ${regionItem.label}`;
      main = main ? `${main} ${loc}` : loc;
    } else if (main) {
      main = `${main} au Québec`;
    }
    const suffix = filterParts.length > 0 ? ` avec ${filterParts.join(', ')}` : '';
    const auto = main + suffix;
    if (auto) setQuery(auto);
  }, [selectedNiches, selectedRegion, activeFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle helpers ──
  function toggleNiche(key) {
    setSelectedNiches((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleRegion(key) {
    setSelectedRegion((prev) => (prev === key ? null : key));
  }
  function toggleFilter(key) {
    setActiveFilters((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const canSearch = selectedNiches.size > 0 || selectedRegion || activeFilters.size > 0 || query.trim();

  // ── Build structured search params ──
  function buildSearchParams() {
    const nicheLabels = SM_NICHES.flat()
      .filter((n) => selectedNiches.has(n.key))
      .map((n) => NICHE_PROMPT[n.key] || n.label);

    const filterSuffixes = [];
    if (activeFilters.has('few_reviews')) filterSuffixes.push('avec moins de 20 avis Google');
    if (activeFilters.has('low_rating'))  filterSuffixes.push('avec note inférieure à 4 étoiles');
    if (activeFilters.has('no_website'))  filterSuffixes.push('sans site web');

    const regionItem = SM_REGIONS.flat().find((r) => r.key === selectedRegion);
    const regionText = !regionItem
      ? null
      : selectedRegion === 'tout'
        ? 'partout au Québec'
        : regionItem.label;

    // Append filter constraints to each niche label
    const suffix = filterSuffixes.length > 0 ? ` ${filterSuffixes.join(', ')}` : '';
    const enrichedNiches = nicheLabels.map((l) => l + suffix);

    return {
      niches:            enrichedNiches,
      region:            regionText,
      count,
      description:       query.trim(),
      searchMode,
      chirurgicalAgent:  searchMode === 'chirurgical' ? selectedChirurgicalAgent : null,
      searchDepth:       searchMode === 'chirurgical' ? searchDepth : 'approfondie',
      autoEnrich,
    };
  }

  // ── Style helpers ──
  const pill = (active) => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    border: `1px solid ${active ? '#6366F1' : '#E8E6E0'}`,
    background: active ? '#6366F1' : '#F5F4F0',
    color: active ? '#F5F4F0' : '#5F5E5A',
    cursor: 'pointer', transition: 'all 0.15s ease',
    whiteSpace: 'nowrap', lineHeight: 1,
  });

  const sLabel = {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#9B9890',
    marginBottom: 8, display: 'block',
  };

  const inputStyle = {
    width: '100%', background: '#F5F4F0', border: '1px solid #E8E6E0',
    borderRadius: 10, padding: '9px 12px', fontSize: 13, color: '#1A1917',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, maxHeight: 'calc(100vh - 200px - env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', background: '#F5F4F0', borderRadius: 20, zIndex: 70, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid #E8E6E0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: '#1A1917', margin: 0 }}>Chercher des prospects</h2>
              <p style={{ fontSize: 12, color: '#9B9890', margin: '4px 0 0' }}>
                {searchMode === 'chirurgical'
                  ? 'Ciblage précis — un agent, une niche, une intention claire'
                  : 'Sélectionne une niche et une région — les prospects apparaissent en direct'}
              </p>
            </div>
            <button onClick={onClose} style={{ background: '#F5F4F0', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B9890', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 32px' }}>

          {/* ── Conversion insights — shown after 5+ conversions ── */}
          {(() => {
            const insights = getConversionInsights();
            if (!insights) return null;
            return (
              <div style={{ marginBottom: 20, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366F1', marginBottom: 8 }}>
                  🧠 Basé sur tes {insights.count} conversions passées
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Meilleure niche', value: insights.topType },
                    { label: 'Signal gagnant',   value: insights.topSignalLabel },
                    { label: 'Agent le plus efficace', value: insights.topAgentLabel },
                    { label: 'Délai moyen closing', value: insights.avgDays != null ? `${insights.avgDays} jours` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#F5F4F0', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: '#9B9890', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1917' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── MODE TOGGLE ── */}
          <div style={{ marginBottom: 20 }}>
            <span style={sLabel}>Mode de recherche</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { key: 'standard',    icon: '⚡', title: 'Standard',    sub: 'Large spectre · plusieurs niches · volume',        dataTour: 'standard-mode' },
                { key: 'chirurgical', icon: '🎯', title: 'Chirurgical', sub: 'Ciblage précis · un agent · intention définie',     dataTour: 'chirurgical-mode' },
              ].map(({ key, icon, title, sub, dataTour }) => {
                const active = searchMode === key;
                return (
                  <button
                    key={key}
                    data-tour={dataTour}
                    onClick={() => setSearchMode(key)}
                    style={{
                      padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      border: `2px solid ${active ? '#6366F1' : '#E8E6E0'}`,
                      background: active ? 'rgba(99,102,241,0.05)' : '#FAFAF8',
                      textAlign: 'left', transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = '#C7C9F7'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = '#E8E6E0'; }}
                  >
                    <div style={{ fontSize: 15, lineHeight: 1, marginBottom: 5 }}>{icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#4338CA' : '#1A1917', lineHeight: 1 }}>{title}</div>
                    <div style={{ fontSize: 11, color: '#9B9890', marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
                    {active && (
                      <div style={{ marginTop: 6, width: 16, height: 2, borderRadius: 1, background: '#6366F1' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── AGENT CHIRURGIEN — only in chirurgical mode ── */}
          {searchMode === 'chirurgical' && (
            <div style={{ marginBottom: 20 }}>
              <span style={sLabel}>Agent chirurgien</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CHIRURGICAL_AGENTS.map((row, ri) => (
                  <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                    {row.map((agentKey) => {
                      const agent  = PROSPECT_AGENTS[agentKey];
                      if (!agent) return null;
                      const rgb    = agent.glowRgb || '99,102,241';
                      const active = selectedChirurgicalAgent === agentKey;
                      return (
                        <button
                          key={agentKey}
                          onClick={() => setSelectedChirurgicalAgent(agentKey)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                            border: `2px solid ${active ? `rgb(${rgb})` : '#E8E6E0'}`,
                            background: active ? `rgba(${rgb},0.07)` : '#FAFAF8',
                            textAlign: 'left', transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = `rgba(${rgb},0.4)`; }}
                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = '#E8E6E0'; }}
                        >
                          {/* Avatar */}
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: `rgb(${rgb})`, color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700,
                          }}>
                            {agent.initial}
                          </div>
                          {/* Name + sub */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 600, lineHeight: 1.2,
                              color: active ? `rgb(${rgb})` : '#1A1917',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {agent.commercialName}
                            </div>
                            <div style={{ fontSize: 10, color: '#9B9890', lineHeight: 1.3, marginTop: 1 }}>
                              {agent.label}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PROFONDEUR DE RECHERCHE — only in chirurgical mode ── */}
          {searchMode === 'chirurgical' && (
            <div style={{ marginBottom: 20 }}>
              <span style={sLabel}>Profondeur de recherche</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { key: 'surface',     label: 'Surface',     sub: 'Rapide · coordonnées de base',         time: '~15s' },
                  { key: 'approfondie', label: 'Approfondie', sub: 'Équilibrée · avis Google + site web',  time: '~30s' },
                  { key: 'maximale',    label: 'Maximale',    sub: 'Exhaustive · Facebook + tout',         time: '~45s' },
                ].map(({ key, label, sub, time }) => {
                  const active = searchDepth === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSearchDepth(key)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${active ? '#6366F1' : '#E8E6E0'}`,
                        background: active ? 'rgba(99,102,241,0.05)' : '#FAFAF8',
                        textAlign: 'center', transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = '#C7C9F7'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = '#E8E6E0'; }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: active ? '#4338CA' : '#1A1917', lineHeight: 1 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 10, color: '#9B9890', marginTop: 3, lineHeight: 1.4 }}>
                        {sub}
                      </div>
                      <div style={{
                        marginTop: 5, fontSize: 10, fontWeight: 600,
                        color: active ? '#6366F1' : '#C4C2BB',
                      }}>
                        {time}/prospect
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── NICHE ── */}
          <div style={{ marginBottom: 20 }}>
            <span style={sLabel}>Niche</span>
            {SM_NICHES.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: ri < SM_NICHES.length - 1 ? 6 : 0 }}>
                {row.map(({ key, label }) => (
                  <button key={key} onClick={() => toggleNiche(key)} style={pill(selectedNiches.has(key))}>
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* ── RÉGION ── */}
          <div style={{ marginBottom: 20 }}>
            <span style={sLabel}>Région</span>
            {SM_REGIONS.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: ri < SM_REGIONS.length - 1 ? 6 : 0 }}>
                {row.map(({ key, label }) => (
                  <button key={key} onClick={() => toggleRegion(key)} style={pill(selectedRegion === key)}>
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* ── FILTRES RAPIDES ── */}
          <div style={{ marginBottom: 20 }}>
            <span style={sLabel}>Filtres</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {SM_FILTERS.map(({ key, label }) => {
                const on = activeFilters.has(key);
                return (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleFilter(key)}>
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${on ? '#6366F1' : '#D1D5DB'}`,
                      background: on ? '#6366F1' : '#F5F4F0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.12s',
                    }}>
                      {on && <Check size={9} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 12, color: on ? '#1A1917' : '#5F5E5A', fontWeight: on ? 500 : 400, transition: 'all 0.12s' }}>
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── QUANTITÉ ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={sLabel}>Quantité</span>
              <span style={{ fontSize: 12, color: '#5F5E5A', fontWeight: 500 }}>
                {count} prospect{count > 1 ? 's' : ''}
                <span style={{ color: '#9B9890', fontWeight: 400, marginLeft: 6 }}>
                  · ~{count <= 3 ? `${count * 30}s` : `${Math.ceil(count * 30 / 60)} min`}
                </span>
              </span>
            </div>
            <input
              type="range" min={3} max={20} step={1}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer', accentColor: '#6366F1' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#C4C2BB', marginTop: 4 }}>
              <span>3 — rapide</span>
              <span>20 — complet</span>
            </div>
            {/* Live cost estimate */}
            {(() => {
              const effectiveDepth = searchMode === 'chirurgical' ? searchDepth : 'approfondie';
              const cost = calcSearchCost(count, effectiveDepth, autoEnrich);
              const col  = costColor(cost);
              return (
                <div style={{ marginTop: 7, textAlign: 'right', fontSize: 11, fontWeight: 600, color: col }}>
                  Coût estimé : ~{fmtCost(cost)}
                </div>
              );
            })()}
          </div>

          {/* ── AFFINE TA RECHERCHE ── */}
          <div>
            <span style={sLabel}>Affine ta recherche <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: '#C4C2BB' }}>(optionnel)</span></span>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSearch) { onStartSearch(buildSearchParams()); } }}
              placeholder={canSearch ? 'Affine ou laisse tel quel…' : 'Sélectionne une niche ou décris ta cible pour commencer'}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 72, lineHeight: 1.6, transition: 'border-color 0.15s', borderColor: query.trim() ? '#6366F1' : '#E8E6E0' }}
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E8E6E0', flexShrink: 0 }}>

          {/* Auto-enrich toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1917' }}>
                Enrichissement automatique
              </div>
              <div style={{ fontSize: 11, color: '#9B9890', marginTop: 1 }}>
                {autoEnrich ? 'Coordonnées + avis Google via web search' : 'Noms seulement — enrichissement manuel'}
              </div>
            </div>
            <button
              onClick={() => {
                if (searchDepth !== 'maximale' && searchDepth !== 'surface') setAutoEnrich((v) => !v);
              }}
              title={searchDepth === 'maximale' ? 'Obligatoire en mode Maximale' : searchDepth === 'surface' ? 'Désactivé en mode Surface' : ''}
              style={{
                width: 42, height: 24, borderRadius: 12, border: 'none', position: 'relative',
                background: autoEnrich ? '#6366F1' : '#D1D5DB',
                cursor: (searchDepth === 'maximale' || searchDepth === 'surface') ? 'not-allowed' : 'pointer',
                opacity: (searchDepth === 'maximale' || searchDepth === 'surface') ? 0.65 : 1,
                transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: autoEnrich ? 21 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#F5F4F0',
                transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>

          {/* Maximale cost warning */}
          {searchDepth === 'maximale' && autoEnrich && !showMaximaleConfirm && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 12,
              background: 'rgba(153,60,29,0.06)', border: '1px solid rgba(153,60,29,0.2)',
              fontSize: 12, color: '#993C1D', lineHeight: 1.5,
            }}>
              ⚠ Recherche maximale — coût estimé ~{fmtCost(calcSearchCost(count, 'maximale', true))}
            </div>
          )}

          <div style={{ fontSize: 10, color: '#C4C2BB', marginBottom: 12, lineHeight: 1.5 }}>
            ⚠ Les données proviennent d'une recherche IA. Les prospects s'ajoutent en direct — vérifie avant d'envoyer.
          </div>

          {/* Maximale confirmation flow */}
          {searchDepth === 'maximale' && autoEnrich && showMaximaleConfirm ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowMaximaleConfirm(false)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E8E6E0', background: '#F5F4F0', color: '#5F5E5A', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={() => canSearch && onStartSearch(buildSearchParams())}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: '#993C1D', color: '#F5F4F0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Continuer quand même
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!canSearch) return;
                if (searchDepth === 'maximale' && autoEnrich) { setShowMaximaleConfirm(true); return; }
                onStartSearch(buildSearchParams());
              }}
              disabled={!canSearch}
              style={{
                width: '100%', height: 48, borderRadius: 12, border: 'none',
                background: canSearch ? '#6366F1' : '#E8E6E0',
                color: canSearch ? '#F5F4F0' : '#9B9890',
                fontSize: 14, fontWeight: 600,
                cursor: canSearch ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.15s',
              }}>
              {searchMode === 'chirurgical' ? '🎯' : <Sparkles size={15} />}
              {searchMode === 'chirurgical' ? 'Lancer la recherche ciblée' : 'Lancer la recherche'}
            </button>
          )}
          {!canSearch && (
            <p style={{ textAlign: 'center', fontSize: 11, color: '#C4C2BB', margin: '10px 0 0' }}>
              Sélectionne une niche ou décris ta cible pour commencer
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Add Prospect Modal ────────────────────────────────────────────────────────
function AddModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ businessName: '', type: 'Restaurant', city: '', contactName: '', email: '', phone: '', website: '', googleReviews: '', googleRating: '', notes: '' });
  function set(f, v) { setForm((p) => ({ ...p, [f]: v })); }
  function submit(e) {
    e.preventDefault();
    if (!form.businessName.trim()) return;
    const reviews = parseFloat(form.googleReviews) || 0;
    const rating  = parseFloat(form.googleRating)  || 3;
    const score   = calcScore(reviews, rating);
    const prospect = { googleReviews: reviews, googleRating: rating, ...form };
    const base = { id: genId(), ...form, googleReviews: reviews, googleRating: rating, score, agentKey: selectBestAgent(prospect).agentKey, contactHistory: [], createdAt: Date.now(), lastContactAt: null, source: 'manual' };
    onAdd({ ...base, status: autoStatus(base) });
    onClose();
  }
  const inputStyle = { width: '100%', background: '#F5F4F0', border: '1px solid #E8E6E0', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: '#1A1917', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 5, display: 'block' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 480, maxHeight: '90vh', overflowY: 'auto', background: '#F5F4F0', borderRadius: 16, zIndex: 70, boxShadow: '0 16px 48px rgba(0,0,0,0.14)', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: '#1A1917', margin: 0 }}>Nouveau prospect</h2>
          <button onClick={onClose} style={{ background: '#F5F4F0', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B9890' }}><X size={14} /></button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 14px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Nom du business *</label>
              <input required style={inputStyle} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Ex: Boulangerie Martin" />
            </div>
            <div><label style={labelStyle}>Type</label><select style={{ ...inputStyle, cursor: 'pointer' }} value={form.type} onChange={(e) => set('type', e.target.value)}>{BUSINESS_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label style={labelStyle}>Ville</label><input style={inputStyle} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Montréal" /></div>
            <div><label style={labelStyle}>Nom contact</label><input style={inputStyle} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Jean Tremblay" /></div>
            <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jean@example.com" /></div>
            <div><label style={labelStyle}>Téléphone</label><input style={inputStyle} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="514-000-0000" /></div>
            <div><label style={labelStyle}>Site web</label><input style={inputStyle} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></div>
            <div><label style={labelStyle}>Avis Google actuels</label><input style={inputStyle} type="number" min="0" value={form.googleReviews} onChange={(e) => set('googleReviews', e.target.value)} placeholder="12" /></div>
            <div><label style={labelStyle}>Note Google (1–5)</label><input style={inputStyle} type="number" min="1" max="5" step="0.1" value={form.googleRating} onChange={(e) => set('googleRating', e.target.value)} placeholder="4.2" /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={labelStyle}>Notes libres</label><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Observations, contexte…" /></div>
          </div>
          {(form.googleReviews || form.googleRating) && (
            <div style={{ margin: '16px 0 0', padding: '10px 14px', background: '#F5F4F0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ScoreCircle score={calcScore(form.googleReviews, form.googleRating)} size={28} />
              <span style={{ fontSize: 12, color: '#9B9890' }}>Score d'opportunité calculé automatiquement</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E8E6E0', background: '#F5F4F0', color: '#5F5E5A', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Annuler</button>
            <button type="submit" style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: '#6366F1', color: '#F5F4F0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ajouter le prospect</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd, onSearch }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 16 }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="8" y="14" width="32" height="3" rx="1.5" fill="#E8E6E0" />
        <rect x="8" y="22" width="24" height="3" rx="1.5" fill="#E8E6E0" />
        <rect x="8" y="30" width="28" height="3" rx="1.5" fill="#E8E6E0" />
      </svg>
      <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1917' }}>Ta liste est vide</div>
      <div style={{ fontSize: 13, color: '#9B9890', textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
        Ajoute un prospect manuellement ou laisse les agents chercher sur le web avec email, téléphone et message personnalisé.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onAdd} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid #6366F1', background: 'transparent', color: '#6366F1', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> Manuel
        </button>
        <button onClick={onSearch} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: '#6366F1', color: '#F5F4F0', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} /> Chercher des prospects
        </button>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ProspectsScreen({ darkMode }) {
  const [prospects, setProspects]           = useState(loadProspects);
  const [activeFilter, setActiveFilter]     = useState('Tous');
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedId, setSelectedId]         = useState(null);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toast, setToast]                   = useState(null);
  const [newIds, setNewIds]                 = useState(new Set()); // animate-in tracking
  const [isSearching, setIsSearching]       = useState(false);
  const [searchStatus, setSearchStatus]     = useState('');
  const [searchProgress, setSearchProgress] = useState({ found: 0, total: 0, skipped: 0 });
  const [skippedBizList, setSkippedBizList] = useState([]);       // biz objects skipped by 429
  const [discoveryRateLimit, setDiscoveryRateLimit] = useState(false); // discovery phase 429
  const [rlCountdown, setRlCountdown]       = useState(0);        // seconds until auto-retry
  const [enrichingIds, setEnrichingIds]     = useState(new Set()); // IDs currently being enriched
  const [lastSearchDiscoveryOnly, setLastSearchDiscoveryOnly] = useState(false);
  const [enrichQueue, setEnrichQueue]       = useState([]);        // background auto-enrich queue
  const [queueRunning, setQueueRunning]     = useState(false);
  const enrichQueueRef                      = useRef([]);
  const queueStopRef                        = useRef(false);
  const searchCancelRef                     = useRef(false);
  const lastSearchParamsRef                 = useRef(null);        // params stored for retry

  useEffect(() => { saveProspects(prospects); }, [prospects]);

  // Recalibration au démarrage — évaluation pure sans verrou
  // Utilise calcStatusFromFacts : même un prospect en "Répondu" ou "Client actif"
  // sans historique de contact réel sera ramené au bon stade pré-contact.
  useEffect(() => {
    setProspects((prev) => {
      const corrected = prev.map((p) => {
        const correct = calcStatusFromFacts(p);
        return correct !== p.status ? { ...p, status: correct } : p;
      });
      const changed = corrected.some((p, i) => p.status !== prev[i].status);
      return changed ? corrected : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Guided tour: auto-open/close search modal for chirurgical stop
  useEffect(() => {
    function onTourOpen() { setShowSearchModal(true); }
    function onTourClose() { setShowSearchModal(false); }
    window.addEventListener('tour:open-search-modal', onTourOpen);
    window.addEventListener('tour:close-search-modal', onTourClose);
    return () => {
      window.removeEventListener('tour:open-search-modal', onTourOpen);
      window.removeEventListener('tour:close-search-modal', onTourClose);
    };
  }, []);

  const selectedProspect = prospects.find((p) => p.id === selectedId) || null;

  const now = Date.now();
  const stats = {
    total:      prospects.length,
    prets:      prospects.filter((p) => p.status === 'Prêt').length,
    toFollowUp: prospects.filter((p) => {
      const d = daysSince(p.lastContactAt || p.createdAt);
      return d !== null && d >= 5 && POST_CONTACT.has(p.status)
        && p.status !== 'Signé' && p.status !== 'Client actif' && p.status !== 'Perdu';
    }).length,
    incomplets: prospects.filter((p) => p.status === 'Incomplet').length,
  };

  const filtered = prospects
    .filter((p) => {
      if (activeFilter !== 'Tous' && p.status !== activeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (p.businessName?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) || p.type?.toLowerCase().includes(q) || p.contactName?.toLowerCase().includes(q));
      }
      return true;
    })
    .sort((a, b) => calcMasterRank(b).rank - calcMasterRank(a).rank); // Best prospect always first

  function addProspects(list) {
    const arr = Array.isArray(list) ? list : [list];
    setProspects((prev) => [...arr, ...prev]);
    return arr;
  }

  // Stream-add one prospect from the cascade (fires via onFound callback)
  function addFoundProspect(rawProspect) {
    const base = {
      id:             genId(),
      ...rawProspect,
      score:          calcScore(rawProspect.googleReviews, rawProspect.googleRating),
      agentKey:       selectBestAgent(rawProspect).agentKey,
      contactHistory: [],
      createdAt:      Date.now(),
      lastContactAt:  null,
      source:         'ai',
    };
    const prospect = { ...base, status: autoStatus(base) };
    setProspects((prev) => [prospect, ...prev]);
    // Mark as new → triggers slide-in animation; clear after 1.2 s
    setNewIds((prev) => new Set([...prev, prospect.id]));
    setTimeout(() => setNewIds((prev) => { const n = new Set(prev); n.delete(prospect.id); return n; }), 1200);
    return prospect;
  }

  // Cascade search: modal closes immediately, prospects stream in one by one
  async function startCascadeSearch(params) {
    setShowSearchModal(false);
    searchCancelRef.current = false;
    setIsSearching(true);
    setSkippedBizList([]);
    setDiscoveryRateLimit(false);
    lastSearchParamsRef.current = params;
    setSearchProgress({ found: 0, total: params.count, skipped: 0 });
    setSearchStatus(params.retryBizList ? 'Réessai des prospects manquants…' : 'Initialisation…');

    const found   = [];
    const skipped = [];
    let wasDiscoveryRL = false;

    try {
      await searchProspects({
        niches:            params.niches,
        region:            params.region,
        count:             params.count,
        retryBizList:      params.retryBizList || null,
        depth:             params.searchDepth || 'approfondie',
        chirurgicalAgent:  params.chirurgicalAgent || null,
        autoEnrich:        params.autoEnrich !== false,
        cancelRef:         searchCancelRef,
        onStatus:     (msg) => setSearchStatus(msg),
        onFound:      (raw) => {
          const p = addFoundProspect(raw);
          found.push(p);
          setSearchProgress((prev) => ({ ...prev, found: prev.found + 1 }));
          setSearchStatus(`Trouvé : "${raw.businessName}" ✓`);
        },
        onSkipped:    (biz) => {
          skipped.push(biz);
          setSearchProgress((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
        },
      });
    } catch (e) {
      if (!searchCancelRef.current) {
        if (e.isRateLimit) {
          // Discovery phase hit 429 — show countdown, auto-retry in 35 s
          wasDiscoveryRL = true;
          setDiscoveryRateLimit(true);
          setRlCountdown(35);
        } else {
          setToast(`Erreur: ${e.message}`);
        }
      }
    } finally {
      setIsSearching(false);
      setLastSearchDiscoveryOnly(params.autoEnrich === false);
    }

    // Persist any skipped businesses so user can retry them
    if (skipped.length > 0) setSkippedBizList(skipped);

    if (wasDiscoveryRL || found.length === 0 || searchCancelRef.current) return;

    // Background message generation — sequential to avoid rate limits
    for (const p of found) {
      try {
        const msg  = await generateProspectMessage({ prospect: p, agentKey: p.agentKey });
        const subj = `Améliorer votre présence Google — ${p.businessName}`;
        setProspects((prev) => prev.map((x) => {
          if (x.id !== p.id) return x;
          const updated = { ...x, suggestedMessage: msg, emailSubject: subj };
          return { ...updated, status: autoStatus(updated) };
        }));
      } catch { /* silent — user can regen from panel */ }
    }
    const n = found.length;
    setToast(`${n} prospect${n > 1 ? 's' : ''} prêt${n > 1 ? 's' : ''} ✓`);
    // Add all found prospects to memory for deduplication tracking
    if (found.length > 0) addToMemory(found);
  }

  function cancelSearch() {
    searchCancelRef.current = true;
    setIsSearching(false);
  }

  // Manual single-prospect enrichment ("Enrichir →" button)
  async function enrichOneProspect(id) {
    const prospect = prospects.find((p) => p.id === id);
    if (!prospect || enrichingIds.has(id)) return;
    setEnrichingIds((prev) => new Set([...prev, id]));
    try {
      const raw = await enrichProspect(prospect, { depth: 'approfondie' });
      const newScore    = calcScore(raw.googleReviews, raw.googleRating);
      const newAgentKey = selectBestAgent(raw).agentKey;
      const updated     = { ...prospect, ...raw, score: newScore, agentKey: newAgentKey, enriched: true };
      setProspects((prev) => prev.map((p) => p.id === id ? { ...updated, status: autoStatus(updated) } : p));
      // Auto-generate message if we now have an email
      if (raw.email?.trim()) {
        try {
          const msg  = await generateProspectMessage({ prospect: updated, agentKey: newAgentKey });
          const subj = `Améliorer votre présence Google — ${updated.businessName}`;
          setProspects((prev) => prev.map((p) => {
            if (p.id !== id) return p;
            const withMsg = { ...p, suggestedMessage: msg, emailSubject: subj };
            return { ...withMsg, status: autoStatus(withMsg) };
          }));
        } catch {}
      }
      if (raw.fromCache) setToast(`${prospect.businessName} — données en cache ✓`);
    } catch (e) {
      setToast(`Erreur d'enrichissement : ${e.message}`);
    } finally {
      setEnrichingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  // ── Live enrichment queue — runs in background, 2s spacing ──────────────────
  function startEnrichQueue(ids) {
    if (ids.length === 0) return;
    queueStopRef.current = false;
    enrichQueueRef.current = [...ids];
    setEnrichQueue([...ids]);
    setQueueRunning(true);
  }

  useEffect(() => {
    if (!queueRunning) return;
    let cancelled = false;
    async function runQueue() {
      while (enrichQueueRef.current.length > 0 && !queueStopRef.current && !cancelled) {
        const id = enrichQueueRef.current[0];
        enrichQueueRef.current = enrichQueueRef.current.slice(1);
        setEnrichQueue([...enrichQueueRef.current]);
        try {
          const prospect = prospects.find((p) => p.id === id);
          if (prospect && !prospect.enriched) {
            setEnrichingIds((prev) => new Set([...prev, id]));
            const raw = await enrichProspect(prospect, { depth: 'approfondie' });
            const newScore    = calcScore(raw.googleReviews, raw.googleRating);
            const newAgentKey = selectBestAgent(raw).agentKey;
            const updated     = { ...prospect, ...raw, score: newScore, agentKey: newAgentKey, enriched: true };
            setProspects((prev) => prev.map((p) => p.id === id ? { ...updated, status: autoStatus(updated) } : p));
            setEnrichingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
          }
        } catch {
          setEnrichingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        }
        // 4s spacing between queue items
        if (enrichQueueRef.current.length > 0 && !queueStopRef.current) {
          await new Promise((r) => setTimeout(r, 4000));
        }
      }
      if (!cancelled) setQueueRunning(false);
    }
    runQueue();
    return () => { cancelled = true; queueStopRef.current = true; };
  }, [queueRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry skipped businesses (hit 429 during enrichment phase)
  function retrySkippedBiz() {
    if (skippedBizList.length === 0) return;
    const base = lastSearchParamsRef.current || { niches: [], region: null, count: skippedBizList.length };
    const retryParams = { ...base, retryBizList: skippedBizList, count: skippedBizList.length };
    setSkippedBizList([]);
    startCascadeSearch(retryParams);
  }

  // Discovery-phase rate-limit countdown → auto-retry when it reaches 0
  useEffect(() => {
    if (!discoveryRateLimit) return;
    if (rlCountdown === 0) {
      setDiscoveryRateLimit(false);
      if (lastSearchParamsRef.current) startCascadeSearch(lastSearchParamsRef.current);
      return;
    }
    const t = setTimeout(() => setRlCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [discoveryRateLimit, rlCountdown]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateProspect(u)   { setProspects((prev) => prev.map((p) => p.id === u.id ? u : p)); }
  function archiveProspect(id) { setProspects((prev) => prev.filter((p) => p.id !== id)); }
  function deleteProspect(id)  { setProspects((prev) => prev.filter((p) => p.id !== id)); setSelectedId(null); }

  const FILTERS = ['Tous', ...ALL_STATUSES];

  // ── Export helpers ────────────────────────────────────────────────────────────
  function buildExportCSV(list) {
    const headers = [
      'Rang','Tier','Nom','Contact','Email','Téléphone','Site Web','Facebook',
      'Avis Google','Note Google','Score Intelligence','Signal Principal',
      'Agent Recommandé','Message Variante 1','Fenêtre','Rang Master'
    ];
    const rows = list.map((p) => {
      const intel   = calculateIntelligenceScore(p);
      const { rank } = calcMasterRank(p);
      const sigs    = detectSignals(p);
      const agent   = PROSPECT_AGENTS[p.agentKey || selectBestAgent(p).agentKey];
      const window  = (p.lastPostDays != null && parseInt(p.lastPostDays, 10) <= 60) ? 'Ouverte'
        : (p.lastPostDays != null && parseInt(p.lastPostDays, 10) <= 120) ? 'Se ferme' : 'Dormant';
      return [
        rank, intel.tier,
        `"${(p.businessName || '').replace(/"/g, '""')}"`,
        `"${(p.contactName  || '').replace(/"/g, '""')}"`,
        p.email || '', p.phone || '', p.website || '', p.fbPage || '',
        p.googleReviews ?? '', p.googleRating ?? '',
        intel.score,
        sigs[0] ? SIGNAL_CONFIG[sigs[0]]?.label || '' : '',
        agent?.commercialName || '',
        `"${((p.messageVariants?.[0]?.message || p.suggestedMessage) || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        window, rank,
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  function downloadCSV(csvContent, filename) {
    const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function handleExport(mode) {
    let list;
    if (mode === 'elite') {
      list = filtered.filter((p) => calculateIntelligenceScore(p).tier === 'S').slice(0, 10);
    } else if (mode === 'aplus') {
      list = filtered.filter((p) => ['S', 'A'].includes(calculateIntelligenceScore(p).tier));
    } else {
      list = filtered;
    }
    if (list.length === 0) { setToast('Aucun prospect dans cette sélection.'); return; }
    const csv = buildExportCSV(list);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `prospects_nt_${mode}_${date}.csv`);
    setShowExportModal(false);
    setToast(`${list.length} prospect${list.length > 1 ? 's' : ''} exporté${list.length > 1 ? 's' : ''} ✓`);
  }

  return (
    <>
      <style>{`
        @keyframes panelSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes prospectSlideIn { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes huntDot { 0%,80%,100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes enrich-pulse { 0%,100% { border-color: rgba(99,102,241,0.3); } 50% { border-color: rgba(99,102,241,1); } }
        @keyframes enrich-complete { 0% { border-color: #10b981; } 100% { border-color: #E8E6E0; } }
      `}</style>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', background: darkMode ? '#0A0E18' : '#F5F4F0', color: darkMode ? '#e2e8f0' : '#1A1917' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* ── Page header ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 22, fontWeight: 500, color: darkMode ? '#f8fafc' : '#1A1917', margin: 0 }}>Prospects</h1>
                {queueRunning && enrichQueue.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(99,102,241,0.07)', borderRadius: 20, border: '1px solid rgba(99,102,241,0.2)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #6366F1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 11, color: '#6366F1', fontWeight: 500 }}>
                      Enrichissement : {enrichQueue.length} restant{enrichQueue.length > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 13, color: '#9B9890', marginTop: 4, marginBottom: 0 }}>Ta liste vivante — clique pour ouvrir la fiche</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {filtered.length > 0 && (
                <button onClick={() => setShowExportModal(true)}
                  style={{ height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid #E8E6E0', background: '#F5F4F0', color: '#5F5E5A', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F4F0'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F4F0'; }}>
                  ↓ Exporter
                </button>
              )}
              <button onClick={() => setShowAddModal(true)}
                style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid #6366F1', background: 'transparent', color: '#6366F1', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <Plus size={13} /> Ajouter manuellement
              </button>
              <button data-tour="prospect-search" onClick={() => setShowSearchModal(true)}
                style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: '#6366F1', color: '#F5F4F0', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
                <Sparkles size={13} /> Chercher des prospects
              </button>
            </div>
          </div>

          {/* ── Stats bar ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Pipeline',      value: stats.total,      sub: 'prospects actifs',                          accent: null },
              { label: 'Prêts à envoyer', value: stats.prets,    sub: 'email + message ✓',                         accent: stats.prets > 0 ? '#4338CA' : null },
              { label: 'À relancer',    value: stats.toFollowUp, sub: '5+ jours sans réponse',                     accent: stats.toFollowUp > 0 ? '#854F0B' : null },
              { label: 'Incomplets',    value: stats.incomplets, sub: 'manque info de contact',                    accent: stats.incomplets > 0 ? '#92400E' : null },
            ].map(({ label, value, sub, accent }) => (
              <div key={label} style={{ background: darkMode ? 'rgba(255,255,255,0.04)' : '#F5F4F0', border: `1px solid ${accent ? `${accent}33` : (darkMode ? 'rgba(255,255,255,0.06)' : '#E8E6E0')}`, borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B9890', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: accent || (darkMode ? '#f8fafc' : '#1A1917'), lineHeight: 1.1 }}>{value}</div>
                <div style={{ fontSize: 11, color: '#9B9890', marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── Filter bar ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setActiveFilter(f)}
                  style={{ padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', background: activeFilter === f ? '#6366F1' : (darkMode ? 'rgba(255,255,255,0.06)' : '#F5F4F0'), color: activeFilter === f ? '#F5F4F0' : '#5F5E5A', fontSize: 12, fontWeight: 500, transition: 'all 0.15s' }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9B9890', pointerEvents: 'none' }} />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher un prospect…"
                style={{ width: 220, border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : '#E8E6E0'}`, borderRadius: 10, padding: '8px 12px 8px 30px', fontSize: 13, background: darkMode ? 'rgba(255,255,255,0.04)' : '#F5F4F0', color: darkMode ? '#e2e8f0' : '#1A1917', outline: 'none' }}
              />
            </div>
          </div>

          {/* ── Prospect list ── */}
          {filtered.length === 0 && prospects.length === 0
            ? <EmptyState onAdd={() => setShowAddModal(true)} onSearch={() => setShowSearchModal(true)} />
            : filtered.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9890', fontSize: 13 }}>Aucun prospect ne correspond à ce filtre.</div>
              : filtered.map((p) => (
                <ProspectRow
                  key={p.id}
                  prospect={p}
                  onClick={() => setSelectedId(p.id)}
                  onArchive={archiveProspect}
                  onEnrich={enrichOneProspect}
                  isEnriching={enrichingIds.has(p.id)}
                  isNew={newIds.has(p.id)}
                />
              ))
          }

          {/* ── Discovery-only note — shown when last search skipped enrichment ── */}
          {lastSearchDiscoveryOnly && !isSearching && filtered.length > 0 && (
            <div style={{ fontSize: 11, color: '#9B9890', fontStyle: 'italic', textAlign: 'center', marginTop: 8 }}>
              Noms générés — à enrichir pour les vraies données
            </div>
          )}

          {/* ── Skipped prospects banner — shown after search if any 429 skips ── */}
          {skippedBizList.length > 0 && !isSearching && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderRadius: 10, marginTop: 12,
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
            }}>
              <span style={{ fontSize: 13, color: '#4338CA' }}>
                {skippedBizList.length} prospect{skippedBizList.length > 1 ? 's' : ''} incomplet{skippedBizList.length > 1 ? 's' : ''} · limite API dépassée
              </span>
              <button
                onClick={retrySkippedBiz}
                style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: '#6366F1', color: '#F5F4F0',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                Réessayer les manquants
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Prospect panel ── */}
      {selectedProspect && (
        <ProspectPanel
          prospect={selectedProspect}
          onClose={() => setSelectedId(null)}
          onUpdate={updateProspect}
          onDelete={deleteProspect}
        />
      )}

      {/* ── Modals ── */}
      {showAddModal && (
        <AddModal onClose={() => setShowAddModal(false)} onAdd={(p) => addProspects([p])} />
      )}
      {showSearchModal && (
        <SearchModal onClose={() => setShowSearchModal(false)} onStartSearch={startCascadeSearch} />
      )}

      {/* ── Export modal ── */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#F5F4F0', borderRadius: 18, padding: 28, width: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1917' }}>Exporter les prospects</div>
              <button onClick={() => setShowExportModal(false)} style={{ background: '#F5F4F0', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B9890' }}>
                <X size={12} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#9B9890', marginBottom: 16 }}>
              Format CSV · inclut rang, tier, signaux, message et contexte concurrentiel
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { mode: 'elite', label: 'Top 10 Élite seulement', sub: `Tier S — ${filtered.filter((p) => calculateIntelligenceScore(p).tier === 'S').length} prospects`, color: '#1A1917' },
                { mode: 'aplus', label: 'Tous les prospects A+',  sub: `Tier S + A — ${filtered.filter((p) => ['S','A'].includes(calculateIntelligenceScore(p).tier)).length} prospects`, color: '#6366F1' },
                { mode: 'all',   label: 'Liste complète',         sub: `${filtered.length} prospects (filtre actif)`, color: '#5F5E5A' },
              ].map(({ mode, label, sub, color }) => (
                <button key={mode} onClick={() => handleExport(mode)}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #E8E6E0', background: '#FAFAF8', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F4F0'; e.currentTarget.style.borderColor = color; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAF8'; e.currentTarget.style.borderColor = '#E8E6E0'; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#9B9890', marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating search status bar ── */}
      {isSearching && (() => {
        const s = searchStatus || '';
        // Detect visual state from message content
        const isRateWait  = s.includes('Limite API') || s.includes('Pause entre');
        const isRetrying  = s.includes('Nouvelle tentative');
        const isComplete  = s.includes('✓') || s.includes('profil enrichi');
        const isFailed    = s.includes('données partielles') || s.includes('continuer');

        const barBg   = isRateWait ? '#7c2d12'
          : isRetrying  ? '#1e3a5f'
          : isComplete  ? '#14532d'
          : isFailed    ? '#422006'
          : '#0F172A';
        const dotColor = isRateWait ? '#fca5a5'
          : isRetrying  ? '#93c5fd'
          : isComplete  ? '#86efac'
          : '#818cf8';
        const icon = isRateWait ? '⏳' : isRetrying ? '↺' : isComplete ? '✓' : isFailed ? '⚠' : null;

        return (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: barBg, color: '#F5F4F0', borderRadius: 14,
            padding: '12px 16px 12px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            zIndex: 195, minWidth: 360, maxWidth: 560,
            animation: 'fadeIn 0.2s ease',
            transition: 'background 0.3s ease',
          }}>
            {/* State indicator */}
            {icon ? (
              <div style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>{icon}</div>
            ) : (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: dotColor,
                    animation: `huntDot 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}

            {/* Status text + progress */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {searchProgress.found} / {searchProgress.total} trouvé{searchProgress.found !== 1 ? 's' : ''}
                {searchProgress.skipped > 0 && (
                  <span style={{ marginLeft: 8, color: '#fbbf24' }}>
                    · {searchProgress.skipped} sauté{searchProgress.skipped > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {!isRateWait && (
              <div style={{ width: 64, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, flexShrink: 0, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: dotColor, borderRadius: 2,
                  width: `${searchProgress.total > 0 ? (searchProgress.found / searchProgress.total) * 100 : 0}%`,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            )}

            {/* Stop button */}
            <button
              onClick={cancelSearch}
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: '5px 12px',
                fontSize: 12, cursor: 'pointer', fontWeight: 500, flexShrink: 0,
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            >
              ✕ Arrêter
            </button>
          </div>
        );
      })()}

      {/* ── Discovery rate-limit countdown bar ── */}
      {discoveryRateLimit && !isSearching && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#7c2d12', color: '#F5F4F0', borderRadius: 14,
          padding: '12px 16px 12px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          zIndex: 195, minWidth: 360, maxWidth: 520,
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#fef2f2' }}>
              Trop de requêtes. Nouvelle tentative dans {rlCountdown}s…
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              Limite API Anthropic — relance automatique
            </div>
          </div>
          {/* Countdown progress bar */}
          <div style={{ width: 64, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, flexShrink: 0, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#fca5a5', borderRadius: 2,
              width: `${((35 - rlCountdown) / 35) * 100}%`,
              transition: 'width 0.9s linear',
            }} />
          </div>
          <button
            onClick={() => { setDiscoveryRateLimit(false); setRlCountdown(0); }}
            style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8, color: 'rgba(255,255,255,0.75)', padding: '5px 12px',
              fontSize: 12, cursor: 'pointer', fontWeight: 500, flexShrink: 0,
              transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* ── Toast (floats above status bar when searching) ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: (isSearching || discoveryRateLimit) ? 92 : 32, left: '50%', transform: 'translateX(-50%)',
          background: '#0F172A', color: '#F5F4F0', borderRadius: 10,
          padding: '10px 20px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          animation: 'fadeIn 0.2s ease',
          zIndex: 200, whiteSpace: 'nowrap',
          transition: 'bottom 0.25s ease',
        }}>
          {toast}
        </div>
      )}
    </>
  );
}

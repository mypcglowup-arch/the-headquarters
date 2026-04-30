/**
 * User profile — name, role, annualGoal, sector + audience pulled from onboarding.
 *
 * Source of truth : localStorage `qg_user_profile_v1` (synced to Supabase
 * fire-and-forget via syncUserProfile in lib/sync.js).
 *
 * Used everywhere prompts/PDF/UI need to address the user by name. Replaces
 * the hardcoded "Samuel" everywhere. Mem0 USER_ID stays 'samuel' on purpose
 * (technical partition key — changing it would orphan existing memories).
 */

import { getSector } from '../data/sectors.js';
import { computePulseScore } from './pulseScore.js';
import { loadWins }          from './wins.js';

const LS_PROFILE = 'qg_user_profile_v1';

const DEFAULT_PROFILE = {
  name:           '',
  role:           '',
  annualGoal:     50000,
  sector:         null,        // id from data/sectors.js — null = not set
  sectorCustom:   '',          // free-text label when sector === 'other'
  audience:       null,        // 'b2b' | 'b2c' | 'both' | null
  language:       null,        // 'fr' | 'en' | null — null falls back to detectDefaultLang()
  createdAt:      null,

  // ─── Personalization layer (v2) — drives agent voice calibration ────────
  stage:          null,        // 'starting' | 'first_revenue' | 'growing' | 'established'
  experience:     null,        // 'lt1y' | '1to3y' | '3to5y' | '5plus'
  strength:       null,        // 'builder' | 'closer' | 'strategist' | 'executor' | 'creator' | 'networker'
  challenges:     [],          // up to 2 from CHALLENGE_OPTIONS keys
  pastFailures:   '',          // free-text — what already didn't work, agents avoid resuggesting
  coachingStyle:  3,           // 1..5 — 1=encouraging, 3=challenging-constructive, 5=brutal-truth
  primaryAgent:   null,        // 'HORMOZI' | 'CARDONE' | 'ROBBINS' | 'GARYV' | 'NAVAL' | 'VOSS'
  sensitiveTopics:'',          // free-text — topics agents avoid unless user raises
  availability:   [],          // subset of ['morning', 'afternoon', 'evening', 'weekend']
};

// ─── Enum reference tables — single source of truth for UI + prompt labels ──
export const STAGE_OPTIONS = {
  starting:       { fr: 'Je commence (0$)',                en: 'Starting out ($0)' },
  first_revenue:  { fr: 'Premiers revenus (1-5K$/mois)',   en: 'First revenue ($1-5K/mo)' },
  growing:        { fr: 'En croissance (5-20K$/mois)',     en: 'Growing ($5-20K/mo)' },
  established:    { fr: 'Établi (20K+/mois)',              en: 'Established ($20K+/mo)' },
};
export const EXPERIENCE_OPTIONS = {
  lt1y:   { fr: 'Moins d\'un an', en: 'Less than 1 year' },
  '1to3y':{ fr: '1-3 ans',        en: '1-3 years' },
  '3to5y':{ fr: '3-5 ans',        en: '3-5 years' },
  '5plus':{ fr: '5 ans+',         en: '5+ years' },
};
export const STRENGTH_OPTIONS = {
  builder:    { fr: 'Builder/Créer',     en: 'Builder/Create' },
  closer:     { fr: 'Vendre/Closer',     en: 'Sell/Close' },
  strategist: { fr: 'Stratégiser',       en: 'Strategize' },
  executor:   { fr: 'Exécuter',          en: 'Execute' },
  creator:    { fr: 'Créer du contenu',  en: 'Create content' },
  networker:  { fr: 'Networker',         en: 'Network' },
};
export const CHALLENGE_OPTIONS = {
  find_clients:    { fr: 'Trouver des clients',     en: 'Find clients' },
  close_deals:     { fr: 'Closer des deals',        en: 'Close deals' },
  discipline:      { fr: 'Garder ma discipline',    en: 'Stay disciplined' },
  time_mgmt:       { fr: 'Gérer mon temps',         en: 'Manage my time' },
  scale_offer:     { fr: 'Scaler mon offre',        en: 'Scale my offer' },
  visibility:      { fr: 'Me faire connaître',      en: 'Get visibility' },
  pricing:         { fr: 'Fixer mes prix',          en: 'Price my offer' },
};
export const AVAILABILITY_OPTIONS = {
  morning:   { fr: 'Matin',     en: 'Morning' },
  afternoon: { fr: 'Après-midi', en: 'Afternoon' },
  evening:   { fr: 'Soir',      en: 'Evening' },
  weekend:   { fr: 'Weekend',   en: 'Weekend' },
};
export const COACHING_STYLE_LABELS = {
  1: { fr: 'Encourage-moi, sois patient',         en: 'Encourage me, be patient' },
  2: { fr: 'Soutien avec un peu de challenge',    en: 'Supportive with light challenge' },
  3: { fr: 'Challenge-moi mais reste constructif', en: 'Challenge me but stay constructive' },
  4: { fr: 'Push fort, peu de filtre',            en: 'Push hard, low filter' },
  5: { fr: 'Sois brutal, je veux la vérité pure', en: 'Be brutal, I want raw truth' },
};

/** Read the profile from localStorage. Returns DEFAULT_PROFILE if absent. */
export function loadUserProfile() {
  try {
    const raw = localStorage.getItem(LS_PROFILE);
    if (!raw) return { ...DEFAULT_PROFILE };
    const p = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...p };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

/** Save the profile to localStorage. */
export function saveUserProfile(profile) {
  try {
    localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
  } catch { /* ignore quota errors */ }
}

/** Has the user completed onboarding (i.e., set a name) ? */
export function hasOnboarded(profile) {
  return Boolean(profile?.name && profile.name.trim());
}

/** Get the display name. Falls back to a polite generic. */
export function getDisplayName(profile, lang = 'fr') {
  const name = (profile?.name || '').trim();
  if (name) return name;
  return lang === 'fr' ? "l'utilisateur" : 'the user';
}

/**
 * Build a USER CONTEXT block for system prompts. Threaded into every agent
 * call so prompts can reference {name} dynamically.
 *
 * Returns null if no name set — callers fall back to the existing literal
 * (the prompts still substitute {name} → 'l'utilisateur' via personalize).
 */
export function buildUserContext(profile, lang = 'fr') {
  if (!profile) return null;
  return {
    name:           (profile.name || '').trim() || (lang === 'fr' ? "l'utilisateur" : 'the user'),
    role:           (profile.role || '').trim() || null,
    annualGoal:     Number(profile.annualGoal) || null,
    sector:         profile.sector || null,
    sectorCustom:   profile.sectorCustom || '',
    audience:       profile.audience || null,
    stage:          profile.stage || null,
    experience:     profile.experience || null,
    strength:       profile.strength || null,
    challenges:     Array.isArray(profile.challenges) ? profile.challenges : [],
    pastFailures:   (profile.pastFailures || '').trim() || null,
    coachingStyle:  Number(profile.coachingStyle) || 3,
    primaryAgent:   profile.primaryAgent || null,
    sensitiveTopics:(profile.sensitiveTopics || '').trim() || null,
    availability:   Array.isArray(profile.availability) ? profile.availability : [],
    profile,                               // raw — for callers that need formatSectorContext
  };
}

// ─── Auto-derived environmental context ─────────────────────────────────────

/** Northern-hemisphere season from month index. Used for sector-aware advice. */
function detectSeason(date = new Date()) {
  const m = date.getMonth(); // 0-11
  if (m >= 2 && m <= 4)  return 'spring';   // Mar–May
  if (m >= 5 && m <= 7)  return 'summer';   // Jun–Aug
  if (m >= 8 && m <= 10) return 'autumn';   // Sep–Nov
  return 'winter';                          // Dec–Feb
}

const SEASON_LABEL = {
  spring: { fr: 'printemps',  en: 'spring' },
  summer: { fr: 'été',        en: 'summer' },
  autumn: { fr: 'automne',    en: 'autumn' },
  winter: { fr: 'hiver',      en: 'winter' },
};

/** Time-of-day bucket. Drives morning briefing vs evening debrief tone. */
function detectTimeOfDay(date = new Date()) {
  const h = date.getHours();
  if (h >= 5  && h <  9) return 'early_morning';   // briefing window
  if (h >= 9  && h < 12) return 'morning';
  if (h >= 12 && h < 14) return 'midday';
  if (h >= 14 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';         // debrief window
  return 'late_night';                              // after 22h
}

const TIME_OF_DAY_GUIDANCE = {
  fr: {
    early_morning: 'Briefing du matin — énergie + plan de journée. Donne UNE action prioritaire à exécuter dans les 2 prochaines heures.',
    morning:       'Mode exécution — conseils directs et actionnables. Évite les longues réflexions, vise le mouvement.',
    midday:        'Mi-journée — moment idéal pour pivoter ou recalibrer. Vérifie le progrès matinal avant de pousser plus.',
    afternoon:     'Après-midi — focus sur le closing et les actions à fort levier. Les blocs créatifs sont plus efficaces.',
    evening:       'Débrief — passe en revue la journée, prépare mentalement demain. Ton plus réflexif, moins push.',
    late_night:    'Tard le soir — protège la santé. Si l\'utilisateur travaille encore, ne pas le pousser ; aider à clôturer proprement.',
  },
  en: {
    early_morning: 'Morning briefing — energy + day plan. Give ONE priority action to execute in the next 2 hours.',
    morning:       'Execution mode — direct, actionable advice. Skip long reflections, aim for movement.',
    midday:        'Midday — ideal moment to pivot or recalibrate. Check morning progress before pushing further.',
    afternoon:     'Afternoon — focus on closing and high-leverage actions. Creative blocks land better here.',
    evening:       'Debrief — review the day, mentally prep tomorrow. More reflective tone, less push.',
    late_night:    'Late night — protect health. If user is still working, don\'t push; help wrap up cleanly.',
  },
};

/**
 * Detect Quebec context. Heuristic: language=fr OR sectorCustom mentions
 * Québec/Quebec/Montréal/Laval/Sherbrooke/etc. Drives local references and
 * regulatory context (TVQ, loi 25, PME Québec).
 */
function isLikelyQuebec(profile) {
  if (!profile) return false;
  if (profile.language === 'fr') return true;
  const hay = String(profile.sectorCustom || '').toLowerCase();
  if (!hay) return false;
  const markers = ['québec', 'quebec', 'qc', 'montréal', 'montreal', 'laval', 'longueuil',
                   'sherbrooke', 'gatineau', 'québécois', 'quebecois', 'estrie', 'mauricie',
                   'saguenay', 'rive-sud', 'rive sud'];
  return markers.some((m) => hay.includes(m));
}

/** Resolved sector label — sectorCustom overrides the dropdown sector. */
function resolveSectorLabel(profile, lang = 'fr') {
  if (!profile) return '';
  const custom = String(profile.sectorCustom || '').trim();
  if (custom) return custom;
  if (profile.sector) {
    const s = getSector(profile.sector);
    return s?.label?.[lang] || s?.label?.fr || profile.sector;
  }
  return '';
}

/**
 * Build the runtime USER CONTEXT block injected into combinedContext for every
 * agent call. Single-paragraph, machine-parseable, agent-readable. Produces
 * NULL when profile is empty so callers can drop the block silently.
 *
 * Now includes: sector (custom-first), audience, current season, time-of-day,
 * Quebec marker. Sector + season are the largest unlocks for industry-specific
 * advice (lawn care vs real estate vs e-commerce stop sounding interchangeable).
 */
export function formatUserContext(profile, lang = 'fr') {
  if (!profile || !profile.name) return null;
  const L = lang === 'fr';
  const parts = [];

  // Identity (only if any of these are set — keeps the block honest)
  const ident = [];
  if (profile.name)  ident.push(profile.name);
  if (profile.role)  ident.push(profile.role);
  if (ident.length) parts.push((L ? 'Identité: ' : 'Identity: ') + ident.join(' · '));

  // Sector — custom override wins. This is the SINGLE most important field for
  // industry adaptation — agents must use it to drive examples + vocabulary.
  const sectorLbl = resolveSectorLabel(profile, lang);
  if (sectorLbl) parts.push((L ? 'Secteur exact: ' : 'Exact niche: ') + sectorLbl);

  // Audience B2B/B2C
  if (profile.audience) {
    const audMap = { b2b: { fr: 'B2B', en: 'B2B' }, b2c: { fr: 'B2C', en: 'B2C' }, both: { fr: 'B2B + B2C', en: 'B2B + B2C' } };
    const aud = audMap[profile.audience]?.[L ? 'fr' : 'en'];
    if (aud) parts.push((L ? 'Audience: ' : 'Audience: ') + aud);
  }

  if (profile.annualGoal) {
    parts.push((L ? 'Objectif annuel: ' : 'Annual goal: ') + `${(Number(profile.annualGoal) || 50000).toLocaleString()}$`);
  }
  if (profile.stage && STAGE_OPTIONS[profile.stage]) {
    parts.push((L ? 'Stade business: ' : 'Stage: ') + STAGE_OPTIONS[profile.stage][L ? 'fr' : 'en']);
  }
  if (profile.experience && EXPERIENCE_OPTIONS[profile.experience]) {
    parts.push((L ? 'Expérience: ' : 'Experience: ') + EXPERIENCE_OPTIONS[profile.experience][L ? 'fr' : 'en']);
  }
  if (profile.strength && STRENGTH_OPTIONS[profile.strength]) {
    parts.push((L ? 'Force: ' : 'Strength: ') + STRENGTH_OPTIONS[profile.strength][L ? 'fr' : 'en']);
  }
  if (Array.isArray(profile.challenges) && profile.challenges.length > 0) {
    const labels = profile.challenges
      .map((k) => CHALLENGE_OPTIONS[k]?.[L ? 'fr' : 'en'])
      .filter(Boolean);
    if (labels.length) parts.push((L ? 'Défi(s) actuel(s): ' : 'Current challenge(s): ') + labels.join(' · '));
  }
  if (profile.coachingStyle != null) {
    const cs = Number(profile.coachingStyle) || 3;
    const lbl = COACHING_STYLE_LABELS[cs]?.[L ? 'fr' : 'en'] || '';
    parts.push((L ? `Style de coaching voulu: ${cs}/5` : `Coaching style: ${cs}/5`) + (lbl ? ` (${lbl})` : ''));
  }
  if (profile.pastFailures) {
    parts.push((L ? 'Ce qui a pas marché: ' : 'What didn\'t work: ') + profile.pastFailures);
  }
  if (Array.isArray(profile.availability) && profile.availability.length > 0) {
    const labels = profile.availability
      .map((k) => AVAILABILITY_OPTIONS[k]?.[L ? 'fr' : 'en'])
      .filter(Boolean);
    if (labels.length) parts.push((L ? 'Disponibilité: ' : 'Availability: ') + labels.join(' · '));
  }
  if (profile.sensitiveTopics) {
    parts.push((L ? 'Sujets à éviter (sauf si l\'utilisateur les amène): ' : 'Topics to avoid (unless user raises them): ') + profile.sensitiveTopics);
  }

  // ── Auto-derived environmental context ─────────────────────────────────
  const now = new Date();
  const season = detectSeason(now);
  const tod    = detectTimeOfDay(now);
  parts.push((L ? 'Saison actuelle: ' : 'Current season: ') + SEASON_LABEL[season][L ? 'fr' : 'en']);
  parts.push((L ? 'Moment de la journée: ' : 'Time of day: ') + tod);
  if (isLikelyQuebec(profile)) {
    parts.push(L
      ? 'Géographie: Québec — utilise français québécois, exemples locaux, contexte fiscal québécois (TVQ, loi 25, PME Québec/Investissement Québec)'
      : 'Geography: Quebec — use Quebec French, local examples, Quebec tax/regulatory context (TVQ, law 25, PME Quebec/Investissement Québec)');
  }

  if (parts.length === 0) return null;

  const header = L ? 'PROFIL UTILISATEUR (utilise ces données pour calibrer ton ton et tes conseils — naturellement, jamais mécaniquement) :' : 'USER PROFILE (use this data to calibrate tone and advice — naturally, never mechanically):';
  const todHint = TIME_OF_DAY_GUIDANCE[L ? 'fr' : 'en'][tod];
  const calibration = L
    ? `Calibration :
- Adapte les EXEMPLES au secteur exact ci-dessus. Si l'utilisateur est en tonte de gazon, parle contrats résidentiels, routes, upsell déneigement — pas SaaS. Si en immobilier, parle commission stacking, négo d'offres, volume — pas marketing digital. Ne JAMAIS donner d'exemples d'une industrie différente.
- Adapte le VOCABULAIRE au stade : 0$ = trouver premier client, scripts simples. 20K+/mois = scaling, délégation, leverage.
- Ajuste la PROFONDEUR à l'expérience : <1 an = explique les fondamentaux. 5+ ans = sous-entendre, aller direct.
- Renforce la force, challenge la faiblesse, reviens automatiquement sur le défi déclaré, évite de resuggérer ce qui n'a pas marché, calibre l'intensité au style de coaching demandé.
- Tiens compte de la SAISON et du MOMENT DE LA JOURNÉE — ${todHint}`
    : `Calibration:
- Adapt EXAMPLES to the exact niche above. Lawn care = residential contracts, routes, snow removal upsell — not SaaS. Real estate = commission stacking, offer negotiation, volume — not digital marketing. NEVER give examples from a different industry.
- Adapt VOCABULARY to stage: $0 = find first client, simple scripts. $20K+/mo = scaling, delegation, leverage.
- Adjust DEPTH to experience: <1y = explain fundamentals. 5y+ = imply, go direct.
- Reinforce strength, challenge weakness, automatically return to declared challenges, avoid resuggesting what already failed, calibrate intensity to requested coaching style.
- Account for SEASON and TIME OF DAY — ${todHint}`;
  return [header, parts.join(' | '), calibration].join('\n');
}

/** Public helper — returns 'spring' | 'summer' | 'autumn' | 'winter'. */
export function getCurrentSeason(date = new Date()) { return detectSeason(date); }

/** Public helper — returns time-of-day bucket. */
export function getCurrentTimeOfDay(date = new Date()) { return detectTimeOfDay(date); }

/** Public helper — true if the user profile suggests Quebec. */
export function isQuebecProfile(profile) { return isLikelyQuebec(profile); }

// ─── Adaptive quick-action chips ────────────────────────────────────────────
// Used by GlobalFloatingInput. Returns a list of {icon, label, text} that
// reflects the user's stage + niche keywords + season. Falls back to the
// neutral default set when nothing matches.

const NICHE_PATTERNS = [
  // Each pattern: keywords (lowercase, partial-match) → chip pack key
  { key: 'lawn',       words: ['tonte', 'gazon', 'paysag', 'pelouse', 'tonteuse', 'haie', 'lawn', 'landscap'] },
  { key: 'snow',       words: ['déneig', 'deneig', 'snow remov'] },
  { key: 'realestate', words: ['immobil', 'courtier', 'real estate', 'broker', 'realtor'] },
  { key: 'fitness',    words: ['fitness', 'coach sport', 'personal trainer', 'pt', 'entraîneur', 'entraineur', 'gym'] },
  { key: 'ecommerce',  words: ['e-commerce', 'ecommerce', 'shopify', 'dropshipping', 'boutique en ligne', 'online store'] },
  { key: 'agency',     words: ['agence', 'agency', 'saas', 'consult', 'freelance', 'studio'] },
  { key: 'restaurant', words: ['restaurant', 'café', 'cafe', 'food truck', 'traiteur', 'catering'] },
  { key: 'beauty',     words: ['salon', 'esthét', 'esthet', 'coiff', 'barber', 'spa', 'beaut'] },
];

function detectNiche(profile) {
  const hay = String(profile?.sectorCustom || '').toLowerCase();
  if (!hay) return null;
  for (const p of NICHE_PATTERNS) {
    if (p.words.some((w) => hay.includes(w))) return p.key;
  }
  return null;
}

const STAGE_CHIPS = {
  fr: {
    starting: [
      { icon: '🎯', label: 'Trouve mon premier client', text: 'Aide-moi à trouver mon premier client. Donne-moi un plan concret pour cette semaine.' },
      { icon: '🗣️', label: 'Prépare mon pitch',          text: 'Aide-moi à préparer un pitch clair pour mon offre.' },
      { icon: '📞', label: 'Script de prospection',      text: 'Donne-moi un script de prospection que je peux utiliser dès aujourd\'hui.' },
    ],
    first_revenue: [
      { icon: '📈', label: 'Stabilise mes revenus', text: 'Comment passer de revenus en dents de scie à un revenu régulier ?' },
      { icon: '🎯', label: 'Plus de clients',        text: 'Comment doubler mon flux de prospects ce mois-ci ?' },
      { icon: '💰', label: 'Augmente mes prix',      text: 'Devrais-je augmenter mes prix ? Comment justifier ?' },
    ],
    growing: [
      { icon: '⚙️', label: 'Optimise mon pipeline', text: 'Quelles fuites dans mon pipeline et comment les boucher ?' },
      { icon: '🤝', label: 'Délègue cette tâche',    text: 'Quelle tâche je devrais déléguer en premier ?' },
      { icon: '🚀', label: 'Scale mon offre',        text: 'Comment scaler mon offre sans casser la qualité ?' },
    ],
    established: [
      { icon: '🏗️', label: 'Construis du levier', text: 'Quel levier prochain pour multiplier mon revenu sans multiplier mes heures ?' },
      { icon: '📊', label: 'Analyse mes marges',  text: 'Aide-moi à analyser et améliorer mes marges.' },
      { icon: '🎯', label: 'Prochain palier',     text: 'Quel est mon prochain palier de croissance et comment l\'atteindre ?' },
    ],
  },
  en: {
    starting: [
      { icon: '🎯', label: 'Find my first client', text: 'Help me find my first client. Give me a concrete plan for this week.' },
      { icon: '🗣️', label: 'Sharpen my pitch',     text: 'Help me sharpen a clear pitch for my offer.' },
      { icon: '📞', label: 'Outreach script',      text: 'Give me an outreach script I can use today.' },
    ],
    first_revenue: [
      { icon: '📈', label: 'Stabilize revenue', text: 'How do I move from spiky to steady revenue?' },
      { icon: '🎯', label: 'More clients',      text: 'How do I double my prospect flow this month?' },
      { icon: '💰', label: 'Raise my prices',   text: 'Should I raise my prices? How do I justify it?' },
    ],
    growing: [
      { icon: '⚙️', label: 'Optimize pipeline', text: 'What are the leaks in my pipeline and how do I plug them?' },
      { icon: '🤝', label: 'Delegate this',     text: 'What task should I delegate first?' },
      { icon: '🚀', label: 'Scale my offer',    text: 'How do I scale my offer without breaking quality?' },
    ],
    established: [
      { icon: '🏗️', label: 'Build leverage', text: 'Next leverage move to multiply revenue without multiplying hours?' },
      { icon: '📊', label: 'Margin review',  text: 'Help me analyze and improve my margins.' },
      { icon: '🎯', label: 'Next plateau',   text: 'What is my next growth plateau and how do I get there?' },
    ],
  },
};

const NICHE_CHIPS = {
  fr: {
    lawn: [
      { icon: '🌱', label: 'Prépare ma saison',          text: 'On entre dans la saison de tonte. Aide-moi à préparer le démarrage : routes, contrats, équipe.' },
      { icon: '📋', label: 'Trouve contrats résidentiels', text: 'Comment décrocher rapidement 10 nouveaux contrats résidentiels de tonte ?' },
      { icon: '❄️', label: 'Upsell déneigement',          text: 'Comment vendre le déneigement à mes clients de tonte avant l\'hiver ?' },
    ],
    snow: [
      { icon: '❄️', label: 'Optimise mes routes',  text: 'Comment optimiser mes routes de déneigement pour la prochaine bordée ?' },
      { icon: '📋', label: 'Renouvelle contrats', text: 'Aide-moi à structurer le renouvellement de mes contrats annuels de déneigement.' },
    ],
    realestate: [
      { icon: '📞', label: 'Prépare un appel acheteur', text: 'Prépare-moi pour un appel découverte avec un acheteur potentiel.' },
      { icon: '🏠', label: 'Analyse ce listing',        text: 'Aide-moi à analyser un listing et préparer une stratégie d\'offre.' },
      { icon: '🤝', label: 'Négocie cette offre',       text: 'Stratégie de négociation pour un client. Voici le contexte :' },
      { icon: '💰', label: 'Mes prochaines transactions', text: 'Comment maximiser mes commissions sur les 90 prochains jours ?' },
    ],
    fitness: [
      { icon: '🏋️', label: 'Trouve clients en ligne',   text: 'Comment trouver mes 10 prochains clients de coaching fitness en ligne ?' },
      { icon: '📅', label: 'Programme contenu', text: 'Aide-moi à programmer 7 jours de contenu fitness qui convertit.' },
    ],
    ecommerce: [
      { icon: '🛒', label: 'Améliore conversion', text: 'Comment améliorer mon taux de conversion sur ma boutique ?' },
      { icon: '📦', label: 'Augmente AOV',        text: 'Stratégies pour augmenter mon panier moyen ce mois-ci.' },
    ],
    agency: [
      { icon: '🔍', label: 'Vérifie mes emails',   text: 'Vérifie mes emails' },
      { icon: '📊', label: 'État de mon pipeline', text: "Quel est l'état de mon pipeline ?" },
      { icon: '⚡', label: 'Prochain move',         text: 'Quel est mon prochain move ?' },
    ],
    restaurant: [
      { icon: '🍽️', label: 'Augmente le ticket', text: 'Stratégies pour augmenter le ticket moyen de mon restaurant cette semaine.' },
      { icon: '📱', label: 'Plus de clients',      text: 'Comment ramener plus de monde sans baisser les prix ?' },
    ],
    beauty: [
      { icon: '💇', label: 'Remplis mon agenda',  text: 'Comment remplir mon agenda les 14 prochains jours ?' },
      { icon: '⭐', label: 'Plus de retention', text: 'Comment faire revenir mes clientes plus souvent ?' },
    ],
  },
  en: {
    lawn: [
      { icon: '🌱', label: 'Season prep',         text: 'Lawn season is starting. Help me prep: routes, contracts, crew.' },
      { icon: '📋', label: 'Residential leads',   text: 'How do I land 10 new residential lawn contracts quickly?' },
      { icon: '❄️', label: 'Snow upsell',         text: 'How do I sell snow removal to my lawn clients before winter?' },
    ],
    snow: [
      { icon: '❄️', label: 'Optimize routes', text: 'How do I optimize my snow routes for the next storm?' },
      { icon: '📋', label: 'Renew contracts', text: 'Help me structure annual snow contract renewals.' },
    ],
    realestate: [
      { icon: '📞', label: 'Buyer call prep',    text: 'Prep me for a discovery call with a potential buyer.' },
      { icon: '🏠', label: 'Analyze a listing',  text: 'Help me analyze a listing and build an offer strategy.' },
      { icon: '🤝', label: 'Negotiate offer',    text: 'Negotiation strategy for a client. Context:' },
      { icon: '💰', label: 'Next transactions',  text: 'How do I maximize commissions over the next 90 days?' },
    ],
    fitness: [
      { icon: '🏋️', label: 'Find online clients', text: 'How do I find my next 10 online fitness coaching clients?' },
      { icon: '📅', label: 'Content schedule',  text: 'Plan 7 days of fitness content that converts.' },
    ],
    ecommerce: [
      { icon: '🛒', label: 'Improve conversion', text: 'How do I improve my store conversion rate?' },
      { icon: '📦', label: 'Raise AOV',          text: 'Strategies to raise my average order value this month.' },
    ],
    agency: [
      { icon: '🔍', label: 'Check my emails',   text: 'Check my emails' },
      { icon: '📊', label: 'Pipeline status',  text: "What's the status of my pipeline?" },
      { icon: '⚡', label: 'Next move',         text: "What's my next move?" },
    ],
    restaurant: [
      { icon: '🍽️', label: 'Raise ticket', text: 'Strategies to raise my restaurant average ticket this week.' },
      { icon: '📱', label: 'More guests',  text: 'How do I drive more guests without lowering prices?' },
    ],
    beauty: [
      { icon: '💇', label: 'Fill my schedule', text: 'How do I fill my schedule for the next 14 days?' },
      { icon: '⭐', label: 'More retention',   text: 'How do I get clients to come back more often?' },
    ],
  },
};

const DEFAULT_CHIPS = {
  fr: [
    { icon: '🔍', label: 'Vérifie mes emails',     text: 'Vérifie mes emails' },
    { icon: '📊', label: 'État de mon pipeline',    text: "Quel est l'état de mon pipeline ?" },
    { icon: '⚡', label: 'Prochain move',            text: 'Quel est mon prochain move ?' },
    { icon: '📅', label: "Mon agenda aujourd'hui",  text: "Montre-moi mon agenda aujourd'hui" },
  ],
  en: [
    { icon: '🔍', label: 'Check my emails',  text: 'Check my emails' },
    { icon: '📊', label: 'Pipeline status',  text: "What's the status of my pipeline?" },
    { icon: '⚡', label: 'Next move',         text: "What's my next move?" },
    { icon: '📅', label: 'My agenda today',  text: 'Show me my agenda today' },
  ],
};

/**
 * Adaptive chip set for the global floating input. Picks niche-specific chips
 * when the sectorCustom contains a recognized keyword, otherwise stage chips,
 * otherwise the default neutral set. Always returns 3-4 chips, deduplicated.
 */
export function getAdaptiveChips(profile, lang = 'fr') {
  const L = lang === 'en' ? 'en' : 'fr';
  const out = [];
  const seen = new Set();
  const push = (chip) => {
    if (!chip || seen.has(chip.label)) return;
    seen.add(chip.label);
    out.push(chip);
  };

  // Niche-specific first (most relevant)
  const niche = detectNiche(profile);
  if (niche && NICHE_CHIPS[L][niche]) {
    NICHE_CHIPS[L][niche].forEach(push);
  }

  // Fill with stage chips up to 4
  if (out.length < 4 && profile?.stage && STAGE_CHIPS[L][profile.stage]) {
    STAGE_CHIPS[L][profile.stage].forEach((c) => { if (out.length < 4) push(c); });
  }

  // Fill with defaults if still short
  if (out.length < 4) {
    DEFAULT_CHIPS[L].forEach((c) => { if (out.length < 4) push(c); });
  }

  return out.slice(0, 4);
}

function daysSinceLastWin() {
  const wins = loadWins();
  const last = wins[0]?.date;
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
}

function buildLiveContext() {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try {
    const dashboard = JSON.parse(localStorage.getItem('qg_dashboard_v1') || '{}');
    const streak    = JSON.parse(localStorage.getItem('qg_streak_v1') || '{}').count || 0;
    const checkIn   = JSON.parse(localStorage.getItem('qg_checkin_today') || 'null');
    const sessionCount = Number(localStorage.getItem('qg_session_count_v1') || 1);

    let momentum = 'unknown';
    try {
      const pulse = computePulseScore(dashboard, streak, checkIn);
      momentum = pulse?.overall ?? 'unknown';
    } catch {}

    const p = dashboard.pipeline || {};
    const activeDeals = (p.contacted || 0) + (p.replied || 0) + (p.demo || 0);
    const dslw = daysSinceLastWin();

    return `momentum: ${momentum} | pipeline: ${activeDeals} active deals | days_since_last_win: ${dslw ?? 'unknown'} | emotional_state: unknown | avoided_topics: none detected | session_arc: unknown | session_count: ${sessionCount}`;
  } catch {
    return 'momentum: unknown | pipeline: 0 active deals | days_since_last_win: unknown | emotional_state: unknown | avoided_topics: none detected | session_arc: unknown | session_count: 1';
  }
}

/**
 * Replace {name} / {role} / {annualGoal} tokens in a prompt string at runtime.
 * Use this in api.js right before sending the prompt to Anthropic.
 */
export function personalize(promptString, ctx) {
  if (!promptString) return promptString;
  const name = ctx?.name || (typeof window !== 'undefined' && window.localStorage
    ? getDisplayName(loadUserProfile())
    : "l'utilisateur");
  const role = ctx?.role || '';
  const annualGoal = ctx?.annualGoal != null ? `${ctx.annualGoal}$` : '50 000$';
  const audience   = ctx?.audience || '';
  // Resolved sector label — sectorCustom always wins when set (it's the
  // user's exact niche, far more useful than a broad dropdown category).
  const sectorLabel = resolveSectorLabel(ctx?.profile, 'fr');
  // New v2 personalization tokens — all optional, all derived from ctx.profile
  const stageLbl = ctx?.profile?.stage && STAGE_OPTIONS[ctx.profile.stage]
    ? STAGE_OPTIONS[ctx.profile.stage].fr
    : '';
  const experienceLbl = ctx?.profile?.experience && EXPERIENCE_OPTIONS[ctx.profile.experience]
    ? EXPERIENCE_OPTIONS[ctx.profile.experience].fr
    : '';
  const strengthLbl = ctx?.profile?.strength && STRENGTH_OPTIONS[ctx.profile.strength]
    ? STRENGTH_OPTIONS[ctx.profile.strength].fr
    : '';
  const challengeLbl = Array.isArray(ctx?.profile?.challenges) && ctx.profile.challenges.length > 0
    ? ctx.profile.challenges.map((k) => CHALLENGE_OPTIONS[k]?.fr).filter(Boolean).join(', ')
    : '';
  const coachingStyleNum = ctx?.profile?.coachingStyle != null ? Number(ctx.profile.coachingStyle) || 3 : 3;
  const userBlock = formatUserContext(ctx?.profile, 'fr') || '';

  return promptString
    .replace(/\{NAME\}/g, name.toUpperCase())
    .replace(/\{name\}/g, name)
    .replace(/\{role\}/g, role)
    .replace(/\{annualGoal\}/g, annualGoal)
    .replace(/\{sector\}/g, sectorLabel)
    .replace(/\{audience\}/g, audience)
    .replace(/\{stage\}/g, stageLbl)
    .replace(/\{experience\}/g, experienceLbl)
    .replace(/\{strength\}/g, strengthLbl)
    .replace(/\{challenge\}/g, challengeLbl)
    .replace(/\{coachingStyle\}/g, String(coachingStyleNum))
    .replace(/\{userBlock\}/g, userBlock)
    .replace(/\{liveContext\}/g, buildLiveContext());
}

/**
 * Convenience : get the live user context from localStorage. Used by api.js
 * functions that don't already have profile threaded in (most cases).
 */
export function getLiveUserContext(lang = 'fr') {
  return buildUserContext(loadUserProfile(), lang);
}

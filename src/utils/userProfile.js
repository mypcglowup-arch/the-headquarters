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

/**
 * Build the runtime USER CONTEXT block injected into combinedContext for every
 * agent call. Single-paragraph, machine-parseable, agent-readable. Produces
 * NULL when profile is empty so callers can drop the block silently.
 *
 * Spec : "Stade business: [stade] | Expérience: [années] | Force: [force] |
 *         Défi: [défi] | Style coaching voulu: [1-5] | Ce qui a pas marché: [texte] |
 *         Disponibilité: [moments]"
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

  if (parts.length === 0) return null;

  const header = L ? 'PROFIL UTILISATEUR (utilise ces données pour calibrer ton ton et tes conseils — naturellement, jamais mécaniquement) :' : 'USER PROFILE (use this data to calibrate tone and advice — naturally, never mechanically):';
  const calibration = L
    ? 'Calibration : adapte le vocabulaire au stade, ajuste la profondeur à l\'expérience, renforce la force, challenge la faiblesse, reviens automatiquement sur le défi déclaré, évite de resuggérer ce qui n\'a pas marché, calibre l\'intensité au style de coaching demandé.'
    : 'Calibration: match vocabulary to stage, depth to experience, reinforce strengths, challenge weaknesses, automatically return to declared challenges, avoid resuggesting what already failed, calibrate intensity to requested coaching style.';
  return [header, parts.join(' | '), calibration].join('\n');
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
  // Resolved sector label — fall back to '' if no sector or custom not set
  let sectorLabel = '';
  if (ctx?.profile?.sector) {
    if (ctx.profile.sector === 'other') {
      sectorLabel = (ctx.profile.sectorCustom || '').trim();
    } else {
      const s = getSector(ctx.profile.sector);
      sectorLabel = s?.label?.fr || ctx.profile.sector;
    }
  }
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

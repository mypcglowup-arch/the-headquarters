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

const LS_PROFILE = 'qg_user_profile_v1';

const DEFAULT_PROFILE = {
  name:         '',
  role:         '',
  annualGoal:   50000,
  sector:       null,        // id from data/sectors.js — null = not set
  sectorCustom: '',          // free-text label when sector === 'other'
  audience:     null,        // 'b2b' | 'b2c' | 'both' | null
  createdAt:    null,
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
    name:         (profile.name || '').trim() || (lang === 'fr' ? "l'utilisateur" : 'the user'),
    role:         (profile.role || '').trim() || null,
    annualGoal:   Number(profile.annualGoal) || null,
    sector:       profile.sector || null,
    sectorCustom: profile.sectorCustom || '',
    audience:     profile.audience || null,
    profile,                               // raw — for callers that need formatSectorContext
  };
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
  return promptString
    .replace(/\{NAME\}/g, name.toUpperCase())
    .replace(/\{name\}/g, name)
    .replace(/\{role\}/g, role)
    .replace(/\{annualGoal\}/g, annualGoal)
    .replace(/\{sector\}/g, sectorLabel)
    .replace(/\{audience\}/g, audience);
}

/**
 * Convenience : get the live user context from localStorage. Used by api.js
 * functions that don't already have profile threaded in (most cases).
 */
export function getLiveUserContext(lang = 'fr') {
  return buildUserContext(loadUserProfile(), lang);
}

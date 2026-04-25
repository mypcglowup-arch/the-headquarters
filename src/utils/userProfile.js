/**
 * User profile — name, role, optional annualGoal pulled from onboarding.
 *
 * Source of truth : localStorage `qg_user_profile_v1` (synced to Supabase
 * fire-and-forget via syncUserProfile in lib/sync.js).
 *
 * Used everywhere prompts/PDF/UI need to address the user by name. Replaces
 * the hardcoded "Samuel" everywhere. Mem0 USER_ID stays 'samuel' on purpose
 * (technical partition key — changing it would orphan existing memories).
 */

const LS_PROFILE = 'qg_user_profile_v1';

const DEFAULT_PROFILE = {
  name:       '',
  role:       '',
  annualGoal: 50000,
  createdAt:  null,
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
    name:       (profile.name || '').trim() || (lang === 'fr' ? "l'utilisateur" : 'the user'),
    role:       (profile.role || '').trim() || null,
    annualGoal: Number(profile.annualGoal) || null,
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
  return promptString
    .replace(/\{NAME\}/g, name.toUpperCase())
    .replace(/\{name\}/g, name)
    .replace(/\{role\}/g, role)
    .replace(/\{annualGoal\}/g, annualGoal);
}

/**
 * Convenience : get the live user context from localStorage. Used by api.js
 * functions that don't already have profile threaded in (most cases).
 */
export function getLiveUserContext(lang = 'fr') {
  return buildUserContext(loadUserProfile(), lang);
}

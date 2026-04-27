/**
 * i18n — centralized translation layer.
 *
 * Three usage patterns supported (backward compat preserved):
 *
 *   1. Imperative — old call sites that already pass `lang` explicitly :
 *        import { t } from '../i18n.js';
 *        t('chat.session', lang)                      // => 'Session #'
 *
 *   2. Hook — new components reading lang from context :
 *        import { useTranslation } from '../i18n';
 *        const { t, lang, setLang } = useTranslation();
 *        t('chat.session')                            // => 'Session #'
 *
 *   3. Context provider — wrap App once :
 *        <LanguageProvider value={lang} setLang={setLang}>
 *          {children}
 *        </LanguageProvider>
 *
 * Lookup order : current lang → English → key (last-resort fallback).
 * The user's preferred lang lives in userProfile.language (synced to
 * Supabase + localStorage). Legacy storage `qg_lang_v1` is auto-migrated
 * to userProfile on first read.
 */

import { createContext, useContext, useCallback } from 'react';
import { TRANSLATIONS } from './translations.js';

// ── Imperative t() — keeps old API working ───────────────────────────────
export function t(key, lang = 'fr', vars = {}) {
  const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.fr;
  let str = dict[key] ?? TRANSLATIONS.en[key] ?? TRANSLATIONS.fr[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

// ── Detect default language at first boot ────────────────────────────────
// Reads (in order) : userProfile.language → legacy qg_lang_v1 → browser.
export function detectDefaultLang() {
  try {
    const profileRaw = localStorage.getItem('qg_user_profile_v1');
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      if (profile?.language === 'fr' || profile?.language === 'en') {
        return profile.language;
      }
    }
  } catch { /* ignore */ }
  try {
    const legacy = localStorage.getItem('qg_lang_v1');
    if (legacy === 'fr' || legacy === 'en') return legacy;
  } catch { /* ignore */ }
  const browser = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
  return browser.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

// ── React Context + hook ─────────────────────────────────────────────────
export const LanguageContext = createContext({
  lang:    'fr',
  setLang: () => {},
});

export function LanguageProvider({ lang = 'fr', setLang = () => {}, children }) {
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * useTranslation — React hook, reads lang from context.
 *
 *   const { t, lang, setLang } = useTranslation();
 *   t('header.dashboard')                            // => 'Tableau de bord' (FR) | 'Dashboard' (EN)
 *   t('journal.stats', { todo: 3, done: 1 })         // => substitution OK
 */
export function useTranslation() {
  const { lang, setLang } = useContext(LanguageContext);
  const tBound = useCallback(
    (key, vars = {}) => t(key, lang, vars),
    [lang]
  );
  return { t: tBound, lang, setLang };
}

// ── Re-export the raw dict (for callers that need to enumerate keys) ─────
export { TRANSLATIONS };

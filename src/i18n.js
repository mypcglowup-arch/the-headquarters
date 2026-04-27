// Backward-compatibility shim — the real implementation lives in ./i18n/index.jsx
// All existing call sites (`import { t, detectDefaultLang } from './i18n.js'`) keep working.
// New code should import from './i18n' (resolves to the index) for the React hook.
export { t, detectDefaultLang, LanguageContext, LanguageProvider, useTranslation, TRANSLATIONS } from './i18n/index.jsx';

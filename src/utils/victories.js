/**
 * Journal de victoires avec ROI.
 *
 * Source de vérité : Supabase (cloud-first). localStorage = cache pour boot
 * rapide. La réconciliation merge cloud + local au mount via id (cloud gagne).
 *
 * Différent de qg_wins_v1 : celui-ci est un quick-log inline depuis le chat
 * (Log as Win → 1-line + agent). qg_victories_v1 est le journal structuré
 * officiel avec catégorie, valeur mensuelle, ROI dérivé.
 */

const LS_VICTORIES = 'qg_victories_v1';

export const VICTORY_CATEGORIES = [
  { id: 'client-signed',  label: { fr: 'Client signé',     en: 'Client signed' },     color: 'emerald', rgb: '16,185,129' },
  { id: 'deal-closed',    label: { fr: 'Deal closé',        en: 'Deal closed' },       color: 'emerald', rgb: '16,185,129' },
  { id: 'feature-shipped',label: { fr: 'Feature livrée',    en: 'Feature shipped' },   color: 'blue',    rgb: '59,130,246' },
  { id: 'milestone',      label: { fr: 'Milestone',         en: 'Milestone' },         color: 'violet',  rgb: '139,92,246' },
  { id: 'other',          label: { fr: 'Autre',             en: 'Other' },             color: 'gray',    rgb: '148,163,184' },
];

export function getCategoryConfig(categoryId) {
  return VICTORY_CATEGORIES.find((c) => c.id === categoryId) || VICTORY_CATEGORIES[VICTORY_CATEGORIES.length - 1];
}

// ─── Local cache I/O ────────────────────────────────────────────────────────
export function loadVictories() {
  try {
    const raw = localStorage.getItem(LS_VICTORIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveVictoriesCache(victories) {
  try { localStorage.setItem(LS_VICTORIES, JSON.stringify(victories || [])); } catch { /* ignore */ }
}

// ─── ROI compute ────────────────────────────────────────────────────────────
/**
 * Compute ROI projection from a single monthly value.
 * @param {number} valueMonthly — recurring monthly amount in $ (0 = no $ impact)
 * @param {number} annualGoal — {name}'s yearly objective (default 50000)
 * @returns {{ annual:number, goalPercent:number, mrrImpact:number }}
 */
export function computeROI(valueMonthly, annualGoal = 50000) {
  const v = Number(valueMonthly) || 0;
  const annual = v * 12;
  const goal = Number(annualGoal) || 50000;
  const goalPercent = goal > 0 ? (annual / goal) * 100 : 0;
  return {
    annual,
    goalPercent: Math.round(goalPercent * 10) / 10,
    mrrImpact: v,
  };
}

/** Sum of monthly value across victories. */
export function totalMonthlyValue(victories) {
  return (victories || []).reduce((sum, v) => sum + (Number(v.value_monthly) || 0), 0);
}

/** Annualized cumulative value across all victories. */
export function totalAnnualValue(victories) {
  return totalMonthlyValue(victories) * 12;
}

/** Number of victories created in the current month. */
export function thisMonthCount(victories, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  return (victories || []).filter((v) => {
    const d = new Date(v.created_at);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;
}

// ─── Agent context formatting ───────────────────────────────────────────────
/**
 * Build a context block listing the 5 most recent victories for agent prompts.
 * Returns null if no victories — caller skips the section entirely.
 */
export function formatVictoriesContext(victories, lang = 'fr') {
  if (!Array.isArray(victories) || victories.length === 0) return null;
  const recent = [...victories]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);
  const header = lang === 'fr'
    ? "VICTOIRES RÉCENTES DE {NAME} (référence-les naturellement quand pertinent — preuves de momentum) :"
    : "{NAME}'S RECENT VICTORIES (reference these naturally when relevant — proof of momentum):";
  const lines = recent.map((v) => {
    const cat = getCategoryConfig(v.category)?.label?.[lang] || v.category || '';
    const val = Number(v.value_monthly) > 0
      ? ` · ${Number(v.value_monthly).toLocaleString()}$/mois (${(Number(v.value_monthly) * 12).toLocaleString()}$/an)`
      : '';
    const dateStr = v.created_at ? new Date(v.created_at).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA') : '';
    return `- [${cat}${dateStr ? ' · ' + dateStr : ''}] ${v.description}${val}`;
  });
  return header + '\n' + lines.join('\n');
}

// ─── Filters ────────────────────────────────────────────────────────────────
export function filterVictoriesByCategory(victories, categoryId) {
  if (!categoryId) return victories;
  return (victories || []).filter((v) => v.category === categoryId);
}

export function filterVictoriesByPeriod(victories, days, now = Date.now()) {
  if (!days) return victories;
  const cutoff = now - days * 86_400_000;
  return (victories || []).filter((v) => new Date(v.created_at).getTime() >= cutoff);
}

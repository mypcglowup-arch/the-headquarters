// ── Saved responses library (localStorage, keyed per session user) ─────────────

const KEY = 'hq_library';

export function getSavedResponses() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveResponse({ id, agent, domain, content, timestamp }) {
  const all = getSavedResponses();
  // Avoid duplicates
  if (all.some((r) => r.id === id)) return all;
  const entry = { id, agent, domain, content: content.slice(0, 2000), timestamp, savedAt: Date.now() };
  const next = [entry, ...all].slice(0, 200); // cap at 200
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function unsaveResponse(id) {
  const next = getSavedResponses().filter((r) => r.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function isSaved(id) {
  return getSavedResponses().some((r) => r.id === id);
}

/**
 * Per-device user ID — partitions Supabase rows + Mem0 memories so each tester
 * has an isolated workspace. Generated lazily on first read and persisted in
 * localStorage. Stable across reloads, independent of the user's display name.
 *
 * NOT cleared by the "Refaire l'onboarding" flow — only by an explicit
 * DevTools wipe of localStorage. The same physical device keeps the same ID
 * even after a profile reset.
 */

const LS_KEY = 'qg_user_id';

// Legacy fallback : the original single-user app hardcoded 'samuel' as the
// partition key. Anyone opening the app before this migration may have rows
// under that ID. New devices get a fresh UUID ; existing devices that already
// have data linked to 'samuel' keep it so their history isn't orphaned.
const LEGACY_ID = 'samuel';

let cached = null;

/** Sync UUID generator with a fallback for very old browsers. */
function generateId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  // Fallback : RFC4122-ish v4 from Math.random. Acceptable since this is just
  // a partition key, not a security token.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the stable per-device user ID. Generates and persists one on first
 * call. Safe to call from module scope (returns LEGACY_ID server-side / SSR).
 */
export function getUserId() {
  if (cached) return cached;
  if (typeof window === 'undefined' || !window.localStorage) {
    cached = LEGACY_ID;
    return cached;
  }
  try {
    const existing = localStorage.getItem(LS_KEY);
    if (existing && existing.trim()) {
      cached = existing.trim();
      return cached;
    }
    const fresh = generateId();
    localStorage.setItem(LS_KEY, fresh);
    cached = fresh;
    return cached;
  } catch {
    // Privacy mode / quota error → fall back to the legacy ID so the app at
    // least functions (single shared workspace, like before this migration).
    cached = LEGACY_ID;
    return cached;
  }
}

/** Force-reset for tests or manual cleanup. Generates and stores a new UUID. */
export function resetUserId() {
  try { localStorage.removeItem(LS_KEY); } catch {}
  cached = null;
  return getUserId();
}

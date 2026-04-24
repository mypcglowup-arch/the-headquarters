/**
 * Gmail background watcher — polls business inbox every 5 min and classifies
 * new emails for urgency. Fires a callback when an urgent email appears.
 *
 * Designed to be cheap:
 *   - Only polls when tab is visible (document.visibilityState === 'visible')
 *   - Only classifies messages whose IDs aren't already in the seen set
 *   - On first run, seeds the seen set without firing callbacks (no "fake" bursts)
 */

import { gmailService } from './gmailService.js';
import { classifyEmailUrgency } from '../api.js';
import { getGmailTokens, clearGmailTokens } from './gmailAuth.js';

const LS_SEEN_IDS = 'hq_gmail_watcher_seen_v1';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SEEN_CAP = 500; // cap the LRU to avoid unbounded growth

function loadSeenIds() {
  try {
    const raw = localStorage.getItem(LS_SEEN_IDS);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(set) {
  try {
    // Keep only the most recent MAX_SEEN_CAP entries
    const arr = Array.from(set).slice(-MAX_SEEN_CAP);
    localStorage.setItem(LS_SEEN_IDS, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function clearSeenIds() {
  try { localStorage.removeItem(LS_SEEN_IDS); } catch { /* ignore */ }
}

/**
 * Start the watcher. Returns a stop() function.
 *
 * @param {object}   opts
 * @param {function} opts.onUrgent   - callback(email, classification) when an urgent email is detected
 * @param {function} opts.onUnauthorized - callback() when Gmail returns 401
 * @param {string}   opts.lang       - 'fr' | 'en'
 * @param {number}   opts.intervalMs - poll cadence (defaults to 5 min)
 */
export function startGmailWatcher({ onUrgent, onUnauthorized, lang = 'fr', intervalMs = POLL_INTERVAL_MS }) {
  let timer = null;
  let isPolling = false;
  let hasSeeded = loadSeenIds().size > 0;

  const poll = async () => {
    if (isPolling) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const tokens = getGmailTokens();
    if (!tokens) return;

    isPolling = true;
    try {
      const emails = await gmailService.getRecentEmails(tokens.access_token, 10);
      const seen = loadSeenIds();

      // Identify net-new emails
      const newOnes = emails.filter((e) => e.id && !seen.has(e.id));

      if (!hasSeeded) {
        // First run after a clean state — mark current inbox as baseline, no toasts
        emails.forEach((e) => { if (e.id) seen.add(e.id); });
        saveSeenIds(seen);
        hasSeeded = true;
        console.log('[GmailWatcher] seeded baseline with', emails.length, 'emails');
        return;
      }

      if (newOnes.length === 0) return;
      console.log('[GmailWatcher] found', newOnes.length, 'new business email(s)');

      // Classify sequentially to avoid Haiku burst; each call is tiny
      for (const email of newOnes) {
        // Always mark as seen even if classification fails — don't re-classify
        seen.add(email.id);
        try {
          const classification = await classifyEmailUrgency(email, lang);
          if (classification?.isUrgent && onUrgent) {
            onUrgent(email, classification);
          }
        } catch (err) {
          console.warn('[GmailWatcher] classify error:', err.message);
        }
      }
      saveSeenIds(seen);
    } catch (err) {
      if (err?.message === 'UNAUTHORIZED') {
        clearGmailTokens();
        if (onUnauthorized) onUnauthorized();
      } else {
        console.warn('[GmailWatcher] poll error:', err.message);
      }
    } finally {
      isPolling = false;
    }
  };

  // Fire once immediately to seed the baseline (or catch emails that arrived
  // since the last session), then settle into the interval
  poll();
  timer = setInterval(poll, intervalMs);

  // Also re-poll when the tab becomes visible again (user was away)
  const onVisibility = () => { if (document.visibilityState === 'visible') poll(); };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

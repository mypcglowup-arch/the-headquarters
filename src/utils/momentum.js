const LS_OPENS   = 'qg_opens_v1';
const LS_SESSIONS = 'qg_sessions_v1';
const LS_CACHE    = 'qg_mirror_v1';

function getLog(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function writeLog(key, arr) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  localStorage.setItem(key, JSON.stringify(arr.filter((t) => t > cutoff)));
}

export function logAppOpen() {
  // Only log once per browser session (survives HMR re-mounts, not page refreshes)
  if (sessionStorage.getItem('qg_open_logged')) return;
  sessionStorage.setItem('qg_open_logged', '1');
  const opens = getLog(LS_OPENS);
  opens.push(Date.now());
  writeLog(LS_OPENS, opens);
}

export function logSessionStart() {
  const sessions = getLog(LS_SESSIONS);
  sessions.push(Date.now());
  writeLog(LS_SESSIONS, sessions);
}

export function getMomentumStats(streak) {
  const now  = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const day  = 24 * 60 * 60 * 1000;

  const opens    = getLog(LS_OPENS);
  const sessions = getLog(LS_SESSIONS);

  const opensThisWeek    = opens.filter((t) => t > now - week).length;
  const sessionsThisWeek = sessions.filter((t) => t > now - week).length;

  const allTime   = sessions.filter((t) => t > 0);
  const last      = allTime.length ? Math.max(...allTime) : null;
  const lastSessionDaysAgo = last ? Math.floor((now - last) / day) : null;

  return { opensThisWeek, sessionsThisWeek, lastSessionDaysAgo, streak };
}

const CACHE_VERSION = 'v3'; // bump to invalidate old cached messages

export function getCachedMirror(stats, lang = 'fr') {
  try {
    const raw = localStorage.getItem(LS_CACHE);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (
      c.version === CACHE_VERSION &&
      c.date === new Date().toDateString() &&
      c.sessions === stats.sessionsThisWeek &&
      c.lang === lang
    ) return c.mirror;
    return null;
  } catch { return null; }
}

export function setCachedMirror(mirror, stats, lang = 'fr') {
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify({
      version: CACHE_VERSION,
      mirror,
      date: new Date().toDateString(),
      sessions: stats.sessionsThisWeek,
      lang,
    }));
  } catch {}
}

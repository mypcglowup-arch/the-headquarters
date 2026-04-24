const LS_EMOTION = 'qg_emotion_log_v1';
const MAX_ENTRIES = 200;

/**
 * Log an emotional state reading from the coordinator.
 */
export function logEmotionState(state, sessionId) {
  if (!state || state === 'neutral') return; // neutral = no signal worth logging
  try {
    const log = loadEmotionLog();
    log.unshift({ date: new Date().toISOString(), state, sessionId: sessionId || null });
    localStorage.setItem(LS_EMOTION, JSON.stringify(log.slice(0, MAX_ENTRIES)));
  } catch {}
}

export function loadEmotionLog() {
  try { return JSON.parse(localStorage.getItem(LS_EMOTION) || '[]'); } catch { return []; }
}

/**
 * Compute dominant emotional pattern from the last N days.
 */
function getRecentPatterns(days = 14) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const log = loadEmotionLog().filter((e) => new Date(e.date).getTime() > cutoff);
  if (log.length === 0) return null;

  const counts = {};
  log.forEach((e) => { counts[e.state] = (counts[e.state] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { total: log.length, dominant: sorted[0]?.[0], counts, sorted };
}

/**
 * Generate a short context string for injection into agent prompts.
 * Returns null if insufficient data.
 */
export function formatEmotionContext(lang = 'fr') {
  const patterns = getRecentPatterns(14);
  if (!patterns || patterns.total < 3) return null;

  const { dominant, counts, total } = patterns;
  const recent7 = getRecentPatterns(7);

  const stateDescFr = {
    frustrated:  'de la frustration',
    discouraged: 'du découragement',
    excited:     'de l\'enthousiasme',
    urgent:      'de l\'urgence / pression',
    confused:    'de la confusion / surcharge',
  };
  const stateDescEn = {
    frustrated:  'frustration',
    discouraged: 'discouragement',
    excited:     'excitement/energy',
    urgent:      'urgency/pressure',
    confused:    'confusion/overwhelm',
  };

  if (lang === 'fr') {
    const domLabel = stateDescFr[dominant] || dominant;
    const lines = [`PATTERNS ÉMOTIONNELS DE SAMUEL (14 derniers jours, ${total} signaux détectés):`];
    lines.push(`État dominant: **${dominant}** (${counts[dominant]}x) — ${domLabel}`);
    if (recent7 && recent7.dominant !== dominant) {
      lines.push(`Cette semaine, tendance plus vers: ${stateDescFr[recent7.dominant] || recent7.dominant}`);
    }
    // Add triggers from top 3
    const top3 = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    if (top3.length > 1) {
      lines.push(`Mix: ${top3.map(([s,n]) => `${s}(${n}x)`).join(', ')}`);
    }
    lines.push('Utilise ces patterns pour adapter ton ton dès le premier message.');
    return lines.join('\n');
  } else {
    const domLabel = stateDescEn[dominant] || dominant;
    const lines = [`SAMUEL'S EMOTIONAL PATTERNS (last 14 days, ${total} signals detected):`];
    lines.push(`Dominant state: **${dominant}** (${counts[dominant]}x) — ${domLabel}`);
    if (recent7 && recent7.dominant !== dominant) {
      lines.push(`This week trending toward: ${stateDescEn[recent7.dominant] || recent7.dominant}`);
    }
    const top3 = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    if (top3.length > 1) {
      lines.push(`Mix: ${top3.map(([s,n]) => `${s}(${n}x)`).join(', ')}`);
    }
    lines.push('Use these patterns to calibrate your tone from the first message.');
    return lines.join('\n');
  }
}

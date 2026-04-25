const LS_WINS = 'qg_wins_v1';

export function loadWins() {
  try {
    const raw = localStorage.getItem(LS_WINS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveWin(win) {
  const wins = loadWins();
  const entry = {
    id: `win-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text: win.text,
    agent: win.agent || 'GENERAL',
    date: new Date().toISOString(),
    sessionId: win.sessionId || null,
  };
  const updated = [entry, ...wins].slice(0, 50); // keep last 50
  try { localStorage.setItem(LS_WINS, JSON.stringify(updated)); } catch {}
  return entry;
}

export function deleteWin(id) {
  const wins = loadWins().filter((w) => w.id !== id);
  try { localStorage.setItem(LS_WINS, JSON.stringify(wins)); } catch {}
}

export function formatWinsContext(wins, lang = 'fr') {
  if (!wins || wins.length === 0) return null;
  const recent = wins.slice(0, 5);
  const header = lang === 'fr'
    ? 'VICTOIRES RÉCENTES DE {NAME} (à référencer quand le momentum est bas):'
    : "{NAME}'S RECENT WINS (reference these when momentum is low):";
  return header + '\n' + recent.map((w) => `- ${w.text}`).join('\n');
}

// Detect positive/win signals in agent message text
export function detectWinSignal(text) {
  const patterns = [
    /tu as (signé|gagné|closé|décroché|obtenu)/i,
    /you (signed|won|closed|landed|got)/i,
    /félicitations|bravo|excellent|impressionnant/i,
    /congratulations|great job|well done|impressive/i,
    /c'est une victoire|that's a win/i,
    /progress|progrès|avancement/i,
  ];
  return patterns.some((p) => p.test(text));
}

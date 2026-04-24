const LS_HISTORY = 'qg_session_history_v1';
const MAX_SESSIONS = 10;

export function saveSession({ id, date, mode, messages, consensusLine, summary }) {
  try {
    const history = loadHistory();
    history.unshift({ id, date, mode, messages, consensusLine, summary });
    localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(0, MAX_SESSIONS)));
  } catch {}
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
  } catch { return []; }
}

// ─── Inject into agent context ───────────────────────────────────────────────

export function formatHistoryContext() {
  const history = loadHistory();
  if (history.length === 0) return null;

  const recent = history.slice(0, 3);
  const lines = recent.map((s, i) => {
    const date = new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const decisions = s.summary?.keyDecisions
      ?.slice(0, 2)
      .map((d) => (typeof d === 'string' ? d : d.decision))
      .join('; ');
    const action = s.summary?.consensusAction || s.consensusLine || null;
    const parts = [`  [${date} — ${s.mode || 'strategic'} mode]`];
    if (decisions) parts.push(`  Topics: ${decisions}`);
    if (action)    parts.push(`  Aligned action: ${action}`);
    return parts.join('\n');
  });

  return `SAMUEL'S RECENT SESSION HISTORY — use for continuity, reference naturally:\n${lines.join('\n\n')}`;
}

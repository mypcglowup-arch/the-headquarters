/**
 * Past-week data aggregation for the Monday auto-session.
 *
 * Pulls from localStorage only — wins, decisions, session history, journal items.
 * Mem0 priorities/blockers are fetched separately (they require a network call).
 */

import { loadWins } from './wins.js';
import { loadHistory } from './sessionHistory.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function toTs(dateLike) {
  if (!dateLike) return 0;
  if (typeof dateLike === 'number') return dateLike;
  const t = new Date(dateLike).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Wins logged in the past 7 days, newest first. */
export function getPastWeekWins(now = Date.now()) {
  const cutoff = now - SEVEN_DAYS_MS;
  return loadWins()
    .filter((w) => toTs(w.date) >= cutoff)
    .slice(0, 10);
}

/** Decisions logged in the past 7 days (+ their outcomes if known). */
export function getPastWeekDecisions(now = Date.now()) {
  const cutoff = now - SEVEN_DAYS_MS;
  let all = [];
  try {
    all = JSON.parse(localStorage.getItem('qg_decisions_v1') || '[]');
  } catch { /* ignore */ }
  return all
    .filter((d) => toTs(d.date || d.decided_at) >= cutoff)
    .slice(0, 10);
}

/**
 * Session-level signals from the past 7 days.
 * Blockers are inferred from improvements that are still 'todo' / 'in-progress'
 * — those are the things Samuel decided to address but hasn't closed yet.
 */
export function getPastWeekSessions(now = Date.now()) {
  const cutoff = now - SEVEN_DAYS_MS;
  return loadHistory()
    .filter((s) => toTs(s.date) >= cutoff);
}

/** Open improvements (not 'done') — these read as unresolved blockers. */
export function getOpenBlockers() {
  let journal = [];
  try {
    journal = JSON.parse(localStorage.getItem('qg_journal_v1') || '[]');
  } catch { /* ignore */ }
  return journal
    .filter((i) => i.status !== 'done')
    .slice(0, 10);
}

/**
 * Combined week summary — feed this to the LLM that generates the Monday opening.
 */
export function summarizeWeek(now = Date.now()) {
  const wins      = getPastWeekWins(now);
  const decisions = getPastWeekDecisions(now);
  const sessions  = getPastWeekSessions(now);
  const blockers  = getOpenBlockers();

  const consensusActions = sessions
    .map((s) => s.summary?.consensusAction || s.consensusLine)
    .filter(Boolean)
    .slice(0, 5);

  return {
    sessionsCount: sessions.length,
    wins: wins.map((w) => ({ text: w.text, agent: w.agent, date: w.date })),
    decisions: decisions.map((d) => ({
      decision: d.decision,
      agent:    d.agent,
      outcome:  d.outcome || null,
      outcomeComment: d.outcomeComment || null,
    })),
    blockers: blockers.map((b) => ({ text: b.improvement || b.text, status: b.status })),
    consensusActions,
  };
}

/** Compact text block for LLM prompts. */
export function formatWeekSummary(summary, lang = 'fr') {
  if (!summary) return '';
  const L = lang === 'fr';
  const lines = [];
  lines.push(L ? 'SEMAINE PASSÉE (7 derniers jours):' : 'PAST WEEK (last 7 days):');
  lines.push(L
    ? `- Sessions tenues: ${summary.sessionsCount}`
    : `- Sessions held: ${summary.sessionsCount}`);

  if (summary.wins.length > 0) {
    lines.push(L ? `- Victoires (${summary.wins.length}):` : `- Wins (${summary.wins.length}):`);
    summary.wins.slice(0, 5).forEach((w) => lines.push(`    • ${w.text}`));
  } else {
    lines.push(L ? '- Aucune victoire loggée' : '- No wins logged');
  }

  if (summary.decisions.length > 0) {
    lines.push(L ? `- Décisions prises (${summary.decisions.length}):` : `- Decisions made (${summary.decisions.length}):`);
    summary.decisions.slice(0, 5).forEach((d) => {
      const outcomeTag = d.outcome ? ` [résultat: ${d.outcome}${d.outcomeComment ? ' — ' + d.outcomeComment : ''}]` : '';
      lines.push(`    • [${d.agent}] ${d.decision}${outcomeTag}`);
    });
  }

  if (summary.blockers.length > 0) {
    lines.push(L ? `- Blocages ouverts (${summary.blockers.length}):` : `- Open blockers (${summary.blockers.length}):`);
    summary.blockers.slice(0, 5).forEach((b) => lines.push(`    • ${b.text} [${b.status}]`));
  }

  if (summary.consensusActions.length > 0) {
    lines.push(L ? '- Actions consensus récentes:' : '- Recent consensus actions:');
    summary.consensusActions.slice(0, 3).forEach((a) => lines.push(`    • ${a}`));
  }

  return lines.join('\n');
}

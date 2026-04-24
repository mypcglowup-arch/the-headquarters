import { getMomentumStats } from './momentum.js';
import { loadHistory } from './sessionHistory.js';

const LS_NOTIF = 'qg_notif_dismissed_v1';

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(LS_NOTIF) || '{}'); } catch { return {}; }
}
function dismiss(key) {
  const d = getDismissed();
  d[key] = new Date().toDateString();
  try { localStorage.setItem(LS_NOTIF, JSON.stringify(d)); } catch {}
}
function wasDismissedToday(key) {
  return getDismissed()[key] === new Date().toDateString();
}

/**
 * Check all notification conditions and return the first matching one.
 * Returns { agent, message, key } or null.
 */
export function checkNotifications(dashboard, streak, agentNames, lang = 'fr') {
  const stats = getMomentumStats();
  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri
  const history = loadHistory();

  const t = (fr, en) => lang === 'fr' ? fr : en;

  // 1. No session in 3+ days
  if (!wasDismissedToday('no_session_3d') && stats.lastSessionDaysAgo !== null && stats.lastSessionDaysAgo >= 3) {
    const name = agentNames?.['ROBBINS'] || 'The Mindset Coach';
    return {
      key: 'no_session_3d',
      agent: 'ROBBINS',
      message: t(
        `${name} a remarqué quelque chose.\n\nÇa fait **${stats.lastSessionDaysAgo} jours** sans session. Pas de jugement — mais l'absence de pattern est un pattern. Qu'est-ce qui t'a éloigné de ton QG ?`,
        `${name} noticed something.\n\n**${stats.lastSessionDaysAgo} days** without a session. No judgment — but the absence of pattern is a pattern. What kept you away from your HQ?`
      ),
    };
  }

  // 2. MRR at zero for 30+ days (check if annualGoal set but no retainers)
  const totalMRR = (dashboard?.retainers || []).reduce((s, r) => s + (r.amount || 0), 0);
  const hasGoal = (dashboard?.annualGoal || 0) > 0;
  const firstOpenDate = (() => { try { return localStorage.getItem('qg_first_open_date'); } catch { return null; } })();
  if (!wasDismissedToday('mrr_zero') && hasGoal && totalMRR === 0 && firstOpenDate) {
    const daysSinceFirst = Math.floor((Date.now() - new Date(firstOpenDate).getTime()) / 86400000);
    if (daysSinceFirst >= 30) {
      const name = agentNames?.['CARDONE'] || 'The Sales Machine';
      return {
        key: 'mrr_zero',
        agent: 'CARDONE',
        message: t(
          `${name} va être direct avec toi.\n\n**${daysSinceFirst} jours** à zéro MRR. Ton objectif est $${(dashboard.annualGoal || 0).toLocaleString()}/an — le clock tourne. Pas d'analyse. Pas de stratégie. **Combien de prospects as-tu contactés cette semaine ?**`,
          `${name} is going to be direct with you.\n\n**${daysSinceFirst} days** at zero MRR. Your goal is $${(dashboard.annualGoal || 0).toLocaleString()}/year — the clock is ticking. No analysis. No strategy. **How many prospects did you contact this week?**`
        ),
      };
    }
  }

  // 3. Streak broken (streak === 0 but had previous activity)
  if (!wasDismissedToday('streak_broken') && streak === 0 && stats.lastSessionDaysAgo !== null && stats.lastSessionDaysAgo >= 2) {
    const name = agentNames?.['ROBBINS'] || 'The Mindset Coach';
    return {
      key: 'streak_broken',
      agent: 'ROBBINS',
      message: t(
        `${name} ici. On va pas dramatiser.\n\nTa streak a été brisée. C'est pas une catastrophe — c'est un signal. Les meilleurs ne performent pas parfaitement, ils **rebondissent vite**. Tu es là maintenant. Ça compte.`,
        `${name} here. We're not going to dramatize this.\n\nYour streak broke. That's not a catastrophe — it's a signal. The best performers don't perform perfectly, they **bounce back fast**. You're here now. That counts.`
      ),
    };
  }

  // 4. Monday morning (before noon)
  if (!wasDismissedToday('monday_priority') && dow === 1 && hour < 12) {
    const name = agentNames?.['NAVAL'] || 'The Leverage Master';
    const historyCount = history.length;
    return {
      key: 'monday_priority',
      agent: 'NAVAL',
      message: t(
        `${name} — revue de début de semaine.\n\nLundi matin. ${historyCount > 0 ? `Tu as ${historyCount} sessions derrière toi.` : 'Nouvelle semaine.'} Avant d'ouvrir une session, réponds à cette question :\n\n**Quelle est l'UNE chose qui, si elle est faite cette semaine, rend tout le reste secondaire ?**`,
        `${name} — start-of-week review.\n\nMonday morning. ${historyCount > 0 ? `You have ${historyCount} sessions behind you.` : 'New week.'} Before opening a session, answer this:\n\n**What is the ONE thing that, if done this week, makes everything else secondary?**`
      ),
    };
  }

  // 5. Friday afternoon
  if (!wasDismissedToday('friday_review') && dow === 5 && hour >= 14 && hour < 20) {
    const name = agentNames?.['NAVAL'] || 'The Leverage Master';
    return {
      key: 'friday_review',
      agent: 'NAVAL',
      message: t(
        `${name} — fin de semaine.\n\nVendredi. Avant de décrocher : **qu'est-ce qui a vraiment avancé cette semaine ?** Pas ce que tu as planifié — ce qui a RÉELLEMENT bougé. Une phrase suffit.`,
        `${name} — end of week.\n\nFriday. Before you disconnect: **what actually moved forward this week?** Not what you planned — what ACTUALLY shifted. One sentence is enough.`
      ),
    };
  }

  return null;
}

export function dismissNotification(key) {
  dismiss(key);
}

// Track first open date
export function trackFirstOpen() {
  try {
    if (!localStorage.getItem('qg_first_open_date')) {
      localStorage.setItem('qg_first_open_date', new Date().toISOString());
    }
  } catch {}
}

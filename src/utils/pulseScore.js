import { getMomentumStats } from './momentum.js';

/**
 * Compute a 4-dimension Business Pulse Score.
 * Returns { energie, momentum, pipeline, finances, overall, leadAgent }
 * Each dimension: 0-10. Overall: 0-100.
 */
export function computePulseScore(dashboard, streak, checkInData = null) {
  // ── Énergie (from daily check-in emoji, else neutral 7) ──────────────────
  const energieRaw = checkInData?.energieScore ?? 7;
  const energie = Math.min(10, Math.max(0, energieRaw));

  // ── Momentum (streak + sessions this week) ──────────────────────────────
  const stats = getMomentumStats();
  const sessionsThisWeek = stats.sessionsThisWeek || 0;
  let momentumScore;
  if (streak === 0 && sessionsThisWeek === 0) momentumScore = 2;
  else if (streak < 3 || sessionsThisWeek < 2)  momentumScore = 4;
  else if (streak < 7 || sessionsThisWeek < 4)  momentumScore = 6;
  else if (streak < 14 || sessionsThisWeek < 7) momentumScore = 8;
  else                                            momentumScore = 10;

  // ── Pipeline (weighted prospect count) ──────────────────────────────────
  const p = dashboard?.pipeline || {};
  const pipelineTotal = (p.contacted || 0) + (p.replied || 0) * 2 + (p.demo || 0) * 3 + (p.signed || 0) * 5;
  let pipelineScore;
  if (pipelineTotal === 0)       pipelineScore = 1;
  else if (pipelineTotal <= 5)   pipelineScore = 4;
  else if (pipelineTotal <= 15)  pipelineScore = 6;
  else if (pipelineTotal <= 30)  pipelineScore = 8;
  else                            pipelineScore = 10;

  // ── Finances (MRR vs monthly target) ─────────────────────────────────────
  const totalMRR = (dashboard?.retainers || []).reduce((s, r) => s + (r.amount || 0), 0);
  const monthlyTarget = (Number(dashboard?.annualGoal) || 50000) / 12;
  const mrrRatio = monthlyTarget > 0 ? totalMRR / monthlyTarget : 0;
  let financesScore;
  if (mrrRatio === 0)         financesScore = 1;
  else if (mrrRatio < 0.25)   financesScore = 3;
  else if (mrrRatio < 0.50)   financesScore = 5;
  else if (mrrRatio < 0.75)   financesScore = 7;
  else if (mrrRatio < 1.00)   financesScore = 8;
  else                         financesScore = 10;

  const overall = Math.round(((energie + momentumScore + pipelineScore + financesScore) / 4) * 10);

  // ── Lead agent recommendation based on lowest dimension ─────────────────
  const dims = { energie, momentum: momentumScore, pipeline: pipelineScore, finances: financesScore };
  const lowest = Object.entries(dims).sort((a, b) => a[1] - b[1])[0][0];
  const leadAgent = lowest === 'energie'  ? 'ROBBINS'
    : lowest === 'pipeline'  ? 'CARDONE'
    : lowest === 'finances'  ? 'HORMOZI'
    : null; // momentum low → no override, let coordinator decide

  return {
    energie,
    momentum: momentumScore,
    pipeline: pipelineScore,
    finances: financesScore,
    overall,
    leadAgent,
  };
}

export function formatPulseContext(pulse, lang = 'fr') {
  const label = lang === 'fr'
    ? `BUSINESS PULSE SCORE DE {NAME} (contexte silencieux — ajuste ton ton en conséquence):
Score global: ${pulse.overall}/100
- Énergie: ${pulse.energie}/10
- Momentum: ${pulse.momentum}/10
- Pipeline: ${pulse.pipeline}/10
- Finances: ${pulse.finances}/10
${pulse.overall < 40 ? 'ALERTE: Score bas — {name} a besoin d\'énergie et de direction, pas de critique.' : pulse.overall >= 75 ? 'État: {name} est dans un bon momentum, pousse-le plus haut.' : 'État: Momentum modéré — ancre tes conseils dans des actions concrètes immédiates.'}`
    : `{NAME}'S BUSINESS PULSE SCORE (silent context — adjust your tone accordingly):
Overall score: ${pulse.overall}/100
- Energy: ${pulse.energie}/10
- Momentum: ${pulse.momentum}/10
- Pipeline: ${pulse.pipeline}/10
- Finances: ${pulse.finances}/10
${pulse.overall < 40 ? 'ALERT: Low score — {name} needs energy and direction, not criticism.' : pulse.overall >= 75 ? 'Status: {name} is in strong momentum, push him higher.' : 'Status: Moderate momentum — anchor advice in immediate concrete actions.'}`;
  return label;
}

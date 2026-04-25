/**
 * Plateau Forecaster — pure math, no LLM.
 *
 * Looks at retainers + outreach + pipeline to project 90-day MRR under
 * two scenarios (current trajectory vs corrective-actions trajectory).
 * Flags plateau when growth stalls.
 *
 * "Plateau" definition:
 *   currentMRR ≥ 500      (not zero — day-0 businesses aren't "plateauing")
 *   growthRate < 5% / mo  (new MRR / current MRR)
 *   AND (avgOutreach/week < 5 OR closingRate < 10%)
 *
 * Output shape lets the UI show either:
 *   · "Plateau detected" widget (with corrective actions via Sonnet brief)
 *   · "Healthy growth" widget (just scenarios, no actions)
 */

const DAY_MS = 86_400_000;
const MS_30 = 30 * DAY_MS;
const MS_90 = 90 * DAY_MS;

// Detection thresholds — keep all in one place so we can tune
const THRESHOLDS = {
  minMRRForPlateau:    500,   // below this = "not started yet", no plateau alert
  maxGrowthRate:       0.05,  // < 5% / month = stagnating
  minOutreachPerWeek:  5,     // < 5 outreaches/week = low velocity
  minClosingRate:      0.10,  // < 10% = conversion problem
  minRetainersToProject: 1,   // need ≥ 1 active retainer with value > 0
  improvedUpliftMult:  2.4,   // 2x outreach × 1.2x closing = 2.4x new MRR
};

/**
 * Compute a 90-day forecast + plateau detection.
 *
 * @param {object} input
 *   retainers: [{ amount, startedAt }]
 *   prospects: [{ status }] — used for closing rate
 *   followupCount30d: number — touches in last 30 days
 *   now: timestamp (default Date.now())
 */
export function computeForecast({
  retainers = [],
  prospects = [],
  followupCount30d = 0,
  now = Date.now(),
} = {}) {
  // ─── Current MRR ────────────────────────────────────────────────
  const activeRetainers = retainers.filter((r) => r && Number(r.amount) > 0);
  const currentMRR = activeRetainers.reduce((s, r) => s + Number(r.amount || 0), 0);

  // ─── Recent acquisitions (last 90 days) ────────────────────────
  const last90 = activeRetainers.filter((r) => {
    const ts = Number(r.startedAt) || 0;
    return ts > 0 && (now - ts) <= MS_90;
  });
  const newMrrPerMonth = last90.length > 0
    ? last90.reduce((s, r) => s + Number(r.amount || 0), 0) / 3
    : 0;
  const newRetainersPerMonth = last90.length / 3;

  // ─── Growth rate ────────────────────────────────────────────────
  const growthRate = currentMRR > 0 ? newMrrPerMonth / currentMRR : 0;

  // ─── Outreach velocity ─────────────────────────────────────────
  const avgOutreachPerWeek = followupCount30d / 4.3;

  // ─── Closing rate (derived from prospects distribution) ─────────
  const statusCounts = {};
  for (const p of prospects) {
    if (!p?.status) continue;
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  }
  const won = (statusCounts['Signé'] || 0) + (statusCounts['Client actif'] || 0);
  const contactedOrBeyond = ['Contacté', 'Répondu', 'Chaud', 'Démo', 'Signé', 'Client actif', 'Perdu']
    .reduce((s, k) => s + (statusCounts[k] || 0), 0);
  const closingRate = contactedOrBeyond > 0 ? won / contactedOrBeyond : 0;

  // ─── 90-day projections ─────────────────────────────────────────
  // Linear: add 3 months of current new-MRR rate
  const mrr90Current  = Math.round(currentMRR + (newMrrPerMonth * 3));
  // Improved: 2x outreach × 1.2x closing → 2.4x new-MRR rate
  const mrr90Improved = Math.round(currentMRR + (newMrrPerMonth * 3 * THRESHOLDS.improvedUpliftMult));
  const upliftDelta   = mrr90Improved - mrr90Current;
  const upliftPct     = mrr90Current > 0 ? (upliftDelta / mrr90Current) : 0;

  // ─── Trajectory display + plateau detection (separate gates) ───────────
  // Show the widget as soon as there's at least 1 active retainer.
  // Plateau alert needs more data (≥ 500 MRR floor) to be meaningful.
  const hasEnoughData    = activeRetainers.length >= THRESHOLDS.minRetainersToProject
                        && currentMRR > 0;
  const enoughForPlateau = hasEnoughData && currentMRR >= THRESHOLDS.minMRRForPlateau;
  const isStagnating = growthRate < THRESHOLDS.maxGrowthRate;
  const lowOutreach  = avgOutreachPerWeek < THRESHOLDS.minOutreachPerWeek;
  const lowClosing   = closingRate < THRESHOLDS.minClosingRate;
  const plateauDetected = enoughForPlateau && isStagnating && (lowOutreach || lowClosing);

  // Friendly bottleneck label for the UI
  let bottleneck = null;
  if (plateauDetected) {
    if (lowOutreach && lowClosing)      bottleneck = 'both';
    else if (lowOutreach)               bottleneck = 'outreach';
    else                                bottleneck = 'closing';
  }

  return {
    // Raw inputs
    currentMRR,
    newMrrPerMonth:      Math.round(newMrrPerMonth),
    newRetainersPerMonth: Math.round(newRetainersPerMonth * 10) / 10,
    growthRate,
    avgOutreachPerWeek:  Math.round(avgOutreachPerWeek * 10) / 10,
    closingRate,
    retainerCount:       activeRetainers.length,

    // Projections
    mrr90Current,
    mrr90Improved,
    upliftDelta,
    upliftPct,

    // Detection
    hasEnoughData,
    plateauDetected,
    bottleneck,

    // Thresholds (for UI display)
    thresholds: THRESHOLDS,
  };
}

// Simple cache-key helper — invalidate brief when retainers change
export function makeForecastFingerprint(forecast) {
  if (!forecast) return '';
  return [
    forecast.currentMRR,
    forecast.retainerCount,
    forecast.newRetainersPerMonth,
    Math.round(forecast.avgOutreachPerWeek),
    Math.round(forecast.closingRate * 100),
  ].join('|');
}

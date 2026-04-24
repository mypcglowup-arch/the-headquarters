/**
 * Anomaly Detector — week-over-week drop detection on 3 axes:
 *   1. Outreach volume (follow-up emails + prospect touches)
 *   2. Pipeline activity (status changes, contact updates)
 *   3. MRR / finances (new retainers, one-time revenues)
 *
 * Returns a single "winning" anomaly per session-start check — the axis
 * with the steepest drop that crosses the threshold AND has a baseline
 * large enough to be meaningful.
 *
 * Cooldown: once an axis fires, it's muted for 7 days (prevents nagging
 * the same drop every single session).
 */

const LS_COOLDOWNS = 'qg_anomaly_cooldowns_v1';
const WEEK_MS         = 7 * 86_400_000;
const COOLDOWN_MS     = 7 * 86_400_000;  // 7 days between alerts per axis
const MIN_BASELINE    = 3;                // previous-week count must be ≥ this to be a "real" baseline
const DROP_THRESHOLD  = 0.40;             // 40% drop required

// Axis config — each axis describes how to count items in a window + who owns it
export const AXES = {
  outreach: { label: 'Outreach',          agent: 'CARDONE' },
  pipeline: { label: 'Pipeline activity', agent: 'HORMOZI' },
  mrr:      { label: 'MRR / revenue',     agent: 'HORMOZI' },
};

// ─── Cooldown store ──────────────────────────────────────────────────────
function loadCooldowns() {
  try {
    const raw = localStorage.getItem(LS_COOLDOWNS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCooldowns(state) {
  try { localStorage.setItem(LS_COOLDOWNS, JSON.stringify(state)); } catch { /* ignore */ }
}

export function isAxisCooledDown(axis, now = Date.now()) {
  const state = loadCooldowns();
  const last = state[axis]?.firedAt;
  if (!last) return false;
  return (now - last) < COOLDOWN_MS;
}

export function markAxisFired(axis, now = Date.now()) {
  const state = loadCooldowns();
  state[axis] = { firedAt: now };
  saveCooldowns(state);
}

// ─── Window helpers ──────────────────────────────────────────────────────
export function getWeekWindows(now = Date.now()) {
  return {
    currentStart:  now - WEEK_MS,
    currentEnd:    now,
    previousStart: now - 2 * WEEK_MS,
    previousEnd:   now - WEEK_MS,
  };
}

// ─── Metric counters (pure, fed with data) ──────────────────────────────

// outreach = followup_log rows + prospect contactHistory entries
function countOutreach({ followups = [], prospects = [] }, startTs, endTs) {
  let count = 0;
  // Supabase follow-ups: uses sent_at (ISO string) or timestamp number
  for (const f of followups) {
    const ts = f?.sent_at ? new Date(f.sent_at).getTime()
             : typeof f?.sentAt === 'number' ? f.sentAt
             : 0;
    if (ts >= startTs && ts < endTs) count++;
  }
  // Local prospects: every contactHistory entry with date in window counts as a touch
  for (const p of prospects) {
    const history = Array.isArray(p?.contactHistory) ? p.contactHistory : [];
    for (const h of history) {
      const ts = Number(h?.date) || 0;
      if (ts >= startTs && ts < endTs) count++;
    }
  }
  return count;
}

// pipeline activity = any prospect.lastContactAt update + status changes (proxy)
function countPipelineActivity({ prospects = [] }, startTs, endTs) {
  let count = 0;
  for (const p of prospects) {
    const ts = Number(p?.lastContactAt || p?.updatedAt || 0);
    if (ts >= startTs && ts < endTs) count++;
  }
  return count;
}

// mrr = new one_time_revenues + retainer updates
function countMrrActivity({ oneTimes = [], retainerChanges = [], dashboardSnapshot = null }, startTs, endTs) {
  let count = 0;
  // Cloud one-time revenues
  for (const r of oneTimes) {
    const ts = r?.date ? new Date(r.date).getTime()
             : typeof r?.date === 'number' ? r.date
             : 0;
    if (ts >= startTs && ts < endTs) count++;
  }
  // Cloud retainer changes (added or updated)
  for (const r of retainerChanges) {
    const ts = r?.updated_at ? new Date(r.updated_at).getTime() : 0;
    if (ts >= startTs && ts < endTs) count++;
  }
  // Local fallback: dashboard.oneTimeRevenues array
  const localOt = Array.isArray(dashboardSnapshot?.oneTimeRevenues) ? dashboardSnapshot.oneTimeRevenues : [];
  for (const e of localOt) {
    const ts = e?.date ? new Date(e.date).getTime() : 0;
    if (ts >= startTs && ts < endTs) count++;
  }
  // Local retainers: started in window counts as 1
  const localRet = Array.isArray(dashboardSnapshot?.retainers) ? dashboardSnapshot.retainers : [];
  for (const r of localRet) {
    const ts = Number(r?.startedAt) || 0;
    if (ts >= startTs && ts < endTs) count++;
  }
  return count;
}

// ─── Main detection function ─────────────────────────────────────────────
/**
 * Returns an array of anomalies (0, 1 or more) sorted by severity desc.
 * Each anomaly: { axis, agent, current, previous, dropPct, label }
 */
export function detectAnomalies(sources, now = Date.now()) {
  const { currentStart, currentEnd, previousStart, previousEnd } = getWeekWindows(now);

  // Compute all 3 axes
  const metrics = {
    outreach: {
      current:  countOutreach(sources, currentStart, currentEnd),
      previous: countOutreach(sources, previousStart, previousEnd),
    },
    pipeline: {
      current:  countPipelineActivity(sources, currentStart, currentEnd),
      previous: countPipelineActivity(sources, previousStart, previousEnd),
    },
    mrr: {
      current:  countMrrActivity(sources, currentStart, currentEnd),
      previous: countMrrActivity(sources, previousStart, previousEnd),
    },
  };

  const anomalies = [];
  for (const [axis, cfg] of Object.entries(AXES)) {
    const { current, previous } = metrics[axis];
    if (previous < MIN_BASELINE) continue;            // not enough baseline to compare
    if (isAxisCooledDown(axis, now)) continue;         // recently alerted — skip
    const dropPct = (previous - current) / previous;
    if (dropPct < DROP_THRESHOLD) continue;            // not a real drop
    anomalies.push({
      axis,
      agent:    cfg.agent,
      label:    cfg.label,
      current,
      previous,
      dropPct,
    });
  }

  // Most severe first
  anomalies.sort((a, b) => b.dropPct - a.dropPct);
  return anomalies;
}

// Convenience — return only the TOP (most severe) anomaly that passes filters
export function pickTopAnomaly(sources, now = Date.now()) {
  const list = detectAnomalies(sources, now);
  return list[0] || null;
}

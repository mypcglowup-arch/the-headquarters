/**
 * Meeting Room — progressive onboarding + pattern-triggered interventions.
 *
 * Two layers:
 *   A) Maturity behavior suffix — always-on, computed from interactionCount.
 *      Modulates how agents respond (directive vs reactive, initiative level).
 *      An "interaction" = user message + agent response + engagement signal
 *      (follow-up message, Log as Win, reaction button, pin, save, rating).
 *      Opening a session and bouncing does NOT count.
 *
 *   B) Pattern-triggered proactive openings — override regardless of phase.
 *      If a negative pattern is detected in Mem0/history/pipeline, the
 *      relevant agent opens the session naturally — NEVER mechanically.
 *
 * The goal: the app reads the room. Even at interaction 100.
 */

const LS_COOLDOWNS = 'qg_meeting_room_state_v1';

// ─── Layer A: Maturity phases ────────────────────────────────────────────
// The suffix is injected into agent system prompts during runSession. It
// describes BEHAVIOR, not content. Agents stay themselves — just adapt pace.
export function getMaturityPhase(interactionCount) {
  const n = Number(interactionCount) || 0;
  if (n <= 5) {
    return {
      phase: 'foundational',
      minSeverityForIntervention: 'medium', // even soft patterns can fire early
      behaviorSuffix: [
        'MATURITY CONTEXT: Early interactions with Samuel (foundational phase, 0-5 interactions).',
        'Behavior: You direct the conversation. Ask the fundamental questions early.',
        'Lay the groundwork — assume he\'s still orienting. Don\'t wait long for him to drive.',
        'Tone: confident mentor breaking in a new pro. Brief questions, concrete next actions.',
      ].join('\n'),
    };
  }
  if (n <= 15) {
    return {
      phase: 'dialogue',
      minSeverityForIntervention: 'medium',
      behaviorSuffix: [
        'MATURITY CONTEXT: Samuel is past onboarding (dialogue phase, 6-15 interactions).',
        'Behavior: Leave room for him to drive, but ask good clarifying questions.',
        'Balance assertion and space. Let him surface what matters — you refine it.',
      ].join('\n'),
    };
  }
  if (n <= 30) {
    return {
      phase: 'partnership',
      minSeverityForIntervention: 'medium',
      behaviorSuffix: [
        'MATURITY CONTEXT: Samuel knows the rhythm (partnership phase, 16-30 interactions).',
        'Behavior: React to what he brings. Don\'t over-initiate unless a real signal calls for it.',
        'Tone: peer-to-peer. Brief. Assume shared context.',
      ].join('\n'),
    };
  }
  return {
    phase: 'reactive',
    minSeverityForIntervention: 'high', // only critical patterns break silence
    behaviorSuffix: [
      'MATURITY CONTEXT: Samuel is fluent in how this works (reactive phase, 31+ interactions).',
      'Behavior: Full user freedom by default. Speak when asked.',
      'Intervene uninvited ONLY on critical signals. Otherwise, let him drive.',
    ].join('\n'),
  };
}

// ─── Layer B: Pattern cooldowns (localStorage) ───────────────────────────
// Each pattern type is throttled independently. Default cooldown: 3 interactions.
const DEFAULT_COOLDOWN_INTERACTIONS = 3;

function loadState() {
  try {
    const raw = localStorage.getItem(LS_COOLDOWNS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveState(state) {
  try { localStorage.setItem(LS_COOLDOWNS, JSON.stringify(state)); } catch { /* ignore */ }
}

export function isPatternCooledDown(patternType, currentInteractionCount, cooldown = DEFAULT_COOLDOWN_INTERACTIONS) {
  if (!patternType) return false;
  const state = loadState();
  const lastFired = state[patternType]?.lastFiredAt;
  if (lastFired === undefined || lastFired === null) return false;
  return (currentInteractionCount - lastFired) < cooldown;
}

export function markPatternFired(patternType, interactionCount) {
  if (!patternType) return;
  const state = loadState();
  state[patternType] = {
    lastFiredAt: interactionCount,
    lastFiredTimestamp: Date.now(),
  };
  saveState(state);
}

// Keep the state map from growing unbounded — prune entries older than 100 interactions
export function pruneCooldowns(currentInteractionCount) {
  const state = loadState();
  let changed = false;
  for (const [k, v] of Object.entries(state)) {
    if (typeof v?.lastFiredAt === 'number' && currentInteractionCount - v.lastFiredAt > 100) {
      delete state[k];
      changed = true;
    }
  }
  if (changed) saveState(state);
}

// ─── Severity filtering ──────────────────────────────────────────────────
const SEVERITY_ORDER = { low: 0, medium: 1, high: 2 };

export function meetsSeverityBar(patternSeverity, minSeverity) {
  return (SEVERITY_ORDER[patternSeverity] ?? 0) >= (SEVERITY_ORDER[minSeverity] ?? 0);
}

// Pick the most critical pattern available, respecting cooldown + phase minimum
export function pickBestPattern(patterns, interactionCount, maturity) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const eligible = patterns
    .filter((p) => meetsSeverityBar(p.severity, maturity.minSeverityForIntervention))
    .filter((p) => !isPatternCooledDown(p.type, interactionCount))
    .sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0)
                  || (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
  return eligible[0] || null;
}

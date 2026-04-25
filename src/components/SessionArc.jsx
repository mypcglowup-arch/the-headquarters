import { Stethoscope, AlertCircle, Map, Target } from 'lucide-react';

/**
 * Session arc — 4-phase visual indicator for goal-driven session modes.
 *
 * Phases (each maps to ~2 exchanges by default):
 *   1. Diagnostic  — what's the situation
 *   2. Blocage     — where it's stuck
 *   3. Plan        — what to do
 *   4. Engagement  — commit to the next move
 *
 * Visibility rules per mode:
 *   - quick / focus / prepCall    → visible (this component renders)
 *   - strategic / architect       → hidden (caller skips render, agent gets phase suffix)
 *   - silent / roleplay / debate  → none (caller skips entirely)
 */

const PHASES = [
  { id: 'diagnostic', label: { fr: 'Diagnostic', en: 'Diagnostic' }, Icon: Stethoscope },
  { id: 'blocage',    label: { fr: 'Blocage',    en: 'Blocker' },    Icon: AlertCircle },
  { id: 'plan',       label: { fr: 'Plan',       en: 'Plan' },       Icon: Map },
  { id: 'engagement', label: { fr: 'Engagement', en: 'Commit' },     Icon: Target },
];

/** Modes that show the arc. */
const VISIBLE_MODES = ['quick', 'focus', 'prepCall'];
/** Modes that use arc internally (suffix in agent prompt) but not in UI. */
const INTERNAL_MODES = ['strategic', 'architect'];
/** Modes with no arc (free-form). */
// const NO_ARC_MODES = ['silent', 'roleplay', 'debate'];

/**
 * Returns 'visible' | 'internal' | null based on session mode.
 */
export function arcVisibility(mode) {
  if (VISIBLE_MODES.includes(mode)) return 'visible';
  if (INTERNAL_MODES.includes(mode)) return 'internal';
  return null;
}

/**
 * Map an exchange count (number of user-agent pairs) to a phase id.
 *   1 exchange  → diagnostic
 *   2-3         → blocage
 *   4-5         → plan
 *   6+          → engagement
 */
export function getCurrentPhase(exchangeCount) {
  if (exchangeCount <= 1) return 'diagnostic';
  if (exchangeCount <= 3) return 'blocage';
  if (exchangeCount <= 5) return 'plan';
  return 'engagement';
}

/** Build a short suffix to inject in agent system prompts so they know the phase. */
export function arcPhaseSuffix(phaseId, lang = 'fr') {
  const phase = PHASES.find((p) => p.id === phaseId);
  if (!phase) return '';
  const label = phase.label[lang] || phase.label.fr;
  if (lang === 'fr') {
    return `SESSION ARC — Tu es maintenant en phase "${label}". ` + (
      phaseId === 'diagnostic' ? 'Pose UNE question d\'orientation pour comprendre la situation. Pas de conseil prématuré.'
      : phaseId === 'blocage'   ? 'Fais émerger le vrai blocage avec UNE question incisive. Ne propose pas de solution encore.'
      : phaseId === 'plan'      ? 'Propose UN move concret à faire dans les 48h. Pas une liste — UN move.'
      : 'Force l\'engagement. Demande quand exactement il fera le move proposé.'
    );
  }
  return `SESSION ARC — You are now in phase "${label}". ` + (
    phaseId === 'diagnostic' ? 'Ask ONE orientation question to understand the situation. No premature advice.'
    : phaseId === 'blocage'   ? 'Surface the real blocker with ONE sharp question. Don\'t propose solutions yet.'
    : phaseId === 'plan'      ? 'Propose ONE concrete move in the next 48h. Not a list — ONE move.'
    : 'Force commitment. Ask when exactly he\'ll make the proposed move.'
  );
}

export default function SessionArc({ mode, exchangeCount = 0, darkMode, lang = 'fr' }) {
  if (arcVisibility(mode) !== 'visible') return null;

  const currentPhase = getCurrentPhase(exchangeCount);
  const currentIdx   = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg select-none"
      style={{
        background: darkMode ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.05)',
        border:     darkMode ? '1px solid rgba(99,102,241,0.18)' : '1px solid rgba(99,102,241,0.16)',
      }}
    >
      {PHASES.map((p, i) => {
        const isActive   = i === currentIdx;
        const isComplete = i < currentIdx;
        const Icon       = p.Icon;
        return (
          <div key={p.id} className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all"
              style={{
                opacity: isActive ? 1 : (isComplete ? 0.7 : 0.35),
                color: isActive
                  ? 'rgba(99,102,241,1)'
                  : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
                fontWeight: isActive ? 700 : 500,
              }}
            >
              <Icon size={10} strokeWidth={2.25} />
              <span className="text-[10px] uppercase tracking-wider">
                {p.label[lang] || p.label.fr}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div
                className="w-3 h-px"
                style={{ background: i < currentIdx ? 'rgba(99,102,241,0.5)' : (darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)') }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Check, ArrowRight } from 'lucide-react';
import {
  STAGE_OPTIONS, EXPERIENCE_OPTIONS, STRENGTH_OPTIONS,
  CHALLENGE_OPTIONS, AVAILABILITY_OPTIONS, COACHING_STYLE_LABELS,
} from '../utils/userProfile.js';
import { AGENT_CONFIG, COMMERCIAL_MODE } from '../prompts.js';
import AgentAvatar from './AgentAvatar.jsx';

/**
 * Conversational onboarding — replaces the 3-question form for first-launch
 * and "redo onboarding" flows. Walks through 9 questions one at a time, in
 * the chosen primary agent's voice. No LLM parsing — closed questions use
 * chips, open questions accept free text. Saves the profile incrementally so
 * a partial run still leaves something behind.
 *
 * Spec : 5-7 minutes, agent leads, never a form, ends with "Parfait. Je te
 * connais assez pour commencer."
 */

const FALLBACK_AGENT = 'HORMOZI';

// The script. Each step :
//   key:       the userProfile field this answer fills
//   prompt:    text the agent "says" (FR/EN). Adapted naturally per-agent below.
//   kind:      'text' | 'number' | 'single-chip' | 'multi-chip' | 'scale'
//   options:   for chip kinds — array of {key,label} or scale config
//   skippable: optional questions can be empty
//   max:       multi-chip cap
function buildScript(lang = 'fr') {
  const L = lang === 'fr';
  const opts = (table) => Object.entries(table).map(([k, v]) => ({ key: k, label: v[lang] || v.fr }));
  return [
    {
      key: 'name', kind: 'text',
      prompt: L ? "Avant qu'on commence — comment tu veux que je t'appelle ?" : "Before we start — what should I call you?",
      placeholder: L ? 'Ton prénom' : 'Your first name',
    },
    {
      key: 'role', kind: 'text', skippable: true,
      prompt: L ? "Bon. C'est quoi ton focus principal en business ces temps-ci ?" : "Good. What's your main business focus right now?",
      placeholder: L ? 'Ex: Consultant solo · Founder SaaS · Paysagiste' : 'Ex: Solo consultant · SaaS founder · Landscaper',
    },
    {
      key: 'stage', kind: 'single-chip',
      prompt: L ? "T'es à quel stade exactement ? Sois honnête, ça change tout pour la suite." : "What stage are you at exactly? Be honest — it changes everything that follows.",
      options: opts(STAGE_OPTIONS),
    },
    {
      key: 'experience', kind: 'single-chip',
      prompt: L ? "Ça fait combien de temps que tu fais du business ?" : "How long have you been doing business?",
      options: opts(EXPERIENCE_OPTIONS),
    },
    {
      key: 'annualGoal', kind: 'number', skippable: true,
      prompt: L ? "C'est quoi ton objectif annuel en revenus ? Le vrai chiffre — pas celui que tu mets sur LinkedIn." : "What's your annual revenue target? The real number — not the LinkedIn one.",
      placeholder: '50000',
      suffix: '$',
    },
    {
      key: 'strength', kind: 'single-chip',
      prompt: L ? "C'est quoi ta plus grande force ? Une seule." : "What's your biggest strength? Just one.",
      options: opts(STRENGTH_OPTIONS),
    },
    {
      key: 'challenges', kind: 'multi-chip', max: 2,
      prompt: L ? "Maintenant l'inverse — c'est quoi ton plus gros défi ces temps-ci ? Maximum deux." : "Now the inverse — what's your biggest challenge right now? Two max.",
      options: opts(CHALLENGE_OPTIONS),
    },
    {
      key: 'pastFailures', kind: 'text', skippable: true, multiline: true,
      prompt: L ? "Qu'est-ce que t'as déjà essayé qui a pas donné de résultats ? Je veux pas te resuggérer ce qui a déjà brûlé." : "What have you already tried that didn't work? I don't want to resuggest things that already burned.",
      placeholder: L ? 'Ex: ads Facebook ($800 brûlés) · cold DMs LinkedIn · webinar gratuit zéro inscription' : 'Ex: FB ads ($800 burned) · LinkedIn cold DMs · free webinar zero signups',
    },
    {
      key: 'coachingStyle', kind: 'scale',
      prompt: L ? "Sur 5, t'aimes te faire challenger comment ? 1 = doux et patient. 5 = brutal, vérité pure." : "On 5, how do you like to be challenged? 1 = soft and patient. 5 = brutal, raw truth.",
      min: 1, max: 5,
    },
    {
      key: 'availability', kind: 'multi-chip', skippable: true,
      prompt: L ? "Tu travailles surtout quand ? J'ajusterai mon timing." : "When do you mostly work? I'll adjust my timing.",
      options: opts(AVAILABILITY_OPTIONS),
    },
    {
      key: 'sensitiveTopics', kind: 'text', skippable: true, multiline: true,
      prompt: L ? "Y a-t-il des sujets que tu préfères que j'évite, sauf si tu les amènes ?" : "Any topics you'd rather I avoid, unless you bring them up first?",
      placeholder: L ? 'Ex: santé mentale · ex-associé · situation familiale (laisser vide si rien)' : 'Ex: mental health · former co-founder · family (leave empty if none)',
    },
  ];
}

function getAgentDisplayName(agentKey) {
  const cfg = AGENT_CONFIG[agentKey] || AGENT_CONFIG[FALLBACK_AGENT];
  return COMMERCIAL_MODE ? cfg.commercialName : cfg.personalName;
}

function getAgentVoiceLineFR(agentKey, baseLine) {
  // Light per-agent flavoring. Keeps the question identical, layers a 1-line preface
  // in the agent's voice so the conversation feels like THAT agent is asking.
  // Only used for the very first prompt and the final closer — body questions stay clean.
  return baseLine; // body questions are voice-neutral on purpose; agent flavor lives in opener/closer
}

export default function ConversationalOnboarding({ darkMode, lang = 'fr', initialProfile, onSave, onClose, primaryAgentDefault }) {
  const SCRIPT = useMemo(() => buildScript(lang), [lang]);
  const [step, setStep]                 = useState(0);
  const [answers, setAnswers]           = useState(() => ({ ...(initialProfile || {}) }));
  const [textValue, setTextValue]       = useState('');
  const [multiSelection, setMultiSelection] = useState([]);
  const [scaleValue, setScaleValue]     = useState(3);
  const [agentTyping, setAgentTyping]   = useState(true);
  const [transcript, setTranscript]     = useState([]); // [{from:'agent'|'user', text}]
  const transcriptEndRef                = useRef(null);

  // Lock the primary agent at mount — initially defaulted, locked in once the user picks
  // (we do NOT ask it as a step ; we infer it from primaryAgentDefault or default to HORMOZI).
  const agent = (initialProfile?.primaryAgent || primaryAgentDefault || FALLBACK_AGENT);

  // Lock body scroll, ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Auto-scroll transcript on new bubble
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript, agentTyping]);

  // Drive the conversation : whenever step changes, the agent "types" then asks
  useEffect(() => {
    if (step >= SCRIPT.length) return;
    const q = SCRIPT[step];
    const line = step === 0
      ? (lang === 'fr'
          ? `Salut. Je suis ${getAgentDisplayName(agent)}. Avant de t'aider, j'ai besoin de te connaître. ${q.prompt}`
          : `Hey. I'm ${getAgentDisplayName(agent)}. Before I help you, I need to know you. ${q.prompt}`)
      : q.prompt;

    setAgentTyping(true);
    // Reset per-step input state
    setTextValue('');
    setMultiSelection(q.kind === 'multi-chip' ? (Array.isArray(answers[q.key]) ? answers[q.key] : []) : []);
    setScaleValue(q.kind === 'scale' ? (Number(answers[q.key]) || 3) : 3);

    const t = setTimeout(() => {
      setAgentTyping(false);
      setTranscript((tr) => [...tr, { from: 'agent', text: line }]);
    }, step === 0 ? 600 : 450);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const current = SCRIPT[step];
  const isLast  = step === SCRIPT.length - 1;
  const done    = step >= SCRIPT.length;

  function commitAnswer(rawValue) {
    const q = current;
    let normalized = rawValue;
    if (q.kind === 'number') {
      const n = Number(String(rawValue).replace(/[^\d.]/g, ''));
      normalized = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (q.kind === 'text') {
      normalized = String(rawValue || '').trim();
      if (!normalized && !q.skippable) return; // required field guard
    }
    if (q.kind === 'single-chip' || q.kind === 'multi-chip' || q.kind === 'scale') {
      // value already in the right shape
    }

    // Display label for the user's reply bubble (chip key → human label)
    let displayText = '';
    if (q.kind === 'single-chip') {
      displayText = q.options.find((o) => o.key === normalized)?.label || String(normalized || '');
    } else if (q.kind === 'multi-chip') {
      const labels = (Array.isArray(normalized) ? normalized : [])
        .map((k) => q.options.find((o) => o.key === k)?.label)
        .filter(Boolean);
      displayText = labels.length ? labels.join(' · ') : (lang === 'fr' ? '— Aucun —' : '— None —');
    } else if (q.kind === 'scale') {
      const lbl = COACHING_STYLE_LABELS[normalized]?.[lang] || COACHING_STYLE_LABELS[normalized]?.fr || '';
      displayText = `${normalized}/5${lbl ? ` — ${lbl}` : ''}`;
    } else if (q.kind === 'number') {
      displayText = normalized != null ? `${Number(normalized).toLocaleString()}${q.suffix || ''}` : (lang === 'fr' ? '— Pas sûr —' : '— Not sure —');
    } else {
      displayText = normalized || (lang === 'fr' ? '— Plus tard —' : '— Later —');
    }

    setTranscript((tr) => [...tr, { from: 'user', text: displayText }]);
    const nextAnswers = { ...answers, [q.key]: normalized };
    setAnswers(nextAnswers);

    // Persist incrementally — even if the user bails midway, what's been answered sticks
    onSave({ ...nextAnswers, primaryAgent: agent, createdAt: initialProfile?.createdAt || new Date().toISOString() }, { partial: true });

    if (isLast) {
      // Closing line in agent voice
      setAgentTyping(true);
      setTimeout(() => {
        setAgentTyping(false);
        const closer = lang === 'fr'
          ? `Parfait. Je te connais assez pour commencer. Lance une session quand t'es prêt.`
          : `Perfect. I know enough to get going. Launch a session when you're ready.`;
        setTranscript((tr) => [...tr, { from: 'agent', text: closer }]);
        // Final save (full profile flag)
        onSave({ ...nextAnswers, primaryAgent: agent, createdAt: initialProfile?.createdAt || new Date().toISOString() }, { partial: false });
        setStep((s) => s + 1); // step >= SCRIPT.length → done
      }, 700);
    } else {
      setStep((s) => s + 1);
    }
  }

  function skipStep() {
    if (!current?.skippable) return;
    commitAnswer(current.kind === 'multi-chip' ? [] : (current.kind === 'number' ? null : ''));
  }

  return createPortal((
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 animate-modal-backdrop"
      style={{ background: 'rgba(3,7,18,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <div
        className="relative w-full max-w-xl h-[88vh] sm:h-[82vh] rounded-2xl flex flex-col animate-modal-in overflow-hidden"
        style={{
          background: darkMode ? 'rgba(20,20,30,0.97)' : '#ffffff',
          border: darkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(15,23,42,0.08)',
          boxShadow: '0 24px 80px -20px rgba(99,102,241,0.45), 0 0 0 1px rgba(99,102,241,0.18)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b shrink-0" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <AgentAvatar agentKey={agent} size="sm" />
          <div className="flex-1 min-w-0">
            <div className={`font-display font-bold text-[15px] leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {getAgentDisplayName(agent)}
            </div>
            <div className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              {lang === 'fr' ? `Onboarding · ${Math.min(step + 1, SCRIPT.length)} / ${SCRIPT.length}` : `Onboarding · ${Math.min(step + 1, SCRIPT.length)} / ${SCRIPT.length}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${darkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
            title={lang === 'fr' ? 'Tu peux finir plus tard — ce qui est fait reste sauvegardé.' : 'You can finish later — what\'s done stays saved.'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1 px-4 py-2 shrink-0">
          {SCRIPT.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full flex-1 transition-all"
              style={{
                background: i < step
                  ? 'rgba(99,102,241,0.85)'
                  : i === step
                    ? 'rgba(99,102,241,0.55)'
                    : (darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)'),
              }}
            />
          ))}
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto scroll-fade px-4 py-3 space-y-3">
          {transcript.map((b, i) => (
            <Bubble key={i} from={b.from} text={b.text} darkMode={darkMode} agent={agent} />
          ))}
          {agentTyping && (
            <div className="flex items-center gap-2 ml-1">
              <AgentAvatar agentKey={agent} size="sm" />
              <div className={`flex items-center gap-1 px-3 py-2 rounded-2xl ${darkMode ? 'bg-white/[0.04]' : 'bg-slate-100'}`}>
                <Dot delay={0} darkMode={darkMode} /><Dot delay={150} darkMode={darkMode} /><Dot delay={300} darkMode={darkMode} />
              </div>
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Input area */}
        {!done && !agentTyping && (
          <div className={`shrink-0 px-4 pt-3 pb-4 border-t ${darkMode ? 'border-white/[0.06] bg-gray-950/50' : 'border-slate-200 bg-slate-50/50'}`}>
            <InputForStep
              q={current}
              darkMode={darkMode}
              lang={lang}
              textValue={textValue} setTextValue={setTextValue}
              multiSelection={multiSelection} setMultiSelection={setMultiSelection}
              scaleValue={scaleValue} setScaleValue={setScaleValue}
              onCommit={commitAnswer}
              onSkip={skipStep}
            />
          </div>
        )}

        {/* Done state — close button */}
        {done && (
          <div className={`shrink-0 px-4 pt-3 pb-4 border-t flex items-center gap-2 ${darkMode ? 'border-white/[0.06]' : 'border-slate-200'}`}>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold ml-auto"
              style={{ background: 'rgba(99,102,241,0.22)', color: 'rgba(99,102,241,1)', boxShadow: '0 0 0 1px rgba(99,102,241,0.42)' }}
            >
              <Check size={14} />
              {lang === 'fr' ? 'C\'est noté' : 'Got it'}
            </button>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}

// ─── Bubbles, dots, per-step input ────────────────────────────────────────────

function Bubble({ from, text, darkMode, agent }) {
  if (from === 'agent') {
    return (
      <div className="flex items-end gap-2 max-w-[88%] animate-bubble-in">
        <div className="shrink-0"><AgentAvatar agentKey={agent} size="sm" /></div>
        <div className={`px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-[14px] leading-snug ${darkMode ? 'bg-white/[0.05] text-gray-100' : 'bg-slate-100 text-slate-900'}`}>
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end animate-bubble-in">
      <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-br-sm text-[14px] leading-snug ${darkMode ? 'bg-indigo-600/30 text-white' : 'bg-indigo-600 text-white'}`}>
        {text}
      </div>
    </div>
  );
}

function Dot({ delay = 0, darkMode }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: 5, height: 5,
        background: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.45)',
        animation: `pulse-dot 1.2s ease-in-out ${delay}ms infinite`,
      }}
    />
  );
}

function InputForStep({ q, darkMode, lang, textValue, setTextValue, multiSelection, setMultiSelection, scaleValue, setScaleValue, onCommit, onSkip }) {
  // Free text / number
  if (q.kind === 'text' || q.kind === 'number') {
    const Tag = q.multiline ? 'textarea' : 'input';
    const inputType = q.kind === 'number' ? 'number' : 'text';
    return (
      <div className="flex items-end gap-2">
        <Tag
          autoFocus
          {...(Tag === 'textarea' ? { rows: 2 } : { type: inputType })}
          inputMode={q.kind === 'number' ? 'decimal' : 'text'}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && Tag === 'input') { e.preventDefault(); onCommit(textValue); } }}
          placeholder={q.placeholder || ''}
          className={`flex-1 px-3 py-2.5 rounded-lg text-[14px] outline-none ${darkMode ? 'bg-gray-900 border border-white/10 text-white placeholder:text-gray-500 focus:border-indigo-500/50' : 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-300'} ${q.multiline ? 'resize-none min-h-[60px]' : ''}`}
        />
        <button
          onClick={() => onCommit(textValue)}
          disabled={!q.skippable && !String(textValue || '').trim()}
          className="p-2.5 rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          style={{ background: 'rgb(99,102,241)' }}
          aria-label={lang === 'fr' ? 'Envoyer' : 'Send'}
        >
          <Send size={16} />
        </button>
        {q.skippable && (
          <button
            onClick={onSkip}
            className={`px-2 py-1 text-[11px] rounded-md shrink-0 ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {lang === 'fr' ? 'Passer' : 'Skip'}
          </button>
        )}
      </div>
    );
  }

  // Single-choice chip
  if (q.kind === 'single-chip') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {q.options.map((o) => (
          <button
            key={o.key}
            onClick={() => onCommit(o.key)}
            className="px-3.5 py-2 rounded-full text-[12.5px] font-semibold tap-target transition-all"
            style={{
              background: darkMode ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.08)',
              color: darkMode ? 'rgb(199,210,254)' : 'rgb(67,56,202)',
              boxShadow: '0 0 0 1px rgba(99,102,241,0.30)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.20)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = darkMode ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.08)'; }}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  // Multi-choice chip with optional max + commit button
  if (q.kind === 'multi-chip') {
    const atCap = q.max != null && multiSelection.length >= q.max;
    const toggle = (k) => {
      if (multiSelection.includes(k)) setMultiSelection(multiSelection.filter((x) => x !== k));
      else if (!atCap) setMultiSelection([...multiSelection, k]);
    };
    return (
      <div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {q.options.map((o) => {
            const active = multiSelection.includes(o.key);
            const disabled = !active && atCap;
            return (
              <button
                key={o.key}
                onClick={() => toggle(o.key)}
                disabled={disabled}
                className="px-3.5 py-2 rounded-full text-[12.5px] font-semibold tap-target transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                style={{
                  background: active ? 'rgba(99,102,241,0.22)' : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
                  color: active ? (darkMode ? 'rgb(224,231,255)' : 'rgb(67,56,202)') : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
                  boxShadow: active ? '0 0 0 1px rgba(99,102,241,0.42)' : 'none',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {q.max != null && (
            <span className={`text-[10.5px] ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
              {lang === 'fr' ? `${multiSelection.length}/${q.max}` : `${multiSelection.length}/${q.max}`}
            </span>
          )}
          <button
            onClick={() => onCommit(multiSelection)}
            disabled={!q.skippable && multiSelection.length === 0}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(99,102,241,0.22)', color: 'rgba(99,102,241,1)', boxShadow: '0 0 0 1px rgba(99,102,241,0.42)' }}
          >
            {lang === 'fr' ? 'Continuer' : 'Continue'}
            <ArrowRight size={12} />
          </button>
          {q.skippable && (
            <button onClick={onSkip} className={`px-2 py-1 text-[11px] rounded-md ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'}`}>
              {lang === 'fr' ? 'Passer' : 'Skip'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Scale 1..5
  if (q.kind === 'scale') {
    return (
      <div>
        <input
          type="range" min={q.min} max={q.max} step="1" value={scaleValue}
          onChange={(e) => setScaleValue(Number(e.target.value))}
          className="w-full" style={{ accentColor: 'rgb(99,102,241)' }}
        />
        <div className={`mt-1 text-[12.5px] font-medium ${darkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>
          {scaleValue}/{q.max} — {COACHING_STYLE_LABELS[scaleValue]?.[lang] || COACHING_STYLE_LABELS[scaleValue]?.fr}
        </div>
        <div className="flex items-center mt-2">
          <button
            onClick={() => onCommit(scaleValue)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
            style={{ background: 'rgba(99,102,241,0.22)', color: 'rgba(99,102,241,1)', boxShadow: '0 0 0 1px rgba(99,102,241,0.42)' }}
          >
            {lang === 'fr' ? 'Continuer' : 'Continue'}
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Global Floating Input ─────────────────────────────────────────────────
// Permanent bottom bar visible on all pages except chat.
// On submit → starts a Quick Advice session with the message pre-sent.

import { useState, useRef, useEffect, useMemo } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { AGENT_CONFIG } from '../prompts.js';
import { createAudioRecorder, isMicSupported } from '../utils/voice.js';
import { getAdaptiveChips, loadUserProfile } from '../utils/userProfile.js';

// ── Step 3 — keyword-based agent prediction (instant, zero latency) ──────────
const KEYWORD_MAP = [
  {
    keys: ['vente', 'sale', 'pipeline', 'prospect', 'client', 'revenue', 'deal',
           'close', 'closer', 'mrr', 'outreach', 'appel de vente', 'signed'],
    agent: 'CARDONE',
  },
  {
    keys: ['email', 'gmail', 'mail', 'inbox', 'négoci', 'negoti', 'objection',
           'contre-offre', 'counter', 'réponse à', 'reply to'],
    agent: 'VOSS',
  },
  {
    keys: ['mindset', 'motivation', 'énergie', 'energy', 'stress', 'burnout',
           'confiance', 'confiden', 'mental', 'discipline', 'habitude', 'habit', 'focus'],
    agent: 'ROBBINS',
  },
  {
    keys: ['offre', 'offer', 'prix', 'price', 'pricing', 'valeur', 'value',
           'produit', 'product', 'service', 'package', 'upsell'],
    agent: 'HORMOZI',
  },
  {
    keys: ['brand', 'contenu', 'content', 'marketing', 'social', 'linkedin',
           'tiktok', 'instagram', 'audience', 'post', 'vidéo', 'video'],
    agent: 'GARYV',
  },
  {
    keys: ['leverage', 'scalab', 'systèm', 'system', 'invest', 'wealth', 'equity',
           'passif', 'passive', 'automatise', 'automat', 'déléguer', 'delegate'],
    agent: 'NAVAL',
  },
];

function classifyMessage(text) {
  const lower = text.toLowerCase();
  for (const { keys, agent } of KEYWORD_MAP) {
    if (keys.some((k) => lower.includes(k))) return agent;
  }
  return null;
}

// ── Placeholder rotation content ──────────────────────────────────────────────
const PLACEHOLDERS = {
  fr: [
    "Pose une question à ton équipe...",
    "Que veux-tu accomplir aujourd'hui ?",
    "Vérifie mes emails...",
    "Quel est ton prochain move ?",
  ],
  en: [
    "Ask your team a question...",
    "What do you want to accomplish today?",
    "Check my emails...",
    "What's your next move?",
  ],
};

// Quick action chips are now derived from the user profile (stage + niche)
// via getAdaptiveChips. See utils/userProfile.js for the chip packs.

// ── Component ─────────────────────────────────────────────────────────────────

export default function GlobalFloatingInput({
  screen,
  lang = 'fr',
  darkMode,
  agentNames  = {},
  agentPhotos = {},
  activeAgent = null,
  onSendGlobal,
}) {
  const [text,          setText]          = useState('');
  const [isFocused,     setIsFocused]     = useState(false);
  const [predictedAgent, setPredictedAgent] = useState(null);
  const [shownAgent,    setShownAgent]    = useState(null);
  const [phIdx,         setPhIdx]         = useState(0);
  const [showChips,     setShowChips]     = useState(false);
  const inputRef    = useRef(null);
  const classifyRef = useRef(null);

  // ── Voice (STT via Whisper) ────────────────────────────────────────────
  const micSupported = isMicSupported();
  const [micState, setMicState] = useState('idle'); // 'idle' | 'recording' | 'transcribing'
  const recRef = useRef(null);
  const preRecordingTextRef = useRef('');

  function toggleRecording() {
    if (!micSupported) return;
    if (micState === 'recording') { recRef.current?.stop(); return; }
    if (micState === 'transcribing') return;
    preRecordingTextRef.current = text;
    const rec = createAudioRecorder({
      lang: lang === 'fr' ? 'fr-CA' : 'en-US',
      onStart: () => setMicState('recording'),
      onTranscribing: () => setMicState('transcribing'),
      onFinal: (transcript) => {
        const base = preRecordingTextRef.current;
        setText(base ? `${base} ${transcript}`.trim() : transcript);
        setMicState('idle');
        setTimeout(() => inputRef.current?.focus(), 50);
      },
      onError: (err) => {
        console.warn('[Voice] Whisper error:', err);
        setMicState('idle');
      },
    });
    if (!rec) return;
    recRef.current = rec;
    rec.start();
  }

  // Rotate placeholder every 4 s
  useEffect(() => {
    const phs = PLACEHOLDERS[lang] || PLACEHOLDERS.fr;
    const id  = setInterval(() => setPhIdx((i) => (i + 1) % phs.length), 4000);
    return () => clearInterval(id);
  }, [lang]);

  // Debounced agent classification while typing (300 ms)
  useEffect(() => {
    clearTimeout(classifyRef.current);
    if (text.length < 4) { setPredictedAgent(null); return; }
    classifyRef.current = setTimeout(() => setPredictedAgent(classifyMessage(text)), 300);
    return () => clearTimeout(classifyRef.current);
  }, [text]);

  // Smooth crossfade: update shownAgent when prediction changes
  useEffect(() => { setShownAgent(predictedAgent); }, [predictedAgent]);

  // Quick chips: visible when focused + input empty. Always hidden on Profile
  // — the chips overlap the "Refaire l'onboarding" button and steal its clicks.
  useEffect(() => {
    setShowChips(isFocused && text === '' && screen !== 'profile');
  }, [isFocused, text, screen]);

  // ⚠ All hooks above this line. Adding a hook AFTER the early return below
  // breaks React's hooks-order invariant ("Rendered fewer hooks than
  // expected") because on chat/replay screens the function returns before
  // the hook is called. If you need a new hook, put it here, not after.
  const phs          = PLACEHOLDERS[lang]  || PLACEHOLDERS.fr;
  // Chips reflect the user's actual stage + niche. We re-read the profile on
  // every render of this lightweight component so a fresh onboarding completion
  // takes effect immediately without a reload — the lookup is local + cached.
  const chips        = useMemo(() => getAdaptiveChips(loadUserProfile(), lang), [lang]);
  const displayAgent = shownAgent || activeAgent;

  // ── Hidden on chat / replay (early return AFTER all hooks) ──────────────
  if (screen === 'chat' || screen === 'replay') return null;

  // ── Avatar renderer ────────────────────────────────────────────────────────
  function AvatarContent() {
    if (!displayAgent) {
      // Default: coordinator gray pulsing dot
      return (
        <div
          style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'rgba(148,163,184,0.10)',
            border: '1.5px solid rgba(148,163,184,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'coordinatorPulse 2.8s ease-in-out infinite',
          }}
        >
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'rgba(148,163,184,0.45)',
          }} />
        </div>
      );
    }

    const cfg   = AGENT_CONFIG[displayAgent];
    const photo = agentPhotos[displayAgent];
    const name  = agentNames[displayAgent] || displayAgent;
    const color = cfg?.glowRgb || '148,163,184';

    if (photo) {
      return (
        <img
          src={photo} alt={name}
          style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
        />
      );
    }
    return (
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: `rgba(${color},0.18)`,
        border: `1.5px solid rgba(${color},0.35)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color: `rgb(${color})`,
        transition: 'all 300ms ease',
      }}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSend() {
    const msg = text.trim();
    if (!msg) return;
    setText('');
    setIsFocused(false);
    onSendGlobal(msg);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleChip(chip) {
    setText('');
    setIsFocused(false);
    onSendGlobal(chip.text);
  }

  const hasText      = text.trim().length > 0;
  const tooltipLabel = displayAgent
    ? (agentNames[displayAgent] || displayAgent)
    : (lang === 'fr' ? "Ton équipe t'écoute" : 'Your team is listening');

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 48px)',
      maxWidth: 720,
      zIndex: 50,
      pointerEvents: 'auto',
    }}>

      {/* ── Step 4: Quick Action Chips ──────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 7,
        marginBottom: 10,
        opacity:    showChips ? 1 : 0,
        transform:  showChips ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 150ms ease, transform 150ms ease',
        pointerEvents: showChips ? 'auto' : 'none',
      }}>
        {chips.map((chip) => (
          <button
            key={chip.label}
            onMouseDown={(e) => { e.preventDefault(); handleChip(chip); }}
            style={{
              background:   'rgba(255,255,255,0.04)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding:      '5px 12px',
              fontSize:     11,
              color:        'rgba(148,163,184,0.70)',
              cursor:       'pointer',
              display:      'flex', alignItems: 'center', gap: 5,
              fontFamily:   'inherit',
              transition:   'background 150ms',
              whiteSpace:   'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          >
            <span style={{ fontSize: 12 }}>{chip.icon}</span>
            {chip.label}
          </button>
        ))}
      </div>

      {/* ── Main bar ────────────────────────────────────────────────────── */}
      <div style={{
        background:          'rgba(20,20,30,0.92)',
        backdropFilter:      'blur(12px)',
        WebkitBackdropFilter:'blur(12px)',
        border:              isFocused
          ? '1px solid rgba(99,102,241,0.4)'
          : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding:      '12px 16px',
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        boxShadow:    isFocused
          ? '0 8px 32px rgba(0,0,0,0.4), 0 0 0 3px rgba(99,102,241,0.08)'
          : '0 8px 32px rgba(0,0,0,0.4)',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
      }}>

        {/* Step 3 — Agent Avatar */}
        <div
          title={tooltipLabel}
          style={{ flexShrink: 0, transition: 'opacity 300ms ease' }}
        >
          <AvatarContent />
        </div>

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder={phs[phIdx]}
          style={{
            flex:       1,
            background: 'transparent',
            border:     'none',
            outline:    'none',
            fontSize:   14,
            color:      '#e2e8f0',
            fontFamily: 'inherit',
            minWidth:   0,
          }}
        />

        {/* Right icon buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>

          {/* @ mention — inserts @ into input */}
          <button
            onClick={() => { inputRef.current?.focus(); setText((t) => t + '@'); }}
            title={lang === 'fr' ? 'Mentionner un agent' : 'Mention an agent'}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderRadius: 6, fontFamily: 'inherit',
              color:      'rgba(148,163,184,0.30)',
              fontSize:   13, fontWeight: 700,
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.70)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.30)'; }}
          >
            @
          </button>

          {/* Attach file */}
          <button
            title={lang === 'fr' ? 'Joindre un fichier' : 'Attach file'}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderRadius: 6,
              color:      'rgba(148,163,184,0.30)',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.70)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.30)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          {/* Mic — Whisper STT (3 states) */}
          <button
            onClick={toggleRecording}
            disabled={!micSupported || micState === 'transcribing'}
            title={!micSupported
              ? (lang === 'fr' ? 'Micro non supporté' : 'Mic not supported')
              : micState === 'recording'
              ? (lang === 'fr' ? 'Arrêter — transcrire' : 'Stop — transcribe')
              : micState === 'transcribing'
              ? (lang === 'fr' ? 'Transcription Whisper…' : 'Whisper transcribing…')
              : (lang === 'fr' ? 'Parler (Whisper)' : 'Speak (Whisper)')}
            aria-label={micState === 'recording' ? 'Stop recording' : 'Start voice recording'}
            aria-pressed={micState === 'recording'}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background:
                micState === 'recording'    ? 'rgba(239,68,68,0.9)' :
                micState === 'transcribing' ? 'rgba(99,102,241,0.9)' :
                'transparent',
              border:
                micState === 'idle' ? '1px solid rgba(148,163,184,0.14)' : 'none',
              cursor:       micSupported && micState !== 'transcribing' ? 'pointer' : 'not-allowed',
              borderRadius: 6,
              color:
                micState === 'idle'
                  ? (micSupported ? 'rgba(148,163,184,0.7)' : 'rgba(148,163,184,0.2)')
                  : '#fff',
              transition:   'all 200ms ease',
              boxShadow:
                micState === 'recording'    ? '0 0 0 3px rgba(239,68,68,0.2), 0 0 12px rgba(239,68,68,0.35)' :
                micState === 'transcribing' ? '0 0 0 3px rgba(99,102,241,0.2), 0 0 12px rgba(99,102,241,0.35)' :
                'none',
              animation:
                micState === 'recording' ? 'pulse 1.4s ease-in-out infinite' : 'none',
            }}
          >
            {!micSupported
              ? <MicOff size={13} />
              : micState === 'transcribing'
              ? <Loader2 size={13} className="animate-spin" />
              : <Mic size={13} />}
          </button>

          {/* Send button — filled accent when input has text */}
          <button
            onClick={handleSend}
            disabled={!hasText}
            title={lang === 'fr' ? 'Envoyer' : 'Send'}
            style={{
              width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background:   hasText ? 'rgba(99,102,241,0.85)' : 'transparent',
              border:       hasText ? 'none' : '1px solid rgba(148,163,184,0.14)',
              cursor:       hasText ? 'pointer' : 'default',
              borderRadius: 8,
              color:        hasText ? '#fff' : 'rgba(148,163,184,0.22)',
              transition:   'all 200ms ease',
            }}
          >
            {/* Paper-plane icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

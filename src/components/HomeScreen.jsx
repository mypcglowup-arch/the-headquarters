import { useState, useEffect } from 'react';
import AgentCard from './AgentCard.jsx';
import FinancialBar from './FinancialBar.jsx';
import FocusTimer from './FocusTimer.jsx';
import { AGENT_CONFIG } from '../prompts.js';
import { streakEmoji } from '../utils/streak.js';
import { getThisWeekEvents } from '../utils/gcal.js';
import { t } from '../i18n.js';
import { Zap, Target, EyeOff, Crosshair, GitBranch, Phone, Swords, MessageSquare, Drama, FlameKindling, Trophy, Sparkles, Timer } from 'lucide-react';

// 'debate' lives inside the Focus panel as a sub-option — not in the main grid
const SESSION_MODE_KEYS = ['quick', 'strategic', 'silent', 'focus', 'architect', 'prepCall', 'negotiation', 'analysis', 'roleplay'];

const SESSION_MODE_ICONS = {
  quick:       Zap,
  strategic:   Target,
  silent:      EyeOff,
  focus:       Crosshair,
  architect:   GitBranch,
  prepCall:    Phone,
  negotiation: Swords,
  analysis:    MessageSquare,
  roleplay:    Drama,
  debate:      FlameKindling,
};


// Subtle per-mode tint for dark mode selected/hover
const MODE_TINTS = {
  quick:       '245,158,11',
  strategic:   '212,175,55',
  silent:      '100,116,139',
  focus:       '239,68,68',
  architect:   '71,85,105',
  prepCall:    '59,130,246',
  negotiation: '249,115,22',
  analysis:    '20,184,166',
  roleplay:    '168,85,247',
  debate:      '239,68,68',
};

const AGENT_KEYS = Object.keys(AGENT_CONFIG).filter((k) => k !== 'SYNTHESIZER');

// ─── Mode info content ────────────────────────────────────────────────────────
const MODE_INFO = {
  fr: {
    quick:       { title: 'Conseil Rapide',             usage: 'Pour les questions directes qui méritent une réponse nette.',          agents: "L'agent le plus pertinent répond seul. Les autres se taisent.",      ideal: "Décisions rapides, validation d'idées, quick wins." },
    strategic:   { title: 'Session Stratégique',        usage: 'Pour les sujets complexes qui méritent une analyse profonde.',         agents: 'Plusieurs agents interviennent avec des angles différents.',          ideal: 'Planification, pivots importants, problèmes multi-dimensionnels.' },
    silent:      { title: 'Mode Silencieux',             usage: "Tu écris librement. Rien n'est analysé en temps réel.",               agents: 'Archivage seulement. Aucune intervention des agents.',               ideal: 'Journal, réflexion personnelle, dump de pensées sans jugement.' },
    focus:       { title: 'Mode Focus',                 usage: 'Un seul conseiller. Conversation privée et directe.',                  agents: 'Tu choisis un agent. Lui seul répond pendant toute la session.',     ideal: 'Aller en profondeur avec un expert spécifique.' },
    architect:   { title: 'Mode Architecte',            usage: '3 questions avant tout conseil. Structure avant action.',               agents: 'Offer Architect mène. Il clarifie avant de conseiller.',             ideal: 'Business model, offres, structure de revenus.' },
    prepCall:    { title: 'Préparer un Appel',          usage: 'Bâtis ton script exact pour un appel prospect ou client.',             agents: 'Black Swan + Sales Machine. Anticipent les objections.',            ideal: 'Appels de vente, négociations, calls importants.' },
    negotiation: { title: 'Simulation de Négociation', usage: "Le Black Swan joue le prospect. Tu t'entraînes à closer.",             agents: 'Black Swan en mode adversaire. Il résiste. Tu convaincs.',          ideal: 'Pratiquer avant un vrai appel, gérer les objections difficiles.' },
    analysis:    { title: 'Analyse de Conversation',   usage: 'Colle un échange réel. Les agents trouvent le fix.',                   agents: 'Black Swan + Offer Architect analysent ton angle et ton timing.',   ideal: "Débloquer un prospect froid, comprendre pourquoi ça a planté." },
    roleplay:    { title: 'Roleplay',                   usage: 'Pratique un scénario complet. Coaching après la simulation.',          agents: "L'agent joue le rôle demandé. Feedback détaillé à la fin.",         ideal: 'Pitcher, négocier, gérer une situation difficile.' },
    debate:      { title: 'Mode Débat',                 usage: 'Deux conseillers s\'affrontent sur ta question. Points opposés.',       agents: 'Un conseiller PRO + un conseiller CONTRA. Positions tranchées.',     ideal: 'Valider une décision, explorer les deux côtés, casser le biais.' },
  },
  en: {
    quick:       { title: 'Quick Advice',               usage: 'For direct questions that deserve a clear answer.',                    agents: 'The most relevant agent responds alone. Others stay silent.',       ideal: 'Quick decisions, idea validation, quick wins.' },
    strategic:   { title: 'Strategic Session',          usage: 'For complex topics that deserve a deep analysis.',                    agents: 'Multiple agents contribute with different angles.',                  ideal: 'Planning, major pivots, multi-dimensional problems.' },
    silent:      { title: 'Silent Mode',                usage: 'Write freely. Nothing is analyzed in real time.',                     agents: 'Archiving only. No agent intervention.',                            ideal: 'Journal, personal reflection, brain dump without judgment.' },
    focus:       { title: 'Focus Mode',                 usage: 'One advisor. Private, direct conversation.',                          agents: 'You pick an agent. Only that agent responds for the whole session.', ideal: 'Going deep with a specific expert.' },
    architect:   { title: 'Architect Mode',             usage: '3 questions before any advice. Structure before action.',             agents: 'Offer Architect leads. Clarifies before advising.',                 ideal: 'Business model, offers, revenue structure.' },
    prepCall:    { title: 'Prep a Call',                usage: 'Build your exact script for a prospect or client call.',              agents: 'Black Swan + Sales Machine. Anticipate objections.',               ideal: 'Sales calls, negotiations, important calls.' },
    negotiation: { title: 'Negotiation Sim',            usage: 'Black Swan plays the prospect. You practice closing.',               agents: 'Black Swan in adversary mode. He resists. You convince.',           ideal: 'Practice before a real call, handle tough objections.' },
    analysis:    { title: 'Convo Analysis',             usage: 'Paste a real exchange. Agents find the fix.',                         agents: 'Black Swan + Offer Architect analyze your angle and timing.',      ideal: 'Unblock a cold prospect, understand why it fell apart.' },
    roleplay:    { title: 'Roleplay',                   usage: 'Practice a full scenario. Coaching after the simulation.',            agents: 'Agent plays the requested role. Detailed feedback at the end.',     ideal: 'Pitching, negotiating, handling a difficult situation.' },
    debate:      { title: 'Debate Mode',                usage: 'Two advisors clash on your question. Opposing viewpoints.',           agents: 'One PRO advisor + one CONTRA. Sharp, opposing positions.',          ideal: 'Validate a decision, see both sides, break confirmation bias.' },
  },
};

// ─── Mode tooltip component ───────────────────────────────────────────────────
function ModeTooltip({ info, darkMode, alignRight }) {
  const textTertiary = darkMode ? 'rgba(148,163,184,0.4)'  : '#A09B96';
  const textSecond   = darkMode ? 'rgba(148,163,184,0.75)' : '#6B6560';
  const borderColor  = darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

  return (
    <div
      data-tooltip="panel"
      style={{
        position:    'absolute',
        bottom:      'calc(100% + 8px)',
        ...(alignRight ? { right: 0 } : { left: 0 }),
        zIndex:      100,
        width:       240,
        background:  darkMode ? '#1a2035' : '#FFFFFF',
        border:      `1px solid ${borderColor}`,
        borderRadius: 12,
        padding:     '14px 16px',
        boxShadow:   '0 8px 24px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
      }}
    >
      {/* Title */}
      <p style={{ fontSize: 12, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1A1A1A', marginBottom: 10 }}>
        {info.title}
      </p>

      {/* Section 1 — CE QUE ÇA FAIT */}
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textTertiary, marginBottom: 4 }}>
        CE QUE ÇA FAIT
      </p>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: textSecond, margin: 0 }}>
        {info.usage}
      </p>

      <div style={{ height: 1, background: borderColor, margin: '10px 0' }} />

      {/* Section 2 — AGENTS IMPLIQUÉS */}
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textTertiary, marginBottom: 4 }}>
        AGENTS IMPLIQUÉS
      </p>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: textSecond, margin: 0 }}>
        {info.agents}
      </p>

      <div style={{ height: 1, background: borderColor, margin: '10px 0' }} />

      {/* Section 3 — IDÉAL POUR */}
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textTertiary, marginBottom: 4 }}>
        IDÉAL POUR
      </p>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: '#6366F1', margin: 0 }}>
        {info.ideal}
      </p>
    </div>
  );
}

function SectionLabel({ children, darkMode }) {
  return (
    <p className="font-display text-[10px] uppercase tracking-[0.18em] mb-3 font-medium"
      style={{ color: darkMode ? 'rgba(148,163,184,0.35)' : '#A09B96' }}>
      {children}
    </p>
  );
}

export default function HomeScreen({
  sessionMode, onSetMode,
  agentNames, onUpdateAgentName,
  agentPhotos, onUpdateAgentPhoto,
  agentLastSpoke,
  focusAgent, onSetFocusAgent,
  onStart, darkMode, lang = 'fr',
  streak, dailyQuote, momentumMirror, greeting,
  dashboard,
  calendarEvents, calendarConnected,
  onConnectCalendar, onDisconnectCalendar,
  hasCalendarClientId,
  gmailConnected = false,
  onConnectGmail, onDisconnectGmail,
  hasGmailClientId = false,
  wins = [],
  agentDepth = {},
}) {
  const thisWeek  = getThisWeekEvents(calendarEvents || []);
  const calLocale = lang === 'fr' ? 'fr-CA' : 'en-US';

  const [openTooltip, setOpenTooltip] = useState(null);

  // Click-outside to dismiss tooltip
  useEffect(() => {
    if (!openTooltip) return;
    function handleClick(e) {
      if (!e.target.closest('[data-tooltip]')) setOpenTooltip(null);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openTooltip]);

  return (
    <div className="flex-1 flex flex-col items-center px-5 pt-10 pb-36 gap-10 min-h-0 overflow-y-auto"
      style={{ color: darkMode ? '#e2e8f0' : '#1A1A1A' }}>

      {/* ── Greeting + Streak ── */}
      <div className="w-full max-w-3xl flex items-start justify-between" data-tour="welcome">
        <div className="animate-welcome-in">
          <p className="font-display text-[11px] uppercase tracking-[0.2em] mb-2"
            style={{ color: darkMode ? 'rgba(148,163,184,0.4)' : '#A09B96' }}>
            {greeting}
          </p>
          <h1 className="font-display font-light leading-none"
            style={{ fontSize: '2.4rem', letterSpacing: '0.15em', color: darkMode ? '#f8fafc' : '#1A1A1A' }}>
            The Headquarters
          </h1>
          <p className="mt-2 text-sm font-light"
            style={{ color: darkMode ? 'rgba(148,163,184,0.45)' : '#6B6560' }}>
            {t('home.subtitle', lang)}
          </p>
        </div>

        {streak > 0 && (
          <div className="flex flex-col items-center px-4 py-3 rounded-2xl flex-shrink-0"
            style={{
              background: darkMode ? 'rgba(10,14,24,0.8)' : 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(212,175,55,0.25)',
              boxShadow: '0 0 20px rgba(212,175,55,0.08)',
            }}>
            <span className="text-xl mb-0.5">{streakEmoji(streak)}</span>
            <span className="font-display font-bold text-xl leading-none" style={{ color: '#d4af37' }}>{streak}</span>
            <span className="text-[10px] font-medium tracking-wide mt-0.5"
              style={{ color: 'rgba(212,175,55,0.6)' }}>
              {streak !== 1 ? t('home.days', lang) : t('home.day', lang)}
            </span>
          </div>
        )}
      </div>

      {/* ── Momentum Mirror ── */}
      {momentumMirror && (
        <div className="w-full max-w-3xl animate-welcome-in" style={{ animationDelay: '0.1s' }}>
          <div className="px-5 py-4 rounded-2xl flex items-start gap-3"
            style={{
              background: darkMode ? 'rgba(10,14,24,0.6)' : '#EDE8DF',
              boxShadow: 'inset 3px 0 0 rgba(212,175,55,0.5), inset 0 0 0 1px rgba(212,175,55,0.12)',
            }}>
            <Sparkles size={14} className="flex-shrink-0 mt-0.5 opacity-60" style={{ color: 'rgba(212,175,55,0.8)' }} />
            <p className="text-sm leading-relaxed font-light"
              style={{ color: darkMode ? 'rgba(226,232,240,0.85)' : '#6B6560' }}>
              {momentumMirror}
            </p>
          </div>
        </div>
      )}

      {/* ── Financial Summary ── */}
      {dashboard && (
        <div className="w-full max-w-3xl" data-tour="financial-bar">
          <FinancialBar data={dashboard} darkMode={darkMode} lang={lang} />
        </div>
      )}

      {/* ── Agent Board ── */}
      <div className="w-full max-w-3xl" data-tour="agent-board">
        <SectionLabel darkMode={darkMode}>{t('home.board', lang)}</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {AGENT_KEYS.map((key, i) => (
            <AgentCard
              key={key}
              agentKey={key}
              displayName={agentNames[key]}
              agentPhoto={agentPhotos?.[key]}
              darkMode={darkMode}
              onUpdateName={onUpdateAgentName}
              onUpdatePhoto={onUpdateAgentPhoto}
              lastSpoke={agentLastSpoke?.[key]}
              onFocus={onSetFocusAgent}
              lang={lang}
              index={i}
              sessionCount={agentDepth[key] || 0}
            />
          ))}
        </div>
      </div>

      {/* ── Session Mode ── */}
      <div className="w-full max-w-3xl" data-tour="session-modes">
        <SectionLabel darkMode={darkMode}>{t('home.sessionMode', lang)}</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          {SESSION_MODE_KEYS.map((key, idx) => {
            // Focus card stays highlighted when debate sub-mode is active
            const selected   = sessionMode === key || (key === 'focus' && sessionMode === 'debate');
            const tint       = MODE_TINTS[key];
            const Icon       = SESSION_MODE_ICONS[key];
            const info       = MODE_INFO[lang === 'fr' ? 'fr' : 'en']?.[key] || MODE_INFO.fr[key];
            const alignRight = idx % 3 === 2; // last column → right-align tooltip
            return (
              <div
                key={key}
                className="group"
                style={{ position: 'relative' }}
              >
                {/* ── Card button ── */}
                <button
                  onClick={() => onSetMode(key)}
                  data-tour={key === 'roleplay' ? 'roleplay-mode' : undefined}
                  className="flex flex-col justify-between p-4 rounded-2xl text-left w-full"
                  style={{
                    minHeight: 130,
                    background: selected
                      ? `rgba(${tint}, 0.05)`
                      : darkMode ? 'rgba(255,255,255,0.04)' : '#ECEAE4',
                    border: selected
                      ? `1px solid rgba(${tint}, 0.4)`
                      : darkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
                    transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.transform = 'scale(1.015)';
                      e.currentTarget.style.background = darkMode
                        ? `rgba(${tint}, 0.07)`
                        : `rgba(${tint}, 0.05)`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.background = selected
                      ? `rgba(${tint}, 0.05)`
                      : darkMode ? 'rgba(255,255,255,0.04)' : '#ECEAE4';
                  }}
                >
                  {/* Icon — top-left */}
                  <div style={{
                    width: 44, height: 44,
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: selected ? `rgba(${tint}, 0.15)` : `rgba(${tint}, 0.12)`,
                    flexShrink: 0,
                  }}>
                    {Icon && (
                      <Icon size={20} strokeWidth={1.5} style={{ color: `rgb(${tint})` }} />
                    )}
                  </div>
                  {/* Text — bottom */}
                  <div className="flex flex-col">
                    <span style={{
                      fontSize: 13, fontWeight: 600, lineHeight: 1.2,
                      color: selected ? `rgb(${tint})` : darkMode ? 'rgba(241,245,249,0.85)' : '#1A1A1A',
                    }}>
                      {t(`mode.${key}.label`, lang)}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 400, marginTop: 3, lineHeight: 1.3,
                      color: darkMode ? 'rgba(148,163,184,0.45)' : '#A09B96',
                    }}>
                      {t(`mode.${key}.desc`, lang)}
                    </span>
                  </div>
                </button>

                {/* ── Info "?" button — top-right, appears on card hover ── */}
                <button
                  data-tooltip={key}
                  onClick={(e) => { e.stopPropagation(); setOpenTooltip(openTooltip === key ? null : key); }}
                  className="opacity-0 group-hover:opacity-100"
                  style={{
                    position:     'absolute',
                    top:          8,
                    right:        8,
                    zIndex:       10,
                    width:        18,
                    height:       18,
                    borderRadius: '50%',
                    background:   'rgba(255,255,255,0.06)',
                    border:       'none',
                    cursor:       'pointer',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    fontSize:     10,
                    fontWeight:   700,
                    color:        darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.6)',
                    transition:   'opacity 0.15s ease',
                    lineHeight:   1,
                  }}
                >
                  ?
                </button>

                {/* ── Tooltip ── */}
                {openTooltip === key && info && (
                  <ModeTooltip info={info} darkMode={darkMode} alignRight={alignRight} />
                )}
              </div>
            );
          })}
        </div>

        {/* Focus sub-panel — shown when focus OR debate is active */}
        {(sessionMode === 'focus' || sessionMode === 'debate') && (
          <div className="mt-3 p-4 rounded-xl"
            style={{
              background: darkMode ? 'rgba(10,14,24,0.5)' : '#E8E6E0',
              border: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
            }}>

            {/* Sub-mode toggle: Standard | Débat */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => onSetMode('focus')}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: sessionMode === 'focus' ? 'rgba(239,68,68,0.12)' : 'transparent',
                  border: sessionMode === 'focus' ? '1px solid rgba(239,68,68,0.35)' : darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.09)',
                  color: sessionMode === 'focus' ? 'rgb(239,68,68)' : darkMode ? 'rgba(148,163,184,0.5)' : '#A09B96',
                }}
              >
                {lang === 'fr' ? 'Mode standard' : 'Standard'}
              </button>
              <button
                onClick={() => onSetMode('debate')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: sessionMode === 'debate' ? 'rgba(239,68,68,0.12)' : 'transparent',
                  border: sessionMode === 'debate' ? '1px solid rgba(239,68,68,0.35)' : darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.09)',
                  color: sessionMode === 'debate' ? 'rgb(239,68,68)' : darkMode ? 'rgba(148,163,184,0.5)' : '#A09B96',
                }}
              >
                <FlameKindling size={11} />
                {lang === 'fr' ? 'Mode Débat' : 'Debate Mode'}
              </button>
            </div>

            {/* Standard → agent picker */}
            {sessionMode === 'focus' && (
              <>
                <p className="font-display text-[10px] uppercase tracking-[0.18em] mb-3 font-medium"
                  style={{ color: darkMode ? 'rgba(148,163,184,0.4)' : '#A09B96' }}>
                  {t('home.selectAgent', lang)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {AGENT_KEYS.map((key) => {
                    const config = AGENT_CONFIG[key];
                    const sel    = focusAgent === key;
                    return (
                      <button key={key} onClick={() => onSetFocusAgent(key)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: sel ? `rgba(${config.glowRgb}, 0.2)` : `rgba(${config.glowRgb}, 0.07)`,
                          color: `rgb(${config.glowRgb})`,
                          border: `1px solid rgba(${config.glowRgb}, ${sel ? 0.6 : 0.2})`,
                          boxShadow: sel ? `0 0 10px rgba(${config.glowRgb}, 0.15)` : 'none',
                        }}>
                        {agentNames[key]}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Debate → description */}
            {sessionMode === 'debate' && (
              <p className="text-xs leading-relaxed"
                style={{ color: darkMode ? 'rgba(148,163,184,0.45)' : '#A09B96' }}>
                {lang === 'fr'
                  ? 'Deux conseillers s\'affrontent sur ta question — l\'un PRO, l\'un CONTRA. Positions tranchées, zéro compromis.'
                  : 'Two advisors clash on your question — one PRO, one CONTRA. Sharp positions, zero compromise.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Start Button ── */}
      {(() => {
        const tint = MODE_TINTS[sessionMode] || '212,175,55';
        return (
          <div className="w-full max-w-3xl flex justify-center">
            <button
              onClick={onStart}
              disabled={sessionMode === 'focus' && !focusAgent}
              className="font-semibold uppercase disabled:opacity-30"
              style={{
                height: 48,
                paddingLeft: 36,
                paddingRight: 36,
                maxWidth: 320,
                width: '100%',
                borderRadius: 100,
                background: 'transparent',
                color: darkMode ? `rgba(${tint}, 0.9)` : `rgb(${tint})`,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.08em',
                border: `1px solid rgba(${tint}, 0.45)`,
                transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `rgba(${tint}, 0.10)`;
                e.currentTarget.style.borderColor = `rgba(${tint}, 0.7)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = `rgba(${tint}, 0.45)`;
              }}
            >
              {sessionMode === 'debate'
                ? t('btn.debate', lang)
                : sessionMode === 'focus' && focusAgent
                  ? t('btn.focusOn', lang, { agent: agentNames[focusAgent]?.toUpperCase() })
                  : t(`btn.${sessionMode}`, lang)}
            </button>
          </div>
        );
      })()}

      {/* ── Google Calendar — This Week ── */}
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel darkMode={darkMode}>{t('home.thisWeek', lang)}</SectionLabel>
          <div className="flex items-center gap-2">
            {/* Gmail connect */}
            {hasGmailClientId && (
              gmailConnected ? (
                <button onClick={onDisconnectGmail}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors"
                  style={{ color: 'rgba(34,197,94,0.55)', border: '1px solid rgba(34,197,94,0.15)', background: 'rgba(34,197,94,0.05)' }}>
                  <span style={{ fontSize: '9px' }}>●</span>
                  Gmail
                </button>
              ) : (
                <button onClick={onConnectGmail}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                  style={{
                    background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                    color: darkMode ? 'rgba(148,163,184,0.7)' : '#6B6560',
                  }}>
                  {lang === 'fr' ? 'Connecter Gmail' : 'Connect Gmail'}
                </button>
              )
            )}
            {/* Calendar connect */}
            {hasCalendarClientId && (
              calendarConnected ? (
                <button onClick={onDisconnectCalendar}
                  className="text-xs px-2 py-1 rounded-full transition-colors"
                  style={{ color: 'rgba(148,163,184,0.4)' }}>
                  {t('home.cal.connected', lang)}
                </button>
              ) : (
                <button onClick={onConnectCalendar}
                  className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                  style={{
                    background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                    color: darkMode ? 'rgba(148,163,184,0.7)' : '#6B6560',
                  }}>
                  {t('home.cal.connect', lang)}
                </button>
              )
            )}
          </div>
        </div>

        {thisWeek.length > 0 ? (
          <div className="rounded-2xl overflow-hidden"
            style={{ border: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
            {thisWeek.map((evt, i) => {
              const startRaw = evt.start?.dateTime || evt.start?.date;
              const date     = new Date(startRaw);
              const timeStr  = evt.start?.dateTime
                ? date.toLocaleTimeString(calLocale, { hour: '2-digit', minute: '2-digit' })
                : t('home.cal.allDay', lang);
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3"
                  style={{
                    background: darkMode ? 'rgba(10,14,24,0.5)' : '#E8E6E0',
                    borderBottom: i < thisWeek.length - 1
                      ? darkMode ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.05)'
                      : 'none',
                  }}>
                  <div className="text-xs text-center min-w-[48px]"
                    style={{ color: darkMode ? 'rgba(148,163,184,0.4)' : '#A09B96' }}>
                    <div className="font-semibold">{date.toLocaleDateString(calLocale, { weekday: 'short' })}</div>
                    <div>{timeStr}</div>
                  </div>
                  <span className="text-sm flex-1 font-light"
                    style={{ color: darkMode ? '#e2e8f0' : '#1e293b' }}>
                    {evt.summary || t('home.cal.allDay', lang)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl px-4 py-5 text-center"
            style={{
              background: darkMode ? 'rgba(10,14,24,0.4)' : '#E8E6E0',
              border: darkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.06)',
            }}>
            <p className="text-xs" style={{ color: darkMode ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.45)' }}>
              {calendarConnected
                ? t('home.cal.noEvents', lang)
                : hasCalendarClientId
                ? t('home.cal.connectHint', lang)
                : t('home.cal.envHint', lang)}
            </p>
          </div>
        )}
      </div>

      {/* ── Win Feed ── */}
      {wins.length > 0 && (
        <div className="w-full max-w-3xl" data-tour="win-feed">
          <SectionLabel darkMode={darkMode}><Trophy size={10} className="inline mr-1.5" style={{ verticalAlign: 'middle' }} />{lang === 'fr' ? 'Victoires récentes' : 'Recent Wins'}</SectionLabel>
          <div className="space-y-2">
            {wins.slice(0, 5).map((win) => {
              const agentRgb = AGENT_CONFIG[win.agent]?.glowRgb || '212,175,55';
              return (
                <div key={win.id} className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{
                    background: darkMode ? 'rgba(10,14,24,0.5)' : '#E8E6E0',
                    border: `1px solid rgba(${agentRgb}, 0.15)`,
                  }}>
                  <span className="text-sm flex-shrink-0 mt-0.5" style={{ color: `rgb(${agentRgb})` }}>✦</span>
                  <p className="text-xs leading-relaxed flex-1"
                    style={{ color: darkMode ? 'rgba(226,232,240,0.7)' : '#6B6560' }}>
                    {win.text.length > 100 ? win.text.slice(0, 100) + '…' : win.text}
                  </p>
                  <span className="text-[10px] flex-shrink-0 tabular-nums"
                    style={{ color: 'rgba(148,163,184,0.3)' }}>
                    {new Date(win.date).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Focus Timer ── */}
      <div className="w-full max-w-3xl" data-tour="focus-timer">
        <SectionLabel darkMode={darkMode}><Timer size={10} className="inline mr-1.5" style={{ verticalAlign: 'middle' }} />{lang === 'fr' ? 'Timer de Focus' : 'Focus Timer'}</SectionLabel>
        <FocusTimer darkMode={darkMode} lang={lang} onStartSession={onStart} retainers={dashboard?.retainers || []} />
      </div>

      {/* ── Daily Quote ── */}
      {dailyQuote && (
        <div className="w-full max-w-3xl pb-4">
          <div className="px-5 py-4 rounded-2xl"
            style={{
              background: darkMode ? 'rgba(10,14,24,0.4)' : '#E8E6E0',
              boxShadow: `inset 3px 0 0 rgba(${AGENT_CONFIG[dailyQuote.agent]?.glowRgb || '212,175,55'}, 0.5), inset 0 0 0 1px rgba(${AGENT_CONFIG[dailyQuote.agent]?.glowRgb || '212,175,55'}, 0.1)`,
            }}>
            <p className="font-display text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
              style={{ color: darkMode ? 'rgba(148,163,184,0.35)' : '#A09B96' }}>
              {t('home.quote.board', lang)} · {dailyQuote.agent ? agentNames?.[dailyQuote.agent] || dailyQuote.agent : t('home.quote.board', lang)}
            </p>
            <p className="text-sm italic leading-relaxed font-light"
              style={{ color: darkMode ? 'rgba(226,232,240,0.8)' : '#6B6560' }}>
              "{dailyQuote.quote}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

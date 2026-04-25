import { Sun, Moon, Zap, Brain, Home, Square, BookOpen, Compass, Map, BarChart2, Users, Check, AlertCircle, Bookmark, Mail, Volume2, VolumeX, Wrench, Library, Trophy, User } from 'lucide-react';
import { t } from '../i18n.js';

export default function Header({
  darkMode, onToggleDark,
  deepMode, onToggleDeep,
  thinkingMode, onToggleThinking,
  voiceMode = false, onToggleVoice,
  lang, onToggleLang,
  saveStatus, screen, onGoHome,
  onGoJournal, onGoDecisions, onGoDashboard, onGoProspects, onGoLibrary, onGoSituations, onGoVictories, onGoProfile, onGoWorkflow,
  onGoEmail, urgentEmailCount = 0,
  sessionEnded, onEndSession, isLoading,
  improvementCount, decisionsCount,
  onShowTour,
}) {
  const iconBtn = (active) => ({
    padding: '7px',
    borderRadius: '10px',
    transition: 'all 0.18s ease',
    background:  active ? 'rgba(99,102,241,0.18)' : 'transparent',
    color:       active ? 'rgb(165,180,252)'       : 'rgba(148,163,184,0.7)',
    boxShadow:   active ? '0 0 0 1px rgba(99,102,241,0.32)' : 'none',
    position: 'relative',
  });

  return (
    <header
      className="flex items-center justify-between px-5 py-2.5"
      style={{
        background: darkMode
          ? 'rgba(8, 12, 20, 0.85)'
          : '#F5F4F0',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: darkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {/* Logo — purely decorative, non-interactive (no click, no edit, no select) */}
      <div
        className="flex items-center gap-2.5 select-none"
        style={{ userSelect: 'none', WebkitUserSelect: 'none', cursor: 'default' }}
        aria-label="The Headquarters"
      >
        <div
          className="flex gap-[3px]"
          style={{ pointerEvents: 'none' }}
        >
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: darkMode ? '#f1f5f9' : '#0f172a' }} />
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: darkMode ? 'rgba(241,245,249,0.35)' : 'rgba(15,23,42,0.35)' }} />
        </div>
        <span
          className="font-display font-semibold text-sm tracking-widest uppercase"
          style={{
            color: darkMode ? '#e2e8f0' : '#0f172a',
            letterSpacing: '0.14em',
            pointerEvents: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          contentEditable={false}
          suppressContentEditableWarning
        >
          The Headquarters
        </span>
      </div>

      {/* Save status */}
      <div className="flex-1 flex justify-center pointer-events-none">
        {saveStatus === 'saving' && (
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.4)' }}>
            {t('header.save.saving', lang)}
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald-500/60">
            <Check size={9} strokeWidth={3} /> {t('header.save.saved', lang)}
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-red-500">
            <AlertCircle size={9} /> {t('header.save.failed', lang)}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5">

        {/* Thinking Mode */}
        <button
          data-tour="think-mode"
          onClick={onToggleThinking}
          title={t(thinkingMode ? 'header.think.on' : 'header.think.off', lang)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{
            background: thinkingMode ? 'rgba(6,182,212,0.15)' : 'rgba(148,163,184,0.07)',
            border: `1px solid ${thinkingMode ? 'rgba(6,182,212,0.4)' : 'rgba(148,163,184,0.1)'}`,
            color: thinkingMode ? '#22d3ee' : 'rgba(148,163,184,0.7)',
            boxShadow: thinkingMode ? '0 0 12px rgba(6,182,212,0.15)' : 'none',
          }}
        >
          <Brain size={11} />
          <span>{t('header.think', lang)}</span>
        </button>

        {/* Deep Mode */}
        <button
          data-tour="deep-mode"
          onClick={onToggleDeep}
          title={t(deepMode ? 'header.deepMode.on' : 'header.deepMode.off', lang)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{
            background: deepMode ? 'rgba(139,92,246,0.15)' : 'rgba(148,163,184,0.07)',
            border: `1px solid ${deepMode ? 'rgba(139,92,246,0.4)' : 'rgba(148,163,184,0.1)'}`,
            color: deepMode ? '#a78bfa' : 'rgba(148,163,184,0.7)',
            boxShadow: deepMode ? '0 0 12px rgba(139,92,246,0.15)' : 'none',
          }}
        >
          <Zap size={11} />
          <span>{t('header.deepMode', lang)}</span>
        </button>

        {/* Voice Mode (TTS on agent replies) */}
        {onToggleVoice && (
          <button
            onClick={onToggleVoice}
            title={voiceMode
              ? (lang === 'fr' ? 'Mode vocal ON — les agents parlent' : 'Voice mode ON — agents speak')
              : (lang === 'fr' ? 'Mode vocal OFF' : 'Voice mode OFF')}
            aria-label="Toggle voice mode"
            aria-pressed={voiceMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: voiceMode ? 'rgba(99,102,241,0.15)' : 'rgba(148,163,184,0.07)',
              border: `1px solid ${voiceMode ? 'rgba(99,102,241,0.4)' : 'rgba(148,163,184,0.1)'}`,
              color: voiceMode ? '#a5b4fc' : 'rgba(148,163,184,0.7)',
              boxShadow: voiceMode ? '0 0 12px rgba(99,102,241,0.15)' : 'none',
            }}
          >
            {voiceMode ? <Volume2 size={11} /> : <VolumeX size={11} />}
            <span>{lang === 'fr' ? 'Voix' : 'Voice'}</span>
          </button>
        )}

        {/* End session */}
        {screen === 'chat' && !sessionEnded && (
          <button
            onClick={onEndSession}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-40"
            style={{
              background: 'rgba(148,163,184,0.07)',
              border: '1px solid rgba(148,163,184,0.1)',
              color: 'rgba(148,163,184,0.6)',
            }}
          >
            <Square size={10} />
            <span>{t('header.endSession', lang)}</span>
          </button>
        )}

        {/* Icon buttons */}
        {[
          ...(onGoEmail ? [{
            onClick: onGoEmail,
            title: lang === 'fr' ? 'Emails' : 'Email',
            icon: <Mail size={15} />,
            active: false,
            badge: urgentEmailCount > 0 ? (urgentEmailCount > 9 ? '9+' : urgentEmailCount) : null,
            badgeColor: '#ef4444',
          }] : []),
          { onClick: onGoDashboard,  title: t('header.dashboard', lang), icon: <BarChart2 size={15} />, active: screen === 'dashboard' },
          { onClick: onGoProspects,  title: 'Prospects',                  icon: <Users size={15} />,    active: screen === 'prospects' },
          { onClick: onGoDecisions,  title: t('header.decisions', lang), icon: <Compass size={15} />, active: screen === 'decisions', badge: decisionsCount > 0 ? (decisionsCount > 9 ? '9+' : decisionsCount) : null, badgeColor: '#3b82f6' },
          { onClick: onGoJournal,    title: t('header.journal', lang),   icon: <BookOpen size={15} />, active: screen === 'journal',   badge: improvementCount > 0 ? (improvementCount > 9 ? '9+' : improvementCount) : null, badgeColor: '#10b981' },
          { onClick: onGoLibrary,    title: lang === 'fr' ? 'Bibliothèque' : 'Library', icon: <Bookmark size={15} />, active: screen === 'library' },
          ...(onGoSituations ? [{ onClick: onGoSituations, title: lang === 'fr' ? 'Situations' : 'Situations', icon: <Library size={15} />, active: screen === 'situations' }] : []),
          ...(onGoVictories ? [{ onClick: onGoVictories, title: lang === 'fr' ? 'Victoires' : 'Victories', icon: <Trophy size={15} />, active: screen === 'victories' }] : []),
          ...(onGoProfile   ? [{ onClick: onGoProfile,   title: lang === 'fr' ? 'Profil' : 'Profile',     icon: <User size={15} />,   active: screen === 'profile' }] : []),
          ...(onGoWorkflow ? [{ onClick: onGoWorkflow, title: lang === 'fr' ? 'Workflow Builder' : 'Workflow Builder', icon: <Wrench size={15} />, active: screen === 'workflow' }] : []),
        ].map(({ onClick, title, icon, active, badge, badgeColor }) => (
          <button
            key={title}
            onClick={onClick}
            title={title}
            aria-label={title}
            aria-current={active ? 'page' : undefined}
            className="relative transition-all"
            style={iconBtn(active)}
            onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#f1f5f9'; } }}
            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(148,163,184,0.7)'; } }}
          >
            {icon}
            {badge && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold leading-none"
                style={{ background: badgeColor }}>
                {badge}
              </span>
            )}
          </button>
        ))}

        {/* Home (chat screen) */}
        {screen === 'chat' && (
          <button onClick={onGoHome} title={t('header.home', lang)} className="transition-all" style={iconBtn(false)}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#f1f5f9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(148,163,184,0.7)'; }}>
            <Home size={15} />
          </button>
        )}

        {/* Tour button */}
        {onShowTour && (
          <button
            onClick={onShowTour}
            title={lang === 'fr' ? 'Visite guidée' : 'Guided tour'}
            className="transition-all"
            style={iconBtn(false)}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(148,163,184,0.7)'; }}
          >
            <Map size={15} />
          </button>
        )}

        {/* Language toggle */}
        <button
          onClick={onToggleLang}
          title={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all"
          style={{
            background: 'rgba(148,163,184,0.07)',
            border: '1px solid rgba(148,163,184,0.12)',
            color: 'rgba(148,163,184,0.8)',
          }}
        >
          <span className="text-sm leading-none">{lang === 'fr' ? '🇫🇷' : '🇺🇸'}</span>
          <span className="tracking-wider text-[11px]">{lang === 'fr' ? 'FR' : 'EN'}</span>
        </button>

        {/* Dark/Light toggle */}
        <button
          onClick={onToggleDark}
          title={t(darkMode ? 'header.lightMode' : 'header.darkMode', lang)}
          className="transition-all"
          style={iconBtn(false)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fbbf24'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(148,163,184,0.7)'; }}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}

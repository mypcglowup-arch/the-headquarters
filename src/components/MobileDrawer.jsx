import { useEffect, useRef, useState } from 'react';
import {
  X, ChevronRight, BarChart2, Users, Compass, BookOpen, Bookmark, Library,
  Trophy, User, Wrench, Mail, Home, Map, Brain, Volume2, VolumeX, Sun, Moon,
  RotateCcw,
} from 'lucide-react';
import { t } from '../i18n.js';

/**
 * Mobile slide-in drawer — replaces the dropdown that landed under the header.
 *
 * Behavior :
 *   - Slides in from the right (transform: translateX). 80vw width, 300ms ease.
 *   - Backdrop : semi-transparent black, click anywhere on it to close.
 *   - Closes on : X button, backdrop click, ESC, swipe-right (touch).
 *   - Body scroll locked while open.
 *   - Auto-closes any nav action so the user lands cleanly on the destination.
 *
 * Receives the same nav handlers as Header so a single source of truth for
 * navigation. The drawer is rendered as a portal-less fixed overlay — sits
 * outside the header's flex flow so it can take the full viewport.
 */

const APP_VERSION = '1.0.0'; // bumped manually with each release

export default function MobileDrawer({
  open, onClose,
  darkMode, onToggleDark,
  thinkingMode, onToggleThinking,
  voiceMode, onToggleVoice,
  lang, onToggleLang,
  screen,
  onGoHome,
  onGoDashboard, onGoProspects, onGoDecisions, onGoJournal, onGoLibrary,
  onGoSituations, onGoVictories, onGoProfile, onGoWorkflow, onGoEmail,
  urgentEmailCount = 0, improvementCount = 0, decisionsCount = 0,
  onShowTour,
  userProfile,
  sessionStarted,
}) {
  const drawerRef           = useRef(null);
  const [dragX, setDragX]   = useState(0);     // current swipe offset in px (0 = closed-position rest)
  // Drag state lives in a ref, NOT useState — touchstart firing setState
  // mid-tap caused re-renders that interfered with the synthetic click event
  // on iOS/Android, swallowing nav-button clicks. The ref version doesn't
  // re-render and only setDragX is touched, exclusively when an actual swipe
  // is detected.
  const draggingRef         = useRef(false);
  const touchStartXRef      = useRef(0);
  const touchStartYRef      = useRef(0);
  const touchStartTimeRef   = useRef(0);

  // Stable ref to onClose : the parent passes a fresh inline arrow
  // (`() => setMenuOpen(false)`) on every render of Header, so onClose has a
  // new identity each time. Without the ref, every Header re-render would
  // tear down and rebind the keydown listener — wasteful at best, render
  // thrash at worst.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Wrap any nav handler so the drawer auto-closes after the click.
  // Order matters : navigate FIRST, close after. If for any reason onClose
  // unmounts something or interferes mid-handler, the nav has already fired
  // by then. React 18 auto-batches both setStates into one render anyway.
  const wrapClose = (fn) => () => { fn?.(); onCloseRef.current?.(); };

  // ── ESC closes ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Body scroll lock while open ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Reset drag state when the drawer reopens ──────────────────────────────
  useEffect(() => { if (open) { setDragX(0); draggingRef.current = false; } }, [open]);

  // ── Touch handlers : swipe-right to close ────────────────────────────────
  // Movement-threshold pattern : a simple tap (< 10px movement) NEVER enters
  // drag mode → no re-renders mid-touch → click event on nav buttons fires
  // cleanly. Drag mode kicks in only when the user actually swipes.
  const TAP_THRESHOLD = 10; // px — movement below this is treated as a tap

  function onTouchStart(e) {
    touchStartXRef.current    = e.touches[0].clientX;
    touchStartYRef.current    = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    draggingRef.current       = false;
  }
  function onTouchMove(e) {
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    // Enter drag mode only on horizontal movement past the threshold AND
    // when horizontal exceeds vertical (so vertical scroll inside the drawer
    // works normally without triggering swipe-close).
    if (!draggingRef.current && Math.abs(dx) > TAP_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      draggingRef.current = true;
    }
    if (draggingRef.current && dx > 0) setDragX(dx);
  }
  function onTouchEnd() {
    if (!draggingRef.current) return; // tap → let click event fire normally
    draggingRef.current = false;
    const elapsed = Date.now() - touchStartTimeRef.current;
    const drawerW = drawerRef.current?.offsetWidth || 280;
    // Close if : dragged > 30% of drawer width, OR fast flick > 0.5 px/ms over > 60px
    const farEnough  = dragX > drawerW * 0.30;
    const fastEnough = elapsed > 0 && dragX > 60 && (dragX / elapsed) > 0.5;
    if (farEnough || fastEnough) onCloseRef.current?.();
    setDragX(0);
  }

  // ── Resolved labels / nav rows ────────────────────────────────────────────
  const userName  = userProfile?.name?.trim() || (lang === 'fr' ? 'Bienvenue' : 'Welcome');
  const userRole  = userProfile?.role?.trim() || '';

  const navRows = [
    ...(onGoEmail ? [{ key: 'email', onClick: onGoEmail, label: lang === 'fr' ? 'Emails' : 'Email', icon: Mail, badge: urgentEmailCount > 0 ? (urgentEmailCount > 9 ? '9+' : urgentEmailCount) : null }] : []),
    { key: 'dashboard',  onClick: onGoDashboard,  label: t('header.dashboard', lang), icon: BarChart2 },
    { key: 'prospects',  onClick: onGoProspects,  label: lang === 'fr' ? 'Prospects' : 'Prospects', icon: Users },
    { key: 'decisions',  onClick: onGoDecisions,  label: t('header.decisions', lang), icon: Compass, badge: decisionsCount > 0 ? (decisionsCount > 9 ? '9+' : decisionsCount) : null },
    { key: 'journal',    onClick: onGoJournal,    label: t('header.journal', lang),   icon: BookOpen, badge: improvementCount > 0 ? (improvementCount > 9 ? '9+' : improvementCount) : null },
    { key: 'library',    onClick: onGoLibrary,    label: lang === 'fr' ? 'Bibliothèque' : 'Library', icon: Bookmark },
    ...(onGoSituations ? [{ key: 'situations', onClick: onGoSituations, label: lang === 'fr' ? 'Situations' : 'Situations', icon: Library }] : []),
    ...(onGoVictories  ? [{ key: 'victories',  onClick: onGoVictories,  label: lang === 'fr' ? 'Victoires'  : 'Victories',  icon: Trophy   }] : []),
    ...(onGoProfile    ? [{ key: 'profile',    onClick: onGoProfile,    label: lang === 'fr' ? 'Profil'     : 'Profile',    icon: User     }] : []),
    ...(onGoWorkflow   ? [{ key: 'workflow',   onClick: onGoWorkflow,   label: lang === 'fr' ? 'Workflow'   : 'Workflow',   icon: Wrench   }] : []),
    ...(sessionStarted ? [{ key: 'home',        onClick: onGoHome,       label: t('header.home', lang),                       icon: Home     }] : []),
  ];

  // ── Style for the panel — drag offset translates the panel right ─────────
  const panelTransform = open
    ? `translateX(${dragX}px)`
    : 'translateX(100%)';
  // Use dragX > 0 as the "active drag" proxy — setDragX during onTouchMove
  // already triggers a re-render with the new dragX, so this stays in sync
  // without needing a separate dragging state.
  const transitionStyle = dragX > 0
    ? 'none'                                  // direct follow during drag
    : 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';

  // Backdrop opacity : 0.85 base. Subtle dip during swipe-close (down to 0.78
  // so the user feels the drawer "letting go") but always opaque enough that
  // the app underneath stays masked completely.
  const drawerW         = drawerRef.current?.offsetWidth || 280;
  const dragProgress    = Math.min(1, Math.max(0, dragX / drawerW));
  const backdropOpacity = open ? Math.max(0.78, 0.85 - dragProgress * 0.07) : 0;

  // Solid panel color — NO transparency, NO backdrop-filter (those leak the
  // app underneath). Tuned to the existing dark/light palette.
  const PANEL_BG = darkMode ? '#0a0f1c' : '#FBFAF7';

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        style={{
          position:        'fixed',
          inset:           0,
          background:      `rgba(0, 0, 0, ${backdropOpacity})`,
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? 'auto' : 'none',
          transition:      dragX > 0 ? 'none' : 'opacity 300ms ease, background 300ms ease',
          zIndex:          9998,
        }}
      />

      {/* ── Panel ────────────────────────────────────────────────────────── */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'fr' ? 'Menu de navigation' : 'Navigation menu'}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position:        'fixed',
          top:             0,
          right:           0,
          height:          '100dvh',
          width:           '80vw',
          maxWidth:        360,
          background:      PANEL_BG,
          backgroundColor: PANEL_BG, // belt + braces — some browsers respect bg-color over background shorthand
          borderLeft:      darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.08)',
          boxShadow:       open ? '-24px 0 60px -12px rgba(0,0,0,0.7)' : 'none',
          transform:       panelTransform,
          transition:      transitionStyle,
          willChange:      'transform',
          zIndex:          9999,
          display:         'flex',
          flexDirection:   'column',
          paddingTop:      'env(safe-area-inset-top, 0px)',
          paddingBottom:   'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* ── Top : logo + user identity + close ─────────────────────────── */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex gap-[3px]">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: darkMode ? '#f1f5f9' : '#0f172a' }} />
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: darkMode ? 'rgba(241,245,249,0.35)' : 'rgba(15,23,42,0.35)' }} />
              </div>
              <span
                className="font-display font-semibold text-[12px] tracking-widest uppercase"
                style={{ color: darkMode ? '#e2e8f0' : '#0f172a', letterSpacing: '0.14em' }}
              >
                The Headquarters
              </span>
            </div>
            <div className="mt-3">
              <div
                className="font-display font-semibold text-[17px] leading-tight truncate"
                style={{ color: darkMode ? '#f8fafc' : '#0f172a' }}
              >
                {userName}
              </div>
              {userRole && (
                <div
                  className="mt-0.5 text-[12px] truncate"
                  style={{ color: darkMode ? 'rgba(148,163,184,0.75)' : 'rgba(71,85,105,0.85)' }}
                >
                  {userRole}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={lang === 'fr' ? 'Fermer le menu' : 'Close menu'}
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
              color:      darkMode ? 'rgba(226,232,240,0.85)' : 'rgba(15,23,42,0.7)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Separator ──────────────────────────────────────────────────── */}
        <div style={{ height: 1, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />

        {/* ── Nav rows ───────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navRows.map(({ key, onClick, label, icon: Icon, badge }) => {
            // Defensive : skip rows whose handler or icon never resolved.
            // Prevents "Element type is invalid: got undefined" if a parent
            // forgot to thread a prop through.
            if (!Icon || typeof onClick !== 'function') return null;
            const active = screen === key;
            // No onMouseEnter/Leave hover styles — they trigger the iOS
            // "first tap = hover, second tap = click" behaviour on Safari
            // mobile, which made nav items require two taps to navigate.
            // Active state already provides clear visual feedback.
            return (
              <button
                key={key}
                type="button"
                onClick={wrapClose(onClick)}
                className="w-full flex items-center gap-3 px-5 text-left transition-colors active:bg-white/[0.06]"
                style={{
                  height:     52,
                  background: active ? 'rgba(99,102,241,0.14)' : 'transparent',
                  color:      active
                    ? (darkMode ? 'rgb(199,210,254)' : 'rgb(67,56,202)')
                    : (darkMode ? 'rgba(226,232,240,0.92)' : 'rgba(15,23,42,0.85)'),
                  borderLeft: active ? '3px solid rgb(99,102,241)' : '3px solid transparent',
                  paddingLeft: active ? 17 : 20,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon size={17} strokeWidth={active ? 2.4 : 2} style={{ color: active ? 'rgb(99,102,241)' : (darkMode ? 'rgba(148,163,184,0.85)' : 'rgba(71,85,105,0.85)') }} />
                <span className="flex-1 text-[14.5px] font-medium truncate">{label}</span>
                {badge != null && (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-white text-[10.5px] font-bold"
                    style={{ background: active ? 'rgb(99,102,241)' : 'rgba(99,102,241,0.85)' }}
                  >
                    {badge}
                  </span>
                )}
                <ChevronRight size={15} style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(71,85,105,0.45)', opacity: active ? 1 : 0.6 }} />
              </button>
            );
          })}
        </nav>

        {/* ── Toggles row (compact, tucked above the bottom block) ───────── */}
        <div className="px-4 py-3 flex items-center gap-1.5"
             style={{ borderTop: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)' }}>
          {[
            { onClick: onToggleThinking, active: thinkingMode, Icon: Brain,                   label: t('header.think', lang),                color: '#22d3ee' },
            { onClick: onToggleVoice,    active: voiceMode,    Icon: voiceMode ? Volume2 : VolumeX, label: lang === 'fr' ? 'Voix' : 'Voice', color: '#a5b4fc', skip: !onToggleVoice },
            { onClick: onToggleDark,     active: false,        Icon: darkMode ? Sun : Moon,        label: darkMode ? (lang === 'fr' ? 'Clair' : 'Light') : (lang === 'fr' ? 'Sombre' : 'Dark'), color: '#fbbf24' },
            { onClick: onToggleLang,     active: false,        Icon: null,                          label: lang === 'fr' ? '🇫🇷 FR' : '🇺🇸 EN',                              color: null },
            ...(onShowTour ? [{ onClick: onShowTour, active: false, Icon: Map, label: lang === 'fr' ? 'Tour' : 'Tour', color: '#d4af37' }] : []),
          ].filter((x) => !x.skip && typeof x.onClick === 'function').map(({ onClick, active, Icon, label, color }) => (
            <button
              key={label}
              onClick={wrapClose(onClick)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium"
              style={{
                background: active ? `rgba(${color === '#22d3ee' ? '6,182,212' : '99,102,241'},0.15)` : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)'),
                border:     `1px solid ${active && color ? color + '66' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)')}`,
                color:      active && color ? color : (darkMode ? 'rgba(226,232,240,0.85)' : 'rgba(15,23,42,0.75)'),
              }}
            >
              {Icon ? <Icon size={11} /> : null}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* ── Bottom : redo onboarding + version ─────────────────────────── */}
        <div className="px-5 py-4"
             style={{ borderTop: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)' }}>
          <button
            onClick={() => { onClose(); window.location.href = '/?onboarding=true'; }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-semibold"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
              color:      darkMode ? 'rgba(226,232,240,0.92)' : 'rgba(15,23,42,0.85)',
              border:     darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.08)',
            }}
          >
            <RotateCcw size={13} />
            {lang === 'fr' ? "Refaire l'onboarding" : 'Redo onboarding'}
          </button>
          <div
            className="mt-3 text-center text-[11px]"
            style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(71,85,105,0.55)' }}
          >
            v{APP_VERSION}
          </div>
        </div>
      </aside>
    </>
  );
}

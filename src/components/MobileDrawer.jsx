import { useEffect, useRef, useState } from 'react';
import {
  X, ChevronRight, BarChart2, Users, Compass, BookOpen, Bookmark, Library,
  Trophy, User, Wrench, Mail, Home, Brain, Volume2, VolumeX, Sun, Moon,
  RotateCcw,
} from 'lucide-react';
// NOTE — DO NOT re-import lucide-react's `Map` icon here without aliasing it
// (e.g. `Map as MapIcon`). Importing it as `Map` shadows the global ES Map
// class and breaks `new Map()` below ; symptom is a black-screen runtime
// crash because every render tries to instantiate the icon as a Map.
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

  // ── Bulletproof tap handler ─────────────────────────────────────────────
  // Each nav button binds THREE event handlers : onPointerUp, onTouchEnd,
  // onClick. Whichever the browser fires first wins ; the others are
  // de-duplicated by a per-key timestamp ref so the action fires exactly
  // once per tap regardless of device or browser.
  //
  // Why all three :
  //   - onPointerUp : modern unified event, fires reliably on touch/mouse/pen.
  //   - onTouchEnd  : older touch fallback for browsers where pointer events
  //                   are flaky (some Android webviews, in-app browsers).
  //   - onClick     : universal final fallback ; always fires on desktop.
  //
  // Dedup window 300ms covers the natural touchend → pointerup → click
  // sequence (~50ms apart) without blocking legitimate rapid taps on
  // DIFFERENT buttons (each key has its own slot in the Map).
  const lastFireRef = useRef(new Map());
  const DEDUP_WINDOW_MS = 300;

  function fireOnce(key, fn) {
    return () => {
      const now  = Date.now();
      const last = lastFireRef.current.get(key) || 0;
      if (now - last < DEDUP_WINDOW_MS) return;
      lastFireRef.current.set(key, now);
      // Navigate FIRST, close after. If onClose causes anything to unmount
      // mid-handler, nav has already fired. React 18 batches the two
      // setStates into a single render anyway.
      fn?.();
      onCloseRef.current?.();
    };
  }

  // Backwards-compat alias kept so we don't have to rewrite every caller.
  const wrapClose = (fn) => fireOnce('__legacy__', fn);

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

  // Swipe-to-close removed : on certain Android browsers the touch handlers
  // on <aside> were swallowing nav button clicks. Closure paths still work :
  //   - X button (top-right of drawer)
  //   - Backdrop click
  //   - ESC key
  // Re-add later as a dedicated edge-handle if needed.

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

  // Backdrop opacity : 0.92 fixed when open — masks the app behind so there
  // is zero visual ambiguity between the drawer and the page underneath.
  // Swipe-to-close removed so no drag-progress fade needed.
  const backdropOpacity = open ? 0.92 : 0;

  // Solid panel color — NO transparency, NO backdrop-filter (those leak the
  // app underneath). Tuned to the existing dark/light palette.
  const PANEL_BG = darkMode ? '#0a0f1c' : '#FBFAF7';

  return (
    <>
      {/* ── Backdrop — opaque enough that the app underneath disappears ──── */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        style={{
          position:        'fixed',
          inset:           0,
          backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? 'auto' : 'none',
          transition:      dragX > 0 ? 'none' : 'opacity 300ms ease, background-color 300ms ease',
          zIndex:          9998,
        }}
      />

      {/* ── Panel — solid opaque, isolated stacking context, no touch handlers */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'fr' ? 'Menu de navigation' : 'Navigation menu'}
        style={{
          position:        'fixed',
          top:             0,
          right:           0,
          height:          '100dvh',
          width:           '80vw',
          maxWidth:        360,
          backgroundColor: PANEL_BG,
          // isolation: 'isolate' creates a new stacking context — the panel
          // becomes fully opaque against anything underneath regardless of
          // ancestor blend modes, filters, or backdrop effects.
          isolation:       'isolate',
          opacity:         1,
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
        {/* Solid base layer — bulletproof against any content layer that */}
        {/* might accidentally inherit a transparent background.            */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            backgroundColor: PANEL_BG,
            zIndex: -1,
          }}
        />
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
            type="button"
            onPointerUp={fireOnce('close', () => onCloseRef.current?.())}
            onTouchEnd={fireOnce('close', () => onCloseRef.current?.())}
            onClick={fireOnce('close', () => onCloseRef.current?.())}
            aria-label={lang === 'fr' ? 'Fermer le menu' : 'Close menu'}
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
              color:      darkMode ? 'rgba(226,232,240,0.85)' : 'rgba(15,23,42,0.7)',
              touchAction: 'manipulation',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
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
            // Per-button bulletproof handler : same fireOnce closure shared
            // across all three event props so dedup works across them all.
            const handleTap = fireOnce(`nav:${key}`, onClick);
            return (
              <button
                key={key}
                type="button"
                onPointerUp={handleTap}
                onTouchEnd={handleTap}
                onClick={handleTap}
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
                  touchAction: 'manipulation',
                  cursor: 'pointer',
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
            // Tour pill — HIDDEN until the tour is polished. Re-enable by
            // restoring the spread when ready :
            //   ...(onShowTour ? [{ onClick: onShowTour, ..., label: 'Tour', ... }] : []),
            ...([]),
          ].filter((x) => !x.skip && typeof x.onClick === 'function').map(({ onClick, active, Icon, label, color }) => {
            const handleTap = fireOnce(`toggle:${label}`, onClick);
            return (
            <button
              key={label}
              type="button"
              onPointerUp={handleTap}
              onTouchEnd={handleTap}
              onClick={handleTap}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium"
              style={{
                background: active ? `rgba(${color === '#22d3ee' ? '6,182,212' : '99,102,241'},0.15)` : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)'),
                border:     `1px solid ${active && color ? color + '66' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)')}`,
                color:      active && color ? color : (darkMode ? 'rgba(226,232,240,0.85)' : 'rgba(15,23,42,0.75)'),
                touchAction: 'manipulation',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {Icon ? <Icon size={11} /> : null}
              <span>{label}</span>
            </button>
            );
          })}
        </div>

        {/* ── Bottom : redo onboarding + version ─────────────────────────── */}
        <div className="px-5 py-4"
             style={{ borderTop: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)' }}>
          <button
            type="button"
            onPointerUp={fireOnce('redo', () => { onCloseRef.current?.(); window.location.href = '/?onboarding=true'; })}
            onTouchEnd={fireOnce('redo', () => { onCloseRef.current?.(); window.location.href = '/?onboarding=true'; })}
            onClick={fireOnce('redo', () => { onCloseRef.current?.(); window.location.href = '/?onboarding=true'; })}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-semibold"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
              color:      darkMode ? 'rgba(226,232,240,0.92)' : 'rgba(15,23,42,0.85)',
              border:     darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.08)',
              touchAction: 'manipulation',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
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

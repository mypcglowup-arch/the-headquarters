import { useRef } from 'react';
import { Home as HomeIcon, MessageSquare, BarChart2, Menu } from 'lucide-react';

/**
 * Mobile bottom tab bar — fixed at the bottom of the viewport on phones.
 * Replaces the floating chat-input bar + scattered nav buttons with a single
 * thumb-reachable strip. Hidden on tablet/desktop (handled by `md:hidden`
 * class on the wrapping element in App.jsx).
 *
 * 4 tabs : Home · Chat · Dashboard · More (opens drawer)
 *
 * Each tab uses the same triple-bind pattern as MobileDrawer
 * (onPointerUp + onTouchEnd + onClick with 300ms key-scoped dedup) so taps
 * fire exactly once on every mobile browser, no swallowed clicks.
 */

const ACTIVE_COLOR   = '#d4af37'; // gold
const INACTIVE_COLOR = '#6b7280'; // gray-500

export default function MobileTabBar({
  activeScreen,         // current `screen` value from App.jsx
  onGoHome,             // () => goHome()
  onStartChat,          // () => startSession()
  onGoDashboard,        // () => setScreen('dashboard')
  onOpenDrawer,         // () => setMenuOpen(true)
  sessionStarted = false,
}) {
  // ── Bulletproof tap dedup ───────────────────────────────────────────────
  // Same pattern as MobileDrawer : per-key timestamp Map, 300ms window.
  // Triple-bind onPointerUp + onTouchEnd + onClick on each tab.
  // NOTE — DO NOT import lucide-react's `Map` icon here ; that would shadow
  // the global Map class and break `new Map()` below.
  const lastFireRef = useRef(new Map());
  const DEDUP_WINDOW_MS = 300;

  function fireOnce(key, fn) {
    return () => {
      const now  = Date.now();
      const last = lastFireRef.current.get(key) || 0;
      if (now - last < DEDUP_WINDOW_MS) return;
      lastFireRef.current.set(key, now);
      fn?.();
    };
  }

  // Determine which tab is "active" based on the current screen + session.
  // Chat tab is highlighted whenever the user is in an active chat session,
  // regardless of which side panel they're currently viewing.
  const tabs = [
    {
      key:       'home',
      label:     'Accueil',
      Icon:      HomeIcon,
      onTap:     onGoHome,
      isActive:  !sessionStarted && activeScreen === 'home',
    },
    {
      key:       'chat',
      label:     'Chat',
      Icon:      MessageSquare,
      onTap:     onStartChat,
      isActive:  sessionStarted && activeScreen === 'chat',
    },
    {
      key:       'dashboard',
      label:     'Dashboard',
      Icon:      BarChart2,
      onTap:     onGoDashboard,
      isActive:  activeScreen === 'dashboard',
    },
    {
      key:       'more',
      label:     'Plus',
      Icon:      Menu,
      onTap:     onOpenDrawer,
      isActive:  false, // drawer is overlay, never a "current screen"
    },
  ];

  return (
    <nav
      role="tablist"
      aria-label="Navigation mobile"
      className="md:hidden"
      style={{
        position:        'fixed',
        left:            0,
        right:           0,
        bottom:          0,
        height:          `calc(60px + env(safe-area-inset-bottom, 0px))`,
        paddingBottom:   'env(safe-area-inset-bottom, 0px)',
        backgroundColor: '#0a0f1c',
        borderTop:       '1px solid #1f2937',
        display:         'flex',
        alignItems:      'stretch',
        justifyContent:  'space-around',
        zIndex:          9998,
        // Prevent any text selection when tapping rapidly on the bar
        userSelect:      'none',
        WebkitUserSelect:'none',
      }}
    >
      {tabs.map(({ key, label, Icon, onTap, isActive }) => {
        const handleTap = fireOnce(`tab:${key}`, onTap);
        const color     = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            onPointerUp={handleTap}
            onTouchEnd={handleTap}
            onClick={handleTap}
            style={{
              flex:            1,
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             3,
              border:          'none',
              background:      'transparent',
              color,
              cursor:          'pointer',
              padding:         '6px 4px 4px',
              fontFamily:      'inherit',
              touchAction:     'manipulation',
              WebkitTapHighlightColor: 'transparent',
              transition:      'color 150ms ease',
            }}
          >
            <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
            <span
              style={{
                fontSize:       10,
                fontWeight:     isActive ? 600 : 500,
                letterSpacing:  '0.02em',
                lineHeight:     1,
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

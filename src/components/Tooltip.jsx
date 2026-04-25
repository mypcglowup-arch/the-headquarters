import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable tooltip — appears 200ms after hover/focus, dark glass style,
 * positioned auto (above by default, flips below if no room).
 *
 * Usage :
 *   <Tooltip content="Business to Business — vente entre entreprises">
 *     <span className="badge">B2B</span>
 *   </Tooltip>
 */
export default function Tooltip({ children, content, delay = 200, position = 'top' }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords]   = useState({ top: 0, left: 0, placement: position });
  const triggerRef = useRef(null);
  const showTimer  = useRef(null);
  const hideTimer  = useRef(null);

  function compute(placement = position) {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    if (placement === 'top') {
      // Will flip if there's no room above (rough check: 60px needed)
      if (r.top < 60) {
        return { top: r.bottom + 8, left: cx, placement: 'bottom' };
      }
      return { top: r.top - 8, left: cx, placement: 'top' };
    }
    return { top: r.bottom + 8, left: cx, placement: 'bottom' };
  }

  function handleEnter() {
    clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => {
      const c = compute();
      if (c) setCoords(c);
      setVisible(true);
    }, delay);
  }
  function handleLeave() {
    clearTimeout(showTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 80);
  }

  useEffect(() => () => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </span>
      {visible && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top:        coords.top,
            left:       coords.left,
            transform:  coords.placement === 'top'
              ? 'translate(-50%, -100%)'
              : 'translate(-50%, 0)',
            background: 'rgba(15,15,22,0.97)',
            color:      'rgba(241,245,249,0.96)',
            fontSize:   11,
            fontWeight: 500,
            lineHeight: 1.4,
            padding:    '7px 10px',
            borderRadius: 7,
            border:     '1px solid rgba(255,255,255,0.08)',
            boxShadow:  '0 10px 30px -10px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(8px)',
            maxWidth:   240,
            pointerEvents: 'none',
            zIndex:     200,
            opacity:    visible ? 1 : 0,
            transition: 'opacity 160ms ease-out',
            whiteSpace: 'normal',
            textAlign:  'center',
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}

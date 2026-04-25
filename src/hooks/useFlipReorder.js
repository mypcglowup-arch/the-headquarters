import { useLayoutEffect, useRef, useCallback } from 'react';

/**
 * FLIP layout reorder animation — pure CSS, no framer-motion required.
 *
 * Usage :
 *   const { register } = useFlipReorder([items], (item) => item.id);
 *   {items.map((item) => (
 *     <div key={item.id} ref={register(item.id)}>...</div>
 *   ))}
 *
 * On every list change, captures previous rects → after re-render, applies
 * inverted translate so each card APPEARS in its old slot, then removes the
 * translate next frame to animate via CSS transition.
 *
 * Easing : spring-natural overshoot (0.34, 1.56, 0.64, 1).
 * Duration : 400ms for moves, 0ms for entries (initial mount).
 */
export function useFlipReorder(deps, opts = {}) {
  const {
    duration = 400,
    easing   = 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  } = opts;

  const elementsRef = useRef(new Map()); // key → DOM element
  const prevRectsRef = useRef(new Map()); // key → DOMRect

  const register = useCallback((key) => (el) => {
    if (el) elementsRef.current.set(key, el);
    else    elementsRef.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    const newRects = new Map();
    elementsRef.current.forEach((el, key) => {
      if (el && el.isConnected) {
        newRects.set(key, el.getBoundingClientRect());
      }
    });

    // Compute deltas, apply inverted transform synchronously (still pre-paint)
    const animations = [];
    newRects.forEach((newRect, key) => {
      const oldRect = prevRectsRef.current.get(key);
      if (!oldRect) return; // newly mounted — no animation
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top  - newRect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return; // no move
      const el = elementsRef.current.get(key);
      if (!el) return;
      el.style.transition = 'none';
      el.style.transform  = `translate3d(${dx}px, ${dy}px, 0)`;
      el.style.willChange = 'transform';
      animations.push(el);
    });

    if (animations.length > 0) {
      // Force reflow so the inverted transform is committed before we clear it
      // eslint-disable-next-line no-unused-expressions
      animations[0].offsetHeight;
      requestAnimationFrame(() => {
        animations.forEach((el) => {
          el.style.transition = `transform ${duration}ms ${easing}`;
          el.style.transform  = '';
        });
        // Cleanup will-change after the transition ends
        setTimeout(() => {
          animations.forEach((el) => {
            el.style.willChange = '';
            el.style.transition = '';
          });
        }, duration + 50);
      });
    }

    prevRectsRef.current = newRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { register };
}

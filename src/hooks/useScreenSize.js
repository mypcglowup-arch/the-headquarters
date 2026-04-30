import { useEffect, useState } from 'react';

/**
 * Reactive viewport bucket. Returns one of :
 *   'mobile'  → window.innerWidth < 768
 *   'tablet'  → 768 ≤ window.innerWidth ≤ 1024
 *   'desktop' → window.innerWidth > 1024
 *
 * Boundaries match Tailwind's `md:` (768) and `lg:` (1024) breakpoints so the
 * hook stays in sync with the CSS-driven responsive utilities. Listens to
 * `resize` and `orientationchange`. SSR-safe : returns 'desktop' when window
 * is undefined so server-rendered HTML doesn't paint a mobile layout for
 * desktop visitors on first byte.
 *
 * Usage :
 *   const size = useScreenSize();
 *   if (size === 'mobile') return <Hamburger />;
 *
 * Prefer Tailwind responsive classes (`md:grid-cols-3`, `lg:flex-row`) for
 * pure styling — the hook is for cases where the rendered TREE differs
 * (different components, conditional logic, JS measurements).
 */

const MOBILE_MAX  = 768;   // < 768  → mobile
const TABLET_MAX  = 1024;  // 768-1024 inclusive → tablet, > 1024 → desktop

function readBucket() {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < MOBILE_MAX) return 'mobile';
  if (w <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useScreenSize() {
  const [bucket, setBucket] = useState(readBucket);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setBucket((prev) => {
      const next = readBucket();
      return next === prev ? prev : next; // skip re-render when unchanged
    });
    sync();
    window.addEventListener('resize',            sync, { passive: true });
    window.addEventListener('orientationchange', sync, { passive: true });
    return () => {
      window.removeEventListener('resize',            sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return bucket;
}

/**
 * Backward-compatible alias for the old binary check. Equivalent to
 * `useScreenSize() === 'mobile'`. Existing call sites keep working unchanged.
 */
export function useIsMobile() {
  return useScreenSize() === 'mobile';
}

/** Convenience helpers — same data, different shapes. */
export function useIsTablet()  { return useScreenSize() === 'tablet'; }
export function useIsDesktop() { return useScreenSize() === 'desktop'; }

export default useScreenSize;

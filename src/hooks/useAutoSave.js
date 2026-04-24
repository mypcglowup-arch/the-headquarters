import { useEffect, useRef, useState } from 'react';

/**
 * Debounced auto-save hook.
 * Saves `value` to localStorage under `key` after `delay` ms of inactivity.
 * Returns saveStatus: 'idle' | 'saving' | 'saved' | 'error'
 */
export function useAutoSave(key, value, delay = 400) {
  const [status, setStatus] = useState('idle');
  const timerRef            = useRef(null);
  const isFirstRender       = useRef(true);
  const latestValueRef      = useRef(value);

  // Always keep the latest value referenceable for a synchronous flush
  latestValueRef.current = value;

  useEffect(() => {
    // Skip initial mount — value already loaded from storage
    if (isFirstRender.current) { isFirstRender.current = false; return; }

    setStatus('saving');
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } catch {
        setStatus('error');
      }
    }, delay);

    return () => clearTimeout(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(value), delay]);

  // Flush pending write synchronously on page unload — eliminates the
  // debounce data-loss window when the user refreshes right after a mutation.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        try { localStorage.setItem(key, JSON.stringify(latestValueRef.current)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush); // Safari / iOS
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      // Also flush on unmount in dev (HMR / route changes)
      flush();
    };
  }, [key]);

  return status;
}

/**
 * Merge multiple save statuses into one for display.
 * Priority: error > saving > saved > idle
 */
export function mergeSaveStatus(statuses) {
  if (statuses.includes('error'))  return 'error';
  if (statuses.includes('saving')) return 'saving';
  if (statuses.includes('saved'))  return 'saved';
  return 'idle';
}

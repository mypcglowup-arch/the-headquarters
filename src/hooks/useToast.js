import { useState, useCallback } from 'react';

let _id = 0;

/**
 * Lightweight toast manager.
 *
 * Usage:
 *   const { toasts, toast, dismiss } = useToast();
 *   toast('Sauvegardé ✓');
 *   toast('Erreur', { type: 'error', duration: 5000 });
 *
 * types: 'success' | 'error' | 'info' | 'warning'
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, options = {}) => {
    const { type = 'success', duration = 3000 } = options;
    const id = ++_id;
    setToasts((prev) => [...prev.slice(-3), { id, message, type, dying: false }]);
    // Mark as dying slightly before removal so CSS exit animation can play
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dying: true } : t)));
    }, duration - 220);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dying: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 220);
  }, []);

  return { toasts, toast, dismiss };
}

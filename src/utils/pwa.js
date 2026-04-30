/**
 * PWA helpers: service worker registration, install prompt capture,
 * native notification permission + show-notification bridge.
 *
 * IMPORTANT browser limits (not our bug, but documenting):
 *   - There is NO reliable way to poll Gmail from a browser SW when the tab
 *     is completely closed. Periodic Background Sync (Chrome, installed PWA,
 *     12h+ interval) is too coarse and not cross-browser. True background
 *     polling needs a backend cron that sends web-push to the device.
 *   - Web Push without a push server = not available. What we CAN do is use
 *     `registration.showNotification()` for urgent alerts while the SW is
 *     active (i.e. while the app is open or resumed).
 */

let deferredInstallPrompt = null;
let installAvailableListeners = new Set();

// ─── Capture the install prompt ────────────────────────────────────────────
// Browsers fire `beforeinstallprompt` once when the PWA becomes installable.
// We stash it and expose it via `promptInstall()`.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installAvailableListeners.forEach((fn) => { try { fn(true); } catch { /* ignore */ } });
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installAvailableListeners.forEach((fn) => { try { fn(false); } catch { /* ignore */ } });
  });
}

export function isInstallAvailable() { return !!deferredInstallPrompt; }

export function onInstallAvailabilityChange(fn) {
  installAvailableListeners.add(fn);
  return () => installAvailableListeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredInstallPrompt) return { outcome: 'unavailable' };
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installAvailableListeners.forEach((fn) => { try { fn(false); } catch { /* ignore */ } });
  return choice; // { outcome: 'accepted' | 'dismissed' }
}

// ─── iOS install detection ────────────────────────────────────────────────
// iOS Safari doesn't fire `beforeinstallprompt`. We detect iOS + non-standalone
// so the UI can show manual instructions instead.
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

// ─── Service worker registration ──────────────────────────────────────────
// In dev (Vite), the SW interferes with HMR by serving cache-first stale JS
// bundles. We aggressively unregister + purge caches in dev so edits always
// reach the browser. In prod (build), the SW behaves normally.
export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (!('caches' in window)) return null;

  // DEV MODE: nuke the SW + caches so stale bundles can never linger.
  if (import.meta.env && import.meta.env.DEV) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      console.log('[PWA] dev mode — service worker + caches purged');
    } catch (err) {
      console.warn('[PWA] dev cleanup failed:', err.message);
    }
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[PWA] service worker registered, scope:', reg.scope);
    return reg;
  } catch (err) {
    console.warn('[PWA] service worker registration failed:', err.message);
    return null;
  }
}

// ─── Notifications bridge ─────────────────────────────────────────────────
export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    const p = await Notification.requestPermission();
    return p;
  } catch {
    return 'denied';
  }
}

// Send a local notification through the service worker's registration.
// Falls back to new Notification() if the SW isn't ready yet.
export async function showLocalNotification({ title, body, tag, data } = {}) {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        reg.active?.postMessage({ type: 'SHOW_NOTIFICATION', title, body, tag, data });
        return true;
      }
    }
    new Notification(title || 'QG', { body: body || '', icon: '/icon-192.png', tag });
    return true;
  } catch (err) {
    console.warn('[PWA] showLocalNotification failed:', err.message);
    return false;
  }
}

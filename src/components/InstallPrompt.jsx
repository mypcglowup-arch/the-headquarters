import { useState, useEffect } from 'react';
import { Download, Share, X } from 'lucide-react';
import {
  isInstallAvailable, onInstallAvailabilityChange, promptInstall,
  isIOS, isStandalone,
} from '../utils/pwa.js';

const LS_DISMISSED = 'qg_install_prompt_dismissed_v1';

function wasDismissed() {
  try {
    const raw = localStorage.getItem(LS_DISMISSED);
    if (!raw) return false;
    // Re-show after 30 days
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < 30 * 86400_000;
  } catch { return false; }
}

function markDismissed() {
  try { localStorage.setItem(LS_DISMISSED, String(Date.now())); } catch { /* ignore */ }
}

export default function InstallPrompt({ darkMode = true, lang = 'fr' }) {
  const [available, setAvailable] = useState(() => isInstallAvailable());
  const [dismissed, setDismissed] = useState(() => wasDismissed());
  const ios = isIOS();
  const standalone = isStandalone();

  useEffect(() => {
    const unsub = onInstallAvailabilityChange((v) => setAvailable(v));
    return unsub;
  }, []);

  if (standalone || dismissed) return null;
  // On iOS there's no auto-prompt — show the manual hint only if the app
  // isn't already installed (i.e. running standalone)
  const showAndroid = available;
  const showIOS     = ios && !available;
  if (!showAndroid && !showIOS) return null;

  const handleInstall = async () => {
    const res = await promptInstall();
    if (res?.outcome === 'accepted') setAvailable(false);
  };

  const handleDismiss = () => {
    markDismissed();
    setDismissed(true);
  };

  const accent = '99,102,241'; // indigo — brand

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 420,
        width: 'calc(100% - 32px)',
        zIndex: 150,
        animation: 'ftFadeIn 0.35s ease',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        borderRadius: 14,
        background: darkMode ? 'rgba(10,14,24,0.95)' : 'rgba(255,255,255,0.98)',
        border: `1px solid rgba(${accent},0.28)`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(${accent},0.15)`,
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `rgba(${accent},0.15)`,
          border: `1px solid rgba(${accent},0.3)`,
          flexShrink: 0,
        }}>
          {showIOS
            ? <Share size={16} style={{ color: `rgba(${accent},0.95)` }} />
            : <Download size={16} style={{ color: `rgba(${accent},0.95)` }} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 700,
            color: darkMode ? '#f1f5f9' : '#0f172a',
          }}>
            {lang === 'fr' ? "Installer QG sur ton écran d'accueil" : 'Install QG on your home screen'}
          </p>
          <p style={{
            margin: 0, marginTop: 2, fontSize: 11,
            color: darkMode ? 'rgba(148,163,184,0.75)' : 'rgba(71,85,105,0.85)',
            lineHeight: 1.35,
          }}>
            {showIOS
              ? (lang === 'fr'
                ? 'Appuie sur Partager puis "Sur l\'écran d\'accueil".'
                : 'Tap Share, then "Add to Home Screen".')
              : (lang === 'fr'
                ? 'Accès instantané + notifications emails urgents.'
                : 'One-tap access + urgent email notifications.')}
          </p>
        </div>

        {showAndroid && (
          <button
            onClick={handleInstall}
            style={{
              flexShrink: 0,
              padding: '7px 12px',
              borderRadius: 8,
              background: `rgba(${accent},0.9)`,
              color: 'white',
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 0 12px rgba(${accent},0.25)`,
            }}
          >
            {lang === 'fr' ? 'Installer' : 'Install'}
          </button>
        )}

        <button
          onClick={handleDismiss}
          aria-label={lang === 'fr' ? 'Fermer' : 'Dismiss'}
          style={{
            flexShrink: 0,
            padding: 6,
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)',
          }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

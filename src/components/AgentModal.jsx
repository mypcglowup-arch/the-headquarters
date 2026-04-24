import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AGENT_CONFIG } from '../prompts.js';
import { getAgentBio } from '../data/agentBios.js';
import { t } from '../i18n.js';

export default function AgentModal({ agentKey, displayName, darkMode, lang = 'fr', onClose }) {
  const config = AGENT_CONFIG[agentKey];
  const bio    = getAgentBio(agentKey, lang);
  const rgb    = config.glowRgb;

  const sectionLabel = darkMode ? 'text-gray-500' : 'text-gray-400';
  const cardBg       = darkMode ? 'bg-gray-900'   : 'bg-white';
  const overlayBg    = darkMode ? 'bg-black/80'   : 'bg-black/50';

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!bio) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 py-6 ${overlayBg} animate-modal-fade`}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-modal-slide ${cardBg}`}
        style={{ border: `1px solid rgba(${rgb}, 0.3)`, boxShadow: `0 0 60px rgba(${rgb}, 0.15), 0 24px 48px rgba(0,0,0,0.5)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient header strip */}
        <div
          className="h-1.5 rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, rgba(${rgb},0.8), rgba(${rgb},0.2))` }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-full transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
        >
          <X size={16} />
        </button>

        <div className="px-6 pt-5 pb-7 space-y-5">

          {/* Hero: emoji + name + domain */}
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: `rgba(${rgb}, 0.15)`, border: `1px solid rgba(${rgb}, 0.3)` }}
            >
              {config.emoji}
            </div>
            <div className="pt-0.5">
              <h2 className={`text-lg font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {displayName}
              </h2>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: `rgba(${rgb}, 0.15)`, color: `rgb(${rgb})` }}
              >
                {t(`domain.${agentKey}`, lang)}
              </span>
            </div>
          </div>

          {/* Philosophy */}
          <p
            className="text-sm italic leading-relaxed pl-3"
            style={{ borderLeft: `3px solid rgba(${rgb}, 0.6)`, color: darkMode ? '#d1d5db' : '#374151' }}
          >
            "{bio.philosophy}"
          </p>

          {/* Best at */}
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${sectionLabel}`}>
              {t('modal.bestAt', lang)}
            </p>
            <ul className="space-y-1.5">
              {bio.bestAt.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 text-xs flex-shrink-0" style={{ color: `rgb(${rgb})` }}>✦</span>
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Silent when */}
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${sectionLabel}`}>
              {t('modal.silent', lang)}
            </p>
            <ul className="space-y-1.5">
              {bio.silent.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-0.5 text-xs flex-shrink-0 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>—</span>
                  <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Signature phrases */}
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${sectionLabel}`}>
              {t('modal.signatures', lang)}
            </p>
            <div className="flex flex-wrap gap-2">
              {bio.signatures.map((phrase, i) => (
                <span
                  key={i}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ background: `rgba(${rgb}, 0.12)`, color: `rgb(${rgb})`, border: `1px solid rgba(${rgb}, 0.25)` }}
                >
                  "{phrase}"
                </span>
              ))}
            </div>
          </div>

          {/* Best used when */}
          <div
            className="rounded-xl p-4"
            style={{ background: `rgba(${rgb}, 0.06)`, border: `1px solid rgba(${rgb}, 0.15)` }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: `rgb(${rgb})` }}>
              {t('modal.bestWhen', lang)}
            </p>
            <ul className="space-y-1.5">
              {bio.scenarios.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: `rgb(${rgb})` }}>→</span>
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{s}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}

import { createPortal } from 'react-dom';
import { Drama } from 'lucide-react';
import { ROLEPLAY_SCENARIOS } from '../prompts.js';

export default function ScenarioPicker({ darkMode, lang = 'fr', onPick, onCancel }) {
  const title = lang === 'fr' ? 'Choisis ton scénario' : 'Choose your scenario';
  const subtitle = lang === 'fr' ? 'Le Black Swan joue l\'autre personne. Tu seras coaché après 5 échanges.' : 'The Black Swan plays the other person. You\'ll be coached after 5 exchanges.';
  const cancelLabel = lang === 'fr' ? 'Annuler' : 'Cancel';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: darkMode ? 'rgba(5,8,16,0.92)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
          style={{ color: 'rgba(148,163,184,0.4)' }}>
          <Drama size={11} className="inline mr-1.5" style={{ verticalAlign: 'middle' }} />Roleplay Mode
        </p>
        <h2 className="text-xl font-black text-center mb-2 leading-tight"
          style={{ color: darkMode ? '#f1f5f9' : '#0f172a', fontFamily: "'Space Grotesk', sans-serif" }}>
          {title}
        </h2>
        <p className="text-center text-xs mb-6" style={{ color: 'rgba(148,163,184,0.5)' }}>
          {subtitle}
        </p>

        <div className="space-y-2">
          {ROLEPLAY_SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => onPick(s.key)}
              className="w-full text-left px-4 py-3 rounded-xl transition-all"
              style={{
                background: darkMode ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.2)',
                color: darkMode ? '#e2e8f0' : '#1e293b',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = darkMode ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.06)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; }}
            >
              <span className="text-sm font-semibold">{lang === 'fr' ? s.fr : s.en}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-4 py-2 text-xs transition-colors"
          style={{ color: 'rgba(148,163,184,0.4)' }}
        >
          {cancelLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}

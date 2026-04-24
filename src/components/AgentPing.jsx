import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AGENT_CONFIG } from '../prompts.js';
import AgentAvatar from './AgentAvatar.jsx';

function formatContent(text, darkMode) {
  // Simple bold markdown parser
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'inherit', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function AgentPing({ notification, agentNames, agentPhotos, darkMode, lang = 'fr', onDismiss, onStartSession }) {
  if (!notification) return null;
  const { agent, message } = notification;
  const config = AGENT_CONFIG[agent] || AGENT_CONFIG.SYNTHESIZER;
  const rgb = config.glowRgb;
  const displayName = agentNames?.[agent] || config.displayName;
  const photo = agentPhotos?.[agent];

  const lines = message.split('\n\n');

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-modal-slide"
        style={{
          background: darkMode ? 'rgba(8,12,24,0.96)' : 'rgba(255,255,255,0.97)',
          border: `1px solid rgba(${rgb}, 0.35)`,
          boxShadow: `0 0 60px rgba(${rgb}, 0.15), 0 24px 48px rgba(0,0,0,0.5)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="h-1 rounded-t-2xl" style={{ background: `linear-gradient(90deg, rgba(${rgb},0.9), rgba(${rgb},0.2))` }} />

        <div className="px-5 py-5">
          {/* Agent header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AgentAvatar agentKey={agent} photo={photo} size="sm" />
              <div>
                <p className="font-bold text-sm" style={{ color: `rgb(${rgb})` }}>
                  {config.emoji} {displayName}
                </p>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.4)' }}>
                  {lang === 'fr' ? 'Message pour toi' : 'Message for you'}
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-full transition-colors"
              style={{ color: 'rgba(148,163,184,0.4)' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Message */}
          <div className="space-y-3 mb-5">
            {lines.filter(Boolean).map((line, i) => (
              <p key={i} className="text-sm leading-relaxed"
                style={{ color: darkMode ? '#d1d5db' : '#374151' }}>
                {formatContent(line, darkMode)}
              </p>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onStartSession}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{
                background: `linear-gradient(135deg, rgba(${rgb},0.9), rgba(${rgb},0.7))`,
                color: 'white',
              }}
            >
              {lang === 'fr' ? 'Ouvrir une session →' : 'Start a session →'}
            </button>
            <button
              onClick={onDismiss}
              className="px-4 py-2.5 rounded-xl text-sm transition-colors"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                color: 'rgba(148,163,184,0.6)',
              }}
            >
              {lang === 'fr' ? 'Plus tard' : 'Later'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

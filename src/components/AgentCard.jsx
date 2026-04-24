import { useState, useRef } from 'react';
import { Crosshair } from 'lucide-react';
import { AGENT_CONFIG } from '../prompts.js';
import { formatLastSpoke } from '../utils/greeting.js';
import AgentAvatar from './AgentAvatar.jsx';
import AgentModal from './AgentModal.jsx';
import { t } from '../i18n.js';
import { getDepthPct, getDepthLabel, DEPTH_MILESTONES } from '../utils/agentDepth.js';

export default function AgentCard({
  agentKey, displayName, agentPhoto, darkMode,
  onUpdateName, onUpdatePhoto, lastSpoke, onFocus, lang = 'fr', index = 0,
  sessionCount = 0,
}) {
  const config = AGENT_CONFIG[agentKey];
  const [editing, setEditing]     = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [hovered, setHovered]     = useState(false);
  const [popName, setPopName]     = useState(false);
  const [showModal, setShowModal] = useState(false);
  const fileRef = useRef(null);
  const rgb = config.glowRgb;

  function handleNameSubmit(e) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (trimmed) {
      onUpdateName(agentKey, trimmed);
      setPopName(true);
      setTimeout(() => setPopName(false), 400);
    }
    setEditing(false);
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onUpdatePhoto(agentKey, ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const isSynth = agentKey === 'SYNTHESIZER';
  const lastSpokeLabel = formatLastSpoke(lastSpoke, lang);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-2xl pt-5 pb-4 px-4 flex flex-col items-center gap-2 text-center animate-card-in"
      style={{
        animationDelay: `${index * 0.07}s`,
        background: hovered
          ? (darkMode ? `rgba(${rgb}, 0.07)` : `rgba(${rgb}, 0.05)`)
          : (darkMode ? 'rgba(255,255,255,0.04)' : '#ECEAE4'),
        border: darkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
        transform: hovered ? 'scale(1.015)' : 'scale(1)',
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* on demand badge */}
      {isSynth && (
        <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(100,116,139,0.15)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(100,116,139,0.2)' }}>
          on demand
        </span>
      )}

      {/* Info button */}
      {!isSynth && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
          title="Agent info"
          className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all"
          style={{
            color: `rgba(${rgb}, ${hovered ? 0.8 : 0.3})`,
            border: `1px solid rgba(${rgb}, ${hovered ? 0.4 : 0.15})`,
            background: hovered ? `rgba(${rgb}, 0.1)` : 'transparent',
          }}
        >
          ?
        </button>
      )}

      {/* Focus button on hover */}
      {!isSynth && hovered && (
        <button
          onClick={() => onFocus(agentKey)}
          title={`Focus on ${displayName} only`}
          className="absolute top-2.5 left-2.5 p-1 rounded-lg transition-all"
          style={{ color: `rgba(${rgb}, 0.8)`, backgroundColor: `rgba(${rgb}, 0.1)` }}
        >
          <Crosshair size={11} />
        </button>
      )}

      {/* Avatar with pulse ring */}
      <div className="relative flex-shrink-0">
        {/* Pulse ring */}
        <div
          className="absolute inset-0 rounded-full animate-ring-pulse pointer-events-none"
          style={{
            border: `2px solid rgba(${rgb}, 0.5)`,
            transform: 'scale(1.18)',
            borderRadius: '50%',
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          title="Click to change photo"
          className="relative group block"
        >
          <AgentAvatar agentKey={agentKey} photo={agentPhoto} size="md" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 text-white text-sm transition-opacity">
            📷
          </span>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      {/* Name */}
      {editing ? (
        <form onSubmit={handleNameSubmit}>
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameSubmit}
            className="text-sm font-semibold text-center w-28 bg-transparent border-b outline-none"
            style={{ borderColor: `rgba(${rgb}, 0.5)`, color: darkMode ? '#fff' : '#111' }}
            maxLength={20}
          />
        </form>
      ) : (
        <button
          onClick={() => { setNameInput(displayName); setEditing(true); }}
          title="Click to rename"
          className={`text-sm font-semibold leading-tight transition-colors ${popName ? 'animate-name-pop' : ''}`}
          style={{ color: darkMode ? '#f1f5f9' : '#1A1A1A' }}
        >
          {displayName}
        </button>
      )}

      {/* Domain */}
      <p className="text-[11px] font-medium" style={{ color: `rgba(${rgb}, 0.85)` }}>
        {t(`domain.${agentKey}`, lang)}
      </p>

      {/* Last spoke */}
      {lastSpokeLabel && (
        <p className="text-[10px]" style={{ color: darkMode ? 'rgba(148,163,184,0.3)' : '#A09B96' }}>
          {lastSpokeLabel}
        </p>
      )}

      {/* Memory depth bar */}
      {!isSynth && (
        <div className="w-full px-1 mt-1">
          <div className="relative h-1 rounded-full overflow-visible" style={{ background: `rgba(${rgb}, 0.1)` }}>
            {/* Milestone ticks */}
            {DEPTH_MILESTONES.slice(0, -1).map((m) => (
              <div key={m} className="absolute top-0 bottom-0 w-px"
                style={{ left: `${m}%`, background: `rgba(${rgb}, 0.25)` }} />
            ))}
            {/* Fill */}
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${getDepthPct(sessionCount)}%`, background: `rgba(${rgb}, 0.7)` }} />
          </div>
          <p
            aria-hidden={!hovered}
            className="text-[9px] text-center mt-1"
            style={{
              color: `rgba(${rgb}, 0.6)`,
              opacity: hovered ? 1 : 0,
              pointerEvents: hovered ? 'auto' : 'none',
              transition: 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              lineHeight: 1.2,
            }}
          >
            {getDepthLabel(sessionCount, lang)}
          </p>
        </div>
      )}

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px rounded-b-2xl transition-all duration-300"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${rgb}, ${hovered ? 0.7 : 0.25}), transparent)` }}
      />

      {/* Agent info modal */}
      {showModal && (
        <AgentModal
          agentKey={agentKey}
          displayName={displayName}
          darkMode={darkMode}
          lang={lang}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

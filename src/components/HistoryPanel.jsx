import { useState, useEffect, useRef } from 'react';
import { AGENT_CONFIG } from '../prompts.js';
import { generateTopicLabel } from '../api.js';

/**
 * Collapsible left history panel.
 *
 * Props:
 *   messages          — full message array from ChatScreen
 *   darkMode          — bool
 *   onScrollTo(id)    — scroll the chat to a given message id
 *   currentMsgId      — id of the last message (to highlight active entry)
 */
export default function HistoryPanel({ messages, darkMode, onScrollTo, currentMsgId }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]); // [{ id, label, agent, timestamp }]
  const generatingRef = useRef(new Set()); // prevent duplicate Haiku calls

  // Extract conversation topic entries every ~4 agent messages
  useEffect(() => {
    const agentMsgs = messages.filter((m) => m.type === 'agent' && !m.streaming && m.content?.length > 30);
    // Build entries in groups of ~4
    const CHUNK = 4;
    const chunks = [];
    for (let i = 0; i < agentMsgs.length; i += CHUNK) {
      chunks.push(agentMsgs.slice(i, i + CHUNK));
    }

    chunks.forEach((chunk) => {
      const anchor = chunk[0]; // first message in this chunk = scroll target
      if (!anchor) return;
      // Already have an entry for this anchor? Skip.
      if (entries.some((e) => e.id === anchor.id)) return;
      // Already generating? Skip.
      if (generatingRef.current.has(anchor.id)) return;
      generatingRef.current.add(anchor.id);

      // Build text from chunk for label generation
      const text = chunk.map((m) => m.content).join(' ').replace(/\n/g, ' ');
      generateTopicLabel(text).then((label) => {
        if (!label) return;
        setEntries((prev) => {
          // Avoid duplicates
          if (prev.some((e) => e.id === anchor.id)) return prev;
          const newEntry = {
            id: anchor.id,
            label,
            agent: anchor.agent,
            timestamp: anchor.timestamp ? new Date(anchor.timestamp) : new Date(),
          };
          return [...prev, newEntry].sort((a, b) => a.timestamp - b.timestamp);
        });
      });
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative flex flex-shrink-0" style={{ height: '100%' }}>
      {/* Toggle tab — always visible on left edge */}
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        title={open ? 'Fermer l\'historique' : 'Voir l\'historique'}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-colors"
        style={{
          width: '18px',
          height: '56px',
          background: darkMode ? 'rgba(30,41,59,0.9)' : 'rgba(243,244,246,0.95)',
          border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.1)',
          borderLeft: 'none',
          borderRadius: '0 8px 8px 0',
          color: darkMode ? '#6b7280' : '#9ca3af',
          fontSize: '10px',
          writingMode: 'horizontal-tb',
        }}
      >
        {open ? '◁' : '▷'}
      </button>

      {/* Sliding panel */}
      <div
        style={{
          width: open ? '200px' : '0px',
          overflow: 'hidden',
          transition: 'width 0.3s ease',
          height: '100%',
          flexShrink: 0,
        }}
      >
        <div
          className="h-full overflow-y-auto flex flex-col"
          style={{
            width: '200px',
            background: darkMode ? '#111827' : '#f9fafb',
            borderRight: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
          }}
        >
          {/* Header */}
          <div className="px-3.5 pt-3 pb-2 flex-shrink-0">
            <p
              className="font-black uppercase tracking-widest"
              style={{ fontSize: '10px', color: darkMode ? '#4b5563' : '#9ca3af' }}
            >
              CETTE SESSION
            </p>
          </div>

          {/* Entries */}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {entries.length === 0 ? (
              <p
                className="text-center px-3 pt-8 italic leading-relaxed"
                style={{ fontSize: '11px', color: darkMode ? '#374151' : '#d1d5db' }}
              >
                Les topics apparaissent au fil de la conversation.
              </p>
            ) : (
              entries.map((entry) => {
                const cfg = AGENT_CONFIG[entry.agent];
                const isActive = entry.id === currentMsgId ||
                  (entries.indexOf(entry) === entries.length - 1 && !currentMsgId);
                const timeStr = entry.timestamp
                  ? entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onScrollTo(entry.id)}
                    className="w-full text-left px-2 py-2 rounded-lg mb-1 transition-all hover:opacity-80"
                    style={{
                      borderLeft: isActive
                        ? '2px solid rgb(99,102,241)'
                        : `2px solid rgba(${cfg?.glowRgb || '99,102,241'}, 0.25)`,
                      background: isActive
                        ? 'rgba(99,102,241,0.06)'
                        : 'transparent',
                      borderRadius: '0 8px 8px 0',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '10px',
                        color: darkMode ? '#4b5563' : '#9ca3af',
                        marginBottom: '2px',
                      }}
                    >
                      {timeStr}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: '11px', lineHeight: 1, flexShrink: 0 }}>
                        {cfg?.emoji || '?'}
                      </span>
                      <p
                        className="truncate"
                        style={{
                          fontSize: '12px',
                          color: darkMode ? '#e5e7eb' : '#111827',
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {entry.label}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

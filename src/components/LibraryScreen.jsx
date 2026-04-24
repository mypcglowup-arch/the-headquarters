import { useState, useEffect } from 'react';
import { Bookmark, BookmarkX, Search, X } from 'lucide-react';
import { getSavedResponses, unsaveResponse } from '../utils/library.js';
import { AGENT_CONFIG } from '../prompts.js';

export default function LibraryScreen({ darkMode, lang = 'fr' }) {
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState(null);

  useEffect(() => {
    setEntries(getSavedResponses());
  }, []);

  function handleUnsave(id) {
    unsaveResponse(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const filtered = entries.filter((e) => {
    const matchAgent = !agentFilter || e.agent === agentFilter;
    const matchSearch = !search.trim() || e.content.toLowerCase().includes(search.toLowerCase());
    return matchAgent && matchSearch;
  });

  const usedAgents = [...new Set(entries.map((e) => e.agent))];

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${darkMode ? 'bg-gray-950 text-gray-200' : 'bg-gray-50 text-gray-800'}`}>
      {/* Header */}
      <div
        className={`px-6 pt-5 pb-4 flex-shrink-0 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}
      >
        <div className="flex items-center gap-3 mb-4">
          <Bookmark size={18} style={{ color: 'rgb(99,102,241)' }} />
          <h1 className="font-bold text-lg" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
            {lang === 'fr' ? 'Bibliothèque' : 'Library'}
          </h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'rgb(99,102,241)' }}
          >
            {entries.length}
          </span>
        </div>

        {/* Search */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-[#F5F4F0] border-[#E8E6E0]'}`}>
          <Search size={13} style={{ color: darkMode ? '#4b5563' : '#9ca3af', flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'fr' ? 'Rechercher dans la bibliothèque...' : 'Search library...'}
            className={`flex-1 bg-transparent text-sm outline-none ${darkMode ? 'text-gray-200 placeholder-gray-600' : 'text-gray-800 placeholder-gray-400'}`}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: darkMode ? '#4b5563' : '#9ca3af' }}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Agent filter chips */}
        {usedAgents.length > 1 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() => setAgentFilter(null)}
              className="text-[11px] font-medium px-3 py-1 rounded-full transition-all"
              style={{
                background: !agentFilter ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: `1px solid ${!agentFilter ? 'rgba(99,102,241,0.4)' : 'rgba(148,163,184,0.15)'}`,
                color: !agentFilter ? 'rgb(99,102,241)' : (darkMode ? '#6b7280' : '#9ca3af'),
              }}
            >
              {lang === 'fr' ? 'Tous' : 'All'}
            </button>
            {usedAgents.map((agent) => {
              const cfg = AGENT_CONFIG[agent];
              const isActive = agentFilter === agent;
              return (
                <button
                  key={agent}
                  onClick={() => setAgentFilter(isActive ? null : agent)}
                  className="text-[11px] font-medium px-3 py-1 rounded-full transition-all flex items-center gap-1"
                  style={{
                    background: isActive ? `rgba(${cfg?.glowRgb}, 0.15)` : 'transparent',
                    border: `1px solid ${isActive ? `rgba(${cfg?.glowRgb}, 0.4)` : 'rgba(148,163,184,0.15)'}`,
                    color: isActive ? `rgb(${cfg?.glowRgb})` : (darkMode ? '#6b7280' : '#9ca3af'),
                  }}
                >
                  <span>{cfg?.emoji}</span>
                  <span>{agent}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Bookmark size={32} style={{ color: darkMode ? '#1f2937' : '#e5e7eb' }} />
            <p className="text-sm text-center" style={{ color: darkMode ? '#374151' : '#d1d5db' }}>
              {entries.length === 0
                ? (lang === 'fr' ? 'Aucune réponse sauvegardée.\nCliquez 💾 sur n\'importe quel message pour l\'ajouter.' : 'No saved responses yet.\nClick 💾 on any message to save it.')
                : (lang === 'fr' ? 'Aucun résultat pour cette recherche.' : 'No results for this search.')
              }
            </p>
          </div>
        ) : (
          filtered.map((entry) => {
            const cfg = AGENT_CONFIG[entry.agent];
            const rgb = cfg?.glowRgb || '99,102,241';
            const savedDate = entry.savedAt
              ? new Date(entry.savedAt).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })
              : '';
            return (
              <div
                key={entry.id}
                className={`rounded-2xl border overflow-hidden`}
                style={{
                  borderColor: `rgba(${rgb}, 0.2)`,
                  background: darkMode ? `rgba(${rgb}, 0.03)` : `rgba(${rgb}, 0.015)`,
                }}
              >
                {/* Card header */}
                <div
                  className="flex items-center gap-2 px-4 py-2.5"
                  style={{
                    background: `linear-gradient(135deg, rgba(${rgb}, 0.14) 0%, rgba(${rgb}, 0.05) 100%)`,
                    borderBottom: `1px solid rgba(${rgb}, 0.12)`,
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{cfg?.emoji || '?'}</span>
                  <span className="font-bold text-xs" style={{ color: `rgb(${rgb})` }}>{entry.agent}</span>
                  <span className="text-[10px] opacity-40 ml-auto" style={{ color: `rgb(${rgb})` }}>{savedDate}</span>
                  <button
                    type="button"
                    onClick={() => handleUnsave(entry.id)}
                    title={lang === 'fr' ? 'Retirer de la bibliothèque' : 'Remove from library'}
                    className="transition-opacity opacity-50 hover:opacity-100 ml-1"
                    style={{ color: `rgb(${rgb})` }}
                  >
                    <BookmarkX size={13} />
                  </button>
                </div>

                {/* Card content */}
                <div
                  className="px-4 py-3 text-sm leading-relaxed"
                  style={{
                    borderLeft: `3px solid rgba(${rgb}, 0.45)`,
                    color: darkMode ? '#d1d5db' : '#374151',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '180px',
                    overflowY: 'auto',
                  }}
                >
                  {entry.content.length > 500 ? entry.content.slice(0, 500) + '…' : entry.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

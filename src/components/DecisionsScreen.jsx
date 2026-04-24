import { useState } from 'react';
import { Compass } from 'lucide-react';
import { AGENT_CONFIG } from '../prompts.js';
import { t } from '../i18n.js';

export default function DecisionsScreen({ decisions, darkMode, lang = 'fr', onUpdateOutcome }) {
  const calLocale = lang === 'fr' ? 'fr-CA' : 'en-CA';

  if (!decisions.length) {
    return (
      <div className={`flex-1 flex flex-col px-4 py-6 overflow-y-auto ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
        <div className="max-w-2xl mx-auto w-full">
          <h2 className={`text-2xl font-black tracking-widest uppercase mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('decisions.title', lang)}
          </h2>
          <p className={`text-sm mb-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {t('decisions.subtitle', lang)}
          </p>
          <div className={`text-center py-16 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`}>
            <Compass size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('decisions.empty', lang)}</p>
          </div>
        </div>
      </div>
    );
  }

  const byDate = {};
  for (const d of decisions) {
    const label = d.date
      ? new Date(d.date).toLocaleDateString(calLocale, { weekday: 'long', month: 'long', day: 'numeric' })
      : '—';
    if (!byDate[label]) byDate[label] = [];
    byDate[label].push(d);
  }

  return (
    <div className={`flex-1 flex flex-col px-4 py-6 overflow-y-auto ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
      <div className="max-w-2xl mx-auto w-full">
        <h2 className={`text-2xl font-black tracking-widest uppercase mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {t('decisions.title', lang)}
        </h2>
        <p className={`text-sm mb-6 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          {t('decisions.count', lang, { count: decisions.length })}
          {onUpdateOutcome && (
            <span className={`ml-2 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              · {t('decisions.outcomeHint', lang)}
            </span>
          )}
        </p>

        <div className="space-y-8">
          {Object.entries(byDate).reverse().map(([date, items]) => (
            <div key={date}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                {date}
              </p>
              <div className="space-y-2">
                {items.map((d, i) => (
                  <DecisionCard
                    key={d.id || i}
                    decision={d}
                    darkMode={darkMode}
                    lang={lang}
                    onUpdateOutcome={onUpdateOutcome}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DecisionCard({ decision: d, darkMode, lang = 'fr', onUpdateOutcome }) {
  const config = d.agent && d.agent !== 'GENERAL' ? AGENT_CONFIG[d.agent] : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.outcome || '');

  function save() {
    if (onUpdateOutcome && d.id) onUpdateOutcome(d.id, draft.trim() || null);
    setEditing(false);
  }

  return (
    <div
      className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-[#F5F4F0] border-[#E8E6E0]'}`}
      style={config ? { borderLeftColor: `rgba(${config.glowRgb}, 0.6)`, borderLeftWidth: 3 } : {}}
    >
      <p className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{d.decision}</p>
      {config && (
        <p className={`text-xs mt-1 font-medium ${config.textColor}`}>
          via {d.agent.charAt(0) + d.agent.slice(1).toLowerCase()}
        </p>
      )}

      <div className="mt-2.5">
        {editing ? (
          <div className="space-y-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('decisions.placeholder', lang)}
              rows={2}
              className={`w-full rounded-lg px-3 py-2 text-xs resize-none outline-none border transition-all ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-600 focus:border-gray-500'
                  : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-gray-400'
              }`}
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${darkMode ? 'bg-emerald-800 text-emerald-200 hover:bg-emerald-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
              >
                {t('decisions.save', lang)}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(d.outcome || ''); }}
                className={`px-3 py-1 rounded-lg text-xs transition-all ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {t('decisions.cancel', lang)}
              </button>
            </div>
          </div>
        ) : d.outcome ? (
          <div
            className={`flex items-start justify-between gap-2 group/outcome cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
            onClick={() => { setDraft(d.outcome); setEditing(true); }}
          >
            <p className={`text-xs flex-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
              <span className={`font-medium mr-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>{t('decisions.outcome', lang)}</span>
              {d.outcome}
            </p>
            <span className={`text-xs opacity-0 group-hover/outcome:opacity-60 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('decisions.edit', lang)}
            </span>
          </div>
        ) : onUpdateOutcome && d.id ? (
          <button
            onClick={() => setEditing(true)}
            className={`text-xs px-2 py-1 rounded-lg transition-colors ${darkMode ? 'text-gray-700 hover:text-gray-500' : 'text-gray-300 hover:text-gray-500'}`}
          >
            {t('decisions.addOutcome', lang)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

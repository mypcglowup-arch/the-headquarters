import { useState } from 'react';
import { CheckSquare, Square, Trash2, ScrollText } from 'lucide-react';
import Confetti from './Confetti.jsx';
import { t } from '../i18n.js';

export default function JournalScreen({
  improvementJournal,
  darkMode,
  lang = 'fr',
  onUpdateImprovementStatus,
  onDeleteImprovement,
}) {
  const [filter, setFilter] = useState('all');
  const [confettiId, setConfettiId] = useState(null);

  const filtered = improvementJournal.filter((item) => {
    if (filter === 'todo') return item.status !== 'done';
    if (filter === 'done') return item.status === 'done';
    return true;
  });

  const doneCount = improvementJournal.filter((i) => i.status === 'done').length;
  const todoCount = improvementJournal.length - doneCount;

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 px-4 py-6 overflow-y-auto ${
        darkMode ? 'text-gray-100' : 'text-gray-900'
      }`}
    >
      <div className="max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <h2
            className={`text-2xl font-black tracking-widest uppercase mb-1 ${
              darkMode ? 'text-white' : 'text-gray-900'
            }`}
          >
            {t('journal.title', lang)}
          </h2>
          <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {t('journal.stats', lang, { todo: todoCount, done: doneCount })}
          </p>
        </div>

        {/* Filter tabs */}
        <div
          className={`flex gap-1 p-1 rounded-lg mb-6 w-fit ${
            darkMode ? 'bg-gray-800' : 'bg-gray-100'
          }`}
        >
          {['all', 'todo', 'done'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                filter === f
                  ? darkMode ? 'bg-gray-700 text-white' : 'bg-[#F5F4F0] text-gray-900 shadow-sm'
                  : darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t(`journal.filter.${f}`, lang)}
            </button>
          ))}
        </div>

        {/* Items */}
        {filtered.length === 0 ? (
          <div
            className={`text-center py-16 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`}
          >
            <ScrollText size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {improvementJournal.length === 0
                ? t('journal.empty', lang)
                : t('journal.emptyFilter', lang)}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
                  item.status === 'done'
                    ? darkMode
                      ? 'border-gray-800 bg-gray-900/40 opacity-50'
                      : 'border-gray-100 bg-gray-50 opacity-50'
                    : darkMode
                    ? 'border-gray-800 bg-gray-900'
                    : 'border-[#E8E6E0] bg-[#F5F4F0]'
                }`}
              >
                {/* Checkbox + confetti */}
                <div className="relative flex-shrink-0">
                  <Confetti active={confettiId === item.id} />
                  <button
                  onClick={() => {
                    const next = item.status === 'done' ? 'todo' : 'done';
                    onUpdateImprovementStatus(item.id, next);
                    if (next === 'done') setConfettiId(item.id);
                  }}
                  className={`mt-0.5 ${
                    darkMode
                      ? 'text-gray-500 hover:text-emerald-400'
                      : 'text-gray-400 hover:text-emerald-600'
                  }`}
                  >
                    {item.status === 'done' ? (
                      <CheckSquare size={16} className="text-emerald-500" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-xs font-bold uppercase tracking-wide mr-2 ${
                      darkMode ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {item.agent}
                  </span>
                  <span
                    className={`text-sm ${
                      item.status === 'done' ? 'line-through' : ''
                    } ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    {item.improvement}
                  </span>
                </div>

                {/* Delete */}
                <button
                  onClick={() => onDeleteImprovement(item.id)}
                  className={`flex-shrink-0 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity ${
                    darkMode
                      ? 'text-gray-700 hover:text-red-500'
                      : 'text-gray-300 hover:text-red-400'
                  }`}
                  title={t('journal.delete', lang)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

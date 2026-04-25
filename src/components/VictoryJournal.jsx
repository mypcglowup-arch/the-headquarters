import { useState, useEffect } from 'react';
import { X, Trophy, DollarSign, Tag, Sparkles, Trash2 } from 'lucide-react';
import { VICTORY_CATEGORIES, getCategoryConfig, computeROI } from '../utils/victories.js';

// ════════════════════════════════════════════════════════════════════════════
// MODAL — création d'une victoire
// ════════════════════════════════════════════════════════════════════════════
export function VictoryModal({ darkMode, lang = 'fr', annualGoal = 50000, onClose, onSave }) {
  const [description, setDescription] = useState('');
  const [valueMonthly, setValueMonthly] = useState('');
  const [categoryId, setCategoryId] = useState('client-signed');
  const [error, setError] = useState(null);

  const numericValue = parseFloat(valueMonthly) || 0;
  const roi = computeROI(numericValue, annualGoal);
  const showROI = numericValue > 0;
  const cat = getCategoryConfig(categoryId);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSubmit() {
    const desc = description.trim();
    if (!desc) { setError(lang === 'fr' ? 'Une description est requise' : 'Description required'); return; }
    onSave({
      description: desc,
      value_monthly: numericValue,
      category: categoryId,
      roi_annual: roi.annual,
      roi_percent: roi.goalPercent,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-modal-backdrop"
      style={{ background: 'rgba(3,7,18,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[92vh] overflow-hidden rounded-2xl flex flex-col animate-modal-in"
        style={{
          background: darkMode ? 'rgba(20,20,30,0.96)' : '#ffffff',
          border: darkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(15,23,42,0.08)',
          boxShadow: `0 24px 80px -20px rgba(${cat.rgb}, 0.45), 0 0 0 1px rgba(${cat.rgb}, 0.18)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <div className="p-2 rounded-lg" style={{ background: `rgba(${cat.rgb}, 0.16)`, color: `rgba(${cat.rgb}, 1)` }}>
            <Trophy size={18} strokeWidth={2.25} />
          </div>
          <div className="flex-1">
            <h2 className={`font-display font-bold text-[20px] leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {lang === 'fr' ? 'Nouvelle victoire' : 'New victory'}
            </h2>
            <div className={`text-[12px] ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              {lang === 'fr' ? 'Loggue ce qui compte. Ça construit ton track record.' : 'Log what matters. It builds your track record.'}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg tap-target ${darkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Description */}
          <div>
            <Label darkMode={darkMode}>
              {lang === 'fr' ? 'Description' : 'Description'}
            </Label>
            <input
              type="text"
              autoFocus
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError(null); }}
              placeholder={lang === 'fr' ? 'Ex: Signé Dubé — Bouclier 5 Étoiles' : 'Ex: Signed Dubé — Shield deal'}
              className={`w-full px-3 py-2.5 rounded-lg text-[14px] outline-none transition-all ${darkMode ? 'bg-gray-900 border border-white/10 text-white placeholder:text-gray-500 focus:border-white/20' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300'}`}
            />
            {error && <div className="text-[12px] text-red-400 mt-1">{error}</div>}
          </div>

          {/* Value */}
          <div>
            <Label darkMode={darkMode} icon={<DollarSign size={11} />}>
              {lang === 'fr' ? 'Valeur mensuelle ($) — optionnel' : 'Monthly value ($) — optional'}
            </Label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="50"
              value={valueMonthly}
              onChange={(e) => setValueMonthly(e.target.value)}
              placeholder="0"
              className={`w-full px-3 py-2.5 rounded-lg text-[14px] outline-none transition-all ${darkMode ? 'bg-gray-900 border border-white/10 text-white placeholder:text-gray-500 focus:border-white/20' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300'}`}
            />
          </div>

          {/* Category */}
          <div>
            <Label darkMode={darkMode} icon={<Tag size={11} />}>
              {lang === 'fr' ? 'Catégorie' : 'Category'}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {VICTORY_CATEGORIES.map((c) => {
                const active = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all tap-target"
                    style={{
                      background: active ? `rgba(${c.rgb}, 0.18)` : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
                      color: active ? `rgba(${c.rgb}, 1)` : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
                      boxShadow: active ? `0 0 0 1px rgba(${c.rgb}, 0.36)` : 'none',
                    }}
                  >
                    {c.label[lang] || c.label.fr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live ROI preview — only if value > 0 */}
          {showROI && (
            <div
              className="rounded-xl p-4 animate-bubble-in"
              style={{
                background: `rgba(${cat.rgb}, 0.08)`,
                border: `1px solid rgba(${cat.rgb}, 0.22)`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={13} style={{ color: `rgba(${cat.rgb}, 1)` }} />
                <div className={`text-[11px] uppercase tracking-wider font-semibold`} style={{ color: `rgba(${cat.rgb}, 1)` }}>
                  {lang === 'fr' ? 'Projection ROI' : 'ROI projection'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <ROIStat
                  darkMode={darkMode}
                  label={lang === 'fr' ? 'Annuel' : 'Annual'}
                  value={`$${roi.annual.toLocaleString()}`}
                  rgb={cat.rgb}
                />
                <ROIStat
                  darkMode={darkMode}
                  label={lang === 'fr' ? 'Objectif' : 'Goal'}
                  value={`${roi.goalPercent}%`}
                  rgb={cat.rgb}
                />
                <ROIStat
                  darkMode={darkMode}
                  label={lang === 'fr' ? 'MRR +' : 'MRR +'}
                  value={`$${roi.mrrImpact.toLocaleString()}`}
                  rgb={cat.rgb}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-4 border-t shrink-0"
          style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <button
            onClick={onClose}
            className={`px-3 py-2 rounded-lg text-[12.5px] font-semibold tap-target ${darkMode ? 'text-gray-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold tap-target ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: `rgba(${cat.rgb}, 0.22)`,
              color: `rgba(${cat.rgb}, 1)`,
              boxShadow: `0 0 0 1px rgba(${cat.rgb}, 0.42)`,
            }}
          >
            <Trophy size={13} />
            {lang === 'fr' ? 'Enregistrer la victoire' : 'Save victory'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children, darkMode, icon }) {
  return (
    <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
      {icon}
      {children}
    </div>
  );
}

function ROIStat({ label, value, rgb, darkMode }) {
  return (
    <div className="flex flex-col">
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5`} style={{ color: `rgba(${rgb}, 0.7)` }}>
        {label}
      </div>
      <div className={`font-display font-bold text-[18px] leading-none`} style={{ color: `rgba(${rgb}, 1)` }}>
        {value}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TIMELINE — composable card list
// ════════════════════════════════════════════════════════════════════════════
export function VictoryTimeline({ victories, darkMode, lang = 'fr', onDelete, emptyMessage }) {
  if (!victories || victories.length === 0) {
    return (
      <div className={`text-center py-10 rounded-xl border-2 border-dashed ${darkMode ? 'border-white/10 text-gray-500' : 'border-slate-200 text-slate-400'}`}>
        <Trophy size={28} strokeWidth={1.5} className="mx-auto mb-2 opacity-50" />
        <div className="text-[13px]">
          {emptyMessage || (lang === 'fr' ? 'Aucune victoire enregistrée — encore.' : 'No victory logged — yet.')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {victories.map((v) => (
        <VictoryCard
          key={v.id}
          victory={v}
          darkMode={darkMode}
          lang={lang}
          onDelete={onDelete ? () => onDelete(v.id) : null}
        />
      ))}
    </div>
  );
}

function VictoryCard({ victory, darkMode, lang, onDelete }) {
  const cat = getCategoryConfig(victory.category);
  const value = Number(victory.value_monthly) || 0;
  const showValue = value > 0;
  const dateStr = victory.created_at
    ? new Date(victory.created_at).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div
      className="group rounded-xl p-3.5 transition-all animate-card-in flex items-start gap-3"
      style={{
        background: darkMode ? 'rgba(17,24,39,0.6)' : '#ffffff',
        border: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)',
        borderLeft: `3px solid rgba(${cat.rgb}, 0.85)`,
      }}
    >
      {/* Category icon */}
      <div
        className="shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{
          background: `rgba(${cat.rgb}, 0.12)`,
          color: `rgba(${cat.rgb}, 1)`,
        }}
      >
        <Trophy size={16} strokeWidth={2.25} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className={`font-display font-semibold text-[14px] leading-snug ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {victory.description}
          </div>
          {showValue && (
            <div
              className="shrink-0 font-display font-bold text-[14px] tabular-nums"
              style={{ color: `rgba(${cat.rgb}, 1)` }}
            >
              ${value.toLocaleString()}<span className="text-[10px] opacity-70">/mo</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
            style={{ background: `rgba(${cat.rgb}, 0.12)`, color: `rgba(${cat.rgb}, 0.95)` }}
          >
            {cat.label[lang] || cat.label.fr}
          </span>
          <span className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>{dateStr}</span>
          {showValue && victory.roi_annual && (
            <span className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              · {lang === 'fr' ? 'projection annuelle' : 'projected annual'} ${Number(victory.roi_annual).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {onDelete && (
        <button
          onClick={onDelete}
          className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md ${darkMode ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
          aria-label={lang === 'fr' ? 'Supprimer' : 'Delete'}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

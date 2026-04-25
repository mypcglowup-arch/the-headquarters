import { useState, useMemo } from 'react';
import { Trophy, Plus, Flame, TrendingUp, Target } from 'lucide-react';
import { VictoryModal, VictoryTimeline } from './VictoryJournal.jsx';
import {
  VICTORY_CATEGORIES,
  totalMonthlyValue,
  totalAnnualValue,
  thisMonthCount,
  filterVictoriesByCategory,
  filterVictoriesByPeriod,
  computeROI,
} from '../utils/victories.js';

const PERIOD_FILTERS = [
  { id: null, days: null, label: { fr: 'Tout',     en: 'All' } },
  { id: '7d', days: 7,    label: { fr: '7 jours',  en: '7 days' } },
  { id: '30d', days: 30,  label: { fr: '30 jours', en: '30 days' } },
  { id: '90d', days: 90,  label: { fr: '90 jours', en: '90 days' } },
];

export default function VictoriesScreen({
  darkMode,
  lang = 'fr',
  victories = [],
  annualGoal = 50000,
  onAddVictory,
  onDeleteVictory,
}) {
  const [showModal, setShowModal] = useState(false);
  const [periodId, setPeriodId] = useState(null);
  const [categoryId, setCategoryId] = useState(null);

  const sorted = useMemo(
    () => [...victories].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [victories]
  );

  const period = PERIOD_FILTERS.find((p) => p.id === periodId);
  const filtered = useMemo(() => {
    let list = sorted;
    list = filterVictoriesByPeriod(list, period?.days);
    list = filterVictoriesByCategory(list, categoryId);
    return list;
  }, [sorted, period, categoryId]);

  // Stats — computed on ALL victories (header is global, not filtered)
  const totalMonthly = totalMonthlyValue(victories);
  const totalAnnual  = totalAnnualValue(victories);
  const thisMonth    = thisMonthCount(victories);
  const goalROI      = computeROI(totalMonthly, annualGoal);

  function handleSave(victoryData) {
    onAddVictory?.(victoryData);
    setShowModal(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-screen-in"
      style={{ background: darkMode ? undefined : '#F5F4F0' }}>
      <div className="flex-1 overflow-y-auto scroll-fade px-4 md:px-6 lg:px-8 py-6 md:py-8 pb-24">
        {/* Header */}
        <div className="max-w-5xl mx-auto mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-3">
              <Trophy size={22} className={darkMode ? 'text-amber-400' : 'text-amber-600'} strokeWidth={2} />
              <h1 className={`font-display font-bold text-[28px] md:text-[34px] tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {lang === 'fr' ? 'Journal de victoires' : 'Victory journal'}
              </h1>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold tap-target shrink-0"
              style={{
                background: 'rgba(16,185,129, 0.20)',
                color: 'rgba(16,185,129, 1)',
                boxShadow: '0 0 0 1px rgba(16,185,129, 0.42)',
              }}
            >
              <Plus size={14} />
              {lang === 'fr' ? 'Victoire' : 'Victory'}
            </button>
          </div>
          <p className={`text-[14px] ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            {lang === 'fr'
              ? 'Track ton momentum. Chaque victoire compte — le ROI s\'accumule.'
              : 'Track your momentum. Every victory counts — ROI compounds.'}
          </p>
        </div>

        {/* Stats hero */}
        <div className="max-w-5xl mx-auto mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              darkMode={darkMode}
              icon={<Trophy size={14} />}
              label={lang === 'fr' ? 'Total victoires' : 'Total victories'}
              value={String(victories.length)}
              tone="amber"
            />
            <StatCard
              darkMode={darkMode}
              icon={<Flame size={14} />}
              label={lang === 'fr' ? 'Ce mois-ci' : 'This month'}
              value={String(thisMonth)}
              tone="orange"
              accent
            />
            <StatCard
              darkMode={darkMode}
              icon={<TrendingUp size={14} />}
              label={lang === 'fr' ? 'MRR cumulé' : 'Cumulative MRR'}
              value={`$${totalMonthly.toLocaleString()}/mo`}
              tone="emerald"
            />
            <StatCard
              darkMode={darkMode}
              icon={<Target size={14} />}
              label={lang === 'fr' ? `% objectif annuel` : `% annual goal`}
              value={`${goalROI.goalPercent}%`}
              sublabel={`${totalAnnual.toLocaleString()}$ / ${annualGoal.toLocaleString()}$`}
              tone="indigo"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="max-w-5xl mx-auto mb-4 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_FILTERS.map((p) => (
              <FilterChip
                key={p.id || 'all'}
                active={periodId === p.id}
                onClick={() => setPeriodId(p.id)}
                darkMode={darkMode}
              >
                {p.label[lang] || p.label.fr}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={!categoryId} onClick={() => setCategoryId(null)} darkMode={darkMode}>
              {lang === 'fr' ? 'Toutes catégories' : 'All categories'}
            </FilterChip>
            {VICTORY_CATEGORIES.map((c) => (
              <FilterChip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                darkMode={darkMode}
                accentRgb={c.rgb}
              >
                {c.label[lang] || c.label.fr}
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="max-w-5xl mx-auto">
          <div className={`text-[11px] uppercase tracking-wider mb-2 font-semibold ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
            {filtered.length === victories.length
              ? (lang === 'fr' ? `${filtered.length} victoire${filtered.length > 1 ? 's' : ''}` : `${filtered.length} victor${filtered.length > 1 ? 'ies' : 'y'}`)
              : (lang === 'fr' ? `${filtered.length} sur ${victories.length}` : `${filtered.length} of ${victories.length}`)}
          </div>
          <VictoryTimeline
            victories={filtered}
            darkMode={darkMode}
            lang={lang}
            onDelete={onDeleteVictory}
            emptyMessage={
              victories.length === 0
                ? (lang === 'fr' ? 'Encore aucune victoire. Logge ta première — peu importe la taille.' : 'No victory yet. Log your first — no matter how small.')
                : (lang === 'fr' ? 'Aucune victoire avec ces filtres.' : 'No victory matches these filters.')
            }
          />
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <VictoryModal
          darkMode={darkMode}
          lang={lang}
          annualGoal={annualGoal}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sublabel, darkMode, tone = 'emerald', accent = false }) {
  const TONES = {
    emerald: '16,185,129',
    indigo:  '99,102,241',
    amber:   '245,158,11',
    orange:  '249,115,22',
  };
  const rgb = TONES[tone] || TONES.emerald;
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: accent
          ? `linear-gradient(135deg, rgba(${rgb}, 0.18), rgba(${rgb}, 0.06))`
          : (darkMode ? 'rgba(17,24,39,0.6)' : '#ffffff'),
        border: accent
          ? `1px solid rgba(${rgb}, 0.32)`
          : (darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)'),
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold mb-1.5"
        style={{ color: `rgba(${rgb}, ${accent ? 1 : 0.85})` }}
      >
        {icon}
        {label}
      </div>
      <div
        className="font-display font-bold text-[24px] leading-none tabular-nums"
        style={{ color: accent ? `rgba(${rgb}, 1)` : (darkMode ? '#ffffff' : '#0f172a') }}
      >
        {value}
      </div>
      {sublabel && (
        <div className={`text-[11px] mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ── Filter chip ─────────────────────────────────────────────────────────────
function FilterChip({ children, active, onClick, darkMode, accentRgb }) {
  const rgb = accentRgb || '99,102,241';
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold tracking-tight transition-all tap-target"
      style={{
        background: active
          ? `rgba(${rgb}, 0.18)`
          : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
        color: active
          ? `rgba(${rgb}, 1)`
          : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
        boxShadow: active ? `0 0 0 1px rgba(${rgb}, 0.32)` : 'none',
      }}
    >
      {children}
    </button>
  );
}

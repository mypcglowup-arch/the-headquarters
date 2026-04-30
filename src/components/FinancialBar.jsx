import { t } from '../i18n.js';

const METRIC_ACCENTS = [
  { from: 'rgba(99,102,241,0.12)', to: 'rgba(99,102,241,0.03)', line: '99,102,241' },  // MRR — indigo
  { from: 'rgba(59,130,246,0.12)', to: 'rgba(59,130,246,0.03)', line: '59,130,246' },  // YTD — blue
  { from: 'rgba(16,185,129,0.12)', to: 'rgba(16,185,129,0.03)', line: '16,185,129' },  // Goal — emerald
];

export default function FinancialBar({ data, darkMode, lang = 'fr' }) {
  const { monthlyRevenue, retainers, annualGoal: annualGoalRaw } = data;
  const annualGoal = Number(annualGoalRaw) || 50000;
  const totalRevenue = monthlyRevenue.reduce((s, m) => s + (m.revenue || 0), 0);
  const totalMRR     = retainers.reduce((s, r) => s + (r.amount || 0), 0);
  const goalPct      = annualGoal > 0 ? Math.min(100, Math.round((totalRevenue / annualGoal) * 100)) : 0;

  const stats = [
    { label: t('fin.mrr',  lang), value: totalMRR > 0     ? `$${totalMRR.toLocaleString()}` : '—' },
    { label: t('fin.ytd',  lang), value: totalRevenue > 0  ? `$${totalRevenue.toLocaleString()}` : '—' },
    { label: t('fin.goal', lang), value: `${goalPct}%`, highlight: goalPct >= 50 },
  ];

  return (
    <div className="w-full max-w-3xl flex overflow-hidden rounded-2xl"
      style={{
        border: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
        background: darkMode ? 'rgba(10,14,24,0.6)' : '#E2E0DA',
        backdropFilter: 'blur(12px)',
      }}>
      {stats.map((s, i) => {
        const accent = METRIC_ACCENTS[i];
        return (
          <div
            key={s.label}
            className="flex-1 relative flex flex-col items-center py-4 px-3"
            style={{
              background: darkMode
                ? `linear-gradient(180deg, ${accent.from} 0%, ${accent.to} 100%)`
                : `linear-gradient(180deg, rgba(${accent.line},0.06) 0%, transparent 100%)`,
              borderRight: i < stats.length - 1
                ? darkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.06)'
                : 'none',
            }}
          >
            <span
              className="font-display font-semibold text-lg leading-none mb-1"
              style={{ color: s.highlight ? `rgb(${METRIC_ACCENTS[2].line})` : darkMode ? '#f1f5f9' : '#1A1A1A' }}
            >
              {s.value}
            </span>
            <span className="text-[11px] font-medium tracking-wide"
              style={{ color: `rgba(${accent.line}, 0.7)` }}>
              {s.label}
            </span>
            {/* Colored accent bottom line */}
            <div
              className="absolute bottom-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, rgba(${accent.line}, 0.5), transparent)` }}
            />
          </div>
        );
      })}
    </div>
  );
}

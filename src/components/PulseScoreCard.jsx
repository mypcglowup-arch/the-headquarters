import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const DIM_CONFIG = {
  fr: [
    { key: 'energie',  label: 'Énergie',   color: '251,146,60' },   // orange
    { key: 'momentum', label: 'Momentum',  color: '99,102,241' },   // indigo
    { key: 'pipeline', label: 'Pipeline',  color: '59,130,246' },   // blue
    { key: 'finances', label: 'Finances',  color: '16,185,129' },   // emerald
  ],
  en: [
    { key: 'energie',  label: 'Energy',    color: '251,146,60' },
    { key: 'momentum', label: 'Momentum',  color: '99,102,241' },
    { key: 'pipeline', label: 'Pipeline',  color: '59,130,246' },
    { key: 'finances', label: 'Finances',  color: '16,185,129' },
  ],
};

function scoreColor(score) {
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score, lang) {
  if (lang === 'fr') {
    if (score >= 75) return 'En forme';
    if (score >= 50) return 'Solide';
    if (score >= 30) return 'À surveiller';
    return 'Attention';
  }
  if (score >= 75) return 'Strong';
  if (score >= 50) return 'Solid';
  if (score >= 30) return 'Watch it';
  return 'Critical';
}

export default function PulseScoreCard({ pulse, darkMode, lang = 'fr', onDismiss }) {
  const [progress, setProgress] = useState(0);
  const DURATION = 4000;

  useEffect(() => {
    const start = Date.now();
    let raf;
    function tick() {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / DURATION) * 100);
      setProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(tick);
      } else {
        onDismiss();
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDismiss]);

  const dims = DIM_CONFIG[lang] || DIM_CONFIG.fr;
  const color = scoreColor(pulse.overall);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{ background: 'transparent' }}
    >
      <div
        className="pointer-events-auto rounded-2xl px-6 py-5 w-80 animate-modal-slide"
        style={{
          background: darkMode ? 'rgba(8,12,24,0.92)' : 'rgba(255,255,255,0.95)',
          border: `1px solid rgba(${dims[0].color},0.2)`,
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(20px)',
        }}
        onClick={onDismiss}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
              style={{ color: 'rgba(148,163,184,0.5)' }}>
              {lang === 'fr' ? 'Business Pulse' : 'Business Pulse'}
            </p>
            <p className="text-xs font-medium" style={{ color: darkMode ? '#94a3b8' : '#475569' }}>
              {lang === 'fr' ? 'Aujourd\'hui' : 'Today'}
            </p>
          </div>
          <div className="text-right">
            <span className="font-display text-3xl font-black leading-none" style={{ color }}>
              {pulse.overall}
            </span>
            <span className="text-sm font-bold ml-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>/100</span>
            <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color }}>
              {scoreLabel(pulse.overall, lang)}
            </p>
          </div>
        </div>

        {/* Dimensions */}
        <div className="space-y-2.5 mb-4">
          {dims.map((d) => {
            const val = pulse[d.key] || 0;
            return (
              <div key={d.key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-medium" style={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                    {d.label}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: `rgb(${d.color})` }}>
                    {val}/10
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${val * 10}%`, background: `rgb(${d.color})` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Auto-dismiss progress */}
        <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${progress}%`, background: color, transition: 'width 0.1s linear' }}
          />
        </div>
        <p className="text-center text-[10px] mt-2" style={{ color: 'rgba(148,163,184,0.3)' }}>
          {lang === 'fr' ? 'Cliquer pour fermer' : 'Click to dismiss'}
        </p>
      </div>
    </div>,
    document.body
  );
}

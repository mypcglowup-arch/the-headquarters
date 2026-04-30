import { createPortal } from 'react-dom';
import { X, Download, Loader, TrendingUp } from 'lucide-react';
import { loadHistory } from '../utils/sessionHistory.js';
import { loadWins } from '../utils/wins.js';

function getWeekSessions() {
  const history = loadHistory();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return history.filter((s) => new Date(s.date).getTime() > cutoff);
}

function getWeekWins() {
  const wins = loadWins();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return wins.filter((w) => new Date(w.date).getTime() > cutoff);
}

function formatReportText(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-2" />;
    // Bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="text-sm leading-relaxed">
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )}
      </p>
    );
  });
}

export default function WeeklyReport({ reportText, dashboard, streak, sessionCount, darkMode, lang = 'fr', onClose }) {
  const weekSessions = getWeekSessions();
  const weekWins = getWeekWins();
  const totalMRR = (dashboard?.retainers || []).reduce((s, r) => s + (r.amount || 0), 0);
  const annualGoal = Number(dashboard?.annualGoal) || 50000;
  const ytdRevenue = (dashboard?.monthlyRevenue || []).reduce((s, m) => s + (m.revenue || 0), 0);
  const goalPct = annualGoal > 0 ? Math.min(100, Math.round((ytdRevenue / annualGoal) * 100)) : 0;

  const weekLabel = (() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    return monday.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
  })();

  function exportPDF() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const reportHtml = document.getElementById('weekly-report-content')?.innerHTML || '';
    printWindow.document.write(`<!DOCTYPE html><html><head>
      <title>Weekly Report — ${weekLabel}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #111; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        h2 { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 24px; font-weight: 500; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; text-align: center; }
        .kpi-val { font-size: 24px; font-weight: 800; color: #111; }
        .kpi-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
        .section { margin-bottom: 24px; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
        p { font-size: 14px; line-height: 1.6; margin: 0 0 8px; }
        .win-item { padding: 8px 12px; border-left: 3px solid #f97316; margin-bottom: 6px; font-size: 13px; background: #fff7ed; }
        @media print { body { padding: 20px; } }
      </style>
    </head><body>
      <h1>📊 ${lang === 'fr' ? 'RAPPORT HEBDOMADAIRE' : 'WEEKLY REPORT'}</h1>
      <h2>${lang === 'fr' ? 'Semaine du' : 'Week of'} ${weekLabel} — NT Solutions</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-val">$${totalMRR.toLocaleString()}</div><div class="kpi-label">MRR</div></div>
        <div class="kpi"><div class="kpi-val">${weekSessions.length}</div><div class="kpi-label">${lang === 'fr' ? 'Sessions' : 'Sessions'}</div></div>
        <div class="kpi"><div class="kpi-val">${weekWins.length}</div><div class="kpi-label">${lang === 'fr' ? 'Victoires' : 'Wins'}</div></div>
        <div class="kpi"><div class="kpi-val">${goalPct}%</div><div class="kpi-label">${lang === 'fr' ? 'Objectif' : 'Goal'}</div></div>
      </div>
      ${reportText ? `<div class="section"><div class="section-title">${lang === 'fr' ? 'ANALYSE' : 'ANALYSIS'}</div>${reportText.split('\n').filter(Boolean).map(l => `<p>${l.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`).join('')}</div>` : ''}
      ${weekWins.length > 0 ? `<div class="section"><div class="section-title">${lang === 'fr' ? 'VICTOIRES DE LA SEMAINE' : 'WINS THIS WEEK'}</div>${weekWins.map(w => `<div class="win-item">${w.text}</div>`).join('')}</div>` : ''}
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
  }

  const kpis = [
    { label: 'MRR', value: `$${totalMRR.toLocaleString()}` },
    { label: lang === 'fr' ? 'Sessions semaine' : 'Sessions this week', value: weekSessions.length },
    { label: lang === 'fr' ? 'Victoires semaine' : 'Wins this week', value: weekWins.length },
    { label: lang === 'fr' ? 'Objectif annuel' : 'Annual goal', value: `${goalPct}%` },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl"
        style={{
          background: darkMode ? 'rgba(6,10,20,0.98)' : 'rgba(255,255,255,0.99)',
          border: '1px solid rgba(249,115,22,0.25)',
          boxShadow: '0 0 80px rgba(249,115,22,0.08), 0 32px 64px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Orange top bar */}
        <div className="h-1 rounded-t-2xl" style={{ background: 'linear-gradient(90deg, rgba(249,115,22,0.9), rgba(234,88,12,0.3))' }} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b"
          style={{ borderColor: 'rgba(249,115,22,0.1)' }}>
          <div>
            <h2 className="font-display font-black text-lg tracking-tight" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
              <TrendingUp size={16} className="inline mr-2" style={{ verticalAlign: 'middle', color: 'rgba(212,175,55,0.9)' }} />{lang === 'fr' ? 'RAPPORT HEBDOMADAIRE' : 'WEEKLY REPORT'}
            </h2>
            <p className="text-xs mt-1 uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>
              {lang === 'fr' ? 'Semaine du' : 'Week of'} {weekLabel} · NT Solutions
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: 'rgba(249,115,22,0.1)',
                border: '1px solid rgba(249,115,22,0.25)',
                color: 'rgba(249,115,22,0.8)',
              }}
            >
              <Download size={11} />
              {lang === 'fr' ? 'Exporter PDF' : 'Export PDF'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full"
              style={{ color: 'rgba(148,163,184,0.4)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div id="weekly-report-content" className="px-6 py-5 space-y-5">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map((kpi, i) => (
              <div key={i} className="rounded-xl p-3 text-center"
                style={{
                  background: darkMode ? 'rgba(249,115,22,0.05)' : 'rgba(249,115,22,0.04)',
                  border: '1px solid rgba(249,115,22,0.15)',
                }}>
                <div className="text-2xl font-black" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
                  {kpi.value}
                </div>
                <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>

          {/* Goal progress bar */}
          <div>
            <div className="flex justify-between text-[11px] mb-1.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
              <span className="uppercase tracking-widest">{lang === 'fr' ? 'Progression objectif annuel' : 'Annual goal progress'}</span>
              <span>${ytdRevenue.toLocaleString()} / ${annualGoal.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(249,115,22,0.1)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${goalPct}%`, background: 'linear-gradient(90deg, rgba(249,115,22,0.8), rgba(234,88,12,0.9))' }} />
            </div>
          </div>

          {/* AI Narrative */}
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'rgba(249,115,22,0.5)' }}>
              {lang === 'fr' ? '— ANALYSE STRATÉGIQUE' : '— STRATEGIC ANALYSIS'}
            </p>
            {reportText ? (
              <div className="space-y-2" style={{ color: darkMode ? '#cbd5e1' : '#374151' }}>
                {formatReportText(reportText)}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-4">
                <Loader size={14} className="animate-spin" style={{ color: 'rgba(249,115,22,0.6)' }} />
                <span className="text-sm" style={{ color: 'rgba(148,163,184,0.4)' }}>
                  {lang === 'fr' ? 'Génération du briefing...' : 'Generating briefing...'}
                </span>
              </div>
            )}
          </div>

          {/* Wins this week */}
          {weekWins.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'rgba(249,115,22,0.5)' }}>
                {lang === 'fr' ? `— VICTOIRES CETTE SEMAINE (${weekWins.length})` : `— WINS THIS WEEK (${weekWins.length})`}
              </p>
              <div className="space-y-2">
                {weekWins.slice(0, 5).map((win) => (
                  <div key={win.id} className="flex items-start gap-3 px-3 py-2 rounded-lg"
                    style={{
                      background: darkMode ? 'rgba(249,115,22,0.05)' : 'rgba(249,115,22,0.04)',
                      border: '1px solid rgba(249,115,22,0.1)',
                    }}>
                    <span style={{ color: 'rgba(249,115,22,0.6)', fontSize: 12 }}>✦</span>
                    <span className="text-sm flex-1" style={{ color: darkMode ? '#94a3b8' : '#475569' }}>{win.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sessions list */}
          {weekSessions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'rgba(249,115,22,0.5)' }}>
                {lang === 'fr' ? `— SESSIONS CETTE SEMAINE (${weekSessions.length})` : `— SESSIONS THIS WEEK (${weekSessions.length})`}
              </p>
              <div className="space-y-1.5">
                {weekSessions.map((s) => {
                  const d = new Date(s.date);
                  const label = d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
                  const action = s.summary?.consensusAction || s.consensusLine;
                  return (
                    <div key={s.id} className="flex items-start gap-3 text-sm" style={{ color: darkMode ? '#64748b' : '#94a3b8' }}>
                      <span className="shrink-0 text-[11px] font-mono pt-0.5">{label}</span>
                      {action && <span className="flex-1 text-xs" style={{ color: darkMode ? '#94a3b8' : '#64748b' }}>{action}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Close CTA */}
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all mt-2"
            style={{
              background: 'linear-gradient(135deg, rgba(249,115,22,0.85), rgba(234,88,12,0.85))',
              color: 'white',
            }}
          >
            {lang === 'fr' ? 'Lancer la semaine →' : 'Start the week →'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

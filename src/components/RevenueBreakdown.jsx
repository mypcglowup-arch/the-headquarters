import { useMemo } from 'react';
import { Crown, Zap, Repeat, Clock } from 'lucide-react';

function formatDate(iso, lang) {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeDays(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

const RECENT_ONE_TIME_DAYS = 90;

function mondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // back to Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function firstOfCurrentMonth() {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Reads hq_focus_log and returns { weeklyMinutes, monthlyMinutes } per clientName.
function loadClientHours() {
  try {
    const raw = JSON.parse(localStorage.getItem('hq_focus_log') || '[]');
    if (!Array.isArray(raw)) return {};
    const weekStart  = mondayOfCurrentWeek();
    const monthStart = firstOfCurrentMonth();
    const byClient = {};
    for (const entry of raw) {
      if (!entry?.clientName) continue; // skip General/Admin + legacy entries
      const ts = Number(entry.date) || 0;
      const mins = Number(entry.duration) || 0;
      if (mins <= 0) continue;
      const key = entry.clientName;
      if (!byClient[key]) byClient[key] = { weeklyMinutes: 0, monthlyMinutes: 0 };
      if (ts >= monthStart) byClient[key].monthlyMinutes += mins;
      if (ts >= weekStart)  byClient[key].weeklyMinutes  += mins;
    }
    return byClient;
  } catch { return {}; }
}

function fmtHours(minutes) {
  if (!minutes) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${m}` : `${h}h`;
}

export default function RevenueBreakdown({ retainers = [], oneTimeRevenues = [], c, lang = 'fr' }) {
  const clientHours = useMemo(() => loadClientHours(), [retainers, oneTimeRevenues]);

  const rows = useMemo(() => {
    const retainerRows = (retainers || [])
      .filter((r) => r && Number(r.amount) > 0 && (r.name || '').trim())
      .map((r) => {
        const hrs = clientHours[r.name] || { weeklyMinutes: 0, monthlyMinutes: 0 };
        return {
          key:            `retainer-${r.id}`,
          kind:           'retainer',
          name:           r.name,
          amount:         Number(r.amount),
          startDate:      r.startedAt || null,
          subLabel:       lang === 'fr' ? 'depuis' : 'since',
          weeklyMinutes:  hrs.weeklyMinutes,
          monthlyMinutes: hrs.monthlyMinutes,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const cutoff = Date.now() - RECENT_ONE_TIME_DAYS * 86_400_000;
    const oneTimeRows = (oneTimeRevenues || [])
      .filter((e) => {
        if (!e || !Number(e.amount) || Number(e.amount) <= 0) return false;
        const t = new Date(e.date || 0).getTime();
        return !isNaN(t) && t >= cutoff;
      })
      .map((e) => ({
        key:        `onetime-${e.id}`,
        kind:       'one-time',
        name:       e.clientName || (lang === 'fr' ? 'Client inconnu' : 'Unknown client'),
        amount:     Number(e.amount),
        startDate:  e.date,
        subLabel:   lang === 'fr' ? 'le' : 'on',
      }))
      .sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

    return [...retainerRows, ...oneTimeRows];
  }, [retainers, oneTimeRevenues, lang]);

  const totalMRR = rows
    .filter((r) => r.kind === 'retainer')
    .reduce((s, r) => s + r.amount, 0);
  const recentOneTime = rows
    .filter((r) => r.kind === 'one-time')
    .reduce((s, r) => s + r.amount, 0);

  const accent = 'rgba(251,191,36,0.95)'; // gold — revenue / wealth
  const accentSoft = 'rgba(251,191,36,0.15)';
  const accentBorder = 'rgba(251,191,36,0.3)';

  return (
    <div style={{ background: c.bg1, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: accentSoft, border: `1px solid ${accentBorder}`,
          }}>
            <Crown size={14} style={{ color: accent }} />
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.text2, margin: 0 }}>
              {lang === 'fr' ? 'Revenus par client' : 'Revenue by client'}
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: c.text0, margin: 0, marginTop: 2 }}>
              {rows.length === 0
                ? (lang === 'fr' ? 'Aucun client' : 'No clients')
                : `${rows.length} ${lang === 'fr' ? (rows.length > 1 ? 'clients' : 'client') : (rows.length > 1 ? 'clients' : 'client')}`}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <div style={{ textAlign: 'right' }}>
            {totalMRR > 0 && (
              <div style={{ fontSize: 11, fontWeight: 700, color: c.text0 }}>
                ${totalMRR.toLocaleString()}<span style={{ color: c.text2, fontWeight: 500 }}>/mo</span>
              </div>
            )}
            {recentOneTime > 0 && (
              <div style={{ fontSize: 10, color: c.text2 }}>
                + ${recentOneTime.toLocaleString()} {lang === 'fr' ? 'one-time' : 'one-time'} {lang === 'fr' ? '(90 j)' : '(90d)'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '28px 16px',
          border: `2px dashed ${c.border}`, borderRadius: 12,
        }}>
          <p style={{ fontSize: 13, color: c.text2, margin: 0 }}>
            {lang === 'fr'
              ? 'Aucun client pour le moment. Mentionne une signature ou un paiement en session — QG capture automatiquement.'
              : 'No clients yet. Mention a signature or payment in session — QG captures automatically.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, idx) => {
            const rank = idx + 1;
            const isRetainer = row.kind === 'retainer';
            const daysAgo = relativeDays(row.startDate);
            const typeRgb = isRetainer ? '16,185,129' : '251,191,36';
            const TypeIcon = isRetainer ? Repeat : Zap;
            return (
              <div
                key={row.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  background: c.bg2 || 'transparent',
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Rank badge */}
                <div style={{
                  flexShrink: 0,
                  width: 22, height: 22, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: rank === 1 ? accentSoft : (c.bg1 || 'transparent'),
                  border: `1px solid ${rank === 1 ? accentBorder : c.border}`,
                  fontSize: 10, fontWeight: 800,
                  color: rank === 1 ? accent : c.text2,
                }}>
                  {rank}
                </div>

                {/* Name + type */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 700, color: c.text0,
                      margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {row.name}
                    </p>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '1px 6px', borderRadius: 4,
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      background: `rgba(${typeRgb},0.12)`,
                      color: `rgba(${typeRgb},0.95)`,
                      border: `1px solid rgba(${typeRgb},0.28)`,
                    }}>
                      <TypeIcon size={8} />
                      {isRetainer
                        ? (lang === 'fr' ? 'Retainer' : 'Retainer')
                        : (lang === 'fr' ? 'One-time' : 'One-time')}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: c.text2, margin: 0, marginTop: 2 }}>
                    {row.subLabel} {formatDate(row.startDate, lang)}
                    {daysAgo !== null && daysAgo >= 0 && (
                      <span style={{ marginLeft: 6, opacity: 0.7 }}>
                        · {lang === 'fr'
                          ? (daysAgo === 0 ? "aujourd'hui" : `il y a ${daysAgo} j`)
                          : (daysAgo === 0 ? 'today' : `${daysAgo}d ago`)}
                      </span>
                    )}
                  </p>
                  {/* Hours invested + real hourly rate (retainers only) */}
                  {isRetainer && (row.weeklyMinutes > 0 || row.monthlyMinutes > 0) && (() => {
                    const monthlyHours = row.monthlyMinutes / 60;
                    const hourlyRate = monthlyHours >= 1
                      ? Math.round(row.amount / monthlyHours)
                      : null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: c.text1 }}>
                          <Clock size={9} style={{ opacity: 0.7 }} />
                          {fmtHours(row.weeklyMinutes)} {lang === 'fr' ? 'cette semaine' : 'this week'}
                        </span>
                        {hourlyRate !== null ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '1px 7px', borderRadius: 4,
                            fontSize: 10, fontWeight: 700,
                            background: 'rgba(251,191,36,0.12)',
                            color: 'rgba(251,191,36,0.95)',
                            border: '1px solid rgba(251,191,36,0.28)',
                          }}>
                            ${hourlyRate}/h {lang === 'fr' ? 'réel' : 'real'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: c.text2, fontStyle: 'italic' }}>
                            {lang === 'fr' ? '+d\'heures pour calcul' : 'need more hours'}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: c.text0 }}>
                    ${row.amount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: c.text2 }}>
                    {isRetainer ? (lang === 'fr' ? '/ mois' : '/ month') : (lang === 'fr' ? 'paiement' : 'payment')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

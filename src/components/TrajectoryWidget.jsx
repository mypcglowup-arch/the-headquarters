import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, AlertCircle, Loader2, Check, ArrowRight } from 'lucide-react';
import { computeForecast, makeForecastFingerprint } from '../utils/plateauForecaster.js';
import { generatePlateauBrief } from '../api.js';

const LS_CACHE = 'qg_plateau_brief_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCache(entry) {
  try { localStorage.setItem(LS_CACHE, JSON.stringify(entry)); } catch { /* ignore */ }
}

function formatMoney(n) {
  if (!Number.isFinite(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

export default function TrajectoryWidget({ retainers = [], prospects = [], followupCount30d = 0, c, lang = 'fr' }) {
  const forecast = useMemo(
    () => computeForecast({ retainers, prospects, followupCount30d }),
    [retainers, prospects, followupCount30d]
  );

  const [brief, setBrief]   = useState(null);
  const [loading, setLoading] = useState(false);
  const fingerprint = useMemo(() => makeForecastFingerprint(forecast), [forecast]);

  // Load cached brief or fetch a new one when plateau detected
  useEffect(() => {
    if (!forecast.plateauDetected) { setBrief(null); return; }

    const cached = loadCache();
    if (cached && cached.fingerprint === fingerprint && (Date.now() - cached.at < CACHE_TTL)) {
      setBrief(cached.brief);
      return;
    }

    let cancelled = false;
    setLoading(true);
    generatePlateauBrief(forecast, lang)
      .then((b) => {
        if (cancelled) return;
        if (b) {
          setBrief(b);
          saveCache({ fingerprint, brief: b, at: Date.now() });
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [forecast.plateauDetected, fingerprint, lang]);

  // ── Not enough data ──────────────────────────────────────────────────
  if (!forecast.hasEnoughData) {
    return (
      <div style={{ padding: 16, borderRadius: 12, background: c.bg1, border: `1px solid ${c.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <TrendingUp size={14} style={{ color: c.text2 }} />
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.text2, margin: 0 }}>
            {lang === 'fr' ? 'Trajectoire' : 'Trajectory'}
          </p>
        </div>
        <p style={{ fontSize: 12, color: c.text2, margin: 0 }}>
          {lang === 'fr'
            ? `Pas assez de données pour projeter. Il faut au moins 2 retainers actifs et ${500}$ de MRR.`
            : `Not enough data to project. Need at least 2 active retainers and $500 MRR.`}
        </p>
      </div>
    );
  }

  const indigo  = '99,102,241';
  const emerald = '16,185,129';
  const amber   = '251,191,36';

  // ── Shared scenario strip (both plateau + healthy) ──────────────────
  const scenariosStrip = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'center', padding: 14, borderRadius: 10, background: c.bg2 || 'rgba(99,102,241,0.04)', border: `1px solid ${c.border}` }}>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.text2, marginBottom: 4 }}>
          {lang === 'fr' ? 'Trajectoire actuelle · 90 j' : 'Current path · 90d'}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: c.text0 }}>{formatMoney(forecast.mrr90Current)}</div>
        <div style={{ fontSize: 10, color: c.text2, marginTop: 2 }}>
          {lang === 'fr' ? 'MRR projeté' : 'projected MRR'}
        </div>
      </div>
      <ArrowRight size={16} style={{ color: `rgba(${indigo},0.6)` }} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: `rgba(${emerald},0.95)`, marginBottom: 4 }}>
          {lang === 'fr' ? 'Avec actions · 90 j' : 'With actions · 90d'}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: `rgba(${emerald},0.98)` }}>{formatMoney(forecast.mrr90Improved)}</div>
        <div style={{ fontSize: 10, color: c.text2, marginTop: 2 }}>
          +{formatMoney(forecast.upliftDelta)} {lang === 'fr' ? `(+${Math.round(forecast.upliftPct * 100)}%)` : `(+${Math.round(forecast.upliftPct * 100)}%)`}
        </div>
      </div>
    </div>
  );

  // ── Healthy growth (no plateau) ──────────────────────────────────────
  if (!forecast.plateauDetected) {
    const growthPct = Math.round(forecast.growthRate * 100);
    return (
      <div style={{ padding: 18, borderRadius: 14, background: c.bg1, border: `1px solid ${c.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `rgba(${emerald},0.15)`, border: `1px solid rgba(${emerald},0.28)`,
          }}>
            <TrendingUp size={14} style={{ color: `rgba(${emerald},0.95)` }} />
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.text2, margin: 0 }}>
              {lang === 'fr' ? 'Trajectoire' : 'Trajectory'}
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: c.text0, margin: 0, marginTop: 2 }}>
              {lang === 'fr' ? `Croissance saine — ${growthPct}% / mois` : `Healthy growth — ${growthPct}% / month`}
            </p>
          </div>
        </div>
        {scenariosStrip}
        <p style={{ fontSize: 11, color: c.text2, margin: 0, marginTop: 10, fontStyle: 'italic' }}>
          {lang === 'fr'
            ? `Tu ajoutes ${forecast.newRetainersPerMonth} retainer${forecast.newRetainersPerMonth > 1 ? 's' : ''}/mois en moyenne. Tiens le rythme.`
            : `You're adding ${forecast.newRetainersPerMonth} retainer${forecast.newRetainersPerMonth > 1 ? 's' : ''}/mo on average. Hold the pace.`}
        </p>
      </div>
    );
  }

  // ── Plateau detected ────────────────────────────────────────────────
  return (
    <div style={{ padding: 18, borderRadius: 14, background: c.bg1, border: `1px solid rgba(${amber},0.35)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `rgba(${amber},0.15)`, border: `1px solid rgba(${amber},0.35)`,
        }}>
          <AlertCircle size={14} style={{ color: `rgba(${amber},0.98)` }} />
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(${amber},0.98)`, margin: 0 }}>
            {lang === 'fr' ? 'Trajectoire · plateau détecté' : 'Trajectory · plateau detected'}
          </p>
          <p style={{ fontSize: 13, fontWeight: 700, color: c.text0, margin: 0, marginTop: 2 }}>
            {brief?.headline || (lang === 'fr' ? 'Diagnostic en cours…' : 'Diagnosing…')}
          </p>
        </div>
      </div>

      {/* Diagnostic */}
      {(brief?.diagnostic || loading) && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: c.text1, margin: 0, marginBottom: 14 }}>
          {brief?.diagnostic || (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: c.text2 }}>
              <Loader2 size={11} className="animate-spin" />
              {lang === 'fr' ? 'Calcul des actions correctives…' : 'Computing corrective actions…'}
            </span>
          )}
        </p>
      )}

      {scenariosStrip}

      {/* Actions */}
      {brief?.actions && brief.actions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.text2, marginBottom: 8 }}>
            {lang === 'fr' ? '3 moves pour débloquer' : '3 moves to unblock'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {brief.actions.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: c.bg2 || `rgba(${indigo},0.04)`,
                border: `1px solid ${c.border}`,
              }}>
                <div style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `rgba(${indigo},0.15)`,
                  border: `1px solid rgba(${indigo},0.3)`,
                  fontSize: 11, fontWeight: 800, color: `rgba(${indigo},0.95)`,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: c.text0, margin: 0 }}>{a.title}</p>
                  {a.rationale && (
                    <p style={{ fontSize: 11, color: c.text2, margin: 0, marginTop: 2, lineHeight: 1.45 }}>{a.rationale}</p>
                  )}
                  {a.impact && (
                    <p style={{ fontSize: 10, fontWeight: 700, color: `rgba(${emerald},0.95)`, margin: 0, marginTop: 4 }}>
                      → {a.impact}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scenarios prose (paragraph form, under the strip) */}
      {(brief?.scenarioCurrent || brief?.scenarioWithActions) && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
          {brief.scenarioCurrent && (
            <p style={{ fontSize: 11.5, color: c.text2, margin: 0, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: c.text1 }}>{lang === 'fr' ? 'Actuel: ' : 'Current: '}</span>{brief.scenarioCurrent}
            </p>
          )}
          {brief.scenarioWithActions && (
            <p style={{ fontSize: 11.5, color: c.text2, margin: 0 }}>
              <span style={{ fontWeight: 700, color: `rgba(${emerald},0.95)` }}>{lang === 'fr' ? 'Avec actions: ' : 'With actions: '}</span>{brief.scenarioWithActions}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, ArrowRight, RefreshCw, Zap, Check, X, ExternalLink } from 'lucide-react';
import { generateDashboardAction } from '../api.js';
import GmailInbox from './GmailInbox.jsx';
import MemoryViewer from './MemoryViewer.jsx';
import RevenueBreakdown from './RevenueBreakdown.jsx';
import { isMem0Enabled } from '../lib/mem0.js';
import { t } from '../i18n.js';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg0: '#0D0D12', bg1: '#13131A', bg2: '#1A1A24', bg3: '#1E1E2A',
  border: 'rgba(255,255,255,0.06)',
  accent: '#6366F1', green: '#10B981', amber: '#F59E0B', red: '#EF4444',
  text0: '#F0EEF8', text1: '#9B99A8', text2: '#5A5870',
};
const L = {
  bg0: '#F0EEF8', bg1: '#FFFFFF', bg2: '#F7F6FA', bg3: '#EEEDF5',
  border: 'rgba(0,0,0,0.07)',
  accent: '#6366F1', green: '#10B981', amber: '#F59E0B', red: '#EF4444',
  text0: '#0D0D12', text1: '#5A5870', text2: '#9B99A8',
};

const MONTHS_SHORT  = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const MONTHS_LONG   = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const GOAL_PRESETS  = [25000, 50000, 75000, 100000];

// ─── Workflow badges (Step 4) ─────────────────────────────────────────────────
const WORKFLOW = {
  bouclier:  { label: 'Bouclier',  color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
  repondeur: { label: 'Répondeur', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  revenant:  { label: 'Revenant',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  custom:    { label: 'Custom',    color: '#9B99A8', bg: 'rgba(155,153,168,0.12)' },
};

// ─── Prospect data helpers (Step 5) ──────────────────────────────────────────
const STAGE_STATUSES = {
  contacted: ['Contacté'],
  replied:   ['Répondu', 'Chaud'],
  demo:      ['Démo'],
  signed:    ['Signé', 'Client actif'],
};

function loadProspectCounts() {
  try {
    const list = JSON.parse(localStorage.getItem('hq_prospects') || '[]');
    if (!Array.isArray(list) || !list.length) return null;
    const postContact = ['Contacté','Répondu','Chaud','Démo','Signé','Client actif'];
    return {
      contacted: list.filter((p) => postContact.includes(p.status)).length,
      replied:   list.filter((p) => ['Répondu','Chaud','Démo','Signé','Client actif'].includes(p.status)).length,
      demo:      list.filter((p) => ['Démo','Signé','Client actif'].includes(p.status)).length,
      signed:    list.filter((p) => ['Signé','Client actif'].includes(p.status)).length,
      total:     list.length,
      lastSigned: list.filter((p) => ['Signé','Client actif'].includes(p.status))
                     .sort((a, b) => (b.signedAt||b.updatedAt||0)-(a.signedAt||a.updatedAt||0))[0] || null,
    };
  } catch { return null; }
}

function loadProspectsByStageKey(stageKey) {
  try {
    const list     = JSON.parse(localStorage.getItem('hq_prospects') || '[]');
    const statuses = STAGE_STATUSES[stageKey] || [];
    return list.filter((p) => statuses.includes(p.status)).slice(0, 8);
  } catch { return []; }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useCounter(target, duration = 800, active = true) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!active) return;
    if (target === 0) { setVal(0); return; }
    cancelAnimationFrame(raf.current);
    let start = null;
    function tick(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, active, duration]);
  return val;
}

function useReveal(delay = 0) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = setTimeout(() => {
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.05 });
      obs.observe(el);
      return () => obs.disconnect();
    }, delay);
    return () => clearTimeout(t);
  }, [delay]);
  return [ref, visible];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting(lang) {
  const h = new Date().getHours();
  if (lang === 'fr') { if (h < 12) return 'Bonjour 👋'; if (h < 17) return 'Bon après-midi'; return 'Bonsoir'; }
  if (h < 12) return 'Good morning 👋'; if (h < 17) return 'Good afternoon'; return 'Good evening';
}

// ─── Step 7: Toast system ─────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, color = '#10B981', duration = 1500, persistent = false, action = null) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, color, persistent, action }]);
    if (!persistent && duration) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
    return id;
  }, []);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, show, dismiss };
}

function Toasts({ toasts, dismiss, darkMode }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id}
          style={{
            pointerEvents: 'auto',
            background: darkMode ? '#1A1A24' : '#FFFFFF',
            border: `1px solid ${t.color}`,
            borderRadius: 10, padding: '8px 14px',
            fontSize: 12, fontWeight: 600, color: t.color,
            boxShadow: `0 4px 16px rgba(0,0,0,0.25)`,
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'toastIn 0.25s ease',
          }}>
          {t.msg}
          {t.action && (
            <button onClick={() => { t.action.onClick(); dismiss(t.id); }}
              style={{
                background: 'none', border: `1px solid ${t.color}`, cursor: 'pointer',
                color: t.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              }}>
              {t.action.label}
            </button>
          )}
          {t.persistent && !t.action && (
            <button onClick={() => dismiss(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.color, padding: 2 }}>
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 7: Confetti ────────────────────────────────────────────────────────
function MiniConfetti({ count = 36 }) {
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    x:     Math.random() * 100,
    dur:   1.5 + Math.random() * 1.5,
    delay: Math.random() * 0.8,
    color: ['#6366F1','#10B981','#F59E0B','#F472B6','#22D3EE','#8B5CF6'][i % 6],
    size:  4 + Math.random() * 6,
    round: Math.random() > 0.5,
  }));
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 400 }}>
      {pieces.map((p) => (
        <div key={p.id}
          style={{
            position: 'absolute', left: `${p.x}%`, top: '-10px',
            width: p.size, height: p.size,
            borderRadius: p.round ? '50%' : 2,
            background: p.color,
            animation: `confettiFall ${p.dur}s ease-in ${p.delay}s forwards`,
          }} />
      ))}
    </div>
  );
}

// ─── Step 1: Enhanced EditableNumber ─────────────────────────────────────────
function EditableNumber({ value, onChange, prefix = '', suffix = '', style = {}, onSaved }) {
  const prevRef  = useRef(value);
  const [disp,    setDisp]    = useState(value);
  const [editing, setEdit]    = useState(false);
  const [draft,   setDraft]   = useState('');
  const [glow,    setGlow]    = useState(false);
  const [error,   setError]   = useState(false);
  const raf      = useRef(null);
  const animRef  = useRef(false);

  // Sync with external value when not animating
  useEffect(() => {
    if (!animRef.current) { setDisp(value); prevRef.current = value; }
  }, [value]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function start() {
    prevRef.current = value;
    setDraft(value === 0 ? '' : String(value));
    setEdit(true);
    setError(false);
  }

  function commit() {
    const raw = String(draft).replace(/,/g, '').trim();
    if (raw !== '' && isNaN(Number(raw))) {
      setError(true);
      setTimeout(() => setError(false), 2000);
      return; // stay in edit mode
    }
    const n = raw === '' ? 0 : Math.min(9_999_999, Math.max(0, parseFloat(raw)));
    setEdit(false);
    setError(false);
    // Counter animation: prev → new (800ms ease-out cubic)
    const from = prevRef.current;
    cancelAnimationFrame(raf.current);
    animRef.current = true;
    let t0 = null;
    function tick(ts) {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / 800, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(Math.round(from + (n - from) * e));
      if (p < 1) { raf.current = requestAnimationFrame(tick); }
      else { animRef.current = false; setDisp(n); }
    }
    raf.current = requestAnimationFrame(tick);
    // Green glow (400ms)
    setGlow(true);
    setTimeout(() => setGlow(false), 400);
    onChange(n);
    if (onSaved) onSaved(n);
  }

  function cancel() { setEdit(false); setDraft(''); setError(false); setDisp(prevRef.current); }

  if (editing) return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      {prefix && <span style={{ ...style, opacity: 0.6 }}>{prefix}</span>}
      <input autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') cancel(); }}
        style={{
          background: 'transparent', border: 'none', outline: 'none',
          borderBottom: `1px solid ${error ? '#EF4444' : '#6366F1'}`,
          textAlign: 'center', minWidth: 80,
          boxShadow: error ? '0 0 8px rgba(239,68,68,0.25)' : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          ...style,
        }}
      />
      {error && (
        <span style={{ position: 'absolute', top: '100%', left: 0, fontSize: 10, color: '#EF4444', whiteSpace: 'nowrap', marginTop: 3, animation: 'fadeIn 0.2s ease' }}>
          Chiffres seulement
        </span>
      )}
    </span>
  );

  return (
    <button onClick={start} title="Cliquer pour modifier"
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        borderRadius: 4,
        boxShadow: glow ? '0 0 12px rgba(16,185,129,0.5)' : 'none',
        transition: 'box-shadow 0.4s ease',
        ...style,
      }}
    >
      {prefix}{typeof disp === 'number' ? disp.toLocaleString() : disp}{suffix}
    </button>
  );
}


// ─── Chart scale helpers ──────────────────────────────────────────────────────
function cleanChartMax(maxVal) {
  if (!maxVal || maxVal <= 0) return 5000;
  const raw   = maxVal * 1.3;
  const steps = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  for (const s of steps) {
    const rounded = Math.ceil(raw / s) * s;
    if (rounded >= raw && rounded / s <= 8) return rounded;
  }
  return Math.ceil(raw / 10000) * 10000;
}

function chartTicks(yMax) {
  const step = yMax / 4;
  return [step, step * 2, step * 3, yMax].map(v => Math.round(v));
}

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// ─── Card + SLabel ─────────────────────────────────────────────────────────────
function Card({ children, c, style = {} }) {
  return (
    <div style={{ background: c.bg1, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}
function SLabel({ children, c, style = {} }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.text2, margin: 0, marginBottom: 14, ...style }}>
      {children}
    </p>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, prefix = '', suffix = '', color, sublabel, c, delay = 0, onClick }) {
  const [ref, visible] = useReveal(delay);
  const animated = useCounter(value, 800, visible);
  return (
    <div ref={ref}
      onClick={onClick}
      style={{
        background: c.bg1, border: `1px solid ${c.border}`, borderRadius: 14,
        padding: '16px 18px',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.text2, marginBottom: 10 }}>
        {label}
      </p>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || c.text0 }}>
        {prefix}{animated.toLocaleString()}{suffix}
      </div>
      {sublabel && <p style={{ fontSize: 11, color: c.text2, marginTop: 7 }}>{sublabel}</p>}
    </div>
  );
}

// ─── Step 5: Pipeline rings with click interaction ─────────────────────────────
function PipelineRings({ stages, c, darkMode, onStageClick, openIdx, onGoProspects }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t); }, []);

  const cx = 80, cy = 80;
  const radii  = [68, 54, 40, 26];
  const colors = [c.accent, c.green, c.amber, '#F472B6'];
  const SW     = 9;
  const stageKeys = ['contacted', 'replied', 'demo', 'signed'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <svg width={160} height={160} style={{ flexShrink: 0, overflow: 'visible' }}>
          {radii.map((r, i) => (
            <circle key={`t${i}`} cx={cx} cy={cy} r={r} fill="none"
              stroke={darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'}
              strokeWidth={SW} strokeLinecap="round" />
          ))}
          {stages.map((stage, i) => {
            const r    = radii[i];
            const circ = 2 * Math.PI * r;
            const pct  = stage.total > 0 ? Math.min(stage.value / stage.total, 1) : 0;
            return (
              <circle key={`f${i}`} cx={cx} cy={cy} r={r} fill="none"
                stroke={colors[i]} strokeWidth={SW} strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - (mounted ? pct : 0))}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: `stroke-dashoffset 1s ease ${i * 0.15}s`, filter: `drop-shadow(0 0 5px ${colors[i]}55)`, cursor: 'pointer' }}
                onClick={() => onStageClick(i)}
              />
            );
          })}
          {/* Clickable center → navigate to signed */}
          <g onClick={onGoProspects} style={{ cursor: 'pointer' }}>
            <circle cx={cx} cy={cy} r={18} fill="transparent" />
            <text x={cx} y={cy - 5} textAnchor="middle" fill={c.text0} fontSize={22} fontWeight={800}>{stages[3]?.value ?? 0}</text>
            <text x={cx} y={cy + 13} textAnchor="middle" fill={c.text2} fontSize={8} fontWeight={700} letterSpacing={1.5}>SIGNÉS</text>
          </g>
        </svg>

        {/* Legend */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {stages.map((stage, i) => (
            <div key={stage.label} onClick={() => onStageClick(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '2px 4px', borderRadius: 6, background: openIdx === i ? `${colors[i]}11` : 'transparent', transition: 'background 0.2s' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i], flexShrink: 0, boxShadow: `0 0 6px ${colors[i]}88` }} />
              <span style={{ flex: 1, fontSize: 12, color: c.text1 }}>{stage.label}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: colors[i] }}>{stage.value}</span>
              {openIdx === i ? <span style={{ fontSize: 10, color: colors[i] }}>▲</span> : <span style={{ fontSize: 10, color: c.text2 }}>▼</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Step 5: Breakdown panel */}
      {openIdx !== null && (
        <div style={{
          marginTop: 12, background: c.bg2, border: `1px solid ${c.border}`,
          borderRadius: 10, padding: '14px 16px',
          animation: 'slideDown 0.3s ease',
        }}>
          <PipelineBreakdown stageKey={stageKeys[openIdx]} label={stages[openIdx]?.label} c={c} onGoProspects={onGoProspects} />
        </div>
      )}
    </div>
  );
}

function PipelineBreakdown({ stageKey, label, c, onGoProspects }) {
  const prospects = loadProspectsByStageKey(stageKey);
  if (prospects.length === 0) return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <p style={{ fontSize: 12, color: c.text2, margin: '0 0 8px' }}>Aucun prospect à cette étape.</p>
      <button onClick={onGoProspects}
        style={{ fontSize: 11, color: c.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
        Ajouter des prospects →
      </button>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
      {prospects.map((p) => (
        <div key={p.id || p.businessName} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ flex: 1, color: c.text0, fontWeight: 500 }}>{p.businessName}</span>
          <span style={{ color: c.text2, fontSize: 11 }}>{p.city}</span>
          {p.score && <span style={{ padding: '1px 6px', borderRadius: 10, background: `${c.accent}1A`, color: c.accent, fontSize: 10, fontWeight: 700 }}>{p.score}</span>}
          <button onClick={onGoProspects}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: c.accent, background: 'none', border: `1px solid ${c.accent}33`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
            Voir <ExternalLink size={9} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Action hero ──────────────────────────────────────────────────────────────
function ActionHero({ dashData, lang, c, darkMode, onStartSession }) {
  const [text, setText]       = useState(null);
  const [loading, setLoading] = useState(true);
  const CACHE_KEY = 'qg_dash_action_v1';

  async function load(force = false) {
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached?.date === new Date().toDateString()) { setText(cached.text); setLoading(false); return; }
      } catch {}
    }
    setLoading(true); setText(null);
    try {
      const r = await generateDashboardAction(dashData, lang);
      if (r) { setText(r); localStorage.setItem(CACHE_KEY, JSON.stringify({ date: new Date().toDateString(), text: r })); }
    } catch {}
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  return (
    <Card c={c} style={{
      background: darkMode ? 'linear-gradient(135deg, rgba(99,102,241,0.13), rgba(139,92,246,0.07))' : 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(139,92,246,0.04))',
      border: `1px solid ${darkMode ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.14)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: loading ? 'pulseGlow 1.6s ease-in-out infinite' : 'none' }}>
            <Zap size={19} color="#fff" />
          </div>
          {loading && <div style={{ position: 'absolute', inset: -7, borderRadius: '50%', border: '1.5px solid rgba(99,102,241,0.35)', animation: 'ringExpand 1.6s ease-out infinite', pointerEvents: 'none' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.accent, marginBottom: 7 }}>
            {t('dash.actionPrioritaire', lang)}
          </p>
          {loading ? (
            <div style={{ height: 14, borderRadius: 6, width: '72%', background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', animation: 'shimmer 1.4s ease-in-out infinite' }} />
          ) : text ? (
            <p style={{ fontSize: 14, fontWeight: 500, color: c.text0, lineHeight: 1.55, margin: 0 }}>{text}</p>
          ) : (
            <p style={{ fontSize: 13, color: c.text2, margin: 0 }}>{t('dash.noData', lang)}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={() => load(true)} style={{ padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: `1px solid ${c.border}`, color: c.text2, display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          {onStartSession && (
            <button onClick={onStartSession} style={{ padding: '7px 16px', borderRadius: 9, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 12px rgba(99,102,241,0.35)' }}>
              {t('dash.openSession', lang)}<ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Custom SVG chart helpers ─────────────────────────────────────────────────
function premiumBarPath(x, y, w, h, r = 4) {
  const minH = Math.max(h, 4);
  const dy   = h < 4 ? h - 4 : 0;
  const ay   = y + dy;
  const cr   = Math.min(r, w / 2, minH);
  return `M${x},${ay + cr} Q${x},${ay} ${x + cr},${ay} L${x + w - cr},${ay} Q${x + w},${ay} ${x + w},${ay + cr} L${x + w},${ay + minH} L${x},${ay + minH} Z`;
}

function RevenueBarChart({ monthlyRevenue, selectedMonth, onSelectMonth, hiddenSeries, currentMonth, darkMode, c }) {
  const containerRef = useRef(null);
  const [svgWidth,  setSvgWidth]  = useState(640);
  const [hovered,   setHovered]   = useState(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSvgWidth(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setSvgWidth(Math.floor(en.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H      = 220;
  const PAD    = { top: 14, right: 10, bottom: 32, left: 48 };
  const chartW = Math.max(svgWidth - PAD.left - PAD.right, 0);
  const chartH = H - PAD.top - PAD.bottom;

  const allVals = monthlyRevenue.flatMap((m) => [m.revenue || 0, m.expenses || 0]);
  const dataMax = Math.max(...allVals, 0);
  const isEmpty = dataMax === 0;
  const yMax    = cleanChartMax(isEmpty ? 0 : dataMax);
  const yTicks  = isEmpty ? [1000, 2000, 3000, 4000, 5000] : chartTicks(yMax);

  const colW   = chartW / 12;
  const barW   = Math.max(colW * 0.27, 5);
  const barGap = Math.max(colW * 0.04, 2);

  const toY = (val) => PAD.top + chartH - (val / yMax) * chartH;
  const toH = (val) => (val / yMax) * chartH;

  const gridCol = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const lblCol  = c.text2;

  // Tooltip data
  const hovM   = hovered !== null ? monthlyRevenue[hovered] : null;
  const ttRev  = hovM?.revenue  || 0;
  const ttExp  = hovM?.expenses || 0;
  const ttNet  = ttRev - ttExp;
  const ttW    = 168;
  const ttLeft = hovered !== null
    ? Math.max(8, Math.min(PAD.left + hovered * colW + colW / 2 - ttW / 2, svgWidth - ttW - 8))
    : 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: H, userSelect: 'none' }}>
      <svg width={svgWidth} height={H} style={{ display: 'block', overflow: 'visible' }}>

        {/* Grid lines + Y labels */}
        {yTicks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke={gridCol} strokeWidth={1} />
              <text x={PAD.left - 6} y={y} textAnchor="end" dominantBaseline="middle"
                fill={lblCol} fontSize={10} fontFamily="inherit">
                ${tick >= 1000 ? `${(tick / 1000).toFixed(0)}k` : tick}
              </text>
            </g>
          );
        })}

        {/* Month columns */}
        {monthlyRevenue.map((m, i) => {
          const colX    = PAD.left + i * colW;
          const isSel   = selectedMonth === i;
          const isCurr  = i === currentMonth;
          const isHov   = hovered === i;
          const rev     = m.revenue  || 0;
          const exp     = m.expenses || 0;
          const showRev = !hiddenSeries.includes('revenue');
          const showExp = !hiddenSeries.includes('expenses');
          const groupW  = barW * 2 + barGap;
          const groupX  = colX + (colW - groupW) / 2;
          const revH    = rev > 0 ? toH(rev) : 0;
          const expH    = exp > 0 ? toH(exp) : 0;
          const hlA     = isSel ? (darkMode ? 0.09 : 0.06) : isHov ? (darkMode ? 0.05 : 0.03) : 0;

          return (
            <g key={i}>
              {/* Step 1 — Full-column click zone */}
              <rect
                x={colX} y={PAD.top} width={colW} height={chartH}
                fill={`rgba(99,102,241,${hlA})`}
                rx={2}
                style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectMonth(i)}
              />

              {/* Revenue bar */}
              {showRev && rev > 0 && (
                <path
                  d={premiumBarPath(groupX, toY(rev), barW, revH)}
                  fill={(isSel || isHov) ? '#7C7FF3' : '#6366F1'}
                  opacity={hiddenSeries.includes('revenue') ? 0.15 : 1}
                  style={{ transition: 'fill 0.15s', filter: isHov ? 'drop-shadow(0 0 5px rgba(99,102,241,0.4))' : 'none', pointerEvents: 'none' }}
                />
              )}

              {/* Expenses bar */}
              {showExp && exp > 0 && (
                <path
                  d={premiumBarPath(groupX + barW + barGap, toY(exp), barW, expH)}
                  fill={isHov ? 'rgba(245,158,11,0.95)' : 'rgba(245,158,11,0.7)'}
                  opacity={hiddenSeries.includes('expenses') ? 0.15 : 1}
                  style={{ transition: 'fill 0.15s', pointerEvents: 'none' }}
                />
              )}

              {/* Step 3 — dashed empty outline for current month with no revenue yet */}
              {isCurr && rev === 0 && showRev && (
                <rect
                  x={groupX} y={PAD.top + chartH - 40}
                  width={barW} height={40}
                  fill="none"
                  stroke="rgba(99,102,241,0.45)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  rx={3}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* X label */}
              <text
                x={colX + colW / 2}
                y={PAD.top + chartH + 22}
                textAnchor="middle"
                fill={isCurr ? c.accent : (isSel ? c.text0 : lblCol)}
                fontSize={isCurr ? 11 : 10}
                fontWeight={(isCurr || isSel) ? '700' : '400'}
                fontFamily="inherit"
                style={{ pointerEvents: 'none' }}
              >
                {MONTHS_SHORT[i]}
              </text>

              {/* Step 3 — pulsing dot above current month label */}
              {isCurr && (
                <circle
                  cx={colX + colW / 2}
                  cy={PAD.top + chartH + 10}
                  r={2.5}
                  fill={c.accent}
                  style={{ animation: 'pulseDot 1.8s ease-in-out infinite', pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered !== null && (
        <div style={{
          position: 'absolute', left: ttLeft, top: 4, width: ttW,
          pointerEvents: 'none', zIndex: 5,
          background: '#1A1A24', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '10px 14px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.12s ease',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F0EEF8', marginBottom: 7 }}>{MONTHS_LONG[hovered]}</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 6 }} />
          {[
            { lbl: 'Revenus',  val: ttRev, col: '#6366F1' },
            { lbl: 'Dépenses', val: ttExp, col: '#F59E0B' },
            { lbl: 'Net',      val: ttNet, col: ttNet >= 0 ? '#10B981' : '#EF4444' },
          ].map(({ lbl, val, col }) => (
            <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)' }}>{lbl}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: col }}>
                {lbl === 'Net' && ttNet < 0 ? '−' : '+'}${Math.abs(val).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state overlay */}
      {isEmpty && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
            <line x1="8%" y1="88%" x2="88%" y2="8%" stroke="rgba(99,102,241,0.3)" strokeWidth="1.5" strokeDasharray="6 4"
              style={{ animation: 'projectionDash 3s linear infinite' }} />
          </svg>
          <div style={{ position: 'relative', textAlign: 'center', pointerEvents: 'auto' }}>
            <p style={{ fontSize: 13, color: c.text2, fontStyle: 'italic', margin: 0, marginBottom: 6 }}>
              Ton premier chiffre va changer cette courbe.
            </p>
            <button onClick={() => onSelectMonth(currentMonth)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: c.accent, padding: 0 }}>
              Clique sur un mois pour ajouter tes revenus →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Retainer row ──────────────────────────────────────────────────────
function RetainerRow({ r, c, lang, onUpdate, onDelete, isNew }) {
  const [confirming, setConfirming] = useState(false);
  const initials  = (r.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const daysSince = r.startedAt ? Math.floor((Date.now() - r.startedAt) / 86400000) : null;
  // Avatar tier color
  const avatarBg  = r.amount >= 500 ? 'linear-gradient(135deg, #8B5CF6, #6366F1)'
                  : r.amount >= 200 ? 'linear-gradient(135deg, #6366F1, #818CF8)'
                  : 'linear-gradient(135deg, #475569, #334155)';
  const wf = WORKFLOW[r.workflow] || null;

  if (confirming) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: `${c.red}11`, border: `1px solid ${c.red}33`, animation: 'fadeIn 0.2s ease' }}>
      <span style={{ flex: 1, fontSize: 12, color: c.red }}>Supprimer <strong>{r.name}</strong> ?</span>
      <button onClick={() => onDelete(r.id)} style={{ padding: '4px 12px', borderRadius: 7, background: c.red, border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirmer</button>
      <button onClick={() => setConfirming(false)} style={{ padding: '4px 8px', borderRadius: 7, background: 'none', border: `1px solid ${c.border}`, color: c.text2, fontSize: 11, cursor: 'pointer' }}>Annuler</button>
    </div>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 10,
      background: c.bg2, border: `1px solid ${c.border}`,
      opacity: isNew ? 0 : 1, transition: 'opacity 0.4s ease',
    }}
      ref={(el) => { if (el && isNew) setTimeout(() => { el.style.opacity = '1'; }, 50); }}>
      {/* Avatar */}
      <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>
        {initials}
      </div>
      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <input value={r.name} onChange={(e) => onUpdate(r.id, 'name', e.target.value)}
          placeholder={lang === 'fr' ? 'Nom du client' : 'Client name'}
          style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: c.text0, width: '100%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {wf && <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: wf.bg, color: wf.color }}>{wf.label}</span>}
          {daysSince !== null && <span style={{ fontSize: 10, color: c.text2 }}>depuis {daysSince}j</span>}
        </div>
      </div>
      {/* Workflow select */}
      <select value={r.workflow || ''} onChange={(e) => onUpdate(r.id, 'workflow', e.target.value)}
        style={{ fontSize: 10, background: c.bg3, border: `1px solid ${c.border}`, color: c.text2, borderRadius: 6, padding: '2px 4px', cursor: 'pointer', outline: 'none' }}>
        <option value="">— workflow</option>
        {Object.entries(WORKFLOW).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {/* Amount */}
      <EditableNumber value={r.amount} onChange={(v) => onUpdate(r.id, 'amount', v)} prefix="$" suffix="/mo"
        style={{ fontSize: 13, fontWeight: 800, color: c.green }} />
      {/* Delete */}
      <button onClick={() => setConfirming(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text2, padding: 4, borderRadius: 6, transition: 'color 0.15s' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = c.red; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = c.text2; }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function DashboardScreen({ data, onUpdate, darkMode, lang = 'fr', onStartSession, onGoProspects }) {
  const c = darkMode ? D : L;
  const { monthlyRevenue, pipeline, retainers, oneTimeRevenues = [], annualGoal = 50000 } = data;

  // ── Derived metrics (Step 6: all recalculate instantly) ───────────────────
  const totalRevenue  = monthlyRevenue.reduce((s, m) => s + (m.revenue  || 0), 0);
  const totalExpenses = monthlyRevenue.reduce((s, m) => s + (m.expenses || 0), 0);
  const totalMRR      = retainers.reduce((s, r) => s + (r.amount || 0), 0);
  const goalPct       = annualGoal > 0 ? Math.min(100, Math.round((totalRevenue / annualGoal) * 100)) : 0;
  const now           = new Date();
  const currentMonth  = now.getMonth();
  const monthsElapsed = Math.max(1, currentMonth + (now.getDate() >= 15 ? 1 : 0.5));
  const projected     = Math.round((totalRevenue / monthsElapsed) * 12);
  const bestMonth     = Math.max(0, ...monthlyRevenue.map((m) => m.revenue || 0));
  const recentSlice   = monthlyRevenue.slice(Math.max(0, currentMonth - 2), currentMonth).filter((m) => m.revenue > 0);
  const avgRecent     = recentSlice.length > 0 ? recentSlice.reduce((s, m) => s + m.revenue, 0) / recentSlice.length : 0;
  const anomaly       = avgRecent > 200 && (monthlyRevenue[currentMonth]?.revenue || 0) > 0 && (monthlyRevenue[currentMonth]?.revenue || 0) < avgRecent * 0.65;
  const closingRate   = pipeline.contacted > 0 ? Math.round((pipeline.signed / pipeline.contacted) * 100) : 0;

  // ── Prospect pipeline ─────────────────────────────────────────────────────
  const lsP = loadProspectCounts();
  const ringStages = [
    { label: t('pipeline.contacted', lang), value: lsP?.contacted ?? pipeline.contacted, total: Math.max(lsP?.contacted ?? pipeline.contacted, 1) },
    { label: t('pipeline.replied',   lang), value: lsP?.replied   ?? pipeline.replied,   total: Math.max(lsP?.contacted ?? pipeline.contacted, 1) },
    { label: t('pipeline.demo',      lang), value: lsP?.demo      ?? pipeline.demo,      total: Math.max(lsP?.contacted ?? pipeline.contacted, 1) },
    { label: t('pipeline.signed',    lang), value: lsP?.signed    ?? pipeline.signed,    total: Math.max(lsP?.contacted ?? pipeline.contacted, 1) },
  ];

  // Smart Insights
  const daysSinceClient = lsP?.lastSigned ? Math.floor((Date.now() - (lsP.lastSigned.signedAt||lsP.lastSigned.updatedAt||Date.now())) / 86400000) : null;
  const nextMilestone   = Math.ceil((totalRevenue + 1) / 10000) * 10000;
  const toMilestone     = nextMilestone - totalRevenue;

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedMonth,    setSelectedMonth]    = useState(() => new Date().getMonth());
  const [showMonthPicker,  setShowMonthPicker]  = useState(false);
  const [hiddenSeries,     setHiddenSeries]     = useState([]);
  const [editRev,          setEditRev]          = useState('');
  const [editExp,          setEditExp]          = useState('');
  const [openRingIdx,      setOpenRingIdx]      = useState(null);
  const pickerRef = useRef(null);
  const [goalPulse,     setGoalPulse]     = useState(false);
  const [newRetId,      setNewRetId]      = useState(null);
  const [showConfetti,  setShowConfetti]  = useState(false);
  const prevGoalPctRef  = useRef(goalPct);
  const retainersRef    = useRef(null);
  const chartRef        = useRef(null);

  // ── Toast system ──────────────────────────────────────────────────────────
  const { toasts, show: showToast, dismiss } = useToasts();

  // ── Step 7: Milestone detection ───────────────────────────────────────────
  useEffect(() => {
    const prev = prevGoalPctRef.current;
    const curr = goalPct;
    prevGoalPctRef.current = curr;
    if (prev === curr) return;
    if (prev < 25 && curr >= 25) {
      showToast('🎯 25% de l\'objectif atteint.', '#6366F1', 3500);
      setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2200);
    } else if (prev < 50 && curr >= 50) {
      showToast(`🏁 Mi-chemin vers $${(annualGoal/1000).toFixed(0)}k !`, '#6366F1', 4000);
      setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3000);
    } else if (prev < 100 && curr >= 100) {
      showToast('Objectif atteint. Cardone a quelque chose à te dire. 🏆', '#10B981', 0, true);
      setShowConfetti(true); setTimeout(() => setShowConfetti(false), 5000);
    }
  }, [goalPct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync edit panel inputs when selected month changes ───────────────────
  useEffect(() => {
    setEditRev(String(monthlyRevenue[selectedMonth]?.revenue  || 0));
    setEditExp(String(monthlyRevenue[selectedMonth]?.expenses || 0));
  }, [selectedMonth]); // eslint-disable-line

  // ── Close month picker on outside click ───────────────────────────────────
  useEffect(() => {
    if (!showMonthPicker) return;
    function handleDown(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowMonthPicker(false);
      }
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [showMonthPicker]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function saveMonthData(i, rev, exp) {
    onUpdate({ monthlyRevenue: monthlyRevenue.map((m, idx) => idx === i ? { ...m, revenue: rev, expenses: exp } : m) });
    showToast(t('dash.saved', lang), c.green, 1200);
    setSelectedMonth((i + 1) % 12);
  }

  function triggerGoalPulse() { setGoalPulse(true); setTimeout(() => setGoalPulse(false), 600); }
  function setGoal(v) { onUpdate({ annualGoal: v }); triggerGoalPulse(); showToast('✓ Objectif mis à jour', c.accent, 1500); }

  function addRetainer() {
    const isFirst = retainers.length === 0;
    const id = Date.now();
    onUpdate({ retainers: [...retainers, { id, name: t('dash.newClient', lang), amount: 0, startedAt: Date.now(), workflow: null }] });
    setNewRetId(id);
    setTimeout(() => setNewRetId(null), 600);
    if (isFirst) showToast('Premier client. Le Bouclier commence ce soir. 🛡', '#10B981', 3500);
    else showToast('✓ Retainer ajouté', c.green, 1500);
  }
  function removeRetainer(id) {
    const deleted = retainers.find((r) => r.id === id);
    onUpdate({ retainers: retainers.filter((r) => r.id !== id) });
    if (deleted) {
      showToast(
        `${deleted.name} supprimé`,
        c.red,
        5000,
        false,
        {
          label: '↩ Annuler',
          onClick: () => onUpdate({ retainers: [...retainers.filter((r) => r.id !== id), deleted] }),
        }
      );
    }
  }
  function updateRetainer(id, field, val) {
    onUpdate({ retainers: retainers.map((r) => r.id === id ? { ...r, [field]: val } : r) });
    if (field === 'amount') showToast('✓ Montant mis à jour', c.green, 1200);
  }

  // ── Chart / action data ───────────────────────────────────────────────────
  const dashData = { totalRevenue, annualGoal, totalMRR, goalPct, closingRate };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px', background: c.bg0, color: c.text0 }}>

      {/* Global keyframes */}
      <style>{`
        @keyframes pulseGlow  { 0%{box-shadow:0 0 0 0 rgba(99,102,241,0.5)} 70%{box-shadow:0 0 0 12px rgba(99,102,241,0)} 100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} }
        @keyframes ringExpand { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(1.6);opacity:0} }
        @keyframes dotPulse   { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:0.55} }
        @keyframes shimmer    { 0%,100%{opacity:0.35} 50%{opacity:0.85} }
        @keyframes spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes toastIn    { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes slideDown  { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
        @keyframes confettiFall { to{transform:translateY(110vh) rotate(720deg);opacity:0} }
        @keyframes barPulse        { 0%{box-shadow:0 0 0 0 rgba(99,102,241,0.6)} 70%{box-shadow:0 0 0 8px rgba(99,102,241,0)} 100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} }
        @keyframes projectionDash  { from{stroke-dashoffset:0} to{stroke-dashoffset:-40} }
        @keyframes pulseDot        { 0%,100%{opacity:1} 50%{opacity:0.25} }
      `}</style>

      {showConfetti && <MiniConfetti count={50} />}
      <Toasts toasts={toasts} dismiss={dismiss} darkMode={darkMode} />

      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.02em', color: c.text0, margin: 0, lineHeight: 1.1 }}>
                {t('dash.title', lang)}
              </h1>
              <p style={{ fontSize: 13, color: c.text1, marginTop: 5 }}>NT Solutions · {now.getFullYear()}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 13px', borderRadius: 20, background: c.bg2, border: `1px solid ${c.border}`, fontSize: 11, color: c.text1, fontWeight: 500 }}>{getGreeting(lang)}</span>
              <span style={{ padding: '4px 13px', borderRadius: 20, background: c.bg2, border: `1px solid ${c.border}`, fontSize: 11, color: c.text1, fontWeight: 500 }}>
                {now.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <span style={{ padding: '4px 13px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', fontSize: 11, color: c.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.green, display: 'inline-block', animation: 'dotPulse 2s ease-in-out infinite' }} />
                {t('dash.live', lang)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Action hero ── */}
        <div style={{ marginBottom: 18 }}>
          <ActionHero dashData={dashData} lang={lang} c={c} darkMode={darkMode} onStartSession={onStartSession} />
        </div>

        {/* ── Gmail Inbox ── */}
        <div style={{ marginBottom: 18 }}>
          <GmailInbox darkMode={darkMode} lang={lang || 'fr'} />
        </div>

        {/* ── Step 4: Metric cards — MRR clicks scroll to retainers ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          <MetricCard label="MRR" value={totalMRR} prefix="$" color={c.accent}
            sublabel={t('dash.clickRetainers', lang)} c={c} delay={0}
            onClick={() => retainersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
          <MetricCard label={t('dash.revenueYTD', lang)} value={totalRevenue} prefix="$" color={c.text0}
            sublabel={`${goalPct}% ${t('dash.ofGoal', lang)}`} c={c} delay={70}
            onClick={() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
          <MetricCard label={t('dash.bestMonth', lang)} value={bestMonth} prefix="$" color={c.green}
            sublabel={t('dash.allTimeRecord', lang)} c={c} delay={140} />
          <MetricCard label={t('dash.projectedARR', lang)} value={totalMRR > 0 ? totalMRR * 12 : projected} prefix="$" color={c.amber}
            sublabel={t('dash.atCurrentPace', lang)} c={c} delay={210} />
        </div>

        {/* ── Step 3: Annual goal card ── */}
        <div data-tour="business-pulse" style={{ marginBottom: 18 }}>
          <Card c={c}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <SLabel c={c} style={{ marginBottom: 0 }}>{t('dash.annual', lang)}</SLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: c.text2 }}>{t('dash.goalLabel', lang)}</span>
                <EditableNumber value={annualGoal} onChange={setGoal} prefix="$"
                  style={{ fontSize: 13, fontWeight: 700, color: c.accent }}
                  onSaved={() => triggerGoalPulse()} />
              </div>
            </div>

            {/* Progress row */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: c.text1 }}>{t('dash.earned', lang, { amount: `$${totalRevenue.toLocaleString()}` })}</span>
              <span style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: goalPct >= 100 ? c.green : c.text0 }}>{goalPct}%</span>
              <span style={{ fontSize: 12, color: c.text2 }}>${Math.max(0, annualGoal - totalRevenue).toLocaleString()} {t('dash.toGetThere', lang)}</span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 7, borderRadius: 4, overflow: 'visible', position: 'relative', background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)', marginBottom: 12 }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${goalPct}%`,
                background: goalPct >= 100 ? c.green : 'linear-gradient(90deg, #6366F1, #8B5CF6)',
                transition: 'width 900ms cubic-bezier(0.34,1.56,0.64,1)',
                position: 'relative',
                animation: goalPulse ? 'barPulse 0.6s ease' : 'none',
              }}>
                {goalPct > 3 && goalPct < 100 && (
                  <div style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 11, height: 11, borderRadius: '50%', background: '#8B5CF6', boxShadow: '0 0 10px rgba(139,92,246,0.85)' }} />
                )}
              </div>
            </div>

            {/* Step 3: Goal presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {GOAL_PRESETS.map((v) => (
                <button key={v} onClick={() => setGoal(v)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: annualGoal === v ? c.accent : c.bg2,
                    color:      annualGoal === v ? '#fff'    : c.text2,
                    border:     `1px solid ${annualGoal === v ? c.accent : c.border}`,
                    transition: 'all 0.2s ease',
                  }}>
                  {v >= 1000 ? `${v/1000}k` : v}$
                </button>
              ))}
            </div>

            {/* Projection + anomaly */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 12, color: c.text2, margin: 0 }}>
                {lang === 'fr'
                  ? `Projection : $${projected.toLocaleString()} ${projected >= annualGoal ? '· ✓ en bonne voie' : `· −$${(annualGoal-projected).toLocaleString()}`}`
                  : `Projection: $${projected.toLocaleString()} ${projected >= annualGoal ? '· ✓ on track' : `· −$${(annualGoal-projected).toLocaleString()}`}`}
              </p>
              {anomaly && (
                <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, color: c.amber, fontWeight: 700 }}>
                  ⚠ {t('dash.monthBelow', lang)}
                </span>
              )}
            </div>
          </Card>
        </div>

        {/* ── Revenue chart ── */}
        <div ref={chartRef}>
          <Card c={c} style={{ marginBottom: 18, border: 'none', background: c.bg1 }}>
            {/* Step 6: Summary pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <SLabel c={c} style={{ marginBottom: 0 }}>{t('dash.revenueVsExp', lang)}</SLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { lbl: 'Revenus',  val: totalRevenue,               col: c.accent },
                  { lbl: 'Dépenses', val: totalExpenses,               col: c.amber  },
                  { lbl: 'Net',      val: totalRevenue - totalExpenses, col: totalRevenue >= totalExpenses ? c.green : c.red },
                ].map(({ lbl, val, col }) => (
                  <div key={lbl} style={{
                    padding: '6px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ fontSize: 9, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{lbl}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: col }}>${Math.abs(val).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 7: Legend toggles */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 14, alignItems: 'center' }}>
              {[
                { key: 'revenue',  lbl: 'Revenus',  dot: '#6366F1' },
                { key: 'expenses', lbl: 'Dépenses', dot: '#F59E0B' },
              ].map(({ key, lbl, dot }) => {
                const hidden = hiddenSeries.includes(key);
                return (
                  <button key={key}
                    onClick={() => setHiddenSeries(prev =>
                      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                    )}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      opacity: hidden ? 0.4 : 1, transition: 'opacity 0.2s',
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: c.text1 }}>{lbl}</span>
                  </button>
                );
              })}
            </div>

            {/* Steps 1–3: Custom SVG chart */}
            <RevenueBarChart
              monthlyRevenue={monthlyRevenue}
              selectedMonth={selectedMonth}
              onSelectMonth={setSelectedMonth}
              hiddenSeries={hiddenSeries}
              currentMonth={currentMonth}
              darkMode={darkMode}
              c={c}
            />

            {/* Steps 4–6: Always-visible edit panel */}
            {(() => {
              const i          = selectedMonth;
              const editNetVal = (parseInt(editRev) || 0) - (parseInt(editExp) || 0);
              const inputStyle = {
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px', borderRadius: 8,
                fontSize: 18, fontWeight: 700,
                background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                color: darkMode ? '#F0EEF8' : '#0D0D12',
                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                outline: 'none', transition: 'border-color 0.2s',
              };
              return (
                <div
                  style={{
                    borderTop: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: '0 0 12px 12px',
                    padding: '16px 20px',
                    background: darkMode ? 'rgba(18,18,28,0.97)' : 'rgba(244,243,250,0.97)',
                    backdropFilter: 'blur(8px)',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveMonthData(i, parseInt(editRev) || 0, parseInt(editExp) || 0); }
                    if (e.key === 'ArrowLeft'  && e.target.tagName !== 'INPUT') { e.preventDefault(); setSelectedMonth((i + 11) % 12); }
                    if (e.key === 'ArrowRight' && e.target.tagName !== 'INPUT') { e.preventDefault(); setSelectedMonth((i + 1)  % 12); }
                    if (e.key === 'Escape') setShowMonthPicker(false);
                  }}
                >
                  {/* Step 4: Month nav + Net */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div ref={pickerRef} style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                      {/* ‹ prev */}
                      <button
                        type="button"
                        onClick={() => setSelectedMonth((i + 11) % 12)}
                        style={{ background: 'none', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`, color: c.text1, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, lineHeight: 1 }}>
                        ‹
                      </button>
                      {/* Month name — opens picker */}
                      <button
                        type="button"
                        onClick={() => setShowMonthPicker((p) => !p)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, color: darkMode ? '#F0EEF8' : '#0D0D12', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {MONTHS_LONG[i]}
                        <span style={{ fontSize: 8, color: c.text2, lineHeight: 1 }}>{showMonthPicker ? '▲' : '▼'}</span>
                      </button>
                      {/* › next */}
                      <button
                        type="button"
                        onClick={() => setSelectedMonth((i + 1) % 12)}
                        style={{ background: 'none', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`, color: c.text1, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, lineHeight: 1 }}>
                        ›
                      </button>

                      {/* Step 5: Month grid picker popup */}
                      {showMonthPicker && (
                        <div style={{
                          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                          width: 232,
                          background: darkMode ? '#1A1A24' : '#FFFFFF',
                          border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                          borderRadius: 12, padding: 12,
                          boxShadow: '0 -8px 32px rgba(0,0,0,0.35)',
                          animation: 'slideDown 0.2s ease',
                          zIndex: 20,
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                            {MONTHS_SHORT.map((mo, idx) => {
                              const hasData  = (monthlyRevenue[idx]?.revenue || 0) > 0 || (monthlyRevenue[idx]?.expenses || 0) > 0;
                              const isCurrM  = idx === currentMonth;
                              const isSelM   = idx === i;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => { setSelectedMonth(idx); setShowMonthPicker(false); }}
                                  style={{
                                    padding: '7px 4px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    border: isSelM ? `1.5px solid ${c.accent}` : isCurrM ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent',
                                    background: isSelM ? 'rgba(99,102,241,0.18)' : hasData ? (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') : 'transparent',
                                    color: isSelM ? (darkMode ? '#F0EEF8' : '#0D0D12') : isCurrM ? c.accent : hasData ? c.text0 : c.text2,
                                    position: 'relative', textAlign: 'center',
                                  }}>
                                  {mo}
                                  {hasData && (
                                    <span style={{ position: 'absolute', top: 3, right: 4, width: 4, height: 4, borderRadius: '50%', background: c.green }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Live Net */}
                    <span style={{ fontSize: 13, fontWeight: 600, color: editNetVal >= 0 ? '#10B981' : '#EF4444' }}>
                      Net : {editNetVal >= 0 ? '+' : '−'}${Math.abs(editNetVal).toLocaleString()}
                    </span>
                  </div>

                  {/* Step 4: Large inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Revenus $</div>
                      <input value={editRev} type="number" min="0"
                        onChange={(e) => setEditRev(e.target.value)}
                        onFocus={(e) => { e.target.style.borderColor = '#6366F1'; }}
                        onBlur={(e)  => { e.target.style.borderColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; }}
                        style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Dépenses $</div>
                      <input value={editExp} type="number" min="0"
                        onChange={(e) => setEditExp(e.target.value)}
                        onFocus={(e) => { e.target.style.borderColor = '#6366F1'; }}
                        onBlur={(e)  => { e.target.style.borderColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; }}
                        style={inputStyle} />
                    </div>
                  </div>

                  {/* Step 6: Save + keyboard hints */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: c.text2, opacity: 0.45 }}>
                      ↵ Enregistrer · ← → Changer mois
                    </span>
                    <button
                      type="button"
                      onClick={() => saveMonthData(i, parseInt(editRev) || 0, parseInt(editExp) || 0)}
                      style={{ padding: '8px 18px', borderRadius: 8, background: '#6366F1', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={12} /> Enregistrer
                    </button>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>

        {/* ── Steps 5+8: Pipeline rings + Retainers ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>

          {/* Pipeline rings */}
          <div data-tour="pipeline">
            <Card c={c} style={{ height: '100%' }}>
              <SLabel c={c}>{t('dash.pipeline', lang)}</SLabel>
              <PipelineRings stages={ringStages} c={c} darkMode={darkMode}
                onStageClick={(i) => setOpenRingIdx(openRingIdx === i ? null : i)}
                openIdx={openRingIdx}
                onGoProspects={onGoProspects || (() => {})} />
              {closingRate > 0 && (
                <p style={{ fontSize: 11, color: c.text2, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
                  {t('dash.closeRate', lang, { pct: closingRate })}
                </p>
              )}
            </Card>
          </div>

          {/* Retainers */}
          <div data-tour="retainers" ref={retainersRef}>
            <Card c={c} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <SLabel c={c} style={{ marginBottom: 0 }}>{t('dash.retainers', lang)}</SLabel>
                {totalMRR > 0 && (
                  <span style={{ padding: '3px 11px', borderRadius: 20, background: `${c.accent}18`, border: `1px solid ${c.accent}44`, fontSize: 11, fontWeight: 800, color: c.accent }}>
                    ${totalMRR.toLocaleString()}/mo
                  </span>
                )}
              </div>

              {retainers.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${c.border}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center', minHeight: 80 }}>
                  <p style={{ fontSize: 12, color: c.text2, margin: 0 }}>
                    {t('dash.noRetainer', lang)}
                  </p>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {retainers.map((r) => (
                    <RetainerRow key={r.id} r={r} c={c} lang={lang}
                      onUpdate={updateRetainer}
                      onDelete={removeRetainer}
                      isNew={r.id === newRetId} />
                  ))}
                </div>
              )}

              <button onClick={addRetainer}
                style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: c.text2, padding: '4px 0', transition: 'color 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = c.text0; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = c.text2; }}>
                <Plus size={12} /> {t('dash.addRetainer', lang)}
              </button>
            </Card>
          </div>
        </div>

        {/* ── Revenue breakdown by client ── */}
        <RevenueBreakdown
          retainers={retainers}
          oneTimeRevenues={oneTimeRevenues}
          c={c}
          lang={lang}
        />

        {/* ── Smart Insights ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <Card c={c}>
            <SLabel c={c}>{t('dash.lastClose', lang)}</SLabel>
            <div style={{ fontSize: 30, fontWeight: 900, color: daysSinceClient === null ? c.text2 : daysSinceClient > 30 ? c.red : daysSinceClient > 14 ? c.amber : c.green }}>
              {daysSinceClient === null ? '—' : daysSinceClient}
              {daysSinceClient !== null && <span style={{ fontSize: 13, fontWeight: 500, color: c.text2, marginLeft: 5 }}>{t('dash.daysAbbr', lang)}</span>}
            </div>
            <p style={{ fontSize: 11, color: c.text2, marginTop: 6 }}>
              {daysSinceClient === null ? t('dash.noSigned', lang) : t('dash.sinceLast', lang)}
            </p>
          </Card>

          <Card c={c}>
            <SLabel c={c}>{t('dash.closingRate', lang)}</SLabel>
            <div style={{ fontSize: 30, fontWeight: 900, color: closingRate >= 20 ? c.green : closingRate >= 10 ? c.amber : c.text0 }}>{closingRate}%</div>
            <p style={{ fontSize: 11, color: c.text2, marginTop: 6 }}>
              {pipeline.contacted > 0 ? `${pipeline.signed} / ${pipeline.contacted} prospects` : t('dash.noDataPipeline', lang)}
            </p>
          </Card>

          <Card c={c}>
            <SLabel c={c}>{t('dash.nextMilestone', lang)}</SLabel>
            <div style={{ fontSize: 30, fontWeight: 900, color: c.accent }}>${nextMilestone.toLocaleString()}</div>
            <p style={{ fontSize: 11, color: c.text2, marginTop: 6 }}>${toMilestone.toLocaleString()} {t('dash.toGetThere', lang)}</p>
          </Card>
        </div>

        {/* ── Memory Viewer (only when Mem0 is configured) ── */}
        {isMem0Enabled() && (
          <MemoryViewer c={c} lang={lang} />
        )}

      </div>
    </div>
  );
}

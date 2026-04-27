import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, X, ChevronRight, Timer } from 'lucide-react';
import { AGENT_CONFIG } from '../prompts.js';
import { syncFocusSession } from '../lib/sync.js';
import { t } from '../i18n.js';

const GENERAL_CLIENT = '__general__';

// ─── Duration options ─────────────────────────────────────────────────────────
const BASE_DURATIONS = [
  { label: '25', minutes: 25 },
  { label: '50', minutes: 50 },
  { label: '90', minutes: 90 },
];

// ─── Step 1: Agent quotes ─────────────────────────────────────────────────────
const TIMER_QUOTES = [
  { text: "Une chose à la fois. Le reste est du bruit.",                       agent: 'Le Stratège'    },
  { text: "L'exécution bat la perfection chaque fois.",                        agent: "L'Architecte"   },
  { text: "10X ton focus avant de 10X ton action.",                            agent: "L'Accélérateur"  },
  { text: "Ce que tu fais dans les 25 prochaines minutes définit ta journée.", agent: 'Le Catalyseur'  },
  { text: "La discipline est la liberté déguisée.",                            agent: 'Le Stratège'    },
  { text: "Pendant que tu hésites, quelqu'un exécute.",                        agent: "L'Accélérateur"  },
  { text: "Le focus est un muscle. Entraîne-le.",                              agent: 'Le Catalyseur'  },
  { text: "Une session concentrée vaut 4 heures dispersées.",                  agent: "L'Architecte"   },
  { text: "Ce que tu évites est exactement ce que tu dois faire.",             agent: 'Black Swan' },
];

function pickQuote(exclude = null) {
  const pool = exclude ? TIMER_QUOTES.filter(q => q.text !== exclude.text) : TIMER_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Step 2: Categories ───────────────────────────────────────────────────────
const CATEGORIES = ['Prospection', 'Clients', 'Build', 'Comptabilité', 'Préparation appel', 'Autre'];

// ─── Storage keys ─────────────────────────────────────────────────────────────
const LS_SESSIONS = 'hq_focus_sessions';
const LS_LOG      = 'hq_focus_log';

// ─── UUID helper ──────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

// ─── Session log (Step 6) ─────────────────────────────────────────────────────
function loadLog() {
  try { return JSON.parse(localStorage.getItem(LS_LOG) || '[]'); } catch { return []; }
}

function appendLog(entry) {
  const log = loadLog();
  log.unshift(entry);
  localStorage.setItem(LS_LOG, JSON.stringify(log.slice(0, 100)));
  return log;
}

// ─── Sessions counter + weekly data (Step 3) ─────────────────────────────────
function loadSessions() {
  try {
    const raw   = JSON.parse(localStorage.getItem(LS_SESSIONS) || '{}');
    const today = new Date().toDateString();
    return {
      today:   raw.today?.date === today
               ? raw.today
               : { date: today, count: 0, totalMinutes: 0 },
      allTime: raw.allTime || { count: 0, totalMinutes: 0 },
      weekly:  raw.weekly  || {},
    };
  } catch {
    return {
      today:   { date: new Date().toDateString(), count: 0, totalMinutes: 0 },
      allTime: { count: 0, totalMinutes: 0 },
      weekly:  {},
    };
  }
}

function incrementSession(minutes) {
  const s     = loadSessions();
  const today = new Date().toDateString();
  const td    = { date: today, count: s.today.count + 1, totalMinutes: s.today.totalMinutes + minutes };
  const next  = {
    today:   td,
    allTime: { count: s.allTime.count + 1, totalMinutes: s.allTime.totalMinutes + minutes },
    weekly:  { ...s.weekly, [today]: { count: td.count, totalMinutes: td.totalMinutes } },
  };
  localStorage.setItem(LS_SESSIONS, JSON.stringify(next));
  return next;
}

// ─── Step 3: Weekly helpers ───────────────────────────────────────────────────
const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function getWeekDays() {
  const today  = new Date();
  const dow    = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function computeStreak(weekly) {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (weekly[d.toDateString()]?.count > 0) streak++;
    else break;
  }
  return streak;
}

function weeklyTotals(weekly) {
  const days = getWeekDays();
  let count = 0, mins = 0;
  for (const d of days) {
    const k = d.toDateString();
    if (weekly[k]) { count += weekly[k].count; mins += weekly[k].totalMinutes; }
  }
  return { count, mins };
}

// ─── Audio + notification ─────────────────────────────────────────────────────
function playChime() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(528, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
    osc.frequency.setValueAtTime(792, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);
  } catch {}
}

function sendNotification(minutes, lang) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(lang === 'fr' ? 'Session terminée' : 'Session complete', {
        body: lang === 'fr'
          ? `${minutes} min de focus complétées. Prends 5 minutes.`
          : `${minutes} min of focus completed. Take a 5-minute break.`,
      });
    }
  } catch {}
}

// ─── Formatting helpers ───────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtMins(minutes) {
  if (!minutes) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
}

function resultIcon(r)  { return r === 'completed' ? '✓' : r === 'partial' ? '~' : '✗'; }
function resultColor(r) { return r === 'completed' ? '#10B981' : r === 'partial' ? '#F59E0B' : '#6B7280'; }

// ─── Category breakdown from log ─────────────────────────────────────────────
function getCatBreakdown() {
  const log = loadLog();
  const map = {};
  for (const e of log) {
    if (e.category) map[e.category] = (map[e.category] || 0) + (e.duration || 0);
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat, mins]) => `${cat}: ${fmtMins(mins)}`);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FocusTimer({ darkMode, lang = 'fr', onStartSession, retainers = [] }) {
  const config = AGENT_CONFIG['NAVAL'];
  const rgb    = config.glowRgb;

  // ── Duration ─────────────────────────────────────────────────────────────────
  const [selectedIdx,  setSelectedIdx]  = useState(0);
  const [customMins,   setCustomMins]   = useState(null);
  const [showCustom,   setShowCustom]   = useState(false);
  const [customInput,  setCustomInput]  = useState('');
  const customInputRef = useRef(null);

  const durations = customMins
    ? [...BASE_DURATIONS, { label: String(customMins), minutes: customMins }]
    : BASE_DURATIONS;

  // ── Timer core ────────────────────────────────────────────────────────────────
  const [totalSeconds, setTotalSeconds] = useState(BASE_DURATIONS[0].minutes * 60);
  const [remaining,    setRemaining]    = useState(BASE_DURATIONS[0].minutes * 60);
  const [running,      setRunning]      = useState(false);
  const [completed,    setCompleted]    = useState(false);
  const [hasStarted,   setHasStarted]   = useState(false);
  const intervalRef = useRef(null);

  // ── Quote ─────────────────────────────────────────────────────────────────────
  const [quote,        setQuote]        = useState(() => pickQuote());
  const [quoteVisible, setQuoteVisible] = useState(true);

  // ── Ring flash ────────────────────────────────────────────────────────────────
  const [flashStep,    setFlashStep]    = useState(0);

  // ── Step 1: Intention ─────────────────────────────────────────────────────────
  const [intentionInput, setIntentionInput] = useState('');
  const [intention,      setIntention]      = useState('');
  const [result,         setResult]         = useState(null);  // null | 'completed' | 'partial' | 'failed'
  const [showBlocker,    setShowBlocker]    = useState(false);
  const [blockerInput,   setBlockerInput]   = useState('');
  const [blocker,        setBlocker]        = useState(null);
  const [resultSaved,    setResultSaved]    = useState(false);
  const [blockerCD,      setBlockerCD]      = useState(10);
  const blockerTimerRef = useRef(null);
  const blockerInputRef = useRef(null);

  // ── Step 2: Category ──────────────────────────────────────────────────────────
  const [category,       setCategory]      = useState(null);
  const [autreLabel,     setAutreLabel]    = useState('');
  const autreLabelRef = useRef(null);
  const [showCatTip,     setShowCatTip]    = useState(false);
  const catTipRef = useRef(null);

  // ── Client association (null = General/Admin) ──────────────────────────────
  const [selectedClient, setSelectedClient] = useState(GENERAL_CLIENT);

  // ── Sessions ──────────────────────────────────────────────────────────────────
  const [sessions,       setSessions]      = useState(() => loadSessions());

  // ── Step 4: Night alert ───────────────────────────────────────────────────────
  const [nightDismissed, setNightDismissed] = useState(false);

  // ── Step 6: Log panel ─────────────────────────────────────────────────────────
  const [showLog,        setShowLog]       = useState(false);
  const [logEntries,     setLogEntries]    = useState(() => loadLog());

  // ── Timer tick ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            setCompleted(true);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // ── Completion effects ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!completed) { setFlashStep(0); return; }
    const mins = Math.round(totalSeconds / 60);
    playChime();
    sendNotification(mins, lang);
    const newS = incrementSession(mins);
    setSessions(newS);
    let step = 0;
    const flashId = setInterval(() => {
      step++;
      setFlashStep(step);
      if (step >= 7) clearInterval(flashId);
    }, 300);
    return () => clearInterval(flashId);
  }, [completed]); // eslint-disable-line

  // ── Blocker auto-skip countdown ───────────────────────────────────────────────
  useEffect(() => {
    if (!showBlocker) {
      clearInterval(blockerTimerRef.current);
      setBlockerCD(10);
      return;
    }
    setBlockerCD(10);
    setTimeout(() => blockerInputRef.current?.focus(), 40);
    let cd = 10;
    blockerTimerRef.current = setInterval(() => {
      cd--;
      setBlockerCD(cd);
      if (cd <= 0) {
        clearInterval(blockerTimerRef.current);
        commitResult(blockerInput.trim() || null);
      }
    }, 1000);
    return () => clearInterval(blockerTimerRef.current);
  }, [showBlocker]); // eslint-disable-line

  // ── Click outside category tooltip ───────────────────────────────────────────
  useEffect(() => {
    if (!showCatTip) return;
    const fn = e => { if (!catTipRef.current?.contains(e.target)) setShowCatTip(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [showCatTip]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function commitResult(blockerText) {
    clearInterval(blockerTimerRef.current);
    setShowBlocker(false);
    const b = blockerText || null;
    setBlocker(b);
    setResultSaved(true);
    const clientName = selectedClient === GENERAL_CLIENT
      ? null
      : (retainers.find((r) => String(r.id) === String(selectedClient))?.name || null);
    const entry = {
      id:        uid(),
      date:      Date.now(),
      duration:  Math.round(totalSeconds / 60),
      clientName,                                  // null = Général/Admin
      intention: intention || intentionInput || '',
      category:  category === 'Autre' && autreLabel.trim()
                   ? autreLabel.trim()
                   : (category || ''),
      result:    result    || 'completed',
      blocker:   b,
      debriefed: false,
    };
    const newLog = appendLog(entry);
    setLogEntries(newLog);
    // Fire-and-forget cloud sync — silent fail if table doesn't exist
    syncFocusSession(entry);
  }

  function handleResultClick(r) {
    setResult(r);
    if (r === 'partial' || r === 'failed') {
      setShowBlocker(true);
    } else {
      commitResult(null);
    }
  }

  function handleBlockerSubmit(e) {
    e?.preventDefault();
    clearInterval(blockerTimerRef.current);
    commitResult(blockerInput.trim() || null);
  }

  function selectDuration(idx) {
    if (running) return;
    const mins = (customMins && idx === durations.length - 1)
      ? customMins
      : durations[idx]?.minutes ?? BASE_DURATIONS[0].minutes;
    setSelectedIdx(idx);
    setTotalSeconds(mins * 60);
    setRemaining(mins * 60);
    setCompleted(false);
    setHasStarted(false);
    setFlashStep(0);
  }

  function reset() {
    clearInterval(intervalRef.current);
    clearInterval(blockerTimerRef.current);
    setRunning(false);
    setCompleted(false);
    setRemaining(totalSeconds);
    setHasStarted(false);
    setFlashStep(0);
    setResult(null);
    setShowBlocker(false);
    setBlockerInput('');
    setBlocker(null);
    setResultSaved(false);
    setIntention('');
    setAutreLabel('');
    setSelectedClient(GENERAL_CLIENT);
  }

  function toggleRunning() {
    if (completed) return;
    if (!running && !hasStarted) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      setIntention(intentionInput.trim());
      setQuoteVisible(false);
      setTimeout(() => { setQuote(q => pickQuote(q)); setQuoteVisible(true); }, 200);
      setHasStarted(true);
    }
    setRunning(r => !r);
  }

  function submitCustom(e) {
    e?.preventDefault();
    const val = parseInt(customInput, 10);
    setShowCustom(false);
    setCustomInput('');
    if (isNaN(val) || val < 5 || val > 180) return;
    setCustomMins(val);
    if (!running) {
      setSelectedIdx(3);
      setTotalSeconds(val * 60);
      setRemaining(val * 60);
      setCompleted(false);
      setHasStarted(false);
    }
  }

  function handleDebrief() {
    const mins       = Math.round(totalSeconds / 60);
    const intentTxt  = intention || intentionInput || '—';
    const resultTxt  = result === 'completed' ? 'Complété'
                     : result === 'partial'   ? 'Partiellement' : 'Pas fait';
    const blockerLine = blocker ? `\nCe qui m'a bloqué : ${blocker}` : '';
    const msg = `Je viens de compléter ${mins} minutes sur : ${intentTxt}.\nRésultat : ${resultTxt}.${blockerLine}\n\nFeedback rapide ?`;
    localStorage.setItem('hq_debrief_pending', msg);
    if (onStartSession) onStartSession();
  }

  // ── Ring ──────────────────────────────────────────────────────────────────────
  const pct     = totalSeconds > 0 ? 1 - remaining / totalSeconds : 0;
  const radius  = 44;
  const circ    = 2 * Math.PI * radius;
  const dashOff = completed ? 0 : circ * (1 - pct);

  let ringStroke;
  if (completed) {
    ringStroke = flashStep >= 7     ? '#6366F1'
               : flashStep % 2 === 1 ? '#FFFFFF' : 'transparent';
  } else if (!running && hasStarted) {
    ringStroke = '#6366F1';
  } else if (running && remaining <= 300) {
    ringStroke = '#F59E0B';
  } else if (running) {
    ringStroke = '#10B981';
  } else {
    ringStroke = `rgba(${rgb},0.55)`;
  }

  const pulsing = running && remaining <= 300 && !completed;

  // ── Design tokens ─────────────────────────────────────────────────────────────
  const T = {
    bg:          darkMode ? 'rgba(10,14,24,0.7)'       : 'rgba(255,255,255,0.9)',
    bgEl:        darkMode ? 'rgba(255,255,255,0.05)'   : 'rgba(0,0,0,0.05)',
    border:      darkMode ? 'rgba(255,255,255,0.06)'   : 'rgba(0,0,0,0.08)',
    track:       darkMode ? 'rgba(255,255,255,0.06)'   : 'rgba(0,0,0,0.08)',
    text0:       darkMode ? '#F0EEF8'                  : '#0D0D12',
    text1:       darkMode ? '#9B99A8'                  : '#6B7280',
    text2:       darkMode ? 'rgba(148,163,184,0.40)'   : '#A09B96',
    accent:      '#6366F1',
    green:       '#10B981',
    amber:       '#F59E0B',
  };

  // ── Step 3: Weekly data ───────────────────────────────────────────────────────
  const weekDays  = getWeekDays();
  const todayStr  = new Date().toDateString();
  const streak    = computeStreak(sessions.weekly);
  const wkTotals  = weeklyTotals(sessions.weekly);

  const streakBadge =
    streak >= 7 ? { label: 'Semaine parfaite', emoji: '🌟', color: T.green,  bg: 'rgba(16,185,129,0.12)', bd: 'rgba(16,185,129,0.25)' } :
    streak >= 5 ? { label: 'Machine',          emoji: '🔥', color: T.accent, bg: 'rgba(99,102,241,0.12)', bd: 'rgba(99,102,241,0.25)' } :
    streak >= 3 ? { label: 'Momentum',         emoji: '⚡', color: T.amber,  bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.25)' } :
    null;

  // ── Step 4: Night alert ───────────────────────────────────────────────────────
  const hour           = new Date().getHours();
  const isLateNight    = hour >= 23;
  const isNightSession = hour >= 20;
  const showNightAlert = (isNightSession) && !nightDismissed && !hasStarted && !completed;
  const nightMsg = isLateNight
    ? { text: 'Ton cerveau est fatigué. Cette session compte — mais dors avant de décider.', agent: 'Le Catalyseur' }
    : { text: 'Session nocturne — les décisions prises après 20h méritent une révision demain matin.', agent: 'Le Stratège' };

  // ── Log stats ─────────────────────────────────────────────────────────────────
  const logTotal     = logEntries.reduce((a, e) => a + (e.duration || 0), 0);
  const logCompleted = logEntries.filter(e => e.result === 'completed').length;
  const logPct       = logEntries.length > 0 ? Math.round(logCompleted / logEntries.length * 100) : 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        @keyframes ringPulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
        @keyframes ftFadeIn     { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── Main card ── */}
      <div className="w-full rounded-2xl p-5"
        style={{
          background:  T.bg,
          border:      `1px solid rgba(${rgb},${running ? 0.3 : 0.12})`,
          boxShadow:   running ? `0 0 32px rgba(${rgb},0.08)` : 'none',
          transition:  'all 0.3s ease',
        }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 6,
            background: `rgba(${rgb}, 0.12)`,
            border: `1px solid rgba(${rgb}, 0.2)`,
          }}>
            <Timer size={12} style={{ color: `rgb(${rgb})` }} strokeWidth={2} />
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: `rgba(${rgb},0.7)` }}>
            Focus Timer
          </span>
          {running && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: `rgb(${rgb})`, animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: `rgba(${rgb},0.5)` }}>
                en cours
              </span>
            </span>
          )}
        </div>

        {/* Duration pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {durations.map((d, i) => (
            <button key={i} onClick={() => selectDuration(i)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: running ? 'not-allowed' : 'pointer',
                background: selectedIdx === i ? `rgba(${rgb},0.12)` : 'transparent',
                border:     `1px solid rgba(${rgb},${selectedIdx === i ? 0.35 : 0.12})`,
                color:      selectedIdx === i ? `rgb(${rgb})` : `rgba(${rgb},0.4)`,
                opacity:    running ? 0.5 : 1,
                transition: 'all 0.15s',
              }}>
              {d.label}'
            </button>
          ))}

          {!customMins && !showCustom && (
            <button disabled={running} onClick={() => { setShowCustom(true); setTimeout(() => customInputRef.current?.focus(), 40); }}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'transparent', border: `1px solid rgba(${rgb},0.12)`,
                color: `rgba(${rgb},0.4)`, opacity: running ? 0.4 : 1, display: 'flex', alignItems: 'center',
              }}>
              <Plus size={10} />
            </button>
          )}

          {showCustom && (
            <form onSubmit={submitCustom} style={{ flex: 1 }}>
              <input ref={customInputRef} value={customInput} type="number" min="5" max="180"
                onChange={e => setCustomInput(e.target.value)}
                onBlur={submitCustom}
                onKeyDown={e => { if (e.key === 'Escape') { setShowCustom(false); setCustomInput(''); } }}
                placeholder="min"
                style={{
                  width: '100%', background: 'transparent', outline: 'none',
                  border: `1px solid rgba(${rgb},0.35)`, borderRadius: 8,
                  color: `rgb(${rgb})`, fontSize: 12, fontWeight: 700,
                  textAlign: 'center', padding: '5px 6px',
                }}
              />
            </form>
          )}
        </div>

        {/* ── Step 1: Intention input (pre-start) ── */}
        {!hasStarted && !completed && (
          <div style={{ marginBottom: 12, animation: 'ftFadeIn 0.25s ease' }}>
            <label style={{ display: 'block', fontSize: 11, color: T.text1, marginBottom: 6 }}>
              Sur quoi tu travailles ?
            </label>
            <input
              value={intentionInput}
              onChange={e => setIntentionInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') toggleRunning(); }}
              placeholder="Ex: Contacter 3 prospects Bouclier"
              style={{
                width: '100%', background: 'transparent', outline: 'none',
                border: 'none', borderBottom: `1px solid ${T.border}`,
                color: T.text0, fontSize: 13, paddingBottom: 5,
                caretColor: T.accent,
              }}
            />
          </div>
        )}

        {/* ── Client association (pre-start) ── */}
        {!hasStarted && !completed && (
          <div style={{ marginBottom: 12, animation: 'ftFadeIn 0.28s ease' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.text2, marginBottom: 6 }}>
              {lang === 'fr' ? 'Client associé' : 'Associated client'}
            </div>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                background: T.bgEl, border: `1px solid ${T.border}`,
                color: T.text0, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value={GENERAL_CLIENT} style={{ background: darkMode ? '#1A1A24' : '#fff', color: T.text0 }}>
                {lang === 'fr' ? 'Général / Admin' : 'General / Admin'}
              </option>
              {retainers.map((r) => (
                <option key={r.id} value={String(r.id)} style={{ background: darkMode ? '#1A1A24' : '#fff', color: T.text0 }}>
                  {r.name} — ${Number(r.amount || 0).toLocaleString()}/mo
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── Step 2: Category pills (pre-start) ── */}
        {!hasStarted && !completed && (
          <div style={{ marginBottom: 16, animation: 'ftFadeIn 0.3s ease' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.text2, marginBottom: 6 }}>
              Catégorie
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES.map(cat => (
                <button key={cat}
                  onClick={() => {
                    const next = category === cat ? null : cat;
                    setCategory(next);
                    if (next === 'Autre') {
                      setAutreLabel('');
                      setTimeout(() => autreLabelRef.current?.focus(), 40);
                    }
                  }}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                    background: category === cat ? T.accent : T.bgEl,
                    color:      category === cat ? '#FFFFFF' : T.text1,
                  }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Autre — custom label input */}
            {category === 'Autre' && (
              <div style={{ marginTop: 8, animation: 'ftFadeIn 0.2s ease' }}>
                <input
                  ref={autreLabelRef}
                  value={autreLabel}
                  onChange={e => setAutreLabel(e.target.value)}
                  placeholder={lang === 'fr' ? 'Précise ce que tu fais…' : 'Specify what you\'re working on…'}
                  style={{
                    width: '100%', background: 'transparent', outline: 'none',
                    border: 'none', borderBottom: `1px solid ${T.border}`,
                    color: T.text0, fontSize: 12, paddingBottom: 4,
                    caretColor: T.accent,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── SVG Ring ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', animation: pulsing ? 'ringPulse 2s ease-in-out infinite' : 'none' }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
              <circle cx="60" cy="60" r={radius} fill="none" stroke={T.track} strokeWidth="4" />
              <circle cx="60" cy="60" r={radius} fill="none"
                stroke={ringStroke} strokeWidth="4" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={dashOff}
                style={{ transition: running ? 'stroke-dashoffset 1s linear, stroke 0.6s ease' : 'stroke 0.6s ease' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{
                fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em',
                color: T.text0, transition: 'color 0.3s ease', fontVariantNumeric: 'tabular-nums',
              }}>
                {formatTime(remaining)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Step 1: Intention label (while running / paused) ── */}
        {hasStarted && !completed && (intention || intentionInput) && (
          <div style={{ textAlign: 'center', marginBottom: 10, animation: 'ftFadeIn 0.2s ease' }}>
            <span style={{ fontSize: 11, color: T.text2, fontStyle: 'italic' }}>
              Focus : {intention || intentionInput}
            </span>
          </div>
        )}

        {/* ── COMPLETED state ── */}
        {completed && (
          <div style={{ animation: 'ftFadeIn 0.25s ease' }}>

            {/* Intention stays visible */}
            {(intention || intentionInput) && (
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: T.text2, fontStyle: 'italic' }}>
                  Focus : {intention || intentionInput}
                </span>
              </div>
            )}

            {/* Blocker input */}
            {showBlocker && (
              <div style={{ marginBottom: 12, animation: 'ftFadeIn 0.2s ease' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.text1, marginBottom: 6 }}>
                  <span>Qu'est-ce qui t'a bloqué ?</span>
                  <span style={{ color: T.text2 }}>{blockerCD}s</span>
                </label>
                <form onSubmit={handleBlockerSubmit}>
                  <input
                    ref={blockerInputRef}
                    value={blockerInput}
                    onChange={e => setBlockerInput(e.target.value)}
                    placeholder={lang === 'fr' ? 'Optionnel — Entrée pour passer' : 'Optional — Enter to skip'}
                    style={{
                      width: '100%', background: 'transparent', outline: 'none',
                      border: 'none', borderBottom: `1px solid ${T.border}`,
                      color: T.text0, fontSize: 12, paddingBottom: 4,
                    }}
                  />
                </form>
                <div style={{ height: 2, background: T.border, borderRadius: 1, marginTop: 6 }}>
                  <div style={{
                    height: '100%', background: T.accent, borderRadius: 1,
                    width: `${blockerCD * 10}%`, transition: 'width 1s linear',
                  }} />
                </div>
              </div>
            )}

            {/* Result buttons */}
            {!resultSaved && !showBlocker && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: T.text2, textAlign: 'center', marginBottom: 8 }}>
                  Comment s'est passée cette session ?
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleResultClick('completed')}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid rgba(16,185,129,0.3)',
                      background: 'rgba(16,185,129,0.1)', color: T.green,
                    }}>
                    ✓ Complété
                  </button>
                  <button onClick={() => handleResultClick('partial')}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid rgba(245,158,11,0.3)',
                      background: 'rgba(245,158,11,0.1)', color: T.amber,
                    }}>
                    ~ Partiellement
                  </button>
                  <button onClick={() => handleResultClick('failed')}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', border: `1px solid ${T.border}`,
                      background: T.bgEl, color: T.text1,
                    }}>
                    ✗ Pas fait
                  </button>
                </div>
              </div>
            )}

            {/* Saved confirmation */}
            {resultSaved && (
              <div style={{ textAlign: 'center', marginBottom: 12, animation: 'ftFadeIn 0.2s ease' }}>
                <span style={{ fontSize: 12, color: resultColor(result), fontWeight: 600 }}>
                  {resultIcon(result)} Session enregistrée
                </span>
                {blocker && (
                  <p style={{ fontSize: 11, color: T.text2, marginTop: 4, fontStyle: 'italic' }}>
                    Bloquant : {blocker}
                  </p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={reset}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', border: `1px solid rgba(${rgb},0.2)`,
                  color: `rgba(${rgb},0.6)`, background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                <RotateCcw size={10} /> Reset
              </button>

              {/* Step 5: Debrief button (after result saved) */}
              {resultSaved && onStartSession && (
                <button onClick={handleDebrief}
                  style={{
                    flex: 2, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: `1px solid rgba(${rgb},0.35)`,
                    color: T.accent, background: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                  Débriefer avec les agents <ChevronRight size={12} />
                </button>
              )}

              {/* Fallback session button before result */}
              {!resultSaved && !showBlocker && onStartSession && (
                <button onClick={onStartSession}
                  style={{
                    flex: 2, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    background: `linear-gradient(135deg, rgba(${rgb},0.85), rgba(${rgb},0.65))`,
                    color: 'white',
                  }}>
                  → Session stratégique
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── IDLE / RUNNING state ── */}
        {!completed && (
          <div>
            {/* Step 4: Night alert */}
            {showNightAlert && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 10px', borderRadius: 8, marginBottom: 10,
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.14)',
                animation: 'ftFadeIn 0.25s ease',
              }}>
                <span style={{ fontSize: 11, lineHeight: 1.6, color: T.text2, fontStyle: 'italic', flex: 1 }}>
                  "{nightMsg.text}"
                  <br />
                  <span style={{ fontSize: 10 }}>— {nightMsg.agent}</span>
                </span>
                <button onClick={() => setNightDismissed(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text2, padding: 2, flexShrink: 0, marginTop: 1 }}>
                  <X size={11} />
                </button>
              </div>
            )}

            {/* Play / Pause button */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={toggleRunning}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: running ? `rgba(${rgb},0.08)` : `linear-gradient(135deg, rgba(${rgb},0.85), rgba(${rgb},0.65))`,
                  border:     running ? `1px solid rgba(${rgb},0.2)` : 'none',
                  color:      running ? `rgb(${rgb})` : 'white',
                  transition: 'all 0.2s ease',
                }}>
                {running ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Démarrer</>}
              </button>
              {(running || (hasStarted && remaining !== totalSeconds)) && (
                <button onClick={reset}
                  style={{
                    padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid rgba(${rgb},0.15)`, color: `rgba(${rgb},0.4)`, background: 'transparent',
                  }}>
                  <RotateCcw size={12} />
                </button>
              )}
            </div>

            {/* Quote (idle only) */}
            {!running && !hasStarted && (
              <div style={{ opacity: quoteVisible ? 1 : 0, transition: 'opacity 0.2s ease', textAlign: 'center', marginTop: 12 }}>
                <p style={{ fontSize: 11, lineHeight: 1.5, fontStyle: 'italic', color: T.text2 }}>
                  "{quote.text}"
                </p>
                <p style={{ fontSize: 11, fontStyle: 'italic', color: T.text2, marginTop: 3 }}>
                  — {quote.agent}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Weekly streak ── */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid rgba(${rgb},0.08)` }}>

          {/* 7-day grid */}
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 8 }}>
            {weekDays.map((d, i) => {
              const key     = d.toDateString();
              const isToday = key === todayStr;
              const count   = sessions.weekly[key]?.count || 0;
              const bg      = count >= 3 ? T.accent
                            : count >= 1 ? 'rgba(99,102,241,0.30)'
                            : 'rgba(255,255,255,0.04)';
              return (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6, background: bg,
                    border: isToday ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                    marginBottom: 3, transition: 'all 0.2s',
                  }} />
                  <span style={{ fontSize: 9, color: isToday ? T.accent : T.text2 }}>
                    {DAY_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Streak badge */}
          {streakBadge && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <span style={{
                padding: '2px 10px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                background: streakBadge.bg, color: streakBadge.color,
                border: `1px solid ${streakBadge.bd}`,
              }}>
                {streakBadge.emoji} {streakBadge.label} · {streak}j
              </span>
            </div>
          )}

          {/* Weekly stats + category tooltip */}
          <div ref={catTipRef} style={{ position: 'relative', textAlign: 'center' }}>
            <button
              onClick={() => setShowCatTip(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: T.text2 }}>
              {t('timer.weekStats', lang, { count: `${wkTotals.count} session${wkTotals.count !== 1 ? 's' : ''}`, mins: fmtMins(wkTotals.mins) })}
            </button>

            {showCatTip && (() => {
              const bd = getCatBreakdown();
              return bd.length > 0 ? (
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                  transform: 'translateX(-50%)',
                  background: darkMode ? '#1A1A24' : '#fff',
                  border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: '7px 12px', fontSize: 11, color: T.text1,
                  whiteSpace: 'nowrap', zIndex: 10,
                  animation: 'ftFadeIn 0.15s ease',
                }}>
                  {bd.join(' · ')}
                </div>
              ) : null;
            })()}
          </div>

          {/* Step 6: History link */}
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <button onClick={() => setShowLog(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 11, color: T.accent,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
              Voir l'historique
              <ChevronRight size={10} style={{
                transform: showLog ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Step 6: History panel ── */}
      {showLog && (
        <div style={{
          marginTop: 8, borderRadius: 16,
          background: darkMode ? 'rgba(10,14,24,0.85)' : 'rgba(255,255,255,0.95)',
          border: `1px solid ${T.border}`, padding: 16,
          animation: 'ftFadeIn 0.2s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.text1 }}>
              Historique
            </span>
            {logEntries.length > 0 && (
              <span style={{ fontSize: 11, color: T.text2 }}>
                Total : {fmtMins(logTotal)} · Complétion : {logPct}%
              </span>
            )}
          </div>

          {logEntries.length === 0 ? (
            <p style={{ fontSize: 12, color: T.text2, textAlign: 'center', padding: '12px 0' }}>
              Aucune session enregistrée
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logEntries.slice(0, 10).map(e => (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, background: T.bgEl,
                }}>
                  <span style={{ fontSize: 14, color: resultColor(e.result), flexShrink: 0, width: 16, textAlign: 'center' }}>
                    {resultIcon(e.result)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: T.text0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.intention || '—'}
                    </div>
                    <div style={{ fontSize: 10, color: T.text2, marginTop: 1 }}>
                      {e.category && <span>{e.category} · </span>}
                      {fmtMins(e.duration || 0)}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: T.text2, flexShrink: 0 }}>
                    {fmtDate(e.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

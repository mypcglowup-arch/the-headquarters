import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Map, Shield, Users, Crosshair, Trophy, Timer, TrendingUp,
  Zap, Brain, Activity, RefreshCw, Lock, Search, Swords,
  DollarSign, Handshake,
} from 'lucide-react';

// ── Storage helpers ────────────────────────────────────────────────────────────
const LS_STEP    = 'qg_tour_step_v2';
const LS_DONE    = 'qg_tour_done_v1';
const LS_PREFILL = 'hq_tour_prefill';

export function hasTourBeenCompleted() {
  try { return !!localStorage.getItem(LS_DONE); } catch { return false; }
}
export function markTourDone() {
  try { localStorage.setItem(LS_DONE, '1'); localStorage.removeItem(LS_STEP); } catch {}
}
function saveStep(n) { try { localStorage.setItem(LS_STEP, String(n)); } catch {} }
function loadStep()  { try { return parseInt(localStorage.getItem(LS_STEP) || '0', 10); } catch { return 0; } }

// ── 18 Tour Stops ──────────────────────────────────────────────────────────────
// page: 'home' | 'dashboard' | 'prospects' | null (null = no navigation needed)

const TOUR_STOPS = [
  // ── HOME — SPOTLIGHT ──────────────────────────────────────────────────────
  {
    id: 'welcome', page: 'home', spotlight: '[data-tour="welcome"]',
    icon: <Shield size={26} strokeWidth={1.5} />, rgb: '212,175,55',
    title: 'Welcome to The Headquarters',
    titleFr: 'Bienvenue au Quartier Général',
    desc: 'Your personal command center for NT Solutions. Six expert advisors, zero bullshit.',
    descFr: 'Ton centre de commande personnel pour NT Solutions. Six conseillers experts, zéro bullshit.',
    quote: 'The best CEOs don\'t have all the answers. They have the right advisors.',
    quoteFr: 'Les meilleurs PDG n\'ont pas toutes les réponses. Ils ont les bons conseillers.',
    quoteAgent: 'The Leverage Master',
  },
  {
    id: 'board', page: 'home', spotlight: '[data-tour="agent-board"]',
    icon: <Users size={26} strokeWidth={1.5} />, rgb: '212,175,55',
    title: 'Your Personal Board of Advisors',
    titleFr: 'Ton conseil d\'administration personnel',
    desc: 'Six experts, 24/7, no ego. They speak only when they have something real to add — and they get sharper with every session. Session 100 is completely different from session 1.',
    descFr: 'Six experts, 24h/24, sans ego. Ils prennent la parole uniquement quand ils ont quelque chose de pertinent — et s\'améliorent à chaque session. La session 100 est complètement différente de la session 1.',
    quote: 'The longer we work together, the less you have to explain.',
    quoteFr: 'Plus on travaille ensemble, moins tu dois expliquer.',
    quoteAgent: 'The Mindset Coach',
  },
  {
    id: 'modes', page: 'home', spotlight: '[data-tour="session-modes"]',
    icon: <Crosshair size={26} strokeWidth={1.5} />, rgb: '249,115,22',
    title: 'Every Conversation Has a Purpose',
    titleFr: 'Chaque conversation a un but',
    desc: 'Quick advice or deep strategy — you set the depth before every session.',
    descFr: 'Conseil rapide ou stratégie profonde — tu choisis le niveau avant chaque session.',
    quote: 'Precision beats volume every time.',
    quoteFr: 'La précision bat le volume à chaque fois.',
    quoteAgent: 'The Black Swan',
  },
  {
    id: 'wins', page: 'home', spotlight: '[data-tour="win-feed"]',
    icon: <Trophy size={26} strokeWidth={1.5} />, rgb: '212,175,55',
    title: 'Every Win Counts',
    titleFr: 'Chaque victoire compte',
    desc: 'Log small victories. Agents reference them when you need momentum most.',
    descFr: 'Enregistre les petites victoires. Les agents s\'y réfèrent quand tu as le plus besoin de momentum.',
    quote: 'Momentum is built win by win, not goal by goal.',
    quoteFr: 'Le momentum se construit victoire par victoire, pas objectif par objectif.',
    quoteAgent: 'The Sales Machine',
  },
  {
    id: 'timer', page: 'home', spotlight: '[data-tour="focus-timer"]',
    icon: <Timer size={26} strokeWidth={1.5} />, rgb: '16,185,129',
    title: 'Deep Work. No Distractions.',
    titleFr: 'Travail profond. Zéro distraction.',
    desc: '25, 50 or 90-minute blocks. Launch a session directly from the timer.',
    descFr: 'Blocs de 25, 50 ou 90 minutes. Lance une session directement depuis le timer.',
    quote: 'Protect your time like your money. Most people protect neither.',
    quoteFr: 'Protège ton temps comme ton argent. La plupart des gens ne protègent ni l\'un ni l\'autre.',
    quoteAgent: 'The Leverage Master',
  },
  {
    id: 'financial', page: 'home', spotlight: '[data-tour="financial-bar"]',
    icon: <TrendingUp size={26} strokeWidth={1.5} />, rgb: '16,185,129',
    title: 'Your Numbers — Always Visible',
    titleFr: 'Tes chiffres — toujours visibles',
    desc: 'Revenue, goal progress, pipeline. Agents see this and adapt their advice accordingly.',
    descFr: 'Revenus, progression vers l\'objectif, pipeline. Les agents voient ça et adaptent leurs conseils.',
    quote: 'What gets measured gets managed. What gets managed gets money.',
    quoteFr: 'Ce qui se mesure se gère. Ce qui se gère rapporte.',
    quoteAgent: 'The Offer Architect',
  },

  // ── HEADER (always visible — spotlight header buttons while still on home) ─
  {
    id: 'deep', page: null, spotlight: '[data-tour="deep-mode"]',
    icon: <Zap size={26} strokeWidth={1.5} />, rgb: '139,92,246',
    title: 'Deep Mode — Extended Thinking',
    titleFr: 'Deep Mode — Réflexion étendue',
    desc: 'Activates Claude\'s extended thinking. Slower, deeper, better for complex decisions.',
    descFr: 'Active la réflexion étendue de Claude. Plus lent, plus profond, meilleur pour les décisions complexes.',
    quote: 'The quality of your decisions is the quality of your future.',
    quoteFr: 'La qualité de tes décisions, c\'est la qualité de ton futur.',
    quoteAgent: 'The Synthesizer',
  },
  {
    id: 'think', page: null, spotlight: '[data-tour="think-mode"]',
    icon: <Brain size={26} strokeWidth={1.5} />, rgb: '6,182,212',
    title: 'Thinking Mode — Chain of Thought',
    titleFr: 'Thinking Mode — Chaîne de raisonnement',
    desc: 'See the agents reason step by step. Perfect for understanding the "why" behind advice.',
    descFr: 'Vois les agents raisonner étape par étape. Parfait pour comprendre le "pourquoi" derrière les conseils.',
    quote: 'Understanding the reasoning changes how you act on the advice.',
    quoteFr: 'Comprendre le raisonnement change la façon dont tu agis sur les conseils.',
    quoteAgent: 'The Mindset Coach',
  },

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  {
    id: 'pulse', page: 'dashboard', spotlight: '[data-tour="business-pulse"]',
    icon: <Activity size={26} strokeWidth={1.5} />, rgb: '99,102,241',
    title: 'Your Annual Goal — Live',
    titleFr: 'Ton objectif annuel — en direct',
    desc: 'Track your revenue progress toward your annual goal. Every dollar, in real time.',
    descFr: 'Suis ta progression vers ton objectif annuel. Chaque dollar, en temps réel.',
    quote: 'The numbers don\'t lie. Ever.',
    quoteFr: 'Les chiffres ne mentent jamais.',
    quoteAgent: 'The Offer Architect',
  },
  {
    id: 'pipeline', page: 'dashboard', spotlight: '[data-tour="pipeline"]',
    icon: <RefreshCw size={26} strokeWidth={1.5} />, rgb: '99,102,241',
    title: 'Your Prospect Pipeline',
    titleFr: 'Ton pipeline de prospects',
    desc: 'From first contact to signed deal. Agents see your pipeline and push accordingly.',
    descFr: 'Du premier contact au contrat signé. Les agents voient ton pipeline et poussent en conséquence.',
    quote: 'An empty pipeline is a future crisis. Fill it today.',
    quoteFr: 'Un pipeline vide, c\'est une crise future. Remplis-le aujourd\'hui.',
    quoteAgent: 'The Sales Machine',
  },
  {
    id: 'retainers', page: 'dashboard', spotlight: '[data-tour="retainers"]',
    icon: <Lock size={26} strokeWidth={1.5} />, rgb: '16,185,129',
    title: 'Active Retainers — Recurring Revenue',
    titleFr: 'Retainers actifs — Revenus récurrents',
    desc: 'Track your MRR clients. Agents know your stability and advise based on it.',
    descFr: 'Suis tes clients MRR. Les agents connaissent ta stabilité et conseillent en fonction.',
    quote: 'Recurring revenue is the only revenue that lets you think long-term.',
    quoteFr: 'Les revenus récurrents sont les seuls qui te permettent de penser long terme.',
    quoteAgent: 'The Leverage Master',
  },

  // ── PROSPECTS ─────────────────────────────────────────────────────────────
  {
    id: 'prosearch', page: 'prospects', spotlight: '[data-tour="prospect-search"]',
    icon: <Search size={26} strokeWidth={1.5} />, rgb: '99,102,241',
    title: 'AI Prospect Discovery',
    titleFr: 'Découverte de prospects par IA',
    desc: 'Find Quebec businesses in any niche, any region. Real data from real pages.',
    descFr: 'Trouve des entreprises québécoises dans n\'importe quelle niche, n\'importe quelle région. Données réelles.',
    quote: 'The best outreach starts with the best target list.',
    quoteFr: 'La meilleure approche commence par la meilleure liste de cibles.',
    quoteAgent: 'The Sales Machine',
  },
  {
    id: 'standard', page: 'prospects', spotlight: '[data-tour="standard-mode"]',
    icon: <Zap size={26} strokeWidth={1.5} />, rgb: '99,102,241',
    title: 'Standard Mode — Wide Spectrum',
    titleFr: 'Mode Standard — Large spectre',
    desc: 'Multiple niches, multiple regions, high volume. Perfect for filling the pipeline fast.',
    descFr: 'Plusieurs niches, plusieurs régions, volume élevé. Parfait pour remplir le pipeline rapidement.',
    quote: 'Volume creates options. Options create leverage.',
    quoteFr: 'Le volume crée des options. Les options créent le levier.',
    quoteAgent: 'The Sales Machine',
  },
  {
    id: 'chirurgi', page: 'prospects', spotlight: '[data-tour="chirurgical-mode"]',
    icon: <Crosshair size={26} strokeWidth={1.5} />, rgb: '239,68,68',
    title: 'Chirurgical Mode — Precision Targeting',
    titleFr: 'Mode Chirurgical — Ciblage de précision',
    desc: 'One agent, one niche, one clear intention. Maximum signal, zero noise.',
    descFr: 'Un agent, une niche, une intention claire. Signal maximal, zéro bruit.',
    quote: 'Wide nets catch everything. Spears catch the right thing.',
    quoteFr: 'Les grands filets attrapent tout. Les lances attrapent la bonne chose.',
    quoteAgent: 'The Black Swan',
  },
];

// ── Illustrations ──────────────────────────────────────────────────────────────

function RoutingIllustration({ rgb }) {
  const orbitIcons = [Swords, Handshake, Brain, Crosshair, Zap, DollarSign];
  return (
    <div className="relative flex items-center justify-center h-20 mb-1">
      {orbitIcons.map((Icon, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const x = 50 + Math.cos(angle) * 38;
        const y = 50 + Math.sin(angle) * 35;
        return (
          <div key={i} className="absolute flex items-center justify-center"
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', opacity: 0.6, color: `rgba(${rgb},0.9)` }}>
            <Icon size={14} strokeWidth={1.5} />
          </div>
        );
      })}
      <div className="z-10 flex items-center justify-center w-8 h-8 rounded-full"
        style={{ background: `rgba(${rgb},0.15)`, boxShadow: `0 0 16px rgba(${rgb},0.4)`, color: `rgb(${rgb})` }}>
        <Brain size={16} strokeWidth={1.5} />
      </div>
      {[0,1,2,3,4,5].map(i => {
        const angle = (i / 6) * Math.PI * 2;
        return (
          <div key={i} className="absolute w-px opacity-20"
            style={{ left: '50%', top: '50%', height: '35px', transformOrigin: '0 0',
              transform: `rotate(${angle}rad)`, background: `rgba(${rgb},0.6)` }} />
        );
      })}
    </div>
  );
}

function ContentIllustration({ rgb }) {
  return (
    <div className="mx-auto w-48 rounded-lg p-3 h-20 flex flex-col justify-between mb-1"
      style={{ background: `rgba(${rgb},0.06)`, border: `1px solid rgba(${rgb},0.2)` }}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full" style={{ background: `rgba(${rgb},0.3)` }} />
        <div className="h-2 flex-1 rounded" style={{ background: `rgba(${rgb},0.15)` }} />
      </div>
      <div className="space-y-1">
        <div className="h-1.5 rounded" style={{ background: `rgba(${rgb},0.2)`, width: '90%' }} />
        <div className="h-1.5 rounded" style={{ background: `rgba(${rgb},0.15)`, width: '70%' }} />
        <div className="h-1.5 rounded" style={{ background: `rgba(${rgb},0.1)`, width: '80%' }} />
      </div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: `rgba(${rgb},0.4)` }}>
        LinkedIn · Option A
      </div>
    </div>
  );
}

function LegacyIllustration({ rgb }) {
  return (
    <div className="flex items-end justify-center gap-2 h-20 mb-1">
      {[1, 7, 30, 100].map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="w-8 rounded-t-sm"
            style={{ height: `${12 + i * 14}px`, background: `rgba(${rgb},${0.2 + i * 0.2})` }} />
          <span className="text-[8px] font-bold" style={{ color: `rgba(${rgb},0.5)` }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

// ── Confetti ──────────────────────────────────────────────────────────────────

function Confetti() {
  const pieces = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    dur: 2 + Math.random() * 1.5,
    delay: Math.random() * 1.2,
    color: ['#f97316','#d4af37','#a855f7','#22d3ee','#10b981','#f43f5e'][i % 6],
    size: 5 + Math.random() * 7,
    round: Math.random() > 0.5,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 999 }}>
      {pieces.map((p) => (
        <div key={p.id} className="absolute animate-confetti"
          style={{
            left: `${p.x}%`, top: '-12px',
            width: p.size, height: p.size,
            background: p.color,
            borderRadius: p.round ? '50%' : '2px',
            '--dur': `${p.dur}s`,
            '--delay': `${p.delay}s`,
          }} />
      ))}
    </div>
  );
}

// ── Final cinematic card ───────────────────────────────────────────────────────

function FinalCard({ darkMode, lang, onStart, onClose }) {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100, y: 20 + Math.random() * 60,
    dx: (Math.random() - 0.5) * 60, dy: -(20 + Math.random() * 60),
    dur: 3 + Math.random() * 3, delay: Math.random() * 3,
    size: 1 + Math.random() * 2,
    color: ['#d4af37','#f97316','#a855f7','#22d3ee'][i % 4],
  }));

  return createPortal(
    <div className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ zIndex: 80, background: 'rgba(4,6,14,0.97)' }}>
      {particles.map((p) => (
        <div key={p.id} className="absolute rounded-full animate-particle"
          style={{
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.size, height: p.size,
            background: p.color,
            '--dx': `${p.dx}px`, '--dy': `${p.dy}px`,
            '--dur': `${p.dur}s`, '--delay': `${p.delay}s`,
          }} />
      ))}

      <div className="text-center px-8 max-w-lg relative z-10">
        <div className="animate-final-in" style={{ '--delay': '0s' }}>
          <div className="flex justify-center mb-8">
            <div className="flex items-center justify-center w-20 h-20 rounded-full"
              style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 0 40px rgba(212,175,55,0.15)' }}>
              <Shield size={40} strokeWidth={1.25} style={{ color: 'rgba(212,175,55,0.9)' }} />
            </div>
          </div>
        </div>
        <h1 className="animate-final-in font-display font-black leading-tight mb-4"
          style={{ fontSize: 'clamp(2rem,6vw,3rem)', color: '#f8fafc', '--delay': '0.3s' }}>
          {lang === 'fr' ? 'Ton conseil est prêt.' : 'Your board is ready.'}
        </h1>
        <p className="animate-final-in text-base font-light mb-12"
          style={{ color: 'rgba(148,163,184,0.65)', '--delay': '0.7s' }}>
          {lang === 'fr'
            ? 'Ils savent pourquoi tu es là. Commençons.'
            : 'They know why you are here. Let us begin.'}
        </p>
        <div className="animate-final-in" style={{ '--delay': '1.1s' }}>
          <button
            onClick={onStart}
            className="px-10 py-4 rounded-2xl font-display font-bold text-base uppercase tracking-widest transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.9), rgba(245,158,11,0.8))',
              color: '#0f172a',
              boxShadow: '0 0 40px rgba(212,175,55,0.25)',
            }}
          >
            {lang === 'fr' ? 'Lancer ma première session →' : 'Start My First Session →'}
          </button>
        </div>
        <div className="animate-final-in mt-6" style={{ '--delay': '1.4s' }}>
          <button onClick={onClose} className="text-xs" style={{ color: 'rgba(148,163,184,0.25)' }}>
            {lang === 'fr' ? 'Fermer' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function resetElStyles(el) {
  if (!el) return;
  el.style.transform = '';
  el.style.boxShadow = '';
  el.style.transition = '';
  el.style.position = '';
  el.style.zIndex = '';
}

// ── TourLauncher (floating button, always visible) ─────────────────────────────

export function TourLauncher({ onStart, isActive }) {
  const [hovered, setHovered] = useState(false);
  if (isActive) return null;
  return createPortal(
    <button
      onClick={onStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Visite guidée / Guided tour"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 60,
        width: 44, height: 44, borderRadius: '50%',
        background: hovered ? 'rgba(99,102,241,0.95)' : 'rgba(99,102,241,0.75)',
        border: '1px solid rgba(99,102,241,0.5)',
        color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: hovered
          ? '0 4px 24px rgba(99,102,241,0.5)'
          : '0 4px 16px rgba(99,102,241,0.25)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'all 0.2s ease',
        transform: hovered ? 'scale(1.08)' : 'scale(1)',
      }}
    >
      <Map size={18} />
    </button>,
    document.body
  );
}

// ── Main GuidedTour component ──────────────────────────────────────────────────

export default function GuidedTour({
  darkMode, lang = 'fr',
  onClose, onStartSession,
  currentPage = 'home',
  onNavigate,
}) {
  const [step, setStep]                     = useState(() => Math.min(loadStep(), TOUR_STOPS.length - 1));
  const [spotlightRect, setSpotlightRect]   = useState(null);
  const [backdropVisible, setBackdropVisible] = useState(false);
  const [cardKey, setCardKey]               = useState(0);
  const [showFinal, setShowFinal]           = useState(false);
  const [showConfetti, setShowConfetti]     = useState(false);
  const [transitioning, setTransitioning]   = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const touchStartX                         = useRef(null);
  const prevEl                              = useRef(null);

  const isFinal = step >= TOUR_STOPS.length;
  const current = TOUR_STOPS[Math.min(step, TOUR_STOPS.length - 1)];
  const [spotlightRetry, setSpotlightRetry] = useState(0);
  const prevStepIdRef = useRef(null);

  // ── Page navigation ────────────────────────────────────────────────────────

  function goTo(idx) {
    if (idx < 0 || idx > TOUR_STOPS.length) return;
    if (idx === TOUR_STOPS.length) {
      // Trigger final card
      saveStep(TOUR_STOPS.length);
      setStep(TOUR_STOPS.length);
      return;
    }

    const target = TOUR_STOPS[idx];
    const needsNav = target.page && target.page !== currentPage;

    if (needsNav) {
      setBackdropVisible(false);
      resetElStyles(prevEl.current);
      prevEl.current = null;
      setSpotlightRect(null);
      setTransitioning(true);

      setTimeout(() => {
        onNavigate?.(target.page);
        setTimeout(() => {
          saveStep(idx);
          setStep(idx);
          setCardKey((k) => k + 1);
          setTimeout(() => setTransitioning(false), 80);
        }, 420); // wait for page render
      }, 200); // fade-to-black duration
    } else {
      saveStep(idx);
      setStep(idx);
      setCardKey((k) => k + 1);
    }
  }

  function next() {
    if (step >= TOUR_STOPS.length - 1) { goTo(TOUR_STOPS.length); return; }
    goTo(step + 1);
  }

  function prev() {
    if (step > 0) goTo(step - 1);
  }

  function exitTour() {
    markTourDone();
    resetElStyles(prevEl.current);
    window.dispatchEvent(new CustomEvent('tour:close-search-modal'));
    onClose();
  }

  function finish() {
    markTourDone();
    window.dispatchEvent(new CustomEvent('tour:close-search-modal'));
    try {
      localStorage.setItem(LS_PREFILL,
        lang === 'fr'
          ? 'Je viens de finir la visite guidée. Par où on commence ?'
          : 'I just finished the guided tour. Where do we start?');
    } catch {}
    setShowConfetti(true);
    setTimeout(() => {
      setShowConfetti(false);
      onNavigate?.('home');
      onClose();
      onStartSession?.();
    }, 2600);
  }

  // ── SearchModal auto-open for chirurgi stop ────────────────────────────────

  useEffect(() => {
    const currId = TOUR_STOPS[step]?.id;
    const prevId = prevStepIdRef.current;

    const modalStops = new Set(['standard', 'chirurgi']);
    if (modalStops.has(currId) && !transitioning) {
      window.dispatchEvent(new CustomEvent('tour:open-search-modal'));
    }
    if (modalStops.has(prevId) && !modalStops.has(currId)) {
      window.dispatchEvent(new CustomEvent('tour:close-search-modal'));
    }

    prevStepIdRef.current = currId;
  }, [step, transitioning]);

  // ── Spotlight ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isFinal || !current?.spotlight || transitioning) {
      setSpotlightRect(null);
      setBackdropVisible(false);
      resetElStyles(prevEl.current);
      prevEl.current = null;
      return;
    }

    const el = document.querySelector(current.spotlight);
    if (!el) {
      setSpotlightRect(null);
      // Element not in DOM yet (e.g. modal not open) — retry after 350ms
      const retryTimer = setTimeout(() => setSpotlightRetry((r) => r + 1), 350);
      return () => clearTimeout(retryTimer);
    }

    setBackdropVisible(false);
    resetElStyles(prevEl.current);
    prevEl.current = null;

    // Scroll element into view (handles both window scroll and container scroll)
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });

    let raf1, raf2, timer;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setSpotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height });

        el.style.transition = 'transform 300ms ease, box-shadow 300ms ease';
        el.style.transform = 'scale(1.01)';
        el.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.08), 0 0 40px 8px rgba(255,255,255,0.04)';
        el.style.position = 'relative';
        el.style.zIndex = '1';
        prevEl.current = el;

        timer = setTimeout(() => setBackdropVisible(true), 80);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
      resetElStyles(el);
    };
  }, [step, isFinal, transitioning, spotlightRetry]);

  // Show final card
  useEffect(() => {
    if (isFinal) setShowFinal(true);
  }, [isFinal]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if (showExitConfirm) {
        if (e.key === 'Escape' || e.key === 'n') setShowExitConfirm(false);
        if (e.key === 'Enter' || e.key === 'y') exitTour();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') setShowExitConfirm(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, showExitConfirm]);

  // ── Touch swipe ────────────────────────────────────────────────────────────

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -50) next();
    else if (dx > 50) prev();
    touchStartX.current = null;
  }

  // ── Final card ─────────────────────────────────────────────────────────────

  if (showFinal) {
    return (
      <>
        {showConfetti && <Confetti />}
        <FinalCard
          darkMode={darkMode}
          lang={lang}
          onStart={finish}
          onClose={finish}
        />
      </>
    );
  }

  const rgb  = current.rgb;
  const pad  = 12;

  // Illustration selector
  const illustrations = {
    routing: <RoutingIllustration rgb={rgb} />,
    content: <ContentIllustration rgb={rgb} />,
    legacy:  <LegacyIllustration rgb={rgb} />,
  };
  const illust = illustrations[current.id];

  const progressPct = ((step + 1) / TOUR_STOPS.length) * 100;

  return createPortal(
    <>
      {/* ── Fade-black page transition overlay ── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 75,
          background: 'rgba(0,0,0,0.85)',
          opacity: transitioning ? 1 : 0,
          transition: transitioning ? 'opacity 200ms ease' : 'opacity 180ms ease',
        }}
      />

      {/* ── Progress bar ── */}
      <div
        className="fixed top-0 left-0 right-0 pointer-events-none"
        style={{ zIndex: 76, height: 3, background: 'rgba(99,102,241,0.12)' }}
      >
        <div style={{
          height: '100%',
          width: `${progressPct}%`,
          background: '#6366F1',
          transition: 'width 0.4s ease',
          boxShadow: '0 0 6px rgba(99,102,241,0.5)',
        }} />
      </div>

      <div
        className="fixed inset-0"
        style={{ zIndex: 70 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* ── SVG spotlight mask ── */}
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 71, opacity: backdropVisible ? 1 : 0, transition: 'opacity 350ms ease' }}
        >
          {spotlightRect ? (
            <defs>
              <mask id="tour-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={spotlightRect.left - pad} y={spotlightRect.top - pad}
                  width={spotlightRect.width + pad * 2} height={spotlightRect.height + pad * 2}
                  rx="14" fill="black"
                />
              </mask>
            </defs>
          ) : null}
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)"
            mask={spotlightRect ? 'url(#tour-mask)' : undefined} />
          {/* Purple spotlight border */}
          {spotlightRect && (
            <rect
              x={spotlightRect.left - pad} y={spotlightRect.top - pad}
              width={spotlightRect.width + pad * 2} height={spotlightRect.height + pad * 2}
              rx="14"
              fill="none"
              stroke="#6366F1"
              strokeWidth="2"
              opacity="0.75"
            />
          )}
        </svg>

        {/* ── Click-away to exit ── */}
        <div className="fixed inset-0" style={{ zIndex: 71 }}
          onClick={(e) => { if (!e.target.closest('[data-tour-card]')) setShowExitConfirm(true); }} />

        {/* ── Tour card ── */}
        <div
          key={cardKey}
          data-tour-card
          className="fixed left-0 right-0 bottom-0 mx-auto max-w-md px-4 pb-6 animate-tour-card"
          style={{ zIndex: 72 }}
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: darkMode ? 'rgba(6,10,20,0.97)' : 'rgba(255,255,255,0.99)',
              border: `1px solid rgba(${rgb},0.25)`,
              boxShadow: `0 -8px 40px rgba(${rgb},0.08), 0 0 0 1px rgba(${rgb},0.06)`,
            }}
          >
            {/* Top accent line */}
            <div className="h-0.5" style={{
              background: `linear-gradient(90deg, rgba(${rgb},0.9), rgba(${rgb},0.1))`
            }} />

            <div className="px-6 pt-5 pb-4">
              {/* Icon + illustration */}
              <div className="text-center mb-3">
                {illust || (
                  <div className="flex justify-center mb-2" style={{ color: `rgba(${rgb}, 0.85)` }}>
                    {current.icon}
                  </div>
                )}
                {illust && (
                  <div className="flex justify-center mb-1" style={{ color: `rgba(${rgb}, 0.75)` }}>
                    {current.icon}
                  </div>
                )}
              </div>

              {/* Page breadcrumb pill */}
              {current.page && (
                <div className="flex justify-center mb-2">
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{
                      background: `rgba(${rgb},0.08)`,
                      color: `rgba(${rgb},0.55)`,
                      border: `1px solid rgba(${rgb},0.15)`,
                    }}>
                    {current.page === 'home'       ? (lang === 'fr' ? 'Accueil' : 'Home')
                     : current.page === 'dashboard' ? 'Dashboard'
                     : current.page === 'prospects' ? 'Prospects'
                     : ''}
                  </span>
                </div>
              )}

              {/* Title */}
              <h3 className="font-display font-black text-center text-base leading-tight mb-2"
                style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
                {lang === 'fr' && current.titleFr ? current.titleFr : current.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-center leading-relaxed mb-3"
                style={{ color: darkMode ? 'rgba(148,163,184,0.7)' : '#64748b' }}>
                {lang === 'fr' && current.descFr ? current.descFr : current.desc}
              </p>

              {/* Agent quote */}
              <div className="rounded-xl px-4 py-3 mb-4 text-center"
                style={{ background: `rgba(${rgb},0.06)`, border: `1px solid rgba(${rgb},0.12)` }}>
                <p className="text-xs italic leading-relaxed" style={{ color: `rgba(${rgb},0.85)` }}>
                  "{lang === 'fr' && current.quoteFr ? current.quoteFr : current.quote}"
                </p>
                <p className="text-[10px] mt-1 font-semibold uppercase tracking-widest"
                  style={{ color: `rgba(${rgb},0.45)` }}>
                  — {current.quoteAgent}
                </p>
              </div>

              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 mb-4 flex-wrap">
                {TOUR_STOPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className="rounded-full transition-all duration-300"
                    style={{
                      width: i === step ? 18 : 6,
                      height: 6,
                      background: i === step
                        ? `rgb(${rgb})`
                        : i < step
                          ? `rgba(${rgb},0.35)`
                          : `rgba(${rgb},0.12)`,
                    }}
                  />
                ))}
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExitConfirm(true)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: 'transparent',
                    border: `1px solid rgba(${rgb},0.12)`,
                    color: `rgba(${rgb},0.35)`,
                  }}
                >
                  {lang === 'fr' ? 'Passer' : 'Skip'}
                </button>
                {step > 0 && (
                  <button
                    onClick={prev}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: `rgba(${rgb},0.07)`,
                      border: `1px solid rgba(${rgb},0.15)`,
                      color: `rgba(${rgb},0.6)`,
                    }}
                  >
                    ←
                  </button>
                )}
                <button
                  onClick={next}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                  style={{
                    background: `linear-gradient(135deg, rgba(${rgb},0.88), rgba(${rgb},0.65))`,
                    color: 'white',
                    boxShadow: `0 4px 16px rgba(${rgb},0.2)`,
                  }}
                >
                  {step === TOUR_STOPS.length - 1
                    ? (lang === 'fr' ? 'Terminer →' : 'Finish →')
                    : (lang === 'fr' ? 'Continuer →' : 'Continue →')}
                </button>
              </div>
            </div>
          </div>

          {/* Step counter + keyboard hint */}
          <div className="flex items-center justify-between mt-2.5 px-1">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.25)' }}>
              {step + 1} / {TOUR_STOPS.length}
            </p>
            <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.15)' }}>
              → next · ← prev · Esc exit
            </p>
          </div>
        </div>
      </div>

      {/* ── Exit confirmation modal ── */}
      {showExitConfirm && createPortal(
        <div className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 90, background: 'rgba(0,0,0,0.6)' }}>
          <div
            className="rounded-2xl p-6 max-w-xs w-full mx-4 text-center"
            style={{
              background: darkMode ? 'rgba(15,23,42,0.98)' : '#ffffff',
              border: '1px solid rgba(99,102,241,0.2)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <div className="flex justify-center mb-3">
              <Map size={28} style={{ color: 'rgba(99,102,241,0.6)' }} />
            </div>
            <h4 className="font-bold text-sm mb-2" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
              {lang === 'fr' ? 'Quitter la visite guidée ?' : 'Exit the guided tour?'}
            </h4>
            <p className="text-xs mb-5" style={{ color: 'rgba(148,163,184,0.65)' }}>
              {lang === 'fr'
                ? 'Tu pourras la relancer à tout moment depuis le bouton ⧬ en bas à droite.'
                : 'You can restart it anytime from the ⧬ button in the bottom right.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  color: '#6366F1',
                }}
              >
                {lang === 'fr' ? 'Continuer' : 'Continue'}
              </button>
              <button
                onClick={exitTour}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: 'rgba(148,163,184,0.07)',
                  border: '1px solid rgba(148,163,184,0.12)',
                  color: 'rgba(148,163,184,0.6)',
                }}
              >
                {lang === 'fr' ? 'Quitter' : 'Exit'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}

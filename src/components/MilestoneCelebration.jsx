import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Flame, Gem, Crown } from 'lucide-react';

const MILESTONES = {
  1: {
    Icon: Zap,
    titleFr: 'Première session!',
    titleEn: 'First session!',
    bodyFr: 'Tu viens d\'activer ton quartier général. Le voyage commence maintenant. La consistance bat le talent — commence ici.',
    bodyEn: "You just activated your headquarters. The journey starts now. Consistency beats talent — it starts here.",
    color: '212,175,55',
  },
  7: {
    Icon: Flame,
    titleFr: '7 sessions — La flamme est allumée',
    titleEn: '7 sessions — The flame is lit',
    bodyFr: 'Une semaine de travail stratégique. La plupart des entrepreneurs parlent. Toi, tu agis. Les habitudes se forment en 66 jours — tu es déjà en route.',
    bodyEn: "A full week of strategic work. Most entrepreneurs talk. You act. Habits form in 66 days — you're already on your way.",
    color: '249,115,22',
  },
  30: {
    Icon: Gem,
    titleFr: '30 sessions — Membre fondateur',
    titleEn: '30 sessions — Founding member',
    bodyFr: 'Trente rounds avec ton board. Tu as travaillé tes offres, ta vente, ton mindset. C\'est ce que fait 1% des entrepreneurs. Ton avantage compétitif se creuse.',
    bodyEn: "Thirty rounds with your board. You've worked your offers, your sales, your mindset. That's what 1% of entrepreneurs do. Your edge is widening.",
    color: '139,92,246',
  },
  100: {
    Icon: Crown,
    titleFr: '100 sessions — Élite',
    titleEn: '100 sessions — Elite tier',
    bodyFr: 'Cent sessions stratégiques. Tu fais partie d\'un groupe infinitésimal d\'entrepreneurs qui prennent leur développement aussi sérieusement. Ce n\'est pas de la chance — c\'est de la discipline.',
    bodyEn: "One hundred strategic sessions. You're part of an infinitesimally small group of entrepreneurs who take their development this seriously. This isn't luck — it's discipline.",
    color: '212,175,55',
  },
};

export default function MilestoneCelebration({ sessionCount, darkMode, lang = 'fr', onDismiss }) {
  const milestone = MILESTONES[sessionCount];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (!milestone) return null;
  const rgb = milestone.color;
  const MilestoneIcon = milestone.Icon;
  const title = lang === 'fr' ? milestone.titleFr : milestone.titleEn;
  const body = lang === 'fr' ? milestone.bodyFr : milestone.bodyEn;

  function handleDismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{
        background: `radial-gradient(ellipse at center, rgba(${rgb},0.12) 0%, rgba(0,0,0,0.92) 70%)`,
        backdropFilter: 'blur(12px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-md text-center"
        style={{ transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)', transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ring */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="absolute inset-0 rounded-full blur-2xl opacity-50"
            style={{ background: `rgba(${rgb},0.4)`, transform: 'scale(1.5)' }} />
          <div
            className="relative flex items-center justify-center w-24 h-24 rounded-full"
            style={{ background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.25)` }}
          >
            <MilestoneIcon size={48} strokeWidth={1.5} style={{ color: `rgb(${rgb})` }} />
          </div>
        </div>

        {/* Session badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
          style={{ background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)` }}>
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: `rgb(${rgb})` }}>
            {lang === 'fr' ? 'Session' : 'Session'} #{sessionCount}
          </span>
        </div>

        <h2 className="font-display font-black text-2xl mb-4 leading-tight"
          style={{ color: darkMode ? '#f8fafc' : '#0f172a' }}>
          {title}
        </h2>

        <p className="text-base leading-relaxed mb-8 font-light"
          style={{ color: darkMode ? 'rgba(226,232,240,0.75)' : '#475569' }}>
          {body}
        </p>

        {/* Milestone number display */}
        <div className="text-[80px] font-black leading-none mb-6 select-none"
          style={{ color: `rgba(${rgb},0.15)`, letterSpacing: '-0.05em' }}>
          {sessionCount}
        </div>

        <button
          onClick={handleDismiss}
          className="px-8 py-3 rounded-xl font-bold text-sm transition-all"
          style={{
            background: `linear-gradient(135deg, rgba(${rgb},0.85), rgba(${rgb},0.65))`,
            color: 'white',
            boxShadow: `0 0 24px rgba(${rgb},0.3)`,
          }}
        >
          {lang === 'fr' ? 'Continuer →' : 'Keep going →'}
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * Returns the milestone number if sessionCount hits one, else null.
 */
export function checkMilestone(sessionCount) {
  return [1, 7, 30, 100].includes(sessionCount) ? sessionCount : null;
}

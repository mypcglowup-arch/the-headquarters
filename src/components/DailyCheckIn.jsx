import { useState } from 'react';
import { createPortal } from 'react-dom';

const EMOJIS = ['😫', '😕', '😐', '😊', '🤩'];
const EMOJI_SCORES = [2, 4, 6, 8, 10];
const EMOJI_LABELS = {
  fr: ['Épuisé', 'Pas top', 'Correct', 'Bien', 'En feu'],
  en: ['Drained', 'Not great', 'Okay', 'Good', 'On fire'],
};

const LS_CHECKIN = 'qg_checkin_today';

export function hasCheckedInToday() {
  try {
    const raw = localStorage.getItem(LS_CHECKIN);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data.date === new Date().toDateString();
  } catch {
    return false;
  }
}

export function getCheckInData() {
  try {
    const raw = localStorage.getItem(LS_CHECKIN);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.date !== new Date().toDateString()) return null;
    return data;
  } catch {
    return null;
  }
}

export default function DailyCheckIn({ darkMode, lang = 'fr', onComplete }) {
  const [step, setStep]       = useState(0); // 0=emoji, 1=priority, 2=blocker
  const [emojiIdx, setEmojiIdx] = useState(null);
  const [priority, setPriority] = useState('');
  const [blocker, setBlocker]   = useState('');
  const [leaving, setLeaving]   = useState(false);

  const labels = EMOJI_LABELS[lang] || EMOJI_LABELS.fr;

  function handleEmojiPick(idx) {
    setEmojiIdx(idx);
    setTimeout(() => setStep(1), 300);
  }

  function handleSubmit() {
    if (!priority.trim()) return;
    const data = {
      date: new Date().toDateString(),
      energieScore: EMOJI_SCORES[emojiIdx ?? 2],
      emoji: EMOJIS[emojiIdx ?? 2],
      priority: priority.trim(),
      blocker: blocker.trim() || null,
      timestamp: new Date().toISOString(),
    };
    try { localStorage.setItem(LS_CHECKIN, JSON.stringify(data)); } catch {}
    // Sync to Supabase (best effort)
    try {
      import('../lib/sync.js').then(({ syncCheckIn }) => syncCheckIn && syncCheckIn(data));
    } catch {}
    setLeaving(true);
    setTimeout(() => onComplete(data), 500);
  }

  const titles = {
    fr: ['Comment tu te sens aujourd\'hui ?', 'Ta priorité #1 aujourd\'hui ?', 'Ton plus grand blocage ?'],
    en: ['How are you feeling today?', 'What\'s your #1 priority today?', 'What\'s your biggest blocker?'],
  };
  const placeholders = {
    fr: ['', 'Ex: Envoyer 10 DMs à des prospects', 'Ex: Je ne sais pas comment amorcer la conversation'],
    en: ['', 'e.g. Send 10 DMs to prospects', 'e.g. Don\'t know how to start the conversation'],
  };
  const t = (key) => ({ fr: { next: 'Continuer', submit: 'Commencer la journée →', skip: 'Passer', subtitle: 'Rituel matinal · 30 secondes' }, en: { next: 'Continue', submit: 'Start the day →', skip: 'Skip', subtitle: 'Morning ritual · 30 seconds' } }[lang] || {})[key] || key;

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center px-4 transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: darkMode ? 'rgba(5,8,16,0.95)' : 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)' }}
    >
      <div className="w-full max-w-sm">
        {/* Ritual label */}
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] mb-8"
          style={{ color: 'rgba(148,163,184,0.4)' }}>
          {t('subtitle')}
        </p>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === step ? '20px' : '6px',
                height: '6px',
                background: i <= step ? '#6366f1' : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
              }}
            />
          ))}
        </div>

        {/* Question */}
        <h2 className="text-2xl font-black text-center mb-8 leading-tight"
          style={{ color: darkMode ? '#f1f5f9' : '#0f172a', fontFamily: "'Space Grotesk', sans-serif" }}>
          {(titles[lang] || titles.fr)[step]}
        </h2>

        {/* Step 0: Emoji picker */}
        {step === 0 && (
          <div className="flex justify-center gap-3">
            {EMOJIS.map((em, i) => (
              <button
                key={i}
                onClick={() => handleEmojiPick(i)}
                className="flex flex-col items-center gap-1.5 transition-all duration-200"
                style={{ transform: emojiIdx === i ? 'scale(1.3)' : 'scale(1)', opacity: emojiIdx !== null && emojiIdx !== i ? 0.4 : 1 }}
              >
                <span className="text-3xl">{em}</span>
                <span className="text-[10px] font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>{labels[i]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Priority */}
        {step === 1 && (
          <div className="space-y-4">
            <input
              autoFocus
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && priority.trim() && setStep(2)}
              placeholder={placeholders[lang]?.[1] || ''}
              maxLength={120}
              className="w-full text-center text-base outline-none bg-transparent border-b-2 pb-2 transition-colors"
              style={{
                borderColor: priority.trim() ? '#6366f1' : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                color: darkMode ? '#f1f5f9' : '#0f172a',
              }}
            />
            <button
              onClick={() => priority.trim() && setStep(2)}
              disabled={!priority.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
              style={{ background: '#6366f1', color: 'white' }}
            >
              {t('next')}
            </button>
          </div>
        )}

        {/* Step 2: Blocker */}
        {step === 2 && (
          <div className="space-y-4">
            <input
              autoFocus
              value={blocker}
              onChange={(e) => setBlocker(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder={placeholders[lang]?.[2] || ''}
              maxLength={120}
              className="w-full text-center text-base outline-none bg-transparent border-b-2 pb-2 transition-colors"
              style={{
                borderColor: blocker.trim() ? '#6366f1' : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                color: darkMode ? '#f1f5f9' : '#0f172a',
              }}
            />
            <button
              onClick={handleSubmit}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white' }}
            >
              {t('submit')}
            </button>
            <button
              onClick={handleSubmit}
              className="w-full py-2 text-xs transition-colors"
              style={{ color: 'rgba(148,163,184,0.4)' }}
            >
              {t('skip')} (aucun blocage)
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

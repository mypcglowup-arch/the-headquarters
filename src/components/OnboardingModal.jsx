import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Briefcase, Target, ArrowRight, Check } from 'lucide-react';

/**
 * Onboarding modal — 3 questions.
 *   1. name (text, required to save)
 *   2. role (text, optional but encouraged)
 *   3. annualGoal ($ number, defaults to 50000)
 *
 * Skippable from anywhere. Never blocks the app — the calling component shows
 * a soft nudge banner on home if profile.name is empty.
 */
export default function OnboardingModal({ darkMode, lang = 'fr', initialProfile, onSave, onClose }) {
  const [step, setStep]   = useState(0);
  const [name, setName]   = useState(initialProfile?.name || '');
  const [role, setRole]   = useState(initialProfile?.role || '');
  const [goal, setGoal]   = useState(initialProfile?.annualGoal != null ? String(initialProfile.annualGoal) : '50000');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const STEPS = [
    {
      key: 'name',
      icon: <User size={18} />,
      label: { fr: 'Comment tu t\'appelles ?', en: 'What\'s your name?' },
      hint:  { fr: 'Le prénom que les agents vont utiliser.', en: 'The first name your advisors will use.' },
      placeholder: { fr: 'Ton prénom', en: 'Your first name' },
      value: name, setValue: setName, type: 'text',
    },
    {
      key: 'role',
      icon: <Briefcase size={18} />,
      label: { fr: 'C\'est quoi ton job / focus principal ?', en: 'What\'s your job / main focus?' },
      hint:  { fr: 'Ex: Consultant solo · Founder SaaS · Coach business', en: 'Ex: Solo consultant · SaaS founder · Business coach' },
      placeholder: { fr: 'Ton rôle', en: 'Your role' },
      value: role, setValue: setRole, type: 'text',
    },
    {
      key: 'goal',
      icon: <Target size={18} />,
      label: { fr: 'Objectif annuel en $', en: 'Annual revenue target ($)' },
      hint:  { fr: 'Ce qu\'on vise cette année. Ajustable plus tard.', en: 'This year\'s target. Adjustable later.' },
      placeholder: '50000',
      value: goal, setValue: setGoal, type: 'number',
    },
  ];

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const canAdvance = step === 0
    ? Boolean(name.trim())
    : true; // role + goal optional

  function next() {
    if (isLast) {
      onSave({
        name:       name.trim(),
        role:       role.trim(),
        annualGoal: Number(goal) || 50000,
        createdAt:  initialProfile?.createdAt || new Date().toISOString(),
      });
      return;
    }
    setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  return createPortal((
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-modal-backdrop"
      style={{ background: 'rgba(3,7,18,0.78)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col animate-modal-in"
        style={{
          background: darkMode ? 'rgba(20,20,30,0.97)' : '#ffffff',
          border: darkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(15,23,42,0.08)',
          boxShadow: '0 24px 80px -20px rgba(99,102,241,0.45), 0 0 0 1px rgba(99,102,241,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <div className="p-2 rounded-lg" style={{ background: 'rgba(99,102,241,0.16)', color: 'rgba(99,102,241,1)' }}>
            {current.icon}
          </div>
          <div className="flex-1">
            <div className={`text-[10px] uppercase tracking-wider font-semibold ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              {lang === 'fr' ? `Question ${step + 1} sur ${STEPS.length}` : `Question ${step + 1} of ${STEPS.length}`}
            </div>
            <h2 className={`font-display font-bold text-[18px] leading-tight mt-0.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {current.label[lang] || current.label.fr}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${darkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
            title={lang === 'fr' ? 'Tu peux compléter plus tard' : 'You can complete later'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3">
          <p className={`text-[12.5px] ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            {current.hint[lang] || current.hint.fr}
          </p>
          <input
            autoFocus
            type={current.type}
            value={current.value}
            onChange={(e) => current.setValue(e.target.value)}
            placeholder={typeof current.placeholder === 'object' ? (current.placeholder[lang] || current.placeholder.fr) : current.placeholder}
            onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance) next(); }}
            className={`w-full px-3 py-3 rounded-lg text-[15px] outline-none transition-all ${darkMode ? 'bg-gray-900 border border-white/10 text-white placeholder:text-gray-500 focus:border-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-300'}`}
          />

          {/* Step dots */}
          <div className="flex items-center gap-1.5 pt-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full transition-all"
                style={{
                  width: i === step ? 24 : 6,
                  background: i <= step
                    ? 'rgba(99,102,241,0.85)'
                    : (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'),
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-4 border-t" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <button
            onClick={onClose}
            className={`px-3 py-2 rounded-lg text-[12.5px] font-semibold ${darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          >
            {lang === 'fr' ? 'Plus tard' : 'Later'}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={back}
                className={`px-3 py-2 rounded-lg text-[12.5px] font-semibold ${darkMode ? 'text-gray-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {lang === 'fr' ? 'Retour' : 'Back'}
              </button>
            )}
            <button
              onClick={next}
              disabled={!canAdvance}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(99,102,241,0.22)',
                color: 'rgba(99,102,241,1)',
                boxShadow: '0 0 0 1px rgba(99,102,241,0.42)',
              }}
            >
              {isLast
                ? (<>{lang === 'fr' ? 'Terminer' : 'Finish'}<Check size={13} /></>)
                : (<>{lang === 'fr' ? 'Suivant' : 'Next'}<ArrowRight size={13} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

/**
 * Soft nudge banner — shown on Home when profile.name is empty.
 * Click → opens onboarding. Dismissable per-session via localStorage flag.
 */
export function OnboardingNudge({ darkMode, lang = 'fr', onStart, onDismiss }) {
  return (
    <div
      className="rounded-xl px-4 py-3 mb-4 flex items-center gap-3 animate-bubble-in"
      style={{
        background: 'rgba(99,102,241,0.10)',
        border:     '1px solid rgba(99,102,241,0.28)',
      }}
    >
      <div className="p-2 rounded-lg shrink-0" style={{ background: 'rgba(99,102,241,0.16)', color: 'rgba(99,102,241,1)' }}>
        <User size={16} strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-display font-semibold text-[14px] leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          {lang === 'fr' ? 'Personnalise ton expérience' : 'Personalize your experience'}
        </div>
        <div className={`text-[12px] mt-0.5 ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
          {lang === 'fr'
            ? '3 questions rapides pour que tes agents t\'appellent par ton prénom.'
            : '3 quick questions so your advisors address you by name.'}
        </div>
      </div>
      <button
        onClick={onStart}
        className="px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap shrink-0"
        style={{
          background: 'rgba(99,102,241,0.22)',
          color: 'rgba(99,102,241,1)',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.42)',
        }}
      >
        {lang === 'fr' ? 'Commencer' : 'Start'}
      </button>
      <button
        onClick={onDismiss}
        className={`p-1.5 rounded-md shrink-0 ${darkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
        aria-label={lang === 'fr' ? 'Masquer' : 'Dismiss'}
      >
        <X size={14} />
      </button>
    </div>
  );
}

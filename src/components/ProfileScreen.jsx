import { useState } from 'react';
import { User, Briefcase, Target, Save, RotateCcw, Check, Building2, Users as UsersIcon, TrendingUp, Clock, Zap, AlertTriangle, Sliders, UserCheck, ShieldOff, CalendarDays } from 'lucide-react';
import { SECTORS, AUDIENCE_OPTIONS } from '../data/sectors.js';
import {
  STAGE_OPTIONS, EXPERIENCE_OPTIONS, STRENGTH_OPTIONS,
  CHALLENGE_OPTIONS, AVAILABILITY_OPTIONS, COACHING_STYLE_LABELS,
} from '../utils/userProfile.js';
import { AGENT_CONFIG, COMMERCIAL_MODE } from '../prompts.js';

const AGENT_KEYS = ['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS'];

export default function ProfileScreen({ darkMode, lang = 'fr', profile, dashboard, onSaveProfile, onUpdateDashboardGoal, onReopenOnboarding }) {
  const [name, setName]                 = useState(profile?.name || '');
  const [role, setRole]                 = useState(profile?.role || '');
  const [goal, setGoal]                 = useState(String(dashboard?.annualGoal || profile?.annualGoal || 50000));
  const [sectorId, setSectorId]         = useState(profile?.sector || '');
  const [sectorCustom, setSectorCustom] = useState(profile?.sectorCustom || '');
  const [audience, setAudience]         = useState(profile?.audience || '');

  // v2 personalization state
  const [stage, setStage]                     = useState(profile?.stage || '');
  const [experience, setExperience]           = useState(profile?.experience || '');
  const [strength, setStrength]               = useState(profile?.strength || '');
  const [challenges, setChallenges]           = useState(Array.isArray(profile?.challenges) ? profile.challenges : []);
  const [pastFailures, setPastFailures]       = useState(profile?.pastFailures || '');
  const [coachingStyle, setCoachingStyle]     = useState(Number(profile?.coachingStyle) || 3);
  const [primaryAgent, setPrimaryAgent]       = useState(profile?.primaryAgent || '');
  const [sensitiveTopics, setSensitiveTopics] = useState(profile?.sensitiveTopics || '');
  const [availability, setAvailability]       = useState(Array.isArray(profile?.availability) ? profile.availability : []);

  const [savedFlash, setSavedFlash] = useState(false);

  const initialChallenges    = Array.isArray(profile?.challenges)    ? profile.challenges    : [];
  const initialAvailability  = Array.isArray(profile?.availability)  ? profile.availability  : [];

  const dirty =
    name !== (profile?.name || '') ||
    role !== (profile?.role || '') ||
    Number(goal) !== Number(dashboard?.annualGoal || profile?.annualGoal || 50000) ||
    sectorId !== (profile?.sector || '') ||
    sectorCustom !== (profile?.sectorCustom || '') ||
    audience !== (profile?.audience || '') ||
    stage !== (profile?.stage || '') ||
    experience !== (profile?.experience || '') ||
    strength !== (profile?.strength || '') ||
    !sameArr(challenges, initialChallenges) ||
    pastFailures !== (profile?.pastFailures || '') ||
    Number(coachingStyle) !== (Number(profile?.coachingStyle) || 3) ||
    primaryAgent !== (profile?.primaryAgent || '') ||
    sensitiveTopics !== (profile?.sensitiveTopics || '') ||
    !sameArr(availability, initialAvailability);

  function toggleChallenge(key) {
    setChallenges((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= 2) return cur; // hard cap at 2 per spec
      return [...cur, key];
    });
  }
  function toggleAvailability(key) {
    setAvailability((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  }

  function handleSave() {
    const newProfile = {
      ...profile,
      name:           name.trim(),
      role:           role.trim(),
      annualGoal:     Number(goal) || 50000,
      sector:         sectorId || null,
      sectorCustom:   sectorId === 'other' ? sectorCustom.trim() : '',
      audience:       audience || null,
      stage:          stage || null,
      experience:     experience || null,
      strength:       strength || null,
      challenges,
      pastFailures:   pastFailures.trim(),
      coachingStyle:  Number(coachingStyle) || 3,
      primaryAgent:   primaryAgent || null,
      sensitiveTopics:sensitiveTopics.trim(),
      availability,
      createdAt:      profile?.createdAt || new Date().toISOString(),
    };
    onSaveProfile(newProfile);
    onUpdateDashboardGoal?.(Number(goal) || 50000);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-screen-in"
      style={{ background: darkMode ? undefined : '#F5F4F0' }}>
      <div className="flex-1 overflow-y-auto scroll-fade px-4 md:px-6 lg:px-8 py-6 md:py-8 pb-24">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <User size={22} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} strokeWidth={2} />
            <h1 className={`font-display font-bold text-[28px] md:text-[34px] tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {lang === 'fr' ? 'Profil' : 'Profile'}
            </h1>
          </div>
          <p className={`text-[14px] mb-4 ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            {lang === 'fr'
              ? 'Comment QG t\'identifie. Tout ce que tu mets ici calibre ton équipe d\'agents — ton, profondeur, intensité, sujets à aborder ou éviter.'
              : 'How QG identifies you. Everything here calibrates your advisor team — tone, depth, intensity, topics to cover or avoid.'}
          </p>

          {/* Redo onboarding — placed at the top, away from the floating chat
              bar at the bottom (its suggestion chips were stealing this click). */}
          <div className="mb-6">
            <button
              onClick={() => { window.location.href = '/?onboarding=true'; }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold ${darkMode ? 'text-gray-300 bg-white/5 hover:bg-white/10' : 'text-slate-700 bg-slate-100 hover:bg-slate-200'}`}
            >
              <RotateCcw size={13} />
              {lang === 'fr' ? 'Refaire l\'onboarding' : 'Redo onboarding'}
            </button>
          </div>

          {/* SECTION 1 — Identity */}
          <SectionTitle darkMode={darkMode} icon={<User size={14} />}>
            {lang === 'fr' ? 'Identité' : 'Identity'}
          </SectionTitle>
          <div className={`rounded-xl p-5 space-y-5 mb-5 ${darkMode ? 'bg-gray-900/60 border border-white/[0.06]' : 'bg-white border border-slate-200'}`}>
            <Field icon={<User size={13} />} label={lang === 'fr' ? 'Prénom' : 'First name'} hint={lang === 'fr' ? 'Utilisé par les agents quand ils s\'adressent à toi.' : 'Used by advisors when addressing you.'} darkMode={darkMode}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === 'fr' ? 'Ton prénom' : 'Your first name'} className={inputCls(darkMode)} />
            </Field>
            <Field icon={<Briefcase size={13} />} label={lang === 'fr' ? 'Rôle / Focus principal' : 'Role / Main focus'} hint={lang === 'fr' ? 'Ex: Consultant solo · Founder SaaS · Coach business · Paysagiste · Médecin' : 'Ex: Solo consultant · SaaS founder · Business coach · Landscaper · Doctor'} darkMode={darkMode}>
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={lang === 'fr' ? 'Ton rôle' : 'Your role'} className={inputCls(darkMode)} />
            </Field>
            <Field icon={<Target size={13} />} label={lang === 'fr' ? 'Objectif annuel ($)' : 'Annual revenue target ($)'} hint={lang === 'fr' ? 'Synchronisé avec le dashboard. Modifier ici met à jour partout.' : 'Synced with the dashboard. Editing here updates everywhere.'} darkMode={darkMode}>
              <input type="number" inputMode="decimal" min="0" step="1000" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="50000" className={inputCls(darkMode)} />
            </Field>
            <Field icon={<Building2 size={13} />} label={lang === 'fr' ? 'Secteur' : 'Sector'} hint={lang === 'fr' ? 'Catégorie large — pilote pipeline + saisonnalité.' : 'Broad category — drives pipeline + seasonality.'} darkMode={darkMode}>
              <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className={selectCls(darkMode)}>
                <option value="">{lang === 'fr' ? '— Aucun —' : '— None —'}</option>
                {SECTORS.map((s) => (<option key={s.id} value={s.id}>{s.label[lang] || s.label.fr}</option>))}
              </select>
            </Field>
            <Field icon={<Building2 size={13} />} label={lang === 'fr' ? 'Mon secteur exact' : 'My exact niche'} hint={lang === 'fr' ? 'Override le dropdown — donne aux agents le contexte précis : exemples, vocabulaire, saisonnalité réelle.' : 'Overrides the dropdown — gives agents precise context: examples, vocabulary, real seasonality.'} darkMode={darkMode}>
              <input
                value={sectorCustom}
                onChange={(e) => setSectorCustom(e.target.value)}
                placeholder={lang === 'fr'
                  ? 'Ex: Tonte de gazon résidentiel Québec · Courtier immobilier Montréal · Coach fitness en ligne'
                  : 'Ex: Residential lawn care Quebec · Montreal real estate broker · Online fitness coach'}
                className={inputCls(darkMode)}
              />
            </Field>
            <Field icon={<UsersIcon size={13} />} label={lang === 'fr' ? 'Audience' : 'Audience'} hint={lang === 'fr' ? 'Filtre les scripts B2B/B2C dans la bibliothèque par défaut.' : 'Filters B2B/B2C scripts in the library by default.'} darkMode={darkMode}>
              <ChipGrid options={AUDIENCE_OPTIONS.map((a) => ({ key: a.id, label: a.label[lang] || a.label.fr, rgb: a.rgb }))} value={audience} onPick={setAudience} darkMode={darkMode} cols={3} />
            </Field>
          </div>

          {/* SECTION 2 — Business stage */}
          <SectionTitle darkMode={darkMode} icon={<TrendingUp size={14} />}>
            {lang === 'fr' ? 'Stade & Expérience' : 'Stage & Experience'}
          </SectionTitle>
          <div className={`rounded-xl p-5 space-y-5 mb-5 ${darkMode ? 'bg-gray-900/60 border border-white/[0.06]' : 'bg-white border border-slate-200'}`}>
            <Field icon={<TrendingUp size={13} />} label={lang === 'fr' ? 'Stade du business' : 'Business stage'} hint={lang === 'fr' ? 'Calibre le vocabulaire des agents. Cardone parle différemment à 0$ vs 10K$/mois.' : 'Calibrates agent vocabulary. Cardone talks differently at $0 vs $10K/mo.'} darkMode={darkMode}>
              <ChipGrid options={Object.entries(STAGE_OPTIONS).map(([k, v]) => ({ key: k, label: v[lang] || v.fr }))} value={stage} onPick={setStage} darkMode={darkMode} cols={2} allowDeselect />
            </Field>
            <Field icon={<Clock size={13} />} label={lang === 'fr' ? 'Expérience en business' : 'Business experience'} hint={lang === 'fr' ? 'Ajuste la profondeur et la complexité des conseils.' : 'Adjusts depth and complexity of advice.'} darkMode={darkMode}>
              <ChipGrid options={Object.entries(EXPERIENCE_OPTIONS).map(([k, v]) => ({ key: k, label: v[lang] || v.fr }))} value={experience} onPick={setExperience} darkMode={darkMode} cols={4} allowDeselect />
            </Field>
          </div>

          {/* SECTION 3 — Strengths & challenges */}
          <SectionTitle darkMode={darkMode} icon={<Zap size={14} />}>
            {lang === 'fr' ? 'Force & Défis' : 'Strength & Challenges'}
          </SectionTitle>
          <div className={`rounded-xl p-5 space-y-5 mb-5 ${darkMode ? 'bg-gray-900/60 border border-white/[0.06]' : 'bg-white border border-slate-200'}`}>
            <Field icon={<Zap size={13} />} label={lang === 'fr' ? 'Plus grande force' : 'Biggest strength'} hint={lang === 'fr' ? 'Les agents renforcent ta force et challengent ta faiblesse.' : 'Advisors reinforce strength and challenge weaknesses.'} darkMode={darkMode}>
              <ChipGrid options={Object.entries(STRENGTH_OPTIONS).map(([k, v]) => ({ key: k, label: v[lang] || v.fr }))} value={strength} onPick={setStrength} darkMode={darkMode} cols={3} allowDeselect />
            </Field>
            <Field icon={<AlertTriangle size={13} />} label={lang === 'fr' ? 'Plus grand défi actuel (1-2)' : 'Current top challenge(s) (1-2)'} hint={lang === 'fr' ? 'Les agents reviennent automatiquement sur ce point en session.' : 'Advisors automatically return to this in sessions.'} darkMode={darkMode}>
              <ChipGridMulti options={Object.entries(CHALLENGE_OPTIONS).map(([k, v]) => ({ key: k, label: v[lang] || v.fr }))} values={challenges} onToggle={toggleChallenge} darkMode={darkMode} cols={3} max={2} lang={lang} />
            </Field>
            <Field icon={<AlertTriangle size={13} />} label={lang === 'fr' ? 'Ce qui a pas marché (déjà essayé)' : 'What didn\'t work (already tried)'} hint={lang === 'fr' ? 'Hormozi et Robbins évitent de resuggérer ces choses. Crucial pour la crédibilité.' : 'Hormozi and Robbins avoid resuggesting these. Critical for advisor credibility.'} darkMode={darkMode}>
              <textarea value={pastFailures} onChange={(e) => setPastFailures(e.target.value)} rows={3} placeholder={lang === 'fr' ? 'Ex: ads Facebook ($800 brûlés en 2 mois) · cold DMs LinkedIn · webinar gratuit (zéro inscription)' : 'Ex: FB ads ($800 burned in 2 mo) · LinkedIn cold DMs · free webinar (zero signups)'} className={`${textareaCls(darkMode)} resize-y min-h-[72px]`} />
            </Field>
          </div>

          {/* SECTION 4 — Coaching calibration */}
          <SectionTitle darkMode={darkMode} icon={<Sliders size={14} />}>
            {lang === 'fr' ? 'Calibrage du coaching' : 'Coaching calibration'}
          </SectionTitle>
          <div className={`rounded-xl p-5 space-y-5 mb-5 ${darkMode ? 'bg-gray-900/60 border border-white/[0.06]' : 'bg-white border border-slate-200'}`}>
            <Field icon={<Sliders size={13} />} label={lang === 'fr' ? `Style de coaching voulu (${coachingStyle}/5)` : `Desired coaching style (${coachingStyle}/5)`} hint={lang === 'fr' ? 'Calibre l\'intensité de TOUS les agents simultanément. 1 = doux. 5 = brutal.' : 'Calibrates the intensity of ALL agents at once. 1 = soft. 5 = brutal.'} darkMode={darkMode}>
              <input type="range" min="1" max="5" step="1" value={coachingStyle} onChange={(e) => setCoachingStyle(Number(e.target.value))} className="w-full accent-indigo-500" style={{ accentColor: 'rgb(99,102,241)' }} />
              <div className={`mt-1 text-[12px] ${darkMode ? 'text-indigo-300' : 'text-indigo-700'} font-medium`}>
                {COACHING_STYLE_LABELS[coachingStyle]?.[lang] || COACHING_STYLE_LABELS[coachingStyle]?.fr}
              </div>
              <div className={`flex justify-between mt-1 text-[10px] ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
              </div>
            </Field>
            <Field icon={<UserCheck size={13} />} label={lang === 'fr' ? 'Agent principal' : 'Primary advisor'} hint={lang === 'fr' ? 'Qui ouvre tes sessions par défaut. Briefing du matin et opening de session.' : 'Who opens your sessions by default. Morning briefing and session opener.'} darkMode={darkMode}>
              <select value={primaryAgent} onChange={(e) => setPrimaryAgent(e.target.value)} className={selectCls(darkMode)}>
                <option value="">{lang === 'fr' ? '— Auto (selon le contexte) —' : '— Auto (context-driven) —'}</option>
                {AGENT_KEYS.map((k) => {
                  const cfg = AGENT_CONFIG[k];
                  const display = COMMERCIAL_MODE ? cfg.commercialName : cfg.personalName;
                  return (<option key={k} value={k}>{cfg.emoji}  {display} — {cfg.domain}</option>);
                })}
              </select>
            </Field>
          </div>

          {/* SECTION 5 — Boundaries & availability */}
          <SectionTitle darkMode={darkMode} icon={<ShieldOff size={14} />}>
            {lang === 'fr' ? 'Limites & Disponibilité' : 'Boundaries & Availability'}
          </SectionTitle>
          <div className={`rounded-xl p-5 space-y-5 mb-5 ${darkMode ? 'bg-gray-900/60 border border-white/[0.06]' : 'bg-white border border-slate-200'}`}>
            <Field icon={<ShieldOff size={13} />} label={lang === 'fr' ? 'Sujets sensibles (optionnel)' : 'Sensitive topics (optional)'} hint={lang === 'fr' ? 'Les agents évitent ces sujets sauf si tu les amènes en premier.' : 'Advisors avoid these topics unless you raise them first.'} darkMode={darkMode}>
              <textarea value={sensitiveTopics} onChange={(e) => setSensitiveTopics(e.target.value)} rows={2} placeholder={lang === 'fr' ? 'Ex: santé mentale · situation familiale · ex-associé' : 'Ex: mental health · family situation · former co-founder'} className={`${textareaCls(darkMode)} resize-y min-h-[60px]`} />
            </Field>
            <Field icon={<CalendarDays size={13} />} label={lang === 'fr' ? 'Disponibilité typique' : 'Typical availability'} hint={lang === 'fr' ? 'Le briefing du matin et le timing des agents s\'adaptent.' : 'Morning briefing and agent timing adapt.'} darkMode={darkMode}>
              <ChipGridMulti options={Object.entries(AVAILABILITY_OPTIONS).map(([k, v]) => ({ key: k, label: v[lang] || v.fr }))} values={availability} onToggle={toggleAvailability} darkMode={darkMode} cols={4} lang={lang} />
            </Field>
          </div>

          {/* Actions */}
          <div className={`rounded-xl p-4 flex items-center gap-2 ${darkMode ? 'bg-gray-900/60 border border-white/[0.06]' : 'bg-white border border-slate-200'}`}>
            <button
              onClick={handleSave}
              disabled={!dirty}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(99,102,241,0.22)', color: 'rgba(99,102,241,1)', boxShadow: '0 0 0 1px rgba(99,102,241,0.42)' }}
            >
              {savedFlash ? <Check size={13} /> : <Save size={13} />}
              {savedFlash ? (lang === 'fr' ? 'Enregistré' : 'Saved') : (lang === 'fr' ? 'Enregistrer' : 'Save')}
            </button>
          </div>

          <p className={`mt-4 text-[11px] ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
            {lang === 'fr'
              ? 'Stocké localement et synchronisé sur Supabase. Modifier un champ = appliqué dès la prochaine session, sans reload.'
              : 'Stored locally and synced to Supabase. Editing a field = applied at the next session, no reload.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Local helpers ─────────────────────────────────────────────────────────────

function sameArr(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort(), sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

const inputCls = (dark) => `w-full px-3 py-2.5 rounded-lg text-[14px] outline-none ${dark ? 'bg-gray-950 border border-white/10 text-white placeholder:text-gray-500 focus:border-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-300'}`;
const textareaCls = (dark) => `w-full px-3 py-2.5 rounded-lg text-[13.5px] outline-none ${dark ? 'bg-gray-950 border border-white/10 text-white placeholder:text-gray-500 focus:border-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-300'}`;
const selectCls = (dark) => `w-full px-3 py-2.5 rounded-lg text-[14px] outline-none ${dark ? 'bg-gray-950 border border-white/10 text-white focus:border-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 focus:border-indigo-300'}`;

function SectionTitle({ darkMode, icon, children }) {
  return (
    <div className={`flex items-center gap-2 mb-2 ml-1 text-[10.5px] uppercase tracking-wider font-bold ${darkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>
      {icon}{children}
    </div>
  );
}

function Field({ icon, label, hint, darkMode, children }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
        {icon}{label}
      </div>
      {children}
      {hint && (<p className={`text-[11px] mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>{hint}</p>)}
    </div>
  );
}

// Single-choice chip grid. allowDeselect: clicking the active chip clears the value.
function ChipGrid({ options, value, onPick, darkMode, cols = 3, allowDeselect = false }) {
  const colsCls = cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${colsCls} gap-1.5`}>
      {options.map((o) => {
        const active = value === o.key;
        const rgb = o.rgb || '99,102,241';
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onPick(active && allowDeselect ? '' : o.key)}
            className="px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-all tap-target text-center"
            style={{
              background: active ? `rgba(${rgb}, 0.18)` : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
              color:      active ? `rgba(${rgb}, 1)`    : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
              boxShadow:  active ? `0 0 0 1px rgba(${rgb}, 0.36)` : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Multi-choice chip grid with optional max-selection cap.
function ChipGridMulti({ options, values, onToggle, darkMode, cols = 3, max, lang = 'fr' }) {
  const colsCls = cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2';
  const atCap = max != null && values.length >= max;
  return (
    <div>
      <div className={`grid ${colsCls} gap-1.5`}>
        {options.map((o) => {
          const active = values.includes(o.key);
          const disabled = !active && atCap;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => { if (!disabled) onToggle(o.key); }}
              disabled={disabled}
              className="px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-all tap-target text-center disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                background: active ? 'rgba(99,102,241,0.18)' : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
                color:      active ? 'rgba(99,102,241,1)'    : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
                boxShadow:  active ? '0 0 0 1px rgba(99,102,241,0.36)' : 'none',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {max != null && (
        <div className={`mt-1.5 text-[10.5px] ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
          {lang === 'fr' ? `${values.length}/${max} sélectionné${values.length > 1 ? 's' : ''}` : `${values.length}/${max} selected`}
        </div>
      )}
    </div>
  );
}

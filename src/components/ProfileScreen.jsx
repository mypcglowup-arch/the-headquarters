import { useState } from 'react';
import { User, Briefcase, Target, Save, RotateCcw, Check } from 'lucide-react';

export default function ProfileScreen({ darkMode, lang = 'fr', profile, dashboard, onSaveProfile, onUpdateDashboardGoal, onReopenOnboarding }) {
  const [name, setName] = useState(profile?.name || '');
  const [role, setRole] = useState(profile?.role || '');
  const [goal, setGoal] = useState(String(dashboard?.annualGoal || profile?.annualGoal || 50000));
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty =
    name !== (profile?.name || '') ||
    role !== (profile?.role || '') ||
    Number(goal) !== Number(dashboard?.annualGoal || profile?.annualGoal || 50000);

  function handleSave() {
    const newProfile = {
      name:       name.trim(),
      role:       role.trim(),
      annualGoal: Number(goal) || 50000,
      createdAt:  profile?.createdAt || new Date().toISOString(),
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
          <p className={`text-[14px] mb-6 ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            {lang === 'fr'
              ? 'Comment QG t\'identifie. Les agents vont utiliser ton prénom dans leurs réponses.'
              : 'How QG identifies you. Your advisors will address you by your first name.'}
          </p>

          {/* Form */}
          <div className={`rounded-xl p-5 space-y-5 ${darkMode ? 'bg-gray-900/60 border border-white/[0.06]' : 'bg-white border border-slate-200'}`}>
            <Field
              icon={<User size={13} />}
              label={lang === 'fr' ? 'Prénom' : 'First name'}
              hint={lang === 'fr' ? 'Utilisé par les agents quand ils s\'adressent à toi.' : 'Used by advisors when addressing you.'}
              darkMode={darkMode}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={lang === 'fr' ? 'Ton prénom' : 'Your first name'}
                className={`w-full px-3 py-2.5 rounded-lg text-[14px] outline-none ${darkMode ? 'bg-gray-950 border border-white/10 text-white placeholder:text-gray-500 focus:border-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-300'}`}
              />
            </Field>

            <Field
              icon={<Briefcase size={13} />}
              label={lang === 'fr' ? 'Rôle / Focus principal' : 'Role / Main focus'}
              hint={lang === 'fr' ? 'Ex: Consultant solo · Founder SaaS · Coach business' : 'Ex: Solo consultant · SaaS founder · Business coach'}
              darkMode={darkMode}
            >
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={lang === 'fr' ? 'Ton rôle' : 'Your role'}
                className={`w-full px-3 py-2.5 rounded-lg text-[14px] outline-none ${darkMode ? 'bg-gray-950 border border-white/10 text-white placeholder:text-gray-500 focus:border-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-300'}`}
              />
            </Field>

            <Field
              icon={<Target size={13} />}
              label={lang === 'fr' ? 'Objectif annuel ($)' : 'Annual revenue target ($)'}
              hint={lang === 'fr' ? 'Synchronisé avec le dashboard. Modifier ici met à jour partout.' : 'Synced with the dashboard. Editing here updates everywhere.'}
              darkMode={darkMode}
            >
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1000"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="50000"
                className={`w-full px-3 py-2.5 rounded-lg text-[14px] outline-none ${darkMode ? 'bg-gray-950 border border-white/10 text-white placeholder:text-gray-500 focus:border-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-300'}`}
              />
            </Field>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!dirty}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(99,102,241,0.22)',
                  color: 'rgba(99,102,241,1)',
                  boxShadow: '0 0 0 1px rgba(99,102,241,0.42)',
                }}
              >
                {savedFlash ? <Check size={13} /> : <Save size={13} />}
                {savedFlash ? (lang === 'fr' ? 'Enregistré' : 'Saved') : (lang === 'fr' ? 'Enregistrer' : 'Save')}
              </button>
              <button
                onClick={onReopenOnboarding}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold ml-auto ${darkMode ? 'text-gray-300 bg-white/5 hover:bg-white/10' : 'text-slate-700 bg-slate-100 hover:bg-slate-200'}`}
              >
                <RotateCcw size={13} />
                {lang === 'fr' ? 'Refaire l\'onboarding' : 'Redo onboarding'}
              </button>
            </div>
          </div>

          {/* Tech note */}
          <p className={`mt-4 text-[11px] ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
            {lang === 'fr'
              ? 'Ces infos sont stockées localement et synchronisées sur Supabase. La mémoire long-terme reste rattachée à l\'instance app — changer ton prénom ne perd aucun historique.'
              : 'This info is stored locally and synced to Supabase. Long-term memory stays attached to the app instance — renaming preserves all history.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, hint, darkMode, children }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
        {icon}
        {label}
      </div>
      {children}
      {hint && (
        <p className={`text-[11px] mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>{hint}</p>
      )}
    </div>
  );
}

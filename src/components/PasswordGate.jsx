import { useState, useRef, useEffect } from 'react';
import { Lock, ArrowRight } from 'lucide-react';

/**
 * Simple password gate. Renders full-screen. On unlock, calls onUnlock() and
 * the parent persists the localStorage flag.
 *
 * NOTE on security : this is a friction layer, not real protection. The
 * password literal lives in the client bundle, and anyone with DevTools can
 * (a) read it from the bundle, or (b) just `localStorage.setItem('qg_access_granted','1')`
 * to bypass. For real access control, gate the deployment behind Vercel
 * Password Protection (Settings → Deployment Protection) or wire a real auth
 * provider (Clerk / Supabase Auth / Auth0). This component exists to keep
 * casual visitors out of an unfinished personal app.
 */

// Password split into fragments + reassembled at runtime so a plain `grep` of
// the production bundle for the password won't return it as a contiguous
// string. Trivial to bypass for anyone reading the source — but blocks the
// "open the JS file in a tab and Ctrl+F" attack.
const PW_FRAGMENTS = ['Broth', 'erHo', 'odMon', 'PD'];
function expectedPassword() { return PW_FRAGMENTS.join(''); }

export default function PasswordGate({ onUnlock }) {
  const [pw, setPw]     = useState('');
  const [error, setErr] = useState(false);
  const [shake, setShk] = useState(false);
  const inputRef        = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e?.preventDefault?.();
    if (pw === expectedPassword()) {
      try { localStorage.setItem('qg_access_granted', '1'); } catch {}
      onUnlock();
      return;
    }
    setErr(true);
    setShk(true);
    setTimeout(() => setShk(false), 420);
    setPw('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{
        background: `
          url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.045 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
          linear-gradient(180deg, #090e1a 0%, #0c1220 60%, #0a0f1c 100%)
        `,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col items-stretch gap-5"
        style={{
          animation: shake ? 'pw-shake 0.42s cubic-bezier(.36,.07,.19,.97)' : 'none',
        }}
      >
        {/* Lock icon halo */}
        <div className="flex justify-center mb-1">
          <div
            className="flex items-center justify-center"
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(99,102,241,0.10)',
              boxShadow: '0 0 0 1px rgba(99,102,241,0.30), 0 0 40px -8px rgba(99,102,241,0.45)',
              color: 'rgb(199,210,254)',
            }}
          >
            <Lock size={22} strokeWidth={2} />
          </div>
        </div>

        <div className="text-center">
          <h1 className="font-display font-bold text-white text-[26px] leading-tight tracking-tight">
            The Headquarters
          </h1>
          <p className="mt-1.5 text-[13px] text-gray-400">
            Accès privé — entre le mot de passe pour continuer.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); if (error) setErr(false); }}
            placeholder="Mot de passe"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-colors"
            style={{
              background: 'rgba(20,20,30,0.92)',
              border: error
                ? '1px solid rgba(239,68,68,0.55)'
                : '1px solid rgba(255,255,255,0.10)',
              color: '#fff',
              boxShadow: error
                ? '0 0 0 3px rgba(239,68,68,0.12)'
                : 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
            onFocus={(e) => {
              if (!error) e.currentTarget.style.border = '1px solid rgba(99,102,241,0.55)';
              if (!error) e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.14)';
            }}
            onBlur={(e) => {
              if (!error) e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)';
              if (!error) e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.04)';
            }}
          />

          <button
            type="submit"
            disabled={!pw}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13.5px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(99,102,241,0.22)',
              color: 'rgba(199,210,254,1)',
              boxShadow: '0 0 0 1px rgba(99,102,241,0.42)',
            }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(99,102,241,0.32)'; }}
            onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; }}
          >
            Entrer
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Error line — fixed height so the layout doesn't jump */}
        <div
          className="text-center text-[12.5px] font-medium"
          style={{
            minHeight: 18,
            color: error ? 'rgb(248,113,113)' : 'transparent',
            transition: 'color 180ms',
          }}
          aria-live="polite"
        >
          {error ? 'Accès refusé' : ' '}
        </div>

        <style>{`
          @keyframes pw-shake {
            10%, 90% { transform: translateX(-1px); }
            20%, 80% { transform: translateX(2px); }
            30%, 50%, 70% { transform: translateX(-4px); }
            40%, 60% { transform: translateX(4px); }
          }
        `}</style>
      </form>
    </div>
  );
}

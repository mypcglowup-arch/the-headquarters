import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader, Copy, Check, Crosshair } from 'lucide-react';
import { analyzeProspect } from '../api.js';
import { AGENT_CONFIG } from '../prompts.js';

function AnalysisPanel({ agentKey, content, darkMode, lang }) {
  const [copied, setCopied] = useState(false);
  const config = AGENT_CONFIG[agentKey];
  const rgb = config.glowRgb;

  function copyText() {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Render bold **text**
  function renderLine(line, i) {
    if (!line.trim()) return <div key={i} className="h-1.5" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="text-sm leading-relaxed">
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} style={{ color: `rgb(${rgb})`, fontWeight: 700 }}>{p.slice(2, -2)}</strong>
            : <span key={j}>{p}</span>
        )}
      </p>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden flex flex-col"
      style={{
        border: `1px solid rgba(${rgb}, 0.2)`,
        background: darkMode ? `rgba(${rgb}, 0.03)` : `rgba(${rgb}, 0.02)`,
      }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: `rgba(${rgb}, 0.12)` }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: `rgba(${rgb}, 0.8)` }}>
          {config.emoji} {agentKey === 'VOSS' ? (lang === 'fr' ? 'Tactique négociation' : 'Negotiation tactics') : (lang === 'fr' ? 'Stratégie offre' : 'Offer strategy')}
        </span>
        <button onClick={copyText}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
          style={{
            background: copied ? 'rgba(16,185,129,0.12)' : `rgba(${rgb}, 0.08)`,
            color: copied ? '#10b981' : `rgba(${rgb}, 0.7)`,
            border: `1px solid ${copied ? 'rgba(16,185,129,0.25)' : `rgba(${rgb}, 0.2)`}`,
          }}>
          {copied ? <><Check size={9} /> {lang === 'fr' ? 'Copié' : 'Copied'}</> : <><Copy size={9} /> Copy</>}
        </button>
      </div>
      <div className="px-4 py-3 overflow-y-auto space-y-0.5 flex-1"
        style={{ maxHeight: '340px', color: darkMode ? '#cbd5e1' : '#374151' }}>
        {content.split('\n').map((line, i) => renderLine(line, i))}
      </div>
    </div>
  );
}

export default function ProspectAnalyzer({ dashboardContext, darkMode, lang = 'fr', onClose }) {
  const [step, setStep] = useState('input'); // input | loading | results
  const [prospectText, setProspectText] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  async function handleAnalyze() {
    if (!prospectText.trim()) return;
    setStep('loading');
    setError(null);
    try {
      const res = await analyzeProspect(prospectText.trim(), dashboardContext, lang);
      if (!res.voss && !res.hormozi) throw new Error('No analysis generated');
      setResults(res);
      setStep('results');
    } catch {
      setError(lang === 'fr' ? 'Erreur d\'analyse. Réessaie.' : 'Analysis failed. Try again.');
      setStep('input');
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl"
        style={{
          background: darkMode ? 'rgba(6,10,20,0.98)' : 'rgba(255,255,255,0.99)',
          border: '1px solid rgba(20,184,166,0.25)',
          boxShadow: '0 0 60px rgba(20,184,166,0.06), 0 32px 64px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Teal top bar */}
        <div className="h-1 rounded-t-2xl" style={{ background: 'linear-gradient(90deg, rgba(20,184,166,0.9), rgba(6,182,212,0.3))' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b"
          style={{ borderColor: 'rgba(20,184,166,0.1)' }}>
          <div>
            <h2 className="font-display font-black text-base flex items-center gap-2" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
              <Crosshair size={15} style={{ color: 'rgba(20,184,166,0.8)' }} />{lang === 'fr' ? 'Analyseur de Prospect' : 'Prospect Analyzer'}
            </h2>
            <p className="text-xs mt-0.5 uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.4)' }}>
              {lang === 'fr' ? 'Voss · Hormozi · Analyse tactique complète' : 'Voss · Hormozi · Full tactical brief'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ color: 'rgba(148,163,184,0.4)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Input step */}
          {step === 'input' && (
            <>
              <p className="text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>
                {lang === 'fr'
                  ? 'Colle tout ce que tu sais sur ce prospect : profil LinkedIn, fil d\'email, nom d\'entreprise, industrie, notes...'
                  : 'Paste everything you know about this prospect: LinkedIn profile, email thread, company name, industry, notes...'}
              </p>
              <textarea
                autoFocus
                value={prospectText}
                onChange={(e) => setProspectText(e.target.value)}
                rows={8}
                placeholder={lang === 'fr'
                  ? 'Ex: Jean Tremblay, propriétaire de restaurant à Montréal, 2 succursales, 15 employés. Actif sur Facebook. A commenté sur mon post récemment...'
                  : 'E.g. John Smith, restaurant owner in Montreal, 2 locations, 15 employees. Active on Facebook. Commented on my recent post...'}
                className="w-full px-4 py-3 rounded-xl text-sm leading-relaxed resize-none outline-none"
                style={{
                  background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(20,184,166,0.2)',
                  color: darkMode ? '#e2e8f0' : '#1e293b',
                }}
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleAnalyze}
                disabled={!prospectText.trim()}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.85), rgba(6,182,212,0.85))', color: 'white' }}
              >
                {lang === 'fr' ? '⚡ Analyser ce prospect' : '⚡ Analyze this prospect'}
              </button>
            </>
          )}

          {/* Loading step */}
          {step === 'loading' && (
            <div className="flex flex-col items-center py-12 gap-4">
              <Loader size={24} className="animate-spin" style={{ color: 'rgba(20,184,166,0.7)' }} />
              <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>
                {lang === 'fr' ? 'Voss et Hormozi analysent...' : 'Voss and Hormozi analyzing...'}
              </p>
              <p className="text-xs text-center max-w-xs" style={{ color: 'rgba(148,163,184,0.3)' }}>
                {lang === 'fr'
                  ? 'Brief tactique de négociation + stratégie d\'offre en cours...'
                  : 'Building your negotiation brief + offer strategy...'}
              </p>
            </div>
          )}

          {/* Results step */}
          {step === 'results' && results && (
            <>
              {results.voss && <AnalysisPanel agentKey="VOSS" content={results.voss} darkMode={darkMode} lang={lang} />}
              {results.hormozi && <AnalysisPanel agentKey="HORMOZI" content={results.hormozi} darkMode={darkMode} lang={lang} />}
              <button
                onClick={() => { setStep('input'); setProspectText(''); setResults(null); }}
                className="w-full py-2 rounded-xl text-xs font-medium"
                style={{
                  border: '1px solid rgba(20,184,166,0.15)',
                  color: 'rgba(20,184,166,0.5)',
                  background: 'transparent',
                }}
              >
                {lang === 'fr' ? '← Analyser un autre prospect' : '← Analyze another prospect'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

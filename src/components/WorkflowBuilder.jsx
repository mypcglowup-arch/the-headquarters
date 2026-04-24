import { useState } from 'react';
import { Wrench, ChevronLeft, ChevronRight, Copy, Check, FileDown, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { WORKFLOW_TEMPLATES } from '../data/workflowTemplates.js';

// Simple markdown → HTML renderer for the guide/script tabs.
// Handles bold (**...**) across newlines, italic, inline code, and headers.
function renderMd(text) {
  if (!text) return '';
  const safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n][\s\S]*?[^*\n])\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+?)`/g, '<code style="padding:1px 5px;border-radius:4px;font-family:ui-monospace,monospace;font-size:0.9em;background:rgba(99,102,241,0.12);color:#a5b4fc">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:14px 0 6px;color:#a5b4fc">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:15px;font-weight:700;margin:16px 0 8px;color:#a5b4fc">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="font-size:17px;font-weight:800;margin:18px 0 10px;color:#f1f5f9">$1</h1>');
}
import { computePricing, budgetAlignment } from '../utils/workflowPricing.js';
import { generateWorkflowPackage } from '../api.js';
import { buildWorkflowPdf, downloadPdfBlob } from '../utils/workflowPdf.js';

export default function WorkflowBuilder({ darkMode = true, lang = 'fr' }) {
  const [phase, setPhase]           = useState('picker');   // 'picker' | 'questioning' | 'generating' | 'results'
  const [template, setTemplate]     = useState(null);
  const [qIdx, setQIdx]             = useState(0);
  const [answers, setAnswers]       = useState({});
  const [pkg, setPkg]               = useState(null);
  const [pdfFile, setPdfFile]       = useState(null); // { blob, filename } — pre-built during 'generating'
  const [genStep, setGenStep]       = useState('llm'); // 'llm' | 'pdf' — fine-grained progress UI
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState('json');
  const [copied, setCopied]         = useState(null);

  const c = darkMode ? {
    bg0: '#0b0f1a', bg1: 'rgba(10,14,24,0.75)', bg2: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)', text0: '#f1f5f9', text1: '#cbd5e1', text2: 'rgba(148,163,184,0.7)',
    accent: '#6366f1',
  } : {
    bg0: '#F5F4F0', bg1: '#FFFFFF', bg2: '#ECEAE4',
    border: 'rgba(0,0,0,0.08)', text0: '#0f172a', text1: '#1e293b', text2: '#64748b',
    accent: '#6366f1',
  };

  // ─── Phase: picker ───────────────────────────────────────────────────
  if (phase === 'picker') {
    return (
      <div className="animate-screen-in" style={{ padding: '32px 24px 160px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          }}>
            <Wrench size={18} style={{ color: c.accent }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text0, margin: 0 }}>
              {lang === 'fr' ? 'Workflow Builder' : 'Workflow Builder'}
            </h1>
            <p style={{ fontSize: 12, color: c.text2, margin: 0, marginTop: 2 }}>
              {lang === 'fr'
                ? 'Tu construis un workflow POUR ton client. Pick un template → 5 questions sur ton client → package livrable (JSON Make.com + guide + sales script).'
                : "You're building a workflow FOR your client. Pick a template → 5 questions about your client → deliverable package (Make.com JSON + guide + sales script)."}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {WORKFLOW_TEMPLATES.map((t) => (
            <button key={t.id}
              onClick={() => { setTemplate(t); setAnswers({}); setQIdx(0); setPhase('questioning'); }}
              style={{
                textAlign: 'left', padding: 18, borderRadius: 14, cursor: 'pointer',
                background: c.bg1, border: `1px solid ${c.border}`,
                transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.015)'; e.currentTarget.style.background = darkMode ? 'rgba(99,102,241,0.07)' : 'rgba(99,102,241,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = c.bg1; }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{t.emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.text0, marginBottom: 4 }}>
                {lang === 'fr' ? t.name : t.nameEn}
              </div>
              <div style={{ fontSize: 11, color: c.text2, lineHeight: 1.4 }}>
                {lang === 'fr' ? t.description : t.descriptionEn}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Phase: questioning ──────────────────────────────────────────────
  if (phase === 'questioning' && template) {
    const questions = template.questions;
    const q = questions[qIdx];
    const value = answers[q.key];
    const hasValue = q.type === 'multi'
      ? Array.isArray(value) && value.length > 0
      : value !== undefined && String(value).trim() !== '';

    const setValue = (v) => setAnswers((prev) => ({ ...prev, [q.key]: v }));

    // Validate answers before generation — block vague/incomplete input
    const validateAnswers = () => {
      const problems = [];
      const name  = String(answers.clientName || '').trim();
      const tools = Array.isArray(answers.tools) ? answers.tools : [];
      const vol   = Number(answers.volume);
      if (name.length < 3)
        problems.push(lang === 'fr' ? "Le nom du client doit avoir au moins 3 caractères." : "Client name needs at least 3 characters.");
      if (!answers.industry)
        problems.push(lang === 'fr' ? "Sélectionne l'industrie du client." : "Pick the client's industry.");
      if (tools.length === 0)
        problems.push(lang === 'fr' ? "Sélectionne au moins un outil (ou 'Aucun' si c'est le cas)." : "Select at least one tool (or 'None' if true).");
      if (!Number.isFinite(vol) || vol <= 0)
        problems.push(lang === 'fr' ? "Donne un volume réaliste (nombre > 0). Pas de workflow générique sans ce chiffre." : "Give a realistic volume (number > 0).");
      if (!answers.budget)
        problems.push(lang === 'fr' ? "Indique le budget du client." : "Indicate the client's budget.");
      return problems;
    };

    const goNext = async () => {
      if (qIdx < questions.length - 1) { setQIdx(qIdx + 1); return; }
      // Last question — validate before generating
      const problems = validateAnswers();
      if (problems.length > 0) {
        setError(problems.join(' · '));
        // Jump back to the first missing field for fast correction
        const firstMissingIdx = questions.findIndex((q) => {
          const v = answers[q.key];
          if (q.type === 'multi') return !Array.isArray(v) || v.length === 0;
          if (q.type === 'number') return !Number.isFinite(Number(v)) || Number(v) <= 0;
          return !v || String(v).trim().length < 3;
        });
        if (firstMissingIdx !== -1 && firstMissingIdx !== qIdx) setQIdx(firstMissingIdx);
        return;
      }
      setPhase('generating');
      setGenStep('llm');
      setError(null);
      setPkg(null);
      setPdfFile(null);
      try {
        const pricing = computePricing(answers, template);
        // ── 1) Run the 3 LLM calls in parallel (JSON fill + guide + script) ──
        const result = await generateWorkflowPackage({ answers, template, pricing, lang });
        if (!result) {
          setError(lang === 'fr' ? 'Échec de génération du package' : 'Package generation failed');
          setPhase('questioning');
          return;
        }

        // ── 2) Build the PDF from the package (sync, happens here) ─────────
        // We ONLY transition to 'results' after this succeeds, so the UI
        // never announces "ready" before the PDF actually exists.
        setGenStep('pdf');
        // Yield to the browser so the "Generating PDF" label paints before
        // jsPDF starts its heavy synchronous work.
        await new Promise((r) => setTimeout(r, 30));
        let pdfOutput = null;
        try {
          pdfOutput = buildWorkflowPdf({ answers, template, pkg: result, lang });
        } catch (pdfErr) {
          console.warn('[WorkflowBuilder] PDF build failed:', pdfErr.message);
        }

        // ── 3) Commit state only once everything is truly ready ───────────
        setPkg(result);
        setPdfFile(pdfOutput);
        setActiveTab(result.makeJson ? 'json' : 'guide');
        setPhase('results');
      } catch (err) {
        setError(err.message || 'Unknown error');
        setPhase('questioning');
      }
    };

    const goBack = () => {
      if (qIdx > 0) setQIdx(qIdx - 1);
      else { setPhase('picker'); setTemplate(null); }
    };

    const label = lang === 'fr' ? q.label : (q.labelEn || q.label);

    return (
      <div className="animate-screen-in" style={{ padding: '32px 24px 160px', maxWidth: 640, margin: '0 auto' }}>
        <button onClick={goBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: c.text2, fontSize: 12, marginBottom: 24,
          }}>
          <ChevronLeft size={13} /> {lang === 'fr' ? 'Retour' : 'Back'}
        </button>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= qIdx ? c.accent : c.border,
              transition: 'background 200ms',
            }} />
          ))}
        </div>

        <div style={{ fontSize: 11, color: c.text2, marginBottom: 6 }}>
          {template.emoji} {lang === 'fr' ? template.name : template.nameEn} · {qIdx + 1} / {questions.length}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: c.text0, margin: 0, marginBottom: 16 }}>
          {label}
        </h2>

        {/* Input by type */}
        {q.type === 'text' && (
          <input type="text" autoFocus value={value || ''} onChange={(e) => setValue(e.target.value)}
            placeholder={q.placeholder || ''}
            onKeyDown={(e) => { if (e.key === 'Enter' && hasValue) goNext(); }}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              background: c.bg2, border: `1px solid ${c.border}`,
              color: c.text0, fontSize: 14, outline: 'none',
            }} />
        )}
        {q.type === 'number' && (
          <input type="number" autoFocus value={value || ''} onChange={(e) => setValue(e.target.value)}
            placeholder={q.placeholder || ''} min="0"
            onKeyDown={(e) => { if (e.key === 'Enter' && hasValue) goNext(); }}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              background: c.bg2, border: `1px solid ${c.border}`,
              color: c.text0, fontSize: 14, outline: 'none',
            }} />
        )}
        {q.type === 'select' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {q.options.map((opt) => {
              const selected = value === opt;
              return (
                <button key={opt} onClick={() => setValue(opt)}
                  style={{
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    background: selected ? 'rgba(99,102,241,0.12)' : c.bg2,
                    border: `1px solid ${selected ? 'rgba(99,102,241,0.4)' : c.border}`,
                    color: selected ? c.accent : c.text1,
                    fontSize: 13, fontWeight: selected ? 600 : 400,
                    textAlign: 'left', transition: 'all 150ms',
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        )}
        {q.type === 'multi' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {q.options.map((opt) => {
              const arr = Array.isArray(value) ? value : [];
              const selected = arr.includes(opt);
              return (
                <button key={opt}
                  onClick={() => {
                    const next = selected ? arr.filter((x) => x !== opt) : [...arr, opt];
                    setValue(next);
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
                    background: selected ? 'rgba(99,102,241,0.15)' : c.bg2,
                    border: `1px solid ${selected ? 'rgba(99,102,241,0.4)' : c.border}`,
                    color: selected ? c.accent : c.text1,
                    fontSize: 12, fontWeight: selected ? 600 : 400,
                    transition: 'all 150ms',
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
          <button onClick={goNext} disabled={!hasValue}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10,
              background: hasValue ? c.accent : c.border,
              color: '#fff', border: 'none',
              cursor: hasValue ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: hasValue ? 1 : 0.5,
              transition: 'all 150ms',
            }}>
            {qIdx < questions.length - 1
              ? (<>{lang === 'fr' ? 'Suivant' : 'Next'} <ChevronRight size={14} /></>)
              : (<><Sparkles size={14} /> {lang === 'fr' ? 'Générer le package' : 'Generate package'}</>)}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', color: 'rgb(239,68,68)', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={12} /> {error}
          </div>
        )}
      </div>
    );
  }

  // ─── Phase: generating ──────────────────────────────────────────────
  if (phase === 'generating') {
    const stepLabel = genStep === 'pdf'
      ? (lang === 'fr' ? 'Compilation du PDF…' : 'Compiling the PDF…')
      : (lang === 'fr' ? 'Génération du package en cours…' : 'Generating package…');
    const stepDetail = genStep === 'pdf'
      ? (lang === 'fr'
          ? `Assemblage cover + guide + script + JSON pour ${answers.clientName || 'ton client'}.`
          : `Assembling cover + guide + script + JSON for ${answers.clientName || 'your client'}.`)
      : (lang === 'fr'
          ? `3 documents en parallèle pour ${answers.clientName || 'ton client'} — JSON Make.com, guide pour toi, sales script à lire au client.`
          : `3 documents in parallel for ${answers.clientName || 'your client'} — Make.com JSON, guide for you, sales script to read to the client.`);
    return (
      <div className="animate-screen-in" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: c.text1 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: c.accent }} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>{stepLabel}</span>
        </div>
        <p style={{ fontSize: 12, color: c.text2, marginTop: 10 }}>{stepDetail}</p>
        {/* 2-step progress dots */}
        <div style={{ display: 'inline-flex', gap: 6, marginTop: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.accent, opacity: 1 }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: genStep === 'pdf' ? c.accent : c.border, opacity: genStep === 'pdf' ? 1 : 0.5 }} />
        </div>
      </div>
    );
  }

  // ─── Phase: results ─────────────────────────────────────────────────
  if (phase === 'results' && pkg && template) {
    const pricing = pkg.pricing;
    const budgetCheck = budgetAlignment(answers.budget, pricing);

    const copy = async (text, key) => {
      try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
    };

    return (
      <div className="animate-screen-in" style={{ padding: '24px 24px 160px', maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <button onClick={() => { setPhase('picker'); setTemplate(null); setPkg(null); setPdfFile(null); setAnswers({}); setQIdx(0); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 0', background: 'transparent', border: 'none', cursor: 'pointer', color: c.text2, fontSize: 12, marginBottom: 8 }}>
              <ChevronLeft size={13} /> {lang === 'fr' ? 'Nouveau workflow' : 'New workflow'}
            </button>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.text2, marginBottom: 2 }}>
              {lang === 'fr' ? 'Package pour ton client' : 'Package for your client'}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: c.text0, margin: 0 }}>
              {template.emoji} {answers.clientName}
            </h2>
            <p style={{ fontSize: 12, color: c.text2, margin: 0, marginTop: 2 }}>
              {lang === 'fr' ? template.name : template.nameEn} · {answers.industry}
            </p>
          </div>
          <button
            onClick={() => { if (pdfFile?.blob) downloadPdfBlob(pdfFile.blob, pdfFile.filename); }}
            disabled={!pdfFile?.blob}
            title={pdfFile?.blob
              ? (lang === 'fr' ? 'Télécharger le PDF' : 'Download PDF')
              : (lang === 'fr' ? 'PDF indisponible' : 'PDF unavailable')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 14px', borderRadius: 10,
              background: pdfFile?.blob ? c.accent : c.border,
              color: '#fff', border: 'none',
              cursor: pdfFile?.blob ? 'pointer' : 'not-allowed',
              fontSize: 12, fontWeight: 700,
              boxShadow: pdfFile?.blob ? '0 0 16px rgba(99,102,241,0.25)' : 'none',
              opacity: pdfFile?.blob ? 1 : 0.5,
            }}>
            <FileDown size={13} /> {lang === 'fr' ? 'Télécharger PDF' : 'Download PDF'}
          </button>
        </div>

        {/* Confirmation banner — only rendered once everything is truly ready */}
        {pdfFile?.blob && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.28)',
            color: 'rgba(16,185,129,0.95)',
            fontSize: 12,
          }}>
            <CheckCircle2 size={14} />
            <span>
              {lang === 'fr'
                ? `Package complet pour ${answers.clientName} — PDF prêt (${(pdfFile.blob.size / 1024).toFixed(0)} Ko). Clique sur Télécharger.`
                : `Full package for ${answers.clientName} — PDF ready (${(pdfFile.blob.size / 1024).toFixed(0)} KB). Click Download.`}
            </span>
          </div>
        )}
        {!pdfFile?.blob && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.28)',
            color: 'rgba(251,191,36,0.95)',
            fontSize: 12,
          }}>
            <AlertCircle size={14} />
            <span>
              {lang === 'fr'
                ? 'Package généré mais le PDF a échoué — tu peux copier le contenu depuis les onglets ci-dessous.'
                : 'Package generated but PDF build failed — copy content from the tabs below.'}
            </span>
          </div>
        )}

        {/* Pricing card */}
        {pricing && (
          <div style={{
            padding: 16, borderRadius: 12, marginBottom: 16,
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.25)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(251,191,36,0.9)', marginBottom: 6 }}>
              {lang === 'fr' ? 'Tier suggéré' : 'Suggested tier'} — {pricing.tier}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: 22, fontWeight: 800, color: c.text0 }}>${pricing.setupMin.toLocaleString()}–${pricing.setupMax.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: c.text2, marginLeft: 6 }}>{lang === 'fr' ? 'setup' : 'setup'}</span>
              </div>
              <div>
                <span style={{ fontSize: 22, fontWeight: 800, color: c.text0 }}>${pricing.retainerMin.toLocaleString()}–${pricing.retainerMax.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: c.text2, marginLeft: 6 }}>/ mo</span>
              </div>
              <div style={{ fontSize: 10, color: c.text2 }}>
                {lang === 'fr' ? 'Complexité' : 'Complexity'} : {pricing.score}/15
              </div>
            </div>
            {budgetCheck === 'below' && (
              <p style={{ fontSize: 11, color: 'rgb(239,68,68)', marginTop: 8 }}>
                ⚠ {lang === 'fr' ? 'Budget déclaré sous le tier suggéré — envisage de remonter le prix ou simplifier le scope.' : 'Stated budget below tier — raise price or simplify scope.'}
              </p>
            )}
            {budgetCheck === 'tight' && (
              <p style={{ fontSize: 11, color: 'rgb(251,191,36)', marginTop: 8 }}>
                {lang === 'fr' ? 'Budget serré — vends le ROI en priorité.' : 'Tight budget — lead with ROI.'}
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${c.border}`, marginBottom: 16 }}>
          {[
            { key: 'json',   label: lang === 'fr' ? 'JSON Make.com' : 'Make.com JSON' },
            { key: 'guide',  label: lang === 'fr' ? "Guide d'installation" : 'Install guide' },
            { key: 'script', label: lang === 'fr' ? 'Script de vente' : 'Sales script' },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab.key ? c.accent : 'transparent'}`,
                color: activeTab === tab.key ? c.accent : c.text2,
                fontSize: 12, fontWeight: 600, transition: 'all 150ms',
                marginBottom: -1,
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'json' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => copy(JSON.stringify(pkg.makeJson, null, 2), 'json')}
                disabled={!pkg.makeJson}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: c.bg2, border: `1px solid ${c.border}`, color: c.text1, cursor: pkg.makeJson ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600 }}>
                {copied === 'json' ? <><Check size={11} /> {lang === 'fr' ? 'Copié' : 'Copied'}</> : <><Copy size={11} /> {lang === 'fr' ? 'Copier' : 'Copy'}</>}
              </button>
            </div>
            <pre style={{
              padding: 16, borderRadius: 10, background: darkMode ? '#0a0f1c' : '#F5F4F0',
              border: `1px solid ${c.border}`, color: c.text1,
              fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              overflow: 'auto', maxHeight: 500, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {pkg.makeJson ? JSON.stringify(pkg.makeJson, null, 2) : (lang === 'fr' ? 'JSON non généré — réessaie.' : 'JSON not generated — retry.')}
            </pre>
          </div>
        )}
        {activeTab === 'guide' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => copy(pkg.guide || '', 'guide')}
                disabled={!pkg.guide}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: c.bg2, border: `1px solid ${c.border}`, color: c.text1, cursor: pkg.guide ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600 }}>
                {copied === 'guide' ? <><Check size={11} /> {lang === 'fr' ? 'Copié' : 'Copied'}</> : <><Copy size={11} /> {lang === 'fr' ? 'Copier' : 'Copy'}</>}
              </button>
            </div>
            <div style={{ padding: 20, borderRadius: 10, background: c.bg1, border: `1px solid ${c.border}`, color: c.text1, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: pkg.guide
                ? renderMd(pkg.guide)
                : (lang === 'fr' ? 'Guide non généré — réessaie.' : 'Guide not generated — retry.') }} />
          </div>
        )}
        {activeTab === 'script' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => copy(pkg.script || '', 'script')}
                disabled={!pkg.script}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: c.bg2, border: `1px solid ${c.border}`, color: c.text1, cursor: pkg.script ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600 }}>
                {copied === 'script' ? <><Check size={11} /> {lang === 'fr' ? 'Copié' : 'Copied'}</> : <><Copy size={11} /> {lang === 'fr' ? 'Copier' : 'Copy'}</>}
              </button>
            </div>
            <div style={{ padding: 20, borderRadius: 10, background: c.bg1, border: `1px solid ${c.border}`, color: c.text1, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: pkg.script
                ? renderMd(pkg.script)
                : (lang === 'fr' ? 'Script non généré — réessaie.' : 'Script not generated — retry.') }} />
          </div>
        )}
      </div>
    );
  }

  return null;
}

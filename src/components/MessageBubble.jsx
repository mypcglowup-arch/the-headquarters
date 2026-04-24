import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Download, FileText, X, Trophy, Pin, Bookmark, BookmarkCheck, Share2, Star, ThumbsUp, ThumbsDown, RefreshCw, Target } from 'lucide-react';
import { saveResponse, unsaveResponse, isSaved } from '../utils/library.js';
import { AGENT_CONFIG } from '../prompts.js';
import AgentAvatar from './AgentAvatar.jsx';
import { exportToPdf, getPdfBlobUrl } from '../utils/exportPdf.js';
import { t } from '../i18n.js';

export default function MessageBubble({ message, agentNames, agentPhotos, darkMode, feedback, onFeedback, onLogWin, onReaction, onPin, isPinned, onQuote, isLast, onSecondOpinion, lang = 'fr' }) {
  if (message.type === 'system') {
    if (message.isConsensus) {
      return (
        <div className="my-4 mx-auto max-w-xl w-full">
          <div className={`rounded-2xl border-2 p-5 ${darkMode ? 'bg-emerald-950/60 border-emerald-700 text-emerald-100' : 'bg-emerald-50 border-emerald-400 text-emerald-900'}`}>
            <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
              <Target size={10} className="inline mr-1.5" style={{ verticalAlign: 'middle' }} />Consensus — Action to Take
            </p>
            <p className="text-base font-semibold leading-snug">
              {message.content.replace('Session archived. Consensus: ', '').replace(/^"|"$/g, '')}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-center my-3">
        <div className={`px-4 py-2 rounded-full text-xs ${darkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
          {message.content}
        </div>
      </div>
    );
  }

  if (message.type === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className={`max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-800 text-white'}`}>
          {message.content}
        </div>
      </div>
    );
  }

  if (message.type === 'agent') {
    return <AgentMessage message={message} agentNames={agentNames} agentPhotos={agentPhotos} darkMode={darkMode} feedback={feedback} onFeedback={onFeedback} onLogWin={onLogWin} onReaction={onReaction} onPin={onPin} isPinned={isPinned} onQuote={onQuote} isLast={isLast} onSecondOpinion={onSecondOpinion} lang={lang} />;
  }

  return null;
}

// ── PDF notification lines ────────────────────────────────────────────────────
const COMPILING_LINES = {
  HORMOZI:     'Running the numbers. Compiling your report...',
  CARDONE:     'Locking it in. Your document is being built...',
  ROBBINS:     'Pulling the thread together. One moment...',
  GARYV:       'Packaging the insight. Give me a second...',
  NAVAL:       'Structuring the leverage. Compiling...',
  VOSS:        'Calibrating the language. Document incoming...',
  SYNTHESIZER: 'Distilling the consensus. Compiling...',
};
const READY_LINES = {
  HORMOZI:     'Your report is ready. The math is all there. Check your downloads.',
  CARDONE:     'Done. Your document is in downloads — now execute on it.',
  ROBBINS:     'Your report is ready. Read it with intention. Check your downloads.',
  GARYV:       'It\'s yours. The content is in your downloads — use it.',
  NAVAL:       'Compiled. The leverage is documented. Check your downloads.',
  VOSS:        'Your report is ready. Every word was deliberate. Check your downloads.',
  SYNTHESIZER: 'The verdict is documented. Check your downloads.',
};

// ── Agent message card ────────────────────────────────────────────────────────
const REACTIONS = [
  { label: '↓ Approfondir',              text: 'Approfondis ce point. Plus de détails, même angle. Ne te répète pas.' },
  { label: '◎ Simplifier',               text: 'Dis-moi la même chose en 3 phrases simples. Comme si j\'avais 15 ans.' },
  { label: '→ Exemple concret',          text: 'Donne-moi un exemple concret et réel. Pas hypothétique. Quelque chose qui existe.' },
  { label: '✦ Plan d\'action',           text: 'Transforme ça en plan. 3 étapes max. Deadlines précises. Premier pas aujourd\'hui.' },
  { label: '≠ Je ne suis pas d\'accord', text: 'Je ne suis pas d\'accord. Défends ta position avec des faits ou admets que t\'avais tort.' },
];

function AgentMessage({ message, agentNames, agentPhotos, darkMode, feedback, onFeedback, onLogWin, onReaction, onPin, isPinned, onQuote, isLast, onSecondOpinion, lang = 'fr' }) {
  const config      = AGENT_CONFIG[message.agent] || AGENT_CONFIG.SYNTHESIZER;
  const displayName = agentNames[message.agent] || message.agent;
  const photo       = agentPhotos?.[message.agent];

  const [copied, setCopied]           = useState(false);
  const [exportPhase, setExportPhase] = useState(null);
  const [pdfCard, setPdfCard]         = useState(null);
  const [blobUrl, setBlobUrl]         = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [winLogged, setWinLogged]     = useState(false);
  const [quoteSelection, setQuoteSelection] = useState(null);
  const [saved, setSaved]             = useState(() => isSaved(message.id));
  const [shareCopied, setShareCopied] = useState(false);
  const [opinionOpen, setOpinionOpen] = useState(false);
  const [rating, setRating]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('hq_ratings') || '{}')[message.id] || 0; } catch { return 0; }
  });
  const [hoverStar, setHoverStar]     = useState(0);
  const autoTriggered = useRef(false);

  // Dismiss quote toolbar on outside click
  useEffect(() => {
    if (!quoteSelection) return;
    function dismiss(e) {
      // Don't dismiss if clicking the toolbar itself
      if (e.target.closest?.('[data-quote-toolbar]')) return;
      setQuoteSelection(null);
    }
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [quoteSelection]);

  const safeDate    = message.timestamp ? new Date(message.timestamp) : new Date();
  const validDate   = isNaN(safeDate.getTime()) ? new Date() : safeDate;
  const pdfFilename = `${displayName.replace(/\s+/g, '-')}-${validDate.toISOString().slice(0, 10)}.pdf`;

  const rgb         = config.glowRgb;
  const accentColor = `rgb(${rgb})`;
  const compilingText = COMPILING_LINES[message.agent] || 'Compiling your report...';
  const readyText     = READY_LINES[message.agent]    || 'Your report is ready. Check your downloads.';

  // Auto-drop: generate blob URL once streaming is complete
  useEffect(() => {
    if (!message.pdfDrop || autoTriggered.current || message.streaming) return;
    autoTriggered.current = true;
    setPdfCard('compiling');
    setTimeout(() => {
      try {
        const url = getPdfBlobUrl(message.agent, displayName, message.content, validDate);
        setBlobUrl(url);
      } catch (err) { console.error('[AutoPDF]', err); }
      setPdfCard('ready');
    }, 1600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.streaming]);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  function openPreview(e) {
    e.stopPropagation();
    if (!blobUrl) {
      try {
        const url = getPdfBlobUrl(message.agent, displayName, message.content, validDate);
        setBlobUrl(url);
      } catch (err) { console.error('[PDFPreview]', err); return; }
    }
    setPreviewOpen(true);
  }
  function closePreview() { setPreviewOpen(false); }

  function downloadPdf(e) {
    e?.stopPropagation();
    try { exportToPdf(message.agent, displayName, message.content, validDate); } catch (err) { console.error('[Download]', err); }
  }

  function handleCopy(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(message.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSave() {
    if (saved) {
      unsaveResponse(message.id);
      setSaved(false);
    } else {
      saveResponse({
        id: message.id,
        agent: message.agent,
        domain: config.domain,
        content: message.content,
        timestamp: validDate.toISOString(),
      });
      setSaved(true);
    }
  }

  function handleShare() {
    const formatted = `[${displayName}]\n\n${message.content}\n\n— QG Advisory`;
    navigator.clipboard.writeText(formatted).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  }

  function handleRating(stars) {
    setRating(stars);
    try {
      const all = JSON.parse(localStorage.getItem('hq_ratings') || '{}');
      all[message.id] = stars;
      localStorage.setItem('hq_ratings', JSON.stringify(all));
    } catch {}
  }

  function handleExportPdf(e) {
    e.stopPropagation();
    if (exportPhase) return;
    setExportPhase('compiling');
    setTimeout(() => {
      try {
        const url = getPdfBlobUrl(message.agent, displayName, message.content, validDate);
        setBlobUrl(url);
      } catch (err) { console.error('[ExportPDF]', err); }
      setExportPhase('ready');
      setTimeout(() => setExportPhase(null), 3500);
    }, 1400);
  }

  return (
    <div className="flex flex-col mb-7 animate-bubble-in" data-message-id={message.id}>

      {/* ── RESPONSE CARD ── */}
      <div
        className="relative group/bubble max-w-[85%] rounded-2xl overflow-hidden"
        style={{
          border: `1px solid rgba(${rgb}, 0.2)`,
          boxShadow: `0 0 0 0px rgba(${rgb},0), -3px 0 18px -4px rgba(${rgb}, 0.35), 0 4px 32px rgba(${rgb}, 0.06)`,
        }}
      >
        {/* Colored header bar */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{
            background: `linear-gradient(135deg, rgba(${rgb}, 0.22) 0%, rgba(${rgb}, 0.07) 100%)`,
            borderBottom: `1px solid rgba(${rgb}, 0.18)`,
          }}
        >
          <AgentAvatar agentKey={message.agent} photo={photo} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm animate-name-pulse" style={{ color: accentColor }}>
                {config.emoji} {displayName}
              </span>
              <span className="text-xs opacity-40" style={{ color: accentColor }}>·</span>
              <span className="text-xs opacity-50" style={{ color: accentColor }}>{t(`domain.${message.agent}`, lang) || config.domain}</span>
              {/* Supporting agent emojis */}
              {message.routing?.supporting?.length > 0 && (
                <span className="flex items-center gap-0.5 ml-1">
                  {message.routing.supporting.map((key) => (
                    <span key={key} className="text-xs opacity-50" title={agentNames?.[key] || key}>
                      {AGENT_CONFIG[key]?.emoji ?? ''}
                    </span>
                  ))}
                </span>
              )}
            </div>
            {/* Timestamp */}
            <p className="text-[10px] mt-0.5 opacity-30 tabular-nums" style={{ color: accentColor }}>
              {validDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {/* Always-visible header actions: Pin · Quote · Save · Share */}
          <div className="flex-shrink-0 flex items-center gap-0.5 ml-2">
            {onPin && (
              <button
                type="button"
                onClick={() => onPin(message)}
                title={isPinned ? 'Désépingler' : 'Épingler'}
                className="p-1 rounded-lg transition-all"
                style={{ color: isPinned ? accentColor : (darkMode ? '#6b7280' : '#9ca3af') }}
              >
                <Pin size={13} />
              </button>
            )}
            {!message.streaming && (
              <button
                type="button"
                onClick={() => onQuote?.(message.content, message.agent)}
                title="Citer ce message"
                className="p-1 rounded-lg transition-all"
                style={{ color: darkMode ? '#6b7280' : '#9ca3af', lineHeight: 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = accentColor; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = darkMode ? '#6b7280' : '#9ca3af'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>
              </button>
            )}
            {!message.streaming && (
              <button
                type="button"
                onClick={handleSave}
                title={saved ? 'Retirer de la bibliothèque' : 'Sauvegarder'}
                className="p-1 rounded-lg transition-all"
                style={{ color: saved ? accentColor : (darkMode ? '#6b7280' : '#9ca3af') }}
              >
                {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              </button>
            )}
            {!message.streaming && (
              <button
                type="button"
                onClick={handleShare}
                title="Copier le contenu formaté"
                className="p-1 rounded-lg transition-all"
                style={{ color: shareCopied ? '#10b981' : (darkMode ? '#6b7280' : '#9ca3af') }}
              >
                {shareCopied ? <Check size={13} /> : <Share2 size={13} />}
              </button>
            )}
          </div>
        </div>

        {/* Content area — left accent border + subtle tint */}
        <div
          className={`px-5 py-5 text-sm agent-prose ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}
          style={{
            borderLeft: `3px solid rgba(${rgb}, 0.55)`,
            background: darkMode ? `rgba(${rgb}, 0.035)` : `rgba(${rgb}, 0.018)`,
          }}
          onMouseUp={() => {
            if (!onQuote || message.streaming) return;
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
            const range = sel.getRangeAt(0);
            const rect  = range.getBoundingClientRect();
            setQuoteSelection({ text: sel.toString().trim(), rect });
          }}
        >
          {(() => {
            const contentToRender = message.pdfDrop
              ? (message.content.split('\n\n')[0] || message.content)
              : message.content;
            if (message.agent === 'SYNTHESIZER' && !message.streaming) {
              return <VerdictContent text={contentToRender} config={config} darkMode={darkMode} lang={lang} />;
            }
            if (message.streaming) {
              return <FormattedText content={contentToRender} config={config} darkMode={darkMode} />;
            }
            return <SmartContent text={contentToRender} config={config} darkMode={darkMode} lang={lang} />;
          })()}
          {message.streaming && (
            <span
              className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
              style={{ backgroundColor: `rgba(${rgb}, 0.8)` }}
            />
          )}
        </div>

        {/* Action buttons — appear on hover (export + copy only) */}
        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover/bubble:opacity-100 transition-all">
          <button
            type="button"
            onClick={exportPhase ? undefined : handleExportPdf}
            title="Export as PDF"
            className={`p-1.5 rounded-lg transition-colors ${
              exportPhase === 'ready'
                ? darkMode ? 'bg-emerald-800 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                : darkMode ? 'bg-gray-800/80 text-gray-400 hover:text-gray-200' : 'bg-white/80 text-gray-400 hover:text-gray-700 shadow-sm'
            }`}
          >
            {exportPhase === 'ready' ? <Check size={12} /> : <Download size={12} />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy response"
            className={`p-1.5 rounded-lg transition-colors ${
              copied
                ? darkMode ? 'bg-emerald-800 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                : darkMode ? 'bg-gray-800/80 text-gray-400 hover:text-gray-200' : 'bg-white/80 text-gray-400 hover:text-gray-700 shadow-sm'
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Manual export status */}
      {exportPhase && (
        <div
          className="mt-2 max-w-[85%] flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium"
          style={{ backgroundColor: `rgba(${rgb}, 0.08)`, border: `1px solid rgba(${rgb}, 0.2)`, color: accentColor }}
        >
          {exportPhase === 'compiling' ? (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-t-transparent flex-shrink-0 animate-spin" style={{ borderColor: `rgba(${rgb}, 0.5)`, borderTopColor: 'transparent' }} />
              <span>{compilingText}</span>
            </>
          ) : (
            <><Check size={12} className="flex-shrink-0" /><span>{readyText}</span></>
          )}
        </div>
      )}

      {/* Auto-drop PDF card */}
      {pdfCard && (
        <div className="mt-3 max-w-[85%]">
          {pdfCard === 'compiling' ? (
            <div
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium"
              style={{ backgroundColor: `rgba(${rgb}, 0.08)`, border: `1px solid rgba(${rgb}, 0.2)`, color: accentColor }}
            >
              <div className="w-3 h-3 rounded-full border-2 border-t-transparent flex-shrink-0 animate-spin" style={{ borderColor: `rgba(${rgb}, 0.5)`, borderTopColor: 'transparent' }} />
              <span>{compilingText}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={openPreview}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer ${darkMode ? 'bg-gray-900 border-gray-700 hover:border-gray-500 hover:bg-gray-800' : 'bg-white border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}
              title="Click to open"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `rgba(${rgb}, 0.12)` }}>
                <FileText size={18} style={{ color: accentColor }} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className={`text-xs font-bold truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{pdfFilename}</p>
                <p className="text-xs mt-0.5" style={{ color: accentColor, opacity: 0.7 }}>{readyText}</p>
              </div>
              <svg viewBox="0 0 16 16" className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4.5 11.5L11.5 4.5M11.5 4.5H6.5M11.5 4.5V9.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Feedback + Log Win */}
      {(onFeedback || onLogWin) && (
        <div className="flex items-center gap-2 mt-2 ml-1">
          {onFeedback && <>
            <button
              onClick={() => onFeedback(message.id, feedback === 'up' ? null : 'up')}
              title="Helpful"
              className={`flex items-center transition-all p-1.5 rounded-lg ${feedback === 'up' ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-70'} ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              style={{ color: feedback === 'up' ? '#10b981' : (darkMode ? '#6b7280' : '#9ca3af') }}
            ><ThumbsUp size={12} /></button>
            <button
              onClick={() => onFeedback(message.id, feedback === 'down' ? null : 'down')}
              title="Not helpful"
              className={`flex items-center transition-all p-1.5 rounded-lg ${feedback === 'down' ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-70'} ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              style={{ color: feedback === 'down' ? '#ef4444' : (darkMode ? '#6b7280' : '#9ca3af') }}
            ><ThumbsDown size={12} /></button>
          </>}
          {onLogWin && !winLogged && !message.streaming && (
            <button
              onClick={() => {
                // Extract first line as win text
                const firstLine = message.content.split('\n').find((l) => l.trim().length > 10) || message.content.slice(0, 80);
                onLogWin({ text: firstLine.slice(0, 120), agent: message.agent });
                setWinLogged(true);
              }}
              title="Log as Win"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all opacity-40 hover:opacity-100"
              style={{
                background: `rgba(${rgb}, 0.1)`,
                border: `1px solid rgba(${rgb}, 0.25)`,
                color: `rgb(${rgb})`,
              }}
            >
              <Trophy size={9} />
              Log as Win
            </button>
          )}
          {winLogged && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
              <Check size={9} /> Win logged!
            </span>
          )}
        </div>
      )}

      {/* Contextual reactions — always visible on last message, hover-only on older */}
      {onReaction && !message.streaming && (
        <div
          className={`flex flex-wrap items-center gap-1.5 mt-2 ml-1 ${isLast ? '' : 'opacity-0 group-hover/bubble:opacity-100'}`}
          style={{ marginTop: '10px', display: 'flex', gap: '6px', transition: 'opacity 0.15s ease' }}
        >
          {REACTIONS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => onReaction(r.text, message.agent)}
              className={`${darkMode ? 'text-gray-400 hover:text-gray-100' : 'text-gray-500 hover:text-gray-900'}`}
              style={{
                background: 'transparent',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* E) Star rating — always shown below reactions when not streaming */}
      {!message.streaming && (
        <div className="flex items-center gap-0.5 mt-1.5 ml-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleRating(s)}
              onMouseEnter={() => setHoverStar(s)}
              onMouseLeave={() => setHoverStar(0)}
              style={{
                color: s <= (hoverStar || rating) ? '#f59e0b' : (darkMode ? '#374151' : '#d1d5db'),
                fontSize: '15px',
                lineHeight: 1,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: '1px 2px',
                transition: 'color 0.1s ease',
              }}
            >★</button>
          ))}
          {rating > 0 && (
            <span style={{ fontSize: '10px', opacity: 0.45, color: darkMode ? '#9ca3af' : '#6b7280', marginLeft: '4px' }}>
              {rating}/5
            </span>
          )}
        </div>
      )}

      {/* C) Seconde opinion — button + inline agent picker */}
      {!message.streaming && onSecondOpinion && (
        <div className="ml-1 mt-2">
          <button
            type="button"
            onClick={() => setOpinionOpen((s) => !s)}
            className="flex items-center gap-1.5 text-[11px] font-medium transition-all"
            style={{
              color: opinionOpen ? accentColor : (darkMode ? '#4b5563' : '#9ca3af'),
              background: opinionOpen ? `rgba(${rgb}, 0.08)` : 'transparent',
              border: `1px solid ${opinionOpen ? `rgba(${rgb}, 0.25)` : 'rgba(148,163,184,0.12)'}`,
              borderRadius: '16px',
              padding: '3px 10px',
            }}
          >
            <RefreshCw size={11} />
            Seconde opinion
          </button>
          {opinionOpen && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(AGENT_CONFIG)
                .filter(([k]) => k !== message.agent && k !== 'SYNTHESIZER' && k !== 'COORDINATOR')
                .map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { onSecondOpinion(key, message.content); setOpinionOpen(false); }}
                    className="flex items-center gap-1 text-[11px] font-medium transition-all"
                    style={{
                      background: `rgba(${cfg.glowRgb}, 0.1)`,
                      border: `1px solid rgba(${cfg.glowRgb}, 0.25)`,
                      borderRadius: '16px',
                      padding: '3px 10px',
                      color: `rgb(${cfg.glowRgb})`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${cfg.glowRgb}, 0.18)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = `rgba(${cfg.glowRgb}, 0.1)`; }}
                  >
                    <span>{cfg.emoji}</span>
                    <span>{key}</span>
                  </button>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* B) Share toast — brief "Copié !" pill at bottom of bubble */}
      {shareCopied && createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: darkMode ? '#1f2937' : '#111827',
            color: '#fff',
            borderRadius: '20px',
            padding: '7px 18px',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            animation: 'mentionPopup 0.2s ease forwards',
          }}
        >
          <Check size={12} />
          Copié !
        </div>,
        document.body
      )}

      {/* Quote toolbar — floating above text selection */}
      {quoteSelection && onQuote && createPortal(
        <div
          data-quote-toolbar="1"
          style={{
            position: 'fixed',
            top: quoteSelection.rect.top > 52 ? quoteSelection.rect.top - 44 : quoteSelection.rect.bottom + 8,
            left: Math.max(8, Math.min(
              window.innerWidth - 160,
              quoteSelection.rect.left + quoteSelection.rect.width / 2 - 75
            )),
            zIndex: 9999,
            background: darkMode ? '#1f2937' : '#ffffff',
            border: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '4px 8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onQuote(quoteSelection.text, message.agent);
              setQuoteSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="text-[11px] font-medium whitespace-nowrap transition-opacity hover:opacity-70"
            style={{ color: darkMode ? '#f9fafb' : '#111827', cursor: 'pointer' }}
          >
            Citer et répondre
          </button>
        </div>,
        document.body
      )}

      {/* PDF preview modal */}
      {previewOpen && blobUrl && createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={closePreview}
        >
          <div
            className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: `rgba(${rgb}, 0.15)` }}>
              <FileText size={14} style={{ color: accentColor }} />
            </div>
            <span className="flex-1 text-sm font-medium text-gray-200 truncate">{pdfFilename}</span>
            <button
              type="button"
              onClick={downloadPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <Download size={13} />
              Download
            </button>
            <button
              type="button"
              onClick={closePreview}
              className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <iframe
            src={blobUrl}
            title={pdfFilename}
            style={{ flex: '1 1 0', minHeight: 0, display: 'block', width: '100%', border: 'none' }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

// Returns true for an all-caps section header line
function isAllCapsHeader(line) {
  const t = line.trim();
  if (t.length < 3) return false;
  if (/[a-z]/.test(t)) return false;                          // any lowercase = not a header
  if ((t.match(/[A-Z]/g) || []).length < 2) return false;    // need at least 2 uppercase letters
  return /\s/.test(t) || t.endsWith(':');                    // must be multi-word or end with colon
}

// Callout box triggers — "THE PLAY", "BOTTOM LINE", etc.
const CALLOUT_TRIGGERS = [
  /^THE\s+(PLAY|MOVE|TRUTH|VERDICT|MATH|STRATEGY|OFFER|SYSTEM|FRAMEWORK|PITCH|FORMULA|ANSWER)\b/i,
  /^BOTTOM\s+LINE\b/i,
  /^KEY\s+(TAKEAWAY|INSIGHT|POINT|MOVE)\b/i,
  /^YOUR\s+(MOVE|PLAY)\b/i,
  /^PERFECT\s+FOR\b/i,
  /^THE\s+(INSIGHT|ASK)\b/i,
  /^ACTION\s*(STEP)?\s*:/i,
  /^REMEMBER\s*:/i,
  /^PRO\s+TIP\s*:/i,
  /^WARNING\s*:/i,
];

function isCallout(line) {
  return CALLOUT_TRIGGERS.some((r) => r.test(line.trim()));
}

// Action-verb lines — get left-border accent treatment
const ACTION_VERB_RE = /^(Contacte|Lance|Envoie|Appelle|Crée|Mesure|Teste|Ferme|Contact|Send|Call|Create|Launch|Test|Close|Track|Book|Follow|Set|Write|Build|Schedule|Start|Stop|Fix|Add|Remove|Update|Run|Check|Post|Ask|Go|Get|Make|Find|Use|Take|Give|Sign|Meet|Join|Hit|Push|Pull|Drop|Cut|Raise|Open|Lock)\b/i;

// ── Markdown rendering — dangerouslySetInnerHTML ──────────────────────────────

function renderMarkdownHtml(text, rgb) {
  // Basic HTML-escape first (content is Claude output, but be safe)
  const safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    .replace(/\*\*(.*?)\*\*/g, `<strong style="color:rgb(${rgb});font-weight:700">$1</strong>`)
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, `<code style="padding:2px 6px;border-radius:4px;font-size:0.75rem;font-family:monospace;background:rgba(${rgb},0.15);color:rgb(${rgb})">$1</code>`)
    .replace(/(\$[\d,k.]+|\d[\d,.]*%)/g, `<span style="font-weight:600;color:rgb(${rgb})">$1</span>`)
    .replace(/^### (.+)$/gm, `<strong style="font-size:0.875rem;font-weight:700;color:rgb(${rgb})">$1</strong>`)
    .replace(/^## (.+)$/gm, `<strong style="font-size:0.875rem;font-weight:700;color:rgb(${rgb})">$1</strong>`);
}

// Drop-in replacement for renderInline — returns JSX that renders markdown
function renderInline(text, config) {
  const html = renderMarkdownHtml(String(text), config.glowRgb);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderBlock(block, key, config, darkMode) {
  const rgb  = config.glowRgb;
  const accent = `rgb(${rgb})`;
  const lines  = block.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return null;

  // ── Divider: ---, ———, or * * * variants (standalone line)
  if (lines.length === 1 && /^[-—*\s]{3,}$/.test(lines[0].trim()) && /[-—*]{3}/.test(lines[0])) {
    return (
      <div key={key} className="py-2">
        <div style={{ height: '1px', background: `linear-gradient(to right, rgba(${rgb}, 0.45), rgba(${rgb}, 0.15), transparent)` }} />
      </div>
    );
  }

  // ── Callout box (THE PLAY, BOTTOM LINE, etc.)
  if (isCallout(lines[0])) {
    return (
      <div
        key={key}
        className="rounded-xl px-4 py-3.5 my-1"
        style={{ background: `rgba(${rgb}, 0.1)`, border: `1px solid rgba(${rgb}, 0.28)` }}
      >
        <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: accent }}>
          {lines[0].replace(/:$/, '')}
        </p>
        {lines.slice(1).map((l, j) => (
          <p key={j} className={`text-sm leading-relaxed ${j > 0 ? 'mt-1.5' : ''} ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            {renderInline(l, config)}
          </p>
        ))}
      </div>
    );
  }

  // ── Markdown heading (# / ## / ###)
  const headingMatch = lines[0].match(/^(#{1,3})\s+(.+)/);
  if (headingMatch) {
    const level    = headingMatch[1].length;
    const sizeClass = level === 1 ? 'text-base font-black' : 'text-sm font-bold';
    const rest     = lines.slice(1);
    return (
      <div key={key} className="space-y-2">
        <p className={sizeClass} style={{ color: accent }}>{renderInline(headingMatch[2], config)}</p>
        {rest.length > 0 && (
          <div className="space-y-1.5">
            {rest.map((l, j) => <p key={j}>{renderInline(l, config)}</p>)}
          </div>
        )}
      </div>
    );
  }

  // ── ALL CAPS section header
  if (isAllCapsHeader(lines[0])) {
    const rest = lines.slice(1);
    return (
      <div key={key} className="space-y-2.5">
        {/* Centered rule-style header */}
        <div className="flex items-center gap-2.5 py-0.5">
          <div className="h-px flex-1" style={{ background: `rgba(${rgb}, 0.25)` }} />
          <span
            className="text-[10px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded"
            style={{
              color: accent,
              background: `rgba(${rgb}, 0.1)`,
              border: `1px solid rgba(${rgb}, 0.2)`,
            }}
          >
            {lines[0].trim().replace(/:$/, '')}
          </span>
          <div className="h-px flex-1" style={{ background: `rgba(${rgb}, 0.25)` }} />
        </div>
        {rest.length > 0 && renderBlock(rest.join('\n'), `${key}-rest`, config, darkMode)}
      </div>
    );
  }

  // ── Bullet list
  if (lines[0].match(/^[-*]\s/)) {
    return (
      <ul key={key} className="space-y-2">
        {lines.map((l, j) => (
          <li key={j} className="flex gap-3 items-start">
            <span
              className="mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: `rgba(${rgb}, 0.7)` }}
            />
            <span className="leading-relaxed">{renderInline(l.replace(/^[-*]\s+/, ''), config)}</span>
          </li>
        ))}
      </ul>
    );
  }

  // ── Numbered list
  if (lines[0].match(/^\d+\.\s/)) {
    return (
      <ol key={key} className="space-y-2.5">
        {lines.map((l, j) => {
          const m = l.match(/^(\d+)\.\s+(.*)/);
          return (
            <li key={j} className="flex gap-3 items-start">
              <span
                className="font-bold text-sm min-w-[1.5rem] flex-shrink-0 text-right leading-relaxed mt-px"
                style={{ color: accent }}
              >
                {m ? m[1] : j + 1}.
              </span>
              <span className="leading-relaxed">{renderInline(m ? m[2] : l.replace(/^\d+\.\s+/, ''), config)}</span>
            </li>
          );
        })}
      </ol>
    );
  }

  // ── Regular paragraph — handle any embedded --- lines as dividers
  const hasDividerLine = lines.some((l) => /^[-—*\s]{3,}$/.test(l.trim()) && /[-—*]{3}/.test(l));
  if (hasDividerLine) {
    return (
      <div key={key} className="space-y-3">
        {lines.map((line, j) => {
          if (/^[-—*\s]{3,}$/.test(line.trim()) && /[-—*]{3}/.test(line)) {
            return (
              <div key={j} className="py-1">
                <div style={{ height: '1px', background: `linear-gradient(to right, rgba(${rgb}, 0.45), rgba(${rgb}, 0.15), transparent)` }} />
              </div>
            );
          }
          return <p key={j} className="leading-relaxed">{renderInline(line, config)}</p>;
        })}
      </div>
    );
  }

  // ── Action-line block: at least one line starts with an action verb
  const hasActionLines = lines.some((l) => ACTION_VERB_RE.test(l.trim()) && l.trim().length < 140);
  if (hasActionLines) {
    return (
      <div key={key} className="space-y-1.5">
        {lines.map((line, j) => {
          const isAction = ACTION_VERB_RE.test(line.trim()) && line.trim().length < 140;
          return isAction ? (
            <div
              key={j}
              className="leading-relaxed py-1 pl-3"
              style={{
                borderLeft: `2px solid rgba(${rgb}, 0.6)`,
                background: `rgba(${rgb}, 0.04)`,
                borderRadius: '0 4px 4px 0',
              }}
            >
              {renderInline(line, config)}
            </div>
          ) : (
            <p key={j} className="leading-relaxed">{renderInline(line, config)}</p>
          );
        })}
      </div>
    );
  }

  return (
    <p key={key} className="leading-relaxed">
      {lines.map((line, j) => (
        <span key={j}>{j > 0 && <br />}{renderInline(line, config)}</span>
      ))}
    </p>
  );
}

// ── Helper detectors ─────────────────────────────────────────────────────────

function isSurgicalQuestion(text) {
  const clean = text.trim();
  const words = clean.split(/\s+/).length;
  return clean.endsWith('?') && !clean.includes('\n\n') && words <= 25;
}

function isPlanContent(text) {
  const numberedSteps = (text.match(/^\d+\.\s/gm) || []).length;
  const hasPremierPas = /premier pas/i.test(text);
  // 3+ numbered steps always = plan; 2 steps + "premier pas" = plan
  return numberedSteps >= 3 || (numberedSteps >= 2 && hasPremierPas);
}

// ── Step 7 — Surgical question card ──────────────────────────────────────────

function SurgicalQuestion({ text, config, darkMode }) {
  return (
    <div style={{ padding: '8px 0', textAlign: 'center' }}>
      <p
        className={`italic ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}
        style={{ fontSize: '16px', maxWidth: '70%', margin: '0 auto', lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(text.trim(), config?.glowRgb || '148,163,184') }}
      />
    </div>
  );
}

// ── Step 6 — Plan card ────────────────────────────────────────────────────────

function PlanCard({ text, config, darkMode, lang = 'fr' }) {
  const [showMore, setShowMore] = useState(false);
  const lines = text.split('\n');
  const steps = [];
  let title = '';
  let premierPas = '';

  // Two-pass: find index of the last plan-related line (step or premier pas)
  let cutoffLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\d+\.\s/.test(lines[i]) || /^premier pas\s*:/i.test(lines[i])) {
      cutoffLineIdx = i;
    }
  }

  // First pass: extract title, steps, premierPas
  for (const line of lines) {
    const ppMatch   = line.match(/^premier pas\s*:\s*(.*)/i);
    const stepMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (ppMatch) {
      premierPas = ppMatch[1].trim();
    } else if (stepMatch) {
      const content = stepMatch[2].trim();
      // Allow "action · detail" or "action — detail" separators
      const parts = content.split(/\s[·—]\s/);
      steps.push({ num: stepMatch[1], action: parts[0] || content, detail: parts[1] || '' });
    } else if (!title && line.trim() && !line.match(/^[-*]/)) {
      title = line.trim(); // keep markdown — renderInline handles it
    }
  }

  // Capture commentary: non-empty lines that appear AFTER the last step / premier pas
  const commentaryLines = [];
  if (cutoffLineIdx >= 0) {
    for (let i = cutoffLineIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l && !/^\d+\.\s/.test(l) && !/^premier pas\s*:/i.test(l)) {
        commentaryLines.push(lines[i]);
      }
    }
  }
  const commentary = commentaryLines.join('\n').trim();
  const commentaryWords = commentary.split(/\s+/).filter(Boolean).length;
  const hasToggle = commentaryWords > 50;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}
    >
      {title && (
        <div className="px-4 pt-4 pb-2">
          <p className="font-bold text-sm" style={{ color: 'rgb(99,102,241)' }}>{renderInline(title, config)}</p>
        </div>
      )}
      {/* Steps — ALWAYS visible, never collapsed */}
      <div className={`px-4 py-3 space-y-3 ${!title ? 'pt-4' : ''}`}>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span
              className="flex-shrink-0 tabular-nums"
              style={{ fontSize: '28px', fontWeight: 100, color: 'rgba(99,102,241,0.35)', lineHeight: 1.1 }}
            >
              {step.num}
            </span>
            <div className="flex-1 min-w-0 pt-1">
              <p className={`text-sm font-semibold leading-snug ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                {renderInline(step.action, config)}
              </p>
              {step.detail && (
                <p className={`text-xs mt-0.5 leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {renderInline(step.detail, config)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {premierPas && (
        <div
          className={`px-4 py-2.5 border-t ${darkMode ? 'border-indigo-900/40' : 'border-indigo-100'}`}
          style={{ background: 'rgba(99,102,241,0.04)' }}
        >
          <p className="text-xs" style={{ color: 'rgb(99,102,241)' }}>
            <span className="font-bold">{t('bubble.premierPas', lang)} </span>
            {renderInline(premierPas, config)}
          </p>
        </div>
      )}
      {/* Post-plan commentary — short: always visible; long (>50 words): toggle */}
      {commentary && !hasToggle && (
        <div className={`px-4 py-3 border-t ${darkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
          <FormattedText content={commentary} config={config} darkMode={darkMode} />
        </div>
      )}
      {hasToggle && (
        <div className={`border-t ${darkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="w-full flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-left transition-opacity hover:opacity-100 opacity-60"
            style={{ color: 'rgb(99,102,241)' }}
          >
            {showMore ? `↑ ${t('bubble.showLess', lang)}` : `↓ ${t('bubble.showMore', lang)}`}
          </button>
          {showMore && (
            <div className="px-4 pb-3">
              <FormattedText content={commentary} config={config} darkMode={darkMode} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 8 — Verdict card (Synthesizer) ───────────────────────────────────────

function VerdictContent({ text, config, darkMode, lang = 'fr' }) {
  const rgb = config.glowRgb;
  const accent = `rgb(${rgb})`;
  // Strip any leading prefix label
  const clean = text.replace(/^(the verdict|verdict|synthèse|synthese|conclusion)\s*[:\-]\s*/i, '').trim();
  const paras = clean.split('\n').filter(Boolean);
  const main   = paras[0] || clean;
  const footer = paras.slice(1).join(' ');

  return (
    <div className="py-2 text-center">
      <p
        className="text-[10px] font-black uppercase tracking-[0.2em] mb-3"
        style={{ color: accent, opacity: 0.65 }}
      >
        {t('bubble.verdict', lang)}
      </p>
      <p
        className={`font-semibold leading-snug ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
        style={{ fontSize: '18px', maxWidth: '85%', margin: '0 auto' }}
      >
        {renderInline(main, config)}
      </p>
      {footer && (
        <p className={`text-xs mt-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{renderInline(footer, config)}</p>
      )}
    </div>
  );
}

// ── Step 9 — Progressive reveal ────────────────────────────────────────────────

function ProgressiveReveal({ text, config, darkMode, lang = 'fr' }) {
  const [expanded, setExpanded] = useState(false);
  const rgb    = config.glowRgb;
  const accent = `rgb(${rgb})`;

  const PREVIEW_WORDS = 65;
  const blocks = text.split(/\n{2,}/);

  // Find first paragraph boundary after ~65 words
  let wordCount = 0;
  let splitIdx  = blocks.length;
  for (let i = 0; i < blocks.length; i++) {
    wordCount += blocks[i].split(/\s+/).length;
    if (wordCount >= PREVIEW_WORDS) { splitIdx = i + 1; break; }
  }

  const preview   = blocks.slice(0, splitIdx).join('\n\n');
  const remainder = blocks.slice(splitIdx).join('\n\n');

  return (
    <div>
      {/* When collapsed: show preview only.
          When expanded: show full text starting immediately after preview —
          render the FULL text as one unit to avoid any sentence repetition. */}
      {expanded
        ? <FormattedText content={text} config={config} darkMode={darkMode} />
        : <FormattedText content={preview} config={config} darkMode={darkMode} />
      }
      {remainder && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs font-semibold transition-opacity hover:opacity-100 opacity-60"
          style={{ color: accent }}
        >
          {expanded ? `↑ ${t('bubble.showLess', lang)}` : `↓ ${t('bubble.showMore', lang)}`}
        </button>
      )}
    </div>
  );
}

// ── SmartContent router ────────────────────────────────────────────────────────

function SmartContent({ text, config, darkMode, lang = 'fr' }) {
  if (isSurgicalQuestion(text)) {
    return <SurgicalQuestion text={text} config={config} darkMode={darkMode} />;
  }
  if (isPlanContent(text)) {
    return <PlanCard text={text} config={config} darkMode={darkMode} lang={lang} />;
  }
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 80) {
    return <ProgressiveReveal text={text} config={config} darkMode={darkMode} lang={lang} />;
  }
  return <FormattedText content={text} config={config} darkMode={darkMode} />;
}

function FormattedText({ content, config, darkMode }) {
  const rgb = config.glowRgb;
  const blocks = content.split(/\n{2,}/);

  // Trailing question: last block is a standalone short question (≤30 words, no sub-paragraphs)
  const lastBlock = blocks[blocks.length - 1]?.trim() || '';
  const isTrailingQ =
    blocks.length > 1 &&
    lastBlock.endsWith('?') &&
    !lastBlock.includes('\n') &&
    lastBlock.split(/\s+/).length <= 30;

  const mainBlocks  = isTrailingQ ? blocks.slice(0, -1) : blocks;

  return (
    <div className="space-y-3.5">
      {mainBlocks.map((block, i) => renderBlock(block, i, config, darkMode))}
      {isTrailingQ && (
        <div className={`pt-3 mt-0.5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <p className={`text-sm italic ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {renderInline(lastBlock, config)}
          </p>
        </div>
      )}
    </div>
  );
}

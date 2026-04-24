import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Linkedin, PenLine, MessageSquareText, ChevronDown, ImagePlus, Mic, MicOff, Loader2 } from 'lucide-react';
import { parseUploadedFile } from '../utils/parseFile.js';
import { AGENT_CONFIG } from '../prompts.js';
import { createAudioRecorder, isMicSupported } from '../utils/voice.js';

const MENTION_AGENTS = Object.entries(AGENT_CONFIG).filter(
  ([key]) => key !== 'SYNTHESIZER' && key !== 'COORDINATOR'
);

const QUICK_ACTIONS = [
  {
    icon: <Linkedin size={12} />,
    label: 'LinkedIn',
    template: 'Analyze this LinkedIn profile and give me the exact approach strategy — what to say, what angle to use, and how to open:\n\n[PASTE PROFILE TEXT OR URL HERE]',
  },
  {
    icon: <PenLine size={12} />,
    label: 'Rewrite',
    template: 'Rewrite the following to maximize impact for sales and conversion. Gary Vee handles the content angle, The Black Swan handles the persuasion:\n\n[PASTE YOUR TEXT HERE]',
  },
  {
    icon: <MessageSquareText size={12} />,
    label: 'Analyze Convo',
    template: 'Analyze this conversation and tell me exactly what went wrong and what to say next:\n\n[PASTE CONVERSATION HERE]',
  },
];

export default function ChatInput({ onSend, isLoading, disabled, darkMode, onInputChange, quoteContext, onClearQuote, lang = 'fr' }) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachLoading, setAttachLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [forcedAgent, setForcedAgent] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // ── Voice (STT via Whisper) ──────────────────────────────────────────
  const micSupported = isMicSupported();
  const [micState, setMicState] = useState('idle'); // 'idle' | 'recording' | 'transcribing'
  const recRef = useRef(null);
  const preRecordingTextRef = useRef('');

  function toggleRecording() {
    if (!micSupported || isLoading || disabled) return;
    if (micState === 'recording') { recRef.current?.stop(); return; }
    if (micState === 'transcribing') return; // wait — Whisper is processing
    preRecordingTextRef.current = text;
    const rec = createAudioRecorder({
      lang: lang === 'fr' ? 'fr-CA' : 'en-US',
      onStart: () => setMicState('recording'),
      onStop: () => { /* state handed off to transcribing below */ },
      onTranscribing: () => setMicState('transcribing'),
      onFinal: (transcript) => {
        const base = preRecordingTextRef.current;
        const joined = base ? `${base} ${transcript}`.trim() : transcript;
        setText(joined);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
          setTimeout(() => textareaRef.current?.focus(), 50);
        }
        setMicState('idle');
      },
      onError: (err) => {
        console.warn('[Voice] Whisper error:', err);
        setMicState('idle');
      },
    });
    if (!rec) return;
    recRef.current = rec;
    rec.start();
  }

  // Cancel recording if component disables mid-session
  useEffect(() => {
    if ((isLoading || disabled) && micState !== 'idle') recRef.current?.cancel();
  }, [isLoading, disabled, micState]);

  // Pre-fill from Focus Timer debrief
  useEffect(() => {
    const pending = localStorage.getItem('hq_debrief_pending');
    if (pending) {
      setText(pending);
      localStorage.removeItem('hq_debrief_pending');
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        }
      }, 80);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && textareaRef.current) textareaRef.current.focus();
  }, [isLoading]);

  // Auto-focus textarea when a quote context is set
  useEffect(() => {
    if (quoteContext) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [quoteContext]);

  function handleSubmit(e) {
    e.preventDefault();
    if ((!text.trim() && !attachment) || isLoading || disabled) return;
    // Strip @mention prefix if agent was forced via popup
    let finalText = forcedAgent ? text.trim().replace(/^@\w+\s*/, '') : text.trim();
    // Prepend quote context if set
    if (quoteContext?.text) {
      const quotePrefix = `User is responding specifically to: "${quoteContext.text}"\nAddress this specific point directly.\n\n`;
      finalText = quotePrefix + (finalText || '(Voir la citation ci-dessus)');
    }
    onSend(finalText || text.trim(), attachment || null, forcedAgent || null);
    setText('');
    setAttachment(null);
    setForcedAgent(null);
    setShowActions(false);
    setShowMention(false);
    onClearQuote?.();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e) {
    if (showMention) {
      const filtered = MENTION_AGENTS.filter(([key]) =>
        !mentionFilter || key.toLowerCase().startsWith(mentionFilter)
      );
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered[mentionIndex]) {
        e.preventDefault();
        selectMention(filtered[mentionIndex][0]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMention(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleInput(e) {
    const val = e.target.value;
    setText(val);
    onInputChange?.(val); // Step 7: notify parent for typing-based Mem0 pre-fetch
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
    // @ mention detection — look for @word at cursor position
    const cursor = e.target.selectionStart ?? val.length;
    const atMatch = val.slice(0, cursor).match(/@(\w*)$/);
    if (atMatch) {
      const f = atMatch[1].toLowerCase();
      if (f !== mentionFilter) setMentionIndex(0);
      setMentionFilter(f);
      setShowMention(true);
    } else {
      if (showMention) setShowMention(false);
    }
  }

  function selectMention(agentKey) {
    const newText = text.replace(/@\w*$/, '') + `@${agentKey} `;
    setText(newText);
    setForcedAgent(agentKey);
    setShowMention(false);
    setMentionFilter('');
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newText.length, newText.length);
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
      }
    }, 0);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachLoading(true);
    try {
      const parsed = await parseUploadedFile(file);
      if (parsed) setAttachment(parsed);
    } catch (err) {
      console.error('[ChatInput] file parse error:', err);
    } finally {
      setAttachLoading(false);
      e.target.value = '';
    }
  }

  function applyQuickAction(template) {
    setText(template);
    setShowActions(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      const len = template.length;
      textareaRef.current?.setSelectionRange(len, len);
      // Auto-resize
      const el = textareaRef.current;
      if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
    }, 0);
  }

  const canSend = (text.trim() || attachment) && !isLoading && !disabled;

  return (
    <div className={`border-t ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-[#F5F4F0] border-[#E8E6E0]'}`}>

      {/* Quick actions bar */}
      {showActions && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => applyQuickAction(action.template)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                darkMode
                  ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Attachment badge */}
      {attachment && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
          {attachment.type === 'image' ? (
            <div className="flex items-center gap-2">
              <img src={attachment.preview} alt={attachment.name} className="w-10 h-10 rounded-lg object-cover border border-gray-600/30" />
              <span className={`text-xs font-medium max-w-[160px] truncate ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {attachment.name}
              </span>
            </div>
          ) : (
            <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${
              attachment.type === 'pdf'
                ? darkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'
                : darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
            }`}>
              <Paperclip size={11} />
              {attachment.name}
            </span>
          )}
          <button
            onClick={() => setAttachment(null)}
            className={`p-0.5 rounded-full transition-colors ${darkMode ? 'text-gray-600 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Quote block — shown when user clicked "Citer" */}
      {quoteContext?.text && (
        <div
          className="mx-4 mt-2 flex items-start gap-2"
          style={{
            background: 'rgba(99,102,241,0.08)',
            borderLeft: '2px solid rgb(99,102,241)',
            borderRadius: '0 6px 6px 0',
            padding: '6px 10px',
            marginBottom: '8px',
          }}
        >
          <p
            className="flex-1 line-clamp-3 italic"
            style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}
          >
            {quoteContext.text.slice(0, 200)}{quoteContext.text.length > 200 ? '…' : ''}
          </p>
          <button
            type="button"
            onClick={onClearQuote}
            className="flex-shrink-0 ml-1 opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: darkMode ? '#9ca3af' : '#6b7280' }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* @ Agent mention popup — 260px, animates up from translateY(8px) */}
      {showMention && (() => {
        const filtered = MENTION_AGENTS.filter(([key]) =>
          !mentionFilter || key.toLowerCase().startsWith(mentionFilter)
        );
        if (filtered.length === 0) return null;
        return (
          <div
            className={`mx-4 mb-1 border overflow-hidden shadow-lg ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-[#F5F4F0] border-[#E8E6E0]'}`}
            style={{
              width: '260px',
              borderRadius: '10px',
              padding: '6px',
              animation: 'mentionPopup 0.2s ease forwards',
            }}
          >
            {filtered.map(([key, cfg], idx) => (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectMention(key); }}
                className="w-full flex items-center gap-3 px-3 rounded-lg text-left transition-colors"
                style={{
                  height: '48px',
                  background: idx === mentionIndex ? (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                }}
                onMouseEnter={() => setMentionIndex(idx)}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-full"
                  style={{
                    width: '28px', height: '28px',
                    background: `rgba(${cfg.glowRgb}, 0.15)`,
                    fontSize: '14px',
                  }}
                >
                  {cfg.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: '13px', fontWeight: 500, color: `rgb(${cfg.glowRgb})` }}>{key}</p>
                  <p style={{ fontSize: '11px', color: darkMode ? '#6b7280' : '#9ca3af', marginTop: '1px' }} className="truncate">{cfg.domain}</p>
                </div>
              </button>
            ))}
          </div>
        );
      })()}

      {/* @ chip — shown in input area when agent is forced */}
      {forcedAgent && AGENT_CONFIG[forcedAgent] && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
          <span
            className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 transition-all"
            style={{
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '12px',
              color: 'rgb(99,102,241)',
              fontSize: '12px',
            }}
          >
            <span>{AGENT_CONFIG[forcedAgent].emoji}</span>
            <span>@{forcedAgent}</span>
            <button
              type="button"
              onClick={() => { setForcedAgent(null); setText(text.replace(/^@\w+\s*/, '')); }}
              className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
              style={{ fontSize: '11px', lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Input row */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 py-3">

        {/* Quick actions toggle */}
        <button
          type="button"
          onClick={() => setShowActions((s) => !s)}
          disabled={disabled}
          title="Quick actions"
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 ${
            showActions
              ? darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
              : darkMode ? 'bg-gray-800 text-gray-500 hover:text-gray-300' : 'bg-gray-100 text-gray-400 hover:text-gray-600'
          }`}
        >
          <ChevronDown size={15} className={`transition-transform ${showActions ? 'rotate-180' : ''}`} />
        </button>

        {/* File attach (PDF, CSV, Excel) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachLoading}
          title="Attach PDF, CSV, or Excel"
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 ${
            attachment && attachment.type !== 'image'
              ? darkMode ? 'bg-blue-800 text-blue-200' : 'bg-blue-100 text-blue-700'
              : darkMode ? 'bg-gray-800 text-gray-500 hover:text-gray-300' : 'bg-gray-100 text-gray-400 hover:text-gray-600'
          }`}
        >
          {attachLoading
            ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <Paperclip size={15} />
          }
        </button>

        {/* @ Mention button — opens agent selector popup */}
        <button
          type="button"
          onClick={() => {
            setMentionFilter('');
            setMentionIndex(0);
            setShowMention((s) => !s);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
          disabled={disabled}
          title="Mentionner un agent (@)"
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm transition-all disabled:opacity-30 ${
            showMention || forcedAgent
              ? darkMode ? 'bg-indigo-800 text-indigo-200' : 'bg-indigo-100 text-indigo-700'
              : darkMode ? 'bg-gray-800 text-gray-500 hover:text-gray-300' : 'bg-gray-100 text-gray-400 hover:text-gray-600'
          }`}
        >
          @
        </button>

        {/* Image attach */}
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled || attachLoading}
          title="Attach image (screenshot, chart, profile…)"
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 ${
            attachment?.type === 'image'
              ? darkMode ? 'bg-violet-800 text-violet-200' : 'bg-violet-100 text-violet-700'
              : darkMode ? 'bg-gray-800 text-gray-500 hover:text-gray-300' : 'bg-gray-100 text-gray-400 hover:text-gray-600'
          }`}
        >
          <ImagePlus size={15} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? (lang === 'fr' ? 'Session terminée — démarre une nouvelle session' : 'Session ended — start a new session')
              : isLoading
              ? (lang === 'fr' ? 'En train de réfléchir...' : 'Thinking...')
              : (lang === 'fr' ? 'Pose une question à ton équipe...' : 'Ask your board anything...')
          }
          disabled={isLoading || disabled}
          rows={1}
          className={`flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none transition-all ${
            darkMode
              ? 'bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 focus:border-indigo-500/60'
              : 'bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-200 focus:border-indigo-400/60'
          } disabled:opacity-50`}
          style={{
            minHeight: '48px', maxHeight: '160px', overflowY: 'auto',
            // Focus glow applied via JS to avoid Tailwind CSS specificity issues with box-shadow
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = darkMode
              ? '0 0 0 3px rgba(99,102,241,0.15), 0 0 16px rgba(99,102,241,0.08)'
              : '0 0 0 3px rgba(99,102,241,0.12)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = 'none';
          }}
        />

        <button
          type="button"
          onClick={toggleRecording}
          disabled={!micSupported || isLoading || disabled || micState === 'transcribing'}
          title={!micSupported
            ? (lang === 'fr' ? 'Micro non supporté' : 'Mic not supported')
            : micState === 'recording'
            ? (lang === 'fr' ? 'Arrêter — transcrire' : 'Stop — transcribe')
            : micState === 'transcribing'
            ? (lang === 'fr' ? 'Transcription Whisper…' : 'Whisper transcribing…')
            : (lang === 'fr' ? 'Parler (Whisper)' : 'Speak (Whisper)')}
          aria-label={
            micState === 'recording' ? 'Stop voice recording' :
            micState === 'transcribing' ? 'Transcribing' : 'Start voice recording'
          }
          aria-pressed={micState === 'recording'}
          className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            !micSupported
              ? (darkMode ? 'bg-gray-900 text-gray-700 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed')
              : micState === 'recording'
              ? 'bg-red-500 text-white'
              : micState === 'transcribing'
              ? 'bg-indigo-500 text-white'
              : (darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
          }`}
          style={
            micState === 'recording' ? {
              boxShadow: '0 0 0 4px rgba(239,68,68,0.2), 0 0 16px rgba(239,68,68,0.35)',
              animation: 'pulse 1.4s ease-in-out infinite',
            } : micState === 'transcribing' ? {
              boxShadow: '0 0 0 4px rgba(99,102,241,0.2), 0 0 16px rgba(99,102,241,0.35)',
            } : undefined
          }
        >
          {!micSupported
            ? <MicOff size={16} />
            : micState === 'transcribing'
            ? <Loader2 size={16} className="animate-spin" />
            : <Mic size={16} />}
        </button>

        <button
          type="submit"
          disabled={!canSend}
          className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            !canSend
              ? darkMode ? 'bg-gray-800 text-gray-600' : 'bg-gray-100 text-gray-400'
              : darkMode ? 'bg-white text-gray-900 hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          {isLoading
            ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <Send size={16} />
          }
        </button>
      </form>
    </div>
  );
}

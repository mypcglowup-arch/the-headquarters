import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, CheckSquare, Square, ScrollText, Crosshair, Layers, AlertTriangle, Mail, Send, Edit3, X, CheckCircle, Calendar, ExternalLink, TrendingUp, ArrowRight, DollarSign, Minus, Zap, Brain, Trophy, AlertCircle, ArrowUpRight, UserX, Sunrise, UserCheck, Lock, Users, Loader2, ChevronDown, ChevronUp, Flag, Target } from 'lucide-react';
import MessageBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import { AGENT_CONFIG } from '../prompts.js';
import { t } from '../i18n.js';

export default function ChatScreen({
  messages,
  isLoading,
  sessionEnded,
  sessionSummary,
  consensusLine,
  improvementJournal,
  agentNames,
  agentPhotos,
  darkMode,
  error,
  onSendMessage,
  onUpdateImprovementStatus,
  sessionMode,
  feedbacks,
  onFeedback,
  thinkingAgent,
  isSearching,
  isReadingImage,
  isThinkingDeep,
  sessionCount,
  soundEnabled,
  onToggleSound,
  onEndSession,
  onGoHome,
  onReplay,
  onGetVerdict,
  onLogWin,
  onShowContentGen,
  onShowProspectAnalyzer,
  lang = 'fr',
  activeAgent = null,
  onInputChange,
  onReaction,
  onSecondOpinion,
  onSendEmailReply,
  onCreateCalendarEvent,
  onApplyPipelineUpdate,
  onApplyDashboardUpdate,
  onBatchFollowupSend,
  onRecordDecisionOutcome,
  onToast,
}) {
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // ── Session start time — for "started X min ago" display ──
  const sessionStartRef = useRef(Date.now());
  const [, forceElapsedTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceElapsedTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Pinned messages (sessionStorage-backed, max 3) ──
  const [pinnedMessages, setPinnedMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('hq_pinned') || '[]'); } catch { return []; }
  });
  const [replacingPinFor, setReplacingPinFor] = useState(null); // message waiting for a slot

  function savePinned(next) {
    setPinnedMessages(next);
    try { sessionStorage.setItem('hq_pinned', JSON.stringify(next)); } catch {}
  }

  function handlePin(message) {
    const alreadyIdx = pinnedMessages.findIndex((p) => p.id === message.id);
    if (alreadyIdx >= 0) {
      savePinned(pinnedMessages.filter((p) => p.id !== message.id));
      onToast?.(lang === 'fr' ? 'Message désépinglé' : 'Message unpinned', { type: 'info', duration: 2000 });
      return;
    }
    if (pinnedMessages.length < 3) {
      savePinned([...pinnedMessages, { id: message.id, content: message.content, agent: message.agent }]);
      onToast?.(lang === 'fr' ? 'Message épinglé 📌' : 'Message pinned 📌', { type: 'success', duration: 2200 });
    } else {
      setReplacingPinFor(message);
    }
  }

  function handleReplace(idx) {
    if (!replacingPinFor) return;
    const next = [...pinnedMessages];
    next[idx] = { id: replacingPinFor.id, content: replacingPinFor.content, agent: replacingPinFor.agent };
    savePinned(next);
    setReplacingPinFor(null);
  }

  function scrollToMessage(id) {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector(`[data-message-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Quote context ──
  const [quoteContext, setQuoteContext] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const lastAgentMsgId = [...messages].reverse().find((m) => m.type === 'agent' && !m.streaming)?.id;

  return (
    <div className="flex-1 flex min-h-0 h-full" style={{ height: 'calc(100dvh - 57px)' }}>

      {/* ── History panel (left) ── */}
      <HistoryPanel
        messages={messages}
        darkMode={darkMode}
        onScrollTo={scrollToMessage}
        currentMsgId={lastAgentMsgId}
      />

      {/* ── Main chat column ── */}
      <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">

      {/* ── Session info bar ── */}
      <div className={`flex items-center justify-between px-4 pt-2 pb-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
        {/* Left: live dot + session info */}
        {(() => {
          const elapsedMins  = Math.floor((Date.now() - sessionStartRef.current) / 60_000);
          const elapsedLabel = elapsedMins === 0
            ? (lang === 'fr' ? "à l'instant" : 'just now')
            : lang === 'fr'
            ? `il y a ${elapsedMins} min`
            : `${elapsedMins} min ago`;
          const modeShort = t(`modeLabel.${sessionMode}`, lang);
          return (
            <div className="flex items-center gap-1.5">
              {/* Animated green live dot */}
              <span className="relative flex" style={{ width: 5, height: 5 }}>
                <span
                  className="animate-ping absolute inline-flex rounded-full"
                  style={{ width: '100%', height: '100%', background: 'rgb(34,197,94)', opacity: 0.5 }}
                />
                <span
                  className="relative inline-flex rounded-full"
                  style={{ width: 5, height: 5, background: 'rgb(34,197,94)' }}
                />
              </span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(148,163,184,0.32)', letterSpacing: '0.02em' }}>
                {t('chat.session', lang)}{sessionCount}
                {' · '}{modeShort}
                {' · '}{elapsedLabel}
              </span>
            </div>
          );
        })()}

        {/* Step 6: Active lead agent indicator */}
        {activeAgent && activeAgent !== 'COORDINATOR' && AGENT_CONFIG[activeAgent] && (
          <span
            className="flex items-center gap-1.5 text-xs transition-all duration-300"
            style={{ color: `rgba(${AGENT_CONFIG[activeAgent].glowRgb}, 0.85)` }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ backgroundColor: `rgba(${AGENT_CONFIG[activeAgent].glowRgb}, 1)` }}
              />
              <span
                className="relative inline-flex rounded-full h-1.5 w-1.5"
                style={{ backgroundColor: `rgba(${AGENT_CONFIG[activeAgent].glowRgb}, 1)` }}
              />
            </span>
            <span className="font-mono uppercase tracking-widest opacity-80">{activeAgent}</span>
          </span>
        )}

        <button
          onClick={onToggleSound}
          title={t(soundEnabled ? 'chat.muteSound' : 'chat.enableSound', lang)}
          aria-label={t(soundEnabled ? 'chat.muteSound' : 'chat.enableSound', lang)}
          aria-pressed={soundEnabled}
          className={`p-1 rounded transition-opacity ${soundEnabled ? 'opacity-60 hover:opacity-100' : 'opacity-30 hover:opacity-60'}`}
        >
          {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </button>
      </div>

      {/* ── CONSENSUS BANNER ── */}
      {sessionEnded && consensusLine && (
        <div className="mx-4 mt-2 space-y-3">
          <div
            className={`rounded-2xl border-2 p-6 text-center ${
              darkMode
                ? 'bg-emerald-950/70 border-emerald-600'
                : 'bg-emerald-50 border-emerald-400'
            }`}
          >
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${darkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>
              {t('chat.consensus', lang)}
            </p>
            <p className={`text-xl font-bold leading-snug ${darkMode ? 'text-emerald-100' : 'text-emerald-900'}`}>
              {consensusLine}
            </p>
          </div>
          {onGoHome && (
            <button
              onClick={onGoHome}
              className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all ${
                darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('chat.returnHome', lang)}
            </button>
          )}
          {onReplay && (
            <button
              onClick={onReplay}
              className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                darkMode
                  ? 'border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                  : 'border border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'
              }`}
            >
              <ScrollText size={14} />
              {t('chat.replay', lang)}
            </button>
          )}
        </div>
      )}

      {/* ── Session summary ── */}
      {sessionEnded && sessionSummary && (
        <div className={`mx-4 mt-3 rounded-xl border p-4 text-sm ${darkMode ? 'bg-gray-900 border-gray-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
          <span className={`text-xs font-bold uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {t('chat.summary', lang)}
          </span>

          {sessionSummary.keyDecisions?.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('chat.keyDecisions', lang)}</p>
              <ul className="space-y-1">
                {sessionSummary.keyDecisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={darkMode ? 'text-gray-600' : 'text-gray-400'}>·</span>
                    <span>{typeof d === 'string' ? d : d.decision}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {improvementJournal.length > 0 && (
            <div className="mt-4">
              <p className={`text-xs font-bold uppercase mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('chat.improvements', lang, { count: improvementJournal.length })}
              </p>
              <div className="space-y-1.5">
                {improvementJournal.slice(-5).map((item) => (
                  <div key={item.id} className={`flex items-start gap-2 text-sm ${item.status === 'done' ? 'opacity-40' : ''}`}>
                    <button
                      onClick={() => onUpdateImprovementStatus(item.id, item.status === 'done' ? 'todo' : 'done')}
                      className={`mt-0.5 ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {item.status === 'done' ? <CheckSquare size={14} className="text-emerald-500" /> : <Square size={14} />}
                    </button>
                    <div>
                      <span className={`text-xs font-medium mr-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>[{item.agent}]</span>
                      <span className={`${item.status === 'done' ? 'line-through' : ''} ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {item.improvement}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pinned messages panel — sticky below header ── */}
      {(pinnedMessages.length > 0 || replacingPinFor) && (
        <div
          className="flex-shrink-0 px-4 py-2.5"
          style={{
            background: 'rgba(99,102,241,0.06)',
            borderBottom: '1px solid rgba(99,102,241,0.15)',
          }}
        >
          {/* Normal state: label + pills */}
          {!replacingPinFor && (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-black uppercase tracking-widest flex-shrink-0"
                style={{ fontSize: '9px', color: 'rgb(99,102,241)' }}
              >
                ÉPINGLÉS
              </span>
              {pinnedMessages.map((p, idx) => {
                const cfg = AGENT_CONFIG[p.agent];
                const preview = p.content.replace(/\n/g, ' ').slice(0, 50);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-1.5 max-w-[220px]"
                    style={{
                      background: `rgba(${cfg?.glowRgb || '99,102,241'}, 0.1)`,
                      border: `1px solid rgba(${cfg?.glowRgb || '99,102,241'}, 0.2)`,
                      borderRadius: '20px',
                      padding: '3px 8px 3px 6px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => scrollToMessage(p.id)}
                      className="flex items-center gap-1.5 min-w-0 flex-1"
                      title="Aller au message"
                    >
                      <span style={{ fontSize: '11px', lineHeight: 1, flexShrink: 0 }}>{cfg?.emoji || '?'}</span>
                      <span
                        className="truncate"
                        style={{ fontSize: '11px', color: darkMode ? '#d1d5db' : '#374151' }}
                      >
                        {preview}{p.content.length > 50 ? '…' : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => savePinned(pinnedMessages.filter((_, i) => i !== idx))}
                      className="flex-shrink-0 transition-opacity opacity-40 hover:opacity-100"
                      style={{ fontSize: '11px', color: `rgb(${cfg?.glowRgb || '99,102,241'})`, marginLeft: '2px' }}
                      title="Désépingler"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Max-3 state: prompt to remove one */}
          {replacingPinFor && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'rgb(99,102,241)' }}>
                Maximum 3 épinglés. Lequel tu veux retirer ?
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {pinnedMessages.map((p, idx) => {
                  const cfg = AGENT_CONFIG[p.agent];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleReplace(idx)}
                      className="flex items-center gap-1.5 max-w-[200px] transition-opacity hover:opacity-70"
                      style={{
                        background: `rgba(${cfg?.glowRgb || '99,102,241'}, 0.1)`,
                        border: `1px solid rgba(${cfg?.glowRgb || '99,102,241'}, 0.3)`,
                        borderRadius: '20px',
                        padding: '3px 10px 3px 6px',
                        fontSize: '11px',
                        color: 'rgb(99,102,241)',
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>{cfg?.emoji || '?'}</span>
                      <span className="truncate">{p.content.replace(/\n/g, ' ').slice(0, 30)}…</span>
                      <span style={{ marginLeft: '4px', opacity: 0.6, flexShrink: 0 }}>✕</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setReplacingPinFor(null)}
                  className="text-[11px] transition-opacity opacity-40 hover:opacity-80 px-2"
                  style={{ color: darkMode ? '#9ca3af' : '#6b7280' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Messages ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 min-h-0 scroll-fade" role="log" aria-live="polite" aria-label={lang === 'fr' ? 'Conversation' : 'Conversation'}>

        {/* Premium empty state — visible until first user or agent message */}
        {!messages.some((m) => m.type === 'user' || m.type === 'agent') && !isLoading && (
          <div style={{ minHeight: '55vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChatEmptyState
              agentNames={agentNames}
              agentPhotos={agentPhotos}
              sessionCount={sessionCount}
              sessionMode={sessionMode}
              lang={lang}
              darkMode={darkMode}
            />
          </div>
        )}

        {messages.map((msg, idx) => {
          // ── Memory recap card (legacy — kept for backward compat) ──────────
          if (msg.type === 'memory-recap-loading' || msg.type === 'memory-recap') {
            return (
              <MemoryRecapCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
              />
            );
          }

          // ── Morning briefing card (new — replaces memory-recap at session 7+) ──
          if (msg.type === 'briefing-locked' || msg.type === 'briefing-loading' || msg.type === 'briefing-ready') {
            return (
              <MorningBriefingCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
              />
            );
          }

          // ── Churn risk alert card ──────────────────────────────────────────
          if (msg.type === 'churn-risk-alert') {
            return (
              <ChurnRiskAlertCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
              />
            );
          }

          // ── Batch follow-up cards (loading / preview / applied) ────────────
          if (msg.type === 'batch-followup-loading'
           || msg.type === 'batch-followup-preview'
           || msg.type === 'batch-followup-applied') {
            return (
              <BatchFollowupCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
                onSend={onBatchFollowupSend}
              />
            );
          }

          // ── Decision cards (logged / reminder / outcome-recorded) ──────────
          if (msg.type === 'decision-logged') {
            return (
              <DecisionLoggedCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
              />
            );
          }
          if (msg.type === 'decision-reminder') {
            return (
              <DecisionReminderCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
                onRecord={onRecordDecisionOutcome}
              />
            );
          }
          if (msg.type === 'decision-outcome-recorded') {
            return (
              <DecisionOutcomeRecordedCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
              />
            );
          }

          // ── Email reply draft / sent card ──────────────────────────────────
          if (msg.type === 'email-reply-draft' || msg.type === 'email-reply-sent') {
            return (
              <EmailReplyCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
                onSend={onSendEmailReply}
              />
            );
          }

          // ── Calendar event preview / created card ──────────────────────────
          if (msg.type === 'calendar-event-preview' || msg.type === 'calendar-event-created') {
            return (
              <CalendarEventCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
                onCreate={onCreateCalendarEvent}
              />
            );
          }

          // ── Pipeline update preview / applied card ─────────────────────────
          if (msg.type === 'pipeline-update-preview' || msg.type === 'pipeline-update-applied') {
            return (
              <PipelineUpdateCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
                onApply={onApplyPipelineUpdate}
              />
            );
          }

          // ── Dashboard update preview / applied card ────────────────────────
          if (msg.type === 'dashboard-update-preview' || msg.type === 'dashboard-update-applied') {
            return (
              <DashboardUpdateCard
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                lang={lang}
                onApply={onApplyDashboardUpdate}
              />
            );
          }

          const isLastAgent = msg.type === 'agent' && !msg.streaming &&
            messages.slice(idx + 1).every((m) => m.type !== 'agent' || m.streaming);
          return (
          <MessageBubble
            key={msg.id}
            message={msg}
            agentNames={agentNames}
            agentPhotos={agentPhotos}
            darkMode={darkMode}
            feedback={feedbacks?.[msg.id]}
            onFeedback={msg.type === 'agent' ? onFeedback : undefined}
            onLogWin={msg.type === 'agent' && onLogWin ? onLogWin : undefined}
            onReaction={msg.type === 'agent' && onReaction ? onReaction : undefined}
            onPin={msg.type === 'agent' ? handlePin : undefined}
            isPinned={msg.type === 'agent' && pinnedMessages.some((p) => p.id === msg.id)}
            onQuote={msg.type === 'agent' ? (text, agent) => setQuoteContext({ text, agent }) : undefined}
            isLast={isLastAgent}
            onSecondOpinion={msg.type === 'agent' && onSecondOpinion ? onSecondOpinion : undefined}
            lang={lang}
          />
          );
        })}

        {/* Colored thinking indicator */}
        {isLoading && <ThinkingDots agent={thinkingAgent} agentNames={agentNames} darkMode={darkMode} isSearching={isSearching} isReadingImage={isReadingImage} isThinkingDeep={isThinkingDeep} lang={lang} />}

        {error && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm border flex items-center gap-2 ${darkMode ? 'bg-red-900/30 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertTriangle size={14} className="flex-shrink-0" />{error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Bottom action bar — compact pill row ── */}
      {!sessionEnded && (
        <div
          className="flex-shrink-0"
          style={{
            borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'}`,
            padding: '7px 16px 5px',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          {/* Prospect pill */}
          {onShowProspectAnalyzer && (
            <button
              onClick={onShowProspectAnalyzer}
              disabled={isLoading}
              aria-label={lang === 'fr' ? 'Analyser un prospect' : 'Analyze a prospect'}
              className="tap-target"
              style={{
                height: 28, fontSize: 11, fontFamily: 'inherit',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20,
                color: 'rgba(20,184,166,0.75)',
                padding: '0 11px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                opacity: isLoading ? 0.4 : 1, transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(20,184,166,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            >
              <Crosshair size={10} />
              {lang === 'fr' ? 'Prospect' : 'Prospect'}
            </button>
          )}

          {/* Contenu pill */}
          {onShowContentGen && (
            <button
              onClick={onShowContentGen}
              disabled={isLoading}
              aria-label={lang === 'fr' ? 'Générer du contenu' : 'Generate content'}
              className="tap-target"
              style={{
                height: 28, fontSize: 11, fontFamily: 'inherit',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20,
                color: 'rgba(249,115,22,0.75)',
                padding: '0 11px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                opacity: isLoading ? 0.4 : 1, transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(249,115,22,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            >
              <Layers size={10} />
              {lang === 'fr' ? 'Contenu' : 'Content'}
            </button>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* ⚡ Verdict — subtle accent text link */}
          {onGetVerdict && (
            <button
              onClick={onGetVerdict}
              disabled={isLoading}
              aria-label={lang === 'fr' ? 'Obtenir le verdict' : 'Get the verdict'}
              className="tap-target"
              style={{
                background: 'none', border: 'none',
                color: 'rgba(245,158,11,0.78)',
                fontSize: 12, fontFamily: 'inherit',
                cursor: isLoading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 6px',
                opacity: isLoading ? 0.3 : 1,
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.color = 'rgba(245,158,11,0.95)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(245,158,11,0.78)'; }}
            >
              ⚡ {lang === 'fr' ? 'Verdict' : 'Verdict'}
            </button>
          )}

          {/* End Session pill */}
          {onEndSession && (
            <button
              onClick={onEndSession}
              disabled={isLoading}
              aria-label={lang === 'fr' ? 'Terminer la session' : 'End session'}
              className="tap-target"
              style={{
                height: 28, fontSize: 11, fontFamily: 'inherit',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 20,
                color: 'rgba(148,163,184,0.45)',
                padding: '0 11px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                opacity: isLoading ? 0.4 : 1, transition: 'all 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background    = 'rgba(239,68,68,0.08)';
                e.currentTarget.style.borderColor   = 'rgba(239,68,68,0.2)';
                e.currentTarget.style.color         = 'rgba(239,68,68,0.7)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background    = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor   = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color         = 'rgba(148,163,184,0.45)';
              }}
            >
              {t('chat.endSession', lang)}
            </button>
          )}
        </div>
      )}

      <ChatInput
        onSend={onSendMessage}
        isLoading={isLoading}
        disabled={sessionEnded}
        darkMode={darkMode}
        lang={lang}
        onInputChange={onInputChange}
        quoteContext={quoteContext}
        onClearQuote={() => setQuoteContext(null)}
      />
      </div>  {/* end main chat column */}
    </div>
  );
}

function ThinkingDots({ agent, agentNames, darkMode, isSearching, isReadingImage, isThinkingDeep, lang = 'fr' }) {
  const config = agent && agent !== 'COORDINATOR' ? AGENT_CONFIG[agent] : null;
  const name = config ? (agentNames?.[agent] || agent) : null;
  const dotColor = config ? `rgba(${config.glowRgb}, 0.9)` : (darkMode ? '#6b7280' : '#9ca3af');

  if (isThinkingDeep) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.14Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.14Z"/>
          </svg>
          <div className="flex gap-1">
            {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#06b6d4', animationDelay: `${i*0.12}s` }} />)}
          </div>
        </div>
        <span className="text-xs font-medium" style={{ color: '#06b6d4' }}>{t('chat.deepThinking', lang)}</span>
      </div>
    );
  }

  if (isReadingImage) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#a78bfa' : '#7c3aed'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <div className="flex gap-1">
            {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: darkMode ? '#a78bfa' : '#7c3aed', animationDelay: `${i*0.12}s` }} />)}
          </div>
        </div>
        <span className="text-xs font-medium" style={{ color: darkMode ? '#a78bfa' : '#7c3aed' }}>{t('chat.readingImage', lang)}</span>
      </div>
    );
  }

  if (isSearching) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dotColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: dotColor, animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        </div>
        <span className="text-xs font-medium" style={{ color: dotColor }}>
          {t('chat.searching', lang)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ backgroundColor: dotColor, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      {name && (
        <span className="text-xs" style={{ color: dotColor }}>
          {t('chat.thinking', lang, { name })}
        </span>
      )}
    </div>
  );
}

// ── Empty-state suggestions ───────────────────────────────────────────────────
const SUGGESTIONS_FR = [
  "Quel est ton prochain move ?",
  "Sur quoi tu travailles aujourd'hui ?",
  "Qu'est-ce qui te bloque en ce moment ?",
  "Où en es-tu avec tes prospects ?",
];
const SUGGESTIONS_EN = [
  "What's your next move?",
  "What are you working on today?",
  "What's blocking you right now?",
  "Where are you with your prospects?",
];
const EMPTY_AGENT_ORDER = ['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS'];

function ChatEmptyState({ agentNames, agentPhotos, sessionCount, sessionMode, lang, darkMode }) {
  const [suggIdx, setSuggIdx] = useState(0);
  const [visible, setVisible]  = useState(true);
  const suggestions  = lang === 'fr' ? SUGGESTIONS_FR : SUGGESTIONS_EN;
  const modeLabel    = t(`modeLabel.${sessionMode}`, lang);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setSuggIdx((i) => (i + 1) % suggestions.length); setVisible(true); }, 350);
    }, 5000);
    return () => clearInterval(id);
  }, [suggestions.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* ── 6 agent avatars with 60 ms stagger ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {EMPTY_AGENT_ORDER.map((key, i) => {
          const cfg   = AGENT_CONFIG[key];
          const photo = agentPhotos?.[key];
          const name  = agentNames?.[key] || key;
          return (
            <div
              key={key}
              title={name}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                overflow: 'hidden', flexShrink: 0,
                border: `1.5px solid rgba(${cfg?.glowRgb || '148,163,184'}, 0.28)`,
                background: `rgba(${cfg?.glowRgb || '148,163,184'}, 0.09)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17,
                animation: `bubbleFadeIn 0.4s ease-out ${i * 0.06}s both`,
              }}
            >
              {photo
                ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span>{cfg?.emoji}</span>
              }
            </div>
          );
        })}
      </div>

      {/* ── Session info line ── */}
      <p style={{ margin: 0, fontSize: 12, color: 'rgba(148,163,184,0.32)', letterSpacing: '0.04em' }}>
        {t('chat.session', lang)}{sessionCount} · {modeLabel}
      </p>

      {/* ── Rotating suggestion ── */}
      <p style={{
        margin: 0, fontSize: 16, fontWeight: 400, fontStyle: 'italic',
        color: 'rgba(255,255,255,0.42)',
        maxWidth: 310, lineHeight: 1.55, textAlign: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease',
      }}>
        {suggestions[suggIdx]}
      </p>
    </div>
  );
}

// ── Email reply draft card ─────────────────────────────────────────────────────

function EmailReplyCard({ message, darkMode, lang, onSend }) {
  const [editMode, setEditMode] = useState(false);
  const [body, setBody] = useState(message.draft || message.content || '');
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (message.type === 'email-reply-sent' || message.sent) {
    return (
      <div className="flex justify-start mb-4 px-1">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: 'rgba(34,197,94,0.8)' }}>
          <CheckCircle size={13} />
          <span>{lang === 'fr' ? `Email envoyé à ${message.fromName}` : `Email sent to ${message.fromName}`}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{
          background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)',
          border: `1px solid ${darkMode ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.25)'}`,
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: darkMode ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.15)', background: darkMode ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.04)' }}>
          <div className="flex items-center gap-2">
            <Mail size={12} style={{ color: 'rgba(59,130,246,0.7)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(59,130,246,0.7)' }}>
              {lang === 'fr' ? 'Brouillon de réponse' : 'Reply Draft'}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: darkMode ? 'rgba(148,163,184,0.4)' : 'rgba(100,116,139,0.5)' }}>
            {lang === 'fr' ? 'À :' : 'To:'} {message.fromName}
          </span>
        </div>

        {/* Subject */}
        <div className="px-4 py-1.5 border-b"
          style={{ borderColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }}>
          <span className="text-[11px]" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
            {message.emailSubject}
          </span>
        </div>

        {/* Draft body */}
        <div className="px-4 py-3">
          {editMode ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full text-sm leading-relaxed resize-none outline-none bg-transparent"
              style={{ color: darkMode ? '#e2e8f0' : '#1e293b', fontFamily: 'inherit' }}
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: darkMode ? '#e2e8f0' : '#1e293b' }}>
              {body}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={() => onSend?.(message.id, message.emailTo, message.emailSubject, body, message.emailThreadId)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(59,130,246,0.85)', color: 'white', boxShadow: '0 0 16px rgba(59,130,246,0.25)' }}
          >
            <Send size={10} />
            {lang === 'fr' ? 'Envoyer' : 'Send'}
          </button>
          <button
            onClick={() => setEditMode((e) => !e)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: darkMode ? 'rgba(148,163,184,0.7)' : '#475569', border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}
          >
            <Edit3 size={10} />
            {editMode ? (lang === 'fr' ? 'Aperçu' : 'Preview') : (lang === 'fr' ? 'Modifier' : 'Edit')}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ml-auto"
            style={{ color: 'rgba(148,163,184,0.35)' }}
          >
            <X size={10} />
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Calendar event card ───────────────────────────────────────────────────────
// Shared helpers for ISO <-> local date/time inputs (always interprets as local)
function isoToLocalInputs(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
function inputsToISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function formatDateForDisplay(iso, lang) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function CalendarEventCard({ message, darkMode, lang, onCreate }) {
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState(message.title || '');
  const [description, setDescription] = useState(message.description || '');
  const [{ date: startDate, time: startTime }, setStart] = useState(() => isoToLocalInputs(message.startISO));
  const [{ date: endDate, time: endTime }, setEnd] = useState(() => isoToLocalInputs(message.endISO));
  const [dismissed, setDismissed] = useState(false);
  const [creating, setCreating] = useState(false);

  if (dismissed) return null;

  // Created (success) state
  if (message.type === 'calendar-event-created' || message.created) {
    return (
      <div className="flex justify-start mb-4 px-1">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: 'rgba(16,185,129,0.9)' }}>
          <CheckCircle size={13} />
          <span>
            {lang === 'fr' ? `Event créé : ${message.title}` : `Event created: ${message.title}`}
            {' · '}
            <span style={{ opacity: 0.75 }}>{formatDateForDisplay(message.startISO, lang)}</span>
          </span>
          {message.htmlLink && (
            <a
              href={message.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 ml-2 text-xs font-medium"
              style={{ color: 'rgba(16,185,129,0.95)' }}
            >
              {lang === 'fr' ? 'Ouvrir' : 'Open'}
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    const startISO = inputsToISO(startDate, startTime);
    const endISO   = inputsToISO(endDate,   endTime);
    if (!title.trim() || !startISO || !endISO) return;
    setCreating(true);
    try {
      await onCreate?.(message.id, { summary: title.trim(), startISO, endISO, description: description.trim() });
    } finally {
      setCreating(false);
    }
  };

  const accent = '16,185,129'; // emerald — success/write
  const inputBase = {
    background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border:     darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
    color:      darkMode ? '#e2e8f0' : '#1e293b',
  };

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{
          background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)',
          border:     `1px solid rgba(${accent},0.22)`,
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${accent},0.15)`, background: `rgba(${accent},0.05)` }}>
          <div className="flex items-center gap-2">
            <Calendar size={12} style={{ color: `rgba(${accent},0.9)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${accent},0.9)` }}>
              {lang === 'fr' ? 'Nouvel event — à confirmer' : 'New event — to confirm'}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: darkMode ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.55)' }}>
            Google Calendar
          </span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2.5">
          {editMode ? (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
                  {lang === 'fr' ? 'Titre' : 'Title'}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-sm rounded-md px-2.5 py-1.5 outline-none"
                  style={inputBase}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
                    {lang === 'fr' ? 'Début' : 'Start'}
                  </label>
                  <div className="flex gap-1.5">
                    <input type="date" value={startDate} onChange={(e) => setStart({ date: e.target.value, time: startTime })}
                      className="text-xs rounded-md px-2 py-1.5 outline-none flex-1" style={inputBase} />
                    <input type="time" value={startTime} onChange={(e) => setStart({ date: startDate, time: e.target.value })}
                      className="text-xs rounded-md px-2 py-1.5 outline-none w-20" style={inputBase} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
                    {lang === 'fr' ? 'Fin' : 'End'}
                  </label>
                  <div className="flex gap-1.5">
                    <input type="date" value={endDate} onChange={(e) => setEnd({ date: e.target.value, time: endTime })}
                      className="text-xs rounded-md px-2 py-1.5 outline-none flex-1" style={inputBase} />
                    <input type="time" value={endTime} onChange={(e) => setEnd({ date: endDate, time: e.target.value })}
                      className="text-xs rounded-md px-2 py-1.5 outline-none w-20" style={inputBase} />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
                  {lang === 'fr' ? 'Notes (optionnel)' : 'Notes (optional)'}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full text-sm rounded-md px-2.5 py-1.5 outline-none resize-none"
                  style={{ ...inputBase, fontFamily: 'inherit' }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
                {title}
              </p>
              <p className="text-xs" style={{ color: darkMode ? 'rgba(148,163,184,0.75)' : 'rgba(71,85,105,0.85)' }}>
                {formatDateForDisplay(inputsToISO(startDate, startTime) || message.startISO, lang)}
                {' → '}
                {new Date(inputsToISO(endDate, endTime) || message.endISO).toLocaleTimeString(lang === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </p>
              {description && (
                <p className="text-xs whitespace-pre-wrap" style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.75)' }}>
                  {description}
                </p>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: `rgba(${accent},0.9)`, color: 'white', boxShadow: `0 0 16px rgba(${accent},0.28)` }}
          >
            <Calendar size={10} />
            {creating
              ? (lang === 'fr' ? 'Création…' : 'Creating…')
              : (lang === 'fr' ? 'Créer l\'event' : 'Create event')}
          </button>
          <button
            onClick={() => setEditMode((e) => !e)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: darkMode ? 'rgba(148,163,184,0.7)' : '#475569', border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}
          >
            <Edit3 size={10} />
            {editMode ? (lang === 'fr' ? 'Aperçu' : 'Preview') : (lang === 'fr' ? 'Modifier' : 'Edit')}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ml-auto"
            style={{ color: 'rgba(148,163,184,0.35)' }}
          >
            <X size={10} />
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pipeline update card ──────────────────────────────────────────────────────
const PIPELINE_STATUS_COLORS = {
  'Incomplet':    '148,163,184',
  'Cible':        '100,116,139',
  'Prêt':         '59,130,246',
  'Contacté':     '249,115,22',
  'Répondu':      '250,204,21',
  'Chaud':        '239,68,68',
  'Démo':         '139,92,246',
  'Signé':        '16,185,129',
  'Client actif': '34,197,94',
  'Perdu':        '120,113,108',
};

function StatusPill({ status, darkMode }) {
  const rgb = PIPELINE_STATUS_COLORS[status] || '148,163,184';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: `rgba(${rgb},0.15)`,
        color:      `rgba(${rgb},${darkMode ? 0.95 : 1})`,
        border:     `1px solid rgba(${rgb},0.3)`,
      }}
    >
      {status}
    </span>
  );
}

function PipelineUpdateCard({ message, darkMode, lang, onApply }) {
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying]   = useState(false);

  if (dismissed) return null;

  // Applied (success) state
  if (message.type === 'pipeline-update-applied' || message.applied) {
    return (
      <div className="flex justify-start mb-4 px-1">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', color: 'rgba(139,92,246,0.95)' }}>
          <CheckCircle size={13} />
          <span>
            {lang === 'fr'
              ? `Pipeline mis à jour : ${message.prospectName} → `
              : `Pipeline updated: ${message.prospectName} → `}
          </span>
          <StatusPill status={message.newStatus} darkMode={darkMode} />
        </div>
      </div>
    );
  }

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply?.(message.id, {
        prospectId:   message.prospectId,
        newStatus:    message.newStatus,
        prospectName: message.prospectName,
      });
    } finally {
      setApplying(false);
    }
  };

  const accent = '139,92,246'; // violet — pipeline / CRM

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{
          background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)',
          border:     `1px solid rgba(${accent},0.22)`,
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${accent},0.15)`, background: `rgba(${accent},0.05)` }}>
          <div className="flex items-center gap-2">
            <TrendingUp size={12} style={{ color: `rgba(${accent},0.9)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${accent},0.9)` }}>
              {lang === 'fr' ? 'Pipeline — à confirmer' : 'Pipeline — to confirm'}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: darkMode ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.55)' }}>
            CRM
          </span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2">
          <p className="text-sm font-semibold" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
            {message.prospectName}
            {message.prospectCity && (
              <span className="ml-2 text-[11px] font-normal" style={{ color: darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.65)' }}>
                · {message.prospectCity}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <StatusPill status={message.currentStatus} darkMode={darkMode} />
            <ArrowRight size={12} style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }} />
            <StatusPill status={message.newStatus} darkMode={darkMode} />
          </div>
          {message.reason && (
            <p className="text-xs italic" style={{ color: darkMode ? 'rgba(148,163,184,0.65)' : 'rgba(100,116,139,0.75)' }}>
              "{message.reason}"
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={handleApply}
            disabled={applying}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: `rgba(${accent},0.9)`, color: 'white', boxShadow: `0 0 16px rgba(${accent},0.3)` }}
          >
            <CheckCircle size={10} />
            {applying
              ? (lang === 'fr' ? 'Mise à jour…' : 'Updating…')
              : (lang === 'fr' ? 'Confirmer' : 'Confirm')}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ml-auto"
            style={{ color: 'rgba(148,163,184,0.35)' }}
          >
            <X size={10} />
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard update card ────────────────────────────────────────────────────
const DASHBOARD_TYPE_META = {
  'mrr+':     { rgb: '16,185,129', labelFr: 'MRR +',    labelEn: 'MRR +',    Icon: TrendingUp,  sign: '+' },
  'mrr-':     { rgb: '239,68,68',  labelFr: 'MRR −',    labelEn: 'MRR −',    Icon: Minus,       sign: '−' },
  'one-time': { rgb: '251,191,36', labelFr: 'One-time', labelEn: 'One-time', Icon: Zap,         sign: '+' },
  'expense':  { rgb: '239,68,68',  labelFr: 'Dépense',  labelEn: 'Expense',  Icon: AlertCircle, sign: '−' },
};

const EXPENSE_CATEGORIES = [
  { key: 'tools',        fr: 'Outils',       en: 'Tools' },
  { key: 'ads',          fr: 'Pub',          en: 'Ads' },
  { key: 'subscription', fr: 'Abonnement',   en: 'Subscription' },
  { key: 'freelance',    fr: 'Freelance',    en: 'Freelance' },
  { key: 'office',       fr: 'Bureau',       en: 'Office' },
  { key: 'other',        fr: 'Autre',        en: 'Other' },
];

function categoryLabel(key, lang) {
  const hit = EXPENSE_CATEGORIES.find((c) => c.key === key);
  return hit ? (lang === 'fr' ? hit.fr : hit.en) : key;
}

function formatCurrency(amount) {
  return `$${Math.abs(amount).toLocaleString('en-US')}`;
}

function DashboardUpdateCard({ message, darkMode, lang, onApply }) {
  const meta = DASHBOARD_TYPE_META[message.updateType] || DASHBOARD_TYPE_META['one-time'];
  const isExpense = message.updateType === 'expense';
  const [editMode, setEditMode]   = useState(false);
  const [name, setName]           = useState((isExpense ? message.label : message.clientName) || '');
  const [amount, setAmount]       = useState(String(message.amount || 0));
  const [category, setCategory]   = useState(message.category || 'other');
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying]   = useState(false);

  if (dismissed) return null;

  if (message.type === 'dashboard-update-applied' || message.applied) {
    const suffix = message.updateType === 'mrr+' || message.updateType === 'mrr-' ? '/mo'
                 : (isExpense && message.isRecurring) ? '/mo' : '';
    const categoryTag = isExpense ? ` · ${categoryLabel(category, lang)}` : '';
    return (
      <div className="flex justify-start mb-4 px-1">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm"
          style={{ background: `rgba(${meta.rgb},0.08)`, border: `1px solid rgba(${meta.rgb},0.28)`, color: `rgba(${meta.rgb},0.95)` }}>
          <CheckCircle size={13} />
          <span>
            {lang === 'fr'
              ? `Dashboard mis à jour : ${meta.labelFr} ${meta.sign}${formatCurrency(Number(amount))}${suffix}${categoryTag} · ${name}`
              : `Dashboard updated: ${meta.labelEn} ${meta.sign}${formatCurrency(Number(amount))}${suffix}${categoryTag} · ${name}`}
          </span>
        </div>
      </div>
    );
  }

  const handleApply = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || !name.trim()) return;
    setApplying(true);
    try {
      await onApply?.(message.id, {
        updateType:  message.updateType,
        amount:      Math.round(amt),
        clientName:  isExpense ? null : name.trim(),
        label:       isExpense ? name.trim() : null,
        category:    isExpense ? category : null,
        isRecurring: isExpense ? !!message.isRecurring : false,
        retainerId:  message.retainerId,
      });
    } finally {
      setApplying(false);
    }
  };

  const Icon = meta.Icon;
  const inputBase = {
    background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border:     darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
    color:      darkMode ? '#e2e8f0' : '#1e293b',
  };

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{
          background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)',
          border:     `1px solid rgba(${meta.rgb},0.22)`,
        }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${meta.rgb},0.15)`, background: `rgba(${meta.rgb},0.05)` }}>
          <div className="flex items-center gap-2">
            <Icon size={12} style={{ color: `rgba(${meta.rgb},0.9)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${meta.rgb},0.9)` }}>
              {lang === 'fr' ? `${meta.labelFr} — à confirmer` : `${meta.labelEn} — to confirm`}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: darkMode ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.55)' }}>
            Dashboard
          </span>
        </div>

        <div className="px-4 py-3 space-y-2.5">
          {editMode ? (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
                  {isExpense ? (lang === 'fr' ? 'Description' : 'Label') : (lang === 'fr' ? 'Client' : 'Client')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm rounded-md px-2.5 py-1.5 outline-none"
                  style={inputBase}
                />
              </div>
              {isExpense && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
                    {lang === 'fr' ? 'Catégorie' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-sm rounded-md px-2.5 py-1.5 outline-none"
                    style={inputBase}
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat.key} value={cat.key} style={{ background: darkMode ? '#0f172a' : '#ffffff' }}>
                        {lang === 'fr' ? cat.fr : cat.en}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>
                  {lang === 'fr'
                    ? (message.updateType.startsWith('mrr') || (isExpense && message.isRecurring) ? 'Montant mensuel ($)' : 'Montant ($)')
                    : (message.updateType.startsWith('mrr') || (isExpense && message.isRecurring) ? 'Monthly amount ($)' : 'Amount ($)')}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full text-sm rounded-md px-2.5 py-1.5 outline-none"
                  style={inputBase}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <DollarSign size={14} style={{ color: `rgba(${meta.rgb},0.95)` }} />
                <span className="text-xl font-bold" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
                  {meta.sign}{formatCurrency(Number(amount) || 0)}
                </span>
                {(message.updateType.startsWith('mrr') || (isExpense && message.isRecurring)) && (
                  <span className="text-xs" style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }}>
                    / {lang === 'fr' ? 'mois' : 'month'}
                  </span>
                )}
                {isExpense && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                    style={{ background: `rgba(${meta.rgb},0.12)`, color: `rgba(${meta.rgb},0.95)`, border: `1px solid rgba(${meta.rgb},0.28)` }}>
                    {categoryLabel(category, lang)}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold" style={{ color: darkMode ? '#e2e8f0' : '#1e293b' }}>
                {name || (isExpense ? (lang === 'fr' ? 'Dépense sans nom' : 'Untitled expense') : (lang === 'fr' ? 'Nouveau client' : 'New client'))}
              </p>
              {message.reason && (
                <p className="text-xs italic" style={{ color: darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.7)' }}>
                  "{message.reason}"
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={handleApply}
            disabled={applying || !name.trim() || !(Number(amount) > 0)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: `rgba(${meta.rgb},0.9)`, color: 'white', boxShadow: `0 0 16px rgba(${meta.rgb},0.3)` }}
          >
            <CheckCircle size={10} />
            {applying
              ? (lang === 'fr' ? 'Enregistrement…' : 'Saving…')
              : (lang === 'fr' ? 'Confirmer' : 'Confirm')}
          </button>
          <button
            onClick={() => setEditMode((e) => !e)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: darkMode ? 'rgba(148,163,184,0.7)' : '#475569', border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}
          >
            <Edit3 size={10} />
            {editMode ? (lang === 'fr' ? 'Aperçu' : 'Preview') : (lang === 'fr' ? 'Modifier' : 'Edit')}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ml-auto"
            style={{ color: 'rgba(148,163,184,0.35)' }}
          >
            <X size={10} />
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Memory recap card ────────────────────────────────────────────────────────
function MemoryRecapCard({ message, darkMode, lang }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const accent = '99,102,241'; // indigo — QG brand color
  const isLoading = message.type === 'memory-recap-loading';

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{
          background: darkMode ? 'rgba(8,12,22,0.85)' : 'rgba(248,250,252,0.95)',
          border:     `1px solid rgba(${accent},0.22)`,
          backdropFilter: 'blur(8px)',
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${accent},0.14)`, background: `rgba(${accent},0.05)` }}>
          <div className="flex items-center gap-2">
            <Brain size={12} style={{ color: `rgba(${accent},0.9)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${accent},0.9)` }}>
              {lang === 'fr' ? 'Depuis la dernière fois' : 'Since last time'}
            </span>
          </div>
          {!isLoading && (
            <button
              onClick={() => setDismissed(true)}
              aria-label={lang === 'fr' ? 'Fermer' : 'Dismiss'}
              className="opacity-40 hover:opacity-80 transition-opacity"
            >
              <X size={11} style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {isLoading ? (
            <div className="space-y-2">
              <div className="skeleton-line skeleton" style={{ height: 10, width: '70%', borderRadius: 4 }} />
              <div className="skeleton-line skeleton" style={{ height: 10, width: '85%', borderRadius: 4 }} />
              <div className="skeleton-line skeleton" style={{ height: 10, width: '60%', borderRadius: 4 }} />
            </div>
          ) : (
            <div className="space-y-2.5">
              {message.welcomeLine && (
                <p className="text-sm italic" style={{ color: darkMode ? 'rgba(203,213,225,0.9)' : 'rgba(30,41,59,0.85)' }}>
                  {message.welcomeLine}
                </p>
              )}
              {message.lastWin && (
                <RecapLine Icon={Trophy} colorRgb="16,185,129" label={lang === 'fr' ? 'Victoire' : 'Win'} text={message.lastWin} darkMode={darkMode} />
              )}
              {message.lastBlocker && (
                <RecapLine Icon={AlertCircle} colorRgb="239,68,68" label={lang === 'fr' ? 'Blocage' : 'Blocker'} text={message.lastBlocker} darkMode={darkMode} />
              )}
              {message.nextMove && (
                <RecapLine Icon={ArrowUpRight} colorRgb="99,102,241" label={lang === 'fr' ? 'Prochain move' : 'Next move'} text={message.nextMove} darkMode={darkMode} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecapLine({ Icon, colorRgb, label, text, darkMode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-md mt-0.5"
        style={{
          width: 22, height: 22,
          background: `rgba(${colorRgb},0.12)`,
          border: `1px solid rgba(${colorRgb},0.22)`,
        }}
      >
        <Icon size={11} style={{ color: `rgba(${colorRgb},0.95)` }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: `rgba(${colorRgb},0.85)` }}>
          {label}
        </div>
        <p className="text-[13px] leading-snug" style={{ color: darkMode ? 'rgba(226,232,240,0.95)' : 'rgba(15,23,42,0.9)' }}>
          {text}
        </p>
      </div>
    </div>
  );
}

// ── Churn risk alert card ────────────────────────────────────────────────────
const CHURN_SEVERITY = {
  warn:   { rgb: '251,191,36' },
  danger: { rgb: '239,68,68' },
};

function ChurnRiskAlertCard({ message, darkMode, lang }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const items = message.items || [];
  if (items.length === 0) return null;

  const maxSeverity = items.some((i) => i.severity === 'danger') ? 'danger' : 'warn';
  const accent = CHURN_SEVERITY[maxSeverity].rgb;

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{
          background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)',
          border:     `1px solid rgba(${accent},0.28)`,
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${accent},0.18)`, background: `rgba(${accent},0.06)` }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} style={{ color: `rgba(${accent},0.95)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${accent},0.95)` }}>
              {lang === 'fr'
                ? `Risque de churn — ${items.length} ${items.length > 1 ? 'retainers' : 'retainer'}`
                : `Churn risk — ${items.length} retainer${items.length > 1 ? 's' : ''}`}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label={lang === 'fr' ? 'Fermer' : 'Dismiss'}
            className="opacity-40 hover:opacity-80 transition-opacity"
          >
            <X size={11} style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }} />
          </button>
        </div>

        {/* List */}
        <div className="px-2 py-2 space-y-1">
          {items.map((item) => {
            const rgb = CHURN_SEVERITY[item.severity].rgb;
            return (
              <div key={item.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{
                  background: `rgba(${rgb},0.04)`,
                  border: `1px solid rgba(${rgb},0.15)`,
                }}>
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-md"
                  style={{
                    width: 26, height: 26,
                    background: `rgba(${rgb},0.12)`,
                    border: `1px solid rgba(${rgb},0.28)`,
                  }}>
                  <UserX size={13} style={{ color: `rgba(${rgb},0.95)` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
                      {item.name}
                    </p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: `rgba(${rgb},0.15)`,
                        color: `rgba(${rgb},0.98)`,
                        border: `1px solid rgba(${rgb},0.3)`,
                      }}>
                      ${Number(item.amount || 0).toLocaleString()}/mo
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: darkMode ? 'rgba(148,163,184,0.75)' : 'rgba(100,116,139,0.85)' }}>
                    {lang === 'fr'
                      ? `Aucune activité depuis ${item.days} jours — ${item.severity === 'danger' ? 'risque élevé' : 'à surveiller'}`
                      : `No activity for ${item.days} days — ${item.severity === 'danger' ? 'high risk' : 'keep an eye on'}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 pb-3 pt-1">
          <p className="text-[10px] italic" style={{ color: darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.65)' }}>
            {lang === 'fr'
              ? 'Mentionne un nom en conversation pour reset le compteur.'
              : 'Mention a name in conversation to reset the counter.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Morning briefing card (3 variants: locked / loading / ready) ──────────────
const BRIEFING_UNLOCK_AT = 7;

function BriefingLine({ Icon, colorRgb, label, text, darkMode }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-md mt-0.5"
        style={{
          width: 22, height: 22,
          background: `rgba(${colorRgb},0.12)`,
          border: `1px solid rgba(${colorRgb},0.22)`,
        }}
      >
        <Icon size={11} style={{ color: `rgba(${colorRgb},0.95)` }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: `rgba(${colorRgb},0.85)` }}>
          {label}
        </div>
        <p className="text-[13px] leading-snug" style={{ color: darkMode ? 'rgba(226,232,240,0.95)' : 'rgba(15,23,42,0.9)' }}>
          {text}
        </p>
      </div>
    </div>
  );
}

function MorningBriefingCard({ message, darkMode, lang }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const accent = '99,102,241'; // indigo — QG brand
  const isLocked  = message.type === 'briefing-locked';
  const isLoading = message.type === 'briefing-loading';

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{
          background: darkMode ? 'rgba(8,12,22,0.85)' : 'rgba(248,250,252,0.95)',
          border:     `1px solid rgba(${accent},0.22)`,
          backdropFilter: 'blur(8px)',
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${accent},0.14)`, background: `rgba(${accent},0.05)` }}>
          <div className="flex items-center gap-2">
            {isLocked
              ? <Lock size={12} style={{ color: `rgba(${accent},0.9)` }} />
              : <Sunrise size={12} style={{ color: `rgba(${accent},0.9)` }} />}
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${accent},0.9)` }}>
              {isLocked
                ? (lang === 'fr' ? 'Briefing — en cours d\'apprentissage' : 'Briefing — learning mode')
                : (lang === 'fr' ? 'Briefing du matin' : 'Morning briefing')}
            </span>
          </div>
          {!isLoading && (
            <button
              onClick={() => setDismissed(true)}
              aria-label={lang === 'fr' ? 'Fermer' : 'Dismiss'}
              className="opacity-40 hover:opacity-80 transition-opacity"
            >
              <X size={11} style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {isLocked && (() => {
            const sessionsDone = Number(message.sessionCount) || 0;
            const sessionsLeft = Math.max(0, BRIEFING_UNLOCK_AT - sessionsDone);
            const pct = Math.min(100, Math.round((sessionsDone / BRIEFING_UNLOCK_AT) * 100));
            return (
              <div>
                <p className="text-[13px] leading-relaxed mb-3" style={{ color: darkMode ? 'rgba(203,213,225,0.9)' : 'rgba(30,41,59,0.9)' }}>
                  {lang === 'fr'
                    ? `Les agents apprennent à te connaître — ${sessionsLeft} session${sessionsLeft > 1 ? 's' : ''} avant ton premier briefing personnalisé.`
                    : `The agents are learning about you — ${sessionsLeft} session${sessionsLeft > 1 ? 's' : ''} until your first personalized briefing.`}
                </p>
                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `rgba(${accent},0.12)` }}>
                    <div
                      style={{
                        width: `${pct}%`, height: '100%',
                        background: `rgba(${accent},0.7)`,
                        transition: 'width 600ms ease',
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: `rgba(${accent},0.85)` }}>
                    {sessionsDone} / {BRIEFING_UNLOCK_AT}
                  </span>
                </div>
                <p className="text-[11px] italic mt-3" style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }}>
                  {lang === 'fr'
                    ? 'Plus de sessions = briefing plus précis.'
                    : 'More sessions = more precise briefing.'}
                </p>
              </div>
            );
          })()}

          {isLoading && (
            <div className="space-y-2">
              <div className="skeleton-line skeleton" style={{ height: 10, width: '72%', borderRadius: 4 }} />
              <div className="skeleton-line skeleton" style={{ height: 10, width: '88%', borderRadius: 4 }} />
              <div className="skeleton-line skeleton" style={{ height: 10, width: '65%', borderRadius: 4 }} />
              <div className="skeleton-line skeleton" style={{ height: 10, width: '80%', borderRadius: 4 }} />
            </div>
          )}

          {!isLocked && !isLoading && (
            <div className="space-y-2.5">
              <BriefingLine Icon={Mail}         colorRgb="16,185,129"  label={lang === 'fr' ? 'Emails' : 'Emails'}      text={message.emailsLine}   darkMode={darkMode} />
              <BriefingLine Icon={Calendar}     colorRgb="251,191,36"  label={lang === 'fr' ? 'Calendrier' : 'Calendar'} text={message.calendarLine} darkMode={darkMode} />
              <BriefingLine Icon={ArrowUpRight} colorRgb="99,102,241"  label={lang === 'fr' ? 'Prochain move' : 'Next move'} text={message.nextMoveLine} darkMode={darkMode} />
              <BriefingLine Icon={UserCheck}    colorRgb="239,68,68"   label={lang === 'fr' ? 'Prospect à relancer' : 'Prospect to touch'} text={message.prospectLine} darkMode={darkMode} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Batch follow-up card (loading / preview / applied) ───────────────────────
const FOLLOWUP_STATUS_COLORS = {
  'Contacté': '249,115,22',
  'Répondu':  '250,204,21',
  'Chaud':    '239,68,68',
  'Démo':     '139,92,246',
};

function BatchFollowupCard({ message, darkMode, lang, onSend }) {
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending]     = useState(false);
  // Local editable copy of items
  const [items, setItems] = useState(() => (message.items || []).map((it) => ({ ...it })));
  const [expandedId, setExpandedId] = useState(null);
  // Sync when the message's items change (e.g. applied transition)
  if (dismissed) return null;

  const accent = '139,92,246'; // violet — pipeline / CRM family

  // ── Loading ────────────────────────────────────────────────────────────
  if (message.type === 'batch-followup-loading') {
    return (
      <div className="flex justify-start mb-4 px-1">
        <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
          style={{ background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)', border: `1px solid rgba(${accent},0.22)` }}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b"
            style={{ borderColor: `rgba(${accent},0.14)`, background: `rgba(${accent},0.05)` }}>
            <Loader2 size={12} className="animate-spin" style={{ color: `rgba(${accent},0.9)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${accent},0.9)` }}>
              {lang === 'fr' ? `Génération de ${message.total} relance${message.total > 1 ? 's' : ''}…` : `Generating ${message.total} follow-up${message.total > 1 ? 's' : ''}…`}
            </span>
          </div>
          <div className="px-4 py-4 space-y-2">
            <div className="skeleton-line skeleton" style={{ height: 10, width: '65%', borderRadius: 4 }} />
            <div className="skeleton-line skeleton" style={{ height: 10, width: '85%', borderRadius: 4 }} />
            <div className="skeleton-line skeleton" style={{ height: 10, width: '72%', borderRadius: 4 }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Applied (sent summary) ─────────────────────────────────────────────
  if (message.type === 'batch-followup-applied' || message.applied) {
    const sent   = Number(message.sent)   || 0;
    const failed = Number(message.failed) || 0;
    return (
      <div className="flex justify-start mb-4 px-1">
        <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
          style={{ background: `rgba(${accent},0.06)`, border: `1px solid rgba(${accent},0.28)` }}>
          <div className="flex items-center gap-2 px-4 py-3">
            <CheckCircle size={14} style={{ color: `rgba(${accent},0.95)` }} />
            <span className="text-sm font-semibold" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
              {lang === 'fr'
                ? `${sent} relance${sent !== 1 ? 's' : ''} envoyée${sent !== 1 ? 's' : ''}${failed > 0 ? ` · ${failed} échec${failed !== 1 ? 's' : ''}` : ''}`
                : `${sent} follow-up${sent !== 1 ? 's' : ''} sent${failed > 0 ? ` · ${failed} failure${failed !== 1 ? 's' : ''}` : ''}`}
            </span>
          </div>
          {Array.isArray(message.results) && (
            <div className="px-4 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {message.results.map((r, i) => (
                  <span key={i}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded"
                    style={{
                      background: r.status === 'sent' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color:      r.status === 'sent' ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
                      border: `1px solid ${r.status === 'sent' ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)'}`,
                    }}>
                    {r.prospectName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Preview (editable) ─────────────────────────────────────────────────
  const selectedItems = items.filter((it) => it.selected);
  const toggleSelect = (id) => {
    setItems((prev) => prev.map((it) => it.prospectId === id ? { ...it, selected: !it.selected } : it));
  };
  const updateField = (id, field, value) => {
    setItems((prev) => prev.map((it) => it.prospectId === id ? { ...it, [field]: value } : it));
  };
  const toggleAll = (target) => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: target })));
  };
  const handleSendAll = async () => {
    if (sending || selectedItems.length === 0) return;
    setSending(true);
    try { await onSend?.(message.id, { items: selectedItems, batchId: message.batchId }); }
    finally { setSending(false); }
  };
  const handleSendOne = async (id) => {
    if (sending) return;
    const it = items.find((x) => x.prospectId === id);
    if (!it) return;
    setSending(true);
    try { await onSend?.(message.id, { items: [it], batchId: message.batchId }); }
    finally { setSending(false); }
  };

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{ background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)', border: `1px solid rgba(${accent},0.22)` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${accent},0.14)`, background: `rgba(${accent},0.05)` }}>
          <div className="flex items-center gap-2">
            <Users size={12} style={{ color: `rgba(${accent},0.9)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${accent},0.9)` }}>
              {lang === 'fr' ? `${items.length} relance${items.length > 1 ? 's' : ''} · silence ≥ ${message.daysThreshold}j` : `${items.length} follow-up${items.length > 1 ? 's' : ''} · silent ≥ ${message.daysThreshold}d`}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label={lang === 'fr' ? 'Fermer' : 'Dismiss'}
            className="opacity-40 hover:opacity-80 transition-opacity">
            <X size={11} style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }} />
          </button>
        </div>

        {/* Ordering explanation — one italic line explaining the priority sort */}
        {message.orderingExplanation && (
          <div className="px-4 py-2.5 border-b"
            style={{ borderColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }}>
            <p className="text-[12px] italic leading-snug"
              style={{ color: darkMode ? 'rgba(203,213,225,0.85)' : 'rgba(51,65,85,0.88)' }}>
              {message.orderingExplanation}
            </p>
          </div>
        )}

        {/* Select-all strip */}
        <div className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }}>
          <button
            onClick={() => toggleAll(selectedItems.length < items.length)}
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: `rgba(${accent},0.85)` }}>
            {selectedItems.length < items.length
              ? (lang === 'fr' ? 'Tout sélectionner' : 'Select all')
              : (lang === 'fr' ? 'Tout désélectionner' : 'Deselect all')}
          </button>
          <span className="text-[10px]" style={{ color: darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.65)' }}>
            {selectedItems.length} / {items.length} {lang === 'fr' ? 'sélectionnés' : 'selected'}
          </span>
        </div>

        {/* Rows */}
        <div className="divide-y" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }}>
          {items.map((it) => {
            const expanded = expandedId === it.prospectId;
            const statusRgb = FOLLOWUP_STATUS_COLORS[it.status] || '148,163,184';
            return (
              <div key={it.prospectId}
                style={{
                  borderBottom: darkMode ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.05)',
                  background: it.selected ? 'transparent' : (darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)'),
                  opacity: it.selected ? 1 : 0.55,
                }}>
                {/* Row header */}
                <div className="flex items-start gap-2.5 px-4 py-2.5">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(it.prospectId)}
                    aria-label={it.selected ? 'Uncheck' : 'Check'}
                    className="flex-shrink-0 mt-0.5"
                    style={{
                      width: 16, height: 16, borderRadius: 4,
                      background: it.selected ? `rgba(${accent},0.9)` : 'transparent',
                      border: `1.5px solid ${it.selected ? `rgba(${accent},0.9)` : (darkMode ? 'rgba(148,163,184,0.4)' : 'rgba(100,116,139,0.4)')}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 150ms',
                    }}>
                    {it.selected && <Check size={10} strokeWidth={3} style={{ color: '#fff' }} />}
                  </button>
                  {/* Name + meta */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(expanded ? null : it.prospectId)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold truncate" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
                        {it.prospectName}
                      </p>
                      {it.businessName && (
                        <span className="text-[11px]" style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }}>
                          · {it.businessName}
                        </span>
                      )}
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ background: `rgba(${statusRgb},0.15)`, color: `rgba(${statusRgb},0.95)`, border: `1px solid rgba(${statusRgb},0.28)` }}>
                        {it.status}
                      </span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: darkMode ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.8)' }}>
                      {it.email} · {lang === 'fr' ? `${it.daysSince}j sans contact` : `${it.daysSince}d silent`}
                    </p>
                  </div>
                  {/* Expand + single send */}
                  <button
                    onClick={() => setExpandedId(expanded ? null : it.prospectId)}
                    aria-label={expanded ? 'Collapse' : 'Expand'}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button
                    onClick={() => handleSendOne(it.prospectId)}
                    disabled={sending || !it.selected}
                    title={lang === 'fr' ? 'Envoyer uniquement celui-ci' : 'Send this one only'}
                    className="flex-shrink-0 flex items-center justify-center rounded-md"
                    style={{
                      width: 26, height: 26,
                      background: it.selected ? `rgba(${accent},0.18)` : 'transparent',
                      border: `1px solid rgba(${accent},${it.selected ? 0.35 : 0.12})`,
                      color: `rgba(${accent},${it.selected ? 0.95 : 0.4})`,
                      cursor: it.selected && !sending ? 'pointer' : 'not-allowed',
                      opacity: it.selected && !sending ? 1 : 0.5,
                      transition: 'all 150ms',
                    }}>
                    <Send size={11} />
                  </button>
                </div>
                {/* Expanded editor */}
                {expanded && (
                  <div className="px-4 pb-3 pt-0" style={{ marginLeft: 22 }}>
                    <label className="text-[9px] font-bold uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.65)' }}>
                      {lang === 'fr' ? 'Sujet' : 'Subject'}
                    </label>
                    <input type="text" value={it.subject}
                      onChange={(e) => updateField(it.prospectId, 'subject', e.target.value)}
                      className="w-full text-[12px] rounded-md px-2.5 py-1.5 outline-none mb-2"
                      style={{
                        background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                        color: darkMode ? '#e2e8f0' : '#1e293b',
                      }} />
                    <label className="text-[9px] font-bold uppercase tracking-wider block mb-1" style={{ color: darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.65)' }}>
                      {lang === 'fr' ? 'Corps' : 'Body'}
                    </label>
                    <textarea value={it.body}
                      onChange={(e) => updateField(it.prospectId, 'body', e.target.value)}
                      rows={8}
                      className="w-full text-[12px] rounded-md px-2.5 py-1.5 outline-none resize-y"
                      style={{
                        background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                        color: darkMode ? '#e2e8f0' : '#1e293b',
                        fontFamily: 'inherit', lineHeight: 1.5,
                      }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer — Send-all */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={handleSendAll}
            disabled={sending || selectedItems.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: `rgba(${accent},0.9)`, color: '#fff', boxShadow: `0 0 16px rgba(${accent},0.25)` }}>
            {sending
              ? <><Loader2 size={11} className="animate-spin" /> {lang === 'fr' ? 'Envoi en cours…' : 'Sending…'}</>
              : <><Send size={11} /> {lang === 'fr' ? `Envoyer ${selectedItems.length} sélectionné${selectedItems.length > 1 ? 's' : ''}` : `Send ${selectedItems.length} selected`}</>}
          </button>
          <span className="text-[10px] ml-auto" style={{ color: darkMode ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.65)' }}>
            {lang === 'fr' ? 'Délai 500ms entre chaque · anti-spam' : '500ms gap between sends · anti-spam'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Decision cards (logged / reminder / outcome-recorded) ────────────────────

const AGENT_COLOR_BY_KEY = {
  HORMOZI: '59,130,246',
  CARDONE: '239,68,68',
  ROBBINS: '139,92,246',
  GARYV:   '249,115,22',
  NAVAL:   '16,185,129',
  VOSS:    '71,107,175',
  SYNTHESIZER: '212,175,55',
  COORDINATOR: '148,163,184',
};

function formatDateShort(ts, lang) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' });
}

function DecisionLoggedCard({ message, darkMode, lang }) {
  const rgb = AGENT_COLOR_BY_KEY[message.agent] || '99,102,241';
  return (
    <div className="flex justify-start mb-3 px-1">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
        style={{
          background:    `rgba(${rgb},0.06)`,
          border:        `1px solid rgba(${rgb},0.2)`,
          color:         darkMode ? 'rgba(203,213,225,0.85)' : 'rgba(51,65,85,0.85)',
          maxWidth:      '88%',
        }}>
        <Flag size={11} style={{ color: `rgba(${rgb},0.9)`, flexShrink: 0 }} />
        <span className="font-semibold" style={{ color: `rgba(${rgb},0.95)` }}>
          {lang === 'fr' ? 'Décision enregistrée' : 'Decision logged'} · {formatDateShort(message.date, lang)}
        </span>
        <span className="truncate" style={{ opacity: 0.75 }}>— {message.decision}</span>
      </div>
    </div>
  );
}

function DecisionReminderCard({ message, darkMode, lang, onRecord }) {
  const [selectedOutcome, setSelectedOutcome] = useState(null); // 'positive' | 'neutral' | 'negative'
  const [comment, setComment] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (dismissed) return null;

  const rgb = AGENT_COLOR_BY_KEY[message.agent] || '99,102,241';
  const daysSince = Math.floor((Date.now() - Number(message.date || 0)) / 86_400_000);

  const outcomeOptions = [
    { key: 'positive', label: lang === 'fr' ? 'Positif' : 'Positive', color: '16,185,129', icon: CheckCircle },
    { key: 'neutral',  label: lang === 'fr' ? 'Neutre'  : 'Neutral',  color: '148,163,184', icon: Minus },
    { key: 'negative', label: lang === 'fr' ? 'Négatif' : 'Negative', color: '239,68,68',  icon: X },
  ];

  const handleSubmit = async () => {
    if (!selectedOutcome || submitting) return;
    setSubmitting(true);
    try {
      await onRecord?.(message.id, message.decisionId, selectedOutcome, comment.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex justify-start mb-4 px-1">
      <div className="w-full max-w-[88%] rounded-2xl overflow-hidden"
        style={{ background: darkMode ? 'rgba(8,12,22,0.9)' : 'rgba(248,250,252,0.95)', border: `1px solid rgba(${rgb},0.28)` }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: `rgba(${rgb},0.16)`, background: `rgba(${rgb},0.06)` }}>
          <div className="flex items-center gap-2">
            <Target size={12} style={{ color: `rgba(${rgb},0.95)` }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${rgb},0.95)` }}>
              {lang === 'fr' ? `Résultat — ${daysSince}j après` : `Outcome — ${daysSince}d later`}
            </span>
          </div>
          <button onClick={() => setDismissed(true)}
            aria-label={lang === 'fr' ? 'Fermer' : 'Dismiss'}
            className="opacity-40 hover:opacity-80 transition-opacity">
            <X size={11} style={{ color: darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' }} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-sm leading-snug" style={{ color: darkMode ? '#e2e8f0' : '#1e293b' }}>
            {lang === 'fr' ? 'T\'avais décidé :' : 'You decided:'}
            <span className="block mt-1 italic" style={{ color: darkMode ? 'rgba(203,213,225,0.9)' : 'rgba(71,85,105,0.95)' }}>
              "{message.decision}"
            </span>
          </p>
          <p className="text-xs" style={{ color: darkMode ? 'rgba(148,163,184,0.65)' : 'rgba(100,116,139,0.75)' }}>
            {lang === 'fr' ? 'Alors, résultat ?' : 'So, what happened?'}
          </p>

          <div className="flex gap-2">
            {outcomeOptions.map(({ key, label, color, icon: Icon }) => {
              const selected = selectedOutcome === key;
              return (
                <button key={key}
                  onClick={() => setSelectedOutcome(key)}
                  style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '8px 10px', borderRadius: 10,
                    background: selected ? `rgba(${color},0.15)` : 'transparent',
                    border:     `1px solid rgba(${color},${selected ? 0.45 : 0.2})`,
                    color:      selected ? `rgba(${color},0.98)` : (darkMode ? 'rgba(148,163,184,0.75)' : 'rgba(71,85,105,0.9)'),
                    fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 150ms',
                  }}>
                  <Icon size={11} />
                  {label}
                </button>
              );
            })}
          </div>

          {selectedOutcome && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={lang === 'fr' ? 'Commentaire (optionnel) — ce qui a marché, ce qui a foiré…' : 'Comment (optional) — what worked, what failed…'}
              rows={2}
              className="w-full text-xs rounded-md px-2.5 py-1.5 outline-none resize-none"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                color: darkMode ? '#e2e8f0' : '#1e293b',
                fontFamily: 'inherit',
              }} />
          )}
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={handleSubmit}
            disabled={!selectedOutcome || submitting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            style={{
              background: selectedOutcome ? `rgba(${rgb},0.9)` : 'transparent',
              color:      selectedOutcome ? '#fff' : (darkMode ? 'rgba(148,163,184,0.4)' : 'rgba(100,116,139,0.5)'),
              border:     selectedOutcome ? 'none' : `1px solid rgba(${rgb},0.2)`,
              boxShadow:  selectedOutcome ? `0 0 16px rgba(${rgb},0.2)` : 'none',
              cursor:     selectedOutcome && !submitting ? 'pointer' : 'not-allowed',
            }}>
            {submitting
              ? (lang === 'fr' ? 'Enregistrement…' : 'Saving…')
              : (lang === 'fr' ? 'Enregistrer' : 'Record')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecisionOutcomeRecordedCard({ message, darkMode, lang }) {
  const OUTCOME_RGB = {
    positive: '16,185,129',
    neutral:  '148,163,184',
    negative: '239,68,68',
  };
  const rgb = OUTCOME_RGB[message.outcome] || '148,163,184';
  const label = message.outcome === 'positive' ? (lang === 'fr' ? 'Positif' : 'Positive')
              : message.outcome === 'negative' ? (lang === 'fr' ? 'Négatif' : 'Negative')
              : (lang === 'fr' ? 'Neutre' : 'Neutral');

  return (
    <div className="flex justify-start mb-3 px-1">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
        style={{
          background: `rgba(${rgb},0.08)`,
          border:     `1px solid rgba(${rgb},0.28)`,
          color:      `rgba(${rgb},0.95)`,
          maxWidth:   '88%',
        }}>
        <CheckCircle size={12} />
        <span className="font-semibold">
          {lang === 'fr' ? `Résultat enregistré : ${label}` : `Outcome recorded: ${label}`}
        </span>
        {message.comment && (
          <span style={{ opacity: 0.85, fontStyle: 'italic', color: darkMode ? 'rgba(203,213,225,0.8)' : 'rgba(51,65,85,0.8)' }}>
            — "{message.comment}"
          </span>
        )}
      </div>
    </div>
  );
}


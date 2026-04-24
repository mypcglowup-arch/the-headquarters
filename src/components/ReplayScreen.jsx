import { useRef } from 'react';
import { ArrowLeft, Printer, Target } from 'lucide-react';
import { AGENT_CONFIG } from '../prompts.js';
import AgentAvatar from './AgentAvatar.jsx';

export default function ReplayScreen({ session, agentNames, agentPhotos, darkMode, onBack }) {
  const printRef = useRef(null);
  if (!session) return null;

  const { date, mode, messages = [], consensusLine, summary } = session;
  const dateStr = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  function handlePrint() {
    window.print();
  }

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${darkMode ? 'bg-gray-950 text-gray-100' : 'bg-[#F5F4F0] text-gray-900'}`}
      ref={printRef}
    >
      {/* ── Top bar ── */}
      <div className={`flex items-center justify-between px-4 py-3 border-b sticky top-0 z-10 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-[#F5F4F0] border-[#E8E6E0]'}`}>
        <button
          onClick={onBack}
          className={`flex items-center gap-2 text-sm font-medium transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="text-center">
          <p className={`text-xs font-bold uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Session Replay
          </p>
          <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            {dateStr} · {timeStr} · {mode}
          </p>
        </div>
        <button
          onClick={handlePrint}
          title="Print / Save as PDF"
          className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
        >
          <Printer size={15} />
        </button>
      </div>

      {/* ── Transcript ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

          {/* Consensus banner if present */}
          {consensusLine && (
            <div className={`rounded-2xl border-2 p-5 text-center mb-6 ${darkMode ? 'bg-emerald-950/60 border-emerald-700' : 'bg-emerald-50 border-emerald-400'}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${darkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>
                <Target size={10} className="inline mr-1.5" style={{ verticalAlign: 'middle' }} />Session Consensus
              </p>
              <p className={`text-base font-bold leading-snug ${darkMode ? 'text-emerald-100' : 'text-emerald-900'}`}>
                {consensusLine}
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className={`text-xs px-3 py-1 rounded-full ${darkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                    {msg.content}
                  </span>
                </div>
              );
            }

            if (msg.type === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-800 text-white'}`}>
                    {msg.content}
                  </div>
                </div>
              );
            }

            if (msg.type === 'agent') {
              const config  = AGENT_CONFIG[msg.agent] || AGENT_CONFIG.SYNTHESIZER;
              const name    = agentNames?.[msg.agent] || msg.agent;
              const photo   = agentPhotos?.[msg.agent];
              return (
                <div key={msg.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AgentAvatar agentKey={msg.agent} photo={photo} size="sm" />
                    <span className={`text-xs font-bold uppercase tracking-wide ${config.textColor}`}>{name}</span>
                  </div>
                  <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed border-l-2 ${config.borderColor} ${darkMode ? `${config.bgColor} text-gray-200` : 'bg-gray-50 text-gray-800'}`}>
                    <ReplayText content={msg.content} />
                  </div>
                </div>
              );
            }
            return null;
          })}

          {/* Key decisions footer */}
          {summary?.keyDecisions?.length > 0 && (
            <div className={`mt-8 pt-6 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Key Decisions This Session
              </p>
              <ul className="space-y-1.5">
                {summary.keyDecisions.map((d, i) => (
                  <li key={i} className={`flex items-start gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <span className={`mt-0.5 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>·</span>
                    <span>{typeof d === 'string' ? d : d.decision}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pb-8" />
        </div>
      </div>
    </div>
  );
}

// Minimal markdown renderer (reuses same logic as FormattedText)
function ReplayText({ content }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean);
        if (!lines.length) return null;
        if (lines[0].match(/^[-*]\s/)) {
          return (
            <ul key={i} className="space-y-0.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2 items-start">
                  <span className="opacity-40">·</span>
                  <span dangerouslySetInnerHTML={{ __html: inlineHtml(l.replace(/^[-*]\s+/, '')) }} />
                </li>
              ))}
            </ul>
          );
        }
        if (lines[0].match(/^\d+\.\s/)) {
          return (
            <ol key={i} className="space-y-0.5">
              {lines.map((l, j) => {
                const m = l.match(/^(\d+)\.\s+(.*)/);
                return (
                  <li key={j} className="flex gap-2 items-start">
                    <span className="opacity-50 font-mono text-xs min-w-[1rem]">{m ? m[1] : j + 1}.</span>
                    <span dangerouslySetInnerHTML={{ __html: inlineHtml(m ? m[2] : l) }} />
                  </li>
                );
              })}
            </ol>
          );
        }
        return (
          <p key={i} dangerouslySetInnerHTML={{
            __html: lines.map((l) => inlineHtml(l)).join('<br />')
          }} />
        );
      })}
    </div>
  );
}

function inlineHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded text-xs font-mono bg-black/20">$1</code>');
}

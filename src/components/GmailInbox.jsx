import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X, Send, Copy, Check, Archive, Mail } from 'lucide-react';
import { connectGmail, getGmailTokens, clearGmailTokens } from '../utils/gmailAuth.js';
import { gmailService } from '../utils/gmailService.js';
import { analyzeEmail as analyzeEmailAPI, draftEmailReply } from '../api.js';
import { AGENT_CONFIG } from '../prompts.js';
import { supabase } from '../lib/supabase.js';
import { t } from '../i18n.js';

// ── Design tokens (mirrors DashboardScreen) ───────────────────────────────────
const D = {
  bg1: '#13131A', bg2: '#1A1A24', bg3: '#1E1E2A',
  border: 'rgba(255,255,255,0.06)',
  accent: '#6366F1', green: '#10B981', amber: '#F59E0B', red: '#EF4444',
  text0: '#F0EEF8', text1: '#9B99A8', text2: '#5A5870',
};
const L = {
  bg1: '#FFFFFF', bg2: '#F7F6FA', bg3: '#EEEDF5',
  border: 'rgba(0,0,0,0.07)',
  accent: '#6366F1', green: '#10B981', amber: '#F59E0B', red: '#EF4444',
  text0: '#0D0D12', text1: '#5A5870', text2: '#9B99A8',
};

const PRIORITY_STYLE = {
  haute:   { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', label: '🔴 Haute' },
  normale: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', label: '🟡 Normale' },
  faible:  { bg: 'rgba(16,185,129,0.12)', text: '#10b981', label: '🟢 Faible' },
};
const TYPE_STYLE = {
  prospect:    { bg: 'rgba(6,182,212,0.12)',   text: '#06b6d4' },
  client:      { bg: 'rgba(16,185,129,0.12)',  text: '#10b981' },
  admin:       { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8' },
  opportunite: { bg: 'rgba(99,102,241,0.12)',  text: '#6366f1' },
  autre:       { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function suggestAgent(from, subject) {
  const t = `${from} ${subject}`.toLowerCase();
  if (/invoice|facture|paiement|payment|billing/.test(t))             return 'HORMOZI';
  if (/instagram|tiktok|content|post|social|réseaux|media/.test(t))  return 'GARYV';
  if (/négociation|negotiat|deal|proposition|contrat/.test(t))       return 'VOSS';
  if (/urgent|asap|deadline|immédiat/.test(t))                       return 'CARDONE';
  if (/partner|équipe|hiring|collaboration|team/.test(t))            return 'ROBBINS';
  return 'VOSS';
}

function getInitials(from) {
  const name = (from || '').replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2) || 'XX').toUpperCase();
}

function fmtDate(dateStr) {
  try {
    const d    = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    if (diff < 3_600_000)  return `${Math.round(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

const GmailLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2"
      fill="rgba(234,67,53,0.1)" stroke="#EA4335" strokeWidth="1.5" />
    <polyline points="2,6 12,14 22,6"
      fill="none" stroke="#EA4335" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

// ── Main component ────────────────────────────────────────────────────────────
export default function GmailInbox({ darkMode, lang = 'fr' }) {
  const c         = darkMode ? D : L;
  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_GMAIL_CLIENT_ID;

  // ── Core state ─────────────────────────────────────────────────────────────
  const [tokens,        setTokens]       = useState(() => getGmailTokens());
  const [emails,        setEmails]       = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [connecting,    setConnecting]   = useState(false);
  const [connError,     setConnError]    = useState(null);
  const [fetchError,    setFetchError]   = useState(null);

  // ── Panel state ─────────────────────────────────────────────────────────────
  const [selected,      setSelected]     = useState(null);
  const [analysis,      setAnalysis]     = useState(null);
  const [analyzing,     setAnalyzing]    = useState(false);
  const [draft,         setDraft]        = useState('');
  const [draftLoading,  setDraftLoading] = useState(false);
  const [draftAgent,    setDraftAgent]   = useState(null);
  const [editingDraft,  setEditingDraft] = useState(false);
  const [copied,        setCopied]       = useState(false);

  // ── Send modal state ────────────────────────────────────────────────────────
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending,       setSending]      = useState(false);
  const [sendError,     setSendError]    = useState(null);
  const [sentOk,        setSentOk]       = useState(false);

  // ── Proactive monitoring ────────────────────────────────────────────────────
  const [proAlert, setProAlert]  = useState(null);
  const seenIdsRef = useRef(new Set());
  const monitorRef = useRef(null);

  // Load emails + start monitoring when connected
  useEffect(() => {
    if (!tokens?.access_token) return;
    loadEmails(tokens.access_token);
    startMonitor(tokens.access_token);
    return () => { if (monitorRef.current) clearInterval(monitorRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens?.access_token]);

  // Auto-analyze when email panel opens
  useEffect(() => {
    if (!selected) return;
    setAnalysis(null);
    setAnalyzing(true);
    analyzeEmailAPI(
      selected.from,
      selected.subject,
      selected.snippet || selected.body.slice(0, 200),
      lang
    )
      .then((r) => {
        setAnalysis(r);
        setDraftAgent(r?.recommendedAgent || suggestAgent(selected.from, selected.subject));
      })
      .catch(() => setDraftAgent(suggestAgent(selected.from, selected.subject)))
      .finally(() => setAnalyzing(false));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss proactive alert after 30 s
  useEffect(() => {
    if (!proAlert) return;
    const t = setTimeout(() => setProAlert(null), 30_000);
    return () => clearTimeout(t);
  }, [proAlert]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleConnect() {
    setConnecting(true);
    setConnError(null);
    try {
      const t = await connectGmail(CLIENT_ID);
      setTokens(t);
    } catch (err) {
      setConnError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    clearGmailTokens();
    setTokens(null);
    setEmails([]);
    setSelected(null);
    setAnalysis(null);
    setDraft('');
    if (monitorRef.current) clearInterval(monitorRef.current);
  }

  async function loadEmails(token) {
    setLoadingEmails(true);
    setFetchError(null);
    try {
      const result = await gmailService.getRecentEmails(token, 10);
      setEmails(result);
      result.forEach((e) => seenIdsRef.current.add(e.id));
    } catch (err) {
      if (err.message === 'UNAUTHORIZED') {
        clearGmailTokens();
        setTokens(null);
        setFetchError('Session expirée — reconnectez Gmail.');
      } else {
        setFetchError('Impossible de charger les emails.');
      }
    } finally {
      setLoadingEmails(false);
    }
  }

  function openEmail(email) {
    setSelected(email);
    setDraft('');
    setEditingDraft(false);
    setCopied(false);
    setSentOk(false);
    setSendError(null);
    if (tokens?.access_token && email.isUnread) {
      gmailService.markAsRead(tokens.access_token, email.id).catch(() => {});
    }
  }

  async function handleDraft() {
    const agent = draftAgent || suggestAgent(selected.from, selected.subject);
    setDraftLoading(true);
    setDraft('');
    setEditingDraft(false);
    try {
      const text = await draftEmailReply(
        agent,
        selected.from,
        selected.subject,
        selected.body || selected.snippet,
        lang
      );
      setDraft(text);
      setDraftAgent(agent);
    } catch {
      setDraft('');
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setSendError(null);
    try {
      const to      = gmailService.getFromEmail(selected.from);
      const subject = selected.subject.startsWith('Re:')
        ? selected.subject
        : `Re: ${selected.subject}`;

      await gmailService.sendEmail(tokens.access_token, to, subject, draft, selected.threadId);

      // Log to Supabase
      if (supabase) {
        supabase.from('email_actions').insert({
          type:      'email_sent',
          to_email:  to,
          subject,
          agent:     draftAgent,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      setShowSendModal(false);
      setSentOk(true);
      setSelected(null);
      setDraft('');
      setTimeout(() => loadEmails(tokens.access_token), 1500);
    } catch (err) {
      setSendError(err.message || 'Erreur d\'envoi — réessayez.');
    } finally {
      setSending(false);
    }
  }

  function startMonitor(token) {
    if (monitorRef.current) clearInterval(monitorRef.current);
    monitorRef.current = setInterval(async () => {
      try {
        const fresh    = await gmailService.getRecentEmails(token, 10);
        const newEmails = fresh.filter((e) => !seenIdsRef.current.has(e.id));
        if (!newEmails.length) return;

        newEmails.forEach((e) => seenIdsRef.current.add(e.id));

        // Merge into list
        setEmails((prev) => {
          const merged = [...newEmails, ...prev];
          const seen   = new Set();
          return merged
            .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
            .slice(0, 5);
        });

        // Check urgency — alert on first high-urgency email
        for (const email of newEmails) {
          const r = await analyzeEmailAPI(email.from, email.subject, email.snippet, lang).catch(() => null);
          if (r?.urgency >= 8) {
            setProAlert({
              email,
              agent:   r.recommendedAgent || 'VOSS',
              message: r.suggestedAction || `Email urgent de ${gmailService.getFromName(email.from)}`,
            });
            break;
          }
        }
      } catch { /* silent */ }
    }, 5 * 60 * 1000);
  }

  // ── Render: not connected ───────────────────────────────────────────────────
  if (!tokens) {
    return (
      <div style={{
        background: c.bg1, border: `1px solid ${c.border}`,
        borderRadius: 14, padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <GmailLogo />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: c.text0 }}>{t('gmail.connect', lang)}</p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: c.text2 }}>
            {lang === 'fr' ? 'Lecture, rédaction et envoi avec approbation' : 'Read, draft and send with approval'}
          </p>
          {connError && (
            <p style={{ margin: '5px 0 0', fontSize: 11, color: '#ef4444' }}>{connError}</p>
          )}
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            padding: '7px 16px', borderRadius: 8,
            border: `1px solid ${c.accent}`,
            background: 'transparent',
            color: c.accent,
            fontSize: 12, fontWeight: 600,
            cursor: connecting ? 'not-allowed' : 'pointer',
            opacity: connecting ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}
        >
          {connecting && (
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              border: `2px solid ${c.accent}`, borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite', display: 'inline-block',
            }} />
          )}
          {connecting ? t('gmail.connecting', lang) : t('gmail.connect', lang)}
        </button>
      </div>
    );
  }

  // ── Render: connected inbox ─────────────────────────────────────────────────
  return (
    <div style={{
      background: c.bg1, border: `1px solid ${c.border}`,
      borderRadius: 14, padding: '18px 20px',
    }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GmailLogo />
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.text2 }}>
              {t('gmail.inbox', lang)}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.green, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: c.text1 }}>{tokens.email || 'Gmail'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {sentOk && (
            <span style={{ fontSize: 11, color: D.green, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={11} /> {t('gmail.sent', lang)}
            </span>
          )}
          <button
            onClick={() => loadEmails(tokens.access_token)}
            disabled={loadingEmails}
            title={lang === 'fr' ? 'Actualiser' : 'Refresh'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text2, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={13} style={{ animation: loadingEmails ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={handleDisconnect}
            style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 6 }}
          >
            {t('gmail.disconnect', lang)}
          </button>
        </div>
      </div>

      {/* Error */}
      {fetchError && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 12, marginBottom: 12,
        }}>
          {fetchError}
        </div>
      )}

      {/* Email list */}
      {loadingEmails ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              height: 62, borderRadius: 10,
              background: c.bg2, border: `1px solid ${c.border}`,
              opacity: 0.4 + i * 0.1,
              animation: 'shimmer 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
      ) : emails.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: c.text2 }}>
          <Mail size={24} style={{ marginBottom: 8, opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
          <p style={{ margin: 0, fontSize: 12 }}>{t('gmail.empty', lang)}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {emails.map((email) => (
            <EmailRow
              key={email.id}
              email={email}
              c={c}
              darkMode={darkMode}
              onClick={() => openEmail(email)}
            />
          ))}
        </div>
      )}

      {/* Email detail panel */}
      {selected && createPortal(
        <EmailDetailPanel
          email={selected}
          analysis={analysis}
          analyzing={analyzing}
          draft={draft}
          draftLoading={draftLoading}
          draftAgent={draftAgent}
          editingDraft={editingDraft}
          setEditingDraft={setEditingDraft}
          copied={copied}
          c={c}
          darkMode={darkMode}
          lang={lang}
          onClose={() => { setSelected(null); setAnalysis(null); setDraft(''); }}
          onDraft={handleDraft}
          onDraftChange={setDraft}
          onCopy={() => {
            navigator.clipboard.writeText(draft).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          onSend={() => { setSendError(null); setShowSendModal(true); }}
        />,
        document.body
      )}

      {/* Send confirmation modal */}
      {showSendModal && selected && createPortal(
        <SendConfirmModal
          email={selected}
          draft={draft}
          draftAgent={draftAgent}
          sending={sending}
          sendError={sendError}
          c={c}
          darkMode={darkMode}
          lang={lang}
          onConfirm={handleSend}
          onCancel={() => { setShowSendModal(false); setSendError(null); }}
        />,
        document.body
      )}

      {/* Proactive alert */}
      {proAlert && createPortal(
        <ProactiveAlert
          alert={proAlert}
          darkMode={darkMode}
          c={c}
          lang={lang}
          onView={() => { setProAlert(null); openEmail(proAlert.email); }}
          onDismiss={() => setProAlert(null)}
        />,
        document.body
      )}
    </div>
  );
}

// ── EmailRow ──────────────────────────────────────────────────────────────────
function EmailRow({ email, c, darkMode, onClick }) {
  const [hovered, setHovered] = useState(false);
  const agent    = suggestAgent(email.from, email.subject);
  const agentCfg = AGENT_CONFIG[agent];
  const rgb      = agentCfg?.glowRgb || '99,102,241';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 10,
        background: hovered
          ? (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
          : c.bg2,
        border: `1px solid ${c.border}`,
        cursor: 'pointer', transition: 'background 0.15s',
      }}
    >
      {/* Sender avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: `rgba(${rgb}, 0.18)`,
        color: `rgb(${rgb})`,
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {getInitials(email.from)}
      </div>

      {/* Center */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: email.isUnread ? 600 : 400,
            color: c.text0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {gmailService.getFromName(email.from)}
          </span>
          {email.isUnread && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: c.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email.subject}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: c.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email.snippet}
        </p>
      </div>

      {/* Right: date + agent badge */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <span style={{ fontSize: 11, color: c.text2 }}>{fmtDate(email.date)}</span>
        <span style={{
          fontSize: 10, fontWeight: 600,
          padding: '2px 8px', borderRadius: 20,
          background: `rgba(${rgb}, 0.12)`,
          color: `rgb(${rgb})`,
        }}>
          {agentCfg?.emoji || ''} {agent}
        </span>
      </div>
    </div>
  );
}

// ── EmailDetailPanel ──────────────────────────────────────────────────────────
function EmailDetailPanel({
  email, analysis, analyzing,
  draft, draftLoading, draftAgent, editingDraft, setEditingDraft,
  copied,
  c, darkMode, lang = 'fr',
  onClose, onDraft, onDraftChange, onCopy, onSend,
}) {
  const agentCfg = AGENT_CONFIG[draftAgent] || AGENT_CONFIG.VOSS;
  const rgb      = agentCfg?.glowRgb || '6,182,212';
  const accent   = `rgb(${rgb})`;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 290,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
        }}
      />
      {/* Side panel */}
      <div
        className="animate-panel-in"
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 300,
          width: 480, maxWidth: '96vw',
          background: darkMode ? '#13131A' : '#FFFFFF',
          borderLeft: `1px solid ${c.border}`,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: '16px 20px', flexShrink: 0,
          borderBottom: `1px solid ${c.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              margin: 0, fontSize: 14, fontWeight: 600, color: c.text0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360,
            }}>
              {email.subject}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: c.text1 }}>
              {gmailService.getFromName(email.from)} · {gmailService.getFromEmail(email.from)} · {fmtDate(email.date)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text2, padding: 4, borderRadius: 6, flexShrink: 0, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px' }}>

          {/* Email body */}
          <div style={{
            background: c.bg2, borderRadius: 10, padding: '14px 16px', marginBottom: 16,
            fontSize: 13, color: c.text1, lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 220, overflowY: 'auto',
            border: `1px solid ${c.border}`,
          }}>
            {email.body || email.snippet || '(corps vide)'}
          </div>

          {/* Analysis badges */}
          <div style={{ marginBottom: 16, minHeight: 32 }}>
            {analyzing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: c.text2 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: `2px solid ${c.text2}`, borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite', display: 'inline-block', flexShrink: 0,
                }} />
                {t('gmail.analyzing', lang)}
              </div>
            ) : analysis ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' }}>
                {/* Priority */}
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  background: (PRIORITY_STYLE[analysis.priority] || PRIORITY_STYLE.normale).bg,
                  color:      (PRIORITY_STYLE[analysis.priority] || PRIORITY_STYLE.normale).text,
                }}>
                  {(PRIORITY_STYLE[analysis.priority] || PRIORITY_STYLE.normale).label}
                </span>
                {/* Type */}
                {analysis.type && (
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                    background: (TYPE_STYLE[analysis.type] || TYPE_STYLE.autre).bg,
                    color:      (TYPE_STYLE[analysis.type] || TYPE_STYLE.autre).text,
                    textTransform: 'capitalize',
                  }}>
                    {analysis.type}
                  </span>
                )}
                {/* Urgency */}
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(255,255,255,0.05)', color: c.text2,
                }}>
                  {t('gmail.urgency', lang)} {analysis.urgency}/10
                </span>
                {/* Agent recommendation */}
                {analysis.recommendedAgent && analysis.suggestedAction && (
                  <p style={{ width: '100%', margin: '5px 0 0', fontSize: 11, color: c.text1, lineHeight: 1.5 }}>
                    <span style={{ color: accent, fontWeight: 600 }}>
                      {AGENT_CONFIG[analysis.recommendedAgent]?.emoji || ''} {analysis.recommendedAgent}
                    </span>
                    {' '}{lang === 'fr' ? 'recommande :' : 'recommends:'} {analysis.suggestedAction}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* Draft section */}
          {!draft && !draftLoading && (
            <button
              onClick={onDraft}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                background: `rgba(${rgb}, 0.07)`,
                border: `1px solid rgba(${rgb}, 0.3)`,
                color: accent, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.15s',
              }}
            >
              <Send size={14} />
              {t('gmail.draftWith', lang)} {agentCfg?.emoji || ''} {draftAgent || 'VOSS'}
            </button>
          )}

          {draftLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10,
              background: c.bg2, border: `1px solid ${c.border}`,
              fontSize: 12, color: c.text2,
            }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: `2px solid ${c.text2}`, borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite', display: 'inline-block',
              }} />
              {agentCfg?.emoji || ''} {draftAgent} {lang === 'fr' ? 'rédige votre réponse...' : 'is drafting your reply...'}
            </div>
          )}

          {draft && !draftLoading && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: accent }}>
                  {agentCfg?.emoji || ''} {t('gmail.draftWith', lang)} {draftAgent}
                </span>
                <button
                  onClick={onDraft}
                  style={{ fontSize: 10, color: c.text2, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                >
                  ↻ {lang === 'fr' ? 'Régénérer' : 'Regenerate'}
                </button>
              </div>
              <textarea
                value={draft}
                onChange={(e) => { onDraftChange(e.target.value); setEditingDraft(true); }}
                readOnly={!editingDraft}
                rows={6}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px', borderRadius: 10,
                  fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit',
                  background: c.bg2, color: c.text0,
                  border: `1px solid ${editingDraft ? accent : c.border}`,
                  outline: 'none', resize: 'vertical',
                  transition: 'border-color 0.15s',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setEditingDraft((e) => !e)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    background: c.bg2, border: `1px solid ${c.border}`, color: c.text1, cursor: 'pointer',
                  }}
                >
                  {editingDraft ? (lang === 'fr' ? 'Verrouiller' : 'Lock') : t('gmail.modify', lang)}
                </button>
                <button
                  onClick={onCopy}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    background: copied ? 'rgba(16,185,129,0.1)' : c.bg2,
                    border: `1px solid ${copied ? D.green : c.border}`,
                    color: copied ? D.green : c.text1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? t('gmail.copied', lang) : t('gmail.copy', lang)}
                </button>
                <button
                  onClick={onSend}
                  style={{
                    flex: 1.5, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  <Send size={12} />
                  {t('gmail.send', lang)} →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '12px 20px 18px', flexShrink: 0,
          borderTop: `1px solid ${c.border}`,
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '9px', borderRadius: 8,
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <Archive size={12} />
            {t('gmail.dismiss', lang)}
          </button>
        </div>
      </div>
    </>
  );
}

// ── SendConfirmModal ──────────────────────────────────────────────────────────
function SendConfirmModal({ email, draft, draftAgent, sending, sendError, c, darkMode, lang = 'fr', onConfirm, onCancel }) {
  const replyTo = gmailService.getFromEmail(email.from);
  const subject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, zIndex: 390, background: 'rgba(0,0,0,0.55)' }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 400,
        width: 420, maxWidth: '92vw',
        background: darkMode ? '#1A1A24' : '#FFFFFF',
        border: `1px solid ${c.border}`,
        borderRadius: 14, padding: '20px 24px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        <p style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: c.text0 }}>
          {t('gmail.confirmSend', lang)}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: c.text1 }}>
            <span style={{ color: c.text2 }}>{t('gmail.from', lang)} : </span>{replyTo}
          </div>
          <div style={{ fontSize: 12, color: c.text1 }}>
            <span style={{ color: c.text2 }}>{t('gmail.subject', lang)} : </span>{subject}
          </div>
          {draftAgent && (
            <div style={{ fontSize: 12, color: c.text1 }}>
              <span style={{ color: c.text2 }}>{t('gmail.recommended', lang)} : </span>
              {AGENT_CONFIG[draftAgent]?.emoji || ''} {draftAgent}
            </div>
          )}
          <div style={{
            marginTop: 6, padding: '10px 12px', borderRadius: 8,
            background: c.bg2, border: `1px solid ${c.border}`,
            fontSize: 12, color: c.text1, lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          }}>
            {draft.slice(0, 150)}{draft.length > 150 ? '…' : ''}
          </div>
        </div>
        {sendError && (
          <p style={{ fontSize: 11, color: '#ef4444', marginBottom: 12 }}>
            {t('gmail.error', lang)} : {sendError}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={sending}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              background: c.bg2, border: `1px solid ${c.border}`,
              color: c.text1, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {t('gmail.cancel', lang)}
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            style={{
              flex: 2, padding: '10px', borderRadius: 8,
              background: '#6366f1', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: sending ? 'not-allowed' : 'pointer',
              opacity: sending ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {sending && (
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff',
                animation: 'spin 0.7s linear infinite', display: 'inline-block',
              }} />
            )}
            {sending ? t('gmail.sending', lang) : t('gmail.confirmSend', lang)}
          </button>
        </div>
      </div>
    </>
  );
}

// ── ProactiveAlert (bottom-left, Step 8) ─────────────────────────────────────
function ProactiveAlert({ alert, darkMode, c, lang = 'fr', onView, onDismiss }) {
  const agentCfg = AGENT_CONFIG[alert.agent] || AGENT_CONFIG.VOSS;
  const rgb      = agentCfg?.glowRgb || '99,102,241';
  const accent   = `rgb(${rgb})`;
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((p) => {
        if (p <= 1) { clearInterval(t); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="animate-card-in"
      style={{
        position: 'fixed', bottom: 28, left: 28, zIndex: 500,
        width: 300,
        background: darkMode ? '#1A1A24' : '#FFFFFF',
        border: `1px solid rgba(${rgb}, 0.4)`,
        borderRadius: 12, padding: '12px 16px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(${rgb}, 0.08)`,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        {/* Agent avatar with pulse */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: `rgba(${rgb}, 0.15)`,
          color: accent, fontSize: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'dotPulse 2s ease-in-out infinite',
        }}>
          {agentCfg?.emoji || '🤖'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: accent }}>
            {alert.agent}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: darkMode ? '#9B99A8' : '#5A5870', lineHeight: 1.4 }}>
            {alert.message}
          </p>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text2, padding: 2, flexShrink: 0, display: 'flex' }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onView}
          style={{
            flex: 1, padding: '7px', borderRadius: 7,
            background: `rgba(${rgb}, 0.1)`, border: `1px solid rgba(${rgb}, 0.25)`,
            color: accent, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('gmail.viewEmail', lang)}
        </button>
        <button
          onClick={onDismiss}
          style={{
            flex: 1, padding: '7px', borderRadius: 7,
            background: c.bg2, border: `1px solid ${c.border}`,
            color: c.text2, fontSize: 11, cursor: 'pointer',
          }}
        >
          {t('gmail.dismiss', lang)} ({timeLeft}s)
        </button>
      </div>
    </div>
  );
}

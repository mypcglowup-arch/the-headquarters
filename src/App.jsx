import { useState, useEffect, useRef } from 'react';
import { runSession, archiveSession, callConsensus, getDailyQuote, getMomentumMirror, generateMondayReport, callClaudeStream, draftEmailReply, analyzeEmail, extractCalendarEvent, extractPipelineAction, extractDashboardUpdate, generateMemoryRecap, generateMorningBriefing, extractBatchFollowupIntent, generateFollowupMessage, detectMeetingPatterns, generateAgentOpening, generateFilRouge, analyzeInterjection, generateAnomalyAlert } from './api.js';
import { getMaturityPhase, pickBestPattern, markPatternFired, pruneCooldowns } from './utils/meetingRoom.js';
import { updateTopicTracker, getStaleTopics } from './utils/topicTracker.js';
import { pickTopAnomaly, markAxisFired, getWeekWindows } from './utils/anomalyDetector.js';
import { t, detectDefaultLang } from './i18n.js';
import { DEFAULT_AGENT_NAMES, COMMERCIAL_MODE, AGENT_CONFIG } from './prompts.js';
import { playDing } from './utils/sound.js';
import { updateStreak } from './utils/streak.js';
import { logAppOpen, logSessionStart } from './utils/momentum.js';
import { saveSession, formatHistoryContext, loadHistory } from './utils/sessionHistory.js';
import { useAutoSave, mergeSaveStatus } from './hooks/useAutoSave.js';
import { syncSession, syncDecisions, syncImprovementItem, syncImprovementStatus, syncFeedback, syncMomentum, syncAgentNames, syncExpense, syncOneTimeRevenue, syncRetainer, syncRetainerDelete, syncDashboardState, fetchDashboardState, syncFollowupLog, fetchWeeklyFollowups, fetchWeeklyOneTimeRevenues, fetchWeeklyRetainerChanges } from './lib/sync.js';
import { searchMemories, addSessionMemory, addArchivistMemory, fetchMemoriesForRecap, isMem0Enabled } from './lib/mem0.js';
import { getDayGreeting } from './utils/greeting.js';
import {
  getCalendarToken, clearCalendarToken,
  connectGoogleCalendar, fetchCalendarEvents, formatCalendarContext,
  createCalendarEvent,
} from './utils/gcal.js';
import { isGmailConnected, getGmailTokens, clearGmailTokens, connectGmail } from './utils/gmailAuth.js';
import { gmailService } from './utils/gmailService.js';
import { startGmailWatcher, clearSeenIds } from './utils/gmailWatcher.js';
import { registerServiceWorker, showLocalNotification, requestNotificationPermission } from './utils/pwa.js';
import { speak as ttsSpeak, cancelSpeech, isTTSSupported } from './utils/voice.js';
import { computePulseScore, formatPulseContext } from './utils/pulseScore.js';
import { loadWins, saveWin, formatWinsContext } from './utils/wins.js';
import { loadAgentDepth, updateAgentDepth } from './utils/agentDepth.js';
import { logEmotionState, formatEmotionContext } from './utils/emotionLog.js';
import { checkNotifications, dismissNotification, trackFirstOpen } from './utils/notifications.js';
import Header from './components/Header.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import ChatScreen from './components/ChatScreen.jsx';
import JournalScreen from './components/JournalScreen.jsx';
import DecisionsScreen from './components/DecisionsScreen.jsx';
import DashboardScreen from './components/DashboardScreen.jsx';
import ProspectsScreen from './components/ProspectsScreen.jsx';
import ReplayScreen from './components/ReplayScreen.jsx';
import LibraryScreen from './components/LibraryScreen.jsx';
import WorkflowBuilder from './components/WorkflowBuilder.jsx';
import PulseScoreCard from './components/PulseScoreCard.jsx';
import DailyCheckIn, { hasCheckedInToday } from './components/DailyCheckIn.jsx';
import ScenarioPicker from './components/ScenarioPicker.jsx';
import AgentPing from './components/AgentPing.jsx';
import ContentGenerator from './components/ContentGenerator.jsx';
import WeeklyReport from './components/WeeklyReport.jsx';
import ProspectAnalyzer from './components/ProspectAnalyzer.jsx';
import MilestoneCelebration, { checkMilestone } from './components/MilestoneCelebration.jsx';
import GuidedTour, { TourLauncher, hasTourBeenCompleted, markTourDone } from './components/GuidedTour.jsx';
import GlobalFloatingInput from './components/GlobalFloatingInput.jsx';
import ToastStack from './components/ToastStack.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import { useToast } from './hooks/useToast.js';

const SESSION_MODE_LABELS = {
  quick:       'Quick Advice',
  strategic:   'Strategic Session',
  silent:      'Silent Mode',
  focus:       'Focus Mode',
  architect:   'Architect Mode',
  prepCall:    'Prep a Call',
  negotiation: 'Negotiation Sim',
  analysis:    'Convo Analysis',
  debate:      'Mode Débat',
};

function BackToChatBar({ darkMode, onBack }) {
  return (
    <button
      onClick={onBack}
      className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border-b transition-colors ${
        darkMode
          ? 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-200 hover:bg-gray-800'
          : 'bg-[#F5F4F0] border-[#E8E6E0] text-gray-400 hover:text-gray-700 hover:bg-[#ECEAE4]'
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
      Back to conversation
    </button>
  );
}

function checkPatternAlert(history) {
  if (history.length < 3) return null;
  const recent = history.slice(0, 5);
  const keywords = ['prospect', 'outreach', 'contact', 'pipeline', 'call', 'dm', 'message', 'client', 'lead'];
  const hasProspecting = recent.some((session) =>
    session.messages?.some((m) => keywords.some((kw) => m.content?.toLowerCase().includes(kw)))
  );
  if (!hasProspecting) {
    return `No prospecting activity detected in your last ${recent.length} sessions.\n\nYour pipeline doesn't fill itself. When did you last reach out to a prospect? Fix that number today — not tomorrow.`;
  }
  return null;
}

const LS_JOURNAL   = 'qg_journal_v1';
const LS_PHOTOS    = 'qg_agent_photos_v1';
const LS_NAMES     = 'qg_agent_names_v1';
const LS_COUNT     = 'qg_session_count_v1';
const LS_SOUND     = 'qg_sound_enabled_v1';
const LS_VOICE     = 'qg_voice_mode_v1';
const LS_LAST_SPOKE = 'qg_agent_last_spoke_v1';
const LS_DECISIONS  = 'qg_decisions_v1';
const LS_DASHBOARD  = 'qg_dashboard_v1';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDashboardContext(data) {
  if (!data) return null;
  const { monthlyRevenue = [], retainers = [], oneTimeRevenues = [], pipeline = {}, annualGoal = 50000 } = data;
  const totalRevenue  = monthlyRevenue.reduce((s, m) => s + (m.revenue  || 0), 0);
  const totalExpenses = monthlyRevenue.reduce((s, m) => s + (m.expenses || 0), 0);
  const totalMRR      = retainers.reduce((s, r) => s + (r.amount || 0), 0);
  const goalPct       = annualGoal > 0 ? Math.min(100, Math.round((totalRevenue / annualGoal) * 100)) : 0;
  const monthlyTarget = annualGoal > 0 ? Math.round(annualGoal / 12) : 0;

  const revenueStr  = monthlyRevenue.map((m) => `${m.month}: $${m.revenue  || 0}`).join(', ');
  const expenseStr  = monthlyRevenue.map((m) => `${m.month}: $${m.expenses || 0}`).join(', ');
  const retainerStr = retainers.length > 0
    ? retainers.map((r) => `${r.name || 'Client'} ($${r.amount || 0}/mo)`).join(', ')
    : 'None';

  // Top clients — ranked by current monthly value (retainers) or recent one-time (last 90 days)
  const cutoff = Date.now() - 90 * 86_400_000;
  const recentOneTime = (oneTimeRevenues || [])
    .filter((e) => e && Number(e.amount) > 0 && new Date(e.date || 0).getTime() >= cutoff);

  const topClientLines = [];
  const rankedRetainers = [...retainers]
    .filter((r) => r && Number(r.amount) > 0)
    .sort((a, b) => (b.amount || 0) - (a.amount || 0));
  rankedRetainers.forEach((r) => {
    const started = r.startedAt ? new Date(r.startedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'unknown';
    topClientLines.push(`  - ${r.name || 'Client'}: $${r.amount}/mo retainer (since ${started})`);
  });
  const rankedOneTime = [...recentOneTime].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  rankedOneTime.forEach((e) => {
    const d = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    topClientLines.push(`  - ${e.clientName || 'Unknown client'}: $${e.amount} one-time (${d})`);
  });
  const topClientsBlock = topClientLines.length > 0
    ? `\nTOP CLIENTS (ranked by current monthly value — use this if Samuel asks about "my top-paying client" / "mon client le plus payant"):\n${topClientLines.join('\n')}`
    : '';

  return `SAMUEL'S CURRENT FINANCIAL DATA (read from his dashboard — reference these numbers naturally in advice):
MRR: $${totalMRR.toLocaleString()}
YTD Revenue: $${totalRevenue.toLocaleString()}
YTD Expenses: $${totalExpenses.toLocaleString()}
Annual Goal Progress: ${goalPct}% of $${annualGoal.toLocaleString()} goal
Monthly Revenue: ${revenueStr}
Monthly Expenses: ${expenseStr}
Prospect Pipeline: Contacted: ${pipeline.contacted || 0}, Replied: ${pipeline.replied || 0}, Demo: ${pipeline.demo || 0}, Signed: ${pipeline.signed || 0}
Active Retainers: ${retainers.length} client(s) — ${retainerStr}, total MRR: $${totalMRR.toLocaleString()}
Target: $${monthlyTarget.toLocaleString()}/month to hit $${annualGoal.toLocaleString()}/year goal${topClientsBlock}${totalRevenue === 0 ? '\nNOTE: All values are zero — Samuel is at the starting point. Calibrate advice for someone at day zero with no revenue yet.' : ''}`;
}

function defaultDashboard() {
  return {
    annualGoal: 50000,
    monthlyRevenue: MONTHS.map((month) => ({ month, revenue: 0, expenses: 0 })),
    pipeline: { contacted: 0, replied: 0, demo: 0, signed: 0 },
    retainers: [],
    oneTimeRevenues: [],
  };
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ─── Churn risk thresholds (days since lastTouchedAt) ────────────────────────
const CHURN_WARN_DAYS   = 45;
const CHURN_DANGER_DAYS = 60;

// Resolve the most recent signal of activity for a retainer.
// Falls back to startedAt for legacy records that never had lastTouchedAt.
function getRetainerTouchedAt(r) {
  if (!r) return 0;
  return Number(r.lastTouchedAt || r.startedAt || 0);
}

function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - Number(ts)) / 86_400_000);
}

// Match a retainer name in text using word boundaries (reduces false positives).
// Minimum 3 chars for the name to avoid matching "a", "le", etc.
function messageMentionsRetainer(text, retainerName) {
  if (!retainerName || !text) return false;
  const name = String(retainerName).trim();
  if (name.length < 3) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word boundaries don't work well with accents — use lookaround on letters
  const re = new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu');
  return re.test(text);
}

// Extract the last question from an agent response (used for Step 7 smart follow-up)
function extractLastQuestion(text) {
  if (!text) return null;
  const parts = text.split(/(?<=[?!.])\s+/);
  const questions = parts.filter((s) => s.trim().endsWith('?'));
  return questions.length > 0 ? questions[questions.length - 1].trim() : null;
}

export default function App() {
  const [screen, setScreen]         = useState('home');
  const [sessionStarted, setSessionStarted] = useState(false);
  const [lang, setLang] = useState(() => detectDefaultLang());
  const [sessionMode, setSessionMode] = useState('strategic');
  const [deepMode, setDeepMode]     = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [darkMode, setDarkMode]     = useState(true);
  const [messages, setMessages]     = useState([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [agentNames, setAgentNames] = useState(() => {
    if (COMMERCIAL_MODE) {
      // Always enforce archetype names — ignore any saved personal names
      return Object.fromEntries(Object.entries(AGENT_CONFIG).map(([k, c]) => [k, c.commercialName]));
    }
    return loadLS(LS_NAMES, DEFAULT_AGENT_NAMES);
  });
  const [agentPhotos, setAgentPhotos] = useState(() => loadLS(LS_PHOTOS, {}));
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [consensusLine, setConsensusLine] = useState(null);
  const [improvementJournal, setImprovementJournal] = useState(() => loadLS(LS_JOURNAL, []));
  const [decisions, setDecisions]   = useState(() => loadLS(LS_DECISIONS, []));
  const [feedbacks, setFeedbacks]   = useState({});
  const [error, setError]           = useState(null);
  const [thinkingAgent, setThinkingAgent] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isThinkingDeep, setIsThinkingDeep] = useState(false);
  const [sessionCount, setSessionCount] = useState(() => loadLS(LS_COUNT, 0));
  const [soundEnabled, setSoundEnabled] = useState(() => loadLS(LS_SOUND, true));
  const [voiceMode,    setVoiceMode]    = useState(() => loadLS(LS_VOICE, false) === true);
  const lastSpokenMsgIdRef = useRef(null);
  const [agentLastSpoke, setAgentLastSpoke] = useState(() => loadLS(LS_LAST_SPOKE, {}));
  const [dashboard, setDashboard] = useState(() => {
    const saved = loadLS(LS_DASHBOARD, null);
    if (saved) {
      if (!saved.monthlyRevenue || saved.monthlyRevenue.length !== 12) {
        saved.monthlyRevenue = defaultDashboard().monthlyRevenue;
      }
      if (!saved.annualGoal) saved.annualGoal = 50000;
      if (!Array.isArray(saved.oneTimeRevenues)) saved.oneTimeRevenues = [];
      return saved;
    }
    return defaultDashboard();
  });
  const dashboardCloudFetchedRef = useRef(false);
  const dashboardSyncFirstRunRef = useRef(true);
  const [focusAgent, setFocusAgent] = useState(null);
  const [pulseScore, setPulseScore] = useState(null);
  const [showPulse, setShowPulse]   = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 && !hasCheckedInToday();
  });
  const [checkInData, setCheckInData] = useState(null);
  const [wins, setWins] = useState(() => loadWins());
  const [activeNotification, setActiveNotification] = useState(null);
  const [roleplayScenario, setRoleplayScenario] = useState(null);
  const [showScenarioPicker, setShowScenarioPicker] = useState(false);
  const [showContentGen, setShowContentGen] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [weeklyReportText, setWeeklyReportText] = useState(null);
  const [agentDepth, setAgentDepth] = useState(() => loadAgentDepth());
  const [showProspectAnalyzer, setShowProspectAnalyzer] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const roleplayExchangeRef = useRef(0);
  const mem0PrefetchRef    = useRef(null);  // Step 4 & 7: pre-fetched Mem0 context
  const typingDebounceRef  = useRef(null);  // Step 7: debounce timer for typing pre-fetch
  const pendingGlobalMsg   = useRef(null);  // Message queued via GlobalFloatingInput
  const recapFiredForSessionRef = useRef(null);  // Session id we already fired a recap for
  const briefingLockedRef       = useRef(false); // true once user has interacted — blocks late async briefings
  const interjectCooldownRef    = useRef(false); // true for 30s after an interjection fires — prevents back-to-back
  const [streak, setStreak]           = useState(0);
  const [dailyQuote, setDailyQuote]   = useState(null);
  const [momentumMirror, setMomentumMirror] = useState(null);
  const [replaySession, setReplaySession]   = useState(null);
  const [mem0Context, setMem0Context]       = useState(null);
  const [calendarToken, setCalendarToken] = useState(() => getCalendarToken());
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [gmailConnected, setGmailConnected] = useState(() => isGmailConnected());
  const [gmailEmails, setGmailEmails] = useState([]);
  const [urgentEmailCount, setUrgentEmailCount] = useState(0);
  // Step 2: Conversation state tracking — active agent, thread depth, last question
  const [conversationState, setConversationState] = useState({
    activeAgent: null, threadDepth: 0, lastQuestion: null, topicLocked: false,
  });
  const { toasts, toast, dismiss: dismissToast } = useToast();
  const greeting = getDayGreeting('Samuel', lang);
  const sessionIdRef = useRef(Date.now());
  const streamingMsgIdRef = useRef(null);
  const rafRef = useRef(null);
  const streamAccumRef = useRef('');

  // Persist language preference
  useEffect(() => {
    try { localStorage.setItem('qg_lang_v1', lang); } catch {}
  }, [lang]);

  function toggleLang() { setLang((l) => (l === 'fr' ? 'en' : 'fr')); }

  // Step 7: Debounced Mem0 pre-fetch triggered by typing (800ms pause)
  function handleChatInputChange(draft) {
    clearTimeout(typingDebounceRef.current);
    if (draft.length < 15) return; // too short to be meaningful
    typingDebounceRef.current = setTimeout(async () => {
      try {
        const mem = await searchMemories(draft);
        if (mem) mem0PrefetchRef.current = mem;
      } catch {}
    }, 800);
  }

  // On mount: update streak, log open, fetch daily quote + mirror, refresh calendar
  useEffect(() => {
    // Register the service worker (no-op if unsupported)
    registerServiceWorker();
    logAppOpen();
    trackFirstOpen();
    // Auto-trigger tour on very first open
    if (!hasTourBeenCompleted()) {
      setTimeout(() => setShowTour(true), 800);
    }
    const currentStreak = updateStreak();
    setStreak(currentStreak);
    getDailyQuote(lang).then((q) => { if (q) setDailyQuote(q); });
    getMomentumMirror(currentStreak, lang).then((m) => { if (m) setMomentumMirror(m); });
    // Check smart notifications after a short delay
    setTimeout(() => {
      const savedDashboard = (() => { try { const d = localStorage.getItem('qg_dashboard_v1'); return d ? JSON.parse(d) : null; } catch { return null; } })();
      const savedNames = (() => { try { const d = localStorage.getItem('qg_agent_names_v1'); return d ? JSON.parse(d) : null; } catch { return null; } })();
      const notif = checkNotifications(savedDashboard, currentStreak, savedNames, detectDefaultLang());
      if (notif) setActiveNotification(notif);
    }, 1500);
    const token = getCalendarToken();
    if (token) {
      fetchCalendarEvents(token).then((evts) => { if (evts) setCalendarEvents(evts); }).catch(() => {});
    }
    // Monday weekly report — show once per Monday on app open
    const today = new Date();
    if (today.getDay() === 1) {
      const lastReport = localStorage.getItem('qg_monday_report_date');
      if (lastReport !== today.toDateString()) {
        setShowWeeklyReport(true);
        const dashCtx = formatDashboardContext((() => { try { const d = localStorage.getItem('qg_dashboard_v1'); return d ? JSON.parse(d) : null; } catch { return null; } })());
        const histCtx = formatHistoryContext();
        generateMondayReport(dashCtx, histCtx, lang).then((report) => {
          if (report) {
            setWeeklyReportText(report);
            localStorage.setItem('qg_monday_report_date', today.toDateString());
          }
        });
      }
    }
  }, []);

  // Sync dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Persist voice mode
  useEffect(() => {
    try { localStorage.setItem(LS_VOICE, JSON.stringify(voiceMode)); } catch { /* ignore */ }
    if (!voiceMode) cancelSpeech();
  }, [voiceMode]);

  // ── Auto-TTS on new completed agent messages ────────────────────────────
  // Speaks each newly-completed agent message (streaming done) using the
  // agent-specific voice profile. Guards against double-speaking via a ref.
  useEffect(() => {
    if (!voiceMode || !isTTSSupported()) return;
    // Find the latest agent message that is NOT streaming, different from the last spoken
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type !== 'agent') continue;
      if (m.streaming) return; // wait until streaming completes
      if (m.id === lastSpokenMsgIdRef.current) return; // already spoken
      lastSpokenMsgIdRef.current = m.id;
      ttsSpeak(m.content, { agent: m.agent, lang });
      return;
    }
  }, [messages, voiceMode, lang]);

  // Cancel speech if user sends a new message (interrupt the current one)
  useEffect(() => {
    if (!voiceMode) return;
    if (messages.length === 0) return;
    const lastUser = [...messages].reverse().find((m) => m.type === 'user');
    if (lastUser && lastUser.id !== lastUser._lastCancelId) {
      cancelSpeech();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.filter((m) => m.type === 'user').length, voiceMode]);

  // Cancel any ongoing speech on session end
  useEffect(() => { if (sessionEnded) cancelSpeech(); }, [sessionEnded]);

  // ── Gmail background watcher — polls every 5 min for urgent business emails ──
  // Toast on each urgent email + increment badge. Only runs when Gmail is
  // connected; cleans up on disconnect or unmount.
  useEffect(() => {
    if (!gmailConnected) return;
    const stop = startGmailWatcher({
      lang,
      onUrgent: (email, classification) => {
        const from = gmailService.getFromName(email.from);
        const oneLine = classification.oneLine || email.subject;
        const icon = classification.category === 'invoice'        ? '💸'
                   : classification.category === 'client_issue'   ? '⚠️'
                   : classification.category === 'prospect_reply' ? '🎯'
                   : classification.category === 'opportunity'    ? '✨'
                   : '📧';
        // In-app toast (always)
        toast(
          `${icon} ${from} — ${oneLine}`,
          { type: 'info', duration: 6000 }
        );
        setUrgentEmailCount((n) => n + 1);
        // Ask for notification permission lazily, then fire a native one.
        // This lights up the home-screen PWA badge / lock-screen banner when
        // the app is active (browser limitation: SW can't receive pushes
        // without a backend, so this only fires while the tab/PWA is alive).
        requestNotificationPermission().then((perm) => {
          if (perm === 'granted') {
            showLocalNotification({
              title: `${icon} ${from}`,
              body:  oneLine,
              tag:   `email-${email.id || Date.now()}`,
              data:  { emailId: email.id, category: classification.category },
            });
          }
        });
      },
      onUnauthorized: () => {
        setGmailConnected(false);
        console.log('[GmailWatcher] session expired — watcher stopped');
      },
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailConnected, lang]);

  // ── Financial persistence: fetch from Supabase on mount ──────────────────
  // localStorage has painted the initial state for instant UX. Now we pull
  // the authoritative state from Supabase and reconcile. If cloud has data,
  // it wins (cross-device consistency). If cloud has nothing or fails, we
  // keep the local state AND push it up so the row gets created.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cloud = await fetchDashboardState();
      if (cancelled) return;
      dashboardCloudFetchedRef.current = true;
      if (cloud?.state) {
        setDashboard((prev) => {
          const merged = { ...prev, ...cloud.state };
          if (!merged.monthlyRevenue || merged.monthlyRevenue.length !== 12) {
            merged.monthlyRevenue = defaultDashboard().monthlyRevenue;
          }
          if (!merged.annualGoal) merged.annualGoal = 50000;
          if (!Array.isArray(merged.oneTimeRevenues)) merged.oneTimeRevenues = [];
          if (!Array.isArray(merged.retainers))       merged.retainers       = [];
          if (!merged.pipeline) merged.pipeline = { contacted: 0, replied: 0, demo: 0, signed: 0 };
          return merged;
        });
        console.log('[Dashboard] hydrated from Supabase');
      } else {
        // First-ever run on this user_id — push local state so cloud row exists
        syncDashboardState(dashboard);
        console.log('[Dashboard] no cloud state yet, seeded from local');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Financial persistence: auto-sync to Supabase on every dashboard change ──
  // Debounced 800ms — matches the rhythm of user edits without spamming the API.
  // Skips the very first render (post-hydration we don't want to sync back
  // immediately) and fires immediately after mutations (NLP card confirms).
  useEffect(() => {
    if (dashboardSyncFirstRunRef.current) { dashboardSyncFirstRunRef.current = false; return; }
    if (!dashboardCloudFetchedRef.current) return; // wait for initial hydration
    const t = setTimeout(() => { syncDashboardState(dashboard); }, 800);
    return () => clearTimeout(t);
  }, [JSON.stringify(dashboard)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush the dashboard to Supabase synchronously before the page closes.
  // The 800ms debounce above can swallow the very last mutation on a fast
  // refresh — this closes that gap for cloud persistence too.
  useEffect(() => {
    const flush = () => { syncDashboardState(dashboard); };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [dashboard]);

  // ── Auto-save all persistent state (debounced, with status) ──────────────────
  const s1 = useAutoSave(LS_NAMES,      agentNames,           300);
  const s2 = useAutoSave(LS_PHOTOS,     agentPhotos,          300);
  const s3 = useAutoSave(LS_JOURNAL,    improvementJournal,   300);
  const s4 = useAutoSave(LS_COUNT,      sessionCount,         300);
  const s5 = useAutoSave(LS_SOUND,      soundEnabled,         300);
  const s6 = useAutoSave(LS_LAST_SPOKE, agentLastSpoke,       300);
  const s7 = useAutoSave(LS_DECISIONS,  decisions,            300);
  const s8 = useAutoSave(LS_DASHBOARD,  dashboard,            500); // slightly longer for rapid number edits
  const saveStatus = mergeSaveStatus([s1, s2, s3, s4, s5, s6, s7, s8]);

  function startSession(scenarioKeyOverride = null, forceMode = null) {
    const effectiveMode = forceMode ?? sessionMode;
    // If caller forced a mode, sync it to state for subsequent sendMessage calls
    if (forceMode !== null && forceMode !== sessionMode) setSessionMode(forceMode);
    // Roleplay mode requires scenario selection first
    if (effectiveMode === 'roleplay' && !scenarioKeyOverride) {
      setShowScenarioPicker(true);
      return;
    }
    if (scenarioKeyOverride) setRoleplayScenario(scenarioKeyOverride);
    roleplayExchangeRef.current = 0;
    logSessionStart();
    sessionIdRef.current = Date.now();
    // Compute + show pulse score
    const checkIn = checkInData || (() => { try { const d = localStorage.getItem('qg_checkin_today'); return d ? JSON.parse(d) : null; } catch { return null; } })();
    const pulse = computePulseScore(dashboard, streak, checkIn);
    setPulseScore(pulse);
    setShowPulse(true);
    syncMomentum(streak, 0, sessionCount + 1);
    const isFocus = effectiveMode === 'focus' && focusAgent;
    const modeLabel = isFocus
      ? t('modeLabel.focusPrefix', lang) + (agentNames[focusAgent] || focusAgent)
      : t(`modeLabel.${effectiveMode}`, lang);
    const welcomeContent = effectiveMode === 'silent'      ? t('welcome.silent', lang)
      : effectiveMode === 'prepCall'    ? t('welcome.prepCall', lang)
      : effectiveMode === 'negotiation' ? t('welcome.negotiation', lang)
      : effectiveMode === 'analysis'    ? t('welcome.analysis', lang)
      : effectiveMode === 'roleplay'    ? t('welcome.roleplay', lang)
      : effectiveMode === 'debate'      ? (lang === 'fr' ? '⚡ Mode Débat activé. Pose une question ou présente une situation — deux conseillers prendront des positions opposées et s\'affronteront pour toi.' : '⚡ Debate Mode active. Ask a question or present a situation — two advisors will take opposing positions and clash for you.')
      : t('welcome.session', lang, { mode: modeLabel, deep: deepMode ? t('welcome.deepSuffix', lang) : '' });
    const welcomeMsg = {
      id: 'welcome',
      type: 'system',
      content: welcomeContent,
      timestamp: new Date(),
    };
    setMessages([welcomeMsg]);
    setSessionEnded(false);
    setSessionSummary(null);
    setConsensusLine(null);
    setFeedbacks({});
    setThinkingAgent(null);
    setError(null);
    setMem0Context(null);
    setConversationState({ activeAgent: null, threadDepth: 0, lastQuestion: null, topicLocked: false });
    setSessionCount((n) => {
      const next = n + 1;
      const m = checkMilestone(next);
      if (m) setTimeout(() => setActiveMilestone(m), 800);
      return next;
    });
    setSessionStarted(true);
    setScreen('chat');

    // Toast — session started
    const nextCount = sessionCount + 1; // optimistic (state updates async)
    setTimeout(() => toast(
      lang === 'fr' ? `Session démarrée 🚀` : `Session started 🚀`,
      { type: 'info', duration: 2200 }
    ), 300);

    // Pattern alert — check after render
    setTimeout(() => {
      const history = loadHistory();
      const alert = checkPatternAlert(history);
      if (alert) {
        setMessages((prev) => [...prev, {
          id: `alert-${Date.now()}`,
          type: 'agent',
          agent: 'CARDONE',
          content: alert,
          timestamp: new Date(),
        }]);
      }
    }, 150);

    // Churn risk alerts — retainers untouched > 45 days
    setTimeout(() => {
      const atRisk = (dashboard.retainers || [])
        .map((r) => {
          const touched = getRetainerTouchedAt(r);
          const days = daysSince(touched);
          return { retainer: r, days };
        })
        .filter(({ days }) => days !== null && days >= CHURN_WARN_DAYS)
        .sort((a, b) => b.days - a.days); // most-at-risk first

      if (atRisk.length > 0) {
        setMessages((prev) => [...prev, {
          id:        `churn-risk-alert-${Date.now()}`,
          type:      'churn-risk-alert',
          items:     atRisk.map(({ retainer, days }) => ({
            id:     retainer.id,
            name:   retainer.name,
            amount: retainer.amount,
            days,
            severity: days >= CHURN_DANGER_DAYS ? 'danger' : 'warn',
          })),
          timestamp: new Date(),
        }]);
      }
    }, 400);

    // Meeting Room + Morning Briefing — orchestrated at session start.
    //
    // Step 1: detect negative patterns (Haiku). If one crosses the phase's
    //         severity bar AND isn't cooled down → the relevant agent opens
    //         the session organically (Sonnet) AND the briefing is SUPPRESSED
    //         (the agent's voice replaces the structured briefing).
    //
    // Step 2: Otherwise, normal briefing flow (locked teaser / full briefing).
    //
    // Both phases can be cancelled mid-flight by briefingLockedRef (user typing).
    briefingLockedRef.current = false;

    const BRIEFING_UNLOCK_AT = 7;
    const thisSessionId = sessionIdRef.current;
    const alreadyFired  = recapFiredForSessionRef.current === thisSessionId;

    if (!alreadyFired && sessionCount > 0) {
      recapFiredForSessionRef.current = thisSessionId;

      // ── Priority 1: Anomaly alert ────────────────────────────────────
      // Checks week-over-week drops on outreach / pipeline / MRR. If a drop
      // > 40% is detected on an axis with meaningful baseline → the owner
      // agent opens with numbers + diagnostic + one concrete move.
      // If this fires, all lower layers (Meeting Room, Fil Rouge, locked
      // teaser) are skipped via briefingLockedRef.
      (async () => {
        try {
          if (briefingLockedRef.current) return;

          // Need at least a session or two of activity before anomaly detection is meaningful
          if (sessionCount < 2) return;

          const now = Date.now();
          const { previousStart } = getWeekWindows(now);

          // Fetch Supabase sources in parallel. All return [] on failure.
          const [followups, oneTimes, retainerChanges] = await Promise.all([
            fetchWeeklyFollowups(previousStart),
            fetchWeeklyOneTimeRevenues(previousStart),
            fetchWeeklyRetainerChanges(previousStart),
          ]);
          if (briefingLockedRef.current) return;

          const localProspects = loadLS('hq_prospects', []);
          const sources = {
            followups,
            oneTimes,
            retainerChanges,
            prospects: Array.isArray(localProspects) ? localProspects : [],
            dashboardSnapshot: dashboard,
          };

          const anomaly = pickTopAnomaly(sources, now);
          if (!anomaly) return; // nothing severe enough

          const alert = await generateAnomalyAlert(anomaly, lang);
          if (briefingLockedRef.current || !alert) return;

          // Commit: push agent message + mark cooldown + lock lower layers
          setMessages((prev) => [...prev, {
            id:        `anomaly-${anomaly.axis}-${thisSessionId}`,
            type:      'agent',
            agent:     anomaly.agent,
            content:   alert,
            streaming: false,
            timestamp: new Date(),
            meta:      { source: 'anomaly', axis: anomaly.axis, dropPct: anomaly.dropPct },
          }]);
          markAxisFired(anomaly.axis, now);
          briefingLockedRef.current = true; // suppress Meeting Room + Fil Rouge
          console.log('[Anomaly] fired:', anomaly.agent, 'on', anomaly.axis, `${Math.round(anomaly.dropPct * 100)}% drop`);
        } catch (err) {
          console.warn('[Anomaly] failed:', err.message);
        }
      })();

      // ── Meeting Room: pattern-triggered proactive opening ────────────
      // Runs in parallel with briefing prep. If a pattern fires, we push the
      // agent's opening message AND skip the structured briefing.
      const maturity = getMaturityPhase(sessionCount);
      pruneCooldowns(sessionCount);
      let meetingRoomFired = false;

      (async () => {
        try {
          if (briefingLockedRef.current) return;

          // Need at least 2 sessions of history for patterns to exist
          if (sessionCount < 2) return;

          const history = loadHistory();
          const memories = await fetchMemoriesForRecap();
          if (briefingLockedRef.current) return;

          const prospects = loadLS('hq_prospects', []);
          const patterns = await detectMeetingPatterns({
            sessionCount,
            memories: memories || [],
            recentSessions: (history || []).slice(0, 5),
            retainers: dashboard.retainers || [],
            prospects:  Array.isArray(prospects) ? prospects : [],
            lang,
          });
          if (briefingLockedRef.current) return;

          const chosen = pickBestPattern(patterns, sessionCount, maturity);
          if (!chosen) return; // nothing urgent enough

          const opening = await generateAgentOpening({
            agent:    chosen.agent,
            pattern:  chosen,
            maturity,
            lang,
          });
          if (briefingLockedRef.current || !opening) return;

          // Commit: push agent message + mark pattern fired + block briefing
          setMessages((prev) => [...prev, {
            id:        `meeting-opening-${thisSessionId}`,
            type:      'agent',
            agent:     chosen.agent,
            content:   opening,
            streaming: false,
            timestamp: new Date(),
            meta:      { source: 'meetingRoom', pattern: chosen.type },
          }]);
          markPatternFired(chosen.type, sessionCount);
          meetingRoomFired = true;
          // Also trip the briefingLock so the briefing flow (below) skips
          briefingLockedRef.current = true;
          console.log('[MeetingRoom] fired:', chosen.agent, 'for pattern', chosen.type);
        } catch (err) {
          console.warn('[MeetingRoom] failed:', err.message);
        }
      })();

      // ── Variant 1: locked teaser for sessions 1-3 (learning phase) ────
      const FIL_ROUGE_UNLOCK_AT = 4;
      if (sessionCount < FIL_ROUGE_UNLOCK_AT) {
        setTimeout(() => {
          if (briefingLockedRef.current) return;
          setMessages((prev) => [...prev, {
            id:           `briefing-locked-${thisSessionId}`,
            type:         'briefing-locked',
            sessionCount: sessionCount,
            timestamp:    new Date(),
          }]);
        }, 250);
      }

      // ── Variant 2: Fil Rouge for sessions 4+ (replaces structured briefing) ──
      // One natural sentence bridging last session to now. Agent-voice.
      else {
        (async () => {
          try {
            if (briefingLockedRef.current) return;

            const history = loadHistory();
            const lastSession = history && history.length > 0 ? history[0] : null;
            const memories = isMem0Enabled() ? await fetchMemoriesForRecap() : [];
            if (briefingLockedRef.current) return;

            const fil = await generateFilRouge({
              lastSession,
              memories: memories || [],
              lang,
            });
            if (briefingLockedRef.current || !fil) return;

            setMessages((prev) => [...prev, {
              id:        `fil-rouge-${thisSessionId}`,
              type:      'agent',
              agent:     fil.agent,
              content:   fil.content,
              streaming: false,
              timestamp: new Date(),
              meta:      { source: 'filRouge' },
            }]);
            console.log('[FilRouge] fired:', fil.agent);
          } catch (err) {
            console.warn('[FilRouge] failed:', err.message);
          }
        })();
      }
    }

  }

  async function sendMessage(text, attachment = null, forcedAgent = null) {
    if (!text.trim() && !attachment) return;
    if (isLoading) return;
    setError(null);

    // User is actively interacting — kill any briefing / memory-recap still
    // loading from the session start. Briefing is "at start" ONLY — the user
    // engaging means the window is closed. Also lock the ref so no pending
    // async briefing resolves into the message stream later.
    briefingLockedRef.current = true;
    setMessages((prev) => prev.filter((m) =>
      m.type !== 'briefing-loading' &&
      m.type !== 'memory-recap-loading' &&
      m.type !== 'briefing-locked'
    ));

    // Topic tracker — record any topic keywords the user mentioned so the
    // "silent pressure" layer knows what's been covered. Fire-and-forget.
    try { updateTopicTracker(text || ''); } catch { /* ignore */ }

    const displayText = text.trim() || `[Attached: ${attachment?.name}]`;
    const userMsg = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: attachment && !text.trim() ? `📎 ${attachment.name}` : displayText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Touch-on-mention : if the user's text mentions any retainer by name,
    // update its lastTouchedAt so churn alerts reflect actual activity.
    if (text && (dashboard.retainers || []).length > 0) {
      const touchedIds = (dashboard.retainers || [])
        .filter((r) => messageMentionsRetainer(text, r.name))
        .map((r) => r.id);
      if (touchedIds.length > 0) {
        const now = Date.now();
        setDashboard((prev) => ({
          ...prev,
          retainers: (prev.retainers || []).map((r) =>
            touchedIds.includes(r.id) ? { ...r, lastTouchedAt: now } : r
          ),
        }));
        // Fire-and-forget cloud sync for each touched retainer
        touchedIds.forEach((id) => {
          const r = dashboard.retainers.find((x) => x.id === id);
          if (r) syncRetainer({ ...r, lastTouchedAt: now });
        });
        console.log('[Churn] touched retainers via mention:', touchedIds);
      }
    }
    if (attachment?.type === 'image') setIsReadingImage(true);

    // ── Gmail intent detection ────────────────────────────────────────────────
    const lowerInput = text.toLowerCase().trim();
    const EMAIL_CHECK_TRIGGERS = [
      'vérifie mes emails', 'vérifie mes mails', 'check my emails', 'check my mail',
      "qu'est-ce que j'ai reçu", "qu'est ce que j'ai reçu",
      'des nouveaux emails', 'des nouveaux mails', 'regarde ma boîte',
      'mes emails non lus', 'email non lu', 'nouveaux emails', 'check emails',
    ];
    const EMAIL_REPLY_TRIGGERS = [
      'réponds à cet email', 'réponds à ce mail', 'réponds à l\'email',
      "qu'est-ce que tu lui réponds", 'rédige une réponse', 'rédige-moi une réponse',
      'réponds pour', 'respond to this email', 'reply to this email', 'draft a reply',
      'draft reply', 'rédige une réponse pour',
    ];

    if (!attachment && EMAIL_CHECK_TRIGGERS.some((t) => lowerInput.includes(t))) {
      const tokens = getGmailTokens();
      if (!tokens) {
        setMessages((prev) => [...prev, {
          id: `system-gmail-${Date.now()}`,
          type: 'system',
          content: lang === 'fr'
            ? 'Gmail pas encore connecté.\nVa dans l\'accueil → Connecter Gmail.\nEnsuite je peux vérifier pour toi.'
            : 'Gmail not connected yet.\nGo to Home → Connect Gmail.\nThen I can check for you.',
          timestamp: new Date(),
        }]);
        setIsLoading(false);
        return;
      }
      try {
        const emails = await gmailService.getRecentEmails(tokens.access_token, 10);
        setGmailEmails(emails);
        const count = emails.length;
        let content;
        if (count === 0) {
          content = lang === 'fr'
            ? 'Aucun email business pour le moment. 👌'
            : 'No business emails right now. 👌';
        } else {
          const important = emails.slice(0, Math.min(count, 5));
          const lines = important.map((e, i) => {
            const fromName = gmailService.getFromName(e.from);
            const preview = (e.snippet || e.body.slice(0, 120)).replace(/\s+/g, ' ').trim().slice(0, 120);
            return `**${i + 1}. ${fromName}** — ${e.subject}\n${preview}`;
          }).join('\n\n');
          content = (lang === 'fr'
            ? `Tu as **${count} email${count > 1 ? 's' : ''} business non lu${count > 1 ? 's' : ''}**. ${count > 5 ? 'Les 5 plus récents :' : 'Les importants :'}\n\n`
            : `You have **${count} unread business email${count > 1 ? 's' : ''}**. ${count > 5 ? 'Top 5 most recent:' : 'The important ones:'}\n\n`
          ) + lines;
        }
        setMessages((prev) => [...prev, {
          id: `gmail-inbox-${Date.now()}`,
          type: 'agent',
          agent: 'COORDINATOR',
          content,
          timestamp: new Date(),
        }]);
      } catch (err) {
        if (err.message === 'UNAUTHORIZED') { clearGmailTokens(); setGmailConnected(false); }
        setMessages((prev) => [...prev, {
          id: `gmail-err-${Date.now()}`,
          type: 'system',
          content: lang === 'fr'
            ? `Erreur Gmail : ${err.message === 'UNAUTHORIZED' ? 'Session expirée — reconnecte Gmail depuis l\'accueil.' : err.message}`
            : `Gmail error: ${err.message === 'UNAUTHORIZED' ? 'Session expired — reconnect Gmail from home.' : err.message}`,
          timestamp: new Date(),
        }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!attachment && EMAIL_REPLY_TRIGGERS.some((t) => lowerInput.includes(t)) && gmailEmails.length > 0) {
      try {
        // Find target email — match sender name in text, else use first
        let targetEmail = gmailEmails[0];
        for (const email of gmailEmails) {
          const fromName = gmailService.getFromName(email.from).toLowerCase();
          if (fromName && lowerInput.includes(fromName)) { targetEmail = email; break; }
        }
        // Analyze to pick best agent, fall back to VOSS
        const analysis = await analyzeEmail(targetEmail.from, targetEmail.subject, targetEmail.snippet || targetEmail.body.slice(0, 300), lang).catch(() => null);
        const replyAgent = analysis?.recommendedAgent || 'VOSS';
        const draft = await draftEmailReply(replyAgent, targetEmail.from, targetEmail.subject, targetEmail.body.slice(0, 1500), lang);
        const replyTo = gmailService.getFromEmail(targetEmail.from);
        const subject = targetEmail.subject.startsWith('Re:') ? targetEmail.subject : `Re: ${targetEmail.subject}`;
        const msgId = `email-reply-draft-${Date.now()}`;
        setMessages((prev) => [...prev, {
          id: msgId,
          type: 'email-reply-draft',
          emailTo: replyTo,
          emailSubject: subject,
          emailThreadId: targetEmail.threadId,
          fromName: gmailService.getFromName(targetEmail.from),
          originalSubject: targetEmail.subject,
          agentKey: replyAgent,
          draft,
          content: draft,
          timestamp: new Date(),
        }]);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    // ── End Gmail intent detection ─────────────────────────────────────────────

    // ── Calendar intent detection ─────────────────────────────────────────────
    // Loose keyword triggers — the real filter is the Haiku confidence threshold (0.55).
    // Goal: match any user phrasing that even hints at scheduling; let the LLM reject noise.
    const CALENDAR_TRIGGERS = [
      // FR — loose keywords (any occurrence)
      'calendrier', 'calendar', 'agenda',
      'rdv', 'rendez-vous', 'rendez vous',
      'meeting', 'réunion', 'appel', ' call ', ' call,', ' call.',
      'planifie', 'programme', 'schedule',
      'relance-moi', 'rappelle-moi', 'relance dans', 'rappel dans',
      'bloque-moi', 'bloque une heure', "bloque l'heure",
      'prépare un', 'prépare une', 'prep a', 'prep the',
      'crée un event', 'crée un évènement', 'créer un event', 'create an event',
      'ajoute au cal', 'ajoute dans', 'ajoute à', 'ajoute sur',
      'met sur', 'mets sur', 'met dans', 'mets dans', 'met au', 'mets au', 'met à', 'mets à',
      // EN — loose
      'add to my cal', 'add to calendar', 'put on my cal', 'put on calendar',
      'book a', 'book the', 'remind me to', 'remind me in', 'set a reminder',
      "i have a call", "i have a meeting", "i've got a call", "i've got a meeting",
      "j'ai un appel", "j'ai un call", "j'ai un meeting", "j'ai une réunion",
      "j'ai un rdv", "j'ai un rendez-vous",
    ];
    const matchedTrigger = CALENDAR_TRIGGERS.find((trigger) => lowerInput.includes(trigger));
    const mentionsCalendar = !attachment && !!matchedTrigger;

    console.log('[Calendar] lowerInput:', JSON.stringify(lowerInput));
    console.log('[Calendar] matchedTrigger:', matchedTrigger || 'NONE');

    if (mentionsCalendar) {
      console.log('[Calendar] mentionsCalendar=true — entering detection block');
      const calToken = getCalendarToken();
      console.log('[Calendar] token present:', !!calToken);
      if (!calToken) {
        setMessages((prev) => [...prev, {
          id: `system-gcal-${Date.now()}`,
          type: 'system',
          content: lang === 'fr'
            ? 'Google Calendar pas encore connecté.\nVa dans l\'accueil → Connecter Calendar.\nJe pourrai ensuite créer l\'event pour toi.'
            : 'Google Calendar not connected yet.\nGo to Home → Connect Calendar.\nThen I can create the event for you.',
          timestamp: new Date(),
        }]);
        setIsLoading(false);
        return;
      }
      try {
        console.log('[Calendar] calling extractCalendarEvent…');
        const event = await extractCalendarEvent(text, lang);
        console.log('[Calendar] extract result:', event);
        if (event) {
          console.log('[Calendar] pushing preview card — title:', event.title, 'start:', event.startISO, 'end:', event.endISO);
          setMessages((prev) => [...prev, {
            id:          `cal-event-preview-${Date.now()}`,
            type:        'calendar-event-preview',
            title:       event.title,
            startISO:    event.startISO,
            endISO:      event.endISO,
            description: event.description,
            timestamp:   new Date(),
          }]);
          setIsLoading(false);
          return;
        }
        console.log('[Calendar] extraction returned null — low confidence or invalid, falling through to agent');
        // Low confidence → fall through to normal agent flow
      } catch (err) {
        console.warn('[Calendar extract] error:', err.message);
        // fall through to normal flow
      }
    }
    // ── End Calendar intent detection ─────────────────────────────────────────

    // ── Pipeline + Dashboard intent detection (parallel) ─────────────────────
    // Both can fire on the same message (e.g. "j'ai signé avec Dubé à 150$/mois").
    // Run their extractions in parallel so we pay at most one Haiku-roundtrip of latency.
    const PIPELINE_TRIGGERS = [
      // FR — signature
      "j'ai signé", 'on a signé', 'a signé', 'deal closé', 'deal fermé', 'a dit oui', 'dit oui pour',
      // FR — loss
      "j'ai perdu", 'on a perdu', 'a dit non', 'refusé', 'pas intéressé', 'ghosté',
      // FR — reply / demo / contact
      "m'a répondu", 'a répondu', 'a envoyé un message', 'a rappelé',
      'démo avec', 'démo prévue', 'fait une démo', 'booké une démo', "j'ai fait une démo",
      "j'ai contacté", 'on a contacté', 'appelé', 'relancé',
      'devenu client', 'est devenu client', 'est client',
      // EN — signature / loss / activity
      'signed with', 'closed with', 'said yes', 'we won',
      'lost ', 'said no', 'not interested', 'ghosted',
      'replied', 'got back to me', 'called me back',
      'demo with', 'booked demo', 'had a demo',
      'contacted ', 'reached out to',
      'became a client', 'is now a client',
    ];
    const DASHBOARD_TRIGGERS = [
      '$', '€', 'eur', 'usd', 'cad',
      '/mois', '/mo', '/month', 'par mois', 'mensuel', 'mrr',
      'one-time', 'one shot', 'one time',
      'contrat', 'contract', 'retainer',
      'facture', 'touché', 'payé', 'paid', 'paied',
      'revenu', 'revenue', 'rentré', 'bucks', 'dollars',
      'signé un client', 'signé ce', 'lost a client', 'perdu un client',
      // Expense signals
      'dépensé', 'déboursé', 'investi', 'spent', 'invested',
      'abonnement', 'subscription', 'coût de', 'coûte',
    ];
    const mentionsPipeline  = !attachment && PIPELINE_TRIGGERS.some((trigger) => lowerInput.includes(trigger));
    const mentionsDashboard = !attachment && DASHBOARD_TRIGGERS.some((trigger) => lowerInput.includes(trigger));
    console.log('[Intent] pipeline=', mentionsPipeline, 'dashboard=', mentionsDashboard);

    if (mentionsPipeline || mentionsDashboard) {
      const prospectList = loadLS('hq_prospects', []);
      const prospectNames = Array.isArray(prospectList)
        ? prospectList.map((p) => p.contactName || p.name || p.businessName).filter(Boolean)
        : [];
      const knownNames = [
        ...prospectNames,
        ...(dashboard.retainers || []).map((r) => r.name).filter(Boolean),
      ];

      const pipelinePromise = (mentionsPipeline && Array.isArray(prospectList) && prospectList.length > 0)
        ? extractPipelineAction(text, prospectList, lang).catch((e) => { console.warn('[Pipeline extract]', e.message); return null; })
        : Promise.resolve(null);

      const dashboardPromise = mentionsDashboard
        ? extractDashboardUpdate(text, { retainers: dashboard.retainers || [], knownNames }, lang).catch((e) => { console.warn('[Dashboard extract]', e.message); return null; })
        : Promise.resolve(null);

      const [pipelineAction, dashboardAction] = await Promise.all([pipelinePromise, dashboardPromise]);
      console.log('[Intent] results pipeline=', pipelineAction, 'dashboard=', dashboardAction);

      const newCards = [];
      if (pipelineAction) {
        newCards.push({
          id:             `pipeline-update-preview-${Date.now()}`,
          type:           'pipeline-update-preview',
          prospectId:     pipelineAction.prospectId,
          prospectName:   pipelineAction.prospectName,
          prospectCity:   pipelineAction.prospectCity,
          currentStatus:  pipelineAction.currentStatus,
          newStatus:      pipelineAction.newStatus,
          reason:         pipelineAction.reason,
          timestamp:      new Date(),
        });
      }
      if (dashboardAction) {
        newCards.push({
          id:            `dashboard-update-preview-${Date.now() + 1}`,
          type:          'dashboard-update-preview',
          updateType:    dashboardAction.type,
          amount:        dashboardAction.amount,
          clientName:    dashboardAction.clientName,
          retainerId:    dashboardAction.retainerId,
          // Expense-only fields (null when other types)
          category:      dashboardAction.category,
          label:         dashboardAction.label,
          isRecurring:   dashboardAction.isRecurring,
          reason:        dashboardAction.reason,
          timestamp:     new Date(),
        });
      }

      if (newCards.length > 0) {
        setMessages((prev) => [...prev, ...newCards]);
        setIsLoading(false);
        return;
      }
      // Neither produced a confident result → fall through to normal agent flow
    }
    // ── End Pipeline + Dashboard intent detection ────────────────────────────

    // ── Batch follow-up intent detection ─────────────────────────────────────
    // "relance tous les prospects sans réponse depuis 7 jours" style commands.
    // Fan out: 1 Haiku to confirm intent + parse threshold, then parallel
    // Sonnet calls (chunked 5) to generate per-prospect follow-up emails.
    const BATCH_FOLLOWUP_TRIGGERS = [
      // FR
      'relance tous', 'relance ceux', 'relance les', 'relance sans réponse',
      'relancer tous', 'relancer ceux', 'relancer les',
      'batch relance', 'envoie une relance', 'envoie des relances', 'envoies des relance',
      'ghosté', 'ghostés', 'silence radio',
      "tous les prospects sans", 'prospects qui ont pas répondu',
      // EN
      'follow up all', 'follow up everyone', 'follow up all prospects',
      'batch follow', 'bulk follow up', 'reach out to all prospects',
      'silent prospects', 'prospects who haven',
    ];
    const mentionsBatchFollowup = !attachment && BATCH_FOLLOWUP_TRIGGERS.some((t) => lowerInput.includes(t));

    if (mentionsBatchFollowup) {
      try {
        const intent = await extractBatchFollowupIntent(text, lang);
        if (!intent) {
          // Low confidence — fall through to normal agent flow
        } else {
          // Load + filter eligible prospects
          const prospects = loadLS('hq_prospects', []);
          if (!Array.isArray(prospects) || prospects.length === 0) {
            setMessages((prev) => [...prev, {
              id: `system-batch-empty-${Date.now()}`,
              type: 'system',
              content: lang === 'fr'
                ? 'Aucun prospect dans le CRM. Ajoute-en d\'abord depuis la section Prospects.'
                : 'No prospects in the CRM. Add some from the Prospects section first.',
              timestamp: new Date(),
            }]);
            setIsLoading(false);
            return;
          }

          const now = Date.now();
          const msPerDay = 86_400_000;
          const eligible = prospects.filter((p) => {
            if (!p?.email || !String(p.email).trim()) return false;
            if (!intent.statusFilter.includes(p.status)) return false;
            const lastTs = Number(p.lastContactAt || p.createdAt || 0);
            if (!lastTs) return true; // never contacted → include
            const daysSince = Math.floor((now - lastTs) / msPerDay);
            return daysSince >= intent.daysThreshold;
          });

          if (eligible.length === 0) {
            setMessages((prev) => [...prev, {
              id: `system-batch-none-${Date.now()}`,
              type: 'system',
              content: lang === 'fr'
                ? `Aucun prospect éligible (email requis, statut dans ${intent.statusFilter.join(', ')}, silence ≥ ${intent.daysThreshold} jours). 👌`
                : `No eligible prospects (email required, status in ${intent.statusFilter.join(', ')}, silent ≥ ${intent.daysThreshold} days). 👌`,
              timestamp: new Date(),
            }]);
            setIsLoading(false);
            return;
          }

          // Cap at 20 to keep costs sane and UI manageable
          const capped = eligible.slice(0, 20);

          // Push loading placeholder
          const batchId = `batch-${Date.now()}`;
          const loadingId = `batch-followup-loading-${batchId}`;
          setMessages((prev) => [...prev, {
            id: loadingId,
            type: 'batch-followup-loading',
            total: capped.length,
            daysThreshold: intent.daysThreshold,
            timestamp: new Date(),
          }]);

          // Generate messages in parallel, chunked by 5
          const items = [];
          const CHUNK = 5;
          for (let i = 0; i < capped.length; i += CHUNK) {
            const slice = capped.slice(i, i + CHUNK);
            const results = await Promise.all(slice.map(async (p) => {
              const lastTs = Number(p.lastContactAt || p.createdAt || 0);
              const daysSince = lastTs ? Math.floor((now - lastTs) / msPerDay) : intent.daysThreshold;
              const msg = await generateFollowupMessage(p, { daysSinceContact: daysSince, lang });
              return msg ? {
                prospectId:   p.id,
                prospectName: p.contactName || p.name || p.businessName || 'Contact',
                businessName: p.businessName || p.name || '',
                email:        p.email,
                status:       p.status || 'Contacté',
                daysSince,
                subject:      msg.subject,
                body:         msg.body,
                selected:     true,
              } : null;
            }));
            items.push(...results.filter(Boolean));
          }

          if (items.length === 0) {
            setMessages((prev) => prev.filter((m) => m.id !== loadingId));
            setMessages((prev) => [...prev, {
              id: `system-batch-gen-fail-${Date.now()}`,
              type: 'system',
              content: lang === 'fr' ? 'Impossible de générer les relances — réessaie.' : 'Failed to generate follow-ups — retry.',
              timestamp: new Date(),
            }]);
            setIsLoading(false);
            return;
          }

          // Replace loading with the editable batch card
          setMessages((prev) => prev.map((m) => m.id === loadingId
            ? {
                id:             `batch-followup-preview-${batchId}`,
                type:           'batch-followup-preview',
                batchId,
                items,
                daysThreshold:  intent.daysThreshold,
                timestamp:      new Date(),
              }
            : m
          ));
        }
        setIsLoading(false);
        return;
      } catch (err) {
        console.warn('[Batch followup] error:', err.message);
        // fall through
      }
    }
    // ── End Batch follow-up intent detection ─────────────────────────────────

    const PDF_TRIGGERS = ['pdf', 'rapport', 'report', 'document', 'export', 'fais-moi', 'fais moi', 'donne-moi', 'donne moi', 'drop'];
    const isPdfDrop = PDF_TRIGGERS.some((t) => text.toLowerCase().includes(t));

    const activeFocus = forcedAgent || (sessionMode === 'focus' ? focusAgent : null);

    // Streaming callbacks — create placeholder message and update it token by token
    streamAccumRef.current = '';
    const streamCallbacks = {
      onAgentStart: (agentKey) => {
        const msgId = `agent-${agentKey}-${Date.now()}-stream`;
        streamingMsgIdRef.current = msgId;
        streamAccumRef.current = '';
        setMessages((prev) => [...prev, {
          id: msgId,
          type: 'agent',
          agent: agentKey,
          content: '',
          streaming: true,
          pdfDrop: isPdfDrop,
          timestamp: new Date(),
        }]);
      },
      onToken: (token) => {
        streamAccumRef.current += token;
        // Batch DOM updates at 60fps with RAF
        if (!rafRef.current) {
          const id = streamingMsgIdRef.current;
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const text = streamAccumRef.current;
            setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: text } : m));
          });
        }
      },
      onSearchState: (searching) => setIsSearching(searching),
      onThinkingState: (thinking) => setIsThinkingDeep(thinking),
    };

    try {
      const calendarContext   = [
        formatCalendarContext(calendarEvents),
        sessionMode === 'roleplay' && roleplayScenario ? `ROLEPLAY_SCENARIO:${roleplayScenario}` : null,
      ].filter(Boolean).join('\n') || null;
      const financialContext  = formatDashboardContext(dashboard);
      const historyContext    = formatHistoryContext();

      // Step 4 & 7: Use pre-fetched Mem0 context if available (from typing debounce or post-response)
      // Falls back to a blocking search only on first message with no pre-fetch
      const isFirstMessage = messages.filter((m) => m.type === 'user').length === 0;
      let memContext = mem0PrefetchRef.current || mem0Context;
      if (mem0PrefetchRef.current) {
        setMem0Context(mem0PrefetchRef.current);
        mem0PrefetchRef.current = null;
      } else if (isFirstMessage && !mem0Context) {
        memContext = await searchMemories(text.trim());
        if (memContext) setMem0Context(memContext);
      }

      // Current date/time — always injected so agents can reason about deadlines and timing
      const now = new Date();
      const dateCtx = `CURRENT DATE & TIME: ${now.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${now.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })} (Quebec / Eastern Time)`;

      // Roleplay debrief: trigger after 5 user exchanges
      if (sessionMode === 'roleplay') {
        roleplayExchangeRef.current += 1;
        if (roleplayExchangeRef.current === 5) {
          // Trigger debrief after this message is sent
          setTimeout(() => {
            const debriefNotice = {
              id: `system-debrief-${Date.now()}`,
              type: 'system',
              content: lang === 'fr'
                ? '🎭 **5 échanges complétés — DÉBRIEF en cours...** Tous tes conseillers analysent ta performance.'
                : '🎭 **5 exchanges completed — DEBRIEF in progress...** All your advisors are analyzing your performance.',
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, debriefNotice]);
            sendMessage('__ROLEPLAY_DEBRIEF__');
          }, 500);
        }
      }

      const winsCtx   = formatWinsContext(wins, lang);
      const pulseCtx = pulseScore ? formatPulseContext(pulseScore, lang) : null;
      const checkInCtx = checkInData ? (lang === 'fr'
        ? `CHECK-IN MATINAL DE SAMUEL: Énergie ${checkInData.emoji} (${checkInData.energieScore}/10) · Priorité #1: "${checkInData.priority}"${checkInData.blocker ? ` · Blocage: "${checkInData.blocker}"` : ''}`
        : `SAMUEL'S MORNING CHECK-IN: Energy ${checkInData.emoji} (${checkInData.energieScore}/10) · #1 Priority: "${checkInData.priority}"${checkInData.blocker ? ` · Blocker: "${checkInData.blocker}"` : ''}`) : null;
      const emotionCtx = formatEmotionContext(lang);

      // ── Gmail context injection ───────────────────────────────────────────────
      // When email keywords are present AND Gmail is connected, inject unread emails
      // into the agent's context so they can analyze them directly.
      // Skip if the explicit intercept already handled this message (returns early above).
      const EMAIL_INJECT_KEYWORDS = ['email', 'emails', 'mail', 'mails', 'boîte', 'inbox', 'reçu', 'received'];
      const isExplicitEmailCheck  = EMAIL_CHECK_TRIGGERS.some((t) => lowerInput.includes(t));
      const shouldInjectEmails    = !attachment
        && !isExplicitEmailCheck
        && gmailConnected
        && EMAIL_INJECT_KEYWORDS.some((kw) => lowerInput.includes(kw));

      let gmailCtxBlock = null;
      if (shouldInjectEmails) {
        const tokens = getGmailTokens();
        if (tokens?.access_token) {
          try {
            const emailSummary = await gmailService.readGmailInboxContext(tokens.access_token);
            if (emailSummary && emailSummary !== 'Aucun email non lu.') {
              gmailCtxBlock = `EMAILS NON LUS DE L'UTILISATEUR:\n${emailSummary}\n\nTu as accès à ces emails. Analyse-les et réponds en conséquence.`;
            }
          } catch { /* silent — don't block the agent call */ }
        }
      }
      // ── End Gmail injection ───────────────────────────────────────────────────

      const combinedContext = [gmailCtxBlock, dateCtx, pulseCtx, checkInCtx, emotionCtx, winsCtx, financialContext, historyContext, memContext, calendarContext].filter(Boolean).join('\n\n') || null;
      // Meeting Room: maturity suffix tells agents how directive/reactive to be this session
      const maturityCtx = getMaturityPhase(sessionCount);
      const result = await runSession(
        text.trim() || (attachment?.type === 'image' ? `Analyze this image and give me strategic advice.` : `Analyze the attached file: ${attachment?.name}`),
        messages.filter((m) => m.type === 'user' || m.type === 'agent'),
        sessionMode,
        deepMode,
        agentNames,
        (agent) => { setIsReadingImage(false); setThinkingAgent(agent); },
        activeFocus,
        combinedContext,
        attachment,
        streamCallbacks,
        thinkingMode,
        conversationState,
        lang,
        maturityCtx?.behaviorSuffix || ''
      );

      // Flush any pending RAF token update
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        const id = streamingMsgIdRef.current;
        const text = streamAccumRef.current;
        if (id) setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: text } : m));
      }

      setThinkingAgent(null);
      setIsSearching(false);

      if (result.type === 'agents' || result.type === 'synthesizer') {
        // Log emotional state for pattern memory
        if (result.routing?.emotionalState) {
          logEmotionState(result.routing.emotionalState, sessionIdRef.current);
        }

        // Identify which agent was streamed (its message is already in state)
        const streamedId = streamingMsgIdRef.current;
        const streamedAgent = result.routing?.lead || (result.responses[0]?.agent);

        // Finalize streaming message (remove streaming flag, add routing)
        if (streamedId) {
          setMessages((prev) => prev.map((m) =>
            m.id === streamedId ? { ...m, streaming: false, routing: result.routing || null } : m
          ));
          streamingMsgIdRef.current = null;
        }

        // Add supporting agent responses (skip the one that was streamed)
        const supportingMsgs = result.responses
          .filter((r) => r.agent !== streamedAgent || !streamedId)
          .map((r) => ({
            id: `agent-${r.agent}-${Date.now()}-${Math.random()}`,
            type: 'agent',
            agent: r.agent,
            content: r.content,
            routing: result.routing || null,
            timestamp: new Date(),
            pdfDrop: isPdfDrop,
          }));

        if (supportingMsgs.length > 0) {
          setMessages((prev) => [...prev, ...supportingMsgs]);
        }

        playDing(soundEnabled);

        // Track last spoke per agent
        const now = Date.now();
        setAgentLastSpoke((prev) => {
          const next = { ...prev };
          result.responses.forEach((r) => { next[r.agent] = now; });
          return next;
        });

        // Step 4: Post-response Mem0 pre-fetch — search based on lead response so next message is instant
        const prefetchText = result.responses?.[0]?.content || '';
        if (prefetchText.length > 50) {
          searchMemories(prefetchText.slice(0, 200)).then((mem) => {
            if (mem) mem0PrefetchRef.current = mem;
          }).catch(() => {});
        }

        // Steps 2 & 6: Update conversation state — active agent, thread depth, last question
        if (result.activeAgent) {
          const leadResp = result.responses?.find((r) => r.agent === result.activeAgent)?.content || '';
          const isClosure = /\b(ok|merci|c'est bon|on passe|parfait|noted|thanks|got it)\b/i.test(text.toLowerCase());
          setConversationState((prev) => {
            const isNewAgent = prev.activeAgent !== result.activeAgent;
            const shouldReset = isClosure || result.wasTopicShift || prev.threadDepth >= 5;
            return {
              activeAgent: result.activeAgent,
              threadDepth: shouldReset ? 0 : (isNewAgent ? 0 : prev.threadDepth + 1),
              lastQuestion: extractLastQuestion(leadResp),
              topicLocked: !shouldReset && !isNewAgent && (prev.topicLocked || prev.threadDepth > 0),
            };
          });
        }

        // ── Update topic tracker with whatever agents just said ──────────
        try {
          const allAgentText = (result.responses || []).map((r) => r.content).join('\n');
          updateTopicTracker(allAgentText);
        } catch { /* ignore */ }

        // ── Layer 1 + 3: Interjection pass ──────────────────────────────
        // Only 1 interjection per turn. Cooldown handled by interjectCooldownRef.
        // Skip entirely if: isFocus mode (single agent by design), if result
        // already has supporting agents that said something, or cooldown active.
        const leadAgentKey = result.activeAgent;
        const leadResponse = result.responses?.find((r) => r.agent === leadAgentKey)?.content || '';
        const supportingSpoke = (result.responses || []).filter((r) => r.agent !== leadAgentKey && r.content && r.content.trim() !== '—').length > 0;
        const focusMode = sessionMode === 'focus' || sessionMode === 'prepCall' || sessionMode === 'negotiation' || sessionMode === 'debate' || sessionMode === 'analysis';

        if (leadAgentKey && leadResponse && !supportingSpoke && !focusMode && !interjectCooldownRef.current) {
          (async () => {
            try {
              const staleTopics = getStaleTopics(Date.now())
                .filter((s) => s.agent !== leadAgentKey); // don't surface pressure for the lead's own domain
              const interject = await analyzeInterjection({
                leadAgent:    leadAgentKey,
                userMessage:  text,
                leadResponse,
                staleTopics,
                lang,
              });
              if (!interject) return;
              // Cooldown: skip interjections on the next turn
              interjectCooldownRef.current = true;
              setTimeout(() => { interjectCooldownRef.current = false; }, 30_000);
              // Small visual delay so the interjection lands like a natural beat
              await new Promise((r) => setTimeout(r, 400));
              setMessages((prev) => [...prev, {
                id:        `interject-${Date.now()}-${interject.agent}`,
                type:      'agent',
                agent:     interject.agent,
                content:   interject.content,
                streaming: false,
                timestamp: new Date(),
                meta:      { source: 'interject', trigger: interject.trigger, leadAgent: leadAgentKey },
              }]);
              console.log('[Interject]', interject.agent, 'via', interject.trigger);
            } catch (err) {
              console.warn('[Interject] failed:', err.message);
            }
          })();
        }
      }
    } catch (err) {
      // Clean up streaming state on error
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (streamingMsgIdRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== streamingMsgIdRef.current));
        streamingMsgIdRef.current = null;
      }
      setThinkingAgent(null);
      setIsSearching(false);
      setIsReadingImage(false);
      setIsThinkingDeep(false);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function endSession() {
    setIsLoading(true);
    setSessionEnded(true);

    const conversationMessages = messages.filter((m) => m.type === 'user' || m.type === 'agent');
    // Update per-agent depth counter
    setAgentDepth(updateAgentDepth(conversationMessages));

    try {
      const [consensus, summary] = await Promise.all([
        callConsensus(conversationMessages, lang),
        archiveSession(conversationMessages, lang),
      ]);

      if (consensus) setConsensusLine(consensus);

      const sessionObj = {
        id: sessionIdRef.current,
        date: new Date().toISOString(),
        mode: sessionMode,
        messages: conversationMessages,
        consensusLine: consensus || null,
        summary: summary || null,
      };

      // Save to local history
      saveSession(sessionObj);

      // Sync to Supabase (fire-and-forget)
      syncSession(sessionObj);
      if (summary?.keyDecisions?.length) {
        syncDecisions(summary.keyDecisions, sessionIdRef.current);
      }

      // Save to Mem0 long-term memory (fire-and-forget)
      addSessionMemory(conversationMessages, consensus || null, summary || null);
      if (summary) addArchivistMemory(summary);

      // Toast — session saved
      toast(
        lang === 'fr' ? 'Session sauvegardée ✓' : 'Session saved ✓',
        { type: 'success', duration: 3000 }
      );

      if (summary) {
        setSessionSummary(summary);

        if (summary.improvements?.length > 0) {
          const newItems = summary.improvements.map((imp) => ({
            ...imp,
            id: `${Date.now()}-${Math.random()}`,
            sessionId: sessionIdRef.current,
            status: 'todo',
          }));
          setImprovementJournal((prev) => [...prev, ...newItems]);
          newItems.forEach((item) => syncImprovementItem(item));
        }

        if (summary.keyDecisions?.length > 0) {
          setDecisions((prev) => [...prev, ...summary.keyDecisions]);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function goHome() {
    setScreen('home');
    setMessages([]);
    setSessionEnded(false);
    setSessionSummary(null);
    setConsensusLine(null);
    setError(null);
    setReplaySession(null);
    setSessionStarted(false);
  }

  function openReplay() {
    // Build current session object from live state
    const sessionObj = {
      id: sessionIdRef.current,
      date: new Date().toISOString(),
      mode: sessionMode,
      messages: messages.filter((m) => m.type === 'user' || m.type === 'agent' || m.type === 'system'),
      consensusLine,
      summary: sessionSummary,
    };
    setReplaySession(sessionObj);
    setScreen('replay');
  }

  function updateAgentName(agentKey, newName) {
    const next = { ...agentNames, [agentKey]: newName };
    setAgentNames(next);
    syncAgentNames(next);
  }
  function updateAgentPhoto(agentKey, url)   { setAgentPhotos((p) => ({ ...p, [agentKey]: url })); }

  async function connectCalendar() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    try {
      const token = await connectGoogleCalendar(clientId);
      setCalendarToken(token);
      console.log('[GCal] token obtained, fetching events...');
      const evts = await fetchCalendarEvents(token);
      console.log('[GCal] setCalendarEvents with', evts?.length ?? 'null', 'events');
      if (evts) setCalendarEvents(evts);
      else setError('Calendar connected but could not fetch events. Check console.');
    } catch (err) {
      console.error('[GCal] connectCalendar error:', err);
      setError(err.message);
    }
  }

  function disconnectCalendar() {
    clearCalendarToken();
    setCalendarToken(null);
    setCalendarEvents([]);
  }

  async function handleConnectGmail() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) { setError('VITE_GOOGLE_CLIENT_ID manquant dans .env'); return; }
    try {
      await connectGmail(clientId);
      setGmailConnected(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDisconnectGmail() {
    clearGmailTokens();
    setGmailConnected(false);
    setGmailEmails([]);
    setUrgentEmailCount(0);
    clearSeenIds();
  }

  // ── Global Floating Input handler ─────────────────────────────────────────
  // Called from any non-chat page. Navigates to a Quick Advice session and
  // auto-sends the message once ChatScreen is mounted.
  function handleGlobalSend(text) {
    const msg = text.trim();
    if (!msg) return;

    // Step 2 — Prospects page: pre-load prospect context if name matched
    let finalMsg = msg;
    if (screen === 'prospects') {
      try {
        const list  = JSON.parse(localStorage.getItem('hq_prospects') || '[]');
        const match = list.find((p) =>
          p.name && msg.toLowerCase().includes(p.name.toLowerCase())
        );
        if (match) {
          const company = match.company ? ` — ${match.company}` : '';
          const status  = match.status  ? ` — Statut: ${match.status}` : '';
          finalMsg = `[Prospect: "${match.name}"${company}${status}]\n${msg}`;
        }
      } catch { /* ignore */ }
    }

    pendingGlobalMsg.current = finalMsg;

    if (sessionStarted && screen !== 'chat') {
      // Active session in a side panel — jump back to chat and inject
      setScreen('chat');
    } else if (!sessionStarted) {
      // No session yet — start a quick one; effect below will send the message
      startSession(null, 'quick');
    }
  }

  // Auto-send pending global message once we land on the chat screen
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (screen === 'chat' && sessionStarted && pendingGlobalMsg.current) {
      const msg = pendingGlobalMsg.current;
      pendingGlobalMsg.current = null;
      // Small delay so ChatScreen finishes mounting
      setTimeout(() => sendMessage(msg), 200);
    }
  }, [screen, sessionStarted]);

  async function handleApplyDashboardUpdate(msgId, { updateType, amount, clientName, label, category, isRecurring, retainerId }) {
    try {
      const amt = Math.round(Number(amount));
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid amount');

      if (updateType === 'mrr+') {
        const ts = Date.now();
        const newRetainer = { id: ts, name: clientName, amount: amt, startedAt: ts, lastTouchedAt: ts, workflow: null };
        setDashboard((prev) => ({
          ...prev,
          retainers: [...(prev.retainers || []), newRetainer],
        }));
        syncRetainer(newRetainer);
      } else if (updateType === 'mrr-') {
        let removedId = null;
        setDashboard((prev) => {
          const list = prev.retainers || [];
          let idx = retainerId ? list.findIndex((r) => String(r.id) === String(retainerId)) : -1;
          if (idx === -1) {
            const lower = (clientName || '').toLowerCase();
            idx = list.findIndex((r) => String(r.name || '').toLowerCase().includes(lower) && Number(r.amount) === amt);
            if (idx === -1) idx = list.findIndex((r) => String(r.name || '').toLowerCase().includes(lower));
            if (idx === -1) idx = list.findIndex((r) => Number(r.amount) === amt);
          }
          if (idx === -1) {
            console.warn('[Dashboard mrr-] no retainer matched, no-op');
            return prev;
          }
          removedId = list[idx].id;
          return { ...prev, retainers: list.filter((_, i) => i !== idx) };
        });
        if (removedId) syncRetainerDelete(removedId);
      } else if (updateType === 'one-time') {
        const now = new Date();
        const monthIdx = now.getMonth();
        const year     = now.getFullYear();
        const entry = {
          id:         Date.now(),
          clientName: clientName || (lang === 'fr' ? 'Client inconnu' : 'Unknown client'),
          amount:     amt,
          monthIdx,
          year,
          date:       now.toISOString(),
          sessionId:  sessionIdRef.current,
        };
        setDashboard((prev) => {
          const months = [...(prev.monthlyRevenue || [])];
          if (!months[monthIdx]) return prev;
          months[monthIdx] = {
            ...months[monthIdx],
            revenue: (Number(months[monthIdx].revenue) || 0) + amt,
          };
          return {
            ...prev,
            monthlyRevenue:   months,
            oneTimeRevenues: [...(prev.oneTimeRevenues || []), entry],
          };
        });
        // Fire-and-forget cloud sync (silent fail if table missing)
        syncOneTimeRevenue(entry);
      } else if (updateType === 'expense') {
        const now = new Date();
        const monthIdx = now.getMonth();
        const year     = now.getFullYear();
        setDashboard((prev) => {
          const months = [...(prev.monthlyRevenue || [])];
          if (!months[monthIdx]) return prev;
          months[monthIdx] = {
            ...months[monthIdx],
            expenses: (Number(months[monthIdx].expenses) || 0) + amt,
          };
          return { ...prev, monthlyRevenue: months };
        });
        // Fire-and-forget Supabase sync for expense ledger
        syncExpense({
          monthIdx,
          year,
          category:    category || 'other',
          amount:      amt,
          label:       label || '',
          isRecurring: !!isRecurring,
          sessionId:   sessionIdRef.current,
        });
      } else {
        throw new Error('Unknown updateType');
      }

      // Transition the preview message to the applied state
      setMessages((prev) => prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              type: 'dashboard-update-applied',
              applied: true,
              amount: amt,
              clientName: clientName || m.clientName,
              label: label || m.label,
              category: category || m.category,
            }
          : m
      ));

      const toastLabel = updateType === 'mrr+'    ? `+$${amt}/mo`
                      : updateType === 'mrr-'    ? `−$${amt}/mo`
                      : updateType === 'expense' ? `−$${amt}${isRecurring ? '/mo' : ''}`
                      : `+$${amt}`;
      toast(
        lang === 'fr' ? `Dashboard : ${toastLabel} ✓` : `Dashboard: ${toastLabel} ✓`,
        { type: 'success', duration: 2800 }
      );
    } catch (err) {
      console.warn('[Dashboard apply] error:', err.message);
      setError(err.message);
    }
  }

  async function handleApplyPipelineUpdate(msgId, { prospectId, newStatus, prospectName }) {
    try {
      const list = loadLS('hq_prospects', []);
      if (!Array.isArray(list)) throw new Error('Prospects list unavailable');
      const idx = list.findIndex((p) => String(p.id) === String(prospectId));
      if (idx === -1) throw new Error('Prospect not found');

      const now = Date.now();
      const updated = {
        ...list[idx],
        status:    newStatus,
        updatedAt: now,
      };
      // Stamp signedAt when transitioning into Signé — used by Dashboard sorting
      if (newStatus === 'Signé' && !list[idx].signedAt) updated.signedAt = now;

      list[idx] = updated;
      localStorage.setItem('hq_prospects', JSON.stringify(list));

      // Transition the preview message to the applied state
      setMessages((prev) => prev.map((m) =>
        m.id === msgId
          ? { ...m, type: 'pipeline-update-applied', applied: true }
          : m
      ));

      // Bump a local tick so any consumer reading prospects re-renders
      setDashboard((d) => ({ ...d }));

      toast(
        lang === 'fr' ? `${prospectName} → ${newStatus} ✓` : `${prospectName} → ${newStatus} ✓`,
        { type: 'success', duration: 2800 }
      );
    } catch (err) {
      console.warn('[Pipeline apply] error:', err.message);
      setError(err.message);
    }
  }

  async function handleCreateCalendarEvent(msgId, { summary, startISO, endISO, description }) {
    const token = getCalendarToken();
    if (!token) {
      setError(lang === 'fr' ? 'Calendar non connecté — reconnecte depuis l\'accueil.' : 'Calendar not connected — reconnect from home screen.');
      return;
    }
    try {
      const result = await createCalendarEvent(token, { summary, startISO, endISO, description });
      // Mark the preview message as created and attach the htmlLink
      setMessages((prev) => prev.map((m) =>
        m.id === msgId
          ? { ...m, type: 'calendar-event-created', created: true, title: summary, startISO, endISO, htmlLink: result.htmlLink }
          : m
      ));
      // Refresh in-memory calendar so future context injections include the new event
      fetchCalendarEvents(token).then((evts) => { if (evts) setCalendarEvents(evts); }).catch(() => {});
      toast(
        lang === 'fr' ? 'Event créé ✓' : 'Event created ✓',
        { type: 'success', duration: 2800 }
      );
    } catch (err) {
      if (err.message === 'UNAUTHORIZED' || err.message === 'SCOPE_INSUFFICIENT') {
        clearCalendarToken();
        setCalendarEvents([]);
        setError(lang === 'fr'
          ? 'Session Calendar expirée ou permission manquante — reconnecte depuis l\'accueil (permission d\'écriture requise).'
          : 'Calendar session expired or missing permission — reconnect from home (write permission required).');
      } else {
        setError(err.message);
      }
    }
  }

  async function handleBatchFollowupSend(msgId, { items, batchId }) {
    const tokens = getGmailTokens();
    if (!tokens) {
      setError(lang === 'fr' ? 'Gmail non connecté — reconnecte depuis l\'accueil.' : 'Gmail not connected — reconnect from home.');
      return;
    }
    const sessionId = sessionIdRef.current;
    const results = [];

    // Send sequentially with a 500ms gap to avoid spam-trigger heuristics
    for (const it of items) {
      try {
        await gmailService.sendEmail(tokens.access_token, it.email, it.subject, it.body, null);
        results.push({ ...it, status: 'sent' });
        // Update prospect.lastContactAt in localStorage + push contactHistory entry
        try {
          const list = loadLS('hq_prospects', []);
          const idx = list.findIndex((p) => String(p.id) === String(it.prospectId));
          if (idx !== -1) {
            const now = Date.now();
            const prev = list[idx];
            list[idx] = {
              ...prev,
              lastContactAt: now,
              contactHistory: [
                { date: now, type: 'followup', subject: it.subject, note: `Relance batch: ${it.subject}` },
                ...(prev.contactHistory || []),
              ].slice(0, 30),
            };
            localStorage.setItem('hq_prospects', JSON.stringify(list));
          }
        } catch { /* ignore localStorage write failure */ }

        syncFollowupLog({
          id:           `${batchId}-${it.prospectId || Math.random().toString(36).slice(2, 9)}`,
          prospectId:   it.prospectId,
          prospectName: it.prospectName,
          subject:      it.subject,
          body:         it.body,
          sentAt:       Date.now(),
          batchId,
          status:       'sent',
          sessionId,
        });
      } catch (err) {
        results.push({ ...it, status: 'failed', error: err.message });
        syncFollowupLog({
          id:           `${batchId}-${it.prospectId || Math.random().toString(36).slice(2, 9)}-fail`,
          prospectId:   it.prospectId,
          prospectName: it.prospectName,
          subject:      it.subject,
          body:         it.body,
          sentAt:       Date.now(),
          batchId,
          status:       'failed',
          sessionId,
        });
        if (err.message === 'UNAUTHORIZED') { clearGmailTokens(); setGmailConnected(false); break; }
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    const sent   = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    // Transition the preview message to the applied state
    setMessages((prev) => prev.map((m) => m.id === msgId
      ? { ...m, type: 'batch-followup-applied', applied: true, results, sent, failed }
      : m
    ));

    toast(
      lang === 'fr'
        ? `${sent} relance${sent !== 1 ? 's' : ''} envoyée${sent !== 1 ? 's' : ''}${failed > 0 ? ` · ${failed} échec${failed !== 1 ? 's' : ''}` : ''} ✓`
        : `${sent} follow-up${sent !== 1 ? 's' : ''} sent${failed > 0 ? ` · ${failed} failure${failed !== 1 ? 's' : ''}` : ''} ✓`,
      { type: sent > 0 ? 'success' : 'error', duration: 4000 }
    );
  }

  async function handleSendEmailReply(msgId, to, subject, body, threadId) {
    const tokens = getGmailTokens();
    if (!tokens) {
      setError(lang === 'fr' ? 'Gmail non connecté — reconnecte depuis l\'accueil.' : 'Gmail not connected — reconnect from home screen.');
      return;
    }
    try {
      await gmailService.sendEmail(tokens.access_token, to, subject, body, threadId);
      // Mark the draft message as sent
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, type: 'email-reply-sent', sent: true } : m
      ));
      toast(
        lang === 'fr' ? 'Email envoyé ✓' : 'Email sent ✓',
        { type: 'success', duration: 2800 }
      );
    } catch (err) {
      if (err.message === 'UNAUTHORIZED') { clearGmailTokens(); setGmailConnected(false); }
      setError(err.message);
    }
  }

  function updateDashboard(patch) {
    setDashboard((prev) => ({ ...prev, ...patch }));
  }

  function updateDecisionOutcome(id, outcome) {
    setDecisions((prev) => prev.map((d) => d.id === id ? { ...d, outcome } : d));
  }

  function updateImprovementStatus(id, status) {
    setImprovementJournal((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
    syncImprovementStatus(id, status);
  }
  function deleteImprovement(id) { setImprovementJournal((prev) => prev.filter((i) => i.id !== id)); }

  function logWin(winData) {
    const entry = saveWin({ ...winData, sessionId: sessionIdRef.current });
    setWins((prev) => [entry, ...prev].slice(0, 50));
  }

  function addFeedback(msgId, value) {
    setFeedbacks((prev) => {
      if (value === null) { const next = { ...prev }; delete next[msgId]; return next; }
      return { ...prev, [msgId]: value };
    });
    // Find the agent for this message to log it
    const msg = messages.find((m) => m.id === msgId);
    syncFeedback(sessionIdRef.current, msgId, msg?.agent || null, value);
  }

  const todoCount = improvementJournal.filter((i) => i.status !== 'done').length;

  return (
    <div className={`min-h-screen flex flex-col ${darkMode ? 'bg-gray-950' : ''}`} style={!darkMode ? { background: '#F5F4F0' } : {}}>
      <Header
        darkMode={darkMode}        onToggleDark={() => setDarkMode((d) => !d)}
        deepMode={deepMode}        onToggleDeep={() => setDeepMode((d) => !d)}
        thinkingMode={thinkingMode} onToggleThinking={() => setThinkingMode((t) => !t)}
        voiceMode={voiceMode}       onToggleVoice={() => setVoiceMode((v) => !v)}
        lang={lang}                onToggleLang={toggleLang}
        saveStatus={saveStatus}
        screen={screen}
        onGoHome={goHome}
        onGoJournal={() => setScreen(screen === 'journal' ? (sessionStarted ? 'chat' : 'home') : 'journal')}
        onGoDecisions={() => setScreen(screen === 'decisions' ? (sessionStarted ? 'chat' : 'home') : 'decisions')}
        onGoDashboard={() => setScreen(screen === 'dashboard' ? (sessionStarted ? 'chat' : 'home') : 'dashboard')}
        onGoProspects={() => setScreen(screen === 'prospects' ? (sessionStarted ? 'chat' : 'home') : 'prospects')}
        onGoLibrary={() => setScreen(screen === 'library' ? (sessionStarted ? 'chat' : 'home') : 'library')}
        onGoWorkflow={() => setScreen(screen === 'workflow' ? (sessionStarted ? 'chat' : 'home') : 'workflow')}
        onGoEmail={() => { setUrgentEmailCount(0); setScreen(screen === 'dashboard' ? (sessionStarted ? 'chat' : 'home') : 'dashboard'); }}
        urgentEmailCount={urgentEmailCount}
        sessionEnded={sessionEnded}
        onEndSession={endSession}
        isLoading={isLoading}
        improvementCount={todoCount}
        decisionsCount={decisions.length}
        onShowTour={() => setShowTour(true)}
      />

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Home — shown before any session starts */}
        {screen === 'home' && (
          <div key="home" className="animate-screen-in flex-1 flex flex-col min-h-0 overflow-hidden">
          <HomeScreen
            sessionMode={sessionMode}   onSetMode={setSessionMode}
            agentNames={agentNames}     onUpdateAgentName={updateAgentName}
            agentPhotos={agentPhotos}   onUpdateAgentPhoto={updateAgentPhoto}
            agentLastSpoke={agentLastSpoke}
            focusAgent={focusAgent}     onSetFocusAgent={setFocusAgent}
            onStart={startSession}
            darkMode={darkMode}
            lang={lang}
            streak={streak}
            dailyQuote={dailyQuote}
            momentumMirror={momentumMirror}
            greeting={greeting}
            dashboard={dashboard}
            calendarEvents={calendarEvents}
            calendarConnected={!!calendarToken}
            onConnectCalendar={connectCalendar}
            onDisconnectCalendar={disconnectCalendar}
            hasCalendarClientId={!!import.meta.env.VITE_GOOGLE_CLIENT_ID}
            gmailConnected={gmailConnected}
            onConnectGmail={handleConnectGmail}
            onDisconnectGmail={handleDisconnectGmail}
            hasGmailClientId={!!import.meta.env.VITE_GOOGLE_CLIENT_ID}
            wins={wins}
            agentDepth={agentDepth}
          />
          </div>
        )}

        {/* Chat — always mounted once a session starts, never unmounts during session */}
        {sessionStarted && screen !== 'replay' && (
          <ChatScreen
            messages={messages}
            isLoading={isLoading}
            sessionEnded={sessionEnded}
            sessionSummary={sessionSummary}
            consensusLine={consensusLine}
            improvementJournal={improvementJournal}
            agentNames={agentNames}
            agentPhotos={agentPhotos}
            darkMode={darkMode}
            lang={lang}
            error={error}
            onSendMessage={sendMessage}
            onUpdateImprovementStatus={updateImprovementStatus}
            sessionMode={sessionMode}
            feedbacks={feedbacks}
            onFeedback={addFeedback}
            thinkingAgent={thinkingAgent}
            isSearching={isSearching}
            isReadingImage={isReadingImage}
            isThinkingDeep={isThinkingDeep}
            sessionCount={sessionCount}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled((s) => !s)}
            focusAgent={focusAgent}
            agentLastSpoke={agentLastSpoke}
            onEndSession={endSession}
            onGoHome={goHome}
            onReplay={sessionEnded ? openReplay : null}
            onGetVerdict={!sessionEnded ? () => sendMessage('Give me the verdict') : null}
            onLogWin={logWin}
            onShowContentGen={() => setShowContentGen(true)}
            onShowProspectAnalyzer={() => setShowProspectAnalyzer(true)}
            activeAgent={conversationState.activeAgent}
            onInputChange={handleChatInputChange}
            onReaction={(text, agentKey) => sendMessage(text, null, agentKey)}
            onSecondOpinion={(agentKey, originalContent) => {
              const prompt = lang === 'fr'
                ? `Donne-moi ta perspective sur ce point de vue. Apporte un angle différent ou complémentaire :\n\n"${originalContent.slice(0, 600)}"`
                : `Give me your perspective on this viewpoint. Bring a different or complementary angle:\n\n"${originalContent.slice(0, 600)}"`;
              sendMessage(prompt, null, agentKey);
            }}
            onSendEmailReply={handleSendEmailReply}
            onCreateCalendarEvent={handleCreateCalendarEvent}
            onApplyPipelineUpdate={handleApplyPipelineUpdate}
            onApplyDashboardUpdate={handleApplyDashboardUpdate}
            onBatchFollowupSend={handleBatchFollowupSend}
            onToast={toast}
          />
        )}

        {/* Replay — full-screen replacement */}
        {screen === 'replay' && (
          <ReplayScreen
            session={replaySession}
            agentNames={agentNames}
            agentPhotos={agentPhotos}
            darkMode={darkMode}
            onBack={() => setScreen('chat')}
          />
        )}

        {/* Side panels — slide over chat when session active, render normally otherwise */}
        {screen === 'journal' && (
          <div className={`${sessionStarted ? 'absolute inset-0 z-20 animate-panel-in' : 'flex-1 animate-screen-in'} flex flex-col overflow-hidden ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
            {sessionStarted && <BackToChatBar darkMode={darkMode} onBack={() => setScreen('chat')} />}
            <JournalScreen
              improvementJournal={improvementJournal}
              darkMode={darkMode}
              lang={lang}
              onUpdateImprovementStatus={updateImprovementStatus}
              onDeleteImprovement={deleteImprovement}
            />
          </div>
        )}

        {screen === 'decisions' && (
          <div className={`${sessionStarted ? 'absolute inset-0 z-20 animate-panel-in' : 'flex-1 animate-screen-in'} flex flex-col overflow-hidden ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
            {sessionStarted && <BackToChatBar darkMode={darkMode} onBack={() => setScreen('chat')} />}
            <DecisionsScreen
              decisions={decisions}
              darkMode={darkMode}
              lang={lang}
              onUpdateOutcome={updateDecisionOutcome}
            />
          </div>
        )}

        {screen === 'dashboard' && (
          <div className={`${sessionStarted ? 'absolute inset-0 z-20 animate-panel-in' : 'flex-1 animate-screen-in'} flex flex-col overflow-hidden ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
            {sessionStarted && <BackToChatBar darkMode={darkMode} onBack={() => setScreen('chat')} />}
            <DashboardScreen
              data={dashboard}
              onUpdate={updateDashboard}
              darkMode={darkMode}
              lang={lang}
              onStartSession={startSession}
              onGoProspects={() => setScreen('prospects')}
            />
          </div>
        )}

        {screen === 'prospects' && (
          <div className={`${sessionStarted ? 'absolute inset-0 z-20 animate-panel-in' : 'flex-1 animate-screen-in'} flex flex-col overflow-hidden`}>
            {sessionStarted && <BackToChatBar darkMode={darkMode} onBack={() => setScreen('chat')} />}
            <ProspectsScreen darkMode={darkMode} />
          </div>
        )}

        {screen === 'library' && (
          <div className={`${sessionStarted ? 'absolute inset-0 z-20 animate-panel-in' : 'flex-1 animate-screen-in'} flex flex-col overflow-hidden ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
            {sessionStarted && <BackToChatBar darkMode={darkMode} onBack={() => setScreen('chat')} />}
            <LibraryScreen darkMode={darkMode} lang={lang} />
          </div>
        )}

        {screen === 'workflow' && (
          <div className={`${sessionStarted ? 'absolute inset-0 z-20 animate-panel-in' : 'flex-1 animate-screen-in'} flex flex-col overflow-auto ${darkMode ? 'bg-gray-950' : ''}`} style={!darkMode ? { background: '#F5F4F0' } : {}}>
            {sessionStarted && <BackToChatBar darkMode={darkMode} onBack={() => setScreen('chat')} />}
            <WorkflowBuilder darkMode={darkMode} lang={lang} />
          </div>
        )}
      </main>

      {/* Smart Notification Agent Ping */}
      {activeNotification && (
        <AgentPing
          notification={activeNotification}
          agentNames={agentNames}
          agentPhotos={agentPhotos}
          darkMode={darkMode}
          lang={lang}
          onDismiss={() => { dismissNotification(activeNotification.key); setActiveNotification(null); }}
          onStartSession={() => { dismissNotification(activeNotification.key); setActiveNotification(null); startSession(); }}
        />
      )}

      {/* Roleplay Scenario Picker */}
      {showScenarioPicker && (
        <ScenarioPicker
          darkMode={darkMode}
          lang={lang}
          onPick={(key) => { setShowScenarioPicker(false); startSession(key); }}
          onCancel={() => setShowScenarioPicker(false)}
        />
      )}

      {/* Daily Check-In overlay */}
      {showCheckIn && (
        <DailyCheckIn
          darkMode={darkMode}
          lang={lang}
          onComplete={(data) => { setCheckInData(data); setShowCheckIn(false); }}
        />
      )}

      {/* Business Pulse Score overlay */}
      {showPulse && pulseScore && (
        <PulseScoreCard
          pulse={pulseScore}
          darkMode={darkMode}
          lang={lang}
          onDismiss={() => setShowPulse(false)}
        />
      )}

      {/* Weekly Accountability Report overlay */}
      {showWeeklyReport && (
        <WeeklyReport
          reportText={weeklyReportText}
          dashboard={dashboard}
          streak={streak}
          sessionCount={sessionCount}
          darkMode={darkMode}
          lang={lang}
          onClose={() => setShowWeeklyReport(false)}
        />
      )}

      {/* Guided Tour */}
      {showTour && (
        <GuidedTour
          darkMode={darkMode}
          lang={lang}
          onClose={() => setShowTour(false)}
          onStartSession={() => { setShowTour(false); startSession(); }}
          currentPage={screen}
          onNavigate={(page) => setScreen(page)}
        />
      )}

      {/* Global Floating Input — permanent quick-access bar on all non-chat pages */}
      <GlobalFloatingInput
        screen={screen}
        lang={lang}
        darkMode={darkMode}
        agentNames={agentNames}
        agentPhotos={agentPhotos}
        activeAgent={conversationState.activeAgent}
        onSendGlobal={handleGlobalSend}
      />

      {/* Toast notifications */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <InstallPrompt darkMode={darkMode} lang={lang} />

      {/* Tour Launcher — floating bottom-right button */}
      <TourLauncher onStart={() => setShowTour(true)} isActive={showTour} />

      {/* Session Streak Milestone celebration */}
      {activeMilestone && (
        <MilestoneCelebration
          sessionCount={activeMilestone}
          darkMode={darkMode}
          lang={lang}
          onDismiss={() => setActiveMilestone(null)}
        />
      )}

      {/* Prospect Analyzer overlay */}
      {showProspectAnalyzer && (
        <ProspectAnalyzer
          dashboardContext={formatDashboardContext(dashboard)}
          darkMode={darkMode}
          lang={lang}
          onClose={() => setShowProspectAnalyzer(false)}
        />
      )}

      {/* Content Generator overlay */}
      {showContentGen && (
        <ContentGenerator
          sessionMessages={messages}
          dashboardContext={formatDashboardContext(dashboard)}
          winsContext={formatWinsContext(wins, lang)}
          darkMode={darkMode}
          lang={lang}
          onClose={() => setShowContentGen(false)}
        />
      )}
    </div>
  );
}

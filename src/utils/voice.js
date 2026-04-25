/**
 * Voice utilities — OpenAI Whisper for STT, Web Speech API for TTS.
 *
 * STT: MediaRecorder captures audio → POST multipart to /api/whisper proxy →
 *      Whisper returns high-quality transcription (French-Canadian native).
 *      Works on ALL modern browsers including Firefox.
 * TTS: speechSynthesis (native browser). Widely supported.
 */

// ─── Feature detection ────────────────────────────────────────────────────
export function isMicSupported() {
  if (typeof window === 'undefined') return false;
  return !!(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

export function isTTSSupported() {
  if (typeof window === 'undefined') return false;
  return !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

// ─── STT: MediaRecorder + Whisper ─────────────────────────────────────────
// Whisper benefits from a prompt hint to bias vocabulary — we feed it the
// business-specific words QG uses a lot so transcriptions of agent/client
// names come out right. Built dynamically so the user's actual name biases
// the transcription too.
function getUserNameForVoice() {
  try {
    const raw = localStorage.getItem('qg_user_profile_v1');
    if (!raw) return '';
    const p = JSON.parse(raw);
    return (p?.name || '').trim();
  } catch { return ''; }
}

function whisperPromptHint(lang) {
  const userName = getUserNameForVoice();
  const namePart = userName ? `${userName}, ` : '';
  if (lang === 'fr') {
    return namePart + 'NT Solutions, Bouclier 5 Étoiles, Répondeur Intelligent, Revenant, PC Glow Up, ' +
      'Motion Composites, Hormozi, Cardone, Robbins, Gary Vee, Naval, Chris Voss. ' +
      'Contexte : agence IA au Québec, prospects, retainers, MRR, dashboard, pipeline.';
  }
  return namePart + 'NT Solutions, Hormozi, Cardone, Robbins, Gary Vee, Naval, Chris Voss. ' +
    'Context: AI agency in Quebec, prospects, retainers, MRR, dashboard, pipeline.';
}
const WHISPER_PROMPT_HINT_FR = whisperPromptHint('fr');
const WHISPER_PROMPT_HINT_EN = whisperPromptHint('en');

// Pick the best supported audio MIME for this browser
function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
  }
  return '';
}

async function transcribeBlob(blob, lang = 'fr') {
  const filename = blob.type.includes('webm')
    ? 'audio.webm'
    : blob.type.includes('ogg')
    ? 'audio.ogg'
    : blob.type.includes('mp4')
    ? 'audio.mp4'
    : 'audio.bin';
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', 'whisper-1');
  form.append('language', lang === 'en' || lang === 'en-US' ? 'en' : 'fr');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  form.append('prompt', lang === 'en' ? WHISPER_PROMPT_HINT_EN : WHISPER_PROMPT_HINT_FR);

  const res = await fetch('/api/whisper', { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Whisper ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return String(data?.text || '').trim();
}

/**
 * Create an audio recorder backed by MediaRecorder + Whisper transcription.
 *
 * Callbacks:
 *   onStart()              — recording began (mic permission granted)
 *   onStop()               — user-triggered stop; audio is now being uploaded
 *   onTranscribing()       — upload done, waiting for Whisper response
 *   onFinal(text)          — final transcript from Whisper
 *   onError(errorMessage)  — anything that went wrong
 */
export function createAudioRecorder({
  lang = 'fr-CA',
  onStart, onStop, onTranscribing, onFinal, onError,
} = {}) {
  if (!isMicSupported()) return null;

  let mediaRecorder = null;
  let stream = null;
  let chunks = [];
  let state = 'idle'; // 'idle' | 'recording' | 'transcribing'
  let cancelled = false;

  const cleanup = () => {
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    stream = null;
    mediaRecorder = null;
    chunks = [];
  };

  return {
    get state() { return state; },

    async start() {
      if (state !== 'idle') return;
      cancelled = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        onError?.(err?.name === 'NotAllowedError' ? 'permission_denied' : (err?.message || 'mic_error'));
        return;
      }
      const mimeType = pickMimeType();
      try {
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch (err) {
        cleanup();
        onError?.(err?.message || 'recorder_error');
        return;
      }

      chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onerror = (e) => {
        onError?.(e?.error?.message || 'recorder_error');
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || mimeType || 'audio/webm' });
        cleanup();
        if (cancelled || blob.size === 0) { state = 'idle'; return; }
        state = 'transcribing';
        onTranscribing?.();
        try {
          const text = await transcribeBlob(blob, lang);
          state = 'idle';
          onFinal?.(text);
        } catch (err) {
          state = 'idle';
          onError?.(err.message || 'transcribe_failed');
        }
      };

      try {
        mediaRecorder.start();
        state = 'recording';
        onStart?.();
      } catch (err) {
        cleanup();
        onError?.(err?.message || 'start_failed');
      }
    },

    stop() {
      if (state !== 'recording' || !mediaRecorder) return;
      onStop?.();
      try { mediaRecorder.stop(); } catch { /* ignore */ }
      // onstop handler takes over — sets state to 'transcribing'
    },

    cancel() {
      cancelled = true;
      if (state === 'recording' && mediaRecorder) {
        try { mediaRecorder.stop(); } catch { /* ignore */ }
      }
      cleanup();
      state = 'idle';
    },
  };
}

// ─── TTS: text → speech ───────────────────────────────────────────────────
// Voices load async in some browsers — this resolves once the list is ready.
let voicesCache = null;
export function getVoices() {
  if (!isTTSSupported()) return Promise.resolve([]);
  if (voicesCache && voicesCache.length) return Promise.resolve(voicesCache);
  return new Promise((resolve) => {
    const initial = window.speechSynthesis.getVoices();
    if (initial.length) { voicesCache = initial; resolve(initial); return; }
    const handler = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) { voicesCache = v; resolve(v); }
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
    // Fallback timeout — some browsers never fire voiceschanged
    setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), 1500);
  });
}

// Per-agent voice shape: { rate, pitch, voiceHints[] }
// voiceHints = preferred voice name fragments to pick from the OS voices list
export const AGENT_VOICE_PROFILES = {
  HORMOZI:     { rate: 0.98, pitch: 0.85, voiceHints: ['daniel', 'tom', 'alex',   'thomas'] },
  CARDONE:     { rate: 1.15, pitch: 1.05, voiceHints: ['aaron', 'fred', 'nicolas', 'reed'] },
  ROBBINS:     { rate: 0.92, pitch: 0.90, voiceHints: ['thomas', 'henri', 'bruce', 'evan'] },
  GARYV:       { rate: 1.20, pitch: 1.00, voiceHints: ['fred', 'samantha', 'aaron'] },
  NAVAL:       { rate: 0.88, pitch: 0.82, voiceHints: ['alex', 'daniel', 'henri'] },
  VOSS:        { rate: 0.90, pitch: 0.78, voiceHints: ['daniel', 'thomas', 'bruce'] },
  SYNTHESIZER: { rate: 1.00, pitch: 1.00, voiceHints: ['samantha', 'karen', 'audrey'] },
  COORDINATOR: { rate: 1.05, pitch: 0.95, voiceHints: ['samantha', 'audrey', 'fred'] },
};

const DEFAULT_PROFILE = { rate: 1.0, pitch: 1.0, voiceHints: [] };

function pickVoice(voices, lang, hints = []) {
  if (!voices?.length) return null;
  const localeFilter = lang === 'en' || lang === 'en-US'
    ? (v) => v.lang && v.lang.toLowerCase().startsWith('en')
    : (v) => v.lang && v.lang.toLowerCase().startsWith('fr');
  const localeVoices = voices.filter(localeFilter);
  const pool = localeVoices.length ? localeVoices : voices;

  // Try each hint as case-insensitive substring match on voice.name
  for (const h of hints) {
    const hit = pool.find((v) => (v.name || '').toLowerCase().includes(h.toLowerCase()));
    if (hit) return hit;
  }
  // Prefer "local" voices when no hint matches (usually higher quality)
  const local = pool.find((v) => v.localService);
  return local || pool[0] || null;
}

// Strip markdown / emojis / code artefacts before speaking
function cleanForSpeech(text) {
  if (!text) return '';
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')               // code blocks
    .replace(/`([^`]+)`/g, '$1')                    // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')              // bold
    .replace(/\*([^*]+)\*/g, '$1')                  // italic
    .replace(/^#{1,6}\s+/gm, '')                    // headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // markdown links
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emojis
    .replace(/\s+/g, ' ')
    .trim();
}

// Speak text with an agent's voice profile. Returns a Promise that resolves
// when speech finishes (or is cancelled).
export async function speak(text, { agent = null, lang = 'fr' } = {}) {
  if (!isTTSSupported()) return false;
  const cleaned = cleanForSpeech(text);
  if (!cleaned) return false;

  cancelSpeech(); // avoid queueing pile-ups

  const profile = (agent && AGENT_VOICE_PROFILES[agent]) || DEFAULT_PROFILE;
  const voices = await getVoices();
  const voice = pickVoice(voices, lang, profile.voiceHints);

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(cleaned);
    u.rate  = profile.rate;
    u.pitch = profile.pitch;
    u.lang  = lang === 'en' || lang === 'en-US' ? 'en-US' : 'fr-CA';
    if (voice) u.voice = voice;
    u.onend   = () => resolve(true);
    u.onerror = () => resolve(false);
    window.speechSynthesis.speak(u);
  });
}

export function cancelSpeech() {
  if (!isTTSSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

export function isSpeaking() {
  if (!isTTSSupported()) return false;
  return window.speechSynthesis.speaking;
}

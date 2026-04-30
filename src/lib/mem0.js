/**
 * Mem0 integration — routes through /api/mem0 serverless proxy to avoid CORS.
 * In development (localhost): calls the proxy via Vite's dev server (needs vercel dev).
 * In production (Vercel): /api/mem0 is a serverless function.
 * All calls are fire-and-forget with silent fallback.
 */

import { getUserId } from '../utils/userId.js';

// Per-device unique ID so each tester's memories are isolated. Resolved lazily
// at first call site (not at module load) so the value reflects whatever is
// currently in localStorage even if it changed between hot-reloads.
const APP_ID = 'the-headquarters';

// Routes through Vite's built-in dev proxy (vite.config.js) which injects the API key server-side.
// /api/mem0/add    → https://api.mem0.ai/v1/memories/
// /api/mem0/search → https://api.mem0.ai/v1/memories/search/
// /api/mem0/list   → https://api.mem0.ai/v1/memories/?user_id=X&app_id=Y
// /api/mem0/delete → https://api.mem0.ai/v1/memories/{id}/
const PROXY_PATHS = {
  add:    '/api/mem0/add',
  search: '/api/mem0/search',
  list:   '/api/mem0/list',
  delete: '/api/mem0/delete',
};

export function isMem0Enabled() {
  return !!import.meta.env.VITE_MEM0_API_KEY;
}

async function callProxy(action, body) {
  const path = PROXY_PATHS[action];
  if (!path) {
    console.warn(`[Mem0] unknown action: ${action}`);
    return null;
  }

  try {
    const res = await fetch(path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[Mem0] ${action} HTTP ${res.status}:`, text);
      return null;
    }

    return await res.json();
  } catch (e) {
    console.warn(`[Mem0] ${action} failed:`, e.message);
    return null;
  }
}

// ─── At session START: search relevant memories ───────────────────────────────

export async function searchMemories(userInput) {
  if (!isMem0Enabled() || !userInput?.trim()) return null;

  const results = await callProxy('search', {
    query:   userInput.trim(),
    user_id: getUserId(),
    app_id:  APP_ID,
    limit:   5,
  });

  const items = Array.isArray(results) ? results : (results?.results || []);
  if (!items.length) return null;

  const lines = items
    .filter((r) => r.memory)
    .map((r) => `  - ${r.memory}`)
    .join('\n');

  if (!lines) return null;

  console.log('[Mem0] injecting', items.length, 'memories into context.');
  return `{NAME}'S MEMORY (from past sessions — reference naturally if relevant):\n${lines}`;
}

// ─── CRUD for Memory Viewer UI ───────────────────────────────────────────────

export async function listAllMemories() {
  if (!isMem0Enabled()) return [];
  try {
    const params = new URLSearchParams({ user_id: getUserId(), app_id: APP_ID, page: '1', page_size: '100' });
    const res = await fetch(`${PROXY_PATHS.list}?${params}`, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text();
      console.warn('[Mem0] list HTTP', res.status, text);
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data?.results || data?.memories || []);
    return items
      .filter((m) => m && (m.id || m.memory_id) && (m.memory || m.content))
      .map((m) => ({
        id:        m.id || m.memory_id,
        memory:    m.memory || m.content || '',
        createdAt: m.created_at || m.createdAt || null,
        updatedAt: m.updated_at || m.updatedAt || null,
        metadata:  m.metadata || {},
      }));
  } catch (e) {
    console.warn('[Mem0] list failed:', e.message);
    return [];
  }
}

export async function deleteMemory(id) {
  if (!isMem0Enabled() || !id) return false;
  try {
    const res = await fetch(`${PROXY_PATHS.delete}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text();
      console.warn('[Mem0] delete HTTP', res.status, text);
      return false;
    }
    console.log('[Mem0] deleted memory', id);
    return true;
  } catch (e) {
    console.warn('[Mem0] delete failed:', e.message);
    return false;
  }
}

export async function addManualMemory(text) {
  if (!isMem0Enabled() || !text?.trim()) return false;
  const result = await callProxy('add', {
    messages: [{ role: 'user', content: text.trim() }],
    user_id:  getUserId(),
    app_id:   APP_ID,
    metadata: { type: 'manual', date: new Date().toISOString() },
  });
  if (result) {
    console.log('[Mem0] manual memory added.');
    return true;
  }
  return false;
}

// ─── At session START: fetch memories for recap card ─────────────────────────
// Broader query than searchMemories — asks for state/wins/blockers/next moves.
// Returns array of raw memory strings (up to 8), or null if nothing relevant.
export async function fetchMemoriesForRecap() {
  if (!isMem0Enabled()) return null;

  const results = await callProxy('search', {
    query:   "{name}'s recent wins, blockers, decisions, and next moves for his business",
    user_id: getUserId(),
    app_id:  APP_ID,
    limit:   8,
  });

  const items = Array.isArray(results) ? results : (results?.results || []);
  const memories = items.map((r) => r.memory).filter(Boolean);
  if (!memories.length) return null;

  console.log('[Mem0] fetched', memories.length, 'memories for session recap.');
  return memories;
}

// ─── At session END: save full conversation ───────────────────────────────────

export async function addSessionMemory(messages, consensusLine, summary) {
  if (!isMem0Enabled() || !messages?.length) return;

  const conversation = messages
    .filter((m) => m.type === 'user' || m.type === 'agent')
    .map((m) => ({
      role:    m.type === 'user' ? 'user' : 'assistant',
      content: m.type === 'user' ? m.content : `[${m.agent}]: ${m.content}`,
    }));

  if (consensusLine) {
    conversation.push({ role: 'assistant', content: `[SYNTHESIZER]: ${consensusLine}` });
  }

  if (!conversation.length) return;

  const result = await callProxy('add', {
    messages: conversation,
    user_id:  getUserId(),
    app_id:   APP_ID,
    metadata: {
      consensus:        consensusLine || null,
      consensus_action: summary?.consensusAction || null,
      session_date:     new Date().toISOString(),
    },
  });

  if (result) console.log('[Mem0] session memories saved.');
}

// ─── After Archivist: save compressed key facts ───────────────────────────────

export async function addArchivistMemory(summary) {
  if (!isMem0Enabled() || !summary) return;

  const facts = [];
  if (summary.consensusAction) {
    facts.push(`{name}'s HQ aligned action: ${summary.consensusAction}`);
  }
  if (summary.keyDecisions?.length) {
    summary.keyDecisions.forEach((d) => {
      const text  = typeof d === 'string' ? d : d.decision;
      const agent = typeof d === 'string' ? null : d.agent;
      facts.push(agent ? `[${agent}] decided: ${text}` : `Decided: ${text}`);
    });
  }

  if (!facts.length) return;

  const result = await callProxy('add', {
    messages: facts.map((f) => ({ role: 'assistant', content: f })),
    user_id:  getUserId(),
    app_id:   APP_ID,
    metadata: { type: 'archivist_summary', date: new Date().toISOString() },
  });

  if (result) console.log('[Mem0] archivist summary saved:', facts.length, 'facts.');
}

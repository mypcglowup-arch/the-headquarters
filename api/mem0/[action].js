/**
 * Vercel serverless proxy for Mem0 API — dynamic catch-all for sub-paths.
 *
 * Handles 4 client paths (mirrors src/lib/mem0.js + vite.config.js dev proxy) :
 *   POST   /api/mem0/add       → POST   https://api.mem0.ai/v1/memories/
 *   POST   /api/mem0/search    → POST   https://api.mem0.ai/v1/memories/search/
 *   GET    /api/mem0/list?...  → GET    https://api.mem0.ai/v1/memories/?...
 *   DELETE /api/mem0/delete?id=ABC → DELETE https://api.mem0.ai/v1/memories/ABC/
 *
 * Vercel routes /api/mem0/<anything> to this file via the [action] dynamic
 * segment. The action name is read from the URL path, not the body, so GET
 * and DELETE requests (which have no body) work correctly.
 *
 * Returns 404-style JSON `{ memories: [] }` on upstream errors instead of
 * propagating the upstream HTTP error — keeps the client's "no memories yet"
 * fallback path working, never breaks the UI when Mem0 is offline.
 */

const BASE = 'https://api.mem0.ai/v1';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey = process.env.MEM0_API_KEY || process.env.VITE_MEM0_API_KEY;
  if (!apiKey) {
    console.warn('[api/mem0] MEM0_API_KEY missing — returning empty result');
    res.status(200).json({ memories: [], results: [] });
    return;
  }

  // Vercel exposes the dynamic [action] param via req.query
  const action = String(req.query?.action || '').toLowerCase();

  // Build upstream URL + method per action
  let upstreamUrl  = '';
  let upstreamMethod = req.method;
  let upstreamBody  = null;

  if (action === 'add' && req.method === 'POST') {
    upstreamUrl = `${BASE}/memories/`;
    upstreamMethod = 'POST';
    upstreamBody = JSON.stringify(req.body || {});
  } else if (action === 'search' && req.method === 'POST') {
    upstreamUrl = `${BASE}/memories/search/`;
    upstreamMethod = 'POST';
    upstreamBody = JSON.stringify(req.body || {});
  } else if (action === 'list' && req.method === 'GET') {
    // Forward query params (user_id, app_id, page, page_size)
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === 'action') continue;
      qs.set(k, String(v));
    }
    upstreamUrl = `${BASE}/memories/${qs.toString() ? '?' + qs.toString() : ''}`;
    upstreamMethod = 'GET';
  } else if (action === 'delete' && (req.method === 'DELETE' || req.method === 'GET')) {
    const id = req.query?.id;
    if (!id) { res.status(400).json({ error: 'missing id' }); return; }
    upstreamUrl = `${BASE}/memories/${encodeURIComponent(id)}/`;
    upstreamMethod = 'DELETE';
  } else {
    res.status(400).json({ error: `Unsupported action/method: ${action}/${req.method}` });
    return;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method:  upstreamMethod,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Token ${apiKey}`,
      },
      ...(upstreamBody ? { body: upstreamBody } : {}),
    });

    // Read upstream as text first so we can surface the raw error if the
    // body isn't JSON (Mem0 occasionally returns HTML on 5xx).
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }

    // On non-2xx, log server-side but return a soft empty payload so the UI
    // doesn't blow up. The client's fire-and-forget pattern handles `[]`
    // gracefully ; a real error response would have surfaced as a console
    // warning anyway.
    if (!upstream.ok) {
      console.warn(`[api/mem0/${action}] upstream ${upstream.status}:`, text.slice(0, 200));
      res.status(200).json({ memories: [], results: [], _upstreamStatus: upstream.status });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    console.warn(`[api/mem0/${action}] fetch failed:`, err?.message);
    res.status(200).json({ memories: [], results: [], _error: err?.message });
  }
}

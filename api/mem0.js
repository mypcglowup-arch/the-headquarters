/**
 * Vercel serverless proxy for Mem0 API.
 * Routes: POST /api/mem0?action=add|search|get
 * Keeps the API key server-side, avoids CORS.
 */
export default async function handler(req, res) {
  // CORS headers — allow requests from any origin (your deployed app)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.VITE_MEM0_API_KEY || process.env.MEM0_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'MEM0_API_KEY not set' }); return; }

  const { action, ...body } = req.body;
  const BASE = 'https://api.mem0.ai/v1';

  const endpointMap = {
    add:    { url: `${BASE}/memories/`,        method: 'POST' },
    search: { url: `${BASE}/memories/search/`, method: 'POST' },
    get:    { url: `${BASE}/memories/`,        method: 'GET'  },
  };

  const endpoint = endpointMap[action];
  if (!endpoint) { res.status(400).json({ error: `Unknown action: ${action}` }); return; }

  try {
    const upstream = await fetch(endpoint.url, {
      method:  endpoint.method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Token ${apiKey}`,
      },
      ...(endpoint.method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

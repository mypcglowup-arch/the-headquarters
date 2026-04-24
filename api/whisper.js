/**
 * Vercel serverless proxy for OpenAI Whisper transcriptions.
 * Route: POST /api/whisper  (multipart/form-data body)
 *
 * Buffers the incoming multipart body and forwards it to OpenAI with the
 * Authorization header injected server-side. Preserves the multipart
 * boundary via the original Content-Type header.
 *
 * Env: OPENAI_API_KEY (no VITE_ prefix — server-side only).
 */

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // CORS — allow the deployed app to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not set' });
    return;
  }

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    res.status(400).json({ error: 'Expected multipart/form-data' });
    return;
  }

  try {
    // Buffer the incoming multipart body — Whisper accepts ≤ 25 MB
    const chunks = [];
    let total = 0;
    const MAX = 25 * 1024 * 1024;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX) {
        res.status(413).json({ error: 'Audio exceeds 25 MB' });
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': contentType, // preserve the multipart boundary string
      },
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    // Pass through JSON if possible, else raw
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      res.setHeader('Content-Type', 'text/plain');
      res.send(text);
    }
  } catch (err) {
    console.error('[api/whisper] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

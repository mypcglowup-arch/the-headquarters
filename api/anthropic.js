/**
 * Vercel serverless proxy for the Anthropic Messages API.
 *
 * Goal : keep ANTHROPIC_API_KEY out of the client bundle. The browser hits
 * /api/anthropic with a normal Anthropic body shape ; this function injects
 * the key server-side and forwards to api.anthropic.com.
 *
 * Streaming : when body.stream === true, the upstream SSE response is piped
 * back chunk-by-chunk so token-by-token UI updates keep working.
 *
 * Rate limit : 60 requests / minute / IP, in-memory per instance. Resets on
 * cold-start. Adequate for personal-app abuse deterrence ; for higher SLA
 * swap the bucket for Upstash Redis or Vercel KV.
 */

// ── In-memory rate limit ────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 60;
const rateLimitMap         = new Map();

function checkRateLimit(ip) {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000),
    };
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

// Periodic cleanup so dropped IPs don't accumulate indefinitely
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref?.();

// ── Streaming requires the Node.js runtime (default), not Edge ──────────────
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // CORS — allow same-origin (the deployed app)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, anthropic-version, anthropic-beta');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress
          || 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.retryAfter);
    res.status(429).json({ error: 'rate_limited', retryAfter: rl.retryAfter });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));

  // Server-side API key — never reaches the client. Accept VITE_ prefix as
  // transitional fallback so existing .env files keep working.
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' }); return; }

  // Forward only the headers Anthropic actually consumes. Strip everything
  // else (cookies, custom client headers) so nothing leaks upstream.
  const upstreamHeaders = {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
  };
  if (req.headers['anthropic-beta']) upstreamHeaders['anthropic-beta'] = req.headers['anthropic-beta'];

  const body     = req.body || {};
  const isStream = body.stream === true;

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: upstreamHeaders,
      body:    JSON.stringify(body),
    });
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable', message: e.message });
    return;
  }

  res.status(upstream.status);

  if (isStream && upstream.ok && upstream.body) {
    // SSE pass-through. Forward chunks as they arrive — no buffering.
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disables proxy buffering on some runtimes

    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      // Best effort — client likely closed the connection. Just end.
    } finally {
      res.end();
    }
    return;
  }

  // Non-streaming (or upstream error before stream started) — forward as JSON
  try {
    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: 'upstream_read_failed', message: e.message });
  }
}

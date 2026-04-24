// ─── Gmail REST API service ───────────────────────────────────────────────────

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

// ─── Base64 URL-safe decode with UTF-8 support ───────────────────────────────

function base64Decode(data) {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    try { return atob(b64); } catch { return ''; }
  }
}

// ─── MIME body extractor (handles multipart) ─────────────────────────────────

function extractBody(payload) {
  if (!payload) return '';

  // text/plain — preferred
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64Decode(payload.body.data);
  }
  // text/html — strip tags
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = base64Decode(payload.body.data);
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);
  }
  // Multipart: recurse
  if (payload.parts?.length) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain) return extractBody(plain);
    const html  = payload.parts.find((p) => p.mimeType === 'text/html');
    if (html)  return extractBody(html);
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return '';
}

// ─── Parse raw Gmail message → readable object ───────────────────────────────

function parseEmail(raw) {
  const headers = raw.payload?.headers || [];
  const h = (name) =>
    headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value || '';

  return {
    id:       raw.id,
    threadId: raw.threadId,
    from:     h('From'),
    to:       h('To'),
    subject:  h('Subject') || '(sans objet)',
    date:     h('Date'),
    snippet:  (raw.snippet || '').replace(/&#?\w+;/g, ' ').trim(),
    body:     extractBody(raw.payload),
    isUnread: (raw.labelIds || []).includes('UNREAD'),
    labels:   raw.labelIds || [],
  };
}

// ─── RFC 2822 encoder for Gmail send ─────────────────────────────────────────
// btoa(unescape(encodeURIComponent(msg))) handles UTF-8 content safely

function encodeRFC2822(to, subject, body) {
  const msg = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');

  return btoa(unescape(encodeURIComponent(msg)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── Business email filter ───────────────────────────────────────────────────
// Multi-layered: Gmail auto-categories (fast path) + sender patterns + subject
// patterns. Whitelist overrides blacklist so invoices from noreply@stripe.com
// don't get dropped.

// Gmail auto-categorization — anything in these categories is noise by default.
// CATEGORY_PERSONAL / no-category = real inbox → always kept unless sender matches noise patterns.
const EXCLUDED_GMAIL_CATEGORIES = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];

// Domains that are almost always noise (job boards, social notifications)
const NOISE_DOMAINS = [
  'indeed.com', 'indeedmail.com', 'indeed-',
  'linkedin.com',          // includes notifications@, invitations@, jobs-noreply@, etc.
  'glassdoor.com', 'glassdoor-',
  'monster.com', 'ziprecruiter.com', 'workopolis.com', 'jobillico.com',
  'welcome-to-the-jungle.com', 'jooble.org',
  'quora.com', 'medium.com', 'reddit.com',
  'meetup.com', 'eventbrite.com',
];

// Sender local-part / domain patterns = automated / bulk / transactional noise
const SYSTEM_SENDER_PATTERNS = [
  /\bno-?reply\b/i, /\bdo-?not-?reply\b/i, /\bdonotreply\b/i,
  /mailer-daemon/i, /postmaster/i,
  /\bnotifications?@/i, /\balerts?@/i, /\bnewsletter@/i,
  /\bmarketing@/i, /\bpromo@/i, /\boffers?@/i, /\bdeals@/i,
  /\bupdates?@/i, /\bnews@/i, /\bauto(?:matic)?@/i,
  /\bbounce(?:s|back)?@/i, /\bunsubscribe@/i,
];

// Subject hints for noise
const NOISE_SUBJECT_PATTERNS = [
  /your job alert/i, /votre alerte emploi/i, /new jobs? for you/i, /nouvelles offres d'emploi/i,
  /\bnewsletter\b/i, /unsubscribe/i, /se désabonner/i,
  /\d+\s*%\s*off\b/i, /\bspecial offer\b/i, /\boffre spéciale\b/i,
  /\bsale\b.*\bends\b/i, /\blast chance\b/i,
  /\bverify your (email|account)\b/i, /\bconfirm your (email|account)\b/i,
  /\bwelcome to\b/i, /\bwelcome aboard\b/i,
  /\bsecurity alert\b/i, /\balerte de sécurité\b/i, /\bsign.in\b.*\bdetected\b/i,
  /\bnouvelle connexion\b/i, /\bnew sign.in\b/i,
];

// Subject whitelist — real business signal that wins over blacklist
const BUSINESS_SUBJECT_WHITELIST = [
  /\binvoice\b/i, /\bfacture\b/i,
  /\breceipt\b/i, /\breçu\b/i,
  /\bpayment\b/i, /\bpaiement\b/i, /\bpaid\b/i, /\bpayé\b/i,
  /\bcontract\b/i, /\bcontrat\b/i,
  /\bproposal\b/i, /\bproposition\b/i,
  /\bquote\b/i, /\bdevis\b/i,
  /\bpurchase order\b/i, /\bbon de commande\b/i,
  /\bstatement\b/i, /\brelevé\b/i,
];

function extractEmailAddress(fromStr) {
  if (!fromStr) return '';
  const m = fromStr.match(/<([^>]+)>/);
  return (m ? m[1] : fromStr).toLowerCase().trim();
}

export function isBusinessEmail(email) {
  if (!email) return false;
  const fromAddress = extractEmailAddress(email.from);
  const subject     = String(email.subject || '').toLowerCase();
  const labels      = email.labels || [];

  // Whitelist wins — invoice from noreply@stripe.com is still an invoice
  if (BUSINESS_SUBJECT_WHITELIST.some((p) => p.test(subject))) return true;

  // Gmail auto-category (Google's own ML classifier — trust it first)
  if (labels.some((l) => EXCLUDED_GMAIL_CATEGORIES.includes(l))) return false;

  // Known noise domains
  if (NOISE_DOMAINS.some((d) => fromAddress.includes(d))) return false;

  // Automated sender patterns
  if (SYSTEM_SENDER_PATTERNS.some((p) => p.test(fromAddress))) return false;

  // Noise subject patterns
  if (NOISE_SUBJECT_PATTERNS.some((p) => p.test(subject))) return false;

  return true;
}

// ─── Fetch wrapper with 401 detection ────────────────────────────────────────

async function gmailFetch(token, path, options = {}) {
  const r = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (r.status === 401) throw new Error('UNAUTHORIZED');
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error?.message || `Gmail API ${r.status}`);
  }
  return r.json();
}

// ─── Public service ───────────────────────────────────────────────────────────

export const gmailService = {

  // Fetch up to 5 unread inbox emails — filtered to business-only
  // Strategy: over-fetch server-side (category:primary), then apply client-side
  // isBusinessEmail filter to catch anything that slipped through Gmail's ML.
  async getRecentEmails(token, maxResults = 10) {
    const q = encodeURIComponent('is:unread category:primary');
    const data = await gmailFetch(
      token,
      `/users/me/messages?q=${q}&labelIds=INBOX&maxResults=${Math.max(maxResults, 20)}`
    );
    if (!data.messages?.length) return [];

    // Fetch up to 15 full emails — filtering will reduce count
    const full = await Promise.all(
      data.messages.slice(0, 15).map(async (m) => {
        try { return await gmailFetch(token, `/users/me/messages/${m.id}?format=full`); }
        catch { return null; }
      })
    );
    const parsed = full.filter(Boolean).map(parseEmail);
    return parsed.filter(isBusinessEmail).slice(0, maxResults);
  },

  // Fetch a single full message
  async getMessage(token, id) {
    return gmailFetch(token, `/users/me/messages/${id}?format=full`);
  },

  // Mark a message as read
  async markAsRead(token, id) {
    return gmailFetch(token, `/users/me/messages/${id}/modify`, {
      method: 'POST',
      body:   JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
  },

  // Send an email
  async sendEmail(token, to, subject, body, threadId) {
    const raw     = encodeRFC2822(to, subject, body);
    const payload = { raw };
    if (threadId) payload.threadId = threadId;
    return gmailFetch(token, '/users/me/messages/send', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
  },

  // Full-body inbox reader for agent context injection — format=full, capped at 2000 chars.
  // Applies the same business-email filter so agents don't waste tokens on Indeed alerts.
  async readGmailInboxContext(token, maxResults = 5) {
    const BODY_CAP = 2000;

    try {
      const q = encodeURIComponent('is:unread category:primary');
      const data = await gmailFetch(
        token,
        `/users/me/messages?q=${q}&labelIds=INBOX&maxResults=${Math.max(maxResults, 15)}`
      );
      if (!data.messages?.length) return 'Aucun email business non lu.';

      const fullMessages = await Promise.all(
        data.messages.slice(0, 12).map(async (msg) => {
          try { return await gmailFetch(token, `/users/me/messages/${msg.id}?format=full`); }
          catch { return null; }
        })
      );

      // Apply the same isBusinessEmail filter by parsing each raw into the shape the filter expects
      const businessFull = fullMessages
        .filter(Boolean)
        .map((raw) => ({
          raw,
          parsed: parseEmail(raw),
        }))
        .filter(({ parsed }) => isBusinessEmail(parsed))
        .slice(0, maxResults);

      if (businessFull.length === 0) return 'Aucun email business non lu.';

      const emails = businessFull.map(({ raw, parsed }) => {
        // Reuse the module-level extractBody (handles multipart + UTF-8)
        let body = extractBody(raw.payload);
        const truncated = body.length > BODY_CAP;
        body = body.slice(0, BODY_CAP);
        if (truncated) body += '\n[Email tronqué à 2000 caractères]';

        return `De: ${parsed.from}\nSujet: ${parsed.subject}\nDate: ${parsed.date}\nCorps complet:\n${body}`;
      });

      return emails.join('\n\n---\n\n');
    } catch {
      return null;
    }
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

  getFromName(fromStr) {
    if (!fromStr) return 'Inconnu';
    const m = fromStr.match(/^"?([^"<]+)"?\s*<[^>]+>$/);
    return (m ? m[1].trim() : fromStr).slice(0, 40);
  },

  getFromEmail(fromStr) {
    if (!fromStr) return '';
    const m = fromStr.match(/<([^>]+)>/);
    return m ? m[1] : fromStr;
  },
};

// ─── Gmail OAuth — implicit popup flow (mirrors gcal.js) ─────────────────────
// Uses Google's implicit flow (response_type=token) so no client_secret is
// needed in the browser. Token is short-lived (~1h) and stored in localStorage.

const LS_KEY = 'hq_gmail_tokens';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ─── Token storage ────────────────────────────────────────────────────────────

export function getGmailTokens() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const tokens = JSON.parse(raw);
    // 60-second buffer before expiry
    if (Date.now() > tokens.expiry - 60_000) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return tokens;
  } catch {
    return null;
  }
}

export function saveGmailTokens(tokens) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(tokens)); } catch {}
}

export function clearGmailTokens() {
  localStorage.removeItem(LS_KEY);
}

export function isGmailConnected() {
  return !!getGmailTokens();
}

// ─── OAuth popup flow ─────────────────────────────────────────────────────────

export function connectGmail(clientId) {
  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin + '/auth/gmail/callback';

    const params = new URLSearchParams({
      client_id:              clientId,
      redirect_uri:           redirectUri,
      response_type:          'token',
      scope:                  GMAIL_SCOPES,
      include_granted_scopes: 'true',
      prompt:                 'select_account',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    const popup   = window.open(authUrl, 'gmail_auth', 'width=520,height=640,left=200,top=100');

    if (!popup) {
      reject(new Error('Popup bloqué — autorisez les popups et réessayez.'));
      return;
    }

    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          reject(new Error('Connexion annulée.'));
          return;
        }
        const hash = popup.location.hash;
        if (hash && hash.includes('access_token')) {
          clearInterval(timer);
          popup.close();

          const p         = new URLSearchParams(hash.slice(1));
          const token     = p.get('access_token');
          const expiresIn = parseInt(p.get('expires_in') || '3600', 10);
          const expiry    = Date.now() + expiresIn * 1000;

          // Fetch the connected email address
          fetch('https://www.googleapis.com/userinfo/v2/me', {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => (r.ok ? r.json() : { email: '' }))
            .then((info) => {
              const tokens = { access_token: token, expiry, email: info.email || '' };
              saveGmailTokens(tokens);
              resolve(tokens);
            })
            .catch(() => {
              const tokens = { access_token: token, expiry, email: '' };
              saveGmailTokens(tokens);
              resolve(tokens);
            });
        }
      } catch {
        // Still on Google's domain — keep polling
      }
    }, 500);

    // 3-minute timeout
    setTimeout(() => {
      clearInterval(timer);
      if (!popup.closed) popup.close();
      reject(new Error('Délai de connexion dépassé.'));
    }, 180_000);
  });
}

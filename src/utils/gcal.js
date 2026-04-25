const LS_TOKEN = 'qg_gcal_token_v1';
const SCOPES   = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

// ─── Token storage ────────────────────────────────────────────────────────────

export function getCalendarToken() {
  try {
    const raw = localStorage.getItem(LS_TOKEN);
    if (!raw) return null;
    const { token, expiry } = JSON.parse(raw);
    if (Date.now() > expiry - 60_000) {
      localStorage.removeItem(LS_TOKEN);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearCalendarToken() {
  localStorage.removeItem(LS_TOKEN);
}

// ─── OAuth 2.0 implicit flow (popup) ─────────────────────────────────────────

export function connectGoogleCalendar(clientId) {
  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin + '/auth/gmail/callback';
    const params = new URLSearchParams({
      client_id:              clientId,
      redirect_uri:           redirectUri,
      response_type:          'token',
      scope:                  SCOPES,
      include_granted_scopes: 'true',
      prompt:                 'select_account',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    const popup   = window.open(authUrl, 'gcal_auth', 'width=520,height=640,left=200,top=100');

    if (!popup) {
      reject(new Error('Popup blocked. Allow popups and try again.'));
      return;
    }

    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          reject(new Error('Auth cancelled.'));
          return;
        }
        // Will throw cross-origin error until Google redirects back to our origin
        const hash = popup.location.hash;
        if (hash && hash.includes('access_token')) {
          clearInterval(timer);
          popup.close();
          const p           = new URLSearchParams(hash.slice(1));
          const token       = p.get('access_token');
          const expiresIn   = parseInt(p.get('expires_in') || '3600', 10);
          const expiry      = Date.now() + expiresIn * 1000;
          localStorage.setItem(LS_TOKEN, JSON.stringify({ token, expiry }));
          resolve(token);
        }
      } catch {
        // Still on Google's domain — keep polling
      }
    }, 500);

    // Timeout after 3 minutes
    setTimeout(() => {
      clearInterval(timer);
      if (!popup.closed) popup.close();
      reject(new Error('Auth timed out.'));
    }, 180_000);
  });
}

// ─── Fetch events ─────────────────────────────────────────────────────────────

export async function fetchCalendarEvents(token) {
  const now      = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin:       now.toISOString(),
    timeMax:       in14Days.toISOString(),
    singleEvents:  'true',
    orderBy:       'startTime',
    maxResults:    '25',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error('[GCal] fetch failed', res.status, errBody);
    if (res.status === 401) {
      clearCalendarToken();
      return null;
    }
    throw new Error(errBody?.error?.message || `Calendar API error ${res.status}`);
  }

  const data = await res.json();
  console.log('[GCal] fetched', data.items?.length ?? 0, 'events', data.items);
  return data.items || [];
}

// ─── Create event ─────────────────────────────────────────────────────────────

export async function createCalendarEvent(token, { summary, startISO, endISO, description = '', location = '', timeZone = 'America/Montreal' }) {
  if (!token) throw new Error('UNAUTHORIZED');
  if (!summary || !startISO || !endISO) throw new Error('Missing required event fields');

  const body = {
    summary,
    description,
    location,
    start: { dateTime: startISO, timeZone },
    end:   { dateTime: endISO,   timeZone },
  };

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error('[GCal] create failed', res.status, errBody);
    if (res.status === 401) { clearCalendarToken(); throw new Error('UNAUTHORIZED'); }
    // Missing write scope — user connected before write was added
    if (res.status === 403 && /insufficient|scope/i.test(errBody?.error?.message || '')) {
      clearCalendarToken();
      throw new Error('SCOPE_INSUFFICIENT');
    }
    throw new Error(errBody?.error?.message || `Calendar API error ${res.status}`);
  }

  const data = await res.json();
  return { id: data.id, htmlLink: data.htmlLink, raw: data };
}

// ─── Format for agent context injection ───────────────────────────────────────

export function formatCalendarContext(events) {
  if (!events || events.length === 0) return null;

  const lines = events.map((e) => {
    const startRaw = e.start?.dateTime || e.start?.date;
    if (!startRaw) return null;
    const date    = new Date(startRaw);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = e.start?.dateTime
      ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : 'All day';
    const title   = e.summary || 'Untitled event';
    return `  - ${dateStr} ${timeStr}: ${title}`;
  }).filter(Boolean);

  if (lines.length === 0) return null;

  return `{NAME}'S CALENDAR — NEXT 14 DAYS:\n${lines.join('\n')}`;
}

// ─── Return all fetched events for HomeScreen (already scoped to 14 days) ────

export function getThisWeekEvents(events) {
  return events || [];
}

/**
 * Monday session auto-fire window.
 *
 * Rules:
 *   - Window opens Monday 8:00 local.
 *   - Window closes Wednesday 8:00 local (48h rattrapage).
 *   - If {name} opens before Monday 8am → wait.
 *   - If {name} opens Tue/Wed → still fire (rattrapage) but tag it as the
 *     previous Monday's session (so we don't double-fire if he opens both days).
 *   - Outside window (Wed 8am → Mon 8am) → null.
 */

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns { mondayIso, windowStart, windowEnd } if `now` is inside the active
 * Monday-session window, else null. mondayIso is the ISO date of the Monday
 * that anchors this window — used as the dedup key so a Tuesday rattrapage
 * doesn't double-fire with an earlier Monday fire.
 */
export function getMondayWindow(now = new Date()) {
  const day = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  let daysBackToMonday;

  if (day === 1) daysBackToMonday = 0;      // Monday
  else if (day === 2) daysBackToMonday = 1; // Tuesday
  else if (day === 3) daysBackToMonday = 2; // Wednesday
  else return null;                         // Thu/Fri/Sat/Sun — no window

  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - daysBackToMonday);
  windowStart.setHours(8, 0, 0, 0);

  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + 2); // Wed 8am

  if (now < windowStart) return null; // Monday before 8am
  if (now >= windowEnd) return null;  // Wed >= 8am (should be caught by day check, defense-in-depth)

  return {
    mondayIso: isoDate(windowStart),
    windowStart,
    windowEnd,
  };
}

/**
 * Convenience: should we fire a Monday session right now?
 * @param {string|null} lastFiredIso — value from localStorage qg_monday_session_date_v1
 * @param {Date} [now]
 * @returns {{ should: boolean, mondayIso: string|null }}
 */
export function shouldFireMondaySession(lastFiredIso, now = new Date()) {
  const win = getMondayWindow(now);
  if (!win) return { should: false, mondayIso: null };
  if (lastFiredIso === win.mondayIso) return { should: false, mondayIso: win.mondayIso };
  return { should: true, mondayIso: win.mondayIso };
}

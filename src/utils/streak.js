const LS_STREAK    = 'qg_streak_v1';
const LS_LAST_OPEN = 'qg_last_open_v1';

export function getStreak() {
  return parseInt(localStorage.getItem(LS_STREAK) || '0');
}

/** Call on app load. Returns updated streak count. */
export function updateStreak() {
  const today     = new Date().toDateString();
  const lastOpen  = localStorage.getItem(LS_LAST_OPEN);
  let streak      = getStreak();

  if (lastOpen === today) return streak; // already counted today

  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  streak = lastOpen === yesterday ? streak + 1 : 1;

  localStorage.setItem(LS_STREAK, String(streak));
  localStorage.setItem(LS_LAST_OPEN, today);
  return streak;
}

export function streakEmoji(streak) {
  if (streak >= 100) return '🏆';
  if (streak >= 50)  return '💎';
  if (streak >= 30)  return '🔥';
  if (streak >= 7)   return '⚡';
  return '📅';
}

export function getDayGreeting(name = '', lang = 'fr') {
  const h = new Date().getHours();
  // Drop the personalized vocative if no name is set, so the line stays clean.
  const personal = name && name.trim() ? `, ${name}` : '';
  const personalQ = name && name.trim() ? `, ${name} ?` : ' ?';
  if (lang === 'fr') {
    if (h < 5)  return `Encore debout${personalQ} Les disciplinés bâtissent pendant que les autres dorment.`;
    if (h < 12) return `Bonjour${personal}. On construit quoi aujourd'hui ?`;
    if (h < 14) return `Check du midi${personal}. Reste focus.`;
    if (h < 18) return `Bonne après-midi${personal}. Toujours dans le game.`;
    if (h < 21) return `Session du soir${personal}. Le meilleur moment pour réfléchir.`;
    return `Tu travailles tard${personalQ} Les meilleurs entrepreneurs ne s'arrêtent jamais.`;
  }
  const personalEn = name && name.trim() ? `, ${name}` : '';
  const personalEnQ = name && name.trim() ? `, ${name}?` : '?';
  if (h < 5)  return `Still up${personalEnQ} The disciplined build while others sleep.`;
  if (h < 12) return `Good morning${personalEn}. What are we building today?`;
  if (h < 14) return `Midday check-in${personalEn}. Stay sharp.`;
  if (h < 18) return `Good afternoon${personalEn}. Still in the game.`;
  if (h < 21) return `Evening session${personalEn}. Best time to think clearly.`;
  return `Working late${personalEnQ} The best entrepreneurs never stop.`;
}

export function formatLastSpoke(timestamp, lang = 'fr') {
  if (!timestamp) return null;
  const diff = Date.now() - timestamp;
  const min  = Math.floor(diff / 60_000);
  const hr   = Math.floor(diff / 3_600_000);
  const day  = Math.floor(diff / 86_400_000);
  if (lang === 'fr') {
    if (min < 2)   return 'À l\'instant';
    if (min < 60)  return `il y a ${min}m`;
    if (hr < 24)   return `il y a ${hr}h`;
    if (day === 1) return 'Hier';
    return `il y a ${day} jours`;
  }
  if (min < 2)   return 'Just now';
  if (min < 60)  return `${min}m ago`;
  if (hr < 24)   return `${hr}h ago`;
  if (day === 1) return 'Yesterday';
  return `${day} days ago`;
}

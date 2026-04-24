export function getDayGreeting(name = 'Samuel', lang = 'fr') {
  const h = new Date().getHours();
  if (lang === 'fr') {
    if (h < 5)  return `Encore debout, ${name} ? Les disciplinés bâtissent pendant que les autres dorment.`;
    if (h < 12) return `Bonjour, ${name}. On construit quoi aujourd'hui ?`;
    if (h < 14) return `Check du midi, ${name}. Reste focus.`;
    if (h < 18) return `Bonne après-midi, ${name}. Toujours dans le game.`;
    if (h < 21) return `Session du soir, ${name}. Le meilleur moment pour réfléchir.`;
    return `Tu travailles tard, ${name} ? Les meilleurs entrepreneurs ne s'arrêtent jamais.`;
  }
  if (h < 5)  return `Still up, ${name}? The disciplined build while others sleep.`;
  if (h < 12) return `Good morning, ${name}. What are we building today?`;
  if (h < 14) return `Midday check-in, ${name}. Stay sharp.`;
  if (h < 18) return `Good afternoon, ${name}. Still in the game.`;
  if (h < 21) return `Evening session, ${name}. Best time to think clearly.`;
  return `Working late, ${name}? The best entrepreneurs never stop.`;
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

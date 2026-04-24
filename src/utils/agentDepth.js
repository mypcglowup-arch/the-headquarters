const LS_DEPTH = 'qg_agent_depth_v1';
const MAX_DEPTH = 100;
export const DEPTH_MILESTONES = [10, 25, 50, 100];

export function loadAgentDepth() {
  try { return JSON.parse(localStorage.getItem(LS_DEPTH) || '{}'); } catch { return {}; }
}

/**
 * Call after a session ends. Increments count for each agent that participated.
 */
export function updateAgentDepth(sessionMessages) {
  const depth = loadAgentDepth();
  const agents = new Set(
    sessionMessages.filter((m) => m.type === 'agent' && m.agent).map((m) => m.agent)
  );
  agents.forEach((agent) => { depth[agent] = (depth[agent] || 0) + 1; });
  try { localStorage.setItem(LS_DEPTH, JSON.stringify(depth)); } catch {}
  return depth;
}

export function getDepthPct(count) {
  return Math.min(100, Math.round((count / MAX_DEPTH) * 100));
}

export function getDepthLabel(count, lang = 'fr') {
  if (count === 0) return lang === 'fr' ? 'Nouvelle relation' : 'New relationship';
  if (count < 10)  return lang === 'fr' ? `${count} session${count > 1 ? 's' : ''}` : `${count} session${count > 1 ? 's' : ''}`;
  if (count < 25)  return lang === 'fr' ? 'En développement' : 'Building rapport';
  if (count < 50)  return lang === 'fr' ? 'Relation établie' : 'Established';
  if (count < 100) return lang === 'fr' ? 'Profonde' : 'Deep bond';
  return lang === 'fr' ? 'Maître' : 'Mastery';
}

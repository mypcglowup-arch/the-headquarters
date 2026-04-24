/**
 * Topic Tracker — keyword-driven tracking of when key business topics were
 * last mentioned in the conversation. Powers the "Pression Silencieuse"
 * layer: if a critical topic has been silent for too long, the relevant
 * agent can slip a mention into the current conversation naturally.
 */

const LS_KEY = 'qg_topic_tracker_v1';

// Topic config — keywords cover both user and agent language (FR + EN)
export const TOPICS = {
  prospection: {
    agent:     'CARDONE',
    threshold: 5 * 86_400_000, // 5 days
    keywords: [
      // FR
      'prospect', 'prospection', 'outreach', 'démarche', 'démarchage',
      'relance', 'cold call', 'cold email', 'contacté', 'nouveau lead',
      'rendez-vous de vente', 'rdv de vente', 'appel de vente',
      // EN
      'cold outreach', 'lead gen', 'prospecting', 'new contact',
      'dialing', 'follow-up call',
    ],
  },
  pipeline: {
    agent:     'HORMOZI',
    threshold: 7 * 86_400_000, // 7 days
    keywords: [
      // FR
      'pipeline', 'entonnoir', 'funnel', 'deal', 'close', 'closer',
      'signature', 'signé', 'perdu', 'démo', 'demo', 'proposal',
      'proposition commerciale',
      // EN
      'closing', 'deal flow', 'proposal sent', 'demo booked',
    ],
  },
  finances: {
    agent:     'HORMOZI',
    threshold: 10 * 86_400_000, // 10 days
    keywords: [
      // FR
      'revenu', 'revenus', 'chiffre d\'affaires', 'ca du mois',
      'mrr', 'recettes', 'dépense', 'dépenses', 'expense', 'facture',
      'profit', 'marge', 'budget', 'cash', 'trésorerie',
      'ltv', 'cac', 'prix', 'pricing', 'tarif',
      // EN
      'monthly revenue', 'monthly recurring', 'cashflow', 'cash flow',
      'gross margin', 'burn rate',
    ],
  },
  strategy: {
    agent:     'NAVAL',
    threshold: 14 * 86_400_000, // 14 days
    keywords: [
      // FR
      'stratégie', 'vision', 'long terme', 'objectif annuel', 'roadmap',
      'positionnement', 'leverage', 'scalabilité', 'scalable',
      'système', 'automatisation', 'passif', 'revenu passif',
      // EN
      'long-term', 'scaling', 'leverage', 'passive income',
      'vision', 'north star', 'positioning',
    ],
  },
  content: {
    agent:     'GARYV',
    threshold: 10 * 86_400_000, // 10 days
    keywords: [
      // FR
      'contenu', 'post', 'publication', 'linkedin', 'tiktok', 'instagram',
      'audience', 'brand', 'marque', 'vidéo', 'podcast',
      // EN
      'content', 'posting', 'brand', 'audience', 'video content',
      'social media', 'personal brand',
    ],
  },
  negotiation: {
    agent:     'VOSS',
    threshold: 14 * 86_400_000, // 14 days
    keywords: [
      // FR
      'négociation', 'négocier', 'contre-offre', 'objection',
      'tactical empathy', 'accusation audit', 'mirroring', 'label',
      // EN
      'negotiation', 'counter-offer', 'objection', 'tactical empathy',
    ],
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function markTopicMentioned(topicKey, timestamp = Date.now()) {
  if (!TOPICS[topicKey]) return;
  const state = loadState();
  state[topicKey] = { lastMentionedAt: timestamp };
  saveState(state);
}

/**
 * Scan a chunk of text (user or agent) and mark every detected topic.
 * Uses simple substring match (lowercased). Case-insensitive, word-boundary-aware
 * for common terms. Returns the list of topic keys that matched.
 */
export function updateTopicTracker(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const [key, cfg] of Object.entries(TOPICS)) {
    for (const kw of cfg.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        hits.push(key);
        break; // one match per topic is enough
      }
    }
  }
  if (hits.length > 0) {
    const state = loadState();
    const now = Date.now();
    for (const key of hits) state[key] = { lastMentionedAt: now };
    saveState(state);
  }
  return hits;
}

/**
 * Returns topics that have been silent longer than their threshold, with
 * the agent owner and days-silent count. Sorted by daysSilent desc.
 */
export function getStaleTopics(now = Date.now()) {
  const state = loadState();
  const stale = [];
  for (const [key, cfg] of Object.entries(TOPICS)) {
    const lastMention = state[key]?.lastMentionedAt;
    // Never mentioned → consider stale after threshold if there's any app history
    const silence = lastMention ? now - lastMention : Infinity;
    if (silence >= cfg.threshold) {
      stale.push({
        topic:       key,
        agent:       cfg.agent,
        daysSilent:  lastMention ? Math.floor(silence / 86_400_000) : null, // null = never mentioned
        thresholdDays: Math.floor(cfg.threshold / 86_400_000),
      });
    }
  }
  return stale.sort((a, b) => (b.daysSilent ?? 999) - (a.daysSilent ?? 999));
}

// Return the timestamp of the last mention for a topic, or null
export function getLastMention(topicKey) {
  const state = loadState();
  return state[topicKey]?.lastMentionedAt ?? null;
}

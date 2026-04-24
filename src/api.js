import {
  BASE_CONTEXT,
  COORDINATOR_PROMPT,
  AGENT_PROMPTS,
  buildAgentPrompt,
  ARCHIVIST_PROMPT,
  CONSENSUS_PROMPT,
  getDailyQuotePrompt,
  getMomentumMirrorPrompt,
  ARCHITECT_QUESTIONS_SUFFIX,
  SYNTHESIZER_TRIGGERS,
  PREP_CALL_PROMPT,
  NEGOTIATION_PROMPT,
  ANALYSIS_PROMPT,
  MONDAY_REPORT_PROMPT,
  PROSPECT_VOSS_PROMPT,
  PROSPECT_HORMOZI_PROMPT,
  getLangInstruction,
  getRoleplayPrompt,
  getRoleplayDebriefPrompt,
} from './prompts.js';
import { getMomentumStats, getCachedMirror, setCachedMirror } from './utils/momentum.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey() {
  return import.meta.env.VITE_ANTHROPIC_API_KEY;
}

function getModel(deepMode) {
  return deepMode ? 'claude-opus-4-5' : 'claude-sonnet-4-5';
}

// Light/classification calls — 3× faster, same quality for routing/JSON tasks
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};

// Per-agent temperatures — expressive agents run hotter, analytical agents cooler
// Extended thinking (thinkingMode) forces temperature=1 per Anthropic spec
const AGENT_TEMPERATURES = {
  CARDONE:    0.9,
  GARYV:      0.85,
  ROBBINS:    0.8,
  VOSS:       0.6,
  BLACKSWAN:  0.6,
  HORMOZI:    0.3,
  NAVAL:      0.2,
  COORDINATOR: 0.1,
};
const DEFAULT_TEMPERATURE = 0.7;

// Inject PDF or image into the last user message
function injectAttachment(messages, attachment) {
  if (!attachment || (attachment.type !== 'pdf' && attachment.type !== 'image')) return messages;
  const copy = [...messages];
  const last = copy[copy.length - 1];
  if (!last || last.role !== 'user') return messages;
  const textContent = typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
  if (attachment.type === 'pdf') {
    copy[copy.length - 1] = {
      ...last,
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: attachment.base64 }, title: attachment.name },
        { type: 'text', text: textContent },
      ],
    };
  } else if (attachment.type === 'image') {
    copy[copy.length - 1] = {
      ...last,
      content: [
        { type: 'image', source: { type: 'base64', media_type: attachment.mimeType, data: attachment.base64 } },
        { type: 'text', text: textContent || 'Analyze this image.' },
      ],
    };
  }
  return copy;
}

async function callClaude(systemPrompt, messages, maxTokens = 600, deepMode = false, attachment = null, enableWebSearch = false, thinkingMode = false, agentKey = null, modelOverride = null) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    throw new Error('API key missing. Copy .env.example to .env and add your VITE_ANTHROPIC_API_KEY.');
  }

  let apiMessages = injectAttachment(messages, attachment);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  const betas = ['prompt-caching-2024-07-31'];
  if (enableWebSearch) betas.push('web-search-2025-03-05');
  if (thinkingMode) betas.push('interleaved-thinking-2025-05-14');
  headers['anthropic-beta'] = betas.join(',');

  const buildBody = (msgs) => {
    const tokens = thinkingMode ? Math.max(maxTokens, 9000) : maxTokens;
    const body = {
      model: modelOverride || getModel(deepMode),
      max_tokens: tokens,
      // Structured system with cache_control to enable prompt caching on the system prompt
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: msgs,
    };
    // Temperature: thinking mode forces 1 (Anthropic spec); otherwise use per-agent value
    if (!thinkingMode) {
      body.temperature = agentKey ? (AGENT_TEMPERATURES[agentKey] ?? DEFAULT_TEMPERATURE) : DEFAULT_TEMPERATURE;
    }
    if (enableWebSearch) body.tools = [WEB_SEARCH_TOOL];
    if (thinkingMode) body.thinking = { type: 'enabled', budget_tokens: 8000 };
    return body;
  };

  const doFetch = async (msgs) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody(msgs)),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }
    return response.json();
  };

  let data = await doFetch(apiMessages);

  // Agentic loop: chain multiple tool calls (web search, etc.) until end_turn
  let turns = 0;
  while ((data.stop_reason === 'tool_use' || data.stop_reason === 'end_turn') && turns < 8) {
    const toolUseBlocks = (data.content || []).filter(
      (b) => b.type === 'tool_use' || b.type === 'server_tool_use'
    );
    if (toolUseBlocks.length === 0) break;
    turns++;
    apiMessages = [...apiMessages, { role: 'assistant', content: data.content }];

    // For server-side tools (web_search), Anthropic fills results — we just acknowledge
    const toolResults = toolUseBlocks.map((b) => ({
      type: 'tool_result',
      tool_use_id: b.id,
      content: '',
    }));

    apiMessages = [...apiMessages, { role: 'user', content: toolResults }];
    data = await doFetch(apiMessages);
    if (data.stop_reason === 'end_turn') break;
  }

  // Extract text blocks only (skip server_tool_use / web_search_tool_result blocks)
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

// ─── Prospect Hunter — web search → structured JSON ──────────────────────────
export async function huntProspects({ city, type, count = 5 }) {
  const systemPrompt = `Tu es un chasseur de prospects expert pour NT Solutions, une agence québécoise qui offre "PC Glow Up Bouclier" à 150$/mois — un service qui améliore la présence Google des commerces locaux (plus d'avis, meilleure note, profil complet).

TON RÔLE: Utiliser la recherche web pour trouver de vrais commerces à ${city}, Québec, qui ont besoin de ce service — peu d'avis Google, note faible, ou profil incomplet.

POUR CHAQUE COMMERCE:
1. Cherche sur Google Maps / Google Search: "meilleur ${type} ${city}"
2. Sélectionne ceux avec < 30 avis OU note < 4★ OU profil incomplet
3. Visite leur site web pour trouver email et téléphone (page Contact)
4. Note ce qui manque sur leur profil Google

RETOURNE UNIQUEMENT du JSON valide, aucun texte autour, aucun markdown:
{
  "prospects": [{
    "businessName": "Nom exact",
    "type": "${type}",
    "city": "${city}",
    "phone": "450-000-0000 (vide si non trouvé)",
    "email": "contact@business.com (vide si non trouvé)",
    "website": "https://... (vide si non trouvé)",
    "googleReviews": 0,
    "googleRating": 0.0,
    "improvements": ["Heures d'ouverture manquantes","Peu de photos","Pas de réponse aux avis"],
    "notes": "Contexte bref: clientèle, années d'opération, spécialité.",
    "emailSubject": "Objet accrocheur 55 chars max",
    "suggestedMessage": "Message de prospection en français 130-160 mots, naturel, personnalisé au commerce, signe Samuel — NT Solutions. Mentionne leur manque d'avis spécifiquement.",
    "agentKey": "VOSS si score>=7 sinon CARDONE si score>=4 sinon HORMOZI"
  }]
}

CALCUL DU SCORE (pour déterminer agentKey): score = (10 - min(reviews,25))*0.4 + (5-rating)*0.6, borné 1-10. Si score>=7 → VOSS, si score>=4 → CARDONE, sinon → HORMOZI.`;

  const result = await callClaude(
    systemPrompt,
    [{ role: 'user', content: `Trouve exactement ${count} ${type}s à ${city}, Québec avec peu d'avis Google. Cherche sur le web et retourne le JSON complet.` }],
    8000, false, null, true,
  );

  const clean = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\{[\s\S]*"prospects"[\s\S]*\}/);
  if (!match) throw new Error('Format de réponse invalide — relance la prospection');
  return JSON.parse(match[0]).prospects || [];
}

// ─── Agent tone map (used by adaptive message engine) ─────────────────────────
const AGENT_TONE_MAP = {
  VOSS:    'Chris Voss (négociateur FBI) — empathie tactique, questions calibrées "Est-ce que c\'est juste de dire que…", ton calme, jamais agressif, crée un espace de sécurité pour le prospect',
  CARDONE: 'Grant Cardone (10X) — direct, énergie maximale, urgence immédiate, chiffres choc "Chaque jour sans avis = argent perdu", appel à l\'action fort',
  HORMOZI: 'Alex Hormozi — ROI mathématique, valeur concrète en dollars, offre trop bonne pour refuser, logique froide et irrésistible',
  GARYV:   'Gary Vaynerchuk — contenu d\'abord, jeu long, authenticité radicale, réputation = actif principal, angle visibilité et part de marché locale',
  NAVAL:   'Naval Ravikant — levier et systèmes "Installe une fois, récolte longtemps", pensée asymétrique, résultats passifs compoundés',
  ROBBINS: 'Tony Robbins — énergie transformative, identité et héritage, "Ton nom = ta marque", état émotionnel comme levier commercial',
};

// ─── Generate single agent message for a prospect ─────────────────────────────
export async function generateProspectMessage({ prospect, agentKey = 'CARDONE', lang = 'fr' }) {
  const persona = AGENT_TONE_MAP[agentKey] || AGENT_TONE_MAP.CARDONE;
  const { businessName, type, city, googleReviews, googleRating, improvements = [], whyThisOne } = prospect;

  // Build signal context
  const signalKeys = [];
  const reviews = parseFloat(googleReviews) || 0;
  const rating  = parseFloat(googleRating)  || 0;
  if (prospect.recentNegativeReview)                     signalKeys.push('Avis négatif récent détecté');
  if (prospect.hiringSignal || prospect.expansionSignal) signalKeys.push('En croissance — expansion détectée');
  if (rating >= 4.0 && reviews > 0 && reviews < 20)     signalKeys.push('Bonne note mais peu visible — sous-représenté en ligne');
  if ((prospect.lastPostDays || 0) > 60 && reviews < 15) signalKeys.push('Propriétaire débordé — inactif en ligne');
  if (prospect.instagramActive && reviews < 30)          signalKeys.push('Actif sur contenu, faible SEO Google');
  if (prospect.contactName)                              signalKeys.push(`Propriétaire identifié : ${prospect.contactName}`);

  const signalContext = signalKeys.length > 0
    ? `Signaux détectés : ${signalKeys.join(', ')}.`
    : '';
  const whyContext = whyThisOne ? `Angle stratégique : ${whyThisOne}.` : '';

  const result = await callClaude(
    `Tu es ${persona} et tu écris UN message de prospection pour NT Solutions Québec.${getLangInstruction(lang)}
RAPPORT INTELLIGENCE :
Commerce : ${businessName} (${type}, ${city})
Google : ${reviews} avis · ${rating}★
Contact : ${prospect.contactName || 'Propriétaire'}
${signalContext}
${whyContext}

Règles strictes :
1. Référence UN détail spécifique à CE commerce précis (pas générique)
2. Nomme la douleur spécifique révélée par le signal principal
3. Offre un résultat concret en chiffres
4. Termine par UNE question sans friction
5. Maximum 4 phrases. Pas de markdown. Pas de gras.
6. Sonne comme un humain qui a recherché CE commerce à 23h.
7. Signé : Samuel — NT Solutions

Retourne UNIQUEMENT le texte du message.`,
    [{ role: 'user', content: `Écris le message maintenant pour ${businessName}, ${type}, ${city}. Service : Bouclier 5 Étoiles — automatise la collecte d'avis Google, 150$/mois.` }],
    350,
  );
  return result.trim();
}

// ─── Generate 3 message variants (top 3 agents by signal match) ───────────────
export async function generateMessageVariants(prospect) {
  // Determine top 3 agents based on detected signals
  const reviews = parseFloat(prospect.googleReviews) || 0;
  const rating  = parseFloat(prospect.googleRating)  || 0;
  const type    = (prospect.type || '').toLowerCase();
  const FOOD    = ['restaurant', 'boulangerie', 'dépanneur', 'café', 'bar', 'traiteur', 'pizzeria'];

  const ranked = [
    prospect.recentNegativeReview                                ? 'VOSS'    : null,
    prospect.hiringSignal || prospect.expansionSignal            ? 'NAVAL'   : null,
    rating >= 4.0 && reviews > 0 && reviews < 20                ? 'HORMOZI' : null,
    FOOD.some((f) => type.includes(f))                          ? 'GARYV'   : null,
    (prospect.lastPostDays || 0) > 60                           ? 'CARDONE' : null,
    prospect.contactName || prospect.ownerLinkedIn              ? 'ROBBINS'  : null,
    'VOSS', 'HORMOZI', 'CARDONE', // fallback order
  ].filter(Boolean);
  const top3 = [...new Set(ranked)].slice(0, 3);

  // Generate in parallel for speed (slight rate-limit risk, but only 3 light calls)
  const variants = await Promise.all(
    top3.map(async (agentKey) => {
      const msg = await generateProspectMessage({ prospect, agentKey });
      return { agentKey, message: msg };
    })
  );
  return variants; // [{ agentKey, message }, ...]
}

// ─── Rate-limit sentinel ──────────────────────────────────────────────────────
export class RateLimitError extends Error {
  constructor() {
    super('RATE_LIMIT');
    this.isRateLimit = true;
  }
}

// ─── Cascade prospect search — internal helpers ───────────────────────────────

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ─── Mode pre-detection — haiku classify before each response ─────────────────
async function detectMode(userInput) {
  try {
    const apiKey = getApiKey();
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        temperature: 0,
        system: 'Classify in one word: DIRECT / QUESTION / PLAN / MIRROR\nReturn one word only.',
        messages: [{ role: 'user', content: userInput }],
      }),
    });
    if (!response.ok) return 'DIRECT';
    const data = await response.json();
    const word = (data.content?.find((b) => b.type === 'text')?.text || '').trim().toUpperCase();
    return ['DIRECT', 'QUESTION', 'PLAN', 'MIRROR'].includes(word) ? word : 'DIRECT';
  } catch {
    return 'DIRECT';
  }
}

// ─── Enrichment cache — 7-day TTL ────────────────────────────────────────────
const ENRICH_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function enrichCacheKey(businessName, city) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
  return `hq_enrich_${norm(businessName)}_${norm(city)}`;
}
function getCachedEnrichment(businessName, city) {
  try {
    const raw = localStorage.getItem(enrichCacheKey(businessName, city));
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > ENRICH_CACHE_TTL) {
      localStorage.removeItem(enrichCacheKey(businessName, city));
      return null;
    }
    return data;
  } catch { return null; }
}
function setCachedEnrichment(businessName, city, data) {
  try {
    const { id: _id, ...rest } = data; // don't persist the local ID
    localStorage.setItem(enrichCacheKey(businessName, city), JSON.stringify({ data: rest, cachedAt: Date.now() }));
  } catch {}
}

// Normalize lean 8-field response to internal field names
function normalizeLeanResponse(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = { ...raw };
  // Map lean field names → internal names
  if (out.facebook  !== undefined && out.fbPage  === undefined) { out.fbPage       = out.facebook;  delete out.facebook;  }
  if (out.ownerName !== undefined && out.contactName === undefined) { out.contactName = out.ownerName; delete out.ownerName; }
  if (out.oneLineContext !== undefined) { out.opportunityReason = out.oneLineContext; delete out.oneLineContext; }
  return out;
}

function parseProspectJSON(text) {
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // 1. Bare array — most common for discovery responses
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }

  // 2. Object — may wrap an array under a common key
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      // Unwrap common wrapper keys the model sometimes uses
      for (const key of ['businesses', 'prospects', 'commerces', 'results', 'data', 'items']) {
        if (Array.isArray(obj[key])) return obj[key];
      }
      return obj;
    } catch {}

    // 3. Truncated JSON repair — strip the last incomplete key-value pair then close
    try {
      const repaired = objMatch[0].replace(/,?\s*"[^"]*"\s*:\s*[^,}\]]*$/, '') + '}';
      const obj = JSON.parse(repaired);
      for (const key of ['businesses', 'prospects', 'commerces', 'results', 'data', 'items']) {
        if (Array.isArray(obj[key])) return obj[key];
      }
      return obj;
    } catch {}
  }

  throw new Error('No JSON found');
}

// Field-level fallback: extract whatever individual fields survived a truncated response
function extractPartialFields(text) {
  const result = {};
  const fields = [
    { key: 'phone',             re: /"phone"\s*:\s*"([^"]+)"/ },
    { key: 'email',             re: /"email"\s*:\s*"([^"]+)"/ },
    { key: 'website',           re: /"website"\s*:\s*"([^"]+)"/ },
    { key: 'googleReviews',     re: /"googleReviews"\s*:\s*(\d+)/, num: true },
    { key: 'googleRating',      re: /"googleRating"\s*:\s*([\d.]+)/, float: true },
    { key: 'opportunityReason', re: /"opportunityReason"\s*:\s*"([^"]+)"/ },
    { key: 'whyThisOne',        re: /"whyThisOne"\s*:\s*"([^"]+)"/ },
  ];
  for (const { key, re, num, float } of fields) {
    const m = text.match(re);
    if (m) result[key] = num ? parseInt(m[1], 10) : float ? parseFloat(m[1]) : m[1];
  }
  return result;
}

// ─── Exponential backoff wrapper — 5s / 10s / 20s on 429 ─────────────────────
async function callWithRetry(fn, { onStatus, bizName = '' } = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.isRateLimit && attempt < maxRetries - 1) {
        const waitSec = Math.pow(2, attempt) * 5; // 5s, 10s, 20s
        // Show countdown via onStatus
        if (onStatus) {
          let remaining = waitSec;
          onStatus(`Limite API — reprise dans ${remaining}s…${bizName ? ` (${bizName})` : ''}`);
          const tick = setInterval(() => {
            remaining--;
            if (remaining > 0) {
              onStatus(`Limite API — reprise dans ${remaining}s…${bizName ? ` (${bizName})` : ''}`);
            } else {
              clearInterval(tick);
            }
          }, 1000);
          await delay(waitSec * 1000);
          clearInterval(tick);
          onStatus(`Nouvelle tentative${bizName ? ` pour "${bizName}"` : ''}…`);
        } else {
          await delay(waitSec * 1000);
        }
        continue;
      }
      throw error; // re-throw on non-429 or after all retries exhausted
    }
  }
  // All retries exhausted — throw a final RateLimitError so caller can mark as skipped
  throw new RateLimitError();
}

// ─── Real page reading — anti-hallucination architecture ─────────────────────
// Core principle: Real data only. Null over hallucination. Always.

const REAL_DATA_SYSTEM = `You are a precise data extractor for Quebec businesses.
NEVER invent, guess, or infer data.
If information is not explicitly present on the page you are reading: return null.
Do NOT use search snippet text — snippets are often wrong or truncated.
For each URL provided, FETCH and READ the actual full page content.
A null value is better than a wrong value.
Return ONLY valid JSON. No explanation text.`;

// Step 1 Phase A: URL discovery — find actual source URLs, NO data from snippets
async function discoverProspectURLs(bizName, city, type, { onStatus, bizName: sName } = {}) {
  try {
    const text = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      temperature: 0.0,
      system: 'Search for a Quebec business. Return ONLY a JSON array of URLs found: ["https://...", ...]\nReturn [] if nothing found. No other text.',
      messages: [{ role: 'user', content: `Search: "${bizName} ${city} ${type}"\nReturn ONLY a JSON array of URLs. Nothing else.` }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }), { onStatus, bizName: sName || bizName });
    const match = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim().match(/\[[\s\S]*?\]/);
    if (match) return JSON.parse(match[0]).filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 5);
  } catch {}
  return [];
}

// Step 1 Phase B: Read actual pages — extract ONLY from real page content, not snippets
async function readPagesForEnrichment(urls, bizName, city, type, agentHint = '', searchUses = 2, { onStatus } = {}) {
  const urlBlock = urls.length > 0
    ? `URLs found for this business:\n${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n\nFetch and READ each URL above. Extract data ONLY from actual page content — NOT from snippet text.`
    : 'Search for this business and read the actual pages you find, not snippet summaries.';
  try {
    const text = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      temperature: 0.0,
      system: REAL_DATA_SYSTEM + (agentHint ? '\n\n' + agentHint : ''),
      messages: [{
        role: 'user',
        content: `Business: ${bizName}, ${city}, ${type}\n\n${urlBlock}\n\nReturn ONLY JSON (null = not explicitly found on any page):\n{"phone":null,"email":null,"website":null,"fbPage":null,"contactName":null,"googleReviews":null,"googleRating":null,"opportunityReason":"","whyThisOne":"${agentHint ? '1-2 sentences: why ideal prospect' : ''}","sources":{}}`,
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: searchUses }],
    }), { onStatus, bizName });
    try   { return normalizeLeanResponse(parseProspectJSON(text)) || {}; }
    catch { return extractPartialFields(text) || {}; }
  } catch { return {}; }
}

// Step 10: Manus-style deep intelligence report — Tier S only (score 80+)
export async function deepIntelligenceReport(prospect, { onStatus } = {}) {
  const cacheKey = `hq_deep_intel_${(prospect.businessName || '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}_${(prospect.city || '').toLowerCase().replace(/\s/g, '_')}`;

  // 7-day cache
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const { data, cachedAt } = JSON.parse(raw);
      if (Date.now() - cachedAt < 7 * 24 * 60 * 60 * 1000) return data;
    }
  } catch {}

  onStatus?.(`🔬 Analyse profonde : "${prospect.businessName}"…`);

  // Level 2 deep crawl: Google reviews + Facebook posts + website blog + Google Q&A
  const result = await callWithRetry(() => prospectFetch({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 700,
    temperature: 0.1,
    system: `${REAL_DATA_SYSTEM}
You are performing a deep intelligence analysis on a high-value prospect for NT Solutions.
Read their Google Maps page, Facebook page, and website (if available).
Your goal: understand the owner's behavior and pain points from their digital footprint.
Read actual pages — do not summarize from snippets.`,
    messages: [{
      role: 'user',
      content: `Deep analysis for: ${prospect.businessName}, ${prospect.city}, ${prospect.type}
${prospect.website ? `Website: ${prospect.website}` : ''}
${prospect.fbPage  ? `Facebook: ${prospect.fbPage}`  : ''}

TASK — Read their real online presence and extract:
1. Last 5 Google reviews: text + owner response (yes/no + tone)
2. Last 3 Facebook posts: date, content, engagement
3. Any unanswered Google Q&A questions
4. Website blog: last article date + topic (if exists)

Then generate a "Deep Intelligence Dossier" in French with 4-6 bullet points, each one:
- A specific observed fact (from the pages you read)
- What it reveals about the owner's situation right now
- The opportunity or tension it creates for NT Solutions

Format: {"insights":[{"fact":"...","reveals":"...","opportunity":"..."}],"ownerProfile":"1 sentence describing the owner","urgencyLevel":"low/medium/high","bestApproachTime":"morning/evening/weekend/anytime"}`,
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
  }));

  let data;
  try   { data = parseProspectJSON(result); }
  catch { data = { insights: [], ownerProfile: '', urgencyLevel: 'medium', bestApproachTime: 'anytime' }; }

  try { localStorage.setItem(cacheKey, JSON.stringify({ data, cachedAt: Date.now() })); } catch {}
  return data;
}

// Step 7: Cross-validation engine — confidence scores per field
function crossValidateField(fieldName, sources) {
  const values = Object.entries(sources)
    .filter(([, s]) => s && s[fieldName] != null && s[fieldName] !== 'null' && s[fieldName] !== '')
    .map(([sourceName, s]) => ({ value: s[fieldName], source: sourceName }));

  if (values.length === 0) return { value: null, confidence: 0, status: 'not_found' };
  if (values.length === 1) return { value: values[0].value, confidence: 50, status: 'single_source', source: values[0].source };

  const normalize = (v) => typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9]/g, '') : String(v);
  const allAgree = values.every((v) => normalize(v.value) === normalize(values[0].value));

  if (allAgree) return { value: values[0].value, confidence: 95, status: 'verified', sources: values.map((v) => v.source) };
  return { value: values[0].value, confidence: 30, status: 'conflict', allValues: values };
}

// Step 6: Canada411 owner lookup — links owner name to business phone
async function readCanada411(bizName, city, phone = null, { onStatus, bizName: sName } = {}) {
  const query = phone
    ? `Search Canada411 for the owner linked to this phone number: ${phone}\nSearch: "${phone} canada411" OR "canada411.ca ${phone}"`
    : `Search: "${bizName} ${city} canada411"\nFind the Canada411 business listing.`;
  try {
    const text = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      temperature: 0.0,
      system: `${REAL_DATA_SYSTEM}\nFocus: Canada411 data only. If owner name is found, it is highly reliable.`,
      messages: [{
        role: 'user',
        content: `Business: ${bizName}, ${city}\n${query}\n\nReturn JSON:\n{"ownerName":null,"phone":null,"address":null,"ownerVerifiedCanada411":false,"source":"D"}`,
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }), { onStatus, bizName: sName || bizName });
    try { return parseProspectJSON(text); } catch { return null; }
  } catch { return null; }
}

// Step 5: Pages Jaunes deep reader — gold standard for Quebec contact data
async function readPagesJaunes(bizName, city, pjUrl = null, { onStatus, bizName: sName } = {}) {
  const query = pjUrl
    ? `Fetch and read this Pages Jaunes listing: ${pjUrl}`
    : `Search: "${bizName} ${city} pagesjaunes.ca"\nOR fetch: https://www.pagesjaunes.ca/search/si/${encodeURIComponent(city)}/${encodeURIComponent(bizName)}`;
  try {
    const text = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 250,
      temperature: 0.0,
      system: `${REAL_DATA_SYSTEM}\nPages Jaunes is the gold standard for Quebec businesses. Extract ONLY what is explicitly listed on the page.`,
      messages: [{
        role: 'user',
        content: `Business: ${bizName}, ${city}\n${query}\n\nReturn JSON:\n{"phone":null,"address":null,"businessCategory":null,"website":null,"source":"D"}`,
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }), { onStatus, bizName: sName || bizName });
    try { return parseProspectJSON(text); } catch { return null; }
  } catch { return null; }
}

// Step 4: Facebook deep reader
async function readFacebook(bizName, city, fbUrl = null, { onStatus, bizName: sName } = {}) {
  const query = fbUrl
    ? `Fetch and read this Facebook page: ${fbUrl}`
    : `Search: "${bizName} ${city} Facebook"\nFind the Facebook business page.`;
  try {
    const text = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      temperature: 0.0,
      system: `${REAL_DATA_SYSTEM}
Focus: Facebook business page data only.
Verify the page is the right business: name matches "${bizName}" within 80% similarity, city matches "${city}".
If wrong business: return null.
If page is private/restricted: return {"fbPage":null,"accessLimited":true}.`,
      messages: [{
        role: 'user',
        content: `Business: ${bizName}, ${city}\n${query}\n\nRead the actual Facebook page. Return JSON:\n{"fbPage":null,"followers":null,"lastPostDate":null,"postFrequency":null,"phone":null,"email":null,"fbRating":null,"fbReviews":null,"accessLimited":false,"source":"F"}`,
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }), { onStatus, bizName: sName || bizName });
    try { return parseProspectJSON(text); } catch { return null; }
  } catch { return null; }
}

// Step 3: Website deep reader — homepage + contact + about pages
async function readWebsite(websiteUrl, bizName, city, { onStatus, bizName: sName } = {}) {
  if (!websiteUrl) return null;
  // Step 3A: Verify URL is real, Step 3B-D: read homepage + contact + about
  try {
    const text = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 450,
      temperature: 0.0,
      system: `${REAL_DATA_SYSTEM}
Focus: read the actual website pages. Check these subpages if they exist:
1. Homepage (${websiteUrl})
2. /contact OR /nous-joindre OR /contact-us — highest density of contact info
3. /a-propos OR /about — for owner name and business story
If the URL returns a 404 or redirect error, mark websiteInvalid:true and search for the correct URL.`,
      messages: [{
        role: 'user',
        content: `Business: ${bizName}, ${city}
Website to read: ${websiteUrl}

Fetch and read the pages listed. Extract ONLY data explicitly present.
Look for: tel: links, (xxx) xxx-xxxx patterns, mailto: links, @domain.com patterns, owner name in "À propos"/"Notre équipe"/"Fondateur" sections.

Return JSON:
{"phone":null,"email":null,"ownerName":null,"services":null,"lastUpdatedYear":null,"websiteVerified":true,"websiteInvalid":false,"source":"W"}`,
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    }), { onStatus, bizName: sName || bizName });
    try { return parseProspectJSON(text); } catch { return null; }
  } catch { return null; }
}

// Step 2: Google Business deep reader
async function readGoogleBusiness(bizName, city, googleUrl = null, { onStatus, bizName: sName } = {}) {
  const query = googleUrl
    ? `Fetch and read this Google Business page: ${googleUrl}`
    : `Search: "${bizName} ${city} site:google.com" OR "${bizName} ${city} Google Maps"\nFind and read the Google Business listing.`;
  try {
    const text = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 350,
      temperature: 0.0,
      system: `${REAL_DATA_SYSTEM}\nFocus: Google Business listing data only. Read the actual listing page.`,
      messages: [{
        role: 'user',
        content: `Business: ${bizName}, ${city}\n${query}\n\nExtract ONLY data explicitly on the Google Business page. Return JSON:\n{"googleReviews":null,"googleRating":null,"phone":null,"address":null,"businessHours":null,"businessCategory":null,"ownerRespondsToReviews":null,"mostRecentReviewDate":null,"mostRecentReviewText":null,"source":"G"}`,
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }), { onStatus, bizName: sName || bizName });
    try { return parseProspectJSON(text); } catch { return null; }
  } catch { return null; }
}

// Single-responsibility fetch + agentic loop. Returns final text content.
async function prospectFetch(body) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    throw new Error('API key missing. Copy .env.example to .env and add your VITE_ANTHROPIC_API_KEY.');
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (body.tools?.length) headers['anthropic-beta'] = 'web-search-2025-03-05';

  const doFetch = async (b) => {
    const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(b) });
    if (res.status === 429) throw new RateLimitError();
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }
    return res.json();
  };

  let data = await doFetch(body);
  let turns = 0;
  let msgs  = body.messages;

  while (data.stop_reason === 'tool_use' && turns < 3) {
    const toolBlocks = (data.content || []).filter(
      (b) => b.type === 'tool_use' || b.type === 'server_tool_use'
    );
    if (toolBlocks.length === 0) break;
    turns++;
    msgs = [
      ...msgs,
      { role: 'assistant', content: data.content },
      { role: 'user', content: toolBlocks.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: '' })) },
    ];
    data = await doFetch({ ...body, messages: msgs });
  }

  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// ─── Cascade prospect search ──────────────────────────────────────────────────
// Phase 1A — discovery (no web search, names only, max_tokens 400)
// Phase 1B — per-business enrichment (web search, max_tokens 600, 800ms spacing)
// Phase 1C — Facebook fallback for zero-review businesses (web search, max_tokens 200)
//
// onFound(prospect)        — fires immediately after each enriched business
// onSkipped(n)             — fires when a 429 forces skipping a business
// onStatus(msg)            — fires at each phase change (used by status bar)
// cancelRef.current = true — stops the cascade after the current business

// ─── Chirurgical agent prompt injections ─────────────────────────────────────
// Each agent flavours the discovery + enrichment system prompts.
// Appended only when chirurgicalAgent is set (Chirurgical mode).
const CHIRURGICAL_AGENT_PROMPTS = {
  VOSS: {
    discovery:   `STYLE CHRIS VOSS — Empathie calibrée: cherche des commerces en douleur latente (peu d'avis = propriétaire qui souffre en silence). Priorise les commerces isolés, sans soutien de visibilité en ligne. Prospect idéal: besoin réel, pas encore conscient de la solution.`,
    enrichment:  `ANGLE VOSS: note tout signe de frustration du propriétaire — avis négatifs sans réponse, profil Google abandonné, infos incohérentes. Ces détails nourriront un message d'empathie calibrée sur la douleur réelle.`,
  },
  CARDONE: {
    discovery:   `STYLE GRANT CARDONE — 10X: cherche des commerces massivement en retard sur leur marché local. Prospect idéal: concurrent direct avec 10× moins d'avis que la moyenne du secteur. Zéro demi-mesure — seulement les plus grandes opportunités.`,
    enrichment:  `ANGLE CARDONE: quantifie l'écart de performance. Combien d'avis ont leurs concurrents directs? Quel est le potentiel de croissance chiffré? Ces données alimenteront un pitch sur l'urgence et les chiffres bruts.`,
  },
  HORMOZI: {
    discovery:   `STYLE ALEX HORMOZI — ROI mathématique: cherche des commerces où la valeur à vie du client est élevée (cliniques, garages, salons haut de gamme). Prospect idéal: secteur où chaque nouveau client vaut 500$+, mais moins de 15 avis Google.`,
    enrichment:  `ANGLE HORMOZI: estime la valeur par client moyen et le volume mensuel. Calcule le ROI potentiel: si 10 nouveaux clients/mois grâce aux avis, combien en revenus? Ces chiffres formeront une offre impossible à refuser.`,
  },
  GARYV: {
    discovery:   `STYLE GARY VAYNERCHUK — Contenu d'abord: cherche des commerces avec une présence sociale visible (Instagram, Facebook actif) mais une faible présence Google. Prospect idéal: passion évidente pour leur métier, communauté locale engagée, mais sans avis Google pour le prouver.`,
    enrichment:  `ANGLE GARYV: cherche leurs comptes Instagram, Facebook, TikTok. Ont-ils du contenu? Quelle est leur communauté locale? L'angle: "Vous avez déjà l'audience — capturons leur preuve sociale sur Google."`,
  },
  NAVAL: {
    discovery:   `STYLE NAVAL RAVIKANT — Systèmes et levier: cherche des commerces avec un modèle répétable à fort potentiel de compoundage (services récurrents, fidélisation naturelle). Prospect idéal: professionnel indépendant ou PME avec clientèle régulière mais zéro infrastructure de réputation en ligne.`,
    enrichment:  `ANGLE NAVAL: identifie le potentiel de levier asymétrique. Ce commerce a-t-il des clients récurrents? L'angle: une infrastructure d'avis installée une fois qui génère des clients en continu — effort minimal, impact compoundé.`,
  },
  ROBBINS: {
    discovery:   `STYLE TONY ROBBINS — Énergie et momentum: cherche des commerces avec une énergie positive mais un décalage entre leur qualité réelle et leur réputation en ligne. Prospect idéal: commerce récent (1-3 ans), propriétaire motivé, bons services — mais inconnu sur Google.`,
    enrichment:  `ANGLE ROBBINS: capte les signaux de momentum — commerce récent, nouvelles installations, expansion, énergie visible dans les descriptions. L'angle: "Tu as tout pour réussir — il te manque juste la visibilité que tu mérites."`,
  },
};

// Depth config — controls enrichment quality vs. speed
const DEPTH_CONFIG = {
  surface:     { enrichTokens: 400, searchUses: 1, fbFallback: 'never'        },
  approfondie: { enrichTokens: 600, searchUses: 1, fbFallback: 'zero_reviews' },
  maximale:    { enrichTokens: 900, searchUses: 2, fbFallback: 'always'       },
};

export async function searchProspects({ niches = [], region = null, count = 6, onFound, onSkipped, onStatus, cancelRef, retryBizList = null, depth = 'approfondie', chirurgicalAgent = null, autoEnrich = true }) {
  const nicheText  = niches.length > 0 ? niches.join(', ') : 'commerces locaux variés';
  const regionText = region || 'Québec';
  const dc         = DEPTH_CONFIG[depth] || DEPTH_CONFIG.approfondie;

  // Agent-specific prompt injections (Chirurgical mode only)
  const agentInject     = chirurgicalAgent ? CHIRURGICAL_AGENT_PROMPTS[chirurgicalAgent] : null;
  const discoverySystem = `Tu es un annuaire de commerces québécois. Génère des noms de commerces locaux réels ou plausibles correspondant aux critères. Retourne UNIQUEMENT un tableau JSON valide, aucun texte autour.

ORDRE DE PRIORITÉ — respecte cet ordre lors de la sélection :
TIER 1 (data-riche, prioritaire) — commerces qui ont probablement un site web, une page Facebook active, ou un profil Google Business revendiqué. Ces commerces ont le plus de données publiques disponibles. Priorise-les.
TIER 2 (données modérées) — commerces présents sur Google Maps mais avec peu de présence web.
TIER 3 (données limitées) — commerces trouvables uniquement par nom, sans trace web.
Priorise les Tier 1 en premier, puis Tier 2, Tier 3 en dernier. Inclure le champ "priorityTier" (1, 2 ou 3) dans chaque objet.`
    + (agentInject ? '\n\n' + agentInject.discovery : '');
  const enrichmentSystem = `Tu es un chercheur de données commerciales multi-sources. Utilise la recherche web pour trouver TOUTES les données disponibles sur ce commerce québécois en couvrant les 5 sources suivantes :
STREAM A — Google Intelligence : nombre d'avis, note, réponses du propriétaire, dernier avis, heures d'ouverture, adresse, téléphone.
STREAM B — Site Web : si site trouvé, cherche téléphone, email, nom du propriétaire, services offerts.
STREAM C — Facebook : URL page, nombre d'abonnés, dernier post, email ou téléphone dans la section À propos, nom du propriétaire, taux de réponse.
STREAM D — Annuaires : Pages Jaunes, Canada411, YellowPages — téléphone vérifié, adresse, catégorie.
STREAM E — Actualités/Contexte : mentions récentes 2024-2025, expansions, problèmes, citations du propriétaire, offres d'emploi.
Pour chaque donnée trouvée, indique la source dans le champ "sources" (G=Google, W=Website, F=Facebook, D=Directory, N=News).
Si des sources donnent des infos contradictoires, garde la plus récente.
Retourne UNIQUEMENT un objet JSON valide, aucun texte autour.`
    + (agentInject ? '\n\n' + agentInject.enrichment : '');

  // ── 1A: Discovery — skipped when retryBizList is provided ────────────────────
  let discovered;
  if (retryBizList && retryBizList.length > 0) {
    discovered = retryBizList;
    onStatus?.(`Réessai de ${retryBizList.length} prospect${retryBizList.length > 1 ? 's' : ''} manquant${retryBizList.length > 1 ? 's' : ''}…`);
  } else {
    onStatus?.('Découverte des commerces…');
    const discoverText = await callWithRetry(() => prospectFetch({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      temperature: 0.4,
      system: discoverySystem,
      messages: [{
        role: 'user',
        content: `Liste exactement ${count} commerces locaux à ${regionText} dans ces niches: ${nicheText}.\nPriorise ceux avec site web, Facebook, ou profil Google revendiqué (Tier 1 en premier).\nRetourne UNIQUEMENT ce tableau JSON:\n[{"businessName":"...","type":"...","city":"...","priorityTier":1}]`,
      }],
    }), { onStatus });

    try {
      const parsed = parseProspectJSON(discoverText);
      discovered = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new Error('Aucun résultat trouvé — essaie une description plus précise');
    }
    if (discovered.length === 0) throw new Error('Aucun résultat trouvé — essaie une description plus précise');
  }

  // ── Discovery-only mode — stream bare businesses, skip all web search ────────
  if (!autoEnrich) {
    for (const biz of discovered) {
      if (cancelRef?.current) break;
      onFound?.({ ...biz, enriched: false });
    }
    return discovered.map((b) => ({ ...b, enriched: false }));
  }

  // ── 1B: Enrichment in batches of 3 — 4s pause between batches ────────────────
  const enriched = [];
  const BATCH_SIZE = 3;

  // Stream cached results instantly — no API call needed
  const toEnrich = [];
  for (const biz of discovered) {
    const cached = getCachedEnrichment(biz.businessName, biz.city);
    if (cached) {
      const prospect = { ...biz, ...cached, enriched: true };
      enriched.push(prospect);
      onFound?.(prospect);
    } else {
      toEnrich.push(biz);
    }
  }

  // Per-biz enrichment helper — two-phase: URL discovery → real page reading
  async function enrichOneBiz(biz) {
    if (cancelRef?.current) return null;
    const agentHint = agentInject?.enrichment || '';

    try {
      // Phase A — URL discovery: find real source URLs, no data from snippets
      onStatus?.(`Recherche des sources : "${biz.businessName}"…`);
      const urls = await discoverProspectURLs(biz.businessName, biz.city, biz.type, { onStatus, bizName: biz.businessName });
      if (cancelRef?.current) return null;
      await delay(2000);

      // Categorize URLs by source type
      const googleUrl = urls.find((u) => /google\.com\/maps|maps\.app\.goo\.gl|goo\.gl/.test(u));
      const nonGoogleUrls = urls.filter((u) => !/google\.com\/maps|maps\.app\.goo\.gl|goo\.gl/.test(u));

      // Step 2 — Google Business deep read
      onStatus?.(`Google Business : "${biz.businessName}"…`);
      const googleData = await readGoogleBusiness(biz.businessName, biz.city, googleUrl, { onStatus, bizName: biz.businessName });
      if (cancelRef?.current) return null;
      await delay(2000);

      // Step 3 — Website deep reader (homepage + contact + about)
      const siteUrl = nonGoogleUrls.find((u) => {
        try { return !/(facebook|pagesjaunes|canada411|yelp|tripadvisor|yellowpages|linkedin|instagram|twitter)/.test(new URL(u).hostname); }
        catch { return false; }
      }) || (googleData?.website || null);
      const nonSiteUrls = nonGoogleUrls.filter((u) => u !== siteUrl);
      let websiteData = null;
      if (siteUrl) {
        onStatus?.(`Site web : "${biz.businessName}"…`);
        websiteData = await readWebsite(siteUrl, biz.businessName, biz.city, { onStatus, bizName: biz.businessName });
        if (cancelRef?.current) return null;
        await delay(2000);
      }

      // Step 4 — Facebook deep reader
      const fbUrl = nonSiteUrls.find((u) => /facebook\.com/.test(u));
      const nonFbUrls = nonSiteUrls.filter((u) => u !== fbUrl);
      let fbData = null;
      onStatus?.(`Facebook : "${biz.businessName}"…`);
      fbData = await readFacebook(biz.businessName, biz.city, fbUrl, { onStatus, bizName: biz.businessName });
      if (cancelRef?.current) return null;
      await delay(2000);

      // Step 5 — Pages Jaunes deep reader (always runs — gold standard)
      const pjUrl = nonFbUrls.find((u) => /pagesjaunes\.ca/.test(u));
      const nonPjUrls = nonFbUrls.filter((u) => u !== pjUrl);
      onStatus?.(`Pages Jaunes : "${biz.businessName}"…`);
      const pjData = await readPagesJaunes(biz.businessName, biz.city, pjUrl, { onStatus, bizName: biz.businessName });
      if (cancelRef?.current) return null;
      await delay(2000);

      // Phase B — Read any remaining URLs (news, etc.)
      const enrichData = await readPagesForEnrichment(
        nonPjUrls, biz.businessName, biz.city, biz.type, agentHint, dc.searchUses, { onStatus }
      );

      // Merge: general data as base, then website, then Google (most authoritative for reviews/rating)
      let prospect = { ...biz, ...enrichData, urlsFound: urls };
      if (websiteData && !websiteData.websiteInvalid) {
        if (websiteData.phone    && !prospect.phone)       prospect.phone       = websiteData.phone;
        if (websiteData.email    && !prospect.email)       prospect.email       = websiteData.email;
        if (websiteData.ownerName && !prospect.contactName) prospect.contactName = websiteData.ownerName;
        if (websiteData.services)                          prospect.services    = websiteData.services;
        if (websiteData.lastUpdatedYear)                   prospect.siteLastUpdated = websiteData.lastUpdatedYear;
        prospect.website = siteUrl; // verified URL
      } else if (websiteData?.websiteInvalid) {
        prospect.websiteInvalid = true;
      }
      if (googleData) {
        if (googleData.googleReviews != null)          prospect.googleReviews           = googleData.googleReviews;
        if (googleData.googleRating  != null)          prospect.googleRating            = googleData.googleRating;
        if (googleData.phone && !prospect.phone)       prospect.phone                   = googleData.phone;
        if (googleData.address)                        prospect.address                 = googleData.address;
        if (googleData.businessHours)                  prospect.businessHours           = googleData.businessHours;
        if (googleData.ownerRespondsToReviews != null) prospect.ownerRespondsToReviews  = googleData.ownerRespondsToReviews;
        if (googleData.mostRecentReviewDate)           prospect.lastReviewDate          = googleData.mostRecentReviewDate;
        if (googleData.mostRecentReviewText)           prospect.lastReviewText          = googleData.mostRecentReviewText;
        // Conflict detection: flag if phone from Google ≠ phone from another source
        if (googleData.phone && enrichData.phone && googleData.phone.replace(/\D/g,'') !== enrichData.phone.replace(/\D/g,'')) {
          prospect._phoneConflict = { google: googleData.phone, other: enrichData.phone };
        }
      }
      // Merge Facebook data
      if (fbData && !fbData.accessLimited) {
        if (fbData.fbPage)                             prospect.fbPage       = fbData.fbPage;
        if (fbData.followers   != null)                prospect.fbFollowers  = fbData.followers;
        if (fbData.lastPostDate)                       prospect.lastPostDate = fbData.lastPostDate;
        if (fbData.phone  && !prospect.phone)          prospect.phone        = fbData.phone;
        if (fbData.email  && !prospect.email)          prospect.email        = fbData.email;
        if (fbData.fbRating  != null)                  prospect.fbRating     = fbData.fbRating;
        if (fbData.fbReviews != null)                  prospect.fbReviews    = fbData.fbReviews;
      } else if (fbData?.accessLimited && fbData?.fbPage) {
        prospect.fbPage = fbData.fbPage; // save URL even if page is private
        prospect.fbAccessLimited = true;
      }
      // Merge Pages Jaunes data — PJ phone is gold standard (overrides Google if different)
      if (pjData) {
        if (pjData.phone) {
          const pjNorm = pjData.phone.replace(/\D/g, '');
          const gNorm  = (googleData?.phone || '').replace(/\D/g, '');
          if (gNorm && pjNorm !== gNorm) {
            // Conflict: show both, PJ wins
            prospect._phoneConflict = { pagesJaunes: pjData.phone, google: googleData?.phone, winner: 'Pages Jaunes' };
          }
          prospect.phone = pjData.phone; // PJ always wins
        }
        if (pjData.address && !prospect.address)       prospect.address           = pjData.address;
        if (pjData.businessCategory)                   prospect.businessCategory  = pjData.businessCategory;
        if (pjData.website  && !prospect.website)      prospect.website           = pjData.website;
      }

      // Step 6 — Canada411 owner lookup (only if no owner name identified yet)
      if (!cancelRef?.current && !prospect.contactName) {
        const knownPhone = prospect.phone || null;
        onStatus?.(`Canada411 — propriétaire : "${biz.businessName}"…`);
        const c411Data = await readCanada411(biz.businessName, biz.city, knownPhone, { onStatus, bizName: biz.businessName });
        if (c411Data?.ownerName) {
          prospect.contactName           = c411Data.ownerName;
          prospect.ownerVerifiedCanada411 = true;
          // Verify phone from Canada411
          if (c411Data.phone && !prospect.phone) prospect.phone = c411Data.phone;
        }
        if (cancelRef?.current) return null;
      }

      // Step 7 — Cross-validate key fields across all sources
      const cvSources = {
        google:     googleData   || {},
        website:    websiteData  || {},
        facebook:   fbData       || {},
        pagesJaunes: pjData      || {},
        general:    enrichData   || {},
      };
      const cvFields = ['phone', 'email', 'contactName', 'website', 'googleReviews', 'googleRating'];
      const _confidences = {};
      const _conflicts   = {};
      for (const f of cvFields) {
        const cv = crossValidateField(f, cvSources);
        _confidences[f] = cv;
        if (cv.status === 'conflict') _conflicts[f] = cv.allValues;
      }
      const verifiedCount = Object.values(_confidences).filter((c) => c?.status === 'verified').length;
      prospect._confidences   = _confidences;
      prospect._conflicts     = _conflicts;
      prospect._verifiedCount = verifiedCount;

      setCachedEnrichment(biz.businessName, biz.city, prospect);
      const result = { ...prospect, enriched: true };
      onFound?.(result);
      return result;
    } catch (e) {
      if (e.isRateLimit) onSkipped?.(biz);
      return null;
    }
  }

  // Process uncached prospects in batches of 3
  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    if (cancelRef?.current) break;
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    onStatus?.(`Lot ${Math.floor(i / BATCH_SIZE) + 1} — enrichissement de ${batch.length} prospect${batch.length > 1 ? 's' : ''}…`);
    const batchResults = await Promise.all(batch.map((biz) => enrichOneBiz(biz)));
    enriched.push(...batchResults.filter(Boolean));
    // 4s pause between batches (not after the last one)
    if (i + BATCH_SIZE < toEnrich.length && !cancelRef?.current) {
      onStatus?.('Pause entre les groupes…');
      await delay(4000);
    }
  }

  // ── Supplemental pass — fill shortfall when main loop came up short ─────────
  // Runs only once, only on fresh searches (not retry-biz or cancelled runs)
  const shortfall = count - enriched.length;
  if (shortfall > 0 && !cancelRef?.current && !retryBizList && autoEnrich) {
    const excludeNames = enriched.map((p) => p.businessName).filter(Boolean).join(', ');
    onStatus?.(`${enriched.length}/${count} trouvés — recherche de ${shortfall} autre${shortfall > 1 ? 's' : ''}…`);
    try {
      const suppText = await callWithRetry(() => prospectFetch({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        temperature: 0.55, // slightly higher to get different suggestions
        system: discoverySystem,
        messages: [{
          role: 'user',
          content: `Liste exactement ${shortfall} AUTRES commerces locaux à ${regionText} dans ces niches: ${nicheText}.\nExclus ces noms déjà trouvés: ${excludeNames || 'aucun'}.\nPriorise ceux avec site web, Facebook, ou profil Google revendiqué (Tier 1 en premier).\nRetourne UNIQUEMENT ce tableau JSON:\n[{"businessName":"...","type":"...","city":"...","priorityTier":1}]`,
        }],
      }), { onStatus });
      let suppDiscovered;
      try {
        const parsed = parseProspectJSON(suppText);
        suppDiscovered = Array.isArray(parsed) ? parsed : [parsed];
      } catch { suppDiscovered = []; }

      for (const biz of suppDiscovered) {
        if (cancelRef?.current) break;
        const elapsed = Date.now() - lastCallAt;
        if (elapsed < 4000) await delay(4000 - elapsed);
        lastCallAt = Date.now();
        onStatus?.(`Enrichissement supplémentaire : "${biz.businessName}"…`);
        try {
          const result = await enrichOneBiz(biz);
          if (result) { enriched.push(result); }
        } catch (e) {
          if (e.isRateLimit) onSkipped?.(biz);
        }
      }
    } catch { /* supplemental pass is best-effort — never fails the whole cascade */ }
  }

  if (enriched.length === 0) throw new Error('Aucun résultat trouvé — essaie une description plus précise');
  return enriched;
}

// ─── Single-prospect enrichment (manual "Enrichir →" button) ─────────────────
export async function enrichProspect(biz, { depth = 'approfondie', chirurgicalAgent = null, onStatus = null } = {}) {
  // Check cache first — free if already enriched within 7 days
  const cached = getCachedEnrichment(biz.businessName, biz.city);
  if (cached) return { ...biz, ...cached, enriched: true, fromCache: true };

  const dc        = DEPTH_CONFIG[depth] || DEPTH_CONFIG.approfondie;
  const aInject   = chirurgicalAgent ? CHIRURGICAL_AGENT_PROMPTS[chirurgicalAgent] : null;
  const agentHint = aInject?.enrichment || '';

  // Phase A: URL discovery
  onStatus?.(`Recherche des sources : "${biz.businessName}"…`);
  const urls = await discoverProspectURLs(biz.businessName, biz.city, biz.type, { onStatus, bizName: biz.businessName });
  await delay(2000);

  // Phase B: Read real pages
  onStatus?.(`Lecture des pages : "${biz.businessName}" (${urls.length} source${urls.length !== 1 ? 's' : ''})…`);
  const enrichData = await readPagesForEnrichment(
    urls, biz.businessName, biz.city, biz.type, agentHint, dc.searchUses, { onStatus }
  );

  let prospect = { ...biz, ...enrichData, urlsFound: urls };

  // Facebook fallback if not found in Phase B
  const reviews = parseFloat(prospect.googleReviews);
  const doFb    = dc.fbFallback === 'always' || (dc.fbFallback === 'zero_reviews' && (!reviews || reviews === 0));
  if (doFb && !prospect.fbPage) {
    await delay(2000);
    try {
      const fbText = await callWithRetry(() => prospectFetch({
        model: 'claude-sonnet-4-20250514', max_tokens: 150, temperature: 0.0,
        system: `${REAL_DATA_SYSTEM}\nSearch for this business's Facebook page. Return ONLY: {"fbPage":"url_or_null"}`,
        messages: [{ role: 'user', content: `Facebook page for "${biz.businessName}" in ${biz.city}, Quebec.` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      }), { onStatus, bizName: biz.businessName });
      const fbData = parseProspectJSON(fbText);
      if (fbData?.fbPage && fbData.fbPage !== 'null') prospect.fbPage = fbData.fbPage;
    } catch {}
  }

  setCachedEnrichment(biz.businessName, biz.city, prospect);
  return { ...prospect, enriched: true };
}

// ─── Competitive context — top 3 competitors + gap analysis ──────────────────
export async function fetchCompetitorContext(prospect) {
  const { businessName, type, city, googleReviews, googleRating } = prospect;
  const cacheKey = `hq_comp_${(businessName || '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}_${(city || '').toLowerCase().replace(/\s/g, '_')}`;

  // 30-day cache for competitor data
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const { data, cachedAt } = JSON.parse(raw);
      if (Date.now() - cachedAt < 30 * 24 * 60 * 60 * 1000) return data;
    }
  } catch {}

  const result = await callWithRetry(() => prospectFetch({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    temperature: 0.2,
    system: 'Tu es un analyste concurrentiel. Recherche les concurrents directs de ce commerce québécois sur Google. Retourne UNIQUEMENT un objet JSON valide, aucun texte autour.',
    messages: [{
      role: 'user',
      content: `Trouve les 3 principaux concurrents directs de "${businessName}" (${type}) à ${city}, Québec.\nPour chaque concurrent: nom, nombre d'avis Google, note Google.\nRetourne UNIQUEMENT:\n{"subject":{"name":"${businessName}","reviews":${googleReviews || 0},"rating":${googleRating || 0}},"competitors":[{"name":"","reviews":null,"rating":null},{"name":"","reviews":null,"rating":null},{"name":"","reviews":null,"rating":null}],"gapAnalysis":"1 phrase sur l'écart concurrentiel principal"}`,
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
  }));

  let data;
  try   { data = parseProspectJSON(result); }
  catch { data = null; }

  if (data) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ data, cachedAt: Date.now() })); } catch {}
  }
  return data;
}

// ─── Streaming agent call (SSE) ──────────────────────────────────────────────

export async function callClaudeStream(systemPrompt, messages, maxTokens, deepMode, attachment, onToken, onSearchState, onThinkingState, thinkingMode = false, agentKey = null) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    throw new Error('API key missing. Copy .env.example to .env and add your VITE_ANTHROPIC_API_KEY.');
  }

  const apiMessages = injectAttachment(messages, attachment);

  const betas = ['prompt-caching-2024-07-31', 'web-search-2025-03-05'];
  if (thinkingMode) betas.push('interleaved-thinking-2025-05-14');

  const tokens = thinkingMode ? Math.max(maxTokens, 9000) : maxTokens;
  const body = {
    model: getModel(deepMode),
    max_tokens: tokens,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: apiMessages,
    tools: [WEB_SEARCH_TOOL],
    stream: true,
  };
  // Temperature: thinking mode forces 1; otherwise per-agent value
  if (!thinkingMode) {
    body.temperature = agentKey ? (AGENT_TEMPERATURES[agentKey] ?? DEFAULT_TEMPERATURE) : DEFAULT_TEMPERATURE;
  }
  if (thinkingMode) body.thinking = { type: 'enabled', budget_tokens: 8000 };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': betas.join(','),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let searching = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;

        let event;
        try { event = JSON.parse(payload); } catch { continue; }

        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block?.type === 'thinking') {
            onThinkingState?.(true);
          } else if (block?.type === 'tool_use' && block?.name === 'web_search') {
            onThinkingState?.(false);
            searching = true;
            onSearchState?.(true);
          } else if (block?.type === 'text') {
            onThinkingState?.(false);
            if (searching) { searching = false; onSearchState?.(false); }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            const token = event.delta.text;
            fullText += token;
            onToken?.(token);
          }
          // thinking_delta: skip — don't stream thinking to UI
        } else if (event.type === 'message_stop') {
          if (searching) { searching = false; onSearchState?.(false); }
          onThinkingState?.(false);
        }
      }
    }
  } finally {
    reader.cancel?.();
    if (searching) onSearchState?.(false);
    onThinkingState?.(false);
  }

  return fullText;
}

// ─── Momentum Mirror ─────────────────────────────────────────────────────────

export async function getMomentumMirror(streak, lang = 'fr') {
  const stats  = getMomentumStats(streak);
  const cached = getCachedMirror(stats, lang);
  if (cached) return cached;

  const lines = [
    `Sessions started this week: ${stats.sessionsThisWeek}`,
    stats.lastSessionDaysAgo !== null
      ? `Last session: ${stats.lastSessionDaysAgo === 0 ? 'today' : `${stats.lastSessionDaysAgo} day(s) ago`}`
      : 'No sessions recorded yet',
    `Current streak: ${stats.streak} day(s)`,
  ].join('\n');

  try {
    const mirror = await callClaude(
      getMomentumMirrorPrompt(lang),
      [{ role: 'user', content: lines }],
      80, false, null, false, false, null,
      HAIKU_MODEL
    );
    const trimmed = mirror.trim();
    setCachedMirror(trimmed, stats, lang);
    return trimmed;
  } catch {
    return null;
  }
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

export async function callCoordinator(userInput, deepMode, lang = 'fr') {
  // Prepend a note when the input looks like an image/file analysis request
  const isFileInput = /\.(png|jpg|jpeg|gif|webp|pdf|csv|xlsx)/i.test(userInput);
  const prompt = isFileInput
    ? `${userInput}\n\n[A file or image is attached — route to the most relevant agent for analysis]`
    : userInput;

  try {
    const text = await callClaude(
      COORDINATOR_PROMPT + getLangInstruction(lang),
      [{ role: 'user', content: prompt }],
      150,        // coordinator JSON is always < 100 tokens
      false,      // deepMode irrelevant for routing
      null, false, false, 'COORDINATOR',
      HAIKU_MODEL // routing is a classification task — haiku is 3× faster
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('[Coordinator] non-JSON response:', text);
      return { lead: 'HORMOZI', supporting: [], reasoning: 'fallback' };
    }
    return JSON.parse(match[0]);
  } catch (err) {
    console.warn('[Coordinator] error, using fallback:', err.message);
    return { lead: 'HORMOZI', supporting: [], reasoning: 'fallback' };
  }
}

// ─── Calendar event extraction ───────────────────────────────────────────────
// Given natural language from the user, extract a calendar event spec.
// Returns null when confidence is low or parsing fails — caller should
// fall back to the normal agent response.
export async function extractCalendarEvent(userInput, lang = 'fr') {
  const now = new Date();
  const nowISO = now.toISOString();
  const nowLocal = now.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: 'America/Montreal',
    weekday:  'long', year:  'numeric', month: 'long', day: 'numeric',
    hour:     '2-digit', minute: '2-digit', hour12: false,
  });

  const system = `You extract calendar event intent from short user messages. User is in Quebec (America/Montreal, UTC-5 EST / UTC-4 EDT). Reply with STRICT JSON only — no prose, no markdown.

Current date/time in Montreal: ${nowLocal}
Current ISO (UTC): ${nowISO}

Schema:
{
  "title": string,           // concise event title, e.g. "Appel avec Marc"
  "startISO": string,         // ISO 8601 with offset, e.g. "2026-04-24T10:00:00-04:00"
  "endISO":   string,         // default to start + 30 min if duration unclear
  "description": string,      // optional context, empty string if none
  "confidence": number        // 0 to 1 — how sure you are this is a real scheduling intent
}

Rules:
- Resolve relative dates ("demain", "jeudi", "dans 3 jours", "tomorrow", "next Monday") from the current date above.
- "à 14h" → 14:00 local. Default duration 30 min unless user specifies.
- "this morning" no time → 09:00. "this afternoon" → 14:00. "tonight" → 19:00.
- If no specific time at all, set confidence < 0.5.
- If user is just venting / asking advice / not scheduling — confidence < 0.3.
- "j'ai eu un appel", "j'ai parlé à" (past tense) → confidence 0.
- "relance-moi dans X jours", "remind me in X days" → title "Relance ${lang === 'fr' ? '[topic]' : 'follow-up'}", high confidence.
- Never invent details. Title should use words from the user message when possible.
- Output ONLY the JSON object. No explanation.`;

  try {
    console.log('[extractCalendarEvent] user input:', userInput);
    const text = await callClaude(
      system,
      [{ role: 'user', content: userInput }],
      250,
      false,
      null, false, false, 'COORDINATOR',
      HAIKU_MODEL
    );
    console.log('[extractCalendarEvent] Haiku raw response:', text);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.warn('[extractCalendarEvent] no JSON in response'); return null; }
    const parsed = JSON.parse(match[0]);
    console.log('[extractCalendarEvent] parsed:', parsed);
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.55) {
      console.warn('[extractCalendarEvent] rejected — confidence=', parsed.confidence);
      return null;
    }
    if (!parsed.title || !parsed.startISO || !parsed.endISO) {
      console.warn('[extractCalendarEvent] rejected — missing fields');
      return null;
    }
    const s = new Date(parsed.startISO);
    const e = new Date(parsed.endISO);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) {
      console.warn('[extractCalendarEvent] rejected — invalid date range', parsed.startISO, '→', parsed.endISO);
      return null;
    }
    if (s.getTime() < Date.now() - 60 * 60 * 1000) {
      console.warn('[extractCalendarEvent] rejected — start is in the past', parsed.startISO);
      return null;
    }
    return {
      title:       String(parsed.title).slice(0, 120),
      startISO:    parsed.startISO,
      endISO:      parsed.endISO,
      description: String(parsed.description || '').slice(0, 500),
      confidence:  parsed.confidence,
    };
  } catch (err) {
    console.warn('[extractCalendarEvent] failed:', err.message);
    return null;
  }
}

// ─── Pipeline action extraction ──────────────────────────────────────────────
// Given a user message and a shortlist of existing prospects, identify if the
// message describes a pipeline status change (signed, replied, lost, demo…)
// and which prospect it refers to. Returns null if no confident match.
//
// Status flow must be respected — STATUS_FLOW mirrors the one in
// ProspectsScreen.jsx. Keep in sync.
const PIPELINE_STATUS_FLOW = {
  'Incomplet':    ['Cible', 'Contacté', 'Perdu'],
  'Cible':        ['Prêt', 'Contacté', 'Chaud', 'Perdu'],
  'Prêt':         ['Contacté', 'Chaud', 'Perdu'],
  'Contacté':     ['Répondu', 'Chaud', 'Démo', 'Perdu'],
  'Répondu':      ['Chaud', 'Démo', 'Perdu'],
  'Chaud':        ['Contacté', 'Répondu', 'Démo', 'Perdu'],
  'Démo':         ['Signé', 'Perdu'],
  'Signé':        ['Client actif', 'Perdu'],
  'Client actif': ['Perdu'],
  'Perdu':        ['Cible'],
};

export async function extractPipelineAction(userInput, prospects, lang = 'fr') {
  if (!Array.isArray(prospects) || prospects.length === 0) return null;

  // Build compact shortlist — only send what the model needs to match
  const shortlist = prospects.slice(0, 80).map((p) => ({
    id:            p.id,
    name:          p.contactName || p.name || p.businessName || 'Sans nom',
    business:      p.businessName || p.name || '',
    city:          p.city || '',
    currentStatus: p.status || 'Incomplet',
  }));

  const system = `You identify pipeline status changes for Samuel's CRM. User speaks short, casual French/English. Reply with STRICT JSON only — no prose, no markdown.

Available prospects (id → business/name/city/current status):
${shortlist.map((p) => `  ${p.id} | ${p.business || p.name} | ${p.city} | ${p.currentStatus}`).join('\n')}

Valid statuses: Incomplet, Cible, Prêt, Contacté, Répondu, Chaud, Démo, Signé, Client actif, Perdu.

Status flow rules (a prospect can only transition to these from its current status):
${Object.entries(PIPELINE_STATUS_FLOW).map(([from, to]) => `  ${from} → ${to.join(', ')}`).join('\n')}

Schema:
{
  "prospectId": string,       // must be one of the ids above
  "newStatus":  string,       // target status — must be reachable from currentStatus
  "reason":     string,       // short phrase from user message, e.g. "a dit oui" / "said no"
  "confidence": number        // 0 to 1
}

Trigger examples:
- "j'ai signé avec Dubé" → match "Dubé" in list → newStatus "Signé" (only if currentStatus is "Démo")
- "le resto a dit non" → newStatus "Perdu"
- "X m'a répondu" → newStatus "Répondu"
- "démo prévue avec X" / "j'ai fait une démo avec X" → newStatus "Démo"
- "j'ai contacté X" → newStatus "Contacté"
- "signed with X" / "X said yes" → newStatus "Signé"
- "lost X" / "X said no" → newStatus "Perdu"

Rules:
- NEVER guess a prospectId not in the list. If no prospect matches → confidence 0.
- If user speaks in past hypothetical ("j'avais failli signer", "what if I lose") → confidence 0.
- If the transition is not allowed by the flow → confidence 0.
- If the target status equals the current status → confidence 0.
- Output ONLY the JSON object.`;

  try {
    const text = await callClaude(
      system,
      [{ role: 'user', content: userInput }],
      200,
      false,
      null, false, false, 'COORDINATOR',
      HAIKU_MODEL
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.6) return null;
    if (!parsed.prospectId || !parsed.newStatus) return null;

    // Verify prospectId exists in the shortlist
    const prospect = shortlist.find((p) => String(p.id) === String(parsed.prospectId));
    if (!prospect) return null;

    // Verify status flow is respected
    const allowed = PIPELINE_STATUS_FLOW[prospect.currentStatus] || [];
    if (!allowed.includes(parsed.newStatus)) return null;
    if (parsed.newStatus === prospect.currentStatus) return null;

    return {
      prospectId:    parsed.prospectId,
      prospectName:  prospect.business || prospect.name,
      prospectCity:  prospect.city,
      currentStatus: prospect.currentStatus,
      newStatus:     parsed.newStatus,
      reason:        String(parsed.reason || '').slice(0, 200),
      confidence:    parsed.confidence,
    };
  } catch (err) {
    console.warn('[extractPipelineAction] failed:', err.message);
    return null;
  }
}

// ─── Dashboard update extraction ─────────────────────────────────────────────
// Detect financial events in user messages and produce a structured update.
// Supports: new retainer (mrr+), lost retainer (mrr-), one-time revenue.
// Caller passes current retainers (for fuzzy match on mrr-) and known
// prospect names (for better clientName resolution).
export async function extractDashboardUpdate(userInput, { retainers = [], knownNames = [] } = {}, lang = 'fr') {
  const retainerLines = retainers.length > 0
    ? retainers.map((r) => `  ${r.id || ''} | ${r.name || 'Client'} | $${r.amount || 0}/mo`).join('\n')
    : '  (none)';
  const nameHints = knownNames.length > 0 ? knownNames.slice(0, 40).join(', ') : '(none)';

  const system = `You extract FINANCIAL events from short user messages for Samuel's business dashboard. User speaks casual French/English. Reply with STRICT JSON only — no prose, no markdown.

Existing retainers (for matching a loss):
${retainerLines}

Known client / prospect names (hints, not a strict list):
${nameHints}

Schema:
{
  "type":        "mrr+" | "mrr-" | "one-time" | "expense",
  "amount":      number,          // positive integer, in CAD unless currency specified otherwise
  "clientName":  string,          // for revenue types — best-guess name or "Nouveau client" / "New client"
  "retainerId":  string | null,   // when type is "mrr-", match to an id above if confident; else null
  "category":    string,          // for "expense" only: "tools" | "ads" | "subscription" | "freelance" | "office" | "other"
  "label":       string,          // for "expense" only: short description (e.g. "ElevenLabs", "Facebook Ads")
  "isRecurring": boolean,         // for "expense" only: true if /mois / /mo / monthly suffix present
  "reason":      string,          // short snippet from user's phrasing
  "confidence":  number           // 0 to 1
}

Classification rules:
- Expense signals ("j'ai payé", "j'ai dépensé", "j'ai déboursé", "j'ai investi", "spent", "paid", "invested", "facture", "abonnement", "coût") → type "expense"
- "/mois", "/mo", "/month", "MRR", "retainer", "par mois", "mensuel" → "mrr+" (new) / "mrr-" (lost) / "expense" with isRecurring=true for subscription costs
- "j'ai signé (un client)", "I signed (a client)", "new retainer" → "mrr+"
- "j'ai perdu (un client)", "lost a client", "client parti" → "mrr-"
- "touché", "rentré", "reçu", "got paid" + amount (no /mois, no expense verb) → "one-time"
- "one-time", "one shot", "contrat unique", "contrat de X$" → "one-time"
- If no monthly suffix AND no explicit verb but money is mentioned AND it sounds like income → default to "one-time"
- If an expense verb is present → expense, regardless of /mois (isRecurring captures the recurrence)

Expense category rules:
- "outils", "tools", "logiciel", "software", "SaaS", "app", named SaaS products (ElevenLabs, Figma, Notion…) → "tools"
- "pub", "ads", "Facebook Ads", "Google Ads", "Instagram Ads", "TikTok Ads", "publicité", "boost" → "ads"
- "abonnement", "subscription", recurring SaaS named → "subscription"
- "freelance", "sous-traitant", "contractor", "agence" paid for work → "freelance"
- "bureau", "loyer", "office", "rent", "équipement" → "office"
- Anything else → "other"

Validation rules (if violated → confidence 0):
- amount MUST be a positive integer > 0
- amount > 100000 requires explicit context (very large amounts are suspicious)
- past hypothetical ("j'aurais pu...", "si j'avais payé") → confidence 0
- ambiguous / no amount mentioned → confidence 0
- "expense" without a clear category AND no label → confidence 0

For "mrr-": try to match retainerId from the list above using the name / amount clues. If no confident match, set retainerId to null.

Output ONLY the JSON object.`;

  try {
    console.log('[extractDashboardUpdate] user input:', userInput);
    const text = await callClaude(
      system,
      [{ role: 'user', content: userInput }],
      220,
      false,
      null, false, false, 'COORDINATOR',
      HAIKU_MODEL
    );
    console.log('[extractDashboardUpdate] Haiku raw:', text);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.warn('[extractDashboardUpdate] no JSON'); return null; }
    const parsed = JSON.parse(match[0]);
    console.log('[extractDashboardUpdate] parsed:', parsed);

    if (!['mrr+', 'mrr-', 'one-time', 'expense'].includes(parsed.type)) return null;
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.6) {
      console.warn('[extractDashboardUpdate] rejected — confidence=', parsed.confidence);
      return null;
    }
    const amount = Number(parsed.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      console.warn('[extractDashboardUpdate] rejected — amount=', parsed.amount);
      return null;
    }

    // Resolve retainerId for mrr- if not provided
    let retainerId = parsed.retainerId || null;
    if (parsed.type === 'mrr-' && !retainerId && retainers.length > 0) {
      const nameGuess = String(parsed.clientName || '').toLowerCase();
      const hit = retainers.find((r) =>
        (nameGuess && String(r.name || '').toLowerCase().includes(nameGuess)) ||
        Number(r.amount) === Math.round(amount)
      );
      if (hit) retainerId = hit.id;
    }

    const VALID_CATEGORIES = ['tools', 'ads', 'subscription', 'freelance', 'office', 'other'];
    const category = parsed.type === 'expense'
      ? (VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'other')
      : null;

    return {
      type:        parsed.type,
      amount:      Math.round(amount),
      clientName:  String(parsed.clientName || (lang === 'fr' ? 'Nouveau client' : 'New client')).slice(0, 80),
      retainerId,
      category,
      label:       parsed.type === 'expense' ? String(parsed.label || '').slice(0, 80) : null,
      isRecurring: parsed.type === 'expense' ? !!parsed.isRecurring : false,
      reason:      String(parsed.reason || '').slice(0, 200),
      confidence:  parsed.confidence,
    };
  } catch (err) {
    console.warn('[extractDashboardUpdate] failed:', err.message);
    return null;
  }
}

// ─── Memory recap (session-start welcome) ────────────────────────────────────
// Compress raw Mem0 entries + last local session summary into a 3-point recap.
// Returns null when there's nothing meaningful to show.
export async function generateMemoryRecap({ memories = [], lastSession = null }, lang = 'fr') {
  if ((!memories || memories.length === 0) && !lastSession) return null;

  const memoryBlock = memories.length > 0
    ? memories.slice(0, 8).map((m, i) => `  ${i + 1}. ${m}`).join('\n')
    : '  (none)';
  const lastBlock = lastSession
    ? [
        lastSession.consensus            ? `  consensus: ${lastSession.consensus}`         : null,
        lastSession.summary?.consensusAction ? `  action: ${lastSession.summary.consensusAction}` : null,
        lastSession.summary?.keyDecisions?.length
          ? `  decisions: ${lastSession.summary.keyDecisions.slice(0, 3).map((d) => typeof d === 'string' ? d : d.decision).join(' | ')}`
          : null,
      ].filter(Boolean).join('\n')
    : '  (none)';

  const system = `You generate a SHORT recap for Samuel at the start of a new advisory session. He runs NT Solutions (AI agency, Quebec) + PC Glow Up. You're the coordinator — you brief him on what you remember before the session starts. Reply with STRICT JSON only.

Stored memories (long-term, from Mem0):
${memoryBlock}

Last session (local history):
${lastBlock}

Schema:
{
  "welcomeLine": string,   // 1 short opening line, ≤ 80 chars, warm but not syrupy
  "lastWin":     string,   // ≤ 100 chars, last notable win/signature/progress — empty string if none clear
  "lastBlocker": string,   // ≤ 100 chars, last blocker/concern/stuck point — empty string if none clear
  "nextMove":    string,   // ≤ 100 chars, next committed move / action Samuel owes himself — empty string if none clear
  "confidence":  number    // 0 to 1 — how much of this is actually grounded in the sources above
}

Rules:
- Language: ${lang === 'fr' ? 'FRANÇAIS' : 'ENGLISH'}
- Be specific — use real names, numbers, dates when they're in the sources. Never invent.
- If a field has nothing concrete to say, set it to "" (empty). Do not fill with filler.
- confidence < 0.5 when you had to guess or nothing was specific — caller will drop the recap.
- Never reference "Mem0" or "your memory system" — speak as QG, not as an AI tool.
- welcomeLine examples (FR): "Prêt à reprendre là où on s'est quittés.", "On avait laissé un plan ouvert — on finit ?"
- welcomeLine examples (EN): "Picking up where we left off.", "Still one move open from last time — let's close it."
- Output ONLY the JSON object.`;

  try {
    console.log('[generateMemoryRecap] sources — memories:', memories.length, 'lastSession:', !!lastSession);
    const text = await callClaude(
      system,
      [{ role: 'user', content: 'Generate the recap.' }],
      400,
      false,
      null, false, false, 'COORDINATOR',
      HAIKU_MODEL
    );
    console.log('[generateMemoryRecap] Haiku raw:', text);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    console.log('[generateMemoryRecap] parsed:', parsed);

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.5) {
      console.warn('[generateMemoryRecap] dropped — confidence=', parsed.confidence);
      return null;
    }
    const welcomeLine = String(parsed.welcomeLine || '').slice(0, 120).trim();
    const lastWin     = String(parsed.lastWin || '').slice(0, 120).trim();
    const lastBlocker = String(parsed.lastBlocker || '').slice(0, 120).trim();
    const nextMove    = String(parsed.nextMove || '').slice(0, 120).trim();

    // Need at least ONE of the three substantive fields to be worth showing
    if (!lastWin && !lastBlocker && !nextMove) {
      console.warn('[generateMemoryRecap] dropped — all fields empty');
      return null;
    }
    return { welcomeLine, lastWin, lastBlocker, nextMove, confidence: parsed.confidence };
  } catch (err) {
    console.warn('[generateMemoryRecap] failed:', err.message);
    return null;
  }
}

// ─── Email urgency classifier (for background watcher) ──────────────────────
// Classifies a single business email as urgent or not. Keeps the prompt tiny
// to stay cheap — this runs for every new business email the poller finds.
export async function classifyEmailUrgency(email, lang = 'fr') {
  if (!email) return null;
  const snippet = String(email.snippet || '').slice(0, 500);
  const body    = String(email.body || '').slice(0, 800);

  const system = `You classify a business email's URGENCY for Samuel (NT Solutions agency in Quebec). Reply with STRICT JSON only — no prose.

Schema:
{
  "isUrgent":   boolean,          // true only if action is expected from Samuel within 24-48h
  "category":   "prospect_reply" | "client_issue" | "invoice" | "opportunity" | "other",
  "oneLine":    string,            // ≤ 90 chars, ${lang === 'fr' ? 'EN FRANÇAIS' : 'IN ENGLISH'}, concise action-oriented summary (e.g. "Dubé Auto demande un devis pour lundi")
  "confidence": number             // 0 to 1
}

Urgency rules:
- isUrgent=true for: prospect asking a question requiring a reply, client reporting a problem/bug, invoice needing payment, time-sensitive opportunity, meeting request with a date
- isUrgent=false for: FYI updates, "received" confirmations, long-term marketing conversations with no specific ask, general business inbound without deadline
- A prospect simply saying "thanks for the info, we'll circle back" → NOT urgent
- A client saying "we need this fixed by Friday" → URGENT
- "oneLine" must extract the actual ASK, not rephrase the subject. What does Samuel need to do?

Output ONLY the JSON object.`;

  const userInput = `From: ${email.from || 'Unknown'}
Subject: ${email.subject || '(no subject)'}
Snippet: ${snippet}
Body: ${body}`;

  try {
    const text = await callClaude(
      system,
      [{ role: 'user', content: userInput }],
      180,
      false,
      null, false, false, 'COORDINATOR',
      HAIKU_MODEL
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.isUrgent !== 'boolean') return null;
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.55) return null;
    const VALID_CATS = ['prospect_reply', 'client_issue', 'invoice', 'opportunity', 'other'];
    const category = VALID_CATS.includes(parsed.category) ? parsed.category : 'other';
    return {
      isUrgent:   parsed.isUrgent,
      category,
      oneLine:    String(parsed.oneLine || '').slice(0, 140).trim(),
      confidence: parsed.confidence,
    };
  } catch (err) {
    console.warn('[classifyEmailUrgency] failed:', err.message);
    return null;
  }
}

// ─── Session runner ───────────────────────────────────────────────────────────

// ─── Daily quote ─────────────────────────────────────────────────────────────

export async function getDailyQuote(lang = 'fr') {
  const today = new Date().toDateString();
  try {
    const cached = localStorage.getItem('qg_daily_quote_v1');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.date === today && parsed.lang === lang) return parsed;
    }
  } catch {}

  const agents = ['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL'];
  const agent  = agents[Math.floor(Math.random() * agents.length)];

  try {
    const quote = await callClaude(
      getDailyQuotePrompt(lang),
      [{ role: 'user', content: 'Give me your one-sentence wisdom for today.' }],
      60, false, null, false, false, null,
      HAIKU_MODEL
    );
    const result = { date: today, quote: quote.trim(), agent, lang };
    localStorage.setItem('qg_daily_quote_v1', JSON.stringify(result));
    return result;
  } catch {
    return null;
  }
}

// ─── Dashboard Action ─────────────────────────────────────────────────────────

export async function generateDashboardAction(dashboardData = {}, lang = 'fr') {
  const { totalRevenue = 0, annualGoal = 0, totalMRR = 0, goalPct = 0, closingRate = 0 } = dashboardData;
  const langNote = lang === 'fr'
    ? 'Réponds en français, ton direct et percutant. 1 phrase max, commence par un verbe d\'action.'
    : 'Reply in English. Direct and punchy. 1 sentence max, start with an action verb.';

  const systemPrompt = `You are the Synthesizer — a cold-eyed business advisor for a Quebec entrepreneur running NT Solutions, an AI agency.
Current numbers: Revenue YTD $${totalRevenue.toLocaleString()}, Annual Goal $${annualGoal.toLocaleString()} (${goalPct}% achieved), MRR $${totalMRR.toLocaleString()}/month, Pipeline closing rate ${closingRate}%.
${langNote}
Identify the single most important action to take right now based on the numbers. No fluff, no preamble.`;

  try {
    const action = await callClaude(
      systemPrompt,
      [{ role: 'user', content: 'What is my #1 priority action right now?' }],
      40, false, null, false, false, null,
      HAIKU_MODEL
    );
    return action?.trim() || null;
  } catch {
    return null;
  }
}

// ─── Content Generator ───────────────────────────────────────────────────────

export async function generateLinkedInPosts(sessionContext, dashboardContext, winsContext, lang = 'fr') {
  const langNote = lang === 'fr'
    ? 'Write all 3 posts in French (Quebec style — casual, direct, authentic). No English.'
    : 'Write all 3 posts in English. Be direct, punchy, no corporate speak.';

  const systemPrompt = AGENT_PROMPTS.GARYV + `

CONTENT GENERATION MODE — LinkedIn Posts

You are generating 3 distinct LinkedIn post options based on real session context.

Each post must:
- Be 150-300 words
- Start with a hook line that stops the scroll
- Draw from the ACTUAL session discussion (specific insights, decisions, or realizations)
- Sound like a real entrepreneur sharing a lesson, not a motivational poster
- End with a question or call to action

Format EXACTLY as:
---POST 1---
[post content]
---POST 2---
[post content]
---POST 3---
[post content]
---END---

${langNote}`;

  const context = [
    sessionContext ? `SESSION DISCUSSED: ${sessionContext}` : '',
    dashboardContext || '',
    winsContext ? `RECENT WINS: ${winsContext}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    return await callClaude(
      systemPrompt,
      [{ role: 'user', content: context || 'Generate 3 LinkedIn posts about entrepreneurship and AI automation for SMEs.' }],
      1000,
      false
    );
  } catch {
    return null;
  }
}

// ─── Session runner ───────────────────────────────────────────────────────────

export async function analyzeProspect(prospectData, dashboardContext, lang = 'fr') {
  const langNote = getLangInstruction(lang);
  const context = `${dashboardContext ? dashboardContext + '\n\n' : ''}PROSPECT DATA:\n${prospectData}`;
  const [voss, hormozi] = await Promise.all([
    callClaude(PROSPECT_VOSS_PROMPT + langNote, [{ role: 'user', content: context }], 600, false).catch(() => null),
    callClaude(PROSPECT_HORMOZI_PROMPT + langNote, [{ role: 'user', content: context }], 600, false).catch(() => null),
  ]);
  return { voss, hormozi };
}

export async function generateMondayReport(dashboardContext, historyContext, lang = 'fr') {
  const context = [dashboardContext, historyContext].filter(Boolean).join('\n\n');
  try {
    return await callClaude(
      MONDAY_REPORT_PROMPT + getLangInstruction(lang),
      [{ role: 'user', content: context || 'No data available yet. Generate a motivational Monday briefing.' }],
      600,
      false
    );
  } catch {
    return null;
  }
}

// ─── Conversation continuity helpers (Steps 1, 3, 4, 5, 7) ──────────────────

function shouldContinueWithSameAgent(lastAgentContent, userMessage) {
  const lastHadQuestion = lastAgentContent.includes('?');
  const userIsAnswering = userMessage.length < 100 || !userMessage.includes('?');
  return lastHadQuestion && userIsAnswering;
}

const TOPIC_SHIFT_TRIGGERS = [
  'maintenant', 'autre chose', 'et pour', 'parlons de', 'changement de sujet',
  'passons à', 'now what about', "let's talk about", 'what about', 'different question',
];

function detectTopicShift(userMessage) {
  const lower = userMessage.toLowerCase();
  return TOPIC_SHIFT_TRIGGERS.some((t) => lower.includes(t));
}

function buildSessionMemory(conversationHistory) {
  if (conversationHistory.length < 2) return null;
  const pairs = [];
  let lastUser = null;
  for (const msg of conversationHistory) {
    if (msg.type === 'user') { lastUser = msg.content; }
    else if (msg.type === 'agent' && lastUser) {
      const preview = msg.content.length > 120 ? msg.content.slice(0, 120) + '…' : msg.content;
      pairs.push(`[${msg.agent}]: ${preview}`);
      lastUser = null;
    }
  }
  const last5 = pairs.slice(-5);
  if (last5.length === 0) return null;
  return `CURRENT SESSION (last ${last5.length} exchange${last5.length !== 1 ? 's' : ''}):\n${last5.join('\n')}`;
}

const SILENCE_RULE_SUFFIX = `\n\nCONVERSATION ROLE: You are supporting this conversation, not leading. Stay silent UNLESS all of these are true:\n1. Your specific domain expertise is directly needed\n2. The lead agent missed something critical\n3. Your contribution is maximum 2 sentences\n4. You have not spoken in the last 3 exchanges\nIf nothing essential to add, respond with exactly "—"`;

export async function runSession(userInput, conversationHistory, mode, deepMode, agentNames = {}, onProgress, focusAgent = null, calendarContext = null, attachment = null, streamCallbacks = null, thinkingMode = false, conversationState = null, lang = 'fr') {
  const langInstruction = getLangInstruction(lang);
  const calendarSuffix = calendarContext ? `\n\n${calendarContext}` : '';
  // Inject CSV/XLSX data as a system suffix
  const dataSuffix = attachment && (attachment.type === 'csv' || attachment.type === 'xlsx')
    ? `\n\nUPLOADED DATA FILE — ${attachment.name}:\n\`\`\`\n${attachment.text}\n\`\`\``
    : '';

  // Pre-analyze image with base Claude (no persona) for verbatim accuracy
  let imageContext = '';
  if (attachment?.type === 'image') {
    try {
      const vision = await callClaude(
        'You are a precise visual analyst. Your only job: describe EVERYTHING visible in this image with complete accuracy.\n' +
        '— Quote ALL text verbatim, word for word\n' +
        '— Describe every UI element, button, field, number, chart, table, person, logo\n' +
        '— Note colors, layout, hierarchy, any errors or highlights\n' +
        '— Be exhaustive. Miss nothing.',
        [{ role: 'user', content: 'Describe this image completely.' }],
        1000,
        false,
        attachment,
        false
      );
      imageContext = `[IMAGE — verbatim analysis]\n${vision}\n[END IMAGE]\n\n`;
    } catch (e) {
      console.warn('[Vision pre-analysis failed]', e.message);
      imageContext = '[IMAGE ATTACHED — analyze its contents before advising]\n\n';
    }
  }
  const agentInput = imageContext + userInput;

  // Helper: call lead agent with streaming (if callbacks) or regular
  const callLead = (key, system, msgs, maxTokens, attach = null) => {
    onProgress?.(key);
    streamCallbacks?.onAgentStart?.(key);
    if (streamCallbacks) {
      return callClaudeStream(system, msgs, maxTokens, deepMode, attach,
        streamCallbacks.onToken, streamCallbacks.onSearchState, streamCallbacks.onThinkingState, thinkingMode, key);
    }
    return callClaude(system, msgs, maxTokens, deepMode, attach, true, thinkingMode, key);
  };

  // Focus mode — bypass coordinator, talk directly to one agent
  if (focusAgent && focusAgent !== 'SYNTHESIZER') {
    const historyMessages = buildHistoryMessages(conversationHistory);
    const detectedMode = await detectMode(userInput);
    const modeSuffix = `\n\nMode détecté : ${detectedMode}. Réponds en conséquence.`;
    const focusSystem = BASE_CONTEXT + langInstruction + calendarSuffix + dataSuffix + '\n\n' + buildAgentPrompt(focusAgent) + modeSuffix;
    const response = await callLead(
      focusAgent, focusSystem,
      [...historyMessages, { role: 'user', content: agentInput }],
      1000, attachment
    );
    return {
      type: 'agents',
      routing: { lead: focusAgent, supporting: [] },
      responses: [{ agent: focusAgent, content: response }],
    };
  }

  // ── Call Preparation Mode ───────────────────────────────────────────────────
  if (mode === 'prepCall') {
    const historyMessages = buildHistoryMessages(conversationHistory);
    const userMsg = [...historyMessages, { role: 'user', content: agentInput }];

    // Stream VOSS (lead), call others in parallel
    const [vossR, hormoziR, cardoneR] = await Promise.all([
      callLead('VOSS', BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + AGENT_PROMPTS.VOSS + PREP_CALL_PROMPT, userMsg, 900, attachment),
      callClaude(BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + AGENT_PROMPTS.HORMOZI + PREP_CALL_PROMPT, userMsg, 600, deepMode, null, true, false, 'HORMOZI'),
      callClaude(BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + AGENT_PROMPTS.CARDONE + PREP_CALL_PROMPT, userMsg, 500, deepMode, null, true, false, 'CARDONE'),
    ]);
    const responses = [
      { agent: 'VOSS', content: vossR },
      { agent: 'HORMOZI', content: hormoziR },
      { agent: 'CARDONE', content: cardoneR },
    ];
    return { type: 'agents', routing: { lead: 'VOSS', supporting: ['HORMOZI', 'CARDONE'] }, responses };
  }

  // ── Negotiation Simulation Mode ─────────────────────────────────────────────
  if (mode === 'negotiation') {
    const historyMessages = buildHistoryMessages(conversationHistory);
    const response = await callLead(
      'VOSS',
      BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + NEGOTIATION_PROMPT,
      [...historyMessages, { role: 'user', content: agentInput }],
      700, attachment
    );
    return { type: 'agents', routing: { lead: 'VOSS', supporting: [] }, responses: [{ agent: 'VOSS', content: response }] };
  }

  // ── Conversation Analysis Mode ──────────────────────────────────────────────
  if (mode === 'analysis') {
    const historyMessages = buildHistoryMessages(conversationHistory);
    const userMsg = [...historyMessages, { role: 'user', content: agentInput }];

    // VOSS leads analysis + coordinator determines second agent
    const routing = await callCoordinator(userInput, deepMode, lang).catch(() => ({ lead: 'HORMOZI', supporting: [] }));
    const secondAgent = routing.lead !== 'VOSS' ? routing.lead : (routing.supporting?.[0] || 'HORMOZI');

    // Stream VOSS, run second agent in parallel
    const [vossR, secondR] = await Promise.all([
      callLead('VOSS', BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + AGENT_PROMPTS.VOSS + ANALYSIS_PROMPT, userMsg, 800, attachment),
      callClaude(BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + AGENT_PROMPTS[secondAgent] + ANALYSIS_PROMPT, userMsg, 600, deepMode, null, true, false, secondAgent),
    ]);
    return {
      type: 'agents',
      routing: { lead: 'VOSS', supporting: [secondAgent] },
      responses: [{ agent: 'VOSS', content: vossR }, { agent: secondAgent, content: secondR }],
    };
  }

  // ── Debate Mode — two agents take opposing positions ──────────────────────
  if (mode === 'debate') {
    const historyMessages = buildHistoryMessages(conversationHistory);
    const userMsg = [...historyMessages, { role: 'user', content: agentInput }];

    // Coordinator picks the lead (FOR) agent; we pick the opposition
    const routing = await callCoordinator(userInput, deepMode, lang).catch(() => ({ lead: 'HORMOZI', supporting: [] }));
    const proAgent = routing.lead;
    // Pick a contrasting agent: if business/sales, get mindset; if mindset, get business
    const CONTRAST_MAP = {
      HORMOZI: 'NAVAL',  NAVAL: 'CARDONE', CARDONE: 'ROBBINS',
      ROBBINS: 'HORMOZI', GARYV: 'VOSS',   VOSS: 'GARYV',
    };
    const contraAgent = CONTRAST_MAP[proAgent] || (proAgent === 'HORMOZI' ? 'NAVAL' : 'HORMOZI');

    const debateSuffix = (side) => `\n\nDEBATE MODE: You are taking the ${side === 'pro' ? 'PRO / FOR' : 'CONTRA / AGAINST'} position on the user's question or statement. Be direct, bold, and confident in your stance. Use your unique expertise as evidence. Max 200 words. Start with your position clearly stated.`;

    const [proR, contraR] = await Promise.all([
      callLead(proAgent,
        BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + buildAgentPrompt(proAgent) + debateSuffix('pro'),
        userMsg, 800, attachment),
      callClaude(
        BASE_CONTEXT + langInstruction + dataSuffix + '\n\n' + buildAgentPrompt(contraAgent) + debateSuffix('contra'),
        userMsg, 700, deepMode, null, false, false, contraAgent),
    ]);
    return {
      type: 'agents',
      routing: { lead: proAgent, supporting: [contraAgent] },
      responses: [{ agent: proAgent, content: proR }, { agent: contraAgent, content: contraR }],
    };
  }

  // ── Roleplay Mode ──────────────────────────────────────────────────────────
  if (mode === 'roleplay') {
    const scenarioKey = calendarContext?.split('ROLEPLAY_SCENARIO:')?.[1]?.trim() || 'sales_resistant';
    const isDebrief = userInput === '__ROLEPLAY_DEBRIEF__';
    const historyMessages = buildHistoryMessages(conversationHistory);

    if (isDebrief) {
      // All agents give debrief simultaneously
      const debriefPrompt = getRoleplayDebriefPrompt(scenarioKey, lang);
      const convCtx = buildConversationContext(conversationHistory);
      const debriefInput = `Full roleplay transcript:\n\n${convCtx}\n\nDeliver the complete debrief.`;
      const [vossR, hormoziR, cardoneR, robbinsR] = await Promise.all([
        callLead('VOSS', BASE_CONTEXT + langInstruction + '\n\n' + debriefPrompt, [{ role: 'user', content: debriefInput }], 700),
        callClaude(BASE_CONTEXT + langInstruction + '\n\n' + AGENT_PROMPTS.HORMOZI + '\n\nROLEPLAY DEBRIEF MODE: ' + debriefPrompt, [{ role: 'user', content: debriefInput }], 500, deepMode, null, false, false, 'HORMOZI'),
        callClaude(BASE_CONTEXT + langInstruction + '\n\n' + AGENT_PROMPTS.CARDONE + '\n\nROLEPLAY DEBRIEF MODE: ' + debriefPrompt, [{ role: 'user', content: debriefInput }], 400, deepMode, null, false, false, 'CARDONE'),
        callClaude(BASE_CONTEXT + langInstruction + '\n\n' + AGENT_PROMPTS.ROBBINS + '\n\nROLEPLAY DEBRIEF MODE: ' + debriefPrompt, [{ role: 'user', content: debriefInput }], 400, deepMode, null, false, false, 'ROBBINS'),
      ]);
      return {
        type: 'agents',
        routing: { lead: 'VOSS', supporting: ['HORMOZI', 'CARDONE', 'ROBBINS'] },
        responses: [
          { agent: 'VOSS', content: vossR },
          { agent: 'HORMOZI', content: hormoziR },
          { agent: 'CARDONE', content: cardoneR },
          { agent: 'ROBBINS', content: robbinsR },
        ],
      };
    }

    // Normal roleplay exchange — VOSS plays the other person
    const roleplaySystem = BASE_CONTEXT + langInstruction + '\n\n' + getRoleplayPrompt(scenarioKey, lang);
    const response = await callLead(
      'VOSS', roleplaySystem,
      [...historyMessages, { role: 'user', content: agentInput }],
      600, attachment
    );
    return { type: 'agents', routing: { lead: 'VOSS', supporting: [] }, responses: [{ agent: 'VOSS', content: response }] };
  }

  // Check if user is requesting the Synthesizer
  const lower = userInput.toLowerCase().trim();
  const isSynthRequest = SYNTHESIZER_TRIGGERS.some((t) => lower.includes(t));

  if (isSynthRequest) {
    const context = buildConversationContext(conversationHistory);
    const system = BASE_CONTEXT + langInstruction + calendarSuffix + '\n\n' + buildAgentPrompt('SYNTHESIZER');
    const content = context
      ? `Here is the conversation so far:\n\n${context}\n\nUser: ${agentInput}`
      : agentInput;

    const response = await callLead('SYNTHESIZER', system, [{ role: 'user', content }], 1000);
    return {
      type: 'synthesizer',
      responses: [{ agent: 'SYNTHESIZER', content: response }],
    };
  }

  // Silent mode — no agent responses during session
  if (mode === 'silent') {
    return { type: 'silent' };
  }

  // ─── Step 4: Topic shift detection ───────────────────────────────────────────
  const isTopicShift = detectTopicShift(userInput);

  // ─── Steps 1 & 7: Conversation continuity — bypass coordinator if same agent should continue ─
  const lastAgentMsg = [...conversationHistory].reverse().find((m) => m.type === 'agent');
  const continueSameAgent =
    conversationState !== null &&
    !isTopicShift &&
    lastAgentMsg !== undefined &&
    shouldContinueWithSameAgent(lastAgentMsg.content, userInput);

  // ─── Coordinator routing ──────────────────────────────────────────────────────
  let routing, detectedMode;
  if (continueSameAgent) {
    // Bypass coordinator — same agent picks up directly
    routing = { lead: lastAgentMsg.agent, supporting: [], emotionalState: 'neutral' };
    detectedMode = 'DIRECT';
    onProgress?.(routing.lead);
  } else {
    // Normal coordinator routing
    onProgress?.('COORDINATOR');
    [routing, detectedMode] = await Promise.all([
      callCoordinator(userInput, deepMode, lang),
      detectMode(userInput),
    ]);
  }
  const modeSuffix = `\n\nMode détecté : ${detectedMode}. Réponds en conséquence.`;

  // Step 7: Smart follow-up injection when continuing with the same agent
  const lastQuestion = conversationState?.lastQuestion || null;
  const continuationSuffix = continueSameAgent
    ? `\n\nTu continues une conversation que tu as amorcée. L'utilisateur répond directement à ta question. Sa réponse : "${userInput}".${lastQuestion ? ` Ta question originale était : "${lastQuestion}".` : ''} Réponds directement à sa réponse. Aucun préambule. Aucune réintroduction.`
    : '';

  // Emotional tone modifier for agents
  const emotionalSuffix = getEmotionalSuffix(routing.emotionalState);

  // Step 5: Session memory — compressed current-session context injected into every call
  const sessionMemory = buildSessionMemory(conversationHistory);
  const sessionMemorySuffix = sessionMemory ? `\n\n${sessionMemory}` : '';

  // Build conversation history messages for lead agent
  const historyMessages = buildHistoryMessages(conversationHistory);
  const leadMessages = [...historyMessages, { role: 'user', content: agentInput }];

  // Architect mode — first message only: ask 3 questions before advising
  if (mode === 'architect' && conversationHistory.length === 0) {
    const architectSystem = BASE_CONTEXT + langInstruction + calendarSuffix + dataSuffix + emotionalSuffix + '\n\n' + AGENT_PROMPTS[routing.lead] + ARCHITECT_QUESTIONS_SUFFIX;
    const questions = await callLead(routing.lead, architectSystem, [{ role: 'user', content: agentInput }], 300, attachment);
    return { type: 'agents', routing: { lead: routing.lead, supporting: [] }, responses: [{ agent: routing.lead, content: questions }], activeAgent: routing.lead, didContinueSameAgent: false, wasTopicShift: isTopicShift };
  }

  // Call lead agent (streaming if callbacks provided)
  const leadSystem = BASE_CONTEXT + langInstruction + calendarSuffix + dataSuffix + emotionalSuffix + sessionMemorySuffix + '\n\n' + buildAgentPrompt(routing.lead) + modeSuffix + continuationSuffix;
  const leadResponse = await callLead(routing.lead, leadSystem, leadMessages, 1000, attachment);

  const responses = [{ agent: routing.lead, content: leadResponse }];

  // Quick mode: lead agent only
  if (mode === 'quick' || !routing.supporting || routing.supporting.length === 0) {
    return { type: 'agents', routing, responses, activeAgent: routing.lead, didContinueSameAgent: continueSameAgent, wasTopicShift: isTopicShift };
  }

  // Strategic mode: call supporting agents in parallel
  // Step 3: Silence rule injected into every supporting agent's system prompt
  const displayLead = agentNames[routing.lead] || routing.lead;
  const contextWithLead =
    agentInput +
    `\n\n--- ${displayLead} already responded: ---\n${leadResponse}\n\n` +
    `Add your perspective ONLY if you have something genuinely different and valuable to contribute. ` +
    `If ${displayLead} covered it well, respond with exactly: —`;

  onProgress?.(routing.supporting[0] ?? routing.lead);

  const supportResults = await Promise.all(
    routing.supporting.map((agentName) => {
      const supportSystem = BASE_CONTEXT + langInstruction + calendarSuffix + dataSuffix + emotionalSuffix + SILENCE_RULE_SUFFIX + '\n\n' + buildAgentPrompt(agentName) + modeSuffix;
      return callClaude(supportSystem, [{ role: 'user', content: contextWithLead }], 1000, deepMode, attachment, true, false, agentName)
        .then((content) => ({ agent: agentName, content }))
        .catch(() => null);
    })
  );

  for (const result of supportResults) {
    if (!result) continue;
    const trimmed = result.content.trim();
    if (trimmed !== '—' && trimmed !== '-' && trimmed.length > 10) {
      responses.push(result);
    }
  }

  return { type: 'agents', routing, responses, activeAgent: routing.lead, didContinueSameAgent: continueSameAgent, wasTopicShift: isTopicShift };
}

// ─── Session archiving ────────────────────────────────────────────────────────

export async function archiveSession(conversationHistory, lang = 'fr') {
  if (conversationHistory.length === 0) return null;

  const sessionText = buildConversationContext(conversationHistory);

  try {
    const response = await callClaude(
      ARCHIVIST_PROMPT + getLangInstruction(lang),
      [{ role: 'user', content: sessionText }],
      800,
      false
    );

    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    // Stamp each decision with today's date
    const today = new Date().toISOString();
    if (parsed.keyDecisions) {
      parsed.keyDecisions = parsed.keyDecisions.map((d, i) => ({
        ...(typeof d === 'string' ? { decision: d, agent: 'GENERAL' } : d),
        date: today,
        id: `${Date.now()}-${i}`,
        outcome: null,
      }));
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── Session consensus (Synthesizer) ─────────────────────────────────────────

export async function callConsensus(conversationHistory, lang = 'fr') {
  if (conversationHistory.length === 0) return null;

  const sessionText = buildConversationContext(conversationHistory);

  try {
    const response = await callClaude(
      CONSENSUS_PROMPT + getLangInstruction(lang),
      [{ role: 'user', content: `Here is the full session:\n\n${sessionText}` }],
      100, false, null, false, false, null,
      HAIKU_MODEL
    );

    // Extract the alignment line — must start with "Today your HQ"
    const line = response
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().startsWith('today your hq'));

    return line || response.trim();
  } catch {
    return null;
  }
}

// ─── Gmail: email analysis + draft generation ─────────────────────────────────

export async function analyzeEmail(fromStr, subject, snippet, lang = 'fr') {
  try {
    const result = await callClaude(
      `You are the coordinator of The Headquarters. Analyze this email and return ONLY valid JSON — no other text:
{
  "priority": "haute",
  "type": "prospect",
  "recommendedAgent": "VOSS",
  "suggestedAction": "one sentence action",
  "urgency": 7
}
priority: "haute" | "normale" | "faible"
type: "prospect" | "client" | "admin" | "opportunite" | "autre"
recommendedAgent: "VOSS" | "CARDONE" | "HORMOZI" | "GARYV" | "NAVAL" | "ROBBINS"
urgency: integer 1-10` + getLangInstruction(lang),
      [{ role: 'user', content: `From: ${fromStr}\nSubject: ${subject}\n\n${snippet}` }],
      100, false, null, false, false, 'COORDINATOR',
      HAIKU_MODEL
    );
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function draftEmailReply(agentKey, fromStr, subject, body, lang = 'fr') {
  const agentPrompt = buildAgentPrompt(agentKey);
  const emailInstruction = lang === 'fr'
    ? 'Tu rédiges une réponse email professionnelle. Sois concis et humain. Maximum 150 mots. Retourne UNIQUEMENT le texte de la réponse — aucun autre texte, aucune signature.'
    : 'You are drafting a professional email reply. Be concise and human. Maximum 150 words. Return ONLY the reply text — no other text, no signature.';
  const result = await callClaude(
    `${agentPrompt}${getLangInstruction(lang)}\n\n${emailInstruction}`,
    [{
      role: 'user',
      content: `Email reçu de ${fromStr}:\nSujet: ${subject}\n\n${body}\n\nRédige une réponse appropriée.`,
    }],
    400
  );
  return result.trim();
}

export async function generateTopicLabel(exchangeText) {
  try {
    const result = await callClaude(
      'You extract the core topic of a conversation excerpt. Return ONLY a label: 3 words max, no punctuation, no articles.',
      [{ role: 'user', content: exchangeText.slice(0, 400) }],
      10,
      false, null, false, false, null, HAIKU_MODEL
    );
    return result.trim().replace(/^["']|["']$/g, '').slice(0, 30);
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEmotionalSuffix(emotionalState) {
  const tones = {
    frustrated: '\n\nEMOTIONAL CONTEXT: Samuel is frustrated right now. Acknowledge it briefly (1 sentence max), then get straight to practical solutions. Skip any pep talk.',
    discouraged: '\n\nEMOTIONAL CONTEXT: Samuel is feeling discouraged. Open with genuine recognition of the difficulty, then rebuild momentum with specific, achievable next steps. Be direct and energizing.',
    excited: '\n\nEMOTIONAL CONTEXT: Samuel is energized and excited. Match his energy. Amplify the momentum while adding sharp, tactical depth. Cut the caveats.',
    urgent: '\n\nEMOTIONAL CONTEXT: Samuel needs this fast — time pressure is real. Lead immediately with the #1 most impactful action. Be ultra-concise.',
    confused: '\n\nEMOTIONAL CONTEXT: Samuel is confused or overwhelmed. Simplify everything. Use clear structure (numbered steps or clear categories). Avoid jargon. Make the path obvious.',
    neutral: '',
  };
  return tones[emotionalState] || '';
}

function buildConversationContext(messages) {
  return messages
    .filter((m) => m.type === 'user' || m.type === 'agent')
    .map((m) => {
      if (m.type === 'user') return `USER: ${m.content}`;
      return `${m.agent}: ${m.content}`;
    })
    .join('\n\n');
}

function buildHistoryMessages(conversationHistory) {
  // Group messages into user/assistant pairs for the API — full session context
  const result = [];

  let pendingUser = null;
  let pendingAgents = [];

  for (const msg of conversationHistory) {
    if (msg.type === 'user') {
      if (pendingUser !== null && pendingAgents.length > 0) {
        result.push({ role: 'user', content: pendingUser });
        result.push({
          role: 'assistant',
          // Single-agent turn: raw content only — no prefix the model could mimic.
          // Multi-agent turn: "AGENT: content" without brackets — purely a neutral separator.
          content: pendingAgents.length === 1
            ? pendingAgents[0].content
            : pendingAgents.map((a) => `${a.agent}: ${a.content}`).join('\n\n'),
        });
      }
      pendingUser = msg.content;
      pendingAgents = [];
    } else if (msg.type === 'agent') {
      pendingAgents.push(msg);
    }
  }

  // Don't include the last user message — it will be added separately
  return result;
}

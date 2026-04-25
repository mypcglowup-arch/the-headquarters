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
import { personalize, getLiveUserContext } from './utils/userProfile.js';

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

  // Personalize {name}/{role}/{annualGoal} tokens with the live user profile.
  // Replaces the legacy hardcoded "{name}" everywhere prompts are built.
  const ctx = getLiveUserContext();
  systemPrompt = personalize(systemPrompt, ctx);

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
    "suggestedMessage": "Message de prospection en français 130-160 mots, naturel, personnalisé au commerce, signe {name} — NT Solutions. Mentionne leur manque d'avis spécifiquement.",
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
7. Signé : {name} — NT Solutions

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

  // Personalize tokens with live user profile (same logic as callClaude)
  systemPrompt = personalize(systemPrompt, getLiveUserContext());

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

  const system = `You identify pipeline status changes for {name}'s CRM. User speaks short, casual French/English. Reply with STRICT JSON only — no prose, no markdown.

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

  const system = `You extract FINANCIAL events from short user messages for {name}'s business dashboard. User speaks casual French/English. Reply with STRICT JSON only — no prose, no markdown.

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

// ─── Decision outcome tracking ──────────────────────────────────────────────
// After an agent responds, detect if their advice contains a concrete
// actionable decision {name} could execute on. If yes → returns the decision
// text (concise, imperative form). 30 days later, the app asks him how it
// went — and that outcome flows back into the agent's context.
export async function extractActionableDecision(agentResponse, lang = 'fr') {
  if (!agentResponse || typeof agentResponse !== 'string') return null;
  if (agentResponse.length < 80) return null; // too short to carry a real decision

  const system = `You decide if an agent's message contains a CONCRETE ACTIONABLE DECISION that the user ({name}) could execute on. Reply STRICT JSON only.

Schema:
{
  "isDecision": boolean,
  "decision":   string,   // imperative form, ≤ 140 chars. Ex: "Cap next retainer at $750/mo minimum"
  "confidence": number    // 0 to 1
}

IS a decision (qualifies):
  - "Cap your next retainer at $750/mo"
  - "Stack the onboarding + 2 calls + priority support bundle"
  - "Call 10 prospects per day, 5 days a week"
  - "Cut your offer from 3 tiers to 1"
  - "Send the proposal to Dubé by Thursday"
  - "Block 90 min mornings for dialing"

NOT a decision (skip):
  - Questions ("Tu as réfléchi à...?")
  - Observations ("Ton pipeline est faible")
  - General principles ("Le prix est signal de valeur")
  - Reformulations of the user's question
  - Motivational statements
  - "You should think about..." (thinking ≠ doing)
  - Multi-step plans (we track ONE concrete action; skip if the response is a full multi-step plan)

HARD RULES:
- confidence < 0.75 → isDecision=false. Better to miss than log noise.
- decision must be ONE imperative sentence. Pick the MOST concrete single action if there are many.
- Language of the decision field: ${lang === 'fr' ? 'FRANÇAIS (query language the agent used)' : 'ENGLISH'}. Match the agent's original language.
- Imperative form, not "you should..." — "Cap next retainer at $750".
- Output ONLY the JSON.

Agent response:
"""
${agentResponse.slice(0, 1500)}
"""`;

  try {
    const text = await callClaude(system, [{ role: 'user', content: 'Extract the actionable decision, if any.' }], 200, false, null, false, false, 'COORDINATOR', HAIKU_MODEL);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.isDecision) return null;
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.75) return null;
    const decision = String(parsed.decision || '').trim().replace(/^["']|["']$/g, '');
    if (!decision || decision.length < 10 || decision.length > 180) return null;
    return { decision, confidence: parsed.confidence };
  } catch (err) {
    console.warn('[extractActionableDecision] failed:', err.message);
    return null;
  }
}

// Format recent decisions-with-outcomes for injection into an agent's system
// prompt. Each agent sees ONLY their own past track record — no cross-agent
// contamination. Returns empty string if nothing to show.
export function formatTrackRecord(decisions, targetAgent) {
  if (!Array.isArray(decisions) || !targetAgent) return '';
  const relevant = decisions
    .filter((d) => d && d.agent === targetAgent && d.outcome)
    .slice(-8);                    // last 8 with outcomes
  if (relevant.length === 0) return '';

  const lines = relevant.map((d) => {
    const dateStr = d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?';
    const icon = d.outcome === 'positive' ? '✓'
               : d.outcome === 'negative' ? '✗'
               : '~';
    const comment = d.outcomeComment ? ` — "${String(d.outcomeComment).slice(0, 100)}"` : '';
    return `  ${icon} ${dateStr}: "${d.decision}"${comment}`;
  }).join('\n');

  return `YOUR TRACK RECORD WITH {NAME} (your past advice + what actually happened — calibrate accordingly):
${lines}

Rules for using this:
- If a past recommendation led to ✗ (negative outcome), don't blindly repeat it — acknowledge what didn't work and adjust.
- If ✓ patterns emerge, lean into what's been validated.
- Never mention this track record directly to {name}. Just let it shape your judgment silently.`;
}

// ─── Plateau brief — diagnostic + 3 corrective actions ──────────────────────
// Given a computed forecast (from plateauForecaster), generate a direct,
// chiffré diagnostic in the voice of HORMOZI (numbers guy) blended with
// NAVAL's systems angle. No pep talk. No "you got this". Just math + moves.
export async function generatePlateauBrief(forecast, lang = 'fr') {
  if (!forecast) return null;

  const closingRatePct = Math.round((forecast.closingRate || 0) * 100);
  const growthRatePct  = Math.round((forecast.growthRate  || 0) * 100);
  const upliftPctRounded = Math.round((forecast.upliftPct || 0) * 100);

  const bottleneckText = forecast.bottleneck === 'both'
    ? (lang === 'fr' ? 'outreach ET taux de closing en dessous des seuils' : 'both outreach AND closing rate below thresholds')
    : forecast.bottleneck === 'outreach'
    ? (lang === 'fr' ? 'volume d\'outreach en dessous de 5/semaine' : 'outreach volume below 5/week')
    : forecast.bottleneck === 'closing'
    ? (lang === 'fr' ? 'taux de closing en dessous de 10%' : 'closing rate below 10%')
    : (lang === 'fr' ? 'croissance stagnante' : 'stalled growth');

  const system = `You write a PLATEAU DIAGNOSTIC for {name} (NT Solutions consultant). Tone = HORMOZI (numbers-first) meets NAVAL (systems thinking). Zero motivational talk. Reply STRICT JSON only.

{name}'s forecast (real numbers):
  Current MRR:         $${forecast.currentMRR}/mo
  Active retainers:    ${forecast.retainerCount}
  New retainers / mo:  ${forecast.newRetainersPerMonth}
  New MRR / mo:        $${forecast.newMrrPerMonth}
  Growth rate:         ${growthRatePct}% / mo
  Outreach / week:     ${forecast.avgOutreachPerWeek}
  Closing rate:        ${closingRatePct}%
  90-day MRR (current trajectory):  $${forecast.mrr90Current}
  90-day MRR (with corrective actions): $${forecast.mrr90Improved} (+${upliftPctRounded}%)
  Primary bottleneck: ${bottleneckText}

Schema:
{
  "headline":   string,   // ≤ 80 chars. Direct. Number-driven. No fluff.
  "diagnostic": string,   // 2 sentences. Explains WHAT is stalling and WHY the numbers say so. Chiffré.
  "actions": [
    {
      "title":     string,   // ≤ 60 chars. Imperative verb + concrete object (ex: "Double l'outreach: 10 dials/jour 5 jours/semaine")
      "rationale": string,   // 1 sentence. Why this specific action shifts the bottleneck.
      "impact":    string    // ≤ 60 chars. Estimated $ or % impact on 90-day MRR.
    },
    // EXACTLY 3 actions
  ],
  "scenarioCurrent":     string,  // 1 sentence. Paints the current trajectory in plain language + $.
  "scenarioWithActions": string   // 1 sentence. Paints improved trajectory + $ delta.
}

HARD RULES (violations → garbage):

NEVER write any of these:
  - "Tu peux y arriver" / "Crois en toi" / "You got this"
  - "N'abandonne pas" / "Garde le cap" / "Stay the course"
  - "C'est normal d'avoir des plateaux" (minimises)
  - "Attention" / "Warning" / "Alerte"
  - "Il faut" / "Tu dois" (orders without justification)
  - Motivational closings / pep talk
  - Generic "build systems" / "stay focused" advice
  - Vague "work harder"
  - Emojis

DO write:
  - Numbers in the FIRST sentence of everything (headline, diagnostic, scenarios)
  - Actions that have a DEADLINE or a CADENCE (per week, per day, by Friday)
  - Rationale tied to the SPECIFIC bottleneck identified
  - Impact expressed as $ or % delta
  - Cold, deliberate tone — like a senior ops partner reading the P&L

Good action examples (tone target):
  - "Bloque 90 min/jour × 5 pour dialer — 10 calls/jour = 50/semaine" → double ton outreach, targets bottleneck
  - "Monte ton retainer moyen: cap prochain client à $750/mo, pas $400" → +$3K MRR sur 10 closes
  - "Structure Démo: checklist 5 objections + slide prix fixe. Closing rate peut monter à 20%."

Language: ${lang === 'fr' ? 'FRANÇAIS québécois, tutoiement, direct' : 'ENGLISH, you, direct'}.

Output ONLY the JSON. No prose outside it.`;

  try {
    const text = await callClaude(
      system,
      [{ role: 'user', content: 'Generate the plateau brief.' }],
      900, false, null, false, false, 'HORMOZI', 'claude-sonnet-4-5'
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    // Validate shape
    if (!parsed.headline || !parsed.diagnostic || !Array.isArray(parsed.actions) || parsed.actions.length < 2) {
      console.warn('[generatePlateauBrief] invalid shape');
      return null;
    }
    const actions = parsed.actions.slice(0, 3).map((a) => ({
      title:     String(a.title || '').slice(0, 120).trim(),
      rationale: String(a.rationale || '').slice(0, 220).trim(),
      impact:    String(a.impact || '').slice(0, 120).trim(),
    })).filter((a) => a.title);
    if (actions.length < 2) return null;

    const brief = {
      headline:             String(parsed.headline).slice(0, 140).trim(),
      diagnostic:           String(parsed.diagnostic).slice(0, 400).trim(),
      actions,
      scenarioCurrent:      String(parsed.scenarioCurrent || '').slice(0, 220).trim(),
      scenarioWithActions:  String(parsed.scenarioWithActions || '').slice(0, 220).trim(),
    };

    // Regex guardrail — reject if banned motivational phrasings slipped in
    const banned = [
      /\btu peux y arriver\b/i, /\bcrois en toi\b/i, /\byou got this\b/i,
      /\bn[''']abandonne pas\b/i, /\bdon[''']t give up\b/i,
      /\bgarde le cap\b/i, /\bstay the course\b/i,
      /\bc[''']est normal d[''']avoir\b/i, /\bit[''']s normal to\b/i,
      /\battention\b/i, /\bwarning\b/i, /\balerte\b/i,
      /\btravaille plus fort\b/i, /\bwork harder\b/i,
      /\brest[ae] focus\b/i, /\bstay focused\b/i,
    ];
    const joined = [brief.headline, brief.diagnostic, brief.scenarioCurrent, brief.scenarioWithActions, ...actions.flatMap((a) => [a.title, a.rationale, a.impact])].join(' | ');
    for (const re of banned) {
      if (re.test(joined)) {
        console.warn('[generatePlateauBrief] rejected — banned phrase:', re);
        return null;
      }
    }

    return brief;
  } catch (err) {
    console.warn('[generatePlateauBrief] failed:', err.message);
    return null;
  }
}

// ─── Anomaly alert — week-over-week drop notification ───────────────────────
// Given a detected anomaly (current < previous by ≥ 40% on an axis), generate
// a short direct message in the voice of the owner agent. Numbers FIRST,
// diagnostic, then one concrete move. Never alarmist.
export async function generateAnomalyAlert(anomaly, lang = 'fr') {
  if (!anomaly) return null;
  const agentPrompt = AGENT_PROMPTS[anomaly.agent];
  if (!agentPrompt) return null;

  const dropPctRounded = Math.round(anomaly.dropPct * 100);

  const axisDescriptions = {
    outreach: {
      unit: lang === 'fr' ? 'prospects contactés' : 'prospects contacted',
      lens: lang === 'fr'
        ? 'ton activité outreach (emails de relance + touches prospects) cette semaine vs la semaine passée'
        : 'your outreach activity (follow-up emails + prospect touches) this week vs last week',
    },
    pipeline: {
      unit: lang === 'fr' ? 'mouvements pipeline' : 'pipeline movements',
      lens: lang === 'fr'
        ? 'les mouvements sur ton pipeline (status changes, contacts prospects) cette semaine vs la semaine passée'
        : 'your pipeline activity (status changes, prospect contacts) this week vs last week',
    },
    mrr: {
      unit: lang === 'fr' ? 'mouvements revenus' : 'revenue movements',
      lens: lang === 'fr'
        ? 'les ajouts de revenus (nouveaux retainers + one-time) cette semaine vs la semaine passée'
        : 'revenue additions (new retainers + one-time) this week vs last week',
    },
  };
  const ax = axisDescriptions[anomaly.axis] || axisDescriptions.outreach;

  const system = `${agentPrompt}

ANOMALY CONTEXT (internal — you open the session by speaking to this directly):
{name}'s numbers on ${ax.lens}:
  Previous week: ${anomaly.previous} ${ax.unit}
  This week:     ${anomaly.current} ${ax.unit}
  Drop:          -${dropPctRounded}%

TASK: Open the session with a 2-3 sentence message that:
  1. States the numbers FIRST — concretely. No wind-up.
  2. ONE observation about what the drop means (not a lecture).
  3. ONE concrete move to take today. Not next week. Today.

HARD RULES (non-negotiable — violations make it feel fake):

NEVER write any of these:
  - "Attention" / "Watch out" / "Alerte" / "Warning"
  - "Je remarque" / "J'observe" / "I notice"
  - "Inquiétant" / "Worrying" / "Concerning" / "Problème"
  - "Ne t'inquiète pas" / "Don't worry"
  - "Tout n'est pas perdu" / "It's not the end"
  - Long preamble before the numbers — START with the numbers
  - "Je voulais te parler de ça" / "I wanted to talk about"
  - Questions that feel like interrogation ("Pourquoi t'as pas...")
  - Pep talk / motivational closing

DO write:
  - Direct sentence starting with the raw numbers (ex: "${lang === 'fr' ? '2 prospects contactés cette semaine vs 11 la semaine passée.' : '2 prospects contacted this week vs 11 last week.'}")
  - Your natural voice (tone of ${anomaly.agent}) — colleague who saw the numbers and decided to say something
  - ONE concrete action — specific, executable today (ex: "${lang === 'fr' ? 'Bloque 90 min demain matin pour 10 dials.' : 'Block 90 min tomorrow morning for 10 dials.'}")
  - 2-3 sentences MAX. Under 55 words.

Language: ${lang === 'fr' ? 'FRANÇAIS québécois, tutoiement' : 'ENGLISH, "you"'}.

Output ONLY the message text. No quotes, no JSON, no label.`;

  try {
    const text = await callClaude(
      system,
      [{ role: 'user', content: 'Open the session with this anomaly.' }],
      300, false, null, false, false, anomaly.agent, 'claude-sonnet-4-5'
    );
    const cleaned = String(text || '').trim().replace(/^["']|["']$/g, '');
    if (!cleaned || cleaned.length < 20) return null;

    // Guardrail: reject alarmist or procedural phrasings that slipped through
    const banned = [
      /\battention\b/i, /\balerte\b/i, /\bwarning\b/i, /\bwatch out\b/i,
      /\bje remarque\b/i, /\bj[''']observe\b/i, /\bi notice\b/i,
      /\binqui[èe]tant\b/i, /\bconcerning\b/i, /\bworrying\b/i,
      /\bne t[''']inqui[èe]te pas\b/i, /\bdon[''']t worry\b/i,
      /\btout n[''']est pas perdu\b/i,
      /\bje voulais te parler\b/i, /\bi wanted to talk\b/i,
    ];
    for (const re of banned) {
      if (re.test(cleaned)) {
        console.warn('[generateAnomalyAlert] rejected — banned phrase:', re);
        return null;
      }
    }
    return cleaned;
  } catch (err) {
    console.warn('[generateAnomalyAlert] failed:', err.message);
    return null;
  }
}

// ─── Layer 2: Le Fil Rouge ──────────────────────────────────────────────────
// Generate a single natural sentence that bridges last session → this one.
// Replaces the robotic "structured briefing" with a human-sounding opener
// in the voice of whichever agent owns the unresolved topic.
export async function generateFilRouge({ lastSession = null, memories = [], lang = 'fr' } = {}) {
  if (!lastSession && (!memories || memories.length === 0)) return null;

  const lastBlock = lastSession
    ? [
        lastSession.consensus            ? `  consensus: ${lastSession.consensus}` : null,
        lastSession.summary?.consensusAction ? `  action: ${lastSession.summary.consensusAction}` : null,
        lastSession.summary?.keyDecisions?.length
          ? `  key decisions: ${lastSession.summary.keyDecisions.slice(0, 3).map((d) => typeof d === 'string' ? d : d.decision).join(' | ')}`
          : null,
      ].filter(Boolean).join('\n') || '  (none)'
    : '  (none)';

  const memoryBlock = memories.length > 0
    ? memories.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n')
    : '  (none)';

  const system = `You write the FIL ROUGE — a single natural sentence that picks up where the last session left off. Think: a senior colleague walking in and leaning against the doorframe, saying ONE thing that reopens the thread. Reply STRICT JSON only.

Last session context:
${lastBlock}

Recent memories:
${memoryBlock}

Schema:
{
  "agent":   "HORMOZI" | "CARDONE" | "ROBBINS" | "GARYV" | "NAVAL" | "VOSS" | "COORDINATOR",
  "content": string,    // ONE sentence, ≤ 140 chars, conversational. See examples.
  "confidence": number  // 0..1 — how grounded this is in sources
}

EXAMPLES OF GOOD fil rouge (tone target):
- "La dernière fois t'étais bloqué sur le pricing de Dubé. T'as dormi là-dessus ?"
- "Toujours pas rappelé Marco ? Just checking."
- "Tu voulais envoyer la proposition à Salon Éclat hier. Ça a bougé ?"
- "Le bug Make.com — t'as trouvé d'où ça venait ?"
- "Still sitting on the Dubé quote? Any movement?"

EXAMPLES OF BAD fil rouge (DO NOT produce these):
- "Résumé de la dernière session : ..." (robotic)
- "Je voulais te faire un point sur..." (procedural)
- "Depuis notre dernière conversation..." (mechanical)
- Long paragraphs (ONE sentence only)
- Motivational pep talks ("Prêt à repartir fort ?")

HARD RULES:
- Language: ${lang === 'fr' ? 'FRANÇAIS québécois, tutoiement' : 'ENGLISH, "you"'}.
- ONE sentence. ≤ 140 chars.
- Pick the agent whose domain owns the last unresolved thing:
  · pricing / offer / money → HORMOZI
  · sales / prospect / close → CARDONE
  · mindset / block / energy → ROBBINS
  · content / brand → GARYV
  · system / leverage / scaling → NAVAL
  · negotiation / objection / difficult conversation → VOSS
  · ambiguous / general → COORDINATOR
- The sentence must reference a SPECIFIC thing (name, number, decision, deadline) from the sources. Never invent.
- No "bonne journée", no "en passant", no pep talk.
- confidence < 0.5 → caller drops.
- Output ONLY the JSON.`;

  try {
    const text = await callClaude(system, [{ role: 'user', content: 'Write the fil rouge.' }], 240, false, null, false, false, 'COORDINATOR', 'claude-sonnet-4-5');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const VALID_AGENTS = new Set(['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS', 'COORDINATOR']);
    if (!VALID_AGENTS.has(parsed.agent)) return null;
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.5) return null;
    const content = String(parsed.content || '').trim().replace(/^["']|["']$/g, '');
    if (!content || content.length < 10 || content.length > 200) return null;
    // Reject banned phrasings
    const banned = [
      /\brésumé\b/i, /\brecap\b/i, /\bsummary\b/i,
      /\bdepuis notre\b/i, /\bsince our last\b/i,
      /\bpoint sur\b/i, /\bfaire un point\b/i,
      /\bbonne journée\b/i, /\bprêt à\b/i, /\bready to\b/i,
    ];
    for (const re of banned) {
      if (re.test(content)) {
        console.warn('[generateFilRouge] rejected — banned phrase:', re);
        return null;
      }
    }
    return { agent: parsed.agent, content };
  } catch (err) {
    console.warn('[generateFilRouge] failed:', err.message);
    return null;
  }
}

// ─── Layer 1 + 3: Interjection analyzer ─────────────────────────────────────
// After the lead agent responds, decide if a non-lead agent should inject a
// single observation. Unifies two triggers:
//   · Layer 1 (observer): user message signals something the lead missed
//   · Layer 3 (silent pressure): a critical topic has been silent too long
// Returns null OR { agent, content, trigger } — NEVER more than one.
export async function analyzeInterjection({
  leadAgent,
  userMessage,
  leadResponse,
  staleTopics = [],
  lang = 'fr',
} = {}) {
  if (!leadAgent || !userMessage) return null;

  const staleBlock = staleTopics.length > 0
    ? staleTopics.slice(0, 4).map((s) => `  - ${s.topic} (owner: ${s.agent}) — ${s.daysSilent ?? 'jamais'}j sans mention, seuil ${s.thresholdDays}j`).join('\n')
    : '  (none)';

  const system = `You decide if a NON-LEAD agent should slip a brief observation into the conversation AFTER the lead agent responded. Reply STRICT JSON only.

Lead agent: ${leadAgent}
User's message:
"""
${String(userMessage).slice(0, 800)}
"""
Lead agent's response:
"""
${String(leadResponse).slice(0, 800)}
"""
Stale topics (not mentioned in a while — Layer 3 trigger):
${staleBlock}

Two triggers can cause an interjection:

  LAYER 1 — OBSERVER:
    User's message contains a signal the lead agent missed. Examples:
    · emotional hesitation, self-doubt, contradiction → ROBBINS
    · unnamed opportunity in what the user said → HORMOZI or CARDONE
    · pricing friction, cost framing → HORMOZI
    · a negotiation moment slipping by → VOSS
    · a scale/system concern being downplayed → NAVAL
    · brand / content angle → GARYV

  LAYER 3 — SILENT PRESSURE:
    A topic above hasn't been mentioned in long enough that its owner agent
    should slip it in naturally — but ONLY if the current conversation has
    a natural lateral bridge. Don't force it.

Schema:
{
  "shouldInterject": boolean,
  "agent":           string,  // HORMOZI | CARDONE | ROBBINS | GARYV | NAVAL | VOSS (NEVER the lead)
  "content":         string,  // ≤ 150 chars, 1-3 sentences max. Must be NOVEL — NOT what lead said.
  "trigger":         "observer" | "silent_pressure",
  "confidence":      number
}

HARD RULES (violations → shouldInterject=false):
- agent MUST be different from leadAgent (${leadAgent}).
- agent MUST stay in their domain. ROBBINS never prices. HORMOZI never does mindset.
- content must ADD something the lead missed — NEVER rephrase the lead.
- NEVER two interjections in a row (assume this is one pass — the next turn decides fresh).
- confidence ≥ 0.70 for observer, ≥ 0.65 for silent_pressure. Below → false.
- NEVER use: "Je remarque", "J'observe", "Depuis X jours", "En passant", "Petit point", "Je te glisse", "J'ajoute juste", "I'd just add", "By the way", "Real quick".
- Opening with a question is OK. Opening with "Si je peux..." is NOT.
- Language of content: ${lang === 'fr' ? 'FRANÇAIS québécois, tutoiement' : 'ENGLISH, "you"'}.
- If unsure → shouldInterject=false. Silence is always acceptable.
- Output ONLY the JSON.`;

  try {
    const text = await callClaude(system, [{ role: 'user', content: 'Should anyone interject?' }], 300, false, null, false, false, 'COORDINATOR', HAIKU_MODEL);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.shouldInterject) return null;

    const VALID_AGENTS = new Set(['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS']);
    if (!VALID_AGENTS.has(parsed.agent)) return null;
    if (parsed.agent === leadAgent) return null; // never the same agent

    const minConf = parsed.trigger === 'observer' ? 0.70 : 0.65;
    if (typeof parsed.confidence !== 'number' || parsed.confidence < minConf) return null;

    const content = String(parsed.content || '').trim().replace(/^["']|["']$/g, '');
    if (!content || content.length < 10 || content.length > 250) return null;

    // Banned phrasings — mechanical / lazy / boilerplate
    const banned = [
      /\bje remarque\b/i, /\bj[''']observe\b/i, /\bi notice\b/i,
      /\bdepuis \d+ jours\b/i, /\bsince \d+ days\b/i,
      /\ben passant\b/i, /\bby the way\b/i, /\breal quick\b/i,
      /\bj[''']ajoute juste\b/i, /\bi[''']d just add\b/i, /\bjuste pour\b/i,
      /\bpetit point\b/i, /\bje te glisse\b/i, /\bje me permets\b/i,
      /\bsi je peux me permettre\b/i, /\bsi je peux ajouter\b/i,
    ];
    for (const re of banned) {
      if (re.test(content)) {
        console.warn('[analyzeInterjection] rejected — banned:', re);
        return null;
      }
    }

    return { agent: parsed.agent, content, trigger: parsed.trigger };
  } catch (err) {
    console.warn('[analyzeInterjection] failed:', err.message);
    return null;
  }
}

// ─── Meeting Room pattern detection ─────────────────────────────────────────
// Scans memories + recent sessions + pipeline + retainers for negative
// patterns that warrant a proactive agent intervention. Returns a list of
// candidate patterns with { type, agent, reason, severity, confidence }.
// Caller applies cooldown + phase severity filter.
export async function detectMeetingPatterns({
  sessionCount = 0,
  memories = [],
  recentSessions = [],
  retainers = [],
  prospects = [],
  lang = 'fr',
} = {}) {
  if (sessionCount < 2) return [];  // need SOME history

  const memoryBlock = memories.length > 0
    ? memories.slice(0, 12).map((m, i) => `  [${i + 1}] ${String(m).slice(0, 250)}`).join('\n')
    : '  (none)';

  const sessionBlock = recentSessions.length > 0
    ? recentSessions.slice(0, 5).map((s, i) => {
        const date = s.date ? new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const consensus = s.consensus || s.summary?.consensusAction || '';
        const messageCount = s.messages?.length || 0;
        return `  [${i + 1}] ${date} · ${messageCount} msgs · consensus: ${consensus || '(none)'}`;
      }).join('\n')
    : '  (none)';

  const now = Date.now();
  const retainerBlock = retainers.length > 0
    ? retainers.slice(0, 8).map((r) => {
        const touchedAt = Number(r.lastTouchedAt || r.startedAt || 0);
        const days = touchedAt ? Math.floor((now - touchedAt) / 86400000) : null;
        return `  - ${r.name} ($${r.amount}/mo) — ${days ?? '?'}j sans activité`;
      }).join('\n')
    : '  (none)';

  const hotProspects = (prospects || [])
    .filter((p) => p && ['Chaud', 'Démo', 'Répondu'].includes(p.status))
    .slice(0, 10);
  const prospectBlock = hotProspects.length > 0
    ? hotProspects.map((p) => {
        const last = Number(p.lastContactAt || p.createdAt || 0);
        const days = last ? Math.floor((now - last) / 86400000) : null;
        return `  - ${p.businessName || p.name || 'Prospect'} (${p.status}) — last ${days ?? '?'}j`;
      }).join('\n')
    : '  (none)';

  const system = `You scan {name}'s business context for NEGATIVE PATTERNS that warrant a senior colleague speaking up. Reply STRICT JSON only.

{name}'s context (session ${sessionCount}):

Recent memories:
${memoryBlock}

Last 5 sessions:
${sessionBlock}

Active retainers (sorted by staleness):
${retainerBlock}

Hot prospects (Chaud / Démo / Répondu):
${prospectBlock}

Pattern types you can surface (use these EXACT type IDs):

  "avoidance_prospection"
    Trigger: NO mention of prospecting / outreach / cold calls / new leads across the last 3+ sessions.
    Owner agent: CARDONE

  "repeated_block"
    Trigger: the SAME blocker (pricing doubt, time anxiety, skill gap, etc.) mentioned in 3+ sessions without resolution.
    Owner agent: ROBBINS

  "decision_without_execution"
    Trigger: a consensus action from 2+ sessions ago with NO follow-up mention since.
    Owner agent: HORMOZI

  "energy_drop"
    Trigger: words like "fatigué / épuisé / saturé / overwhelmed / stuck" in 2+ recent sessions.
    Owner agent: ROBBINS

  "ignored_opportunity"
    Trigger: a prospect in status Chaud/Démo/Répondu with last contact > 14 days.
    Owner agent: CARDONE

  "stale_retainer"
    Trigger: an existing retainer with no activity > 30 days — churn risk.
    Owner agent: VOSS

  "silence_on_long_term"
    Trigger: no mention of long-term vision, scaling, or leverage in 10+ sessions.
    Owner agent: NAVAL

  "content_stall"
    Trigger: no mention of content, brand, social output in 5+ sessions.
    Owner agent: GARYV

Schema:
{
  "patterns": [
    {
      "type":       string (one of the type IDs above),
      "agent":      string (HORMOZI | CARDONE | ROBBINS | GARYV | NAVAL | VOSS),
      "reason":     string (≤ 140 chars — the factual evidence, not a lecture),
      "severity":   "low" | "medium" | "high",
      "confidence": number (0 to 1)
    }
  ]
}

Severity guide:
- "high"   = actively losing something right now (stale hot prospect, stale retainer, repeated block shutting {name} down)
- "medium" = concerning drift (avoidance, energy drop)
- "low"    = mild background observation (long-term silence on non-urgent topic)

HARD RULES:
- Only surface REAL patterns grounded in the sources above. NEVER invent.
- If nothing meaningful, return { "patterns": [] }.
- confidence < 0.7 → skip that pattern.
- Maximum 3 patterns total (pick the most critical).
- Reason should cite specific evidence (name, number, time span) — never vague.
- Language of reason field: ${lang === 'fr' ? 'FRANÇAIS' : 'ENGLISH'}.
- Output ONLY the JSON.`;

  try {
    const text = await callClaude(system, [{ role: 'user', content: 'Scan for patterns.' }], 600, false, null, false, false, 'COORDINATOR', HAIKU_MODEL);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.patterns)) return [];

    const VALID_TYPES  = new Set(['avoidance_prospection', 'repeated_block', 'decision_without_execution', 'energy_drop', 'ignored_opportunity', 'stale_retainer', 'silence_on_long_term', 'content_stall']);
    const VALID_AGENTS = new Set(['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS']);
    const VALID_SEV    = new Set(['low', 'medium', 'high']);

    return parsed.patterns
      .filter((p) => p && VALID_TYPES.has(p.type) && VALID_AGENTS.has(p.agent))
      .filter((p) => VALID_SEV.has(p.severity))
      .filter((p) => typeof p.confidence === 'number' && p.confidence >= 0.7)
      .map((p) => ({
        type:       p.type,
        agent:      p.agent,
        reason:     String(p.reason || '').slice(0, 200),
        severity:   p.severity,
        confidence: p.confidence,
      }))
      .slice(0, 3);
  } catch (err) {
    console.warn('[detectMeetingPatterns] failed:', err.message);
    return [];
  }
}

// ─── Meeting Room proactive opening — the agent speaks first ────────────────
// Generates a natural, colleague-style opening in the voice of the agent who
// noticed the pattern. The MUST-NOT list is long because the risk is this
// feeling mechanical — any hint of "pattern detected" kills the magic.
export async function generateAgentOpening({ agent, pattern, maturity, lang = 'fr' } = {}) {
  if (!agent || !pattern) return null;

  const agentPrompt = AGENT_PROMPTS[agent];
  if (!agentPrompt) return null;

  const system = `${agentPrompt}

MEETING ROOM CONTEXT:
You're opening a new session with {name}. You haven't been asked — you're choosing to speak first because something you've been watching has crossed a line. Think of yourself as a senior colleague who walks into the office, sees {name} at his desk, and decides it's time to say what's been on your mind. No one appointed you the "pattern detector". You just know this guy well enough to notice.

What you've been watching (internal note — NEVER mention this directly):
  Pattern: ${pattern.type}
  Evidence: ${pattern.reason}
  Severity: ${pattern.severity}

Maturity context: ${maturity?.phase || 'reactive'} — ${maturity?.behaviorSuffix ? maturity.behaviorSuffix.split('\n')[1] : ''}

HARD RULES for this opening (non-negotiable — failures make it feel robotic):

NEVER write any of these:
  - "Je remarque que..." / "J'observe que..." / "I notice..."
  - "Pattern détecté" / "Signal observé" / "It looks like..."
  - "Depuis X jours..." stated as a mechanical count ("3 semaines sans prospection")
  - "Je voulais te parler de..." / "On doit parler de..."
  - Any sentence structure that reads like a system report
  - Any invocation of "tu n'as pas..." as an accusation
  - Opening with a question (you came in with a POINT, not a check-in)

DO write like:
  - A colleague leaning on the doorframe who saw the calendar blank and says what he'd say
  - Direct, concrete, your natural voice (tone of ${agent})
  - ONE concrete angle — not a list, not a recap
  - 2-4 sentences max. Under 60 words.
  - End with an invitation to engage, but lateral — not "what do you want to do?" (weak)

Language: ${lang === 'fr' ? 'FRANÇAIS québécois naturel, tutoiement' : 'ENGLISH, addressed as "you"'}.

Output ONLY the message text. No quotes, no header, no JSON.`;

  try {
    const text = await callClaude(system, [{ role: 'user', content: 'Open the session.' }], 350, false, null, false, false, agent, 'claude-sonnet-4-5');
    const cleaned = String(text || '').trim().replace(/^["']|["']$/g, '');
    if (!cleaned || cleaned.length < 20) return null;
    // Guardrail: if the opening slipped in a banned phrase, reject it
    const banned = [
      /\bje remarque\b/i, /\bj[''']observe\b/i, /\bi notice\b/i,
      /pattern d[ée]tect/i, /signal observ/i,
      /\bit looks like\b/i, /\bon dirait que\b/i,
    ];
    for (const re of banned) {
      if (re.test(cleaned)) {
        console.warn('[generateAgentOpening] rejected — banned phrase detected:', re);
        return null;
      }
    }
    return cleaned;
  } catch (err) {
    console.warn('[generateAgentOpening] failed:', err.message);
    return null;
  }
}

// ─── Memory pre-classifier — strict re-validation step ──────────────────────
// Takes raw Mem0 entries and forces each one through {name}'s categorization
// rules (win / blocker / nextMove). Ambiguous → nextMove by default.
// Returns an object with 3 buckets the briefing/recap can then cherry-pick from.
//
// This is the "revalider avant affichage" step — never trust the source's
// implicit categorization; always re-run every memory through these rules.
export async function classifyMemories(memories = [], lang = 'fr') {
  if (!Array.isArray(memories) || memories.length === 0) {
    return { wins: [], blockers: [], nextMoves: [] };
  }

  // Compact numbered list — the model returns the same indices with a label
  const list = memories.slice(0, 20).map((m, i) => `  [${i}] ${String(m).slice(0, 300)}`).join('\n');

  const system = `You classify each memory below into EXACTLY ONE category. Reply STRICT JSON only.

STRICT RULES (non-negotiable):

  WIN = something ACCOMPLISHED / COMPLETED.
    Examples: "A signé Dubé à 500$/mo" · "A buildé le Workflow Builder" · "A lancé le site"
    NOT a win: plans, in-progress work, documents being written, aspirational thoughts.

  BLOCKER = ACTIVE obstacle currently preventing forward motion.
    Examples: "Pas encore de client" · "Bug Make.com non résolu" · "Hésitation sur pricing"
    NOT a blocker: past problems already solved, generic worries, future hypotheticals.

  NEXT_MOVE = CONCRETE action to take, INCLUDING in-progress work.
    Examples: "Appeler Marco vendredi" · "Finaliser proposition" · "Envoyer devis Salon Éclat"
    "Documents de vente en cours" → NEXT_MOVE (in-progress work = action still owed).
    "Plan stratégique à rédiger" → NEXT_MOVE.
    DEFAULT FALLBACK: if a memory is ambiguous or doesn't clearly match WIN or BLOCKER, classify as NEXT_MOVE.

Input memories (numbered):
${list}

Schema:
{
  "classifications": [
    { "i": number, "c": "WIN" | "BLOCKER" | "NEXT_MOVE" }
  ]
}

- Classify EVERY memory. No skipping.
- When in doubt → NEXT_MOVE.
- Output ONLY the JSON. No prose.`;

  try {
    const text = await callClaude(
      system,
      [{ role: 'user', content: 'Classify each memory.' }],
      600, false, null, false, false, 'COORDINATOR', HAIKU_MODEL
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { wins: [], blockers: [], nextMoves: memories };  // fallback: all → nextMove
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.classifications)) {
      return { wins: [], blockers: [], nextMoves: memories };
    }

    const wins = [], blockers = [], nextMoves = [];
    for (const row of parsed.classifications) {
      const idx = Number(row.i);
      const mem = memories[idx];
      if (!mem || typeof idx !== 'number') continue;
      const cat = String(row.c || '').toUpperCase();
      if      (cat === 'WIN')       wins.push(mem);
      else if (cat === 'BLOCKER')   blockers.push(mem);
      else                          nextMoves.push(mem); // NEXT_MOVE or anything ambiguous
    }

    // Ensure every input memory landed somewhere (default → nextMove)
    const allCategorized = new Set([...wins, ...blockers, ...nextMoves]);
    for (const m of memories) {
      if (!allCategorized.has(m)) nextMoves.push(m);
    }

    console.log('[classifyMemories]', wins.length, 'wins ·', blockers.length, 'blockers ·', nextMoves.length, 'nextMoves');
    return { wins, blockers, nextMoves };
  } catch (err) {
    console.warn('[classifyMemories] failed:', err.message, '— defaulting all to nextMoves');
    return { wins: [], blockers: [], nextMoves: memories };
  }
}

// ─── Memory recap (session-start welcome) ────────────────────────────────────
// Compress raw Mem0 entries + last local session summary into a 3-point recap.
// Returns null when there's nothing meaningful to show.
export async function generateMemoryRecap({ memories = [], lastSession = null }, lang = 'fr') {
  if ((!memories || memories.length === 0) && !lastSession) return null;

  // ── Step 1: Pre-classify every memory before display ({name}'s rules) ──
  const { wins, blockers, nextMoves } = memories.length > 0
    ? await classifyMemories(memories, lang)
    : { wins: [], blockers: [], nextMoves: [] };

  const winsBlock     = wins.length     > 0 ? wins.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n')     : '  (none)';
  const blockersBlock = blockers.length > 0 ? blockers.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n') : '  (none)';
  const nextMovesBlk  = nextMoves.length > 0 ? nextMoves.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n') : '  (none)';

  const lastBlock = lastSession
    ? [
        lastSession.consensus            ? `  consensus: ${lastSession.consensus}`         : null,
        lastSession.summary?.consensusAction ? `  action: ${lastSession.summary.consensusAction}` : null,
        lastSession.summary?.keyDecisions?.length
          ? `  decisions: ${lastSession.summary.keyDecisions.slice(0, 3).map((d) => typeof d === 'string' ? d : d.decision).join(' | ')}`
          : null,
      ].filter(Boolean).join('\n')
    : '  (none)';

  const system = `You generate an ULTRA-SHORT session-start recap for {name}. He runs NT Solutions (AI agency, Quebec) + PC Glow Up. Reply with STRICT JSON only.

Memories have ALREADY been classified by {name}'s strict rules. Pick ONE item per category (or leave empty). Do NOT re-classify. Do NOT move items between categories.

VICTOIRES (completed accomplishments — use for lastWin):
${winsBlock}

BLOCAGES (active obstacles — use for lastBlocker):
${blockersBlock}

PROCHAINS MOVES (concrete actions / in-progress work — use for nextMove):
${nextMovesBlk}

Last session (local):
${lastBlock}

Schema:
{
  "welcomeLine": string,   // 1 line, ≤ 60 chars. Warm, dry, never syrupy.
  "lastWin":     string,   // ≤ 80 chars. Pick the BEST item from VICTOIRES above, reformulated. Empty if VICTOIRES is "(none)" or weak.
  "lastBlocker": string,   // ≤ 80 chars. Pick the BEST item from BLOCAGES above. Empty if BLOCAGES is "(none)" or weak.
  "nextMove":    string,   // ≤ 80 chars. Pick the BEST item from PROCHAINS MOVES above. Empty if weak.
  "confidence":  number    // 0 to 1
}

FILTER FOR RELEVANCE (max 3 populated fields, empty is OK):
- Pick the MOST recent / most actionable item in each bucket.
- An empty field is BETTER than a weak field. Don't pad.
- If a bucket has "(none)" → leave that field empty.

HARD RULES:
- Language: ${lang === 'fr' ? 'FRANÇAIS' : 'ENGLISH'}
- Max 80 chars per point. NEVER exceed.
- Real names, numbers, dates verbatim. Never invent.
- Never reference "Mem0" or "memory system".
- NEVER move a memory between categories — they were pre-validated.
- confidence < 0.5 → caller drops.
- Output ONLY the JSON.`;

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
    const welcomeLine = String(parsed.welcomeLine || '').slice(0, 80).trim();
    const lastWin     = String(parsed.lastWin || '').slice(0, 80).trim();
    const lastBlocker = String(parsed.lastBlocker || '').slice(0, 80).trim();
    const nextMove    = String(parsed.nextMove || '').slice(0, 80).trim();

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

  const system = `You classify a business email's URGENCY for {name} (NT Solutions agency in Quebec). Reply with STRICT JSON only — no prose.

Schema:
{
  "isUrgent":   boolean,          // true only if action is expected from {name} within 24-48h
  "category":   "prospect_reply" | "client_issue" | "invoice" | "opportunity" | "other",
  "oneLine":    string,            // ≤ 90 chars, ${lang === 'fr' ? 'EN FRANÇAIS' : 'IN ENGLISH'}, concise action-oriented summary (e.g. "Dubé Auto demande un devis pour lundi")
  "confidence": number             // 0 to 1
}

Urgency rules:
- isUrgent=true for: prospect asking a question requiring a reply, client reporting a problem/bug, invoice needing payment, time-sensitive opportunity, meeting request with a date
- isUrgent=false for: FYI updates, "received" confirmations, long-term marketing conversations with no specific ask, general business inbound without deadline
- A prospect simply saying "thanks for the info, we'll circle back" → NOT urgent
- A client saying "we need this fixed by Friday" → URGENT
- "oneLine" must extract the actual ASK, not rephrase the subject. What does {name} need to do?

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

// ─── Workflow Builder (Make.com package generation) ─────────────────────────
// Given user answers + a template skeleton, produce 3 deliverables:
//   1. Filled Make.com JSON (placeholders replaced — structure untouched)
//   2. Install guide (markdown, step by step)
//   3. Sales script (NT Solutions tone, with suggested pricing)
// Runs the 3 LLM calls in parallel via Promise.all.
export async function generateWorkflowPackage({ answers, template, pricing, lang = 'fr' }) {
  if (!answers || !template) return null;

  const skeletonStr = JSON.stringify(template.makeJsonSkeleton, null, 2);
  const answersStr  = JSON.stringify(answers, null, 2);
  const toolsList   = Array.isArray(answers.tools) ? answers.tools.join(', ') : (answers.tools || 'Aucun');

  // ── 1) Fill the Make.com JSON ───────────────────────────────────────────
  // Haiku is enough — it's a mechanical fill-the-blanks task. We only ask for
  // placeholder replacement; the LLM is forbidden from altering module types
  // / versions / flow order.
  const jsonSystem = `CONTEXT FRAME (unbreakable — do not deviate):
{name} runs NT Solutions, an AI automation agency. He is BUILDING this workflow FOR HIS CLIENT — he is NOT the end user. Every template value you fill (emails, prompts, SMS, invoice descriptions, etc.) must speak as if it belongs to the CLIENT's business, using the CLIENT's name, tone, and audience. Never write copy that assumes {name} is the operator or the customer.

TASK: fill {{PLACEHOLDERS}} in a Make.com scenario skeleton.

STRICT RULES:
- Do NOT change any "module", "version", "id" or structure — only replace {{PLACEHOLDERS}} and inject reasonable strings into parameters.
- Never remove or add modules.
- For placeholders like {{CLIENT_NAME}} use the client's business name directly (from answers.clientName).
- For {{SYSTEM_PROMPT}} / {{SYSTEM_EMAIL_X}} / {{WELCOME_EMAIL_BODY}} / {{SMS_CALLBACK_TEMPLATE}} / {{INVOICE_DESCRIPTION}} / {{SUBJECT_X}} write concrete French-Canadian (or English if lang=en) copy that the CLIENT'S business would actually send — the client's voice, talking to the client's own audience. Keep strings under 600 chars.
- For placeholders that look like IDs (GBP_LOCATION_ID, SHEET_ID, NOTION_DB_ID, TWILIO_PHONE, APPROVAL_EMAIL, NOTIFY_EMAIL) leave them as the literal placeholder with REPLACE_ME_ prefix so {name} knows to configure them with the client's real values during setup. Example: "REPLACE_ME_GBP_LOCATION_ID".
- Double-curly Make.com references like {{\`{{1.name}}\`}} MUST stay intact — those are Make's variable refs, not placeholders.
- Return ONLY the raw JSON — no prose, no markdown, no \`\`\` fences.

User answers (describe THE CLIENT, not {name}):
${answersStr}

Skeleton to fill:
${skeletonStr}`;

  const jsonPromise = callClaude(
    jsonSystem,
    [{ role: 'user', content: 'Fill the skeleton and return the JSON.' }],
    2500, false, null, false, false, 'COORDINATOR',
    HAIKU_MODEL
  ).then((text) => {
    // Strip code fences if Haiku added any
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace  = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return null;
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice); } catch (e) {
      console.warn('[Workflow] JSON parse failed:', e.message);
      return null;
    }
  }).catch((e) => { console.warn('[Workflow] JSON gen error:', e.message); return null; });

  // ── 2) Install guide (markdown) ─────────────────────────────────────────
  const guideSystem = `CONTEXT FRAME (unbreakable — do not deviate):
You are writing an installation guide that {name} (NT Solutions consultant) will follow himself to implement this workflow FOR HIS CLIENT "${answers.clientName}". The guide speaks TO {name} the consultant. It references the CLIENT's tools/accounts, not {name}'s. {name} is the operator doing the delivery.

TASK: crystal-clear installation guide for the Make.com scenario.

Output: MARKDOWN only. Language: ${lang === 'fr' ? 'FRANÇAIS (québécois simple, direct — tutoiement de {name})' : 'ENGLISH (US, direct, plain)'}.

Structure (use these exact H2 headings):
# Guide d'installation — ${template.name} (pour ${answers.clientName})

## Ce que ce workflow fait pour ton client (1 paragraphe, max 3 phrases)
## Ce dont tu as besoin avant de commencer (liste)
  Inclus : accès au Make.com (le tien ou celui du client, précise quelle option est recommandée), les credentials des outils du client (ex: accès Google Business Profile de ton client, Sheet ID, etc.).
## Installation étape par étape (numérotée)
  Chaque étape mentionne explicitement :
  - l'app/outil concerné (Make.com, Stripe, Twilio, Google Business, etc.)
  - ce que TOI tu dois copier/coller ou configurer
  - où récupérer auprès du client les IDs à remplacer (location_id, sheet_id, numéro Twilio, adresse d'approbation, etc.)
## Premier test (comment valider avec ton client)
## Problèmes courants (2-3 troubleshooting tips)

Contexte :
Client: ${answers.clientName}
Industrie du client: ${answers.industry}
Outils déjà utilisés par le client: ${toolsList}
Volume chez le client: ${answers.volume}

Keep it under 900 words. Be concrete, specific to the template. Everywhere you might be tempted to write "tu" referring to the end user, remember "tu" = {name} the consultant. The client is "ton client" / "le client".`;

  const guidePromise = callClaude(
    guideSystem,
    [{ role: 'user', content: 'Write the install guide.' }],
    1800, false, null, false, false, 'COORDINATOR',
    'claude-sonnet-4-5'
  ).catch((e) => { console.warn('[Workflow] guide error:', e.message); return null; });

  // ── 3) Sales script NT Solutions ────────────────────────────────────────
  const pricingSummary = pricing
    ? `Suggested tier: ${pricing.tier}. Setup: $${pricing.setupMin}-${pricing.setupMax}. Retainer: $${pricing.retainerMin}-${pricing.retainerMax}/mo. Complexity score: ${pricing.score}/15 (industry mult ${pricing.industryMultiplier}).`
    : 'Pricing not computed.';

  const scriptSystem = `CONTEXT FRAME (unbreakable — do not deviate):
{name} (consultant NT Solutions, Québec) va utiliser ce script POUR PITCHER ce workflow à "${answers.clientName}" (un prospect / client externe). {name} = le consultant qui vend. "${answers.clientName}" = le client qui achète. Tout le script parle AU CLIENT, dans la voix de {name} qui s'adresse au client. Le "tu" du script = le client (pas {name}).

TASK: Script de vente court et direct que {name} lit/adapte au téléphone ou en meeting.

Language: ${lang === 'fr' ? 'FRANÇAIS québécois direct' : 'ENGLISH direct'}.
Tone: {name}'s voice — direct, concret, orienté ROI. Pas de bullshit marketing. Tutoiement du client. Chiffré.

Structure (markdown) :
# Script de vente — ${answers.clientName}

## Hook (2-3 phrases que {name} dit AU client)
Accroche spécifique à l'industrie du client (${answers.industry}). {name} nomme le problème concret que le client vit au quotidien et que ce workflow résout.

## Démo en une phrase ({name} parle au client)
"Concrètement [nom du client], ça fait X pour que TU (le client) gagnes Y par semaine."

## Pricing proposé ({name} annonce le prix au client)
Tier ${pricing?.tier || 'Pro'} — chiffres exacts :
- **Setup** : $${pricing?.setupMin || 1500} - $${pricing?.setupMax || 3000}
- **Retainer mensuel** : $${pricing?.retainerMin || 400} - $${pricing?.retainerMax || 800}/mo

Justifie le prix en 2 phrases chiffrées (ROI client, temps économisé chez le client, etc.).

## Objection prévisible + réponse
Anticipe la résistance #1 du client (ex : "on peut le faire nous-mêmes", "c'est trop cher", "on a pas le temps") et la réponse de {name} en 2 phrases.

## Close
La phrase exacte que {name} dit pour proposer l'étape suivante (appel de 15 min, démo live, proposition écrite, etc.).

Contexte sur le client (pas sur {name}) :
Client: ${answers.clientName}
Industrie du client: ${answers.industry}
Outils actuels du client: ${toolsList}
Volume chez le client: ${answers.volume}
Budget déclaré par le client: ${answers.budget}
Pricing computed: ${pricingSummary}

Keep it under 400 words. {name} utilise ce script EN DIRECT au téléphone avec le client, pas une présentation PowerPoint. Écris comme {name} parlerait au client.`;

  const scriptPromise = callClaude(
    scriptSystem,
    [{ role: 'user', content: 'Write the sales script.' }],
    1200, false, null, false, false, 'CARDONE',
    'claude-sonnet-4-5'
  ).catch((e) => { console.warn('[Workflow] script error:', e.message); return null; });

  // ── 4) Problem summary (what pain this workflow fixes for the client) ──
  const problemSystem = `CONTEXT FRAME (unbreakable): {name} (consultant NT Solutions) is BUILDING this workflow FOR HIS CLIENT "${answers.clientName}". This document speaks ABOUT the client's pain, as if {name} handed a diagnostic report to the client.

TASK: Write a CLIENT PROBLEM SUMMARY — a diagnostic of the pain this workflow solves.

Output: MARKDOWN only. Language: ${lang === 'fr' ? 'FRANÇAIS québécois professionnel direct' : 'ENGLISH direct professional'}.

Structure (strict, no deviation):
# Diagnostic — ${answers.clientName}

## Le problème actuel
2-3 paragraphes concrets. Nomme les frictions quotidiennes typiques d'un ${answers.industry} avec ${answers.volume} unités/mois. Chiffre le temps perdu (estimation réaliste).

## Ce qui se passe si rien ne change
1 paragraphe. Coût cumulatif mensuel en heures + $ équivalent (salaire minimum $15/h × heures).

## Opportunité
1 paragraphe. Ce que ce workflow débloque concrètement. Focus sur TIME + QUALITY + SCALE.

Contexte:
Client: ${answers.clientName}
Industrie: ${answers.industry}
Volume: ${answers.volume}
Outils actuels: ${toolsList}

Keep under 400 words. Zero bullshit marketing. Chiffré, concret, sobre.`;

  const problemPromise = callClaude(
    problemSystem,
    [{ role: 'user', content: 'Write the client problem diagnostic.' }],
    800, false, null, false, false, 'HORMOZI', 'claude-sonnet-4-5'
  ).catch((e) => { console.warn('[Workflow] problem error:', e.message); return null; });

  // ── 5) Workflow explainer (what it does, in plain language for the client) ──
  const explainerSystem = `CONTEXT FRAME (unbreakable): {name} (consultant NT Solutions) is delivering this workflow TO HIS CLIENT "${answers.clientName}". This section explains what the workflow DOES in plain non-technical language — the client will read this to understand the system they're buying.

TASK: Write a WORKFLOW EXPLAINER.

Output: MARKDOWN only. Language: ${lang === 'fr' ? 'FRANÇAIS québécois simple (zéro jargon tech)' : 'ENGLISH simple (zero tech jargon)'}.

Structure:
# Comment ça fonctionne

## Ce que le système fait (en une phrase)
Une ligne claire. Pas "leverage AI to optimize" — plutôt "quand X arrive, le système fait Y automatiquement."

## Le flux, étape par étape
Numérotée. 4-7 étapes. Chaque étape : quoi se passe + en combien de temps + qui voit quoi (client, ton équipe, le système).

## Ce que le client VOIT au quotidien
2-3 phrases concrètes. Expérience client, pas architecture technique.

## Ce que le client NE voit PAS (et c'est bien)
1 paragraphe. Ce qui tourne en arrière-plan invisible, pour rassurer sur la simplicité.

## Limites connues
2-3 points honnêtes sur ce que le système ne fait PAS (gère l'attente).

Contexte:
Template: ${template.name} — ${template.description}
Client: ${answers.clientName}
Industrie: ${answers.industry}

Keep under 500 words. Zéro jargon (pas de "webhook", "API", "trigger" sauf si vraiment nécessaire et expliqué).`;

  const explainerPromise = callClaude(
    explainerSystem,
    [{ role: 'user', content: 'Write the plain-language workflow explainer.' }],
    1000, false, null, false, false, 'COORDINATOR', 'claude-sonnet-4-5'
  ).catch((e) => { console.warn('[Workflow] explainer error:', e.message); return null; });

  // ── 6) FAQ / Objections (so {name} has reactive answers in his pocket) ──
  const faqSystem = `CONTEXT FRAME (unbreakable): {name} (consultant NT Solutions) pitches ce workflow à "${answers.clientName}". Cette FAQ anticipe les objections que le client va poser et donne à {name} des réponses prêtes.

TASK: Generate 5-6 realistic client objections with direct {name}-voice answers.

Output: MARKDOWN only. Language: ${lang === 'fr' ? 'FRANÇAIS québécois direct (tutoiement du client)' : 'ENGLISH direct (client addressed as "you")'}.

Structure:
# FAQ — Objections anticipées

### Q: [objection typique en 1 phrase courte]
**R:** Réponse de {name}. 2-3 phrases max. Chiffrée si possible. Respectueuse mais ferme. Jamais défensive.

(répète pour 5-6 objections)

Objections obligatoires à couvrir (adapte au template/industrie):
1. "On peut le faire nous-mêmes" OU "On a déjà quelqu'un qui s'en occupe"
2. "C'est trop cher" OU "Budget serré"
3. "C'est trop compliqué à installer" OU "On a pas le temps de gérer ça"
4. "Qu'est-ce qui se passe si ça brise / si tu disparaîtes"
5. "Est-ce que ça marche vraiment avec ${answers.industry} spécifiquement ?"
6. Une objection spécifique à l'outil principal du template (optionnelle)

Contexte:
Client: ${answers.clientName}
Industrie: ${answers.industry}
Outils actuels du client: ${toolsList}
Pricing: ${pricingSummary}

Keep under 500 words. Pas de réponses vagues. Chaque réponse = un contre-argument concret.`;

  const faqPromise = callClaude(
    faqSystem,
    [{ role: 'user', content: 'Write the FAQ/objections.' }],
    1000, false, null, false, false, 'VOSS', 'claude-sonnet-4-5'
  ).catch((e) => { console.warn('[Workflow] FAQ error:', e.message); return null; });

  const [makeJson, guide, script, problemSummary, workflowExplainer, faq] = await Promise.all([
    jsonPromise, guidePromise, scriptPromise,
    problemPromise, explainerPromise, faqPromise,
  ]);

  return {
    makeJson,                // parsed JSON object or null on failure
    guide,                   // markdown string
    script,                  // markdown string
    problemSummary,          // markdown string — client pain diagnostic
    workflowExplainer,       // markdown string — plain-language explainer
    faq,                     // markdown string — objection bank
    pricing,                 // pass-through so UI can display it
    generatedAt: new Date().toISOString(),
  };
}

// ─── Morning briefing (session 7+) ──────────────────────────────────────────
// Aggregates Mem0 memories + Gmail top business + Calendar today + retainers
// staleness + last session consensus into 4 concrete lines. Unlocked only
// when sessionCount >= 7 — earlier, the UI shows a locked teaser instead.
export async function generateMorningBriefing({
  memories = [],
  lastSession = null,
  retainers = [],
  emails = [],
  calendarEvents = [],
  lang = 'fr',
} = {}) {
  // ── Step 1: Pre-classify memories before the briefing sees them ──
  // This guarantees the briefing's nextMoveLine never shows a "win" and
  // vice-versa — every memory is re-validated against {name}'s rules.
  const { wins, blockers, nextMoves } = memories.length > 0
    ? await classifyMemories(memories, lang)
    : { wins: [], blockers: [], nextMoves: [] };

  const winsBlock      = wins.length     > 0 ? wins.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n')      : '  (none)';
  const blockersBlock  = blockers.length > 0 ? blockers.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n')  : '  (none)';
  const nextMovesBlock = nextMoves.length > 0 ? nextMoves.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n') : '  (none)';
  const lastBlock = lastSession
    ? [
        lastSession.consensus            ? `  consensus: ${lastSession.consensus}` : null,
        lastSession.summary?.consensusAction ? `  action: ${lastSession.summary.consensusAction}` : null,
      ].filter(Boolean).join('\n') || '  (none)'
    : '  (none)';
  const emailBlock = Array.isArray(emails) && emails.length > 0
    ? emails.slice(0, 3).map((e, i) => {
        const from = (e.from || '').split('<')[0].trim() || '?';
        const subj = e.subject || '(no subject)';
        const preview = String(e.snippet || e.body || '').replace(/\s+/g, ' ').slice(0, 120);
        return `  ${i + 1}. ${from} — ${subj} — ${preview}`;
      }).join('\n')
    : '  (none)';
  const calBlock = Array.isArray(calendarEvents) && calendarEvents.length > 0
    ? calendarEvents.slice(0, 5).map((e) => {
        const startRaw = e.start?.dateTime || e.start?.date || '';
        const d = startRaw ? new Date(startRaw) : null;
        const when = d && !isNaN(d.getTime())
          ? d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—';
        return `  - ${when}: ${e.summary || '(untitled)'}`;
      }).join('\n')
    : '  (none)';
  // Retainers sorted by "most stale" — lastTouchedAt oldest first
  const staleRetainers = (retainers || [])
    .filter((r) => r && r.name)
    .map((r) => {
      const last = Number(r.lastTouchedAt || r.startedAt || 0);
      const days = last ? Math.floor((Date.now() - last) / 86_400_000) : null;
      return { name: r.name, amount: r.amount || 0, days };
    })
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  const retainerBlock = staleRetainers.length > 0
    ? staleRetainers.slice(0, 5).map((r) => `  - ${r.name} ($${r.amount}/mo) — ${r.days ?? '?'}j sans activité`).join('\n')
    : '  (none)';

  const system = `You generate a MORNING BRIEFING for {name} (NT Solutions consultant, Quebec) at the start of a new session. He's past session 7 — you now know him. Reply with STRICT JSON only.

Sources (use verbatim facts only — NEVER invent):

Memories have ALREADY been classified by {name}'s strict rules. Do NOT re-classify or move items between categories — they were pre-validated.

VICTOIRES (for context only — completed things, NOT for nextMoveLine):
${winsBlock}

BLOCAGES (active obstacles — for context, NOT for nextMoveLine):
${blockersBlock}

PROCHAINS MOVES (concrete actions / in-progress work — THIS is what nextMoveLine draws from):
${nextMovesBlock}

Last session:
${lastBlock}

Unread business emails:
${emailBlock}

Calendar (next events):
${calBlock}

Retainers sorted by staleness:
${retainerBlock}

Schema:
{
  "emailsLine":    string,  // ≤ 100 chars. The ONE email worth acting on THIS MORNING. Empty if inbox clean.
  "calendarLine":  string,  // ≤ 100 chars. Next event + a beat about it. Empty if nothing today/tomorrow.
  "nextMoveLine":  string,  // ≤ 100 chars. Concrete ACTION owed (includes in-progress work). Empty if nothing solid.
  "prospectLine":  string,  // ≤ 100 chars. Retainer/prospect needing a touch most — name + days silent. Empty if none.
  "confidence":    number   // 0 to 1
}

CATEGORIZATION RULES (STRICT — apply before filling fields):

  nextMoveLine = CONCRETE ACTION OWED — pick BEST item from the PROCHAINS MOVES bucket above.
    Examples (OK): "Finaliser docs de vente promises à Marco" · "Envoyer devis à Salon Éclat" · "Appeler Dubé vendredi"
    NOT here: items from VICTOIRES (those are completed), items from BLOCAGES (those are stuck).
    NEVER re-categorize — the buckets above are authoritative.

  emailsLine = SPECIFIC email that needs {name}'s response this morning. Name + ask.
    NOT: promotional, newsletters, generic Gmail chatter.

  calendarLine = Upcoming event with context. Name + when + any prep needed.
    NOT: completed events, personal stuff without prep.

  prospectLine = ONE prospect/retainer who's gone silent and needs outreach.
    Format: "Name — X jours sans activité · context"

FILTER FOR ULTRA-RELEVANCE (MAX 3 populated fields, not 4):
- Pick the 3 MOST actionable items across the 4 slots.
- LEAVE ONE SLOT EMPTY if it would be weaker than the others.
- An empty field >> a filler field.
- Prioritize: time-sensitive (today/tomorrow) > ongoing work > old context.

HARD RULES:
- Language: ${lang === 'fr' ? 'FRANÇAIS' : 'ENGLISH'}
- Each populated line: ULTRA concrete, zero filler, ≤ 100 chars.
- Real names, numbers, dates from sources. NEVER invent.
- NEVER say "continue sur la lancée", "bonne journée", or generic pep talk.
- Never reference "Mem0" or "memory system".
- confidence < 0.5 → caller drops. Ship only quality briefings.
- Output ONLY the JSON.`;

  try {
    console.log('[generateMorningBriefing] sources — memories:', memories.length, 'emails:', emails.length, 'cal:', calendarEvents.length, 'retainers:', retainers.length);
    const text = await callClaude(
      system,
      [{ role: 'user', content: 'Generate the morning briefing.' }],
      500,
      false,
      null, false, false, 'COORDINATOR',
      'claude-sonnet-4-5'
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.5) {
      console.warn('[generateMorningBriefing] dropped — confidence=', parsed.confidence);
      return null;
    }
    let emailsLine   = String(parsed.emailsLine   || '').slice(0, 120).trim();
    let calendarLine = String(parsed.calendarLine || '').slice(0, 120).trim();
    let nextMoveLine = String(parsed.nextMoveLine || '').slice(0, 120).trim();
    let prospectLine = String(parsed.prospectLine || '').slice(0, 120).trim();

    // Enforce the "max 3 populated fields" rule programmatically.
    // If the LLM returned 4, drop the weakest (shortest, least specific).
    const fields = [
      { key: 'emailsLine',   value: emailsLine },
      { key: 'calendarLine', value: calendarLine },
      { key: 'nextMoveLine', value: nextMoveLine },
      { key: 'prospectLine', value: prospectLine },
    ];
    const populated = fields.filter((f) => f.value);
    if (populated.length > 3) {
      // Drop the shortest populated field (proxy for weakest signal)
      const weakest = [...populated].sort((a, b) => a.value.length - b.value.length)[0];
      if (weakest.key === 'emailsLine')   emailsLine   = '';
      if (weakest.key === 'calendarLine') calendarLine = '';
      if (weakest.key === 'nextMoveLine') nextMoveLine = '';
      if (weakest.key === 'prospectLine') prospectLine = '';
      console.log('[generateMorningBriefing] trimmed to 3 — dropped', weakest.key);
    }

    const filledAfter = [emailsLine, calendarLine, nextMoveLine, prospectLine].filter(Boolean).length;
    if (filledAfter < 2) {
      console.warn('[generateMorningBriefing] dropped — only', filledAfter, 'of 4 fields filled after trim');
      return null;
    }
    return { emailsLine, calendarLine, nextMoveLine, prospectLine, confidence: parsed.confidence };
  } catch (err) {
    console.warn('[generateMorningBriefing] failed:', err.message);
    return null;
  }
}

// ─── Monday auto-session opening ────────────────────────────────────────────
// Builds the agent message that "starts the meeting" when {name} opens the app
// Monday morning. The agent is picked by dominant signal in week data + memories.
// Returns { agent, content, rationale, confidence } or null on failure.
export async function generateMondayOpening({
  weekSummary = null,
  memories    = [],
  pulse       = null,
  pipeline    = [],
  retainers   = [],
  lang        = 'fr',
} = {}) {
  // Pre-classify memories so the opening draws on validated buckets.
  const { wins: memWins, blockers: memBlockers, nextMoves: memNextMoves } = memories.length > 0
    ? await classifyMemories(memories, lang)
    : { wins: [], blockers: [], nextMoves: [] };

  const winsBlock      = memWins.length      > 0 ? memWins.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n')      : '  (none)';
  const blockersBlock  = memBlockers.length  > 0 ? memBlockers.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n')  : '  (none)';
  const nextMovesBlock = memNextMoves.length > 0 ? memNextMoves.slice(0, 5).map((m, i) => `  ${i + 1}. ${m}`).join('\n') : '  (none)';

  const weekBlock = weekSummary
    ? [
        `  sessions held: ${weekSummary.sessionsCount}`,
        weekSummary.wins.length > 0
          ? `  wins logged:\n${weekSummary.wins.slice(0, 5).map((w) => `    • ${w.text}`).join('\n')}`
          : '  wins logged: (none)',
        weekSummary.decisions.length > 0
          ? `  decisions made:\n${weekSummary.decisions.slice(0, 5).map((d) => {
              const o = d.outcome ? ` [result: ${d.outcome}${d.outcomeComment ? ' — ' + d.outcomeComment : ''}]` : '';
              return `    • [${d.agent}] ${d.decision}${o}`;
            }).join('\n')}`
          : '  decisions made: (none)',
        weekSummary.blockers.length > 0
          ? `  open blockers:\n${weekSummary.blockers.slice(0, 5).map((b) => `    • ${b.text} [${b.status}]`).join('\n')}`
          : '  open blockers: (none)',
      ].join('\n')
    : '  (no week data)';

  const pulseBlock = pulse
    ? `  pulse score: ${pulse.score}/100 — ${pulse.tier || '?'} · finances=${pulse.breakdown?.financial ?? '?'}, consistency=${pulse.breakdown?.consistency ?? '?'}, state=${pulse.breakdown?.checkIn ?? '?'}`
    : '  pulse: (not computed)';

  const pipelineBlock = Array.isArray(pipeline) && pipeline.length > 0
    ? pipeline.slice(0, 6).map((p) => `  - ${p.name || p.businessName} [${p.stage || '?'}] ${p.value ? '$' + p.value : ''}`).join('\n')
    : '  pipeline: (empty)';

  const staleRetainers = (retainers || [])
    .filter((r) => r && r.name)
    .map((r) => {
      const last = Number(r.lastTouchedAt || r.startedAt || 0);
      const days = last ? Math.floor((Date.now() - last) / 86_400_000) : null;
      return { name: r.name, amount: r.amount || 0, days };
    })
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0))
    .slice(0, 5);
  const retainerBlock = staleRetainers.length > 0
    ? staleRetainers.map((r) => `  - ${r.name} ($${r.amount}/mo) — ${r.days ?? '?'}j sans activité`).join('\n')
    : '  (none)';

  const system = `You write the AGENT'S OPENING MESSAGE for {name}'s Monday morning auto-session. When {name} opens the app, this is the first thing he sees — the meeting has ALREADY started, and an agent is talking first. Reply with STRICT JSON only.

CONTEXT FRAME (unbreakable):
- {name} is the user. He's a solo consultant at NT Solutions (Quebec).
- YOU are choosing which of the 6 agents opens the meeting based on the dominant signal in this week's data.
- Tone: like a peer who's been watching the numbers all weekend and has something specific to say Monday 8am.
- NEVER write pep talk. NEVER be generic. NEVER invent facts — only use what's in the sources below.

AGENTS (pick exactly ONE as "agent"):
- HORMOZI — offers, pricing, revenue, ROI. Pick if: revenue flat, pricing issue, offer weak, deals stalled on money.
- CARDONE — sales, prospecting volume, follow-ups. Pick if: pipeline thin, follow-ups overdue, activity low.
- ROBBINS — mindset, blocks, state. Pick if: emotional blockers dominate, {name} seems stuck in his head.
- GARYV — content, brand, long game. Pick if: no content shipped in past week, visibility low.
- NAVAL — systems, leverage, scalability. Pick if: all signals green or {name} is grinding linearly.
- VOSS — negotiation, objections. Pick if: active deal needs scripting, negotiation point looming.

SOURCES:

Past 7 days (localStorage):
${weekBlock}

Memory-bucketed intel (pre-classified, DO NOT re-categorize):
  wins:
${winsBlock}
  blockers:
${blockersBlock}
  next moves (in-progress work):
${nextMovesBlock}

Pulse:
${pulseBlock}

Pipeline:
${pipelineBlock}

Retainers (most stale first):
${retainerBlock}

TASK:
1. Scan all sources. Identify the ONE dominant signal worth opening Monday on.
2. Pick the agent whose domain matches that signal.
3. Write that agent's opening message — reading to {name} like the agent just walked in and started talking.

Message shape (the "content" field):
  - 3 short sections separated by blank lines:
    (a) **One-line greeting + the thing.** Specific. Name names. No "bonjour".
    (b) **Quick recap** (2-3 bullets) of what happened last week that matters.
    (c) **One concrete first move** — a specific action owed RIGHT NOW. Include prospect/number/date if known.
  - ≤ 180 words total.
  - Write in the agent's voice (HORMOZI=math-dense, CARDONE=urgency, ROBBINS=pattern-naming, GARYV=long-game, NAVAL=leverage-focused, VOSS=tactical-empathy).
  - ${lang === 'fr' ? 'FRANÇAIS' : 'ENGLISH'}.
  - Markdown bold (**) allowed for emphasis.

Schema:
{
  "agent":      "HORMOZI" | "CARDONE" | "ROBBINS" | "GARYV" | "NAVAL" | "VOSS",
  "content":    string,    // full opening message, ≤ 180 words
  "rationale":  string,    // ≤ 100 chars — why this agent + signal, for debug only
  "confidence": number     // 0..1
}

HARD RULES:
- If no strong signal exists (empty week, no blockers, no pipeline), return confidence < 0.5 and the caller drops.
- Use REAL data only — no invented prospects, no fictional numbers.
- Never say "cette semaine va être" or other predictive filler.
- Output ONLY the JSON.`;

  try {
    console.log('[generateMondayOpening] sources — week:', weekSummary?.sessionsCount, 'mems:', memories.length, 'pipe:', pipeline.length, 'ret:', retainers.length);
    const text = await callClaude(
      system,
      [{ role: 'user', content: 'Generate the Monday auto-session opening.' }],
      700,
      false,
      null, false, false, 'COORDINATOR',
      'claude-sonnet-4-5'
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    const validAgents = ['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS'];
    if (!validAgents.includes(parsed.agent)) {
      console.warn('[generateMondayOpening] dropped — invalid agent:', parsed.agent);
      return null;
    }
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.5) {
      console.warn('[generateMondayOpening] dropped — confidence=', parsed.confidence);
      return null;
    }
    const content = String(parsed.content || '').trim();
    if (content.length < 60) {
      console.warn('[generateMondayOpening] dropped — content too short:', content.length);
      return null;
    }
    return {
      agent:      parsed.agent,
      content,
      rationale:  String(parsed.rationale || '').slice(0, 200),
      confidence: parsed.confidence,
    };
  } catch (err) {
    console.warn('[generateMondayOpening] failed:', err.message);
    return null;
  }
}

// ─── Batch follow-up — intent extraction + per-prospect message gen ─────────
// Returns null when the user didn't clearly ask for a batch follow-up.
export async function extractBatchFollowupIntent(userInput, lang = 'fr') {
  if (!userInput) return null;
  const system = `You detect a BATCH FOLLOW-UP intent in a short user message. Reply STRICT JSON only.

Schema:
{
  "isBatchFollowup": boolean,
  "daysThreshold":   number,            // 1..90, default 7
  "statusFilter":    string[],          // prospect statuses to include; empty = default
  "confidence":      number             // 0..1
}

Trigger examples (all → isBatchFollowup=true):
- "relance tous les prospects sans réponse depuis 7 jours"
- "follow up all prospects that haven't replied in 10 days"
- "batch relance sur les ghostés"
- "envoie une relance à tous ceux que j'ai pas contacté depuis 2 semaines"
- "relance les prospects en démo"

NOT a batch intent:
- "réponds à cet email" (single email reply)
- "relance Dubé" (single named prospect)

Valid status values: Contacté, Répondu, Chaud, Démo, Signé, Client actif, Perdu.
Default statusFilter when unspecified: ["Contacté","Répondu","Chaud","Démo"] (exclude closed/lost).

Rules:
- Parse "semaine" = 7d, "2 semaines" = 14d, "mois" = 30d.
- If unclear number, default to 7.
- confidence < 0.6 → caller drops.
- Language user speaks: ${lang === 'fr' ? 'FRENCH' : 'ENGLISH'}.

Output ONLY the JSON.`;
  try {
    const text = await callClaude(system, [{ role: 'user', content: userInput }], 180, false, null, false, false, 'COORDINATOR', HAIKU_MODEL);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.isBatchFollowup) return null;
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.6) return null;
    const days = Math.max(1, Math.min(90, Math.round(Number(parsed.daysThreshold) || 7)));
    const DEFAULT_STATUSES = ['Contacté', 'Répondu', 'Chaud', 'Démo'];
    const VALID = new Set(['Contacté', 'Répondu', 'Chaud', 'Démo', 'Signé', 'Client actif', 'Perdu']);
    let statuses = Array.isArray(parsed.statusFilter)
      ? parsed.statusFilter.filter((s) => VALID.has(s))
      : [];
    if (statuses.length === 0) statuses = DEFAULT_STATUSES;
    return { daysThreshold: days, statusFilter: statuses, confidence: parsed.confidence };
  } catch (err) {
    console.warn('[extractBatchFollowupIntent] failed:', err.message);
    return null;
  }
}

// Generate a personalized follow-up message for ONE prospect.
// Input context is kept small (stale prospect + last note + industry) to keep
// Sonnet tokens low. Returns { subject, body } or null on failure.
export async function generateFollowupMessage(prospect, { daysSinceContact, lang = 'fr' } = {}) {
  if (!prospect) return null;
  const contactName  = prospect.contactName || prospect.name || prospect.businessName || 'Contact';
  const businessName = prospect.businessName || prospect.name || '';
  const industry     = prospect.industry || '';
  const status       = prospect.status || 'Contacté';
  const lastNote     = (prospect.contactHistory?.[0]?.note || prospect.notes || '').slice(0, 300);
  const objections   = Array.isArray(prospect.objections) ? prospect.objections.slice(0, 3).join('; ') : '';

  // Status-adapted tone guidance
  const toneMap = {
    'Contacté': 'Re-engage warmly. Assume the first contact went into the void. Light, low-pressure, curious tone.',
    'Répondu':  'Follow up on their reply. Assume a short pause in the thread. Professional, forward-moving.',
    'Chaud':    'Warm re-engagement. They were interested — reignite specifically on a concrete next step.',
    'Démo':     'Post-demo follow-up. Reference the demo they saw. Direct ask about the next step / decision.',
  };
  const tone = toneMap[status] || toneMap['Contacté'];

  const system = `You write ONE follow-up email from {name} (NT Solutions consultant) to a prospect who has gone silent. Output STRICT JSON only — no prose, no markdown fences.

Schema:
{
  "subject": string,   // ≤ 70 chars, concrete, NOT clickbait
  "body":    string    // 70–140 words, plain text with \\n line breaks. Sign off: "{name}"
}

Context:
Contact: ${contactName}
Business: ${businessName}
Industry: ${industry}
Prospect status: ${status}
Days since last contact: ${daysSinceContact}
Last note: ${lastNote || '(none)'}
Known objections: ${objections || '(none)'}

Tone directive: ${tone}

HARD RULES:
- Language: ${lang === 'fr' ? 'FRANÇAIS québécois naturel (tutoiement)' : 'ENGLISH plain (addressed as "you")'}.
- Never open with "J'espère que tu vas bien" / "I hope this finds you well" — banned.
- Start with a SPECIFIC reference: industry pain point, a signal from lastNote, or a past interaction.
- Give ONE concrete ask (15 min call, reply to a single yes/no question, etc.) — not multiple options.
- Never mention "relance" / "follow up" literally in the body — just BE the follow-up.
- Never fake urgency ("last chance", "limited slots") — {name} doesn't do that.
- Sign off: "{name}" (one line, no title, no signature block).
- Output ONLY JSON.`;

  try {
    const text = await callClaude(system, [{ role: 'user', content: 'Write the follow-up email.' }], 400, false, null, false, false, 'VOSS', 'claude-sonnet-4-5');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const subject = String(parsed.subject || '').slice(0, 120).trim();
    const body    = String(parsed.body    || '').slice(0, 2000).trim();
    if (!subject || !body) return null;
    return { subject, body };
  } catch (err) {
    console.warn('[generateFollowupMessage] failed:', err.message, 'for', contactName);
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

export async function runSession(userInput, conversationHistory, mode, deepMode, agentNames = {}, onProgress, focusAgent = null, calendarContext = null, attachment = null, streamCallbacks = null, thinkingMode = false, conversationState = null, lang = 'fr', maturitySuffix = '') {
  const langInstruction = getLangInstruction(lang);
  const calendarSuffix = calendarContext ? `\n\n${calendarContext}` : '';
  const matSuffix       = maturitySuffix ? `\n\n${maturitySuffix}` : '';
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
  const leadSystem = BASE_CONTEXT + langInstruction + calendarSuffix + dataSuffix + emotionalSuffix + sessionMemorySuffix + matSuffix + '\n\n' + buildAgentPrompt(routing.lead) + modeSuffix + continuationSuffix;
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
      const supportSystem = BASE_CONTEXT + langInstruction + calendarSuffix + dataSuffix + emotionalSuffix + matSuffix + SILENCE_RULE_SUFFIX + '\n\n' + buildAgentPrompt(agentName) + modeSuffix;
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
    frustrated: '\n\nEMOTIONAL CONTEXT: {name} is frustrated right now. Acknowledge it briefly (1 sentence max), then get straight to practical solutions. Skip any pep talk.',
    discouraged: '\n\nEMOTIONAL CONTEXT: {name} is feeling discouraged. Open with genuine recognition of the difficulty, then rebuild momentum with specific, achievable next steps. Be direct and energizing.',
    excited: '\n\nEMOTIONAL CONTEXT: {name} is energized and excited. Match his energy. Amplify the momentum while adding sharp, tactical depth. Cut the caveats.',
    urgent: '\n\nEMOTIONAL CONTEXT: {name} needs this fast — time pressure is real. Lead immediately with the #1 most impactful action. Be ultra-concise.',
    confused: '\n\nEMOTIONAL CONTEXT: {name} is confused or overwhelmed. Simplify everything. Use clear structure (numbered steps or clear categories). Avoid jargon. Make the path obvious.',
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

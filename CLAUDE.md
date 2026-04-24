# THE HEADQUARTERS — CLAUDE.md

> Document de référence projet. Optimisé pour reprise à froid.
> Dernière mise à jour : Phase 1 complète + UI polish done.

---

## VUE D'ENSEMBLE

### Description du projet
The Headquarters est un système de conseil stratégique IA pour entrepreneur solo.
6 agents IA spécialisés (inspirés de frameworks business réels) qui connaissent le business de Samuel en profondeur, collaborent en temps réel, et livrent des décisions actionnables — pas des listes de conseils génériques.

Positionnement : concurrent direct de **Sintra AI** (personas business) et **Manus** (agents autonomes).
Différenciation clé : contexte business réel intégré (finances, pipeline, historique sessions, mémoire longue durée), 10 modes de session, streaming token-by-token, intégrations Gmail + Calendar opérationnelles.

### Objectif business
- App personnelle de Samuel Nicolas (26 ans, Québec)
- Contexte métier : NT Solutions (agence IA), PC Glow Up, jour job Motion Composites
- Objectif revenus NT Solutions : 50 000$/an
- Produits NT Solutions : Le Bouclier 5 Étoiles, Le Répondeur Intelligent, Le Revenant

### Stack technique

| Couche | Tech | Notes |
|--------|------|-------|
| Framework | React 18 + Vite 5 | SPA, **aucun router** |
| Style | Tailwind CSS v3 + CSS custom | `src/index.css` pour animations |
| IA | Anthropic API direct `fetch` | Pas de SDK npm |
| Mémoire LT | Mem0 (`mem0ai@3`) | Via proxy Vite (dev) / serverless (prod) |
| Cloud backup | Supabase (`@supabase/supabase-js@2`) | Fire-and-forget, localStorage = source de vérité |
| Graphiques | Recharts | DashboardScreen |
| PDF | jsPDF | Export réponses agents |
| Fichiers | PapaParse + xlsx | Parse CSV/Excel uploadés |
| Icons | lucide-react | |
| Auth Google | OAuth 2.0 implicit popup | Pas de backend requis |

**Modèles Claude :**
```
claude-sonnet-4-5         → défaut (tous les agents, streaming)
claude-opus-4-5           → Deep Mode (toggle header)
claude-haiku-4-5-20251001 → classification/routing/JSON uniquement
```

**Betas Anthropic actifs (headers) :**
```
prompt-caching-2024-07-31        → toujours actif
web-search-2025-03-05            → si enableWebSearch=true
interleaved-thinking-2025-05-14  → si thinkingMode=true
```

### URLs importantes
```
App locale           → http://localhost:5173
Anthropic API        → https://api.anthropic.com/v1/messages
Mem0 API             → https://api.mem0.ai/v1/memories/
Supabase             → VITE_SUPABASE_URL (dans .env)
Google OAuth         → https://accounts.google.com/o/oauth2/v2/auth
OAuth callback       → window.location.origin + '/auth/gmail/callback'
```

---

## ARCHITECTURE

### Structure des dossiers

```
the-headquarters/
├── src/
│   ├── App.jsx                    ← Racine. Tout l'état global. Navigation. Session lifecycle.
│   ├── api.js                     ← ~1900 lignes. TOUS les appels Anthropic. Ne jamais dupliquer.
│   ├── prompts.js                 ← Prompts agents, AGENT_CONFIG, BASE_CONTEXT, COMMERCIAL_MODE
│   ├── i18n.js                    ← FR/EN — fonction t(key, lang, vars)
│   ├── main.jsx                   ← Entry point React
│   ├── index.css                  ← Tailwind + animations keyframes + design tokens
│   │
│   ├── components/
│   │   ├── Header.jsx             ← Nav, toggles dark/deep/think/lang, end session
│   │   ├── HomeScreen.jsx         ← Accueil, mode picker, agent cards, stats
│   │   ├── ChatScreen.jsx         ← Chat principal. JAMAIS démonté pendant session active.
│   │   ├── ChatInput.jsx          ← Textarea + @mention + fichiers + quick actions
│   │   ├── MessageBubble.jsx      ← Rendu messages (user/agent/system) + toutes actions
│   │   ├── HistoryPanel.jsx       ← Panel gauche chat — fil conversation
│   │   ├── GlobalFloatingInput.jsx← Barre flottante permanente hors chat
│   │   ├── ToastStack.jsx         ← Notifications toast (z-200)
│   │   ├── DashboardScreen.jsx    ← Finances : revenus, dépenses, pipeline, retainers
│   │   ├── ProspectsScreen.jsx    ← CRM complet + AI prospect hunting
│   │   ├── JournalScreen.jsx      ← Améliorations todo/in-progress/done
│   │   ├── DecisionsScreen.jsx    ← Log décisions prises
│   │   ├── LibraryScreen.jsx      ← Réponses agents sauvegardées
│   │   ├── ReplayScreen.jsx       ← Viewer session archivée
│   │   ├── AgentCard.jsx          ← Carte agent sur HomeScreen
│   │   ├── AgentAvatar.jsx        ← Avatar réutilisable (photo ou emoji)
│   │   ├── AgentModal.jsx         ← Modal détail agent + bio
│   │   ├── AgentPing.jsx          ← Notification intelligente agent
│   │   ├── GuidedTour.jsx         ← Tour guidé + TourLauncher (bouton bas-droit)
│   │   ├── DailyCheckIn.jsx       ← Check-in matinal overlay
│   │   ├── PulseScoreCard.jsx     ← Score business composite au démarrage session
│   │   ├── MilestoneCelebration.jsx← Confetti milestone sessions
│   │   ├── ScenarioPicker.jsx     ← Sélecteur scénario roleplay
│   │   ├── WeeklyReport.jsx       ← Rapport lundi matin auto-généré
│   │   ├── ContentGenerator.jsx   ← Générateur posts LinkedIn/social
│   │   ├── ProspectAnalyzer.jsx   ← Analyse prospect IA depuis chat
│   │   ├── FocusTimer.jsx         ← Timer Pomodoro → debrief auto
│   │   ├── FinancialBar.jsx       ← Barre progression objectif financier
│   │   ├── GmailInbox.jsx         ← Vue inbox Gmail
│   │   └── Confetti.jsx           ← Composant confetti réutilisable
│   │
│   ├── hooks/
│   │   ├── useAutoSave.js         ← Debounced localStorage save + status (saving/saved/error)
│   │   └── useToast.js            ← Hook toast — toast(msg, {type, duration})
│   │
│   ├── lib/
│   │   ├── supabase.js            ← Client Supabase (null si env vars absentes)
│   │   ├── sync.js                ← syncSession/syncDecisions/etc. — tous fire-and-forget
│   │   └── mem0.js                ← searchMemories / addSessionMemory / addArchivistMemory
│   │
│   ├── utils/
│   │   ├── gcal.js                ← Google Calendar OAuth + fetchCalendarEvents
│   │   ├── gmailAuth.js           ← Gmail OAuth (implicit popup)
│   │   ├── gmailService.js        ← Gmail API — read/send/parse
│   │   ├── sessionHistory.js      ← Save/load 10 dernières sessions (localStorage)
│   │   ├── exportPdf.js           ← jsPDF export par réponse agent
│   │   ├── parseFile.js           ← PDF/image/CSV/Excel → base64/texte
│   │   ├── streak.js              ← Streak quotidien
│   │   ├── momentum.js            ← Stats momentum + cache daily mirror
│   │   ├── pulseScore.js          ← Score santé business composite
│   │   ├── sound.js               ← Ding de fin de réponse
│   │   ├── wins.js                ← Log victoires
│   │   ├── agentDepth.js          ← Compteur exchanges par agent
│   │   ├── emotionLog.js          ← Log états émotionnels détectés
│   │   ├── notifications.js       ← Notifications intelligentes contextuelles
│   │   ├── library.js             ← Save/unsave réponses bibliothèque
│   │   ├── greeting.js            ← Salutation dynamique selon heure
│   │   └── agentBios.js           ← Bios détaillées pour AgentModal
│   │
│   └── data/
│       └── agentBios.js           ← Contenu long des bios agents
│
├── CLAUDE.md                      ← Ce fichier
├── vite.config.js                 ← Config + proxy Mem0
├── tailwind.config.js             ← darkMode: 'class', fontFamily
├── package.json
└── .env                           ← Variables locales (ne pas committer)
```

### État global — App.jsx

```js
// Navigation (aucun router)
screen: 'home' | 'chat' | 'journal' | 'decisions' | 'dashboard' | 'prospects' | 'library' | 'replay'

// Session
sessionStarted: bool        // ChatScreen monté — ne démonte PLUS pendant session
sessionEnded: bool          // Session archivée
sessionMode: string         // Mode actif
sessionCount: number        // Total sessions
conversationState: {
  activeAgent: string,      // Agent actif (routing contextuel)
  threadDepth: number,      // Exchanges sur même sujet
  lastQuestion: string,     // Dernière question de l'agent (step 7)
  topicLocked: bool
}

// Messages
messages: Message[]         // types: 'user'|'agent'|'system'|'email-reply-draft'|'email-reply-sent'
isLoading: bool
thinkingAgent: string       // Agent en cours ("thinking" indicator)

// Refs critiques
sessionIdRef          // Date.now() à chaque startSession (id unique)
pendingGlobalMsg      // Message queued via GlobalFloatingInput
mem0PrefetchRef       // Pré-fetch Mem0 déclenché par typing (800ms debounce)
streamingMsgIdRef     // ID msg en streaming
rafRef                // requestAnimationFrame pour batch token updates
streamAccumRef        // Buffer accumulation tokens
```

### Comment ChatScreen reste mounté

```
App.jsx : {sessionStarted && screen !== 'replay' && <ChatScreen />}

Panels (journal, dashboard, etc.) → position: absolute, inset-0, z-20
→ superposés SUR le chat, jamais à la place.
→ ChatScreen reste dans le DOM = state conversation préservé.

Exception : screen === 'replay' → ChatScreen démonté (ReplayScreen à la place)
```

---

## LES 6 AGENTS

### Tableau de référence

| Clé | Nom Commercial | Domaine | Temp | glowRgb | Emoji |
|-----|---------------|---------|------|---------|-------|
| `HORMOZI` | The Offer Architect | Offer design, pricing, ROI | 0.3 | `59,130,246` | 💰 |
| `CARDONE` | The Sales Machine | Sales, prospecting, pipeline | 0.9 | `239,68,68` | 🔥 |
| `ROBBINS` | The Mindset Coach | Psychology, blocks, peak perf | 0.8 | `139,92,246` | 🧠 |
| `GARYV` | The Brand Builder | Content, brand, long game | 0.85 | `249,115,22` | 📱 |
| `NAVAL` | The Leverage Master | Systems, scalability, freedom | 0.2 | `16,185,129` | ⚡ |
| `VOSS` | The Black Swan | Negotiation, objections, scripts | 0.6 | `71,107,175` | 🦅 |

**Rôles système** (ne s'affichent pas comme agents normaux) :

| Clé | Rôle | Modèle | Quand |
|-----|------|--------|-------|
| `COORDINATOR` | Router JSON — choisit lead + supporting, détecte émotion | Haiku | Chaque message |
| `SYNTHESIZER` | Verdict final — UNE action < 100 mots | Sonnet | Sur demande explicite ("Give me the verdict") |
| `ARCHIVIST` | Compression session → JSON | Haiku | À endSession() |

### Résumé des system prompts

**COORDINATOR** — JSON uniquement. Retourne `{ lead, supporting[], reasoning, emotionalState }`.
États émotionnels : `frustrated | discouraged | excited | urgent | confused | neutral`.
Règles : 1 lead exact, max 2 supporting, JAMAIS SYNTHESIZER.

**HORMOZI** — Pense en chiffres. "What's the LTV?" "Stack the value." "Cut the fat."
Température basse (0.3) → réponses calculées, précises.

**CARDONE** — Volume et urgence. "10X everything." "Average is a failing formula."
Température haute (0.9) → énergie maximale.

**ROBBINS** — Patterns émotionnels. "What story are you telling yourself?" "State drives behavior."
Intervient quand les autres agents échouent à cause d'un blocage psychologique.

**GARYV** — Long game. "Document don't create." "Legacy over currency."
Connecte chaque activité contenu à un résultat business concret.

**NAVAL** — Levier et liberté. "Does this scale without Samuel?"
Corrige CARDONE quand le volume sacrifie le levier.

**VOSS** — Scripts exacts. Tactical empathy. Never split the difference.
Outils : mirroring, labeling, accusation audit, calibrated questions, black swan.
Donne des MOTS EXACTS, pas des principes généraux.

**SYNTHESIZER** — Une action. 24h. Pas de liste. Pas de hedge. Commence par "The consensus is clear:" ou "Your one move is:".

### COMMERCIAL_MODE flag

```js
// prompts.js ligne 297
export const COMMERCIAL_MODE = true; // → affiche noms archétypes (The Offer Architect, etc.)
                                     // false → affiche noms inspirés personnalités réelles
```

### Ajouter un nouvel agent

1. Ajouter prompt dans `AGENT_PROMPTS` (prompts.js)
2. Ajouter entrée dans `AGENT_CONFIG` avec tous les champs (`glowRgb`, `emoji`, etc.)
3. Ajouter dans `COORDINATOR_PROMPT` domaines
4. Ajouter dans `AGENT_TEMPERATURES` (api.js)
5. Ajouter dans `AGENT_TONE_MAP` (api.js) pour ProspectsScreen
6. Ajouter dans `KEYWORD_MAP` (GlobalFloatingInput.jsx) pour prédiction avatar

---

## INTÉGRATIONS ACTIVES

### Claude API — Détails techniques

**Headers toujours envoyés :**
```js
'anthropic-version': '2023-06-01'
'anthropic-dangerous-direct-browser-access': 'true'   // ← REQUIS pour appels browser
'anthropic-beta': 'prompt-caching-2024-07-31'         // toujours
                + ',web-search-2025-03-05'              // si enableWebSearch
                + ',interleaved-thinking-2025-05-14'   // si thinkingMode
```

**Prompt caching :**
```js
system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
// Chaque system prompt est mis en cache → économie tokens sur sessions longues
```

**Streaming :**
`callClaudeStream()` — SSE parse manuel, callbacks `onToken / onSearchState / onThinkingState`.
RAF batching : les tokens sont accumulés dans `streamAccumRef` et flushed en RAF à 60fps.

**Agentic loop (web search) :**
```js
// callClaude() boucle jusqu'à stop_reason !== 'tool_use', max 8 turns
while (stop_reason === 'tool_use' && turns < 8) {
  // Pour server-side tools (web_search), Anthropic gère les résultats
  // On envoie juste un tool_result vide pour continuer
}
```

**Températures par agent :** HORMOZI 0.3, NAVAL 0.2, VOSS 0.6, ROBBINS 0.8, GARYV 0.85, CARDONE 0.9.
Thinking mode → force temperature=1 (spec Anthropic).

**Vision pipeline (images) :**
```
1. callClaude() sans persona → description verbatim exhaustive
2. Résultat injecté : "[IMAGE — verbatim analysis]\n{description}\n[END IMAGE]"
3. Agents reçoivent ça comme contexte → conseils précis sur le vrai contenu
```

### Supabase — Tables

```sql
sessions            (id, session_date, mode, messages jsonb, consensus, summary jsonb)
improvement_journal (id, session_id, agent, improvement, status)
decisions           (id, session_id, decision, agent, decided_at)
feedback_log        (session_id, message_id, agent, value)
momentum            (streak, sessions_week, total_sessions, created_at)
daily_checkins      (checkin_date, energie_score, emoji, priority, blocker, created_at)
agent_config        (agent_key PK, custom_name, updated_at)
```

**Règle absolue :** toutes les fonctions `sync*` sont fire-and-forget. `try/catch` silencieux. Jamais bloquer le UI. localStorage ne dépend JAMAIS de Supabase.

```js
// Pattern standard :
export async function syncXxx(data) {
  if (!isSupabaseEnabled()) return;
  try { await supabase.from('table').upsert(data); }
  catch (e) { console.warn('[Sync]', e.message); }
}
```

### Mem0 — Mémoire long terme

**Architecture proxy (pas de clé exposée dans le browser) :**
```
Browser → /api/mem0/add    → Vite proxy injecte Authorization:Token → api.mem0.ai
Browser → /api/mem0/search → idem
```

En prod Vercel : créer `/api/mem0/add.js` et `/api/mem0/search.js` comme serverless functions.

```js
USER_ID = 'samuel'
APP_ID  = 'the-headquarters'
```

**3 points d'intégration dans le flux sendMessage() :**
```
1. Premier message session  → searchMemories(text) — bloquant, 1 fois
2. Typing debounce 800ms   → searchMemories(draft) → mem0PrefetchRef (non-bloquant)
3. Post-réponse agent       → searchMemories(response.slice(0,200)) → mem0PrefetchRef
```

**Sauvegarde à endSession() :**
```
addSessionMemory()    → conversation complète (messages user + agent)
addArchivistMemory()  → faits clés compressés (keyDecisions, consensusAction)
```

### Gmail OAuth

**Flow :** Implicit (popup) — response_type=token. Pas de client_secret dans le browser.

**Scopes :** `gmail.readonly` + `gmail.send` + `gmail.modify` + `userinfo.email`

**Storage :** `localStorage['hq_gmail_tokens']` → `{ access_token, expiry }`. Expire ~1h, buffer 60s.
⚠️ Pas de refresh token. L'utilisateur doit re-connecter après expiry.

**Intent detection dans sendMessage() :**
```
EMAIL_CHECK_TRIGGERS  → gmailService.getRecentEmails(10) → résumé inline
EMAIL_REPLY_TRIGGERS  → analyzeEmail() → draftEmailReply() → card email-reply-draft
EMAIL_INJECT_KEYWORDS → inject emails non lus dans combinedContext (passif)
```

### Google Calendar

**Flow :** Implicit popup. Scope : `calendar.readonly` seulement.

**Storage :** `localStorage['qg_gcal_token_v1']` → `{ token, expiry }`.

**Injection :** `formatCalendarContext(calendarEvents)` → dans `combinedContext` à chaque `sendMessage()`.
Événements fetched au mount App + rechargés à `connectCalendar()`.

---

## DESIGN SYSTEM

### Couleurs principales

```css
/* Background body */
background: url("SVG feTurbulence noise @4.5% opacity"),
            linear-gradient(180deg, #090e1a 0%, #0c1220 60%, #0a0f1c 100%);

/* Surfaces */
bg-gray-950: #030712   /* fond principal */
bg-gray-900: #111827   /* cartes, panels */
bg-gray-800: #1f2937   /* inputs */

/* Accent agents — utiliser via glowRgb dans inline styles */
HORMOZI → rgba(59,130,246, X)    /* blue */
CARDONE → rgba(239,68,68, X)     /* red */
ROBBINS → rgba(139,92,246, X)    /* violet */
GARYV   → rgba(249,115,22, X)    /* orange */
NAVAL   → rgba(16,185,129, X)    /* emerald */
VOSS    → rgba(71,107,175, X)    /* steel blue */

/* Header nav active */
background: rgba(99,102,241,0.18)
box-shadow: 0 0 0 1px rgba(99,102,241,0.32)

/* Glass morphism (overlays flottants) */
background: rgba(20,20,30,0.92)
backdrop-filter: blur(12px)
border: 1px solid rgba(255,255,255,0.08)
```

### Dark mode
`darkMode: 'class'` dans tailwind.config.js.
Toggle via `document.documentElement.classList.toggle('dark', darkMode)` dans App.jsx.
Dark mode est le défaut. `darkMode` state dans App.jsx, persisté à terme.

### Typographie
```
Space Grotesk  → font-display — titres, headers
Inter          → font-sans — tout le reste
JetBrains Mono → font-mono — timestamps, session info, monospace
```
Échelle : 10/11/12/13/14/16/20px. `.agent-prose { line-height: 1.72 }` pour réponses longues.

### Animations CSS (classes disponibles dans index.css)
```
.animate-screen-in    → fade+translateY 240ms — pages/panels au mount
.animate-panel-in     → slide depuis droite 220ms — panels en session active
.animate-bubble-in    → bubble message 300ms
.animate-card-in      → staggered card entrance 450ms
.animate-toast-in/out → toast enter/exit
.animate-modal-*      → modal backdrop + slide up
.skeleton             → shimmer loader CSS
.scroll-fade          → mask-image top/bottom sur containers scrollables
.tap-target           → touch target 44px via ::after inset:-8px
.agent-prose          → line-height 1.72
```

### Accessibilité intégrée
```css
*:focus-visible { outline: 2px solid rgba(99,102,241,0.75); }
*:focus:not(:focus-visible) { outline: none; }
-webkit-tap-highlight-color: transparent;
::selection { background: rgba(99,102,241,0.28); }
@media (prefers-reduced-motion: reduce) { /* toutes animations → 0.01ms */ }
```
ARIA : `aria-label` sur tous les boutons icon-only, `aria-live="polite"` sur le feed messages, `aria-current="page"` sur nav active.

---

## FEATURES BUILDÉES (Phase 1 complète)

### Sessions
- [x] 10 modes : quick, strategic, silent, focus, architect, prepCall, negotiation, analysis, roleplay, debate
- [x] Streaming SSE token-by-token avec RAF batch (60fps)
- [x] Multi-agent routing via COORDINATOR JSON (Haiku)
- [x] Per-agent temperature (0.2 → 0.9)
- [x] Deep Mode (Opus) + Thinking Mode (extended thinking, budget 8000 tokens)
- [x] Web search tool intégré (agentic loop, max 8 turns)
- [x] forceMode param dans startSession() pour bypass async state
- [x] Vision pipeline : pre-analysis verbatim → context injecté
- [x] Context combiné : pulse + check-in + émotions + finances + historique + Mem0 + calendrier + Gmail + date courante
- [x] Roleplay débrief automatique après 5 échanges
- [x] Pattern alert (inactivité prospection détectée)
- [x] Conversation state tracking (activeAgent, threadDepth, lastQuestion, topicLocked)

### Messages & Chat UI
- [x] Reactions (Approfondir / Simplifier / Exemple concret / Plan d'action / Désaccord)
- [x] Pin messages (max 3, sessionStorage, remplacement de slot)
- [x] Quote context (citer une réponse → ChatInput pré-rempli)
- [x] Second opinion (demander un autre angle à un agent spécifique)
- [x] Save to library (LibraryScreen)
- [x] Share (copie formatée avec attribution)
- [x] Star rating 1-5 (persisté localStorage)
- [x] PDF export par réponse (jsPDF, auto-trigger sur PDF keywords)
- [x] Thumbs up/down feedback → sync Supabase
- [x] @mention pour forcer un agent spécifique
- [x] Empty state premium (6 avatars staggered, suggestion rotative 5s)
- [x] Session info bar (live dot animé, mode, elapsed time)
- [x] Ambient glow par agent (boxShadow glowRgb)
- [x] Scroll fade edges (mask-image top/bottom)

### Input
- [x] Attach PDF/CSV/Excel (parse text → injecté dans system suffix)
- [x] Attach image (vision → pre-analysis → contexte pour agent)
- [x] @mention popup avec filtre clavier
- [x] Quick actions (LinkedIn, Rewrite, Analyze Convo)
- [x] Focus glow indigo (boxShadow au focus)
- [x] Auto-resize textarea

### Navigation & UX
- [x] GlobalFloatingInput — barre permanente hors chat (keyword agent prediction, quick chips)
- [x] Toast notifications (session start 🚀, session end ✓, email sent ✓, pin 📌)
- [x] Screen transitions (fade+translateY 240ms sur tous les écrans)
- [x] Press states globaux (scale 0.96 sur button:active)
- [x] Touch targets 44px (classe tap-target + ::after invisible)
- [x] 100dvh + safe-area-inset (mobile notch/iPhone)
- [x] prefers-reduced-motion media query
- [x] -webkit-tap-highlight-color supprimé
- [x] ARIA complet sur boutons icon-only + feed messages

### Mémoire & Persistence
- [x] Mem0 long-term (search, prefetch typing 800ms, save end)
- [x] Session history localStorage (10 dernières sessions)
- [x] Supabase sync (sessions, journal, decisions, feedback, momentum)
- [x] Auto-save debounced + status indicator

### Intégrations
- [x] Gmail read (inbox résumé, top 5 non lus)
- [x] Gmail send (reply depuis chat)
- [x] Gmail intent detection (check + reply triggers)
- [x] Gmail context injection sur keywords
- [x] Google Calendar read + injection contexte

### Screens spécialisés
- [x] Dashboard financier (revenus/dépenses par mois, pipeline stages, retainers, goal %)
- [x] Prospects screen — CRM complet :
  - AI web search prospects (`searchProspects` avec progress callbacks + cancel ref)
  - 3 niveaux de profondeur : surface / approfondie / maximale
  - Deep intelligence report par prospect
  - Message multi-variantes par agent (VOSS/CARDONE/HORMOZI/GARYV/NAVAL/ROBBINS)
  - Competitor context fetch
  - Contact history par prospect
  - Signal detection (avis négatifs, expansion, recrutement, Instagram actif)
  - Conversion intelligence tracking
  - Cost estimation avant recherche
  - `RateLimitError` handling
- [x] Decisions log
- [x] Improvement journal (todo / in-progress / done)
- [x] Library (réponses sauvegardées avec filter agent)
- [x] Session replay (viewer session archivée)
- [x] Content generator (LinkedIn/social depuis contexte session)
- [x] Prospect analyzer (overlay depuis chat)
- [x] Focus timer Pomodoro → debrief auto → pré-remplit ChatInput
- [x] Daily check-in (énergie, priorité, blocage)
- [x] Pulse score composite (finances + streak + check-in)
- [x] Daily quote + Momentum Mirror
- [x] Streak quotidien
- [x] Milestone celebrations (confetti au 5/10/25/50/100 sessions)
- [x] Guided tour (TourLauncher + GuidedTour)
- [x] Smart notifications (AgentPing contextuel)
- [x] Weekly Monday report auto-généré

### UI/Style
- [x] Dark mode / Light mode
- [x] FR/EN bilingual complet (i18n.js)
- [x] Agent photos custom (upload URL)
- [x] Agent names custom (persisté Supabase)
- [x] Sound toggle (ding réponse)
- [x] Noise texture background (SVG feTurbulence 4.5%)
- [x] ::selection custom (indigo tint)
- [x] Header active pill (indigo ring sur nav courante)
- [x] scroll-behavior smooth global
- [x] Skeleton shimmer CSS (classes .skeleton / .skeleton-line / etc.)

---

## FEATURES EN COURS (Phase 2)

### Ce qui est partiellement buildé

**ProspectsScreen** — majoritairement complet mais quelques trous :
- [ ] `hq_prospect_memory` (LS_KEY défini mais pas pleinement exploité)
- [ ] Export CSV du pipeline
- [ ] Notification quand un prospect répond (pas de polling)

**Mem0** — fonctionnel mais pas surfacé :
- [ ] L'utilisateur ne voit jamais que QG se souvient de lui
- [ ] Memory viewer (voir/éditer les mémoires depuis l'app)

**Toast system** — infrastructure en place, pas tous les triggers câblés :
- [ ] Copy-to-clipboard toast (dans MessageBubble, nécessite prop drilling onToast)
- [ ] Prospect saved toast
- [ ] Calendar connected toast

**GlobalFloatingInput** — complet pour la barre elle-même :
- [ ] Keyword prediction actif mais pas optimisé pour tous les cas edge
- [ ] Pas de suggestion history

### Ce qu'il faut builder en priorité

**P1 — Changement de catégorie (Manus territory) :**
- [ ] Créer Google Calendar event depuis chat (post-session "préparer un appel")
- [ ] Envoyer email depuis chat avec approbation rapide (VOSS draft → "Envoyer ?" → 1 clic)
- [ ] Mettre à jour pipeline depuis chat ("j'ai signé avec X" → update dashboard auto)

**P2 — Rétention (mémoire visible) :**
- [ ] Memory recap au démarrage session ("Depuis la dernière fois, voici ce que je sais...")
- [ ] Memory viewer UI
- [ ] Session continuity (reprendre une session spécifique avec contexte)

**P3 — Acquisition :**
- [ ] PWA manifest + service worker (installable iPhone)
- [ ] Onboarding 3 étapes (Gmail/Cal connect + première session démo)
- [ ] Mobile layout (bottom nav, swipe)
- [ ] Deep link sharing (partager une réponse agent)

**P4 — Monétisation :**
- [ ] Multi-user / workspace
- [ ] Subscription Stripe
- [ ] Usage tracking (tokens/session)
- [ ] Agent marketplace (JSON config custom)

**P5 — Intelligence :**
- [ ] Webhook triggers (Make.com/Zapier → QG)
- [ ] Voice mode (Web Speech API)
- [ ] Cross-session pattern detection
- [ ] Skeleton loaders visuels (infrastructure CSS prête, composant ThinkingDots à remplacer)

---

## CE QUI RESTE À FAIRE

### Phase 3 — Autonomie (priorité absolue)

**Action 1 — Calendar from chat :**
```
"J'ai un appel avec [prospect] jeudi à 14h"
→ VOSS détecte l'intent
→ Propose "Créer l'event?" avec détails pré-remplis
→ Un clic → gcal.createEvent(token, {title, start, end, description})
→ Toast "Event créé ✓"
```
Nécessite : `calendar.events` scope (actuel = `calendar.readonly`), function `createCalendarEvent()` dans gcal.js.

**Action 2 — Send email from chat :**
```
Existing code dans handleSendEmailReply() en App.jsx → DÉJÀ FONCTIONNEL
Manque : trigger automatique depuis VOSS quand il détecte "envoie ça"
```

**Action 3 — Pipeline auto-update :**
```
COORDINATOR détecte "j'ai signé", "j'ai perdu", "le prospect a dit oui"
→ extrait nom + stage
→ met à jour dashboard.pipeline dans localStorage + Supabase
```

### Phase 3 — Infrastructure prod

- [ ] Proxy serverless Vercel pour `VITE_ANTHROPIC_API_KEY` (sécurité)
- [ ] Proxy serverless Vercel pour Mem0 (`/api/mem0/*.js`)
- [ ] Gmail OAuth → Authorization Code Flow (refresh token, ne plus expirer en 1h)
- [ ] Multi-user auth (Supabase Auth ou Clerk)
- [ ] Rate limiting côté serveur

### Phase 4 — Scale

- [ ] White-label : workspace par client, agents rebrandables, couleurs custom
- [ ] Stripe subscription (Free/Pro/Agency)
- [ ] Analytics usage (tokens, sessions, conversion pipeline)
- [ ] iOS/Android natif (Expo ou React Native)

---

## CONVENTIONS DE CODE

### Nommage
```
Composants React    → PascalCase      (ChatScreen.jsx)
Hooks               → camelCase + use (useToast.js)
Utils               → camelCase       (sessionHistory.js)
Constants           → UPPER_SNAKE     (LS_JOURNAL, COMMERCIAL_MODE)
localStorage keys   → qg_ ou hq_     (qg_journal_v1, hq_prospects)
sessionStorage keys → hq_            (hq_pinned)
```

### Patterns critiques — NE PAS CASSER

**1. forceMode pour bypass async state :**
```js
// PROBLÈME : setSessionMode('quick') + startSession() dans même tick = stale closure
// SOLUTION dans startSession() :
function startSession(scenarioKeyOverride = null, forceMode = null) {
  const effectiveMode = forceMode ?? sessionMode;  // ← jamais stale
  if (forceMode !== null && forceMode !== sessionMode) setSessionMode(forceMode);
  // Utiliser effectiveMode partout. JAMAIS sessionMode directement.
}
```

**2. pendingGlobalMsg pour auto-send :**
```js
// ChatScreen pas encore monté quand startSession() est appelé
// → toujours passer par useRef + setTimeout 200ms
pendingGlobalMsg.current = msg;
startSession(null, 'quick');
// useEffect([screen, sessionStarted]) capte le changement et envoie
setTimeout(() => sendMessage(msg), 200);
```

**3. RAF batch pour streaming :**
```js
// JAMAIS setState à chaque token → freeze UI
onToken: (token) => {
  streamAccumRef.current += token;
  if (!rafRef.current) {
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setMessages((prev) => prev.map((m) =>
        m.id === id ? { ...m, content: streamAccumRef.current } : m
      ));
    });
  }
}
// Toujours flush le RAF avant de finaliser le message :
if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; /* sync update */ }
```

**4. onMouseDown > onClick pour chips/boutons sous un input :**
```jsx
// onBlur de l'input fire AVANT onClick → le bouton disparaît avant le click
// Fix : onMouseDown + e.preventDefault() (fire avant onBlur)
onMouseDown={(e) => { e.preventDefault(); handleChip(chip); }}
```

**5. Supabase toujours fire-and-forget :**
```js
// JAMAIS await blocking, JAMAIS lancer une erreur UI depuis Supabase
try { await supabase.from('x').upsert(data); }
catch (e) { console.warn('[Sync]', e.message); }
```

### Ce qu'il ne faut JAMAIS toucher sans comprendre

- `ChatScreen` : ne jamais le conditionner en `screen === 'chat'` → il doit rester monté pendant toute la session
- `streamingMsgIdRef` + `rafRef` : nettoyer TOUJOURS dans le bloc catch et le finally
- `COMMERCIAL_MODE` dans prompts.js : ne changer qu'intentionnellement (impact noms affichés)
- `VITE_ANTHROPIC_API_KEY` : jamais logger, jamais afficher dans l'UI
- `'anthropic-dangerous-direct-browser-access': 'true'` header : requis pour appels browser directs, retirer uniquement si on passe à un proxy

### Ajouter un composant écran
```
1. Créer src/components/NomScreen.jsx
2. Ajouter import dans App.jsx
3. Ajouter case dans le rendering (screen === 'nom')
4. Wrapper dans <div className="... animate-screen-in ...">
5. Ajouter bouton navigation dans Header.jsx (iconBtn pattern)
6. Ajouter route dans les toggles Header (screen === 'nom' ? 'chat'|'home' : 'nom')
```

### localStorage — toutes les clés

```
qg_agent_photos_v1      { HORMOZI: url, ... }
qg_agent_names_v1       { HORMOZI: 'Custom Name', ... }
qg_session_count_v1     number
qg_sound_enabled_v1     bool
qg_agent_last_spoke_v1  { HORMOZI: timestamp, ... }
qg_decisions_v1         Decision[]
qg_journal_v1           ImprovementItem[]
qg_dashboard_v1         { annualGoal, monthlyRevenue[], pipeline, retainers[] }
qg_lang_v1              'fr' | 'en'
qg_session_history_v1   Session[] (max 10)
qg_streak_v1            { lastDate, count }
qg_wins_v1              Win[]
qg_agent_depth_v1       { HORMOZI: number, ... }

hq_prospects            Prospect[]
hq_prospect_memory      ProspectMemory
hq_search_intelligence  ConversionRecord[]
hq_gmail_tokens         { access_token, expiry }
hq_pinned               PinnedMessage[] (sessionStorage, max 3)
hq_debrief_pending      string (FocusTimer → ChatInput pré-fill)
hq_ratings              { [messageId]: 1-5 }

qg_gcal_token_v1        { token, expiry }
qg_checkin_today        CheckInData
qg_monday_report_date   dateString
```

---

## COMMENT LANCER LE PROJET

### Setup initial
```bash
git clone [repo]
cd the-headquarters
npm install

# Créer le fichier .env à la racine
cp .env.example .env
# Remplir les valeurs (voir section suivante)
```

### Variables d'environnement

```bash
# Requis absolu
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...

# Optionnel — sync cloud
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optionnel — mémoire long terme
VITE_MEM0_API_KEY=m0-...

# Optionnel — Gmail + Calendar OAuth
VITE_GOOGLE_CLIENT_ID=123456789-xxx.apps.googleusercontent.com
```

### Commandes
```bash
npm run dev      # http://localhost:5173 — dev avec HMR
npm run build    # dist/ — build prod (Vite)
npm run preview  # preview du build prod sur port 4173
```

### Config Google OAuth (pour Gmail + Calendar)
```
1. Google Cloud Console → Créer projet
2. APIs & Services → Credentials → OAuth 2.0 Client ID
3. Application type: Web application
4. Authorized JavaScript origins: http://localhost:5173
5. Authorized redirect URIs: http://localhost:5173/auth/gmail/callback
6. Copier client_id → VITE_GOOGLE_CLIENT_ID
7. APIs & Services → Library → Activer Gmail API + Google Calendar API
```

### Proxy Mem0 (dev)
Le proxy est configuré dans `vite.config.js`. Il injecte automatiquement `Authorization: Token ${VITE_MEM0_API_KEY}`. Aucune config supplémentaire nécessaire en dev.

### Ports
```
5173 → dev server (Vite)
4173 → preview build
```

---

## DÉCISIONS IMPORTANTES PRISES

### Pourquoi aucun router (React Router, etc.)
L'app est un SPA single-page avec un seul écran "profond" (Chat) qui ne doit jamais être démonté.
Un router forcerait le remontage des composants au changement d'URL, perdant le state streaming.
Solution : état `screen` + `sessionStarted` dans App.jsx. Panels = `position: absolute` par-dessus le chat.

### Pourquoi localStorage est la source de vérité (pas Supabase)
Supabase est une option (pas disponible en dev sans config) et peut être hors ligne.
L'app doit fonctionner entièrement offline sauf pour les appels Claude.
Supabase = backup/sync. Jamais de lecture depuis Supabase au démarrage.

### Pourquoi appels Anthropic directs depuis le browser
Usage personnel/dev. `anthropic-dangerous-direct-browser-access: true` requis.
Pour distribution publique → wrapper serverless obligatoire (exposer la clé serait un problème).

### Pourquoi Mem0 via proxy Vite et non SDK direct
`mem0ai` npm SDK fait des appels depuis le browser qui exposeraient la clé API dans le réseau.
Proxy Vite injecte `Authorization: Token` côté serveur. Browser ne voit jamais la clé.

### Pourquoi le streaming est batché via RAF et non setState direct
10-30 tokens/seconde × setState par token = 10-30 re-renders/seconde = freeze UI.
Solution : accumulation dans un ref, flush en requestAnimationFrame à max 60fps.

### Pourquoi forceMode dans startSession()
```
// Scénario : GlobalFloatingInput appelle setSessionMode('quick') PUIS startSession()
// React ne flush pas setState synchrone → startSession() capture sessionMode stale
// Fix : paramètre forceMode = 'quick' → effectiveMode = 'quick' au moment de l'appel
```

### Pourquoi onMouseDown sur les chips (pas onClick)
Quand un input est focusé et qu'on clique un bouton nearby :
1. onBlur de l'input fire (chip disparaît du DOM)
2. onClick ne fire jamais (élément démonté)
Fix : `onMouseDown + e.preventDefault()` fire AVANT onBlur, le chip reste.

### Ce qu'on a essayé qui n'a pas marché

**React Query / SWR** — trop complexe pour un cas d'usage local-first. Auto-save custom avec debounce suffisant.

**WebSocket pour streaming** — API Anthropic ne supporte pas WebSocket. SSE `fetch` avec `ReadableStream` est la seule option correcte.

**Supabase Realtime** — envisagé pour sync multi-device. Abandonné : app mono-user, overkill.

**react-transition-group** — envisagé pour exit animations entre screens. Abandonné : dépendance non justifiée pour des animations d'entrée uniquement. CSS `@keyframes` sur mount suffisant.

### Contraintes connues

1. **Gmail token expire en ~1h** (implicit flow sans refresh token). L'utilisateur doit re-cliquer "Connecter Gmail".
2. **VITE_ANTHROPIC_API_KEY dans le browser** — acceptable pour usage perso/dev uniquement.
3. **Mem0 ne fonctionne pas sans `vercel dev`** ou un proxy running côté serveur en dev si `npm run dev` seul.
   → Fix : le `vite.config.js` proxy fonctionne avec `npm run dev` standard. Aucun serveur supplémentaire nécessaire.
4. **history max = 10 sessions** dans sessionHistory.js. Augmenter si besoin d'historique plus long pour le contexte agents.
5. **PDF blob URLs** dans MessageBubble — `URL.revokeObjectURL()` dans useEffect cleanup pour éviter les fuites mémoire.

---

## PROCHAINE ACTION IMMÉDIATE

### Où on en est exactement

Phase 1 (UI + features de base) : **100% complète**.

Dernières choses buildées :
- GlobalFloatingInput (4 étapes : visuel, comportement, indicateur agent, chips)
- Chat UI polish (empty state, session info bar, bottom bar, ChatInput lang)
- UI/Aesthetic complete pass (transitions, press states, focus rings, noise texture, toast system, 100dvh, skeleton CSS, scroll-fade, tap-target, ambient glow, typography, ARIA, prefers-reduced-motion, ::selection, tap highlight)

### La prochaine chose à builder

**Créer un Google Calendar event depuis le chat — Phase 2 Action #1**

C'est le premier vrai mouvement "autonome" qui sépare QG de Sintra (qui conseille mais n'agit pas).

```
Implémentation :
1. gcal.js → ajouter createCalendarEvent(token, { summary, start, end, description })
   → POST https://www.googleapis.com/calendar/v3/calendars/primary/events
   → Nécessite upgrade scope : 'calendar.events' au lieu de 'calendar.readonly'

2. sendMessage() dans App.jsx → détecter intent calendrier
   CALENDAR_TRIGGERS = ['prépare un appel', 'j'ai un meeting', 'planifie', 'crée un event', 'ajoute au calendar']
   → extraire date/heure/titre via un appel Haiku rapide
   → si extractable → afficher card de confirmation inline dans le chat
   → bouton "Créer l'event" → createCalendarEvent() → toast "Event créé ✓"

3. Nouveau type de message : 'calendar-event-preview'
   → Card avec titre, date, heure, bouton Confirmer / Modifier
   → À rendre dans MessageBubble.jsx (pattern identique à email-reply-draft)
```

Effort estimé : **2-3 heures** pour un MVP fonctionnel.
Impact : first demo "wow" qui change la perception du produit.

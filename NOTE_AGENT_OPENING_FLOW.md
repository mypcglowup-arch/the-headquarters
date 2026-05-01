# Diagnostic — Flow d'ouverture de session

## TL;DR

L'utilisateur **ne sélectionne pas un agent pour démarrer une session**. Il sélectionne un **mode** (Quick, Strategic, Focus, etc.) et clique **Start**. L'agent qui parle en premier est **choisi par le système** selon des signaux (pipeline, momentum, time-of-day, etc.) — pas par l'utilisateur.

**L'agent envoie automatiquement un message d'ouverture**, mais à travers une cascade de 8 couches conditionnelles. Si TOUTES échouent, le chat reste avec **seulement le message système "Session démarrée"** et l'utilisateur attend.

---

## Code flow exact

### Étape 1 — Sélection sur HomeScreen

```
HomeScreen.jsx:257  AgentCard onFocus={onSetFocusAgent}    → setFocusAgent(key)
HomeScreen.jsx:293  Mode card  onClick={() => onSetMode(key)} → setSessionMode(key)
HomeScreen.jsx:475  "Start" button onClick={onStart}         → startSession()
```

⚠️ **Cliquer un agent NE démarre PAS une session**. Ça met juste `focusAgent` en state. La session démarre uniquement au clic sur **Start**.

L'agent sélectionné n'est utilisé que si le mode est `'focus'` (`isFocus = effectiveMode === 'focus' && focusAgent`).

### Étape 2 — `startSession()` (App.jsx:665)

```js
function startSession(scenarioKeyOverride, forceMode, options) {
  // ... init mode, scenario
  setMessages([welcomeMsg]);    // ← (1) Message système "Session démarrée"
  setSessionStarted(true);       // ← Mount ChatScreen
  setScreen('chat');

  if (skipCascade) return;                                     // Monday auto-session skip
  if (effectiveMode === 'silent') return;                      // Silent mode = zero opening

  // → Lance la cascade de 8 couches en parallèle (chacune dans setTimeout)
}
```

**À ce point** : ChatScreen monte. L'utilisateur voit **un seul message bleu "✓ Session démarrée 🚀"**. Le reste arrive de manière asynchrone.

### Étape 3 — Cascade des 8 couches (toutes gated par `briefingLockedRef`)

Une seule fire — la première qui passe ses checks lock le ref et bloque les suivantes.

| # | Layer | Délai | Conditions de fire | Premier message |
|---|---|---|---|---|
| 1 | **Pattern alert** (App.jsx:738) | 150ms | Historique montre prospection inactive | Cardone : "T'as pas prospecté depuis X jours…" |
| 2 | **Churn alert** (App.jsx:754) | 400ms | Retainer non-touché > 45j | Hormozi : "[Client] silencieux depuis X jours…" |
| 3 | **Decision reminder** (App.jsx:804) | async | Décision 30j+ sans outcome | Card spéciale "Quel résultat pour [décision] ?" |
| 4 | **Anomaly alert** (App.jsx:849) | async | Drop > 40% sur outreach/pipeline/MRR week-over-week | Agent owner : "[axe] tombé de X% cette semaine" |
| 5 | **Meeting Room** (App.jsx:937) | async | `sessionCount > BRIEFING_UNLOCK_AT (7)` + pattern négatif détecté | Agent organique sur le pattern |
| 6 | **Fil Rouge teaser/full** (sessions 1-3 vs 4+) | async | Décision encore sans outcome | Agent référence le fil rouge |
| 7 | **Briefing matin** (Lundi) | async | Lundi + dans la fenêtre | Briefing structuré |
| 8 | **Universal session opening** (App.jsx:1024) | **1500ms** | `sessionCount > 1` + tous les checks de retour false | Agent calibré par signaux |

### Étape 4 — `generateSessionOpening()` (api.js:3253)

C'est le **fallback universel**. Génère via `/api/anthropic` (proxy Vercel) :

**Input** : pipeline, retainers, recentWins, lastSession, victoriesCount, totalMRR, hour, lang

**Prompt système** (api.js:3289-3355) :
- Choisit l'agent selon les signaux (pipeline=0+morning → CARDONE, demo → VOSS, win<48h → ROBBINS, MRR plat → HORMOZI, etc.)
- Force structure 3 éléments : **observation factuelle** (chiffre/date/prospect) + **question inconfortable** + **zéro intro**
- Output JSON strict : `{ agent, content, rationale, confidence }`
- Validation client-side : `confidence >= 0.5`, content 20-400 chars, agent valide

**Exemples gold-standard** (du prompt) :
- CARDONE Mon AM, pipeline=0 : *"Ton pipeline est à zéro depuis vendredi. C'est quoi l'excuse cette fois ?"*
- HORMOZI après signing 500$/mo : *"T'as signé à 500$/mois. C'est en dessous de ce que ton offre vaut. Pourquoi t'as pas chargé 750 ?"*
- NAVAL dimanche soir : *"T'as travaillé fort cette semaine. La question c'est pas si t'as travaillé — c'est si t'as travaillé sur la bonne chose."*

### Étape 5 — Push dans messages (App.jsx:1069)

Si tout passe :
```js
setMessages((prev) => [...prev, {
  id:        `session-opening-${thisSessionId}-${opening.agent}`,
  type:      'agent',
  agent:     opening.agent,
  content:   opening.content,
  streaming: false,
  timestamp: new Date(),
  meta:      { source: 'sessionOpening', rationale: opening.rationale },
}]);
```

L'agent message apparaît dans le chat.

---

## ⚠️ Gates critiques qui peuvent bloquer toute ouverture

Conditions qui font qu'**aucun agent ne parle jamais** au démarrage (chat reste vide après le welcome system) :

1. **`sessionMode === 'silent'`** → tout skip, par design
2. **`/api/anthropic` proxy down** → toutes les couches qui font des appels LLM (anomaly, meeting room, briefing, universal opening) crashent
3. **`sessionCount <= 1`** (App.jsx:1028) → la couche universelle (la plus large filet de sécurité) **est skippée à la toute première session** ‼️
4. **`briefingLockedRef.current`** trippé prématurément → toutes les couches suivantes muettes
5. **Mem0 disabled** → certaines couches (Meeting Room, FilRouge full) requièrent des memories

---

## Code paths résumés visuellement

```
[User clic Start]
     ↓
startSession()
     ↓
setMessages([welcomeMsg])  ← message système bleu visible immédiatement
setSessionStarted(true)
setScreen('chat')
     ↓
┌─── Cascade async (parallèle, gated par briefingLockedRef) ───┐
│                                                                │
│  150ms : Pattern alert (Cardone)                              │
│  400ms : Churn alerts (Hormozi)                               │
│  async : Decision reminder                                    │
│  async : Anomaly alert (LLM call /api/anthropic)             │
│  async : Meeting Room (LLM call) [needs sessionCount > 7]    │
│  async : Fil Rouge teaser/full (LLM call)                    │
│  async : Briefing (Lundi only, LLM call)                     │
│ 1500ms : Universal session opening (LLM call) [sessionCount>1]│
│                                                                │
└────────────────────────────────────────────────────────────────┘
     ↓ (un seul fire)
setMessages([...prev, agentOpeningMsg])
     ↓
ChatScreen affiche le message agent (bulle colorée selon agent)
```

---

## Hypothèses sur ce bug

Sans plus d'info, voici ce qui peut faire que **rien n'apparaît après "Session démarrée"** :

| Hypothèse | Comment vérifier |
|---|---|
| **A** : `/api/anthropic` Vercel proxy retourne 500 | DevTools Network sur Vercel deploy : POST `/api/anthropic` → status code |
| **B** : `sessionCount <= 1` ET les autres couches échouent silencieusement | `localStorage.getItem('qg_session_count_v1')` — si `1` ou null, la couche universelle est skippée |
| **C** : `briefingLockedRef.current` reste true entre sessions | Bug de cleanup — checker manuellement |
| **D** : Mode `silent` activé sans le savoir | `sessionMode` state — vérifier en DevTools React |
| **E** : `/api/anthropic` retourne du JSON non-parseable | Validation drop opening (confidence < 0.5 ou content < 20 chars) |

---

## Ce qui n'a PAS été fait (diagnostic only)

- Aucun fix appliqué
- Aucune modif aux fichiers
- Pas de régression possible

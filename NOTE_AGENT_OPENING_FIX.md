# Fix — Agent opening message always fires

## Problème

Sur la première session (`sessionCount <= 1`), TOUTES les 8 couches de la cascade étaient skippées ou échouaient parce qu'il n'y avait pas de données historiques. Chat restait silencieux après "Session démarrée". Testeurs voyaient rien et ne savaient pas quoi faire.

---

## Récap des 3 changements

### 1. App.jsx — gates retirés + fallback wired

**Avant** :
```js
if (sessionCount <= 1) return;                  // ❌ skip session 1
const memories = isMem0Enabled() ? await ... ;
if (!memories || memories.length === 0) return; // ❌ skip si pas de Mem0 ou pas d'historique
// + alert() intrusif sur erreur
```

**Après** :
```js
// Plus de gate sessionCount, plus de gate Mem0
// Try LLM → if fails or returns null → buildStaticOpening fallback
// → toujours un message agent affiché
```

Les seuls gates qui restent (intentionnels) :
- `effectiveMode === 'silent'` (par design)
- `briefingLockedRef.current` (un autre layer a déjà tiré)
- `canFire` (vérifie qu'il n'y a pas déjà un message agent/user)

### 2. api.js — `buildStaticOpening()` en safety net hardcoded

Nouveau export `buildStaticOpening({ userProfile, isFirstSession, lang })` :

| | Première session (no data) | Sessions suivantes |
|---|---|---|
| **HORMOZI** | "On commence par les chiffres. C'est quoi ton offre principale et combien tu charges pour ?" | "Reprends-moi : c'est quoi le chiffre qui a bougé depuis la dernière fois — dans le bon ou le mauvais sens ?" |
| **CARDONE** | "Premier round. T'as combien de prospects actifs là, maintenant, avec qui t'es supposé parler cette semaine ?" | "Combien de conversations de vente t'as eues depuis la dernière session ? Réponds avec un chiffre, pas une excuse." |
| **ROBBINS** | "On démarre. C'est quoi le truc que t'évites depuis trop longtemps et que tu sais que tu dois faire ?" | "T'es revenu. Qu'est-ce qui s'est passé dans ta tête depuis la dernière fois — tu progresses ou tu rumines ?" |
| **GARYV** | "Ton audience sait pas que t'existes. T'as posté quoi sur quelle plateforme dans les 7 derniers jours ?" | "T'as posté combien de fois depuis qu'on s'est parlé ? Et c'est quoi qui t'arrête de poster aujourd'hui ?" |
| **NAVAL** | "T'as ouvert l'app. La vraie question : c'est quoi le levier que tu pourrais activer une fois et qui te rapporterait pendant des années ?" | "Une semaine plus tard. Le travail que t'as fait — c'était du levier, ou c'était de l'occupation ?" |
| **VOSS** | "On commence. Y'a un deal, une négo ou une conversation difficile que t'as mise de côté — c'est laquelle ?" | "Y'a un appel ou une réponse à un prospect que tu repousses. Donne-moi le contexte et je te sors le script." |

12 openers FR + 12 openers EN. Sélection : `userProfile.primaryAgent` si set, sinon HORMOZI par défaut.

### 3. api.js — `generateSessionOpening` adapté pour first session

Nouveau prompt section quand `isFirstSession=true` :

```
FIRST-SESSION CONTEXT (UNBREAKABLE) :
This is the user's VERY FIRST session. Pipeline is empty, no retainers, no
historical signals — that's normal, NOT a problem to comment on. Do NOT pretend
to know things you don't. Instead :
- Open with ONE direct, identity-shaping question that reveals who they are :
  their offer, their main constraint, their biggest gap, their stage.
- Use the USER PROFILE (sector, stage, role) IF available to make it concrete.
- Skip the SIGNAL→AGENT MAPPING and LIVE SIGNALS sections.
```

Plus le bloc USER PROFILE injecté pour personnaliser :
```
USER PROFILE :
  name: Samuel
  role: Founder NT Solutions
  niche: Tonte de gazon résidentiel Québec
  stage: starting
  preferred agent: CARDONE
  declared challenges: find_clients, close_deals
```

L'agent peut maintenant ouvrir sur le **niche réel** de l'utilisateur même au premier lancement, sans avoir besoin de pipeline data.

### 4. Catch supprimé + return null silencieux

Le `throw err` + alert() de diagnostic retirés. `generateSessionOpening` retourne `null` proprement sur toute erreur. Le caller fait le fallback static. Plus d'alert intrusif sur mobile.

---

## Flow garanti maintenant

```
startSession() → setMessages([welcomeMsg]) → ChatScreen mount
     ↓ 1500ms
[layers 1-7 cascade ; gated by briefingLockedRef]
     ↓ (aucun n'a fire)
Universal opening :
  ├─ Try generateSessionOpening (LLM call)
  │    ├─ Success → push agent message ✅
  │    └─ Fail/null → fallback ↓
  └─ buildStaticOpening({ userProfile, isFirstSession, lang })
     → push agent message ✅ (always, deterministic)
```

**Le chat n'est plus jamais silencieux.** Soit l'agent dit quelque chose de calibré (LLM), soit il dit le static opener (instant, pas de network). Dans les deux cas, l'utilisateur voit un message + une question dans les 1.5 secondes après "Session démarrée".

---

## Fichiers modifiés

- `src/api.js` :
  - Ajouté `STATIC_FIRST_OPENINGS` + `STATIC_RECURRENT_OPENINGS` (12 openers FR/EN × 6 agents × 2 contextes)
  - Ajouté `export function buildStaticOpening({ userProfile, isFirstSession, lang })`
  - `generateSessionOpening` : nouveaux params `isFirstSession` + `userProfile`, prompt adapté pour first session, catch retourne `null` au lieu de throw

- `src/App.jsx` :
  - Import `buildStaticOpening` ajouté
  - Universal opening : retiré `sessionCount <= 1` et `!memories.length` gates
  - Wrapped LLM call dans try → si null, fallback `buildStaticOpening({...})`
  - Retiré alert() + toast diagnostic intrusifs

---

## Marche à suivre

1. **Commit + push** `src/App.jsx` + `src/api.js`
2. Vercel rebuild
3. Test :
   - **Premier lancement (session 1)** → après 1.5s, message agent apparaît (LLM ou static)
   - **Vercel proxy down** (clé manquante) → static fallback fire à la place
   - **Mode silent** → toujours zéro opening (par design)
4. Plus de testeurs perdus devant un chat vide.

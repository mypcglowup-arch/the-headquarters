# CHANGELOG

## [Unreleased]

### Added — Phase 3 — Decision outcome tracking (boucle de calibrage)
Chaque fois qu'un agent donne un conseil actionnable, c'est automatiquement **loggé comme "décision"**. 30 jours plus tard, QG demande *"Tu avais décidé X. Résultat ?"* L'outcome (positif/neutre/négatif + commentaire) alimente ensuite le contexte de cet agent pour toutes ses réponses futures — ses conseils sont calibrés sur ce qui a réellement fonctionné.

### Les 5 couches

| # | Couche | Fire quand | Effet |
|---|---|---|---|
| A | **Détection** | Après chaque lead response ≥ 80 chars | Haiku extrait la décision actionnable si présente (confidence ≥ 0.75) |
| B | **Log inline** | Détection positive | Mini-card *"Décision enregistrée · 24 avril · [decision]"* après la réponse |
| C | **Reminder** | Session start, décision 30j+ sans outcome | Card avec *"T'avais décidé X. Résultat ?"* + 3 boutons + textarea |
| D | **Outcome input** | Clic sur reminder | 3 boutons (positif/neutre/négatif) + textarea optionnelle → submit |
| E | **Track record** | Chaque response agent | `formatTrackRecord` injecte les 8 dernières décisions de l'agent avec outcomes dans son prompt |

### Data model étendu

```js
{
  id: 'dec-1714000000-x7k3',
  decision: 'Cap next retainer at $750/mo minimum',
  agent: 'HORMOZI',
  date: 1714000000000,
  outcome: null | 'positive' | 'neutral' | 'negative',
  outcomeComment: 'Closed Dubé at $750/mo',  // optionnel
  outcomeDate: 1716600000000,
  sessionId: 12345,
}
```

### ⚠ SQL migration pour la table decisions existante

```sql
ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS id text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_comment text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_id ON decisions (id) WHERE id IS NOT NULL;
```

Sans ce SQL : detection + logging + reminder + outcome input fonctionnent 100% en localStorage. Seul le sync cloud échouera silencieusement (aucun impact UX).

### Fichiers

- `src/api.js`
  - `extractActionableDecision(agentResponse, lang)` — Haiku JSON, returns `{ decision, confidence }` ou `null`. Règles strictes : imperative form, ≤ 180 chars, confidence ≥ 0.75. Bannis : questions, observations, principles, motivational.
  - `formatTrackRecord(decisions, targetAgent)` — format des 8 dernières décisions avec outcomes pour injection dans prompt. "Never mention this directly to Samuel" règle dans le texte.

- `src/lib/sync.js`
  - `syncDecisions` étendu : inclut `id`, upsert par `id` (plus d'insert duplicates)
  - Nouveau `syncDecisionOutcome(id, outcome, comment)` — UPDATE by id
  - Nouveau `fetchDecisionsAwaitingOutcome(daysOld)` — query Supabase pour décisions pending

- `src/App.jsx`
  - Post-response : async `extractActionableDecision` → push `decision-logged` card inline + add to state + sync
  - Session start, Priority 0 : check `decisions` pour pending 30j+ → push `decision-reminder` card (cooldown 7j par décision)
  - `handleRecordDecisionOutcome(msgId, decisionId, outcome, comment)` handler : transforme reminder → confirmation in-place + sync cloud + toast
  - `runSession` reçoit maintenant `combinedSuffix` = maturity + track record (par focus agent). Agents voient leur propre historique.

- `src/components/ChatScreen.jsx` — 3 nouveaux composants :
  - `DecisionLoggedCard` — mini-card inline, 1 ligne compacte avec icon Flag
  - `DecisionReminderCard` — card avec 3 boutons colorés (positive emerald / neutral grey / negative red) + textarea contextuelle qui apparait après sélection
  - `DecisionOutcomeRecordedCard` — confirmation compact avec outcome + commentaire

### Cooldowns

- **Reminder cooldown** : `qg_decision_reminder_cooldowns_v1` localStorage, 7 jours par `decisionId` (si l'user ignore un reminder, il revient pas avant 7j)
- **Détection** : pas de cooldown — chaque turn peut logger une décision (mais Haiku confidence bar protège du over-logging)

### Le track record ciblé par agent

Chaque agent voit UNIQUEMENT ses OWN décisions passées. HORMOZI ne voit pas ce que CARDONE a suggéré. Pas de cross-contamination.

Exemple d'injection pour HORMOZI au turn 50 :
```
YOUR TRACK RECORD WITH SAMUEL (your past advice + what actually happened — calibrate accordingly):
  ✓ Feb 12: "Stack value bundle onboarding + 2 calls" — "Closed Dubé at 500/mo"
  ✗ Feb 28: "Launch $1500 tier above existing" — "Zero buyers in 30 days, abandoned"
  ~ Mar 15: "Shift to annual contracts only" — "2 closed, 3 pushed back, net neutral"
  ✓ Apr 02: "Add priority support tier $200/mo" — "3 current clients upgraded"

Rules for using this:
- If a past recommendation led to ✗ (negative outcome), don't blindly repeat it — acknowledge what didn't work and adjust.
- If ✓ patterns emerge, lean into what's been validated.
- Never mention this track record directly to Samuel. Just let it shape your judgment silently.
```

HORMOZI va maintenant éviter de re-suggérer "launch $1500 tier above existing" et va plus probablement suggérer des tiers de support (pattern ✓).

### Coût

- Détection post-response : **1 Haiku call par lead response ≥ 80 chars**, ~200 tokens → ~$0.00006 par call. 30 turns/jour × 30j = **~$0.05/mois**
- Reminder : 0$ (pure local check)
- Outcome submit : 0$
- Track record : 0$ (concaténation locale, juste du texte dans le prompt)

### Garde-fous anti-bruit

- Haiku confidence ≥ 0.75 pour logger
- Skip si response < 80 chars (too short for a real decision)
- Skip questions, observations, principles (liste explicite dans prompt)
- Skip multi-step plans (on track UNE décision, pas un plan)
- `decision-logged` cards sont mini (pas visuellement bruyantes)

### Known limitations
- Si Samuel ignore les reminders systématiquement, le track record stays empty — agents reviennent au mode générique
- Detection manque les décisions qui émergent d'un **dialogue** (ex: décision finale après 3 tours — chaque tour peut logger partiellement)
- Cross-agent insight absent : si HORMOZI et NAVAL ont des patterns complémentaires, ça reste silos
- Pas d'UI pour retirer une décision mal-detectée (User doit ignorer le reminder)
- Track record limité aux 8 dernières décisions avec outcomes — pas de poids temporel

### Added — Phase 3 — Plateau prediction (widget Trajectoire)
Nouveau widget Dashboard qui projette le MRR sur 90 jours selon 2 scénarios (trajectoire actuelle vs avec actions correctives) et détecte un plateau. Quand plateau détecté → Sonnet génère un diagnostic chiffré + 3 actions concrètes, ton Naval/Hormozi, zéro motivational.

### Math de détection (locale, pure function)

```js
currentMRR        = sum(retainers.amount)
newMRR/mo         = sum(retainers.amount where startedAt last 90d) / 3
growthRate        = newMRR/mo / currentMRR
avgOutreach/sem   = count(contactHistory entries last 30d) / 4.3
closingRate       = (Signé + Client actif) / (all contacted statuses)

isPlateau =
  currentMRR ≥ 500 AND
  retainerCount ≥ 2 AND
  growthRate < 5% AND
  (avgOutreach < 5/sem OR closingRate < 10%)
```

### Scenarios (projection 90 jours)

| Scénario | Formule |
|---|---|
| **Trajectoire actuelle** | `currentMRR + (newMRR/mo × 3)` |
| **Avec actions** | `currentMRR + (newMRR/mo × 3 × 2.4)` (2x outreach × 1.2x closing = 2.4x uplift) |

### Widget "Trajectoire"

3 variants selon l'état :

- **Pas assez de données** (< 2 retainers ou < $500 MRR) → message sobre "Pas assez de données pour projeter"
- **Croissance saine** (pas de plateau) → bandeau vert + 2 scénarios + ligne italique *"Tu ajoutes X retainers/mois en moyenne. Tiens le rythme."* (aucun LLM call)
- **Plateau détecté** → bandeau amber + Sonnet brief (diagnostic + 3 actions + scénarios prose)

### Cache 24h

`qg_plateau_brief_v1` en localStorage avec fingerprint `{currentMRR|retainerCount|newRate|outreach|closingRate}`. Si les données changent → invalidation automatique → re-génération. Sinon pas de re-call Sonnet pendant 24h.

### Ton strict (Naval/Hormozi blend)

Banned phrasings (prompt + regex post-gen) :
- *"Tu peux y arriver"*, *"Crois en toi"*, *"You got this"*
- *"N'abandonne pas"*, *"Garde le cap"*, *"Stay the course"*
- *"C'est normal d'avoir des plateaux"* (minimise)
- *"Attention"*, *"Warning"*, *"Alerte"*
- *"Travaille plus fort"*, *"Work harder"*, *"Stay focused"*
- Emojis

Structure imposée :
- `headline` : ≤ 80 chars, chiffrée
- `diagnostic` : 2 phrases, explique WHAT stagne et WHY les chiffres le disent
- `actions` : 3 items avec `title` (verbe + objet concret), `rationale` (pourquoi cette action vs bottleneck), `impact` ($ ou %)
- `scenarioCurrent` + `scenarioWithActions` : 1 phrase chacun avec chiffres

### Fichiers

- `src/utils/plateauForecaster.js` (**NEW**)
  - `computeForecast({retainers, prospects, followupCount30d, now})` — pure function
  - `makeForecastFingerprint(forecast)` — cache invalidation
  - `THRESHOLDS` constants centralisés pour tuning

- `src/api.js` — `generatePlateauBrief(forecast, lang)` — Sonnet JSON `{ headline, diagnostic, actions[], scenarioCurrent, scenarioWithActions }` avec regex guardrail

- `src/components/TrajectoryWidget.jsx` (**NEW**)
  - 3 variants : pas-assez-data / croissance-saine / plateau
  - Cache 24h avec fingerprint check
  - Scenarios strip partagé entre variants (left: actuel, arrow, right: avec actions)
  - Plateau variant : diagnostic + 3 action cards numérotées + scenarios prose

- `src/components/DashboardScreen.jsx`
  - Import + render `<TrajectoryWidget>` après `<RevenueBreakdown>`
  - Lit `hq_prospects` localStorage pour calculer closingRate + contactHistory count

### Exemple brief Sonnet cible (plateau détecté)

```json
{
  "headline": "$2,400 MRR depuis 3 mois, 2% de croissance. Le moteur cale.",
  "diagnostic": "Ton closing rate est à 8% et tu fais 3 outreach/semaine. Les deux sont sous le seuil — tu n'alimentes plus le haut du funnel et ce qui entre ne convertit pas.",
  "actions": [
    {
      "title": "Bloque 90 min/jour × 5 pour dialer — 10 calls/jour = 50/semaine",
      "rationale": "Triple ton volume sans changer le reste. Ton bottleneck #1 est le manque d'inputs.",
      "impact": "+$1,800 MRR sur 90j si closing tient 8%"
    },
    {
      "title": "Structure tes Démo : checklist 5 objections + slide prix fixe",
      "rationale": "Closing rate de 8% = problème de cadre, pas de volume. Enlève le live-quote.",
      "impact": "Closing 8% → 15% minimum"
    },
    {
      "title": "Cap prochain client à $750/mo minimum, pas $400",
      "rationale": "Ton MRR moyen tire vers le bas. Plus haut = moins de clients à trouver pour atteindre $5K.",
      "impact": "+$350/mo par nouveau retainer"
    }
  ],
  "scenarioCurrent": "Rythme actuel : $2,400 → ~$2,650 dans 90 jours (~10%).",
  "scenarioWithActions": "Avec les 3 moves : $2,400 → $3,800 sur 90 jours (+58%)."
}
```

### Coût
- Math local : $0
- Sonnet brief : **uniquement si plateau détecté**, ≤ 900 tokens = ~$0.003
- Cache 24h → max 1 call/jour même si user ouvre Dashboard 10x

### Known limitations
- **newMRR calculation** basé sur `retainers.startedAt` — si aucun retainer dans les 90 derniers jours, growthRate = 0 (peut faussement déclencher plateau si user vient de commencer)
- **Closing rate** dérivé de la distribution actuelle des prospects (pas un historique) — biaisé si le CRM est mal maintenu
- **followupCount30d** lu depuis `hq_prospects.contactHistory` local uniquement (pas Supabase `followup_log` dans ce patch — TODO futur)
- **Uplift multiplier** hardcoded à 2.4x (2x outreach × 1.2x closing) — simpliste, pas personnalisé
- **Pas de sensitivity analysis** : 1 scénario "with actions" uniquement, pas de "best/worst case"
- Cache invalidation ne détecte pas les changements de `followupCount30d` (seulement retainers) — peut rester stale si Samuel envoie des follow-ups sans toucher aux retainers

### Added — Phase 3 — Anomaly alerts (baisse > 40% semaine)
Détection automatique de baisses semaine-sur-semaine sur 3 axes business. Si drop ≥ 40% avec baseline meaningful → l'agent owner ouvre la session avec les chiffres + diagnostic + move concret. Ton direct, jamais alarmiste.

### Les 3 axes surveillés

| Axe | Source principale | Agent owner | Unité comptée |
|---|---|---|---|
| **Outreach** | `followup_log` Supabase + `hq_prospects.contactHistory` local | CARDONE | emails + touches prospect |
| **Pipeline activity** | `hq_prospects.lastContactAt` local | HORMOZI | prospects touchés dans la semaine |
| **MRR / finances** | `one_time_revenues` + `retainers.updated_at` Supabase + `dashboard.oneTimeRevenues` local | HORMOZI | nouveaux revenus + changements retainer |

### Seuils de déclenchement

- **MIN_BASELINE = 3** : la semaine précédente doit avoir ≥ 3 actions pour être comparable (évite alert sur 1→0)
- **DROP_THRESHOLD = 40%** : drop doit être ≥ 40% pour fire
- **COOLDOWN = 7 jours** par axe : une fois alerté, cet axe est mute pendant 7j (évite nagging)
- **Un seul axe alerté par session** : si plusieurs axes en drop, pick le plus sévère (% le plus élevé)

### Priorité au session start (nouvelle cascade)

```
1. Anomaly alert (baisse > 40% détectée)    [NEW — top priority]
2. Meeting Room pattern opening              [existant]
3. Fil Rouge                                  [existant, sessions 4+]
4. Locked teaser                              [existant, sessions 1-3]
```

Si anomaly fire, `briefingLockedRef.current = true` → toutes les couches inférieures skip.

### Fichiers

- `src/utils/anomalyDetector.js` (**NEW**)
  - `detectAnomalies(sources, now)` — pure function, returns array sorted by severity desc
  - `pickTopAnomaly(sources, now)` — convenience wrapper
  - `getWeekWindows(now)` — compute current/previous week boundaries
  - Cooldown store `qg_anomaly_cooldowns_v1` : `{ axis: { firedAt } }`
  - Counters par axe : `countOutreach`, `countPipelineActivity`, `countMrrActivity`
  - Robust : accept both Supabase rows (ISO timestamps) and localStorage entries (number timestamps)

- `src/lib/sync.js`
  - `fetchWeeklyFollowups(sinceTs)` — Supabase `followup_log.sent_at >= sinceTs`, limit 500
  - `fetchWeeklyOneTimeRevenues(sinceTs)` — idem sur `one_time_revenues.date`, limit 200
  - `fetchWeeklyRetainerChanges(sinceTs)` — idem sur `retainers.updated_at`, limit 200
  - Tous fire-and-forget : return `[]` sur échec / RLS / table missing / Supabase disabled

- `src/api.js` — `generateAnomalyAlert(anomaly, lang)` — Sonnet dans la voix de l'agent owner
  - Prompt strict : **numbers FIRST**, 2-3 phrases max, ≤ 55 mots
  - Liste de banned phrasings regex : *"attention"*, *"alerte"*, *"inquiétant"*, *"je remarque"*, *"je voulais te parler"*, etc.
  - 5 exemples concrets de ton cible dans le prompt

- `src/App.jsx`
  - Dans `startSession()`, nouveau bloc async PRIORITÉ 1 avant Meeting Room
  - Fetch 3 Supabase sources en parallèle via `Promise.all`
  - `pickTopAnomaly()` + `generateAnomalyAlert()` → push agent message
  - `markAxisFired(axis, now)` → set cooldown 7j
  - Set `briefingLockedRef.current = true` pour lock les couches inférieures

### Ton ciblé — exemples

| Axe en drop | Voix | Exemple cible (généré par Sonnet) |
|---|---|---|
| Outreach | CARDONE | *"2 prospects contactés cette semaine vs 11 la semaine passée. Ton pipeline apprend vite ce qui ne lui arrive pas. Bloque 90 minutes demain matin pour dialer."* |
| Pipeline | HORMOZI | *"1 mouvement pipeline cette semaine vs 8. Ça se voit dans la vitesse de signature qui suit. Review ta liste Chaud + Démo aujourd'hui avant 18h."* |
| MRR | HORMOZI | *"Zéro nouveau revenu cette semaine vs 2 retainers ajoutés la précédente. Pas une spirale mais un signal — ton offer peut-être mal positionnée. Rappelle 3 prospects Démo."* |

### Règles anti-alarmiste (stricts dans prompt + regex post-gen)

Banned phrasings :
- "Attention", "Alerte", "Watch out", "Warning"
- "Inquiétant", "Concerning", "Worrying", "Problème"
- "Je remarque", "J'observe", "I notice"
- "Je voulais te parler de", "I wanted to talk about"
- "Ne t'inquiète pas", "Don't worry"
- "Tout n'est pas perdu"
- Pep talk / motivational closing

Structure imposée : **chiffres en ouverture → 1 observation → 1 move concret**.

### Coût
- 3 queries Supabase par session start (parallèles, léger — limit 500/200/200)
- 1 Sonnet call seulement si anomaly fire (≤ 300 tokens)
- Estimé : **~$0.001 / session** quand anomaly fire, $0 sinon

### Known limitations
- Si 2 axes drop simultanément avec même sévérité, un seul alerté (le premier en ordre arbitraire)
- Pipeline activity utilise `lastContactAt` comme proxy — moins précis qu'un vrai log de status changes
- Cooldown 7j hardcoded (pas user-settable)
- Pas de "trend over N weeks" — comparaison binaire semaine actuelle vs précédente seulement
- MRR axis peut être trompé : si Samuel ajoute 5 retainers la semaine X puis 0 la semaine suivante = alert même si normal
- Si Supabase pas configuré, detection fallback localStorage uniquement : outreach reste viable (contactHistory), pipeline viable (lastContactAt), MRR partial (pas d'historique)

### Added — Phase 3 — 3 couches de présence organique
Trois mécanismes qui rendent la conversation "vivante" — les agents écoutent en silence et interviennent seulement quand c'est pertinent, jamais sur un calendrier mécanique.

### Layer 1 — L'Agent Observateur
Après qu'un agent lead réponde, une passe Haiku (`analyzeInterjection`) scanne la conversation. Si un agent non-lead détecte un signal dans le message user que le lead a manqué (hésitation émotionnelle, opportunité cachée, contradiction), il intervient **une fois** brièvement, puis se retire.
- Exemple : Hormozi parle pricing → user hésite → Voss intervient avec une observation sur la tactical empathy → Hormozi reprend au tour suivant.
- Règle : jamais 2 interjections d'affilée (cooldown 30s), jamais l'agent lead lui-même.

### Layer 2 — Le Fil Rouge
**Remplace** le Morning Briefing structuré par défaut (trop rapport). Au lieu d'une card à 4 sections, un **seul agent** tisse en UNE phrase la continuité avec la session précédente.
- Activé à partir de la session 4 (avant = locked teaser "learning")
- Pris en charge par l'agent dont le domaine correspond au dernier sujet non résolu
- Exemple : *"La dernière fois t'étais bloqué sur le pricing de Dubé. T'as dormi là-dessus ?"*
- Ton : collègue qui entre au bureau, pas un système qui fait un rapport

### Layer 3 — La Pression Silencieuse
Utilise la même passe `analyzeInterjection` que Layer 1 mais trigger différent : si un topic critique n'a pas été mentionné depuis trop longtemps, l'agent pertinent le glisse naturellement dans la conversation en cours.

| Topic | Agent | Threshold |
|---|---|---|
| prospection | CARDONE | 5 jours |
| pipeline | HORMOZI | 7 jours |
| finances | HORMOZI | 10 jours |
| content | GARYV | 10 jours |
| strategy | NAVAL | 14 jours |
| negotiation | VOSS | 14 jours |

Détection par keywords FR+EN dans chaque message user ET agent. Tracking localStorage (`qg_topic_tracker_v1`).

### Règles anti-mécanique (stricts)

Toutes les 3 couches partagent des guardrails :
- **Regex post-génération** bannit : *"Je remarque"*, *"J'observe"*, *"Depuis X jours"*, *"En passant"*, *"Petit point"*, *"Je te glisse"*, *"I'd just add"*, *"By the way"*, *"Real quick"*, *"Si je peux me permettre"*, etc.
- **Confidence bar** : 0.70 pour Layer 1 (observer), 0.65 pour Layer 3 (silent pressure), 0.50 pour Fil Rouge
- **Domain check** : l'agent interject reste dans son domaine (VOSS négocie, HORMOZI chiffre)
- **Content must be NOVEL** : prompt interdit de rephraser le lead
- **Max 150 chars** pour interjection, ≤ 140 chars pour Fil Rouge
- **Silence acceptable** : si unsure → shouldInterject=false. Mieux rien qu'un faux pas

### Fichiers

- `src/utils/topicTracker.js` (**NEW**)
  - `TOPICS` config avec keywords FR+EN + agent owner + threshold per topic
  - `updateTopicTracker(text)` scan + mark every detected topic
  - `getStaleTopics(now)` returns topics older than their threshold, sorted by staleness desc
  - `markTopicMentioned(key)` / `getLastMention(key)` helpers
  - localStorage `qg_topic_tracker_v1`

- `src/api.js`
  - `generateFilRouge({lastSession, memories, lang})` — Sonnet, ONE sentence ≤ 140 chars, agent-voice selection by domain of last unresolved topic
  - `analyzeInterjection({leadAgent, userMessage, leadResponse, staleTopics, lang})` — Haiku JSON, unifies Layer 1 (observer) + Layer 3 (silent pressure) triggers, returns null OR `{agent, content, trigger}`
  - 5 "good tone" + 5 "bad tone" examples in Fil Rouge prompt for calibration

- `src/App.jsx`
  - `startSession` : sessions ≥ 4 use Fil Rouge (pushed as normal agent message, not a card). Sessions 1-3 keep locked teaser. Meeting Room pattern still has priority.
  - `sendMessage` :
    - Topic tracker updated on user text AND on all agent responses (includes lead + supporting)
    - After lead response, if no supporting agent spoke AND not in focus/prep/neg/analysis/debate mode AND not in cooldown → run `analyzeInterjection`. If positive, push a second agent message after a 400ms visual beat.
    - `interjectCooldownRef` prevents back-to-back (30s lockout)

### Comment Layer 2 (Fil Rouge) remplace le Morning Briefing

Avant :
```
Session 7+ → Morning Briefing card structurée (Emails / Cal / Next / Prospect)
```

Maintenant :
```
Session 4+ → Fil Rouge agent message (1 phrase continuité narrative)
```

La card structurée reste dans le code (backward compat, au cas où) mais n'est plus push par défaut. Le Fil Rouge feel moins "système" et plus "humain".

### Flow complet au session start

```
Session start
  ↓
Meeting Room pattern check (critical patterns)
  ├─ fire → agent opens on pattern (existing)
  └─ no fire → 
      ↓
  Sessions 1-3? → locked teaser card (learning)
  Sessions 4+ ? → Fil Rouge (1-sentence narrative)
```

### Flow par turn

```
User sends message
  ↓ updateTopicTracker(user text)
  ↓ Lead agent responds (streaming)
  ↓ updateTopicTracker(agent responses)
  ↓ analyzeInterjection (Haiku, 1 shot)
  ├─ shouldInterject=true → push 2nd agent message after 400ms beat
  └─ shouldInterject=false → silence, done
  ↓ interjectCooldownRef lockout 30s
```

### Coût
- Fil Rouge : 1 Sonnet call par session start où session ≥ 4 → ~$0.002 / session
- Interjection : 1 Haiku call par turn → ~$0.0003 / message
- Topic tracker : 0$ (localStorage pur)

Total estimé : **< $0.10 par mois** en usage normal.

### Known limitations
- Focus / prep / negotiation / analysis / debate modes n'ont pas d'interjection (par design — ils ont des logiques d'agents dédiés)
- Topic tracker basé sur keywords : peut rater un sujet nuancé ("j'ai parlé au client" ne match pas "prospection")
- Le Fil Rouge ne se déclenche que s'il y a du contenu à relayer (sinon silence)
- Interject cooldown est global (30s) — si l'user pose une question complexe nécessitant plusieurs perspectives, une seule interjection par turn max
- La Pression Silencieuse peut fire sur plusieurs topics simultanément mais Haiku n'en choisit qu'UN (le plus prioritaire)

### Added — Phase 3 — Salle de réunion (onboarding organique + pattern overrides)
Le comportement des agents s'adapte maintenant à la **maturité** de la relation avec Samuel (phase) ET peut être override par des **patterns négatifs** détectés automatiquement. L'objectif : ne jamais se sentir mécanique, toujours "lire la pièce".

### Couche A — Maturity phase (toujours active)

| Sessions | Phase | Comportement par défaut |
|---|---|---|
| 1-3 | `foundational` | Agents dirigent, posent les fondations, questions fondatrices |
| 4-7 | `dialogue` | Dialogue progressif, espace donné à l'user |
| 8-15 | `partnership` | Réactifs sauf signal clair, peer-to-peer, brief |
| 15+ | `reactive` | Liberté totale, n'interviennent que sur patterns critiques |

Suffix injecté dans chaque prompt agent via `runSession` → modulation invisible mais perceptible par l'utilisateur (ton, rythme, initiative).

### Couche B — Pattern-triggered proactive opening (override)

Au démarrage de session, Haiku scanne memories + 5 dernières sessions + retainers + pipeline. Si un pattern négatif crosse la barre de sévérité de la phase en cours ET n'est pas en cooldown → l'agent pertinent **ouvre la session** avec un message naturel.

**8 patterns catalogués :**

| Pattern | Agent qui ouvre | Trigger |
|---|---|---|
| `avoidance_prospection` | CARDONE | Aucune mention prospection sur 3+ sessions |
| `repeated_block` | ROBBINS | Même blocage dans 3+ sessions sans résolution |
| `decision_without_execution` | HORMOZI | Consensus action 2+ sessions passées sans suivi |
| `energy_drop` | ROBBINS | Mots "fatigué/saturé/stuck" dans 2+ sessions récentes |
| `ignored_opportunity` | CARDONE | Prospect Chaud/Démo/Répondu sans contact > 14j |
| `stale_retainer` | VOSS | Retainer actif sans activité > 30j (churn risk) |
| `silence_on_long_term` | NAVAL | Pas de vision long-terme depuis 10+ sessions |
| `content_stall` | GARYV | Pas de contenu/brand depuis 5+ sessions |

### Règles anti-mécanique (strictes dans le prompt d'ouverture)

Interdictions explicites — si Sonnet produit un de ces phrasings, rejet automatique :
- "Je remarque que..." / "J'observe que..." / "I notice..."
- "Pattern détecté" / "Signal observé"
- "Depuis X jours..." stated comme un compteur mécanique
- "Je voulais te parler de..." / "On doit parler de..."
- Sentence structures qui ressemblent à un system report
- Opening avec une question (il faut entrer avec un POINT)

Guardrails de sécurité :
- Guardrail 1 : regex check post-génération qui rejette les phrasings bannis
- Guardrail 2 : confidence ≥ 0.7 pour surfacer un pattern
- Guardrail 3 : sévérité minimum monte avec la phase (medium en early, high en `reactive` 15+)

### Cooldown anti-repeat

- Chaque pattern type stocké dans `qg_meeting_room_state_v1` avec `lastFiredAt`
- Même pattern bloqué pendant **3 sessions** suivantes (Cardone ne harcèle pas)
- Prune automatique des entrées > 100 sessions pour éviter unbounded growth

### Fichiers

- `src/utils/meetingRoom.js` (**NEW**)
  - `getMaturityPhase(sessionCount)` → `{ phase, behaviorSuffix, minSeverityForIntervention }`
  - `isPatternCooledDown()` / `markPatternFired()` / `pruneCooldowns()`
  - `pickBestPattern(patterns, sessionCount, maturity)` respecte cooldown + phase severity bar
- `src/api.js`
  - `detectMeetingPatterns({sessionCount, memories, recentSessions, retainers, prospects, lang})` — Haiku JSON, 8 types de patterns, confidence ≥ 0.7, max 3 retournés
  - `generateAgentOpening({agent, pattern, maturity, lang})` — Sonnet dans la voix de l'agent + règles strictes anti-robot + guardrail regex post-gen
  - `runSession` nouveau param `maturitySuffix` injecté dans leadSystem + supportSystem
- `src/App.jsx`
  - `startSession` : async détection patterns + proactive opening AVANT briefing. Si pattern fire → push agent message + suppress briefing via `briefingLockedRef`
  - `sendMessage` : injection `maturitySuffix` dans `runSession` pour moduler le comportement de chaque réponse agent selon la phase

### Pourquoi ça ne casse pas le feeling

1. **Aucune UI spéciale** — c'est un message agent comme les autres, streamé avec le même style
2. **Aucune annonce** — `meta.source = 'meetingRoom'` pour debugging, mais jamais affiché à l'user
3. **Cooldown** — pas de martellement
4. **Severity bar adaptatif** — session 15+ ne voit que les critical, jamais de micro-alertes
5. **Phase 15+ reactive** — les agents partent en retrait par défaut. Silence si rien d'urgent.

### Coût
~$0.003 par session start quand patterns détectés (1 Haiku detect + 1 Sonnet opening). ~$0 quand silence (Haiku est le seul call, et retourne vite en no-match).

### Known limitations
- Cooldown partagé entre toutes les sessions (pas per-context)
- Pas de feedback loop : si l'user rejette l'opening, pas de signal pour ajuster
- Memory Viewer ne distingue pas visuellement les "source" des mémoires qui déclenchent les patterns
- Maturity suffix actuellement appliqué dans leadSystem + supportSystem SEULEMENT (pas dans les modes specialty : prepCall, negotiation, analysis, debate — à étendre si besoin)

### Added — Phase 3 — Follow-up batch NLP
Une commande naturelle *"relance tous les prospects sans réponse depuis 7 jours"* déclenche maintenant une génération parallèle de relances personnalisées pour chaque prospect éligible du CRM. Samuel review/édite chaque message puis envoie par batch ou individuellement. Chaque envoi met à jour le prospect (`lastContactAt` + `contactHistory`) et log dans Supabase.

### Flow

```
"relance tous les prospects sans réponse depuis 7 jours"
  ↓ Haiku extractBatchFollowupIntent → { daysThreshold, statusFilter, confidence }
  ↓ Filter hq_prospects: email exists + status in [Contacté/Répondu/Chaud/Démo] + days≥threshold
  ↓ Cap 20 prospects, chunk par 5 pour Sonnet generateFollowupMessage (parallel)
  ↓ Push batch-followup-preview card avec checkboxes + editable per-item
  ↓ User action :
     ├─ Send all selected → sequential Gmail sends (délai 500ms anti-spam)
     └─ Per-item Send → 1 email + log
  ↓ Per success : prospect.lastContactAt = now + contactHistory entry + syncFollowupLog
  ↓ Toast récap : "X envoyés · Y échecs"
```

### Fichiers

- `src/api.js`
  - `extractBatchFollowupIntent(text, lang)` — Haiku JSON `{isBatchFollowup, daysThreshold, statusFilter, confidence}`. Parse "semaine"=7, "2 semaines"=14, "mois"=30. Default statusFilter exclut Signé/Client actif/Perdu.
  - `generateFollowupMessage(prospect, {daysSinceContact, lang})` — Sonnet JSON `{subject, body}`. Ton status-adapté (Contacté=re-engage léger, Démo=direct post-démo). Règles strict : pas de "j'espère que tu vas bien", pas de fausse urgence, ONE concrete ask, sign off "Samuel".

- `src/App.jsx`
  - `BATCH_FOLLOWUP_TRIGGERS` bilingue (*"relance tous"*, *"batch relance"*, *"ghostés"*, *"follow up all"*, etc.)
  - Détection + filtrage + parallel gen chunked par 5
  - `handleBatchFollowupSend(msgId, {items, batchId})` — Gmail sequential avec 500ms entre chaque envoi, update `prospect.lastContactAt` + push `contactHistory`, fire `syncFollowupLog` par item (succès et échecs)
  - Messages system si aucun prospect éligible / aucun prospect dans CRM

- `src/lib/sync.js` — `syncFollowupLog({id, prospectId, prospectName, subject, body, sentAt, batchId, status, sessionId})` fire-and-forget

- `src/components/ChatScreen.jsx` — `BatchFollowupCard` avec 3 variants :
  - `batch-followup-loading` : header violet + spinner + "Génération de N relances…"
  - `batch-followup-preview` : header count + "silence ≥ Xj" + select-all strip + liste éditable (checkbox + nom + business + status pill + days + expand/collapse + per-row Send) + footer "Envoyer N sélectionnés"
  - `batch-followup-applied` : résumé vert "X envoyés · Y échecs" + chips nommés colorés par statut

### SQL à exécuter dans Supabase
```sql
CREATE TABLE IF NOT EXISTS followup_log (
  id             text PRIMARY KEY,
  prospect_id    text,
  prospect_name  text,
  subject        text,
  body           text,
  sent_at        timestamptz DEFAULT now(),
  batch_id       text,
  status         text,                        -- 'sent' | 'failed' | 'skipped'
  session_id     bigint,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_prospect ON followup_log (prospect_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_batch    ON followup_log (batch_id);
```
Sans ce SQL, la feature fonctionne 100% (localStorage source truth) — juste pas de backup cloud.

### Règles de filtrage par défaut

| Statut prospect | Inclus ? |
|---|---|
| Incomplet | ❌ |
| Cible | ❌ |
| Prêt | ❌ |
| Contacté | ✅ |
| Répondu | ✅ |
| Chaud | ✅ |
| Démo | ✅ |
| Signé | ❌ |
| Client actif | ❌ |
| Perdu | ❌ |

L'utilisateur peut override via phrasing explicite : *"relance les prospects en démo"* → Haiku retourne `statusFilter: ["Démo"]`.

### Safeguards anti-spam
- **Cap 20 prospects** par batch (beyond ça = probablement pas une intention légitime)
- **Délai 500ms** entre chaque `gmailService.sendEmail` — échelonne la charge Gmail
- **401 UNAUTHORIZED** → stop immédiat + toast, pas d'envoi en cascade
- **Update prospect localStorage AVANT next iteration** → même batch ne peut pas re-contacter un prospect déjà touché si relancé quickly

### Known limitations
- Pas d'annulation en cours de batch (trust Gmail queue)
- Cap 20 hardcoded (pas réglable user-side)
- Pas de preview de la façon dont l'email sera rendu chez le prospect (raw text)
- `contactHistory` entry simplifiée — type='followup' + note standard, pas d'AI-enrichie
- Pas encore de dashboard pour lire le `followup_log` Supabase (scope future)

### Added — Phase 3 — Morning briefing conditionnel (session 7+)
Le démarrage de session affiche maintenant un briefing du matin qui s'adapte à l'ancienneté de l'utilisateur. En dessous de 7 sessions, Samuel voit un **teaser "learning mode"** avec progress bar vers le déverrouillage. À partir de session 7, un **briefing complet 4 sections** est généré depuis Mem0 + Gmail + Calendar + retainers + dernière session.

**Pourquoi conditionnel :** un briefing généré sans historique → filler générique *"tu as bien travaillé hier"*. Avec ≥ 7 sessions, Mem0 a assez de signal pour nommer des personnes, des deals, des blockers spécifiques.

### Les 3 variants de la card

| Session | Variant | Contenu |
|---|---|---|
| 1 | — | Skip (aucun historique) |
| 2-6 | `briefing-locked` | *"Les agents apprennent à te connaître — X sessions avant ton premier briefing personnalisé."* + progress bar X/7 |
| 7+ | `briefing-ready` | 4 sections colorées : **Emails** (emerald) · **Calendrier** (gold) · **Prochain move** (indigo) · **Prospect à relancer** (red) |

### Sources agrégées (session 7+)

- **Mem0** — memories long-terme (max 8)
- **Gmail** — top 3 unread business (filtré par `isBusinessEmail`)
- **Calendar** — next 5 events des 14 prochains jours
- **Dashboard** — retainers triés par staleness (`lastTouchedAt` oldest first)
- **Session history** — consensus + keyDecisions de la dernière session

### Fichiers modifiés

- `src/api.js` — nouvelle fonction `generateMorningBriefing({memories, lastSession, retainers, emails, calendarEvents, lang})` — Sonnet JSON, ≤ 100 chars par field, ≥ 2 fields requis, confidence ≥ 0.5 sinon drop
- `src/components/ChatScreen.jsx` — nouveau composant `MorningBriefingCard` (3 variants locked/loading/ready) + helper `BriefingLine`
- `src/App.jsx` — logique conditionnelle dans `startSession()` remplace l'ancien memory-recap flow par le briefing. `BRIEFING_UNLOCK_AT = 7`. L'ancien `MemoryRecapCard` reste dans le code pour rétrocompat mais n'est plus appelé au démarrage

### Known limitations
- Pas de replay/persistance du briefing (one-shot par session)
- Threshold 7 hardcoded (futur : setting user)
- Si Mem0 disabled, session 7+ = pas de briefing du tout (pas de fallback teaser)

### Added — Phase 3 — Workflow Builder V1
Nouvelle section accessible depuis la nav (icon Wrench). Samuel pick un template → répond à 5 questions → QG génère un package complet en parallèle : **JSON Make.com prêt à importer + guide d'installation + sales script NT Solutions avec pricing auto**. Export PDF brandé.

**Pourquoi cette approche :** les skeletons Make.com sont pré-validés en dur (module types, versions, connections). Le LLM **ne remplit que les {{PLACEHOLDERS}}** — jamais la structure. Résultat : JSON toujours importable dans Make.com, zéro risque d'hallucination structurelle.

### 4 templates V1
| Template | Description | Complexité base |
|---|---|---|
| ⭐ Réponses avis Google | Webhook GBP → Claude rédige → Gmail d'approbation | 3 |
| 🎯 Relance prospects auto | Sheets trigger → séquence 2 emails + Claude perso | 5 |
| 💸 Facturation auto | Stripe → invoice + welcome email + Notion ledger | 4 |
| 📞 Répondeur intelligent | Twilio missed call → Whisper → Claude → SMS + notif | 7 |

### Pricing automatique (local, pas de LLM)
Score de complexité = `template_base + volume_score + tools_count`, multiplié par `industry_weight` (Restaurant 1.0, Pro services 1.4, E-commerce 1.5, SaaS 1.6).

4 tiers :
- **Starter** (score < 5) : $600-1200 setup · $150-300/mo retainer
- **Pro** (score < 9) : $1500-3000 setup · $400-800/mo
- **Enterprise** (score < 13) : $3500-6500 setup · $900-1800/mo
- **Custom** (score ≥ 13) : $6500-12000+ setup · $1800-3500+/mo

Budget alignment check : alerte amber/rouge si le budget déclaré est en-dessous du tier calculé. Samuel voit *"Budget serré — vends le ROI en priorité"* avant de pitch.

### Fichiers

- `src/data/workflowTemplates.js` (**NEW**) — 4 templates avec skeletons Make.com valides (double-curly Make refs préservés)
- `src/utils/workflowPricing.js` (**NEW**) — `computePricing()`, `budgetAlignment()`, multiplicateurs industrie
- `src/utils/workflowPdf.js` (**NEW**) — export jsPDF avec cover page brandée + 3 sections (guide / script / JSON en courier)
- `src/api.js`
  - `generateWorkflowPackage({answers, template, pricing, lang})` — 3 calls parallèles via `Promise.all`
  - **Haiku** pour le JSON fill (mécanique, strict rules pour ne pas muter la structure)
  - **Sonnet** pour le guide d'installation markdown (étape par étape, non-dev friendly)
  - **Sonnet** pour le sales script (tone CARDONE — direct, chiffré, ROI)
- `src/components/WorkflowBuilder.jsx` (**NEW**)
  - State machine : `picker` → `questioning` → `generating` → `results`
  - Picker : 4 cards templates (hover scale 1.015 comme mode cards)
  - Q&A : 5 questions séquentielles, inputs typés (`text` / `number` / `select` / `multi`), progress bar en haut, back entre questions
  - Generating : spinner + message "3 documents en parallèle"
  - Results : pricing card gold + 3 tabs (JSON / Guide / Script) avec copy buttons + bouton Export PDF principal
- `src/components/Header.jsx`
  - Icon `Wrench` ajoutée conditionnellement sur `onGoWorkflow` prop
- `src/App.jsx`
  - Routing `screen === 'workflow'` avec scroll overflow
  - Handler `onGoWorkflow` qui toggle depuis n'importe quel écran

### Export PDF
- Cover page sur fond navy brand avec emoji template + nom client + industrie + tier + pricing chiffré
- Section 1 : Guide d'installation (Helvetica, paragraphes)
- Section 2 : Script de vente + pricing appendix
- Section 3 : JSON Make.com en **Courier** monospace pour lisibilité
- Pagination + footer "NT Solutions · Workflow package · page X"
- Nom fichier : `NTSolutions_{template_id}_{client_name}.pdf`

### Known limitations V1
- Pas de workflow "Custom" (free-form) — seulement les 4 templates (à venir V2)
- Pas de validation live du JSON contre l'API Make.com — trust du skeleton pré-validé
- Pas de sauvegarde cloud des workflows générés (pas de table Supabase pour ça encore)
- Pas d'historique — re-générer à chaque fois
- Pricing basé sur heuristiques locales, pas sur données marché réelles
- JSON placeholders type `REPLACE_ME_GBP_LOCATION_ID` sont laissés en literal pour que l'user les configure manuellement dans Make.com

### Changed — Voice STT : Web Speech API → OpenAI Whisper
La transcription vocale passe de l'API browser native à **OpenAI Whisper** — qualité de transcription niveau ChatGPT, support **Firefox natif** (fini le gap browser), et excellent français canadien.

**Pourquoi le changement :**
- ❌ Web Speech API ne fonctionnait pas sur Firefox
- ❌ Qualité variable sur noms propres (Dubé, ElevenLabs, NT Solutions)
- ❌ Dépendait des moteurs vocaux OS (inconsistant cross-device)
- ✅ Whisper : qualité uniforme partout, FR-CA natif, prompt hint bias vocabulaire brand

**Flow :**
```
Click mic
  → MediaRecorder (audio/webm opus)
  → Click mic stop
  → Blob POST /api/whisper (multipart form-data)
  → Proxy injecte Authorization: Bearer $OPENAI_API_KEY
  → Whisper répond texte précis
  → Insertion dans input
```

**Coût :** $0.006/minute de Whisper. Une phrase typique de 10s = ~$0.001. Budget mensuel typique < $1.

- `api/whisper.js` (**NEW**) — Vercel serverless proxy
  - Buffer le body multipart (≤ 25 MB), forward à OpenAI avec Auth server-side
  - `bodyParser: false` pour preserve le multipart boundary
  - CORS activé pour l'app déployée
- `vite.config.js`
  - Nouvelle route `/api/whisper` → `https://api.openai.com/v1/audio/transcriptions`
  - Injecte `Authorization: Bearer ${OPENAI_API_KEY}` server-side (pas de touch au Content-Type)
- `.env.example`
  - Ajout `OPENAI_API_KEY` (**sans** préfixe `VITE_` — server-side uniquement)
  - Documentation sécurité explicite : la clé n'atteint jamais le browser
- `src/utils/voice.js`
  - **Supprimé** : `createRecognition`, `isSTTSupported` (Web Speech)
  - **Ajouté** : `isMicSupported`, `createAudioRecorder({lang, onStart, onTranscribing, onFinal, onError, onStop})`
  - Pick automatique du meilleur codec : `audio/webm;codecs=opus` préféré, fallbacks mp4/ogg
  - Whisper prompt hint bilingue avec brand words (NT Solutions, Bouclier 5 Étoiles, noms agents, etc.) pour biaiser la transcription des mots spécifiques
  - Config Whisper : `model=whisper-1`, `temperature=0`, `response_format=json`, `language=fr|en`
  - **TTS intacte** (speechSynthesis natif, profils agents, cleanForSpeech) — zéro changement
- `src/components/ChatInput.jsx` + `GlobalFloatingInput.jsx`
  - Micro passe de 2 à **3 états** : `idle` (grey) → `recording` (red pulse) → `transcribing` (indigo spinner)
  - Bouton disabled pendant transcription pour éviter double-click
  - Focus textarea restauré après insertion du texte final

### Trade-offs vs Web Speech API

| | Web Speech | Whisper |
|---|---|---|
| Qualité FR-CA | Variable (OS-dependent) | Excellente |
| Firefox | ❌ | ✅ |
| Latence | ~instant (streaming) | 1-3s (post-enregistrement) |
| Live interim transcript | ✅ | ❌ (pas de streaming) |
| Coût | Gratuit | $0.006/min |
| Précision noms propres | Faible | Haute (prompt hint) |
| Privacy | Cloud du browser (Google/Apple) | OpenAI (via ton API key) |

### ⚠ Setup obligatoire
Ajouter dans `.env` :
```
OPENAI_API_KEY=sk-proj-your-key-here
```
**PAS** de préfixe `VITE_` — cette clé est strictement server-side. Le proxy Vite + Vercel serverless la lit via `process.env`. Le browser ne la voit jamais.

Restart `npm run dev` pour que Vite charge la nouvelle config de proxy.

### Known limitations
- Latence 1-3s vs instant — OK pour transcription précise, pas streaming
- Besoin d'une connexion réseau (sinon Web Speech aurait fonctionné offline sur Chrome)
- 25 MB max par requête (~100 min de parole — irréaliste d'atteindre)
- Permission micro requise à chaque session navigateur si l'user l'a refusée

### Added — Phase 3 — Voice mode (STT + TTS par agent)
Tu peux maintenant parler à QG et le laisser te répondre à voix haute. Mic dans le ChatInput et le GlobalFloatingInput. Toggle "Voix" dans le header active le TTS sur chaque réponse d'agent — **chaque agent a sa propre voix** (rate + pitch distincts pour respecter leur personnalité).

**Stack :** Web Speech API native du browser — zéro dépendance, zéro coût API, tout tourne côté client.

- `src/utils/voice.js` (**NEW**)
  - `isSTTSupported()` / `isTTSSupported()` — feature detection
  - `createRecognition({lang, onInterim, onFinal, onError, onEnd})` — STT controller
  - `speak(text, {agent, lang})` / `cancelSpeech()` / `isSpeaking()` — TTS
  - `getVoices()` — async fetch de la liste de voix système (voiceschanged event)
  - `AGENT_VOICE_PROFILES` :
    | Agent | Rate | Pitch | Feel |
    |---|---|---|---|
    | HORMOZI | 0.98 | 0.85 | calme + précis |
    | CARDONE | 1.15 | 1.05 | rapide + énergique |
    | ROBBINS | 0.92 | 0.90 | lent + grave |
    | GARYV | 1.20 | 1.00 | rapide haute énergie |
    | NAVAL | 0.88 | 0.82 | lent + philosophique |
    | VOSS | 0.90 | 0.78 | lent + grave (calm) |
    | SYNTHESIZER | 1.00 | 1.00 | neutre |
    | COORDINATOR | 1.05 | 0.95 | neutre-calme |
  - `cleanForSpeech()` strip markdown + emojis + code blocks avant TTS (évite que la voix lise "astérisque astérisque")
  - Voice picking : filtre par locale (fr/en), match par `voiceHints` (substring sur voice.name), fallback `localService` puis `pool[0]`

- `src/components/ChatInput.jsx`
  - Import icons `Mic` + `MicOff`
  - State `recording` + `recRef`, `preRecordingTextRef` pour reprendre depuis le texte déjà tapé
  - Pendant capture : interim results fill le textarea en live, final remplace
  - Silence auto-stop natif browser ; user peut re-cliquer pour force-stop
  - Bouton : red pulse + boxShadow ring quand recording, disabled si unsupported (Firefox) ou isLoading

- `src/components/GlobalFloatingInput.jsx`
  - Même pattern mic, bouton 28×28 à côté du send button
  - Red pulse identique

- `src/components/Header.jsx`
  - Import `Volume2` + `VolumeX`
  - Nouveau toggle "Voix" (props `voiceMode` + `onToggleVoice`), accent indigo
  - Glow box-shadow quand ON

- `src/App.jsx`
  - State `voiceMode` + persistance `qg_voice_mode_v1`
  - `lastSpokenMsgIdRef` évite double-speak sur re-render
  - Effet watch `messages` : pour chaque nouveau agent message `streaming: false` != ref, `speak()` avec profil de l'agent
  - Cancel automatique : nouveau message user, session end, voiceMode OFF
  - Prop drill `voiceMode` + `onToggleVoice` vers Header

### Browser support

| Browser | STT | TTS | Notes |
|---|---|---|---|
| Chrome desktop | ✅ | ✅ | Requires HTTPS (localhost OK) |
| Edge | ✅ | ✅ | idem |
| Safari iOS 14.5+ | ✅ | ✅ | Requires HTTPS, PWA friendly |
| Safari macOS | ✅ | ✅ | |
| Firefox | ❌ STT | ✅ TTS | Mic button disabled with tooltip |
| Android Chrome | ✅ | ✅ | |

### Known limitations
- **Firefox** : pas de STT → bouton mic désactivé (icon MicOff + tooltip)
- **Langue fixe** : STT utilise la langue active de l'app (`lang`). Switch lang en pleine capture ne prend effet qu'au prochain démarrage
- **Voix système** : profils agents réussissent si l'OS a des voix FR/EN de qualité installées (macOS/iOS ont Daniel, Thomas, Samantha ; Windows a Paul, Hortense, Julie ; Linux dépend du TTS engine)
- **Fallback voix** : si aucune voix du hint match, utilise la première voix locale de la bonne locale — le pitch/rate distingue quand même les agents
- **Long responses** : 500 tokens agent peut prendre ~60s à parler ; user peut tout interrompre en tapant/parlant

### Added — Phase 3 — PWA installable + notifications natives
QG est maintenant installable comme une app native sur iOS, Android et Desktop. Prompt d'installation automatique sur Android, hint "Ajouter à l'écran d'accueil" sur iOS. Les emails urgents déclenchent une **notification native du système** (pas juste le toast in-app) avec icon + badge + action click → ouvre l'app.

**Ce qui est réellement livré (et ce qui ne l'est pas) :**

| Feature demandée | Statut | Notes |
|---|---|---|
| Installable iOS/Android/Desktop | ✅ | manifest + icons + SW |
| Cache offline (app shell) | ✅ | network-first nav, cache-first static |
| Notifications natives emails urgents | ✅ *quand app ouverte / PWA active* | Via `registration.showNotification()` |
| **Polling Gmail quand tab fermé** | ❌ **impossible dans le browser** | Pas de vrai Web Push sans backend VAPID. Periodic Background Sync = Chrome uniquement, ≥12h interval, PWA installée uniquement — non fiable pour 5min |

Les browsers ne permettent pas le polling en continu d'un tiers (Gmail) quand l'onglet est fermé. Le vrai background polling nécessite un **cron serveur** (Vercel scheduled functions) qui push au device via VAPID. C'est la prochaine étape si tu veux vraiment du surveillance-when-closed.

- `public/manifest.json` (**NEW**) — name "The Headquarters", short_name "QG", theme `#6366f1`, background `#0a0f1c`, standalone display, 3 icons (192/512 PNG + SVG maskable)
- `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180), `icon.svg` (**NEW**) — générés via `scripts/gen-icons.js` (Node, zéro dépendance — reconstitue le logo two-square brand)
- `scripts/gen-icons.js` (**NEW**) — générateur PNG from scratch via zlib + PNG chunks. Run : `node scripts/gen-icons.js`
- `public/sw.js` (**NEW**) — service worker
  - Install : prefetch de l'app shell (critical)
  - Fetch : network-first pour navigations, cache-first pour assets, bypass complet pour les hosts API (Anthropic / Mem0 / Supabase / Google)
  - Notification click : focus le window existant ou ouvre `/`
  - Message bridge : la page peut déléguer `showNotification` au SW via `postMessage({type:'SHOW_NOTIFICATION'})`
- `index.html` — ajout manifest link, theme-color, viewport fit=cover, iOS apple-* meta tags, icon links multi-formats
- `src/utils/pwa.js` (**NEW**) —
  - `registerServiceWorker()` safe no-op si unsupported
  - `requestNotificationPermission()` lazy
  - `showLocalNotification()` via SW ready
  - `isIOS()`, `isStandalone()`, `isInstallAvailable()`, `onInstallAvailabilityChange()`, `promptInstall()`
- `src/components/InstallPrompt.jsx` (**NEW**) — banner discret bas centré
  - Android : bouton "Installer" direct
  - iOS : instructions manuelles (Partager → Ajouter à l'écran d'accueil)
  - Dismissible pour 30 jours (LS `qg_install_prompt_dismissed_v1`)
  - Masqué si déjà `standalone`
- `src/App.jsx` —
  - `registerServiceWorker()` au mount
  - `<InstallPrompt />` monté au niveau racine
  - Extension du Gmail watcher : en + du toast, fire `showLocalNotification` si permission granted (lazy request au premier urgent)

### Known limitations (honest)
- **Polling Gmail en background tab fermé = impossible** sans backend. Le watcher ne tourne que tant que le tab/PWA est ouvert ou en fond proche (pas killé par l'OS)
- **Notifications en verrouillage** : sur iOS, les notifications system arrivent uniquement si la PWA est installée (pas en Safari tab) ET si l'app a été ouverte récemment
- **iOS < 16.4** : pas de Web Push du tout
- **Firefox Android** : `beforeinstallprompt` non fiable — tombe sur le path "iOS" qui demande install manuel
- **Premier run PWA sans HTTPS** : le SW ne s'enregistrera pas. Localhost = ok en dev, prod requiert HTTPS (Vercel = auto)

### Next (Phase 3 continue — pour vraiment background)
Créer une Vercel scheduled function (cron 5min) qui :
1. Fetch Gmail via refresh token stocké cloud
2. Classifie via Haiku
3. Envoie web-push au device (nécessite VAPID keys + push subscription stockée)

~6h de travail, exige auth refresh token Gmail (Authorization Code flow au lieu d'implicit).

### Added — Phase 2 — Focus Timer par client + taux horaire réel
Le Focus Timer capture maintenant le **client associé** à chaque session Pomodoro. Ça déverrouille la métrique la plus importante pour un consultant solo : **le taux horaire réel par client** (MRR ÷ heures investies ce mois). Visible directement dans le Dashboard section "Revenus par client" — chaque retainer affiche ses heures de la semaine et son $/h réel.

**Flow :**
```
Focus Timer pré-start
  ↓ dropdown "Client associé" (Général/Admin par défaut)
  ↓ Pomodoro run
  ↓ commitResult → log entry avec clientName + syncFocusSession (Supabase)
  ↓
Dashboard section Revenus par client
  ↓ lit hq_focus_log
  ↓ pour chaque retainer : somme minutes (semaine + mois)
  ↓ affiche "Xh cette semaine" + "$Y/h réel" (MRR / heures du mois)
```

- `src/components/FocusTimer.jsx`
  - Nouvelle prop `retainers` (array `{id, name, amount}`)
  - Nouveau state `selectedClient` (sentinel `__general__` = Général/Admin par défaut)
  - Dropdown "Client associé" en pré-start, options : Général/Admin + 1 par retainer (avec `$amount/mo`)
  - `commitResult` injecte `clientName` dans le log entry + appelle `syncFocusSession` fire-and-forget
  - Reset retourne à Général/Admin

- `src/components/HomeScreen.jsx`
  - Thread `retainers={dashboard?.retainers || []}` vers FocusTimer

- `src/lib/sync.js`
  - Nouvelle fonction `syncFocusSession(entry)` — insert fire-and-forget
  - Colonnes : `id · client_name · duration_minutes · category · intention · result · session_date`
  - `client_name NULL` = Général/Admin (convention)

- `src/components/RevenueBreakdown.jsx`
  - Lecture locale de `hq_focus_log` avec memoization sur retainers/oneTimeRevenues
  - Helper `loadClientHours()` → retourne `{weeklyMinutes, monthlyMinutes}` par clientName
  - Par row retainer, nouvelle ligne avec :
    - Icon Clock + "Xh cette semaine" (depuis lundi)
    - Chip gold **"$Y/h réel"** = `Math.round(MRR / monthlyHours)`
    - Fallback "+d'heures pour calcul" si < 1h ce mois (évite division-par-zéro + chiffres aberrants genre "$500/h" pour 6 min)
  - Apparait UNIQUEMENT si le retainer a ≥ 1 session loggée ce mois-ci (aucun bruit sinon)

### ⚠ SQL à exécuter dans Supabase pour activer le cloud ledger
```sql
CREATE TABLE IF NOT EXISTS focus_sessions (
  id                text PRIMARY KEY,
  client_name       text,                   -- NULL = General/Admin
  duration_minutes  int NOT NULL CHECK (duration_minutes > 0),
  category          text,
  intention         text,
  result            text,                   -- completed | partial | failed
  session_date      timestamptz NOT NULL,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_focus_client ON focus_sessions (client_name);
CREATE INDEX IF NOT EXISTS idx_focus_date   ON focus_sessions (session_date DESC);
```
Sans ce SQL, tout fonctionne en localStorage uniquement — juste pas de backup cloud.

### Pourquoi le $/h réel change tout
Samuel pourrait avoir un retainer à **$500/mo** qui consomme **20h/mois** → **$25/h**. En parallèle, un autre à **$200/mo** mais 2h/mois → **$100/h**. Les agents peuvent maintenant répondre à *"lequel garder ?"* avec les **vrais chiffres**, pas une intuition.

### Known limitations
- Retainers renommés après coup : les entries du log gardent l'ancien nom → orphan (retainer actuel affiche 0h). User peut re-logger sous le nouveau nom.
- Entries legacy (avant ce patch) n'ont pas `clientName` → exclues silencieusement des stats par-client.
- Fenêtre "mois courant" hardcoded depuis le 1er du mois. Le taux horaire chute brutalement chaque début de mois avant que de nouvelles sessions soient loggées — WAI (MVP).
- Heures sync Supabase mais la computation `$/h réel` reste locale (lit localStorage). Cross-device : heures déjà loggées sur un autre device ne comptent pas tant que le log local n'est pas synced (scope future).

### Added — Phase 2 — Gmail surveillance proactive
QG surveille maintenant les emails business **en arrière-plan** et alerte Samuel en temps quasi-réel quand un email urgent arrive. Toast inline + badge rouge sur l'icône Mail de la nav. Aucune action requise de l'utilisateur — ça tourne tout seul.

**Flow :**
```
Tab visible + Gmail connecté
  ↓
Poll toutes les 5 min (getRecentEmails → déjà filtrée business par feature précédente)
  ↓
Pour chaque email jamais vu (dedup localStorage)
  ↓ classifyEmailUrgency (Haiku)
  ↓ si isUrgent=true + confidence≥0.55
      ├── Toast 6s : "🎯 Dubé Auto — demande un devis pour lundi"
      └── Badge rouge nav +1
```

- `src/api.js`
  - Nouvelle fonction `classifyEmailUrgency(email, lang)` — Haiku one-shot JSON
  - Retour : `{ isUrgent, category, oneLine, confidence }`
  - 5 catégories : `prospect_reply` · `client_issue` · `invoice` · `opportunity` · `other`
  - Règles d'urgence explicites : "ask avec deadline" = urgent, "FYI / thanks / circle back" = pas urgent
  - `oneLine` extrait l'ASK réel en ≤ 90 chars, pas juste le subject

- `src/utils/gmailWatcher.js` (**NEW**)
  - `startGmailWatcher({ onUrgent, onUnauthorized, lang })` → retourne fonction `stop()`
  - Polling interval 5 min via setInterval
  - Guard `document.visibilityState === 'visible'` → pas de poll en background tab
  - Event `visibilitychange` : re-poll immédiat quand tab redevient visible
  - **First-run seed** : au premier poll après clean state, marque l'inbox existant comme baseline, pas de toast spam
  - Dedup via `hq_gmail_watcher_seen_v1` localStorage (cap 500 IDs LRU)
  - 401 → `clearGmailTokens` + callback `onUnauthorized`
  - `clearSeenIds()` exporté pour reset au disconnect

- `src/App.jsx`
  - State `urgentEmailCount` + effet start/stop watcher quand `gmailConnected`
  - Callback `onUrgent(email, classification)` :
    - Toast 6s avec emoji de catégorie (💸 invoice / ⚠️ client_issue / 🎯 prospect_reply / ✨ opportunity / 📧 other)
    - Increment badge
  - Handler `onGoEmail` : reset badge à 0 + navigue vers Dashboard
  - Cleanup watcher + `clearSeenIds()` à `handleDisconnectGmail`

- `src/components/Header.jsx`
  - Import icon `Mail` (lucide-react)
  - Nouvelle entrée au début de la liste des icon buttons (conditionnelle sur `onGoEmail`)
  - Badge rouge `#ef4444` affiché quand `urgentEmailCount > 0` (cap affichage "9+")
  - Pattern identique aux badges Decisions (bleu) / Journal (vert)

### Coût estimé
- Haiku ~100-200 tokens par classification × ~2-5 nouveaux emails business/jour × 30j = **~15k tokens/mois** pour cette feature
- Négligeable (< $0.05/mois au pricing Haiku actuel)

### Known limitations
- Ne tourne que quand l'onglet QG est ouvert (pas de background worker / PWA push)
- Notification visuelle seulement : pas de sound ding (le toast existant est silencieux)
- Le dedup LRU cap à 500 → emails très anciens peuvent re-déclencher si l'utilisateur les marque non-lus
- Première session après un long absence : peut noter plusieurs urgents en rafale — toast queueing limite l'accumulation mais spam possible
- Pas encore de "snooze email" ou "mute par expéditeur"

### Added — Phase 2 — Client value alerts (churn risk detection)
Au démarrage de chaque session, QG détecte les retainers qui n'ont pas été **mis à jour** ou **mentionnés** depuis plus de 45 jours et affiche une card d'alerte batchée. Symétrique avec l'esprit "conseiller qui voit ton P&L" : au lieu d'attendre que Samuel réalise qu'il a perdu Dubé, QG le flag proactivement *avant* la conversation.

**Seuils :**
- **45–59 jours sans activité** → amber (à surveiller)
- **≥ 60 jours sans activité** → red (risque élevé)

**2 sources de "touche" (activité) :**
1. **Mutation** — add / edit / mrr+ / mrr- / retainer renommé
2. **Mention en chat** — le nom du retainer apparaît dans un message user (word-boundary match, accents-aware via `\p{L}`)

Quand Samuel tape *"j'ai eu un call avec Dubé"*, même sans mutation de données, le compteur de Dubé reset à 0. Les agents voient le P&L *vivant*, pas stale.

- `src/App.jsx`
  - Nouveaux helpers : `getRetainerTouchedAt(r)` (fallback `startedAt` pour legacy), `daysSince(ts)`, `messageMentionsRetainer(text, name)`
  - Constantes `CHURN_WARN_DAYS = 45`, `CHURN_DANGER_DAYS = 60`
  - Handler `mrr+` stamp `lastTouchedAt` sur création
  - Dans `sendMessage()` : scan des retainers names dans le message user, update `lastTouchedAt` des matches + sync cloud
  - Dans `startSession()` : après welcome + pattern alert, scan des retainers, batch at-risk dans un message `churn-risk-alert` trié par urgence décroissante

- `src/components/ChatScreen.jsx`
  - Nouveau composant `ChurnRiskAlertCard`
    - Header coloré selon la severity max (rouge si ≥ 1 danger, sinon amber)
    - Liste de rows avec `UserX` icon + badge montant `/mo` + phrase "Aucune activité depuis X jours"
    - Footer hint : *"Mentionne un nom en conversation pour reset le compteur."*
    - Dismissible via X header

### Architecture de la détection

```
  [Message user] ─┐
                  ├─→ scan retainer names → update lastTouchedAt (local + cloud)
  [Mutation] ────┘

  [Session start] → filter retainers where days since lastTouchedAt >= 45
                 → batch into single churn-risk-alert message
                 → sort by days desc (worst first)
```

### Known limitations
- Pas de notification hors-session (pas de push/email — juste visible au session start)
- Matching des noms sensible aux variations orthographiques (si Samuel écrit "Dubé Automobile" vs "Dube") — word boundary avec `\p{L}` couvre les accents FR mais pas les typos
- Pas encore de "snooze" pour une durée custom — dismiss = session unique seulement (re-apparaît à la prochaine session si toujours at-risk)
- Retainers très récemment créés (< 45j) ne déclenchent jamais — correct par design (pas de faux positifs sur nouveau client)

### Fixed — Persistence des données financières (data loss au refresh)
Bug critique : les mutations financières faites via NLP (MRR, revenus, expenses) étaient perdues au refresh si l'user rafraîchissait dans la fenêtre de debounce de 500ms du localStorage (juste après un "Confirmer"). Correction à 3 niveaux pour garantir **zéro data-loss** :

**1. Flush synchrone avant unload (`useAutoSave.js`)**
- Nouveau : `beforeunload` + `pagehide` (Safari/iOS) handlers qui flush le `setTimeout` de debounce et écrivent en localStorage immédiatement
- Élimine totalement la fenêtre de perte entre "clic Confirmer" et écriture disque

**2. Supabase devient source de vérité pour les finances (`sync.js`)**
- Nouvelle table `dashboard_state` — single-row par user avec tout l'état financier en JSONB (annualGoal, monthlyRevenue, retainers, oneTimeRevenues, pipeline)
- `syncDashboardState(dashboard)` upsert à chaque changement (debounced 800ms) + flush sync au unload
- `fetchDashboardState()` lit le row au load de l'app

**3. Hydratation cloud au mount (`App.jsx`)**
- localStorage peint instantanément (UX : pas de blank screen)
- useEffect fetch `dashboard_state` async → si trouvé, override le state React avec la version cloud
- Si pas de cloud row (premier lancement) → push local vers cloud pour seeder
- Si fetch fail (offline) → garde le local, retry au prochain mutation

### Architecture résultante

```
  [Mutation NLP]
       ↓
  setDashboard()
    ├── React state     (UI instant)
    ├── useAutoSave     → localStorage (500ms debounce + flush-on-unload)
    └── syncDashboardState → Supabase   (800ms debounce + flush-on-unload)

  [App reload]
       ↓
  initial state ← localStorage (instant paint)
       ↓
  useEffect → fetchDashboardState → override state si cloud ahead
```

### ⚠ SQL à exécuter dans Supabase pour activer la persistance cloud
```sql
CREATE TABLE IF NOT EXISTS dashboard_state (
  user_id    text PRIMARY KEY,
  state      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);
```
Sans ce SQL, le fix `useAutoSave` flush-on-unload suffit pour résoudre le data-loss single-device — le cloud sync log-warn silencieusement. Avec le SQL, tu gagnes **cross-device sync** en plus.

### Known limitations
- Pas de conflict resolution si 2 devices mutent simultanément (last-write-wins via Supabase timestamp)
- Pas de version history — les overwrites sont définitifs
- Granular tables (retainers/one_time_revenues/expenses) restent comme ledgers append-only pour analytics, mais `dashboard_state` est devenu la source de vérité primaire

### Added — Phase 2 — Monthly revenue breakdown par client
Nouvelle section dans le Dashboard qui liste tous les clients actifs avec ventilation MRR + one-time (derniers 90 jours). Chaque ligne affiche rang + nom + type pill + montant + date. Les agents ont aussi accès à un bloc `TOP CLIENTS` dans leur contexte — ils peuvent maintenant référencer *"ton client le plus payant"* en session avec les vraies données.

**Point technique clé :** les one-time revenues n'étaient pas stockées par client auparavant (juste aggregées dans `monthlyRevenue[m].revenue`). Ce patch ajoute un nouveau array `dashboard.oneTimeRevenues[]` qui capture le client à chaque paiement one-time via le Dashboard NLP.

- `src/App.jsx`
  - `defaultDashboard()` gagne `oneTimeRevenues: []` (migration soft pour les dashboards existants)
  - Handler `one-time` dans `handleApplyDashboardUpdate` push maintenant `{id, clientName, amount, monthIdx, year, date, sessionId}` dans l'array en plus d'incrémenter l'aggregation mensuelle
  - `formatDashboardContext` ajoute un bloc `TOP CLIENTS (ranked by current monthly value)` listant retainers triés par amount desc + one-time des derniers 90 jours triés par date desc
  - Instruction explicite dans le contexte : *"use this if Samuel asks about 'my top-paying client' / 'mon client le plus payant'"*

- `src/components/RevenueBreakdown.jsx` (**NEW**)
  - Header : icon Crown gold + count clients + totaux MRR et one-time 90j
  - Liste unifiée retainers (triés par amount) + one-time 90j (triés par date)
  - Chaque ligne : rank badge (gold pour #1) + nom + pill type (Repeat emerald / Zap gold) + montant + date relative
  - Empty state élégant avec CTA au chat NLP

- `src/components/DashboardScreen.jsx`
  - Import + render `<RevenueBreakdown>` après Retainers, avant Smart Insights
  - Destructure `oneTimeRevenues` du dashboard data

- `src/lib/sync.js`
  - `syncRetainer(retainer)` upsert fire-and-forget
  - `syncRetainerDelete(id)` delete fire-and-forget
  - `syncOneTimeRevenue(entry)` insert append-only
  - Wire dans `handleApplyDashboardUpdate` : `mrr+` sync upsert, `mrr-` sync delete, `one-time` sync insert

### ⚠ SQL à exécuter manuellement dans Supabase pour activer le backup cloud
```sql
CREATE TABLE IF NOT EXISTS retainers (
  id          bigint PRIMARY KEY,
  name        text NOT NULL,
  amount      numeric NOT NULL CHECK (amount >= 0),
  started_at  timestamptz,
  workflow    text,
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS one_time_revenues (
  id           bigint PRIMARY KEY,
  client_name  text,
  amount       numeric NOT NULL CHECK (amount > 0),
  month_idx    int NOT NULL,
  year         int NOT NULL,
  date         timestamptz DEFAULT now(),
  session_id   bigint,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_one_time_client ON one_time_revenues (client_name);
CREATE INDEX IF NOT EXISTS idx_one_time_date   ON one_time_revenues (date DESC);
```
Sans ce SQL, la feature fonctionne 100% en localStorage — juste pas de backup cloud.

### Known limitations
- Les retainers édités/supprimés manuellement depuis le Dashboard UI (RetainerRow) ne syncent pas à Supabase dans ce patch (seuls les mutations via chat NLP syncent)
- Fenêtre de "recent one-time" : 90 jours hardcoded, pas de toggle UI
- Pas de graph temporel par client (possible future : line chart revenue/client/mois)
- `clientName` pour une one-time non-extraite tombe à "Client inconnu" — utilisateur peut corriger via la card edit mode au moment du capture

### Added — Phase 2 — Expense tracking NLP
Symétrique au Dashboard NLP : quand Samuel mentionne une dépense (*"j'ai payé 300$ en outils"*, *"facture ElevenLabs 22$/mois"*, *"j'ai dépensé 150$ en pub"*), QG extrait le montant, la catégorie, et propose une card rouge de confirmation. Un clic = `monthlyRevenue[m].expenses` mis à jour + ledger Supabase (optional).

**Approche :** le type `expense` a été ajouté au système existant `extractDashboardUpdate` plutôt qu'un nouveau flow parallèle. Un seul extract, une seule card component, branches sur le type. Les 4 types partagent maintenant la même infrastructure : `mrr+` / `mrr-` / `one-time` / `expense`.

- `src/api.js`
  - `extractDashboardUpdate` — type enum étendu à `expense`
  - Règle expense RETIRÉE (précédemment rejetée avec confidence 0)
  - Nouveaux champs schema : `category` (`tools`|`ads`|`subscription`|`freelance`|`office`|`other`), `label` (ex: "ElevenLabs"), `isRecurring` (true si `/mois`)
  - Validation stricte : `expense` sans category ET sans label → confidence 0

- `src/components/ChatScreen.jsx`
  - `DASHBOARD_TYPE_META.expense` — red `239,68,68` + AlertCircle icon, sign `−`
  - Nouvelle constante `EXPENSE_CATEGORIES` (6 catégories, bilingue) + `categoryLabel(key, lang)`
  - `DashboardUpdateCard` rendu étendu :
    - Edit mode : champ "Description" (au lieu de "Client") + dropdown catégorie + montant
    - Preview mode : chip catégorie emerald en haut droite
    - `/mois` display pour les expenses récurrentes
  - Applied state inclut la catégorie : *"Dashboard mis à jour : Dépense −$300/mo · Tools · ElevenLabs ✓"*

- `src/App.jsx`
  - `DASHBOARD_TRIGGERS` élargis : `dépensé`, `déboursé`, `investi`, `spent`, `invested`, `abonnement`, `subscription`, `coût de`, `coûte`
  - Card payload passe maintenant `category`, `label`, `isRecurring` au handler
  - `handleApplyDashboardUpdate` branche `expense` → `monthlyRevenue[currentMonthIdx].expenses += amount` + appel `syncExpense` fire-and-forget
  - Toast explicit : *"Dashboard : −$300/mo ✓"*

- `src/lib/sync.js`
  - Nouvelle fonction `syncExpense({monthIdx, year, category, amount, label, isRecurring, sessionId})` fire-and-forget
  - Insert append-only dans table `expenses` — si la table n'existe pas, silent fail + console.warn

### ⚠ SQL à exécuter manuellement dans Supabase pour activer le ledger cloud
```sql
CREATE TABLE IF NOT EXISTS expenses (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  month_idx     int NOT NULL,              -- 0-11
  year          int NOT NULL,
  category      text CHECK (category IN ('tools','ads','subscription','freelance','office','other')),
  amount        numeric NOT NULL CHECK (amount > 0),
  label         text,
  is_recurring  boolean DEFAULT false,
  session_id    bigint,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses (year, month_idx);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category);
```
Sans ce SQL, la feature fonctionne toujours (localStorage reste source truth) — juste pas de backup cloud.

### Known limitations
- `isRecurring=true` est stocké comme flag mais MVP traite l'expense comme one-time du mois courant (pas de répétition auto chaque mois)
- Pas d'édition / delete d'expense depuis le Dashboard (append-only)
- Devise supposée CAD ; montants en nombre brut
- Double-déclenchement possible si message mélange revenu ET expense — pour MVP Haiku choisit le plus évident

### Added — Phase 2 — Memory viewer UI dans le Dashboard
Nouvelle section en bas du Dashboard qui liste toutes les mémoires Mem0 actives de Samuel. Chaque ligne affiche le contenu, la date relative (*"il y a 2 j"*) et un bouton de suppression. Un textarea permet d'ajouter une mémoire manuellement — utile pour injecter un contexte précis que QG doit retenir (*"je vise 50k$ en 2026"*, *"mon jour job finit en septembre"*).

- `vite.config.js`
  - 2 nouvelles routes proxy Mem0 :
    - `/api/mem0/list` (GET) → `/v1/memories/?user_id=X&app_id=Y` (préserve les query params)
    - `/api/mem0/delete?id=ABC` (DELETE) → `/v1/memories/ABC/` (rewrite dynamique de l'id)
  - ⚠ Restart du dev server nécessaire pour prendre effet

- `src/lib/mem0.js`
  - `listAllMemories()` — GET, retourne array normalisé `[{id, memory, createdAt, updatedAt, metadata}]` ou `[]`
  - `deleteMemory(id)` — DELETE par id, retourne `true | false`
  - `addManualMemory(text)` — POST avec flag `metadata.type='manual'` pour distinction visuelle

- `src/components/MemoryViewer.jsx` (**NEW**)
  - Header : icon Brain + count + bouton Refresh
  - Input : textarea 2 lignes + bouton Ajouter (Ctrl/Cmd+Enter submit)
  - Liste scrollable (max 420px) avec chaque mémoire : contenu full + date relative + badge "Manuel" si applicable
  - **Delete double-click** : 1er click arme (card rouge + label "Confirmer"), 2e click supprime, auto-reset à 3s si pas confirmé
  - États : loading (4 skeleton lines), empty (dashed border explicatif), error banner rouge
  - Accent indigo `99,102,241` cohérent avec la Memory recap card

- `src/components/DashboardScreen.jsx`
  - Import + render `<MemoryViewer>` en bas, après Smart Insights
  - Guard : ne s'affiche que si `isMem0Enabled()` — n'apparaît pas sans clé Mem0

### Known limitations
- Pagination à 100 memories max (largement au-dessus du usage normal, extensible plus tard)
- Pas de filtre/recherche dans la liste — direct scroll
- Pas d'édition en place (il faut supprimer + ré-ajouter)
- Pas d'export JSON de la liste (possible future)

### Added — Phase 2 — Memory recap au démarrage de session
Quand une session démarre (sauf la toute première), QG affiche une card indigo discrète *"Depuis la dernière fois…"* avec jusqu'à 3 points clés extraits automatiquement de Mem0 + l'historique local : dernière victoire, dernier blocage, prochain move. Skeleton shimmer pendant le fetch, silent fail si rien de concret à dire.

- `src/lib/mem0.js`
  - Nouvelle fonction `fetchMemoriesForRecap()` — query broad sur Mem0 (wins/blockers/decisions/next moves), retourne jusqu'à 8 memories raw ou null
  - Re-export de `isMem0Enabled` utilisé par App.jsx pour guard

- `src/api.js`
  - Nouvelle fonction `generateMemoryRecap({memories, lastSession}, lang)` — Haiku one-shot JSON
  - Combine les memories Mem0 + la dernière session du sessionHistory local (consensus + keyDecisions)
  - Retour : `{ welcomeLine, lastWin, lastBlocker, nextMove, confidence }` avec règles strictes : pas d'invention, si rien de concret → chaîne vide
  - Drop automatique si confidence < 0.5 OU si les 3 champs substantifs sont vides

- `src/App.jsx`
  - Dans `startSession()` : push immédiat d'un placeholder `memory-recap-loading` puis async fetch memories + generateMemoryRecap
  - Replace placeholder par le vrai `memory-recap` au retour, ou retire silencieusement si vide
  - Guards : sessionCount > 0, Mem0 enabled, pas déjà fired pour ce sessionId (via `recapFiredForSessionRef`)

- `src/components/ChatScreen.jsx`
  - Nouveau composant `MemoryRecapCard` avec variante loading (skeleton shimmer 3 lignes) et variante content (3 `RecapLine` colorés : Win emerald / Blocker red / Next indigo)
  - Accent indigo (`99,102,241`) + backdrop-filter blur pour effet glass
  - Dismissible via X en haut droit — pas d'autre action (read-only)

### Known limitations
- Recap FR/EN mais pas de fallback si Mem0 timeout > 10s (skeleton reste affiché, retiré seulement au next message)
- Pas de "dernière fois c'était il y a X jours" — possible amélioration future avec `lastSession.date`
- Pas de sync Supabase des memories (Mem0 est l'unique source)

### Added — Phase 2 — Dashboard NLP auto-update
Les agents extraient les événements financiers mentionnés en session (*"j'ai signé un client à 150$/mois"*, *"j'ai perdu un client à 200$"*, *"nouveau contrat 500$ one-time"*) et proposent une card de confirmation qui met à jour le dashboard. Trois types distincts : MRR+, MRR−, one-time. Aucune saisie manuelle.

- `src/api.js`
  - Nouvelle fonction `extractDashboardUpdate(userInput, {retainers, knownNames}, lang)` — Haiku one-shot JSON
  - Classifie en `mrr+` / `mrr-` / `one-time` avec règles explicites sur `/mois`, `/mo`, `one-time`
  - Pour `mrr-` : tente un retainerId match fuzzy (nom + montant) côté LLM, puis cascade côté JS (id → nom+montant → nom → montant)
  - Rejette explicitement les expenses (*"j'ai payé X en outils"* → confidence 0), le passé hypothétique, les amounts > 100k sans contexte

- `src/App.jsx`
  - Refactor du flow détection : Pipeline + Dashboard extractions en **parallèle** via `Promise.all` — latence identique à une seule détection. Les 2 cards peuvent apparaître ensemble quand le message contient les 2 intents (*"j'ai signé avec Dubé à 150$/mois"*)
  - Nouveau bloc `DASHBOARD_TRIGGERS` bilingue (FR: `$`, `/mois`, `contrat`, `touché`, `payé`, `revenu`, `mrr`, etc. EN: `one-time`, `one shot`, `paid`, `bucks`, etc.)
  - Nouveau handler `handleApplyDashboardUpdate(msgId, {updateType, amount, clientName, retainerId})`
    - `mrr+` : push dans `dashboard.retainers`
    - `mrr-` : retire par id ou fuzzy match sur nom/montant, no-op silencieux si aucun match
    - `one-time` : incrémente `monthlyRevenue[currentMonthIdx].revenue`

- `src/components/ChatScreen.jsx`
  - Nouveau composant `DashboardUpdateCard` avec 3 variantes visuelles
    - MRR+ → accent emerald (`16,185,129`) + TrendingUp icon
    - MRR− → accent red (`239,68,68`) + Minus icon
    - One-time → accent amber (`251,191,36`) + Zap icon
  - Montant et nom client éditables avant confirmation
  - Preview montre le montant en display large (`$150 / mois`) avec signe explicite (+/−)
  - État `dashboard-update-applied` → inline tick coloré avec résumé

### Known limitations
- Expenses non trackés automatiquement dans ce patch (rejetés à l'extraction)
- `one-time` va toujours dans le mois courant (pas de back-dating)
- Partial retainer change (passage 500 → 300) pas supporté — il faut 1 `mrr-` puis 1 `mrr+`
- Devise supposée CAD ; la mention `€` / `EUR` est matchée mais stockée en nombre brut
- Pas de sync Supabase du dashboard dans ce patch (localStorage uniquement — idem les autres cards)

### Added — Phase 2 Action #3 — Pipeline auto-update from chat
Les agents détectent les événements commerciaux dans la conversation (*"j'ai signé avec Dubé"*, *"le resto a dit non"*, *"démo prévue avec X"*) et proposent une card de confirmation qui met à jour le statut du prospect dans le CRM. Le dashboard de pipeline suit automatiquement puisqu'il dérive ses compteurs de `hq_prospects`.

- `src/api.js`
  - Nouvelle fonction `extractPipelineAction(userInput, prospects, lang)` — appel Haiku one-shot JSON
  - Matche le prospect par id dans la shortlist fournie (fuzzy matching délégué au LLM sur business name / contact name / ville)
  - Valide la transition contre `STATUS_FLOW` (bloque Incomplet → Signé et autres sauts invalides)
  - Rejette confidence < 0.6, no-op transitions, prospects inconnus

- `src/App.jsx`
  - Détection d'intent pipeline dans `sendMessage()` — triggers bilingues FR/EN, placée après le bloc Calendar
  - Lecture de `hq_prospects` depuis localStorage à chaque détection, fallthrough propre si vide
  - Nouveau handler `handleApplyPipelineUpdate(msgId, {prospectId, newStatus})` — update par id, stamp `signedAt` sur transition "Signé", réécrit localStorage, toast

- `src/components/ChatScreen.jsx`
  - Nouveau composant `PipelineUpdateCard` (accent violet — distinct de bleu email / emerald calendar)
  - Nouveau composant `StatusPill` réutilisable (10 couleurs pour les 10 statuts du flow)
  - États : `pipeline-update-preview` (avant → après avec reason) et `pipeline-update-applied` (tick violet avec nouveau statut)

### Known limitations (MVP)
- Pas de sync Supabase pour les prospects dans ce patch (ProspectsScreen gère son propre sync au refresh)
- Fuzzy matching sur la shortlist limitée à 80 prospects (troncature côté extraction)
- Désambiguïsation visuelle sur la card (nom + ville) — si deux prospects matchent vraiment, la confiance Haiku baisse et rien ne s'affiche

### Added — Phase 2 Action #1 — Calendar write from chat
Les agents peuvent maintenant créer de vrais événements Google Calendar directement depuis la conversation. Quand l'utilisateur mentionne un rendez-vous, un follow-up ou un rappel, QG extrait l'intent et propose une card de confirmation inline. Un clic = event créé.

- `src/utils/gcal.js`
  - Scope upgradé : `calendar.readonly` → `calendar.readonly calendar.events` (nécessaire pour écriture)
  - Nouvelle fonction `createCalendarEvent(token, { summary, startISO, endISO, description, location, timeZone })` — POST sur le calendrier primaire, timezone par défaut `America/Montreal`
  - Gestion 401 (token expiré → clear) et 403 SCOPE (permission d'écriture manquante → clear + reconnect)

- `src/api.js`
  - Nouvelle fonction `extractCalendarEvent(userInput, lang)` — appel Haiku one-shot JSON, résout les dates relatives (demain, jeudi, dans 3 jours, tomorrow, next Monday) depuis l'heure courante Montréal, retourne `{ title, startISO, endISO, description, confidence }` ou `null`
  - Rejette les events au passé, les durées invalides, et les intents à faible confiance (< 0.55)

- `src/App.jsx`
  - Détection d'intent calendrier dans `sendMessage()` — triggers bilingues FR/EN, placée après le bloc Gmail et avant PDF
  - Fallback propre quand Calendar pas connecté ou quand l'extraction est à faible confiance
  - Nouveau handler `handleCreateCalendarEvent(msgId, eventData)` — crée l'event, met à jour le message, refresh le calendrier en mémoire, toast succès
  - Gestion explicite du cas SCOPE_INSUFFICIENT pour les utilisateurs déjà connectés avant cette feature

- `src/components/ChatScreen.jsx`
  - Nouveau composant `CalendarEventCard` (accent emerald) — preview éditable (titre, date/heure début et fin, notes), boutons Create/Edit/Cancel
  - États : `calendar-event-preview` (card éditable) et `calendar-event-created` (confirmation verte avec lien "Ouvrir" vers Google Calendar)

### ⚠ Breaking for existing users
Les utilisateurs ayant connecté Google Calendar avant cette version doivent se reconnecter une fois pour accorder la permission d'écriture. La première tentative de création d'event affichera un message explicite avec CTA de reconnexion.

### Known limitations (MVP)
- Un seul event par message (pas de batch)
- Pas de support récurrence / invités / rappels custom
- Durée par défaut 30 min si non spécifiée
- Les dates relatives complexes ("le jeudi d'après celui qui suit la semaine prochaine") peuvent échouer l'extraction → fallback vers réponse agent normale

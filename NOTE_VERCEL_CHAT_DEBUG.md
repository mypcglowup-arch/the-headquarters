# Vercel Chat Debug — Note

## Bug #1 — Conversations vides (le vrai problème)

### Cause root identifiée

`generateSessionOpening()` à `src/api.js:3375-3378` swallow les erreurs avec `console.warn` et retourne `null` silencieusement. Sur Vercel mobile, l'utilisateur voit :

- Le message système "Session démarrée" (ligne 686 d'App.jsx) ✅ s'affiche
- L'opening message de l'agent ❌ jamais — l'API call échoue silencieusement

### Fix appliqué (2 endroits)

**1. `src/api.js:3375`** — Le catch re-throw maintenant au lieu de retourner null silencieusement, pour que l'erreur remonte au caller.

**2. `src/App.jsx:1064`** — Le catch dans le caller affiche **TROIS** signaux pour qu'on voit l'erreur sur mobile :
- `console.error` complet (visible si tu inspectes via Safari Remote Debug)
- **Toast** rouge de 6s avec le message
- **`alert()`** intrusif qui force l'affichage du message complet

> ⚠️ Les deux endroits sont marqués `TEMPORARY DIAGNOSTIC` avec instructions pour restaurer le comportement silencieux une fois le proxy Vercel confirmé fonctionnel.

---

## Bug #2 — Page des conversations

Cherché en profondeur. **Aucun composant n'a été supprimé ou renommé.** Les écrans existants : `home, chat, journal, decisions, dashboard, prospects, library, situations, victories, profile, workflow, replay`. Tous sont rendus (App.jsx:2840-3050) et tous accessibles via le drawer mobile.

### Possibilités sur ce qui a "disparu"

| Si tu pensais à... | C'est en fait... | Comment y accéder |
|---|---|---|
| Une **liste de toutes tes conversations passées** | Pas un écran qui a existé — `replay` n'existe que pour rejouer une session qui vient de finir | N'a jamais existé en mode "page liste" |
| **Library** (réponses sauvegardées des agents) | Toujours là | Drawer ☰ → Bibliothèque |
| **Replay** d'une session archivée | Toujours là | Bouton "Revoir cette session" qui apparaît en bas du chat quand sessionEnded=true |
| Le **chat lui-même** | Toujours rendu quand `sessionStarted=true && screen !== 'replay'` | Démarrer une session |

**Si tu te souviens d'une page "Conversations" précise — dis exactement ce qu'elle affichait** (liste de sessions ? historique chat ?) et je la cherche dans Git history pour voir si elle a été supprimée par un commit antérieur.

---

## Marche à suivre

1. **Commit + push** les changements (`src/api.js` + `src/App.jsx`)
2. Vercel rebuild
3. Sur mobile, ouvre l'app → démarre une session
4. Tu devrais voir un **alert()** avec l'erreur exacte

### L'erreur va te dire QUOI fixer

| Erreur dans alert | Cause | Fix |
|---|---|---|
| `API error 500` + body parle de `ANTHROPIC_API_KEY not set` | Env var manquante | Vercel Settings → Environment Variables → ajouter `ANTHROPIC_API_KEY` (sans VITE_) → Redeploy |
| `API error 401` ou `invalid_api_key` | Mauvaise clé | Régénérer dans console.anthropic.com → mettre à jour Vercel |
| `API error 504` ou timeout | Function timeout | Le `maxDuration: 60` est censé corriger ça — vérifier qu'il est bien dans `api/anthropic.js` |
| `Failed to fetch` | Proxy injoignable / réseau | Vérifier que `/api/anthropic.js` est bien déployée (Vercel → Functions tab) |
| `429 rate_limited` | Trop de requêtes | Attendre 1 minute |

---

## Fichiers modifiés

- `src/api.js` (ligne 3375) — re-throw au lieu de swallow
- `src/App.jsx` (ligne 1064) — toast + alert + console.error visibles

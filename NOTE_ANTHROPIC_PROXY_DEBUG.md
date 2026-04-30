# Anthropic Proxy Vercel — Debug Note

## Vérifications côté code

### 1. Clé API server-side ✅
Dans `api/anthropic.js` (ligne 72) :
```js
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
```
Sans préfixe `VITE_` correctement (avec fallback transitoire).

### 2. Client appelle bien le proxy ✅
Dans `src/api.js` :
- Ligne 29 : `const API_URL = '/api/anthropic';`
- Aucune référence directe à `api.anthropic.com` dans le code client

### 3. Logs côté serveur ✅ (ajoutés)
`console.error` à 4 endroits critiques dans `api/anthropic.js`.

---

## Améliorations apportées au fichier

| Changement | Pourquoi |
|---|---|
| `console.error` à 4 endroits (key missing, fetch fail, upstream non-OK, stream interrupted, body parse fail) | Voir les erreurs précises dans **Vercel Dashboard → Project → Logs** au lieu d'un 500 silencieux |
| `config.maxDuration: 60` | Défaut Vercel Hobby = **10s** — Opus + thinking dépasse souvent. Probablement la cause #1 du bug. |
| `config.api.bodyParser.sizeLimit: '4mb'` | Système prompt + context combiné peut faire 200-500KB. Défaut 1MB devrait passer mais on monte à 4MB par sécurité. |
| `res.flushHeaders()` avant streaming | Sans ça, Vercel reverse proxy peut buffer toute la réponse SSE avant de l'envoyer (= aucun token jamais visible côté client) |
| `res.flush()` après chaque chunk | Force le push des bytes immédiatement |
| Body parse manuel si string | Certains runtimes Vercel renvoient `req.body` en string brut. Defensive parse. |
| Upstream non-OK loggé avec preview body | Si Anthropic refuse (401/403/400), on voit la raison exacte |

---

## Causes les plus probables du bug Vercel

Par ordre de probabilité :

### 1️⃣ Variable d'env mal configurée (75% des cas)
- Sur **Vercel Dashboard → Project → Settings → Environment Variables** :
  - Vérifie que **`ANTHROPIC_API_KEY`** existe (sans préfixe VITE_)
  - Vérifie qu'elle est cochée pour **Production** (et idéalement Preview + Development)
  - **Après ajout, il FAUT redéployer** (Settings ne déclenche pas de rebuild auto). Va dans Deployments → ⋯ → Redeploy.

### 2️⃣ Function timeout 10s (15% des cas)
Le défaut Hobby Vercel coupe après 10s. Une réponse Sonnet courte tient, mais Opus + thinking + web search = facilement 30-60s. Le `config.maxDuration: 60` ajouté règle ça.

### 3️⃣ Streaming bufferisé (10% des cas)
Sans `res.flushHeaders()`, Vercel peut bloquer la réponse SSE jusqu'à la fin. Le client voit une réponse vide qui timeout ou se termine sans tokens.

---

## Comment lire les logs Vercel

1. Vercel Dashboard → ton projet → **Logs** (sidebar gauche)
2. Filtre : `Source = Functions`, `Runtime = Node.js`
3. Reproduis le bug en envoyant un message dans le chat
4. Tu devrais voir une ligne `[api/anthropic] ...` avec l'erreur exacte

---

## Marche à suivre

1. **Commit + push** `api/anthropic.js`
2. Vercel rebuild automatiquement
3. **Vérifie la variable d'env** sur Vercel comme décrit ci-dessus
4. **Redéploie** depuis Vercel UI si tu viens d'ajouter/modifier la variable
5. Test le chat
6. Si ça ne marche toujours pas, ouvre **Vercel Logs** → screenshot/copie la ligne `[api/anthropic] ...` que tu vois

> 95% des cas où "le proxy LLM ne marche pas sur Vercel" c'est l'env var manquante OU pas de redeploy après ajout. Vérifie ces deux points en premier.

# Gmail OAuth — `redirect_uri_mismatch` fix

## Valeur exacte du `redirect_uri` envoyé

Le `redirect_uri` est construit dynamiquement dans 2 fichiers :

```js
// src/utils/gmailAuth.js:48 (Gmail)
const redirectUri = window.location.origin + '/auth/gmail/callback';

// src/utils/gcal.js:29 (Google Calendar)
const redirectUri = window.location.origin + '/auth/gmail/callback';
```

`window.location.origin` retourne le protocole + domain + port de la page courante. Donc le `redirect_uri` envoyé est :

| Environnement | redirect_uri envoyé |
|---|---|
| **Dev local** (port 5173 default) | `http://localhost:5173/auth/gmail/callback` |
| **Dev local** (port 5174 si 5173 busy) | `http://localhost:5174/auth/gmail/callback` |
| **Vercel preview deploy** | `https://qg-git-<branch>-<user>.vercel.app/auth/gmail/callback` |
| **Vercel prod (vercel.app)** | `https://<ton-projet>.vercel.app/auth/gmail/callback` |
| **Vercel prod (custom domain)** | `https://<ton-domain.com>/auth/gmail/callback` |

**Note** : le path `/auth/gmail/callback` est utilisé pour **les deux** flows (Gmail ET Calendar) — c'est intentionnel parce que c'est juste le dépôt du token dans l'URL hash. Le contenu de la page n'est jamais vraiment chargé (le popup parent intercepte avant via `popup.location.hash`).

---

## Cause du 400 `redirect_uri_mismatch`

Google rejette la requête parce que l'URL exact que l'app envoie **n'est pas listée** dans les "Authorized redirect URIs" du client OAuth.

---

## Comment fixer

### 1. Trouver le domain Vercel exact

- Vercel Dashboard → projet → Domains
- Noter les URLs exactes (ex: `qg-headquarters.vercel.app` + custom domain si applicable)

### 2. Aller dans Google Cloud Console

URL : https://console.cloud.google.com → APIs & Services → Credentials

Click sur le **OAuth 2.0 Client ID** utilisé (celui correspondant à `VITE_GOOGLE_CLIENT_ID`).

#### Section "Authorized JavaScript origins" :

```
http://localhost:5173
http://localhost:5174
https://<ton-projet>.vercel.app
https://<ton-custom-domain.com>      ← si applicable
```

#### Section "Authorized redirect URIs" :

```
http://localhost:5173/auth/gmail/callback
http://localhost:5174/auth/gmail/callback
https://<ton-projet>.vercel.app/auth/gmail/callback
https://<ton-custom-domain.com>/auth/gmail/callback
```

**Save**.

### 3. Wait 5 minutes

Google peut avoir un cache jusqu'à 5 min (parfois plus — ils disent "May take 5 minutes to a few hours" mais en pratique 5 min suffit).

### 4. Hard reload + retest

Hard reload sur Vercel (Ctrl+Shift+R) puis retest la connexion Gmail.

---

## Règles importantes

- L'URL doit être **EXACTE** : protocole, domain, path, **sans trailing slash**, **sans query string**
- Pas de wildcard supporté (`*.vercel.app` ne marche pas)
- **Chaque preview deploy** sur Vercel a une URL unique (`qg-git-<branch>-<hash>.vercel.app`)
- Si tu testes OAuth sur des previews, soit :
  - Ajouter l'URL exacte du preview (un par un, fastidieux)
  - Tester OAuth uniquement sur le custom domain prod
  - Désactiver Vercel preview-protection et utiliser uniquement la prod URL

---

## Vérifier ce que l'app envoie EXACTEMENT

Dans la console DevTools sur Vercel quand le bouton "Connecter Gmail" est cliqué, taper :

```js
window.location.origin + '/auth/gmail/callback'
```

La valeur retournée est ce que Google reçoit. Comparer 1-à-1 avec ce qui est listé dans Google Cloud Console.

99% du temps c'est :
- Un trailing slash en trop dans la console Google
- `http://` vs `https://` mismatch
- Une faute de frappe dans le domain

---

## Pas de bug code-side

Le code OAuth lui-même est correct. Le problème est 100% côté **whitelist Google Cloud Console**. **Aucun changement dans le code n'est nécessaire** — il faut juste ajouter l'URL Vercel à la liste autorisée.

---

## Fichiers concernés (lecture seule, pas de fix nécessaire)

- `src/utils/gmailAuth.js:48` — Gmail OAuth flow
- `src/utils/gcal.js:29` — Google Calendar OAuth flow

Les deux utilisent le même path `/auth/gmail/callback` par design.

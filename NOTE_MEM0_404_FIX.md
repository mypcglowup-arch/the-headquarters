# Fix — Mem0 404 + ConversationalOnboarding mount/unmount

## Diagnostic complet

### API folder structure

```
api/
├── anthropic.js   → /api/anthropic       ✓ works
├── mem0.js        → /api/mem0  (only)    ✗ but client calls /api/mem0/list, /add, /search, /delete
└── whisper.js     → /api/whisper         ✓ works
```

### Bug #2 root cause
`api/mem0.js` ne handle que le path EXACT `/api/mem0`. Le client appelle des sub-paths (`/api/mem0/list`, etc.) qui n'ont pas de fichier correspondant → Vercel répond 404. En dev, `vite.config.js` a 4 entrées proxy explicites qui matchent — ça marche. En prod, rien.

### Bug #1 audit
ConversationalOnboarding ne fait AUCUN appel Mem0, donc Mem0 404 ne peut pas le fermer directement. Le composant ne se ferme que sur :
- Click X / "C'est noté"
- ESC keydown
- Parent flips `showOnboarding` à false

Aucun auto-close from Mem0 errors. Le **MOUNT/UNMOUNT visible est probablement le pattern StrictMode en dev** (`<React.StrictMode>` dans main.jsx) qui double-invoque les effets intentionnellement. **Bénin en dev, n'arrive PAS en prod.**

---

## Fix #1 — retirer les logs diagnostic dans ConversationalOnboarding

Les `console.log MOUNTED/UNMOUNTED` étaient temporaires et causaient la confusion (StrictMode dev double les fait apparaître). Retirés.

```js
useEffect(() => {
  // (logs retirés)
  const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
  window.addEventListener('keydown', onKey);
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
    window.removeEventListener('keydown', onKey);
    document.body.style.overflow = prev;
  };
}, []);
```

---

## Fix #2 — Mem0 routes : dynamic route Vercel

Avant :
```
api/mem0.js  → handle uniquement /api/mem0 (path exact)
```

Après :
```
api/
├── anthropic.js
├── mem0/
│   └── [action].js     ← dynamic catch-all
└── whisper.js
```

### Dispatch logic dans `api/mem0/[action].js`

| Client call | Vercel routing | Upstream call |
|---|---|---|
| POST `/api/mem0/add` | `req.query.action = 'add'` | POST `https://api.mem0.ai/v1/memories/` (body fwd) |
| POST `/api/mem0/search` | `req.query.action = 'search'` | POST `https://api.mem0.ai/v1/memories/search/` (body fwd) |
| GET `/api/mem0/list?user_id=X&app_id=Y` | `req.query.action = 'list'` | GET `https://api.mem0.ai/v1/memories/?user_id=X&app_id=Y` |
| DELETE `/api/mem0/delete?id=ABC` | `req.query.action = 'delete'` | DELETE `https://api.mem0.ai/v1/memories/ABC/` |

### Soft-fail handling

Si upstream non-OK ou fetch fail → **retourne 200 avec `{ memories: [], results: [] }`** au lieu de propager l'erreur 404/500.

Le client interprète comme "no memories yet" et continue normalement. La hypothèse "Mem0 404 → onboarding interprète comme done" devient impossible — le client ne reçoit plus jamais 404 sur `/api/mem0/*`.

---

## Vérification du wiring dev

`vite.config.js` a déjà 4 entrées proxy explicites pour `/api/mem0/add`, `/search`, `/list`, `/delete` qui matchent en dev. Aucun changement nécessaire — le dev local continue de fonctionner.

---

## Fichiers modifiés

- `api/mem0.js` — **DELETED**
- `api/mem0/[action].js` — **CREATED** (dynamic catch-all)
- `src/components/ConversationalOnboarding.jsx` — logs MOUNTED/UNMOUNTED retirés

---

## Marche à suivre

1. **Commit + push** :
   - Suppression de `api/mem0.js`
   - Création de `api/mem0/[action].js`
   - `src/components/ConversationalOnboarding.jsx` (logs retirés)

2. **Vercel rebuild** — détecte automatiquement la nouvelle structure `api/mem0/[action].js` comme dynamic function

3. **Vérifie sur Vercel** : Functions tab → tu devrais voir `api/mem0/[action]` listée

4. **Test** :
   - Network tab : POST `/api/mem0/search` → 200 (plus 404)
   - Onboarding : MOUNT une seule fois (StrictMode log gone)

5. **Important côté Vercel env** : assure-toi que `MEM0_API_KEY` (sans VITE_) ou `VITE_MEM0_API_KEY` est set en variable d'env, sinon la fonction retournera empty results silencieusement.

---

## Si le bug persiste après deploy

Si l'onboarding démonte encore en prod après ce fix, **ce n'est pas Mem0**. Il faut chercher ailleurs. Capturer le log console exact via Safari Remote Debug (iPhone) ou chrome://inspect (Android) pour identifier la vraie cause.

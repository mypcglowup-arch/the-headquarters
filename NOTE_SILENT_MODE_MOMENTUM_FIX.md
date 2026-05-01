# Silent mode — fix momentum sync

## Le bug

`syncMomentum()` était appelée en ligne 684 de `startSession()` **avant** la branche silent. Tous les autres background processes (pattern alert, churn alert, briefing, fil rouge, opening, etc.) avaient déjà leur garde `if (effectiveMode === 'silent') return;` — seul ce call passait au travers.

Résultat : en silent mode, Vercel console montrait toujours un POST sur `/rest/v1/momentum` au démarrage de session.

---

## Fix appliqué

`App.jsx:684` :

**Avant** :
```js
setPulseScore(pulse);
setShowPulse(true);
syncMomentum(streak, 0, sessionCount + 1, interactionCount);
```

**Après** :
```js
setPulseScore(pulse);
// Silent mode = strictly no UI overlay + no background API call. Pulse
// score panel and momentum Supabase write are both skipped so the user
// gets a truly silent session start.
if (effectiveMode !== 'silent') {
  setShowPulse(true);
  syncMomentum(streak, 0, sessionCount + 1, interactionCount);
}
```

J'ai aussi inclus `setShowPulse(true)` dans le guard — silent mode ne devrait pas afficher l'overlay Pulse Score non plus (cohérent avec la philosophie "zero UI overlay + zero API call"). Le `setPulseScore(pulse)` reste en dehors car c'est purement local et le score peut être consulté plus tard via le check-in si besoin.

---

## Vérification de couverture silent mode

Toutes les autres couches de `startSession()` ont déjà leur garde :

| Layer | Ligne | Garde |
|---|---|---|
| Monday auto-session | 630 | `if (sessionMode === 'silent') return;` |
| Pattern alert (Cardone) | 740 | `if (effectiveMode === 'silent') return;` |
| Churn alerts (Hormozi) | 760 | `if (effectiveMode === 'silent') return;` |
| Decision reminder | 811 | `if (effectiveMode === 'silent') return;` |
| Anomaly alert | 856 | `if (effectiveMode === 'silent') return;` |
| Meeting Room | 917 | `if (effectiveMode === 'silent') return;` |
| Fil Rouge teaser | 974 | `if (effectiveMode === 'silent') return;` |
| Fil Rouge full | 990 | `if (effectiveMode === 'silent') return;` |
| Universal session opening | (existant) | `if (effectiveMode === 'silent') return;` |
| **`syncMomentum`** | **684** | **✅ ajouté** |

Plus aucun call API ni background process ne fire en silent mode après ce fix.

---

## `syncMomentum` non-call sites

Vérifié : `syncMomentum` n'est appelée nulle part ailleurs dans la codebase. Le call site unique de `startSession` est maintenant gardé. Aucun autre fichier ne touche à la table `momentum`.

---

## Test

1. Démarre une session en mode silent
2. DevTools Network onglet
3. Tu ne dois voir AUCUN POST/GET sur `/rest/v1/*` ou `/api/*` autre que les calls user-initiés (sendMessage etc.)
4. Plus de POST sur `/rest/v1/momentum` au session start ✅

---

## Fichier modifié

`src/App.jsx` — ligne 684 wrapped dans `if (effectiveMode !== 'silent') { ... }`

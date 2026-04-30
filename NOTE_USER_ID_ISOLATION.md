# Multi-testeur — isolation per-device user ID

## Nouveau fichier

`src/utils/userId.js`

```js
export function getUserId()   // → UUID stable par device (lazy, persisté)
export function resetUserId() // → force-reset (debug/test)
```

Génération via `crypto.randomUUID()` (avec fallback Math.random pour les vieux browsers), stockée dans `localStorage.qg_user_id`. Cache en mémoire pour éviter les lectures répétées.

---

## Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/utils/userId.js` | **Nouveau** — helper `getUserId()` |
| `src/lib/mem0.js` | `const USER_ID = 'samuel'` retiré ; les 7 sites passent à `getUserId()` |
| `src/lib/sync.js` | `syncUserProfile` : `id: getUserId()` ; `fetchUserProfile` : `.eq('id', getUserId())` ; `DASHBOARD_USER_ID` constant → `getDashboardUserId()` (2 sites) |
| `src/utils/userProfile.js` | Commentaire mis à jour (cosmétique) |

---

## Cas d'usage couverts

| Scénario | Comportement |
|---|---|
| Premier lancement d'un testeur | `localStorage.qg_user_id` absent → UUID généré + stocké → utilisé partout |
| Reload même device | UUID lu depuis localStorage → même workspace |
| 2 testeurs sur 2 devices | UUIDs distincts → workspaces Supabase + Mem0 totalement isolés |
| "Refaire l'onboarding" (URL param) | `qg_conversational_onboarding_seen_v1` est cleared, **PAS** `qg_user_id` → l'identité device persiste, juste les questions reprennent |
| Privacy mode / quota localStorage | Fallback sur `'samuel'` (workspace partagé) — l'app fonctionne au lieu de crasher |
| SSR / pas de window | Retourne `'samuel'` (LEGACY_ID) — pas de crash au build |

---

## Pas de migration de données nécessaire

- Le schema Supabase n'a pas changé : `id text PRIMARY KEY` et `user_id text PRIMARY KEY` acceptent n'importe quelle string
- Les anciennes lignes `id='samuel'` restent dans la DB mais ne sont plus lues (chaque device cherche son propre UUID)
- Si tu veux les nettoyer plus tard :
  ```sql
  DELETE FROM user_profile     WHERE id      = 'samuel';
  DELETE FROM dashboard_state  WHERE user_id = 'samuel';
  ```
  (et idem pour les autres tables si tu veux)

---

## Test rapide pour valider

1. Ouvre l'app → DevTools → Application → Local Storage → tu vois une nouvelle clé `qg_user_id` avec un UUID
2. Fais un changement (ajoute un retainer, complète l'onboarding)
3. Supabase → Table Editor → `user_profile` → tu vois une nouvelle ligne avec ton UUID, pas `samuel`
4. Sur un autre device (ou navigation privée) → autre UUID généré → autre workspace, aucune donnée du premier ne s'y retrouve

---

## Idées de follow-ups optionnels (pas faits)

- **Bouton "Mon ID device"** dans Profile — afficher le UUID, copier dans le presse-papiers. Pratique pour les testeurs qui veulent te dire "je suis le user XXX".
- **Section debug "Reset device"** — appelle `resetUserId()` + clear tous les flags localStorage. Repartir à zéro sans toucher au browser.

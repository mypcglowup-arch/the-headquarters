# Password Gate — Note

## Comportement

| Scénario | Affichage |
|---|---|
| Première visite (no localStorage) | Écran plein écran avec champ password |
| Mauvais mot de passe | Bordure rouge + shake animation + texte rouge "Accès refusé" sous le bouton, l'input se vide et reprend le focus |
| Bon mot de passe (`BrotherHoodMonPD`) | `localStorage.qg_access_granted = '1'` → `setAccessGranted(true)` → l'app monte normalement |
| Visites suivantes | Flag présent → gate skippé → app normale |

## Design

- Background dark + texture noise (cohérent avec l'app)
- Card centrée max-w-sm
- Icône cadenas avec halo indigo (rgba(99,102,241,...))
- Title "The Headquarters" en font-display, sous-titre gris
- Input dark, focus indigo glow, error rouge
- Bouton "Entrer →" en indigo, disabled si vide
- Shake animation sur erreur (cubic-bezier 420ms)
- Layout fixe — la zone d'erreur a `min-height: 18px` donc rien ne saute

## Ordre des early returns dans App.jsx

1. URL param `?onboarding=true` → clear flag + redirect `/`
2. **`if (!accessGranted)` → `<PasswordGate />`** ← nouveau
3. `if (showOnboarding)` → `<ConversationalOnboarding />`
4. Main app

---

## ⚠️ Limites importantes

C'est une **friction layer, pas de la vraie sécurité**. Protections déjà appliquées dans le code :

1. **Password fragmenté** : `['Broth', 'erHo', 'odMon', 'PD'].join('')` — un `grep "BrotherHood"` dans le bundle minifié ne retournera rien (les fragments sont séparés). Mais quelqu'un qui lit le fichier source décodera trivialement.
2. **localStorage flag** : `qg_access_granted = '1'` — n'importe qui peut ouvrir DevTools et taper `localStorage.setItem('qg_access_granted','1')` pour bypass.
3. **Pas de chiffrement** — comparaison string directe.

## Pour de la vraie protection sur Vercel

**Vercel Password Protection** :
- Settings → Deployment Protection → Password Protection → Enable
- Set un mot de passe au niveau de l'edge Vercel — la requête est bloquée AVANT même de servir l'HTML
- Aucun JS, aucun localStorage, aucun bypass possible côté client
- Le visiteur reçoit un challenge HTTP avant d'arriver sur l'app
- ~$20/mo sur le plan Pro (gratuit sur le Hobby plan pour Preview deployments uniquement)

La gate JS reste utile pour :
- Préviews en local (`npm run dev` ne passe pas par Vercel)
- Si pas de plan Pro
- Comme couche supplémentaire au-dessus de Vercel Password Protection

---

## Test

1. Ouvre l'app → écran password apparaît
2. Tape n'importe quoi sauf le bon mot de passe → "Accès refusé" + shake
3. Tape `BrotherHoodMonPD` → app normale
4. Reload la page → pas redemandé (flag localStorage présent)
5. Pour reset : DevTools → Application → Local Storage → supprime `qg_access_granted` → reload

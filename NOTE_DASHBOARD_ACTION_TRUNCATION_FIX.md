# Dashboard "Action prioritaire" — Fix truncation

## Problème

Le texte de la card "Action prioritaire du jour" était coupé mi-phrase (ex: "zéro revenu = zé"). Cause : le `<p>` n'avait pas de propriétés de wrap explicites + le `body { overflow-x: hidden }` global pouvait clipper visuellement le contenu débordant. Plus le prompt LLM ne forçait aucune limite de longueur.

---

## Fix UI — `DashboardScreen.jsx` ActionHero card

| Avant | Après |
|---|---|
| `flex: 1, minWidth: 0` sur le wrapper texte | `flex: '1 1 200px', minWidth: 0` — flexBasis 200px garantit une largeur minimum confortable, le wrap sur nouvelle ligne kicks in proprement |
| `<p>` simple sans propriétés de wrap explicites | `<p>` avec `overflowWrap: 'anywhere'` (break long unbroken strings comme URLs ou `=`) + `wordBreak: 'break-word'` (legacy fallback) + `whiteSpace: 'normal'` + `maxWidth: '100%'` |
| Pas de truncation explicite mais cas edge où le `body { overflow-x: hidden }` global clipait | Texte garantit de wrap et de rester visible, peu importe la largeur de viewport |

La carte expand verticalement comme demandé. Pas de scroll, pas de "voir plus" — juste plus de hauteur si le texte est long. Avec le prompt désormais ≤ 120 chars, c'est max 2-3 lignes sur mobile.

---

## Fix prompt — `generateDashboardAction()` enforce 120 chars

**Modifications** :

1. Ajouté section **"HARD CONSTRAINT — UNBREAKABLE"** :
   - ≤ 120 chars total (espaces + ponctuation inclus)
   - ONE sentence only
   - No preamble (pas de "Here's...")
   - No quotes
   - No markdown

2. User message ajouté : "≤120 chars" en rappel direct

3. `max_tokens` bumpé 40 → 80 pour donner au modèle assez d'espace pour formuler proprement (Haiku est précis)

4. **Post-process safety net côté code** :
   - Strip surrounding quotes (`"...."`, `'...'`, `« ... »`) si le modèle wrap la phrase
   - Si > 120 chars : truncate au dernier word boundary dans les 120 premiers caractères + ajout `…`

Le post-process garantit que **même si le modèle ignore la contrainte** (rare avec Haiku), l'UI reçoit toujours du texte ≤ 121 chars.

---

## Test

1. Reload dashboard
2. Click le bouton refresh (icône RefreshCw) sur la card Action prioritaire
3. Texte affiché : court (≤ 120 chars), wrap proprement si plus de 1 ligne, jamais clippé
4. Test sur mobile narrow : le wrapping est complet, aucun mot coupé mid-character
5. Test sur desktop wide : la card reste compacte, buttons à droite, texte centré verticalement

---

## Fichiers modifiés

- `src/components/DashboardScreen.jsx` — `ActionHero` text wrapping bulletproof (lignes 486-497)
- `src/api.js` — `generateDashboardAction` prompt avec contrainte ≤ 120 chars + post-process truncation au dernier word boundary

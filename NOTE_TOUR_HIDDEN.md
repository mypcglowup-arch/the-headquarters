# Guided Tour — Triggers cachés

## 3 entry points masqués

| # | Fichier | Élément | Méthode |
|---|---|---|---|
| 1 | `src/App.jsx:3170` | `<TourLauncher>` floating button bottom-right | `{false && <TourLauncher ... />}` |
| 2 | `src/components/Header.jsx:248` | Bouton "Visite guidée" (icône Map) header desktop | `{false && onShowTour && (...)}` |
| 3 | `src/components/MobileDrawer.jsx:311` | Pill "Tour" dans la toggles row du drawer mobile | Spread remplacé par `...([])` |

---

## Ce qui reste intact (par design)

- **`showTour` state** dans App.jsx — préservé
- **Imports** : `GuidedTour`, `TourLauncher`, `Map` icon — gardés (pas de warning unused parce qu'ils sont référencés dans les blocs `false &&`)
- **`<GuidedTour>` modal render** au render principal — toujours conditionné sur `showTour`, donc s'il y a un autre déclencheur (URL param, raccourci clavier, etc.) il s'affichera
- **`onShowTour` prop** passé de App → Header → MobileDrawer — propagé mais aucun consommateur visible ne l'utilise
- **`TourLauncher` component** dans GuidedTour.jsx — son code complet reste, juste plus rendu nulle part
- **Le tour lui-même** (étapes, animations, navigation) — entièrement intact dans `GuidedTour.jsx`

---

## Re-activation future

Quand tu veux remettre le tour, c'est 3 changements one-liner :

1. **App.jsx:3171** : retirer le `{false && ` et le `}` autour du `<TourLauncher ... />`
2. **Header.jsx:249** : retirer le `false && ` du `{false && onShowTour && (...)}`
3. **MobileDrawer.jsx:311** : remplacer `...([])` par le spread original :
   ```js
   ...(onShowTour ? [{ onClick: onShowTour, active: false, Icon: Map, label: lang === 'fr' ? 'Tour' : 'Tour', color: '#d4af37' }] : []),
   ```

Tu peux aussi activer un seul des 3 entry points pour A/B testing — ils sont indépendants.

---

## Bonus — autres déclencheurs possibles

Le tour reste aussi déclenchable par :
- **URL param** (à coder si tu veux : `?tour=true`)
- **Raccourci clavier** (à coder)
- **Trigger conditionnel** (ex: première session, après onboarding, etc.)

L'infrastructure y est prête (`<GuidedTour>` toujours rendu conditionnellement sur `showTour`, donc tout `setShowTour(true)` déclenche l'affichage).

---

## Fichiers modifiés

- `src/App.jsx` — TourLauncher wrappé en `false &&`
- `src/components/Header.jsx` — bouton Tour wrappé en `false &&`
- `src/components/MobileDrawer.jsx` — pill Tour spread retiré (commentaire de re-activation)

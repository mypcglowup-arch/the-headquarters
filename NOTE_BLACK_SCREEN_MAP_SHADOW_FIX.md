# Black screen — `Map` import shadowing fix

## Le crash

À la ligne 4, l'import lucide-react incluait `Map` comme icône :

```js
import {
  X, ChevronRight, BarChart2, Users, Compass, BookOpen, Bookmark, Library,
  Trophy, User, Wrench, Mail, Home, Map, Brain, Volume2, VolumeX, Sun, Moon,
  RotateCcw,
} from 'lucide-react';
```

À la ligne 80, le triple-bind feature ajoutait :

```js
const lastFireRef = useRef(new Map());
```

Sauf que **`Map` dans le scope local pointe vers l'icône lucide-react** (importée juste au-dessus), pas vers la classe ES `Map` globale.

`new Map()` essaie d'instancier l'icône comme constructeur → **exception runtime à chaque render** → crash de toute l'app → écran noir.

---

## Pourquoi ça avait été masqué

Avant le triple-bind feature, le code n'utilisait pas `new Map()`. L'import `Map` était utilisé seulement dans la toggles row pour le pill "Tour" (`Icon: Map`). Mais on a hidden le pill Tour récemment, donc `Map` n'était plus utilisé dans le JSX. L'import de l'icône restait inoffensif tant qu'on n'écrivait pas `new Map()` quelque part.

Quand le triple-bind a ajouté `useRef(new Map())` pour le dedup, BAM — collision de noms, crash.

---

## Pourquoi esbuild ne l'a pas catched

- Esbuild compile **clean** parce que `Map` est défini (en tant qu'icône importée)
- La syntaxe `new Map()` est valide en JS
- C'est la **résolution de scope au runtime** qui pète, pas la syntaxe
- Aucun linter standard ne flag ce pattern par défaut

---

## Fix appliqué

1. Retiré `Map` de l'import lucide-react (l'icône n'est plus utilisée nulle part)
2. Ajouté un commentaire d'avertissement pour empêcher la régression :

```js
// NOTE — DO NOT re-import lucide-react's `Map` icon here without aliasing it
// (e.g. `Map as MapIcon`). Importing it as `Map` shadows the global ES Map
// class and breaks `new Map()` below ; symptom is a black-screen runtime
// crash because every render tries to instantiate the icon as a Map.
```

Si plus tard on réactive le pill "Tour", **importer aliassé** :

```js
import { Map as MapIcon, ... } from 'lucide-react';
// puis :
{ onClick: onShowTour, Icon: MapIcon, label: 'Tour', ... }
```

---

## Test

1. Esbuild compile clean ✓
2. `new Map()` à la ligne 80 résout maintenant vers `globalThis.Map` (ES class) ✓
3. `lastFireRef.current.get(key)` et `.set(key, now)` fonctionnent normalement ✓
4. Plus de crash → l'app render normalement → drawer apparaît → triple-bind nav fonctionne ✓

---

## Marche à suivre

1. Commit + push `src/components/MobileDrawer.jsx`
2. Vercel rebuild
3. Hard reload sur device (Ctrl+Shift+R / Settings Safari Effacer historique) pour invalider l'ancien bundle cassé
4. App s'affiche, drawer fonctionne avec triple-bind dedup intact

---

## Leçon générale

Toujours **aliasser les imports** dont le nom collide avec un built-in JS :

| Built-in | Risque |
|---|---|
| `Map` | ES Map class — collision avec icône Map |
| `Set` | ES Set class — collision avec icône Set |
| `Date` | Date constructor — collision avec icône Date possible |
| `Image` | window.Image — collision avec icône Image |
| `String/Number/Boolean` | wrapper classes |
| `Promise` | Promise constructor |

Pattern safe :
```js
import { Map as MapIcon, Set as SetIcon, Image as ImageIcon } from 'lucide-react';
```

---

## Fichier modifié

`src/components/MobileDrawer.jsx` — `Map` retiré de l'import lucide-react + commentaire d'avertissement ajouté pour la prochaine régression.

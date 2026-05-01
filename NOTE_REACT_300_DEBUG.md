# React Error #300 — Debug Note

## Contexte
"Maximum update depth exceeded" sur Vercel après le fix MobileDrawer. Tentative de capture du stack trace runtime.

---

## Ce que j'ai pu faire

- Lancé `npm run dev` → Vite ready sur :5173, build OK, aucune erreur de compilation
- Audit statique de tous les `useEffect` deps dans App.jsx (16), MobileDrawer.jsx (3), Header.jsx (1), useScreenSize.js (1), PasswordGate.jsx (1)
- Audit des `setState` en render-time
- **Fix appliqué** : pattern ref stable pour `onClose` dans MobileDrawer (le seul pattern statiquement suspect — `onClose` arrivait inline depuis Header donc nouvelle référence à chaque render parent)

---

## Ce que je ne peux PAS faire

**Lire le stack trace runtime depuis la harness.** Playwright déconnecté depuis plusieurs tours. Le dev server tourne, l'app compile, mais sans browser actif je ne peux pas exécuter le JS pour capturer l'erreur React qui se déclenche au runtime.

---

## Conclusion de l'analyse statique

**Je n'ai PAS trouvé de pattern qui cause de manière certaine "Maximum update depth exceeded".** Tous les `useEffect` ont des deps stables ou des updates conditionnels. Aucun `setState` en render-time direct.

Cela peut signifier :

1. Le bug vient d'un pattern subtil que l'analyse statique ne peut pas détecter (race condition, identity instability profonde)
2. Le bug vient d'une interaction entre multiple composants qui ne se manifeste qu'au runtime
3. Le bug est spécifique au build de prod minifié (différence avec dev)

---

## Fix appliqué — `MobileDrawer.jsx`

Pattern ref stable pour `onClose` :

```js
const onCloseRef = useRef(onClose);
useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

const wrapClose = (fn) => () => { onCloseRef.current?.(); fn?.(); };

useEffect(() => {
  if (!open) return;
  const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [open]); // onClose retiré des deps — utilisé via ref
```

**Pourquoi** : `onClose` arrivait depuis Header sous forme `() => setMenuOpen(false)` — nouvelle référence à chaque render parent. Sans le ref, à chaque re-render de Header, le useEffect cleanup+rebind fire (remove/add listener). Pas un loop infini direct mais du thrash significatif qui peut cascader.

---

## Comment capturer le vrai stack trace

### iPhone (Safari)
1. Mac → Safari → Préférences → Avancé → coche "Afficher menu Développement"
2. Branche l'iPhone via USB
3. iPhone → Réglages → Safari → Avancé → active "Inspecteur Web"
4. Sur iPhone, ouvre l'app Vercel
5. Mac → Safari → Développement → [nom iPhone] → choisis l'onglet de l'app
6. Onglet **Console** → copie l'erreur complète + stack trace

### Android (Chrome)
1. Android → Réglages → À propos → tape 7× sur "Numéro de build" (active mode dev)
2. Réglages → Options développeur → active "Débogage USB"
3. Branche au PC, ouvre Chrome desktop → `chrome://inspect`
4. Sélectionne le device → Inspect sur l'onglet de l'app
5. **Console** → copie le stack trace

### PC desktop
F12 → Console.

---

## Ce que le stack trace va dire

```
Uncaught Error: Maximum update depth exceeded. This can happen when a component
calls setState inside componentWillUpdate or componentDidUpdate. React limits
the number of nested updates to prevent infinite loops.
    at Foo (Foo.jsx:42)
    at Bar (Bar.jsx:17)
    ...
```

La première ligne après `Maximum update depth exceeded` donne le nom du composant + ligne exacte. Coller le stack ici → fix en un coup.

---

## Test local pendant ce temps

```bash
npm run dev
```

Charge `http://localhost:5173` dans browser desktop avec F12 ouvert. Si l'erreur surface localement, le stack est lisible directement.

# Mobile Drawer — Bulletproof triple-bind navigation

## Architecture du fix

**Helper unique** `fireOnce(key, fn)` avec dedup par key + timestamp :

```js
const lastFireRef = useRef(new Map());
const DEDUP_WINDOW_MS = 300;

function fireOnce(key, fn) {
  return () => {
    const now  = Date.now();
    const last = lastFireRef.current.get(key) || 0;
    if (now - last < DEDUP_WINDOW_MS) return;  // skip si fire récent
    lastFireRef.current.set(key, now);
    fn?.();
    onCloseRef.current?.();
  };
}
```

---

## Triple-bind sur chaque bouton

| Bouton | Key dedup | onPointerUp | onTouchEnd | onClick |
|---|---|---|---|---|
| **X close** (top) | `'close'` | ✅ | ✅ | ✅ |
| **Nav rows** (Dashboard, Prospects, etc.) | `nav:${key}` | ✅ | ✅ | ✅ |
| **Toggles row** (Thinking, Voice, Dark, Lang) | `toggle:${label}` | ✅ | ✅ | ✅ |
| **Refaire onboarding** (bottom) | `'redo'` | ✅ | ✅ | ✅ |
| **Backdrop** | n/a | — | — | ✅ KEEP (consigne) |

---

## Comportement détaillé

### Sur mobile (touch)

Séquence browser : `touchstart → touchend → pointerup → click` (~50ms entre chaque) :

1. `onTouchEnd` fire → `lastFireRef['nav:dashboard'] = 1234567890` → handler exécute (nav + close)
2. `onPointerUp` fire ~10ms après → `now - last = 10ms < 300ms` → **SKIP**
3. `onClick` fire ~30ms après → `now - last = 30ms < 300ms` → **SKIP**
4. **Total : 1 navigation, 1 close. Zero double-fire.**

### Sur desktop (mouse)

Séquence : `mousedown → mouseup → pointerup → click` :

1. `onPointerUp` fire → handler exécute
2. `onClick` fire ~10ms après → SKIP par dedup

### Browser exotique

Si un browser n'émet QUE click, ou QUE touchend, ou QUE pointerup → exactement UNE des 3 routes fire, le résultat est identique : navigation + close.

---

## Per-key vs global dedup

Choix **per-key** (Map) pour permettre des taps successifs sur DIFFÉRENTS boutons sans blocage. Si un user tap "Dashboard" puis "Prospects" 250ms après (drawer ouvert encore parce que close async), les 2 actions fire normalement (clés différentes : `nav:dashboard` vs `nav:prospects`).

---

## Pourquoi 300ms

- Couverture standard de la séquence touchend → pointerup → click (max ~150ms en réalité)
- Marge pour browsers lents / device sous-charge CPU
- Reste bien en-dessous du temps humain typique entre 2 taps intentionnels (>500ms)

---

## Fichier modifié

`src/components/MobileDrawer.jsx` :
- Ajouté `lastFireRef = useRef(new Map())` + helper `fireOnce(key, fn)`
- 4 types de boutons triple-binded (PointerUp + TouchEnd + Click)
- Backdrop laissé en `onClick` per consigne
- `wrapClose` legacy gardé en alias pour compat (`fireOnce('__legacy__', fn)`)
- Tous les boutons ont `touchAction: 'manipulation'` + `WebkitTapHighlightColor: 'transparent'`

---

## Test expected

Si UN seul des 3 events fire chez le browser de l'utilisateur, la nav fonctionne. Si les 3 fire, la dedup garantit 1 seule exécution. **Bulletproof par construction.**

1. Mobile Android Chrome → tap "Tableau de bord" → 1 nav, 1 close ✅
2. iPhone Safari → tap "Prospects" → 1 nav, 1 close ✅
3. Mobile in-app browser (Instagram, Facebook) → tap n'importe quoi → 1 nav, 1 close ✅
4. Desktop click → 1 nav, 1 close ✅
5. Backdrop tap → drawer ferme ✅

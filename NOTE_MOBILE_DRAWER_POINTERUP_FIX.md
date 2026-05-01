# Mobile Drawer — Fix navigation `onPointerUp`

## Problème

Les nav items du drawer mobile étaient complètement non-réactifs. Tap → rien (no nav, no close). Cause : sur certains Android browsers + iOS Safari, les `onClick` events peuvent être swallowed par ancestor touch handling, focus contention, ou heuristics iOS.

---

## Fix appliqué — `onPointerUp` partout sauf backdrop

| Bouton | Avant | Après |
|---|---|---|
| Backdrop | `onClick={onClose}` | `onClick={onClose}` ✓ KEEP (consigne user) |
| X close (top du drawer) | `onClick={onClose}` | `onPointerUp={onClose}` |
| Nav rows (Dashboard, Prospects, etc.) | `onClick={wrapClose(onClick)}` | `onPointerUp={wrapClose(onClick)}` |
| Toggles row (Thinking, Voice, Dark, Lang) | `onClick={wrapClose(onClick)}` | `onPointerUp={wrapClose(onClick)}` |
| Refaire onboarding (bottom) | `onClick={() => {...}}` | `onPointerUp={() => {...}}` |

---

## Ajouts complémentaires

Sur tous les boutons convertis :

```js
touchAction: 'manipulation',           // tue le 300ms iOS click delay + désactive double-tap zoom
WebkitTapHighlightColor: 'transparent', // pas de flash bleu iOS au tap
cursor: 'pointer',                      // feedback desktop
type: 'button',                         // évite tout submit accidentel dans un form
```

---

## Pourquoi ça marche

### `onPointerUp` :
- **Touch** : fire au lift du doigt, AVANT que le browser synthétise le click. Bypass tout le pipeline click qui peut être eaten par iOS heuristics, parent touch handlers, focus contention, etc.
- **Mouse** : fire au mouseup. Single fire.
- **Pen/stylet** : fire aussi.
- **Pas de double-firing** : `onPointerUp` ≠ `onClick`. Ce sont 2 events séparés. Si on bind seulement `onPointerUp`, le `click` event qui suit n'a aucun handler → no-op. Donc desktop fire 1 fois, mobile fire 1 fois.

### `touchAction: manipulation` :
- Désactive le delay 300ms historique iOS (qui sert à détecter double-tap zoom)
- Le browser appelle pointerup IMMÉDIATEMENT au lift, pas après 300ms d'attente

---

## Ce qui n'a PAS changé

- `wrapClose(fn)` → toujours `() => { fn?.(); onCloseRef.current?.(); }` (nav avant close)
- Backdrop : reste sur `onClick` (consigne explicite)
- Aucun touch handler sur l'aside (déjà retiré au pass précédent)
- `setShowChips` / autre logique : intact

---

## Test expected

1. **Tap "Tableau de bord"** → drawer ferme + dashboard s'affiche en une seule action ✓
2. **Tap backdrop** → drawer ferme (onClick fonctionne ici, le backdrop est isolé) ✓
3. **Desktop click** sur n'importe quel item → fire une seule fois (pointerup, pas de click bind) ✓
4. **Pas de double-fire** : event handler appelé exactement 1 fois par tap

---

## Si ça ne marche toujours pas après deploy

**Cache service worker** actif servant l'ancien bundle. Pour clear :

- **PC** : Ctrl+Shift+R (hard reload) OU DevTools → Application → Service Workers → Unregister
- **iPhone** : Réglages → Safari → Effacer l'historique et les données
- **Android** : Chrome menu → Historique → Effacer données navigation

---

## Fichier modifié

`src/components/MobileDrawer.jsx` — 4 boutons convertis de `onClick` → `onPointerUp` + props mobiles ajoutées (touchAction, WebkitTapHighlightColor, cursor, type="button"). Backdrop laissé en `onClick` per consigne.

# Mobile Drawer — Fix Transparence/Opacité

## Récap des fixes

| Avant | Après |
|---|---|
| Drawer : `background: rgba(8, 12, 20, 0.985)` + `backdropFilter: blur(18px)` — blur laissait l'app derrière transpercer | Drawer : `background: '#0a0f1c'` + `backgroundColor` doublé pour belt+braces. **Aucune transparence, aucun blur.** |
| Backdrop : `rgba(3, 7, 18, 0.55)` max + `backdropFilter: blur(2px)` — pas assez sombre | Backdrop : `rgba(0, 0, 0, 0.78)` base, plancher 0.7 minimum pendant le drag. **Pas de blur** (juste du noir solide à 78%). |
| z-index : panel 100, backdrop 90 | z-index : **panel 9999, backdrop 9998** |

---

## Détails

**Couleur opaque du drawer** : `#0a0f1c` en dark mode (matche le bg-body de l'app : `linear-gradient(180deg, #090e1a 0%, #0c1220 60%, #0a0f1c 100%)`), `#FBFAF7` en light mode (cohérent avec le `#F5F4F0` body light).

**Plancher backdrop 0.7** : pendant le swipe-to-close, le backdrop fadait de 0.55 → 0 ce qui laissait l'app réapparaître pendant le drag. Maintenant `Math.max(0.7, 0.78 - dragProgress * 0.08)` — le minimum est 0.7 même au plus loin du drag, donc l'app reste masquée. Le fade visible est juste de 0.78 → 0.70 (subtil), pas de 0.55 → 0.

**`backgroundColor` doublé en plus de `background`** : sur certains browsers / certains contextes de stacking context, `background` (shorthand) peut être écrasé par autre chose. Mettre les deux garantit que la couleur s'applique.

**Pas de `backdropFilter`** : retiré complètement du drawer. Le `backdrop-filter: blur` rend le drawer translucide par design (c'est sa fonction). Inadapté quand on veut opaque.

---

## Test

Reload l'app sur mobile, ouvre le drawer :
- Fond complètement noir derrière
- Drawer complètement opaque
- Aucune transparence visible

Pendant le swipe-to-close :
- Le backdrop garde sa noirceur (juste un léger 0.78 → 0.70 fade)
- L'app derrière reste invisible jusqu'à ce que le drawer disparaisse complètement

---

## Fichier modifié

`src/components/MobileDrawer.jsx` — bloc backdrop + bloc panel uniquement. Aucun changement aux nav rows / toggles / bottom block.

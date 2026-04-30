# Mobile Drawer — Note

## Architecture

| Fichier | Rôle |
|---|---|
| `src/components/MobileDrawer.jsx` | **Nouveau** — drawer slide-in complet, ~280 lignes |
| `src/components/Header.jsx` | Drawer inline retiré (~90 lignes nettoyées), simplement `<MobileDrawer ... />` quand mobile |
| `src/App.jsx` | 2 props ajoutées au `<Header>` : `userProfile` + `sessionStarted` |

---

## Comportement

| Élément | Spec | Implémentation |
|---|---|---|
| **Slide-in droite** | 80% largeur, 300ms ease | `width: 80vw, maxWidth: 360px`, `transform: translateX(100% → 0)`, `transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1)` (iOS-style spring) |
| **Backdrop** | Sombre semi-transparent, click ferme | `rgba(3,7,18,0.55)` + `backdrop-filter: blur(2px)`, transition opacity 300ms, `onClick={onClose}` |
| **Top — logo + nom user** | Logo "The Headquarters" + nom utilisateur | Dots + texte uppercase + nom (depuis `userProfile.name`) + role (sous-ligne grise) |
| **Bouton X** | Top-right du drawer | 38×38 rounded square, fond légèrement contrasté |
| **Liste nav** | 52px hauteur, icône+texte+chevron, actif=indigo | Boutons full-width, `height: 52px`, icon Lucide à gauche, texte flex-1, badge optionnel, ChevronRight droite. Active : background `rgba(99,102,241,0.14)` + bordure gauche indigo 3px + texte indigo |
| **Toggles row** (extra) | Pas dans la spec mais utile | Pills compactes au-dessus du bottom block : Thinking · Voice · Dark/Light · Lang · Tour |
| **Bottom — Refaire onboarding + version** | Bouton + version | Bouton full-width "Refaire l'onboarding", puis ligne grise centrée `v1.0.0` |
| **Fermeture** | X + backdrop + swipe droite + ESC | Tous implémentés. **Swipe droite** : touchstart capture x initial, touchmove suit le doigt (translation directe pendant drag), touchend ferme si > 30% drawer width OU flick rapide > 0.5 px/ms sur > 60px. Sinon snap-back. |
| **Body scroll lock** | Bonus | `document.body.style.overflow = 'hidden'` quand ouvert |

---

## Header mobile simplifié

```
┌─────────────────────────────────────────────┐
│ ▣▢ QG     [Pro] [Terminer*]              ☰ │
└─────────────────────────────────────────────┘
   ↑          ↑          ↑                  ↑
 logo+QG   Deep Mode  End session       Hamburger
                      (* si chat actif)
```

- "The Headquarters" caché sur mobile (`hidden md:inline`)
- Marque compacte "QG" affichée à la place sur mobile (`md:hidden`)
- Pills Thinking/Voice/Dark/Lang + 7+ icon buttons → tous dans le drawer

---

## Détails de polish

- **Drag direct** pendant swipe : le drawer suit le doigt en temps réel (transition désactivée)
- **Backdrop opacity** baisse pendant le drag — transition visuelle "le drawer s'éloigne"
- **safe-area-inset** : padding-top + padding-bottom respectent l'encoche/home indicator iOS
- **maxWidth: 360px** — sur tablet 768-1024 si l'utilisateur force le mode mobile, le drawer ne devient pas trop large
- **`100dvh`** : prend la vraie hauteur dynamique du viewport (gère la barre URL Safari mobile qui rétrécit/grandit)
- **Auto-close** sur tout clic nav — `wrapClose(fn)` fait `onClose() + fn()`
- **Icon active** : couleur indigo + strokeWidth 2.4 vs 2 (subtilité visuelle)

---

## Test

1. Ouvre l'app sur mobile (DevTools toggle device toolbar)
2. Tape ☰ → drawer slide depuis la droite avec backdrop noir
3. Items : badge orange/vert si compteur, chevron à droite, surligné indigo si page active
4. Tape un item → navigation + drawer se ferme automatiquement
5. Tape backdrop → ferme
6. Tape X → ferme
7. ESC → ferme
8. Swipe le drawer vers la droite avec le doigt → suit le doigt, ferme si tu vas assez loin

---

## Limites connues

- **Pas de gesture "edge swipe"** pour ouvrir le drawer (uniquement le bouton ☰). C'est le pattern usuel sur web ; pour ajouter, il faudrait un touchstart listener global qui détecte un swipe-right depuis l'edge gauche < 20px.
- **Les toggles row** (Thinking/Voice/Dark/Lang/Tour) ne font pas partie de la spec originale mais gardés dans le drawer parce qu'ils n'ont pas d'autre point d'accès en mobile.
- La version `v1.0.0` est hardcodée dans `MobileDrawer.jsx` (`APP_VERSION`). Si tu veux qu'elle soit auto-importée depuis `package.json`, faut configurer Vite avec `import pkg from '../../package.json'`.

# Mobile Drawer — Fix final clicks + transparence

## Bug #1 — Items pas cliquables

### Cause éliminée définitivement

Retiré les 3 touch handlers (`onTouchStart`/`onTouchMove`/`onTouchEnd`) du `<aside>`. Sur certains Android browsers, ces handlers swallowed les clicks même avec les précédents fixes (threshold + ref pattern). En les retirant complètement, **rien ne peut plus interférer avec les clicks** sur les nav buttons.

### Trade-off

Le swipe-to-close est désactivé. Tu peux toujours fermer le drawer par :
- **Bouton X** (top-right du drawer)
- **Tap sur le backdrop** sombre
- **Touche ESC**

Si tu veux le swipe-to-close de retour, à ajouter comme un dedicated edge handle (petite zone à gauche du drawer) — ça isolera la swipe-detection des clicks de nav.

---

## Bug #2 — Transparence

Le panneau était déjà censé être opaque (`#0a0f1c`). Pour bulletproof contre tout cas exotique, **5 défenses successives** :

1. **`isolation: 'isolate'`** sur l'aside → crée un nouveau stacking context. Le panel devient totalement opaque indépendamment de tout filter/blend-mode/backdrop-effect dans les ancêtres.

2. **`opacity: 1` explicite** → empêche un parent d'inheriter avec une opacity < 1.

3. **Safety-net div absolu** dans le panel avec `backgroundColor: PANEL_BG` + `zIndex: -1` → si jamais quelque chose dans le contenu override le background, cette couche reste opaque derrière.

4. **Background remplacé** : `background: PANEL_BG` (shorthand) → `backgroundColor: PANEL_BG` (uniquement). Le shorthand peut être écrasé par d'autres CSS, le longhand pur est plus stable.

5. **Backdrop bumpé** de 0.85 → **0.92**. Quasi-noir total derrière le drawer.

---

## Test sur le device

1. **Hard reload** sur Vercel (Ctrl+Shift+R sur PC, ou Settings → Safari → Effacer historique sur iPhone). **CRITIQUE** — sinon tu vois l'ancien bundle.
2. Tap ☰ → drawer slide depuis la droite, fond complètement noir derrière (impossible de voir l'app)
3. Tap "Tableau de bord" → navigation immédiate + drawer ferme automatiquement
4. Pareil pour Prospects, Bibliothèque, Profil, etc.
5. Tap backdrop → ferme

Si ça marche pas après hard reload, **invalider le service worker** (Settings → Application dans DevTools → Unregister) parce que le browser cache toujours l'ancienne version.

---

## Fichier modifié

`src/components/MobileDrawer.jsx` :
- Touch handlers (`onTouchStart`/`Move`/`End`) retirés du `<aside>`
- Functions `onTouchStart`/`Move`/`End` retirées
- Panel : `backgroundColor` only (plus le shorthand `background`), `isolation: 'isolate'`, `opacity: 1` explicite
- Safety-net opaque `<div>` ajouté dans le panel (absolute, zIndex -1)
- Backdrop opacity 0.85 → 0.92
- Drag state (dragX, draggingRef) reste défini mais inutilisé — pas de cleanup nécessaire, n'affecte pas le rendu

---

## Re-activation future du swipe-to-close

Si on veut remettre le swipe :
1. Créer un `<div>` étroit (10-20px) sur le bord gauche du panel
2. Mettre les touch handlers SUR ce div uniquement (pas sur l'aside complet)
3. Garder le movement-threshold pattern (>10px horizontal pour entrer en drag mode)
4. Les nav buttons restent immunisés car le swipe-handle est isolé

Code du swipe est déjà prêt dans le file (commentés ou retirés) — réintroduction = ~30 lignes ciblées.

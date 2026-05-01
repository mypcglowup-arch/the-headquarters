# Mobile Tab Bar — Option A complet (4 steps)

## STEP 1 — `src/components/MobileTabBar.jsx` (nouveau)

| Spec | Implémentation |
|---|---|
| Fixed bottom, mobile-only | `position: fixed; bottom: 0` + `className="md:hidden"` |
| 4 tabs : Home, Chat, Dashboard, More | `<HomeIcon>`, `<MessageSquare>`, `<BarChart2>`, `<Menu>` lucide-react |
| Active : gold #d4af37, inactive : #6b7280 | Couleur passée via inline style, strokeWidth 2.4 sur active vs 2 |
| Background #0a0f1c, border-top 1px #1f2937 | Inline style sur `<nav>` |
| Height 60px + safe-area-inset-bottom | `height: calc(60px + env(safe-area-inset-bottom, 0px))` + `paddingBottom: env(...)` |
| Icon 20px + label 10px below | `<Icon size={20}>` + `<span style={{fontSize: 10}}>` |
| Triple-bind dedup 300ms | Même pattern que MobileDrawer (`fireOnce` per-key Map) |
| `touchAction: manipulation` | Sur chaque button |
| z-index 9998 | Inline style |

### Active state computé selon contexte

- **Home** : `!sessionStarted && screen === 'home'`
- **Chat** : `sessionStarted && screen === 'chat'`
- **Dashboard** : `screen === 'dashboard'`
- **More** : jamais active (juste ouvre le drawer)

---

## STEP 2 — App.jsx integration

- Import `MobileTabBar`
- **State `menuOpen` lifté** depuis Header → App.jsx (Header reçoit maintenant `menuOpen` + `setMenuOpen` en props)
- TabBar rendue après ToastStack/InstallPrompt :

```jsx
{(sessionStarted || screen !== 'home') && (
  <MobileTabBar
    activeScreen={screen}
    sessionStarted={sessionStarted}
    onGoHome={goHome}
    onStartChat={() => sessionStarted ? setScreen('chat') : startSession()}
    onGoDashboard={...toggle dashboard}
    onOpenDrawer={() => setMenuOpen(true)}
  />
)}
```

- **Hidden sur Home idle** (pas de session) — pour laisser le user voir l'agent board sans clutter
- **Visible** dès qu'une session est active OU qu'on est sur n'importe quel autre écran
- `<main>` reçoit `pb-[60px] md:pb-0` pour réserver l'espace du tab bar
- TabBar est elle-même `md:hidden` donc desktop never voit rien

---

## STEP 3 — `GlobalFloatingInput` visibility

| Avant | Après |
|---|---|
| `if (screen === 'chat' \|\| screen === 'replay') return null;` (uniforme) | Différencié mobile vs desktop |
| | **Mobile** : visible UNIQUEMENT si `screen === 'chat' && sessionStarted` |
| | **Desktop** : comportement original conservé |

Le hook `useIsMobile()` est ajouté avant l'early return (respecte les rules of hooks). `sessionStarted` est passé en prop depuis App.jsx.

---

## STEP 4 — Header simplifié sur mobile

| Élément | Mobile | Desktop |
|---|---|---|
| Hauteur | 48px (`h-12`) | 64px (`h-16`) |
| Padding-x | 16px (`px-4`) | 20px (`px-5`) |
| Logo "QG" | ✅ visible | ✅ "The Headquarters" |
| Hamburger ☰ | ✅ visible | (rien — nav buttons à la place) |
| **Mode Pro pill** | ❌ `hidden md:flex` | ✅ |
| **End Session pill** | ❌ `hidden md:flex` | ✅ |
| Thinking, Voice, Lang, Dark | ❌ | ✅ |
| Icon buttons (Dashboard, etc) | ❌ | ✅ |

Tout ce qui est caché reste accessible via le drawer mobile (☰) ou le tab bar pour les nav principales.

---

## Fichiers modifiés

- `src/components/MobileTabBar.jsx` — **NEW**
- `src/components/Header.jsx` — `menuOpen` lifté en props, height responsive, Mode Pro/End Session `hidden md:flex`
- `src/components/GlobalFloatingInput.jsx` — `useIsMobile` ajouté, visibilité conditionnée
- `src/App.jsx` — import TabBar, state `menuOpen`, render TabBar, prop `sessionStarted` ajouté à GlobalFloatingInput, `<main>` padding mobile

---

## Test attendu

1. **Mobile, démarrage** : Home → tab bar invisible (clean welcome). Démarre session → chat + tab bar apparaît avec Chat actif (gold)
2. **Tap "Dashboard" tab bar** : navigue vers dashboard, tab Dashboard active
3. **Tap "Plus" tab bar** : drawer slide-in (le drawer est partagé avec le hamburger header)
4. **Tap "Chat" tab bar** : si session active, retour au chat. Sinon démarre une session.
5. **Tap "Accueil" tab bar** : reset session + retour home (logique de `goHome()`)
6. **Header mobile** : seulement QG + ☰. Plus de pills.
7. **GlobalFloatingInput mobile** : ne s'affiche que dans chat actif (ChatInput est l'input principal là-bas, mais la barre permet quand même un quick-jump si tu veux la garder)
8. **Desktop** : strictement identique au comportement avant ce pass

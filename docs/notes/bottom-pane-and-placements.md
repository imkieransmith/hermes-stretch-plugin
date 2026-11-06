# Bottom pane and the placement exploration

This records how the stretch UI was shown as a **pane docked below the
conversation**, with enter and exit transitions. It also covers which other
placements were tried and why. Below input (`COMPOSER_AREAS.underside`) was
chosen. If you want the pane back, everything needed is here.

> Tip: the full working pane implementation is in git history. Look for the
> commit before "Below input" became the only placement, e.g.
> `git log -S "dock: { pane: 'workspace'" -- desktop/plugin.js`.

## How the bottom pane worked

### 1. Register on demand; don't use `when`

The pane contribution **only exists while it should show**, the same pattern
as core's ⌘K-summoned Logs pane. We call `ctx.register(...)` when a stretch is
offered and call its disposer when it's no longer wanted. We didn't use the
contribution's `when()` because how often `when` re-runs isn't documented.

```js
const PANE_HEIGHT = '50vh' // leaves the chat (and any agent question) visible above

const paneContribution = {
  id: 'pane',
  area: 'panes',
  title: 'Stretch Break',
  // placement = semantic role; dock = land on a specific edge
  // ("below the conversation"); height so it doesn't take half the zone.
  data: { placement: 'bottom', dock: { pane: 'workspace', pos: 'bottom' }, height: PANE_HEIGHT },
  render: () => jsx(StretchPane, { model })
}
```

Caveats:
- Closing a plugin's **only** pane (tab ✕ / ⌘W) **disables the plugin**.
  The user re-enables it in Capabilities → Plugins, and "Reset layout"
  restores dismissed panes. That's why the pane has its own "Hide" link.
- Hermes appears to remember a pane's position per contribution `id`.
  Changing `dock` for an existing id may not move it, so use a new id (or
  "Reset layout").
- The layout zone's resize **snaps** and can't be animated. Only our own root
  element animates (see below).

### 2. Show/hide lifecycle (grace period, then exit animation, then unregister)

```
want  → mount (or cancel a pending exit and animate back in)
!want → [grace HIDE_DELAY_MS, unless immediate] → exit animation EXIT_MS → unregister
```

- `HIDE_DELAY_MS = 2500`: after work ends, the pane briefly shows "Hermes
  finished · took X". This also avoids a flash between back-to-back turns.
- `immediate` (Hide / Stop / Not now / withdrawn offer): skips the grace
  period and plays only the exit animation.
- `$closing` (atom) is true during the exit animation. The pane's motion hook
  watches it.

```js
// Constants
export const HIDE_DELAY_MS = 2500
export const EXIT_MS = 220
const ENTER_MS = 280
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'

// Pure: should the pane exist?
export function shouldShowPane({ pinned = false, offered = false, routineActive = false }) {
  return Boolean(pinned || offered || routineActive)
}

// Inside register(ctx):
let disposePane = null
let cancelGrace = null
let cancelExit = null
const stop = cancel => {
  if (cancel) cancel()
  return null
}
const mountPane = () => {
  cancelGrace = stop(cancelGrace)
  if (cancelExit) {
    cancelExit = stop(cancelExit) // wanted again mid-exit: animate back in
    $closing.set(false)
  }
  if (disposePane) return
  disposePane = ctx.register(paneContribution)
  $paneOpen.set(true)
}
const beginExit = () => {
  cancelGrace = stop(cancelGrace)
  if (!disposePane || cancelExit) return
  $closing.set(true)
  cancelExit = ctx.setTimeout(() => {
    cancelExit = null
    const dispose = disposePane
    disposePane = null
    dispose()
    $closing.set(false)
    $paneOpen.set(false)
  }, EXIT_MS)
}
const wantPane = () =>
  DEV.keepPaneOpen || shouldShowPane({ ...$ui.get(), routineActive: isRoutineActive($routine.get()) })
const syncPane = ({ immediate = false } = {}) => {
  if (wantPane()) return mountPane()
  if (!disposePane) return
  if (immediate) return beginExit()
  cancelGrace ??= ctx.setTimeout(() => {
    cancelGrace = null
    if (!wantPane()) beginExit()
  }, HIDE_DELAY_MS)
}
const paneShowing = () => Boolean(disposePane) && !cancelExit
```

`syncPane()` is called:
- whenever the offer or pinned state changes;
- from a `$routine.listen` (a stretch starting or ending changes whether the
  pane is wanted);
- after hide or show actions.

`ctx.setTimeout` returns a cancel function, which is why `stop(...)` works.

### 3. Enter/exit motion (Web Animations API on our own element)

No injected CSS and no reaching into the app's DOM. We animate our root
`<div>` through a ref, respect `prefers-reduced-motion`, and cancel on
cleanup.

```js
function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Runs on mount (enter) and whenever `closing` flips: true → exit,
// false again (work resumed mid-exit) → enter.
function usePaneMotion(ref, closing) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return undefined
    const hidden = { opacity: 0, transform: 'translateY(16px)' }
    const shown = { opacity: 1, transform: 'translateY(0)' }
    const anim = el.animate(closing ? [shown, hidden] : [hidden, shown], {
      duration: closing ? EXIT_MS : ENTER_MS,
      easing: closing ? EASE_IN : EASE_OUT,
      fill: 'both'
    })
    return () => anim.cancel()
  }, [closing])
}

function StretchPane({ model }) {
  const closing = useValue(model.$closing)
  const rootRef = useRef(null)
  usePaneMotion(rootRef, closing)
  // top bar: AgentStatus · [stretch|debug] SegmentedControl · Hide
  return jsxs('div', {
    ref: rootRef,
    style: { height: '100%', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 },
    children: [/* bar */, /* StretchView (big 168px Ring) or DebugView */]
  })
}
```

Gotcha: if a component can return `null` before its root element exists, put
the motion hook in a child component that always renders the element.
Otherwise the effect runs with `ref.current === null` and never re-runs.

### 4. Tests that covered it

`tests/plugin.test.mjs` used `fakeCtx()` (fake clock, `ctx.pane()` finds the
`panes` contribution). The tests checked:
- no pane while idle;
- offered at 10 s;
- `data.height === '50vh'`;
- a withdrawn offer leaves immediately;
- after a stretch, "done" lingers `HIDE_DELAY_MS`, then the pane is gone
  `EXIT_MS` later;
- reopening mid-exit cancels the exit.

## Placement exploration (Nov 2026, Hermes Desktop v0.22.7)

| Placement | How | Outcome |
| --- | --- | --- |
| **Bottom pane** | `panes`, dock `workspace`/`bottom`, `50vh` | Worked well. Any height, and the user can drag the divider. But it squeezes the chat, ✕ disables the plugin, and it conflicts with the DESIGN.md principle "don't open panes because a tool ran". |
| **Above input** | `COMPOSER_AREAS.top` | Renders **inside** the input box's frame (unavoidable; it's the only slot above the input). It fades to 30% when the thread is scrolled up, and sits inside the composer's pop-out drag area. Dropped. |
| **Pill + card** | Offer pill in `COMPOSER_AREAS.underside`, card in `top` | Looked identical to Above input except during an offer. Dropped for simplicity. |
| **Sidebar** | `panes`, dock `sessions`/`top` (then `bottom`) | It pushed the whole sidebar down (the sessions pane includes the nav), was cramped, and the bottom dock didn't take effect. Dropped. |
| **Below input** ✅ | `COMPOSER_AREAS.underside` | Outside the input frame: no fade, not in the drag area. Height is whatever the content needs (the composer dock grows upward and the thread makes room), but the user can't resize it. **Chosen.** |

Facts learned from the source (`apps/desktop/src/app/chat/composer/index.tsx`,
`contrib/react/slot.tsx`):
- **Slot renders get no props.** There's no session id, so in split view
  every chat's composer shows a copy. Shared atoms keep the copies in sync.
- **Focus-follows-hover:** moving the pointer into a chat pane gives its input
  box typing focus (DESIGN.md). So the input lights up while you interact with
  a card in either composer slot. It's normal app behaviour and can't be
  changed by a plugin. A separate pane doesn't do this.
- **No plugin hook into the status stack** (todos and subagents above the
  input). `composer.microActions` gives app-drawn badges above the input
  (label, codicon, run) but no custom UI. Badges only re-resolve on composer
  render, so they can't show a live countdown.
- **Width** follows the composer (`--composer-width`, chat min width 28rem /
  448px). A popped-out composer is much narrower.
- Composer slots are hidden on non-chat pages (Settings, Skills). The
  status-bar chip remains.

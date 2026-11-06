# AGENTS.md — Stretch Break (Hermes Desktop plugin)

Instructions for coding agents (Pi, etc.) working in this repo. Read this
first, then `README.md`.

## Project

A wellness plugin for **Hermes Desktop**. When the agent starts a turn, we
offer a short, gentle, guided desk-stretch routine. When the agent finishes,
we show a subtle completion state and never abruptly cut off an exercise that's
underway.

This is a hackathon entry. The deadline is **Nov 11 2026, 5 PM EST**. Judging
covers usefulness, reliability, polish and creativity, plus a demo under 90
seconds. The developer has a full-time job and a family, so keep scope small
and the quality of the interaction high.

## Stages (build in order; don't skip ahead)

1. **Agent-activity detection** ✅ (tested in Hermes). Show Idle/Working for
   the focused chat. Detect turn start/finish reliably across repeated tasks,
   session switches and interrupts.
2. **Guided exercises** ✅ (POC). The user scoped it down to **one
   exercise** (neck side tilt, one rep per side), shown as text plus a
   countdown ring; there's no library or sequences yet. Original plan: Build a small curated library of desk-friendly
   movements. Show name, short instructions, a fixed-duration countdown, and
   pause/skip/dismiss controls. Don't rely on the model to estimate
   durations.
3. **Agent integration** ← *current, mostly done*. The offer fires once the
   busy spell has seen a `tool.start` event and run `offerDelaySec`. It's a
   5 s auto-start countdown with not now, a cooldown persisted in
   `ctx.storage` (`lastBreakAt`), and a settings page
   (`ctx.registerSettingsPage`, using core `ToggleRow` / `ListRow` /
   `SegmentedControl`). The user decided **no model-based duration
   estimate** and **no glowing-chip pre-offer**. Still to do: finish the
   current rep (not the whole routine) when Hermes finishes, and handle
   Hermes waiting on the user (approval/question) mid-stretch. Original
   brief: Offer the routine automatically when a turn starts.
   The user must be able to ignore or dismiss it harmlessly. On finish, show a
   subtle completion state, and let the current rep finish rather than
   interrupting it.
4. **Polish.** Add animations, illustrations, optional sound and simple
   preferences.

Possible later work, only once the core experience is excellent:

- a Python agent half (`/stretch` command, `config_schema` settings,
  `ctx.state` streaks)
- a status-bar streak chip
- `ctx.pet.say` cheers

Out of scope:

- webcam rep counting
- holding replies via `transform_llm_output`
- accounts, fitness tracking or gamification

## Hard rules

- **Desktop plugin file (`desktop/plugin.js`)**
  - It's plain ESM and loaded uncompiled. **No JSX**: use `jsx()` / `jsxs()`
    from `react/jsx-runtime`.
  - The **only** imports allowed are `@hermes/plugin-sdk`, `react` and
    `react/jsx-runtime`.
  - No relative imports, no dynamic `import()`, no `eval`.
  - Everything lives in this one file. Keep pure logic in clearly marked
    exported functions at the top so it's testable.
  - The default export is `{ id: 'stretch-break', name, register(ctx) }`. The
    id must equal the folder and package name, and `name` in `plugin.yaml`.
- **No DOM reach-in.** Don't query or modify app markup, use
  `document.body` observers, inject `<style>` tags or patch prototypes. Use
  SDK surfaces only (catalog rule 8).
- **Follow Hermes' design system:** `docs/hermes/desktop-DESIGN.md` is a
  copy of `apps/desktop/DESIGN.md`. Use core primitives, not hand-rolled ones:
  - `Button` with `variant`: `default` for primary, `secondary` for soft
    fill, `text` with `size: 'inline'` for quiet inline actions like
    "Skip" / "Not now", plus `ghost`, `outline` and others.
  - `SegmentedControl` for small either/or choices; its options are
    `{ id, label }`.
  - `ToggleRow` / `ListRow` for settings rows.
  - `Tip` for tooltips. **Never** use native `title=` on buttons; a test
    enforces this.
  - Use sentence-case labels.
  - Use `--ui-stroke-tertiary` for in-panel dividers and `--ui-text-primary`
    for headings.
  - Use `--font-sans` / `--font-mono` and the `--radius-*` / `--shadow-*`
    tokens.
  - Tips only where hover teaches something new.
  - Keep surfaces flat, with no card-in-card.
- **No hardcoded colours.** Use theme variables only: `--ui-text-*`,
  `--ui-stroke-*`, `--ui-bg-*`, `--ui-accent`, and `--ui-green/red/…` for
  status. The full list is in the app's `styles.css`. Leave pane backgrounds alone.
  - Prefer inline styles over Tailwind classes. Only classes the app itself
    uses are guaranteed to exist.
- **Cleanup**
  - Use `ctx.setInterval` / `ctx.setTimeout` / `ctx.addEventListener` /
    `ctx.onEvent`, and route any other subscription (for example
    `atom.listen`) through `ctx.onDispose`. Bare globals survive hot reload
    and stack up.
  - Inside React components, `useEffect` with cleanup is fine.
- **State**
  - Create stores inside `register()`, not at module scope, so each hot
    reload gets fresh state.
  - Read atoms with `.get()` in handlers and `useValue()` in components.
- **Busy state**
  - Use `host.state.busy` (focused chat) and `host.state.busyBySession`
    (per-session).
  - **Never** use `host.state.gateway` for busy state. That's the socket,
    not turn-busy.
- **Don't block or interfere with the agent.** The plugin is purely
  observational and optional.
- **No backend services, external APIs, AI calls or network fetches.**
- **Python half** (when added)
  - No monkey-patching of Hermes internals.
  - Never write runtime state into the plugin directory. Use `ctx.state` or
    `plugin_data_dir()`.
  - Hook callbacks take `**kwargs`.
  - Pin upper bounds on dependencies. Ideally have none.
- **Verify APIs against the docs** in `docs/hermes/` (or the live site), and
  don't guess signatures.
  - If a component prop isn't documented (for example `Button` variants),
    don't use it.
  - The canonical export list is `apps/desktop/src/sdk/index.ts` in
    NousResearch/hermes-agent.

## Layout

```
plugin.yaml           unified-package manifest (name: stretch-break)
desktop/plugin.js     Desktop half — the whole UI
tests/*.test.mjs      node:test suites
tests/stubs/          fake @hermes/plugin-sdk, react, react/jsx-runtime + resolve hooks
scripts/link.sh       symlink checkout → ~/.hermes/plugins/stretch-break
docs/hermes/          saved official docs (grep these before guessing)
```

Later additions:

- `__init__.py` + `brain.py`: Python half, with pure logic and no Hermes
  imports in `brain.py`
- `data/stretches.yaml`: exercise library, if it doesn't live in JS

Keep the desktop half at `desktop/plugin.js`, **not** the repo root. A root
`plugin.js` would make Hermes copy the whole repo (including `docs/` and
`tests/`) as the desktop half.

## How it's loaded (dev loop)

- `~/.hermes/plugins/stretch-break` is a **symlink** to this repo (via
  `scripts/link.sh`).
  - Hermes Desktop copies `desktop/plugin.js` into
    `~/.hermes/desktop-plugins/stretch-break/` with a `.hermes-package.json`
    marker (`"linked": true`).
  - It watches the source, and every save re-syncs and hot-reloads.
- The desktop half is **opt-in**. The user must toggle it on in
  Capabilities → Plugins. Check this first if "the plugin doesn't appear".
- When stuck, use ⌘K → **Reload desktop plugins**. Load errors appear as
  toasts and in `hermes logs gui -f`.
- `hermes plugins doctor stretch-break` warns if Desktop runs a stale copy.
- Closing the plugin's only pane through the layout (tab ✕ / ⌘W)
  **disables the plugin**. Always offer our own hide/dismiss control.
- **Placement:** the stretch shows as a compact card in
  `COMPOSER_AREAS.underside` (below the input box). The bottom pane is kept
  behind a prototype switch and hosts the debug view. The full write-up of
  the pane and its transitions, and why the other placements were dropped,
  is in `docs/notes/bottom-pane-and-placements.md`. Both surfaces share the
  lifecycle below.
- **Pane lifecycle:** the pane contribution only exists while it should
  show. It's added with `ctx.register(...)` when work starts and removed via
  its disposer after `HIDE_DELAY_MS` once all work ends. This mirrors core's
  ⌘K-summoned Logs pane in `apps/desktop/src/app/contrib/controller.tsx`.
  Height is `'50vh'`, since core panes use vh units. Don't use `when` for
  panes, because how often it re-runs isn't documented.
- **Motion:** the layout zone snaps, because Hermes doesn't animate zone
  sizes and we can't touch app DOM. We animate only our own root element
  with the Web Animations API (`el.animate` on a ref). Removal waits for the
  exit animation (`$closing`, `EXIT_MS`), and reduced motion is honoured.
- Python changes (later) need `hermes plugins enable stretch-break` and a
  Hermes restart. `register()` runs once at startup, and `plugin_api.py` is
  imported only if the plugin is in `plugins.enabled`.

**Sandbox note:** Pi's sandbox can't read or write `~/.hermes`, can't run the
`hermes` CLI, and can't create `.git`. Ask the user to run those commands,
such as linking, `hermes plugins doctor/validate`, git operations and log
tails, and to paste back the output.

## Testing

- `npm test` runs `tests/logic.test.mjs` (pure logic) and
  `tests/plugin.test.mjs`. The second runs `register(ctx)` against fake host
  atoms, using `tests/helpers.mjs` for a fake ctx with storage, events and a
  controllable clock: `ctx.advance(ms)` fires timers and intervals. Add a test for every piece of pure logic and every state-machine
  edge case: repeated turns, session switches, interrupts, hot reload and
  dispose.
- `npm run check` runs `node --check` plus the tests. Run it before saying
  work is done.
- Real end-to-end testing happens in Hermes Desktop. The user follows the
  checklist in `README.md` → *Testing Stage 1*. Mocks never replace testing
  against a real session.
- Gates before submission (run by the user):
  - `hermes plugins doctor . --ci`
  - `hermes plugins validate . --install-deps`

## Style

- Keep changes small and independently testable, with one stage at a time.
- Use plain modern JS and two-space indentation. Group `jsx()` trees into
  small named components.
- Prioritise the quality of the interaction over adding features. Keep
  exercises gentle and optional.

## Submission checklist (later)

1. Set **`DEV.keepPaneOpen = false`** in `desktop/plugin.js`. It's on during
   development so the pane is always visible.
   - The `DEV_BUILD` label only shows while `keepPaneOpen` is on. Bump it
     on every change during development so a stale hot reload is obvious.
   - Resolve the **placement prototype**: keep one placement and delete
     `PLACEMENTS`, `settings.placement`, the "Placement (prototype)"
     settings row, the ⌘K "Next placement" and "Preview an offer" commands,
     and the unused surface components.
2. Set `homepage`, `requires_hermes` (SemVer floor = tested version), and
   `version` in `plugin.yaml`. The user is testing on Hermes v0.22.7.
3. Open a PR adding `plugin-catalog/stretch-break.yaml` to
   NousResearch/hermes-agent. Pin the full 40-character `sha:`.
4. Post a demo video under 90 seconds on X, tagging @NousResearch.
5. Submit both links via form.typeform.com/to/FwJLvOln.

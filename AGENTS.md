# AGENTS.md

OpenChi is a Hermes Desktop plugin with no Python half. [README.md](README.md) says what it does.

Hermes loads one file, `desktop/plugin.js`, which `scripts/build.mjs` builds from `src/` with esbuild. The build also inlines the drawings in `assets/figures/`. Edit `src/`, never `desktop/plugin.js`.

```bash
npm run dev      # rebuild on every save
npm run check    # build, syntax check and tests
npx prettier --write "src/**/*.{js,jsx}"
```

Run `npm run check` before you finish, and commit the rebuilt `desktop/plugin.js`.

## What the code won't tell you

- `src/` may import only `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` and its own files. No npm packages, dynamic `import()` or `eval`.
- Catalog rule 8: use only the SDK. Don't touch the app's markup, inject `<style>` or `<script>`, or patch prototypes. No network calls.
- The SDK's exports are in `apps/desktop/src/sdk/index.ts` in NousResearch/hermes-agent, and its design rules in `apps/desktop/DESIGN.md`. Check them rather than guess, and feature-detect newer exports.
- Hermes hot-reloads the plugin. Create state inside `register()`, and set timers, listeners and subscriptions through `ctx` (`ctx.setTimeout`, `ctx.addEventListener`, `ctx.onEvent`, `ctx.onDispose`) so a reload clears them.
- To tell whether Hermes is busy, read `host.state.busyBySession`. `host.state.gateway` is the socket, not a turn.
- `src/controller/tension-watch.js` reads each message as it's sent. It must return the draft unchanged, swallow its own errors and stay fast on any input. Keep only `{ at, score }`, in memory. Never store or send message text.
- Play sound only through `src/controller/sound.js`, never from a component: a split view renders the card twice. Start audio only from a click on one of our buttons.
- The plugin never blocks a send, never starts a session, opens a pane or moves focus by itself, and never shows what the agent is doing.
- Every claim the card makes about your body or mind needs a source in [SOURCES.md](SOURCES.md). Update it when you change the wording or add an exercise.
- Use theme variables for colour. The figures are the exception, and so is the card's background (`--composer-fill`). Put tooltips in `Tip`, never a native `title=`.
- The card keeps one height from one exercise to the next, so buttons don't move under the cursor.
- Render tests find components by function name, so keep the names unique.

## Layout

Exercises are data: specs in `src/exercises/<area>.js`, with one drawing per pose at `assets/figures/<exercise-id>/<pose>.png`. Add an exercise as a spec, not as engine code. `src/routine.js` is the one engine that runs every session. `src/controller/offers.js` decides when to offer one.

## Releasing

Before a release, try it in Hermes Desktop:

1. A chat-only reply shows nothing.
2. A task that uses a tool and runs past the delay shows the picker, which waits for you.
3. Each length runs to "All done", and Pause, Skip and Stop work.
4. If Hermes finishes before you pick, the offer leaves, and the next long task offers again.
5. After a session or "Not now", nothing is offered until the cooldown ends.
6. Two frustrated messages bring up a breather on the next task.
7. Both command palette entries open their card.
8. Settings survive a restart.

Then:

1. Bump `version` in `plugin.yaml`, `package.json` and `package-lock.json` together.
2. Run `hermes plugins validate . --install-deps`, the same check catalog CI runs. Ignore `hermes plugins doctor`'s complaint about a missing `__init__.py`.
3. Open a pull request on NousResearch/hermes-agent that changes only `plugin-catalog/openchi.yaml`. Pin the full 40-character commit `sha`, match `version` and `requires_hermes` to `plugin.yaml`, and point `screenshots:` at `offer.png` and `exercise.png` in `assets/screenshots/` (`overview.png`, the two joined, is for the README) through raw.githubusercontent.com URLs pinned to the same commit.

The catalog shows `README.md` as the plugin's page and drops raw HTML, so write it in plain Markdown, for users. Catalog rules: https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission

# Stretch Break

A Hermes Desktop plugin that turns agent waiting time into a short, gentle,
guided desk-stretch break.

> **Status: Stage 1 — agent-activity detection.** The plugin shows whether the
> focused Hermes chat is **Idle** or **Working**, and a debug pane logs every
> turn start/finish. No exercises yet.

Entry for the Nous Research Hermes Agent Plugin Hackathon (deadline
Nov 11 2026, 5 PM EST).

## What's in Stage 1

- **Status-bar chip** (bottom-right): `● Working 0:42` / `○ Idle` for the chat
  you're looking at. Hover for the last turn's duration.
- **"Stretch Break" pane**, docked below the conversation:
  - focused session id, `awaitingResponse`, busy sessions, gateway socket
  - turn transitions (`▶ start` / `■ finish after 0:42`), scoped to
    **this chat** by default, or **all chats** (one app-wide log)
  - live gateway event counts and recent events (to plan Stages 2–3)
- **⌘K → "Stretch Break: Clear activity log"**

Detection uses `host.state.busyBySession` (runtime session id → mid-turn), so
switching chats is never mistaken for a finished turn, and concurrent turns in
several sessions are tracked separately. The chip follows `host.state.busy`
(the focused chat).

## Install for local development

Requirements: Hermes Desktop, Node ≥ 20.6 (only for running tests).

```bash
# 1. Clone / use this checkout, then link it into Hermes as a unified package
scripts/link.sh
# equivalent to:
#   mkdir -p ~/.hermes/plugins
#   ln -s "$PWD" ~/.hermes/plugins/stretch-break
```

2. In Hermes Desktop: **Capabilities → Plugins → Rescan**, then switch
   **Stretch Break** on. (A unified package's desktop half is opt-in: it's off
   until you toggle it.)
3. The chip appears bottom-right and the pane docks below the chat. If not:
   **⌘K → Reload desktop plugins**.

From then on, every save to `desktop/plugin.js` re-syncs the copy Hermes runs
(`~/.hermes/desktop-plugins/stretch-break/`) and hot-reloads it.

No `hermes plugins enable` is needed yet. There's no Python half in Stage 1.

To remove: toggle it off, then `scripts/link.sh --unlink`.

### If the symlink route doesn't pick it up

Check for a stale copy: `hermes plugins doctor stretch-break` warns when
Desktop is running an out-of-date `desktop/plugin.js`. You can also tail
`hermes logs gui -f` for load errors.

As a last resort, use the standalone disk door. Note that we haven't confirmed
whether its watcher follows symlinks:

```bash
scripts/link.sh --unlink
mkdir -p ~/.hermes/desktop-plugins
ln -s "$PWD/desktop" ~/.hermes/desktop-plugins/stretch-break
```

## Testing Stage 1 in Hermes Desktop

Use a cheap or local model. Run through these checks:

1. **Basic turn**: send `hello`. The chip goes `Working` and starts counting,
   then returns to `Idle`. The pane logs `▶ start` then `■ finish after N`.
2. **Long turn**: send `run "sleep 20" in the terminal, then say done`. It
   should stay `Working` for the full ~20s, including through tool calls. The
   ideal is exactly one start and one finish per turn. If you see several
   start/finish pairs in one turn, note it: it means busy flickers between
   steps, and Stage 3 will need debouncing.
3. **Repeated tasks**: send three prompts in a row. You should get three
   start/finish pairs with the turn counter rising.
4. **Session switching**: start a long turn in chat A, then switch to an idle
   chat B.
   - The chip shows `Idle`, because it follows the focused chat.
   - The pane's *busy sessions* still lists A.
   - No `finish` is logged until A really finishes.
   - Switching back to A shows `Working` with the elapsed time intact.
5. **Interrupt**: stop a turn mid-way. You should see a `finish` logged.
6. **Hot reload**: edit a label in `desktop/plugin.js` and save. The UI
   updates without duplicate chips or panes.

Note that closing the pane disables the plugin, because it's the plugin's only
pane. To get it back, re-enable the plugin in Capabilities → Plugins or use
*Reset layout*.

## Unit tests

```bash
npm test         # node --test with stubbed @hermes/plugin-sdk / react
npm run check    # syntax check + tests
```

## Layout

```
plugin.yaml          manifest (unified package; desktop half only for now)
desktop/plugin.js    the Desktop plugin: plain ESM, no JSX, no build
tests/               node:test + stubs for the three runtime specifiers
scripts/link.sh      symlink this checkout into ~/.hermes/plugins/
docs/hermes/         saved copies of the official Hermes docs
AGENTS.md            instructions for coding agents working on this repo
```

## License

MIT

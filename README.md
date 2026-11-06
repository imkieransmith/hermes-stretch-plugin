# Stretch Break

A Hermes Desktop plugin that turns agent waiting time into a short, gentle,
guided desk-stretch break.

> **Status: proof of concept done; now polishing.** When a task has used a
> tool and run for 10 s, a compact card appears below the input box offering
> a short guided neck stretch, with a cooldown and user settings. (A bottom
> pane is still available via the in-panel "Placement" switch while we
> decide; see `docs/notes/bottom-pane-and-placements.md`.)

Entry for the Nous Research Hermes Agent Plugin Hackathon (deadline
Nov 11 2026, 5 PM EST).

## What's in it now

- **Status-bar chip** (bottom-right): `● Working 0:42` / `○ Idle` for the chat
  you're looking at. Hover for the last turn's duration; **click to show/hide
  the pane** (works while idle too).
- **When it offers:** once a task has **used a tool** and run for **10 s**
  (configurable). Chat-only replies never trigger it. It offers at most once
  per busy spell, and not again within the **cooldown** (default 20 min after
  a stretch, or after declining one; persisted across restarts).
- **"Stretch Break" pane**, docked below the conversation at ~1/2 of the
  window height. It only exists while needed. It slides/fades in when
  offered, and fades out when done. The layout itself snaps, because Hermes
  doesn't animate zone sizes; only our content animates, and not at all with
  *Reduce motion* on. Top bar: agent status · `stretch | debug` · `hide`.
  - **Offer:** "Starting in 5…" ring, then straight into the first hold, with
    **Start now** / **not now**. If Hermes finishes during the countdown, the
    offer is withdrawn quietly, with no cooldown. With auto-start off, it
    shows a **Start** button instead.
  - **Stretch:** 20 s hold (left) → 4 s "switch" → 20 s hold (right) →
    a "Well done, you did it" screen with a tick, which leaves by itself
    after 5 s (or straight away with **Close**). In dev mode
    (`DEV.keepPaneOpen`) it returns to the offer card instead, alternating
    between the exercises. It has a countdown ring, rep dots, **Pause/Resume**,
    **skip** and **stop**. A stretch underway keeps the pane up after Hermes
    finishes. `stop`, `not now` and `hide` close it straight away.
  - **debug** view: focused session id, `awaitingResponse`, busy sessions,
    gateway socket; turn transitions (`▶ start` / `■ finish after 0:42`) for
    **this chat** or **all chats**; live gateway event counts/recent events.
- **Breathers:** if your messages get tense (2 frustrated messages within
  10 minutes: swearing, "what are you doing", "I told you", shouting in
  capitals, "!!!"), the same card offers **box breathing** about 3 s after
  Hermes starts working: 4 rounds of breathe in / hold / breathe out / hold,
  4 s each. It has its own 30-minute cooldown, separate from stretches.
  - **Privacy:** messages are checked on your device as you send them, and
    the text is never stored, sent anywhere or changed. Only a timestamp and
    a score are kept, in memory, for 10 minutes. The code that does this is
    the `tension` composer middleware in `register()` and `tensionScore()` in
    `desktop/plugin.js`.
  - Code blocks, inline code, quoted lines, indented (pasted) lines, links
    and file paths are ignored, so swearing in a pasted log doesn't count.
  - Only messages sent from Desktop's input box are checked.
- **Sound** (on by default; speaker button at the top right of the card, or
  Settings): get ready and switch sides tick 3, 2, 1 with a light "not
  yet" tick; each new stretch side and each breath's 1 gets a soft marimba
  note; breathing's 2, 3, 4 and a hold's last 3 seconds get a wooden tick; a
  soft chime when you finish. Nothing plays for an offer you didn't start. The sounds are
  generated in `plugin.js` (no audio files, nothing downloaded).
- **Settings ▸ Plugins ▸ Stretch Break**:
  - Offer stretch breaks (on/off)
  - Offer after (10/20/30/60 s)
  - Start automatically (on/off)
  - Offer a breather when things get tense (on/off, default on)
  - Play sounds (on/off, default on)
  - Time between breaks (none/10/20/30/45 min)
- **⌘K**: "Stretch Break: Toggle panel", "Start a stretch", "Start box
  breathing", "Pause / resume stretch offers", "Open settings", "Show debug
  panel", "Clear activity log" (plus prototype previews of each offer).
- **Dev:** `DEV.keepPaneOpen` in `desktop/plugin.js` keeps the pane always
  open while developing. It's currently **on**; turn it off before release.

The turn log lives in memory only: it resets when the plugin hot-reloads or
the app restarts.

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

Use the pane's own **hide** link, not a tab ✕ or ⌘W. Closing it through the
layout disables the plugin, because it's the plugin's only pane. To get it
back, re-enable the plugin in Capabilities → Plugins.

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

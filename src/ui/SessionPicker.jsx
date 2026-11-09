/** The session picker: the offer (and ⌘K's view) for a stretch break. */

import { useValue, Button, Checkbox } from '@hermes/plugin-sdk'
import { movedTitle } from '../active.js'
import { OFFER_FIGURE } from '../figures.js'
import { lengthText, SESSION_IDS } from '../plan-session.js'
import { useTicker } from './hooks.js'
import { OfferLayout } from './OfferLayout.jsx'
import { QuietButton } from './parts.jsx'

const PICKER_COPY =
  'Hours of sitting leave you stiff and tired. A few minutes of gentle movement while your agent works helps you loosen up.'

/**
 * The offer's artwork (one fixed image, not tied to the exercises picked)
 * in the same tile as the exercise screen, as tall as the text beside it;
 * then "It's been X since you last moved", a line on why, and the lengths:
 * Short / Medium / Long (estimates from the library's averages: lengthText),
 * all alike (none is a recommendation), plus Not now.
 * Nothing starts until you pick one. Under the
 * buttons, "End with a breathing exercise (+1m)" (the setting itself). Narrow (`stacked`): stacked, like the exercise screen.
 */
export function SessionPicker({ model, s, now, stacked }) {
  const ui = useValue(model.$ui)
  const settings = useValue(model.$settings)
  const a = model.actions
  // "It's been X" stays current while the offer waits for you.
  useTicker(true, 30_000)
  const buttons = [
    ...SESSION_IDS.map(id => {
      const text = lengthText(id)
      return (
        <Button key={id} variant="secondary" onClick={() => a.startSession(id)}>
          {text}
        </Button>
      )
    }),
    <QuietButton key="no" onClick={a.notNow}>
      Not now
    </QuietButton>
  ]
  return (
    <OfferLayout
      figure={OFFER_FIGURE}
      title={movedTitle(ui.movedAt, now)}
      copy={PICKER_COPY}
      buttons={buttons}
      below={ui.menu.windDown ? <WindDownBox on={settings.windDown} onChange={a.setWindDown} /> : null}
      stacked={stacked}
    />
  )
}

/** The tick box's words. */
const WIND_DOWN_LABEL = 'End with a breathing exercise (+1m)'

/**
 * Unticked, Hermes's Checkbox has a faint `border-input` edge: hard to see
 * it's a checkbox. A tick box is a control, so it needs 3:1 against the card
 * (WCAG 1.4.11): `--ui-text-tertiary` (~3.4:1 on the light theme; too faint
 * for text, fine for an edge). Ticked, Hermes's own fill and border apply.
 */
const UNTICKED_EDGE = { borderColor: 'var(--ui-text-tertiary)' }

/** The tick box row's fixed height, and the box's own size (Hermes's Checkbox is 16 px). */
const WIND_DOWN_ROW_PX = 20

const CHECKBOX_PX = 16

/**
 * The "wind down" tick box: core Checkbox (Radix: checked /
 * onCheckedChange) in a label, so the words toggle it too. Missing on a
 * Hermes build without Checkbox: Settings still has it.
 *
 * Fixed size, so ticking it never moves anything (the artwork tile follows
 * the text's height): the row is block-level flex (not inline-flex, which
 * sits on a text line aligned to the checkbox's baseline, and Radix only
 * renders the ✓ glyph when checked, which moves that baseline) at a fixed
 * height, and the checkbox sits in a fixed 16 px box.
 */
function WindDownBox({ on, onChange }) {
  if (!Checkbox) return null
  return (
    <label
      style={{
        display: 'flex',
        width: 'fit-content',
        height: WIND_DOWN_ROW_PX,
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        fontSize: 13,
        lineHeight: `${WIND_DOWN_ROW_PX}px`,
        color: 'var(--ui-text-secondary)',
        cursor: 'pointer'
      }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
          width: CHECKBOX_PX,
          height: CHECKBOX_PX,
          lineHeight: 0
        }}
      >
        <Checkbox checked={on} onCheckedChange={v => onChange(v === true)} style={on ? undefined : UNTICKED_EDGE} />
      </span>
      <span>{WIND_DOWN_LABEL}</span>
    </label>
  )
}

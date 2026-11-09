/**
 * The breathing offer and Start view (the breather, and ⌘K "Start breathing
 * session"), laid out like the session picker (OfferLayout): the exercise's
 * tile, a title and a line on why, then Start ("Start ~1m") and Not now.
 * Nothing starts until you press Start. The words are about breathing in general,
 * not the exercise: the exercise screen names it.
 */

import { Button } from '@hermes/plugin-sdk'
import { figureKey } from '../figures.js'
import { approxText } from '../plan-session.js'
import { routineMs } from '../routine.js'
import { sessionOf } from '../session.js'
import { OfferLayout } from './OfferLayout.jsx'
import { QuietButton } from './parts.jsx'

const BREATHER_TITLE = 'Take a breather?'

const BREATHER_COPY =
  'Stressful moments leave you tense and on edge. A minute of slow, steady breathing while your agent works helps you relax and refocus.'

export function StretchCompact({ model, s, stacked }) {
  const ses = sessionOf(s)
  const ex = ses.parts[0]
  const a = model.actions
  const buttons = [
    <Button key="go" variant="default" onClick={a.start}>
      {`Start ${approxText(routineMs(ses))}`}
    </Button>,
    <QuietButton key="no" onClick={a.notNow}>
      Not now
    </QuietButton>
  ]
  return (
    <OfferLayout
      figure={figureKey(ex.id, ex.prepPose)}
      title={BREATHER_TITLE}
      copy={BREATHER_COPY}
      buttons={buttons}
      stacked={stacked}
    />
  )
}

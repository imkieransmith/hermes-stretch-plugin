/** Settings ▸ Plugins ▸ OpenChi. */

import { useValue, ListRow, SegmentedControl, ToggleRow } from '@hermes/plugin-sdk'
import { COOLDOWN_CHOICES, OFFER_DELAY_CHOICES } from '../settings.js'

/** Settings ▸ Plugins ▸ OpenChi — core settings rows, persisted via ctx.storage. */
export function SettingsPage({ model }) {
  const s = useValue(model.$settings)
  const set = model.actions.updateSettings
  const seg = (value, choices, fmt, onPick) => (
    <SegmentedControl
      value={String(value)}
      onChange={v => onPick(Number(v))}
      options={choices.map(n => ({ id: String(n), label: fmt(n) }))}
    />
  )
  return (
    <div>
      <ToggleRow
        label="Offer stretch breaks"
        description="Offer a short stretching session while Hermes works on a longer task. You can always start a break from ⌘K."
        checked={s.offersEnabled}
        onChange={on => set({ offersEnabled: on })}
      />
      <ListRow
        title="Offer after"
        description="How long Hermes has to be working on a task before you're offered a break. Quick chat replies never trigger one."
        action={seg(
          s.offerDelaySec,
          OFFER_DELAY_CHOICES,
          n => `${n}s`,
          n => set({ offerDelaySec: n })
        )}
      />
      <ListRow
        title="Time between breaks"
        description="After you take or skip a break, wait this long before offering another."
        action={seg(
          s.cooldownMin,
          COOLDOWN_CHOICES,
          n => (n ? `${n}m` : 'none'),
          n => set({ cooldownMin: n })
        )}
      />
      <ToggleRow
        label="End with a breathing exercise"
        description="Finish each session with about a minute of slow breathing."
        checked={s.windDown}
        onChange={on => model.actions.setWindDown(on)}
      />
      <ToggleRow
        label="Offer a breather when things get tense"
        description="Suggest a minute of slow breathing when your recent messages sound frustrated. Messages are checked on this device only; nothing is stored or sent."
        checked={s.breathersEnabled}
        onChange={on => set({ breathersEnabled: on })}
      />
      <ToggleRow
        label="Play sounds"
        description="Soft ticks to count along with during an exercise, and a chime when you finish."
        checked={s.soundOn}
        onChange={on => model.actions.setSoundOn(on)}
      />
    </div>
  )
}

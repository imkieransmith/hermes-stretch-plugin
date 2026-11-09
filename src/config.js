/** Plugin id and the card's show/hide timings. */

export const PLUGIN_ID = 'openchi'

/** Grace period after work ends (avoids a flash between back-to-back turns)
 *  before the card leaves. */
export const HIDE_DELAY_MS = 2500

/** How long the "well done" screen stays before the card leaves by itself. */
export const DONE_LINGER_MS = 10_000

/** Exit animation length; the card is unregistered when it completes. */
export const EXIT_MS = 220

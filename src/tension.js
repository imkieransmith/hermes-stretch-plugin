/**
 * Tension detection (pure, local).
 *
 * Each message you send from Desktop is checked here, on this device, by the
 * composer middleware in controller/tension-watch.js. The text is never stored, sent anywhere
 * or changed; only { at, score } is kept, in memory, for TENSION_WINDOW_MS.
 *
 * Rules: never store or send text; tune the constants and the lists, don't
 * add special cases. This runs while a message is being sent, so every
 * pattern must stay fast on any input (a test times 200 KB of the worst).
 */

/**
 * How much each signal adds to a message's score. Tune here.
 * Frustration aimed at the agent ("I told you", "why did you…") and shouting
 * count fully; "?!" half. A swear counts half beside another signal, and
 * TENSION_SWEAR_ALONE on its own.
 */
export const TENSION_WEIGHTS = { swear: 0.5, phrase: 1, shouting: 1, punctuation: 0.5 }

/**
 * A message whose only signal is a swear ("damn it, forgot the import") is
 * usually just how someone talks, so it barely counts: swearing alone takes
 * 12 such messages in the window.
 */
export const TENSION_SWEAR_ALONE = 0.25

/**
 * A single message never counts for more than this, so one outburst alone
 * never triggers: it takes two clearly frustrated messages (a phrase plus a
 * swear or "?!", or shouting plus one) or three phrases.
 */
export const TENSION_MESSAGE_MAX = 1.5

/** Offer a breather when the scores in the window add up to this. */
export const TENSION_THRESHOLD = 3

export const TENSION_WINDOW_MS = 10 * 60_000

/**
 * At most this much of what you wrote yourself is checked: the start and the
 * end of a longer message (frustration is rarely in the middle of a paste).
 */
export const TENSION_MAX_CHARS = 8_000

/** Swearing and exasperated noises ("ugh"). Casual on their own: see TENSION_SWEAR_ALONE. */
const SWEAR_RE = new RegExp(
  `\\b(?:${[
    'f+u+c+k+\\w*',
    'fck\\w*',
    'fuk\\w*',
    'motherf\\w*',
    'shit(?:s|ty|te|show|ting)?',
    'bullshit',
    'bollocks',
    'wtf+',
    'ffs',
    'jfc',
    'fml',
    'omfg',
    'goddamn\\w*',
    'damn\\s*it',
    'dammit',
    'bloody\\s+hell',
    'piss(?:ed)?\\s+off',
    'crap(?:py)?',
    'bastards?',
    'arse(?:hole)?s?',
    'assholes?',
    'bugger\\w*',
    'wank\\w*',
    'twats?',
    'cunts?',
    'ugh+',
    'argh+',
    'grr+'
  ].join('|')})\\b`,
  'i'
)

/**
 * Frustration aimed at the agent or at how it's going. Each needs enough
 * words around it that a neutral message doesn't match ("stop the server",
 * "you keep the config", "did you do the migration?", "this doesn't work").
 */
const PHRASE_RE = new RegExp(
  [
    // What are you doing?
    'what (?:the (?:fuck|hell|heck)\\b|is wrong with you)',
    '(?:what|the (?:fuck|hell|heck)) (?:the (?:fuck|hell|heck) )?(?:are you (?:even )?doing|have you done|did you (?:just )?do)',
    'why (?:would|did|do) you (?:keep|always|do that|do this|delete|break|change|ignore|remove|revert|undo)',
    'why are you (?:still |even )?(?:doing|changing|deleting|ignoring|touching|adding|removing|rewriting)',
    // I already told you.
    'i (?:already |just |literally |specifically |explicitly )?(?:told|asked) you',
    'i (?:already|just|literally) said',
    "i said (?:no|not|don'?t|do not|stop)\\b",
    'how many times (?:do i have|do i need|have i|must i|did i)',
    'for the (?:last|third|fourth|fifth|hundredth|nth|\\d+(?:st|nd|rd|th)) time',
    "(?:that'?s|that is|this is|it'?s|it is) not what i (?:asked|said|wanted|meant)",
    "i (?:didn'?t|did not) (?:ask|tell|want)\\b",
    'i never (?:asked|told|said)\\b',
    'did you even (?:read|look|check|test|run|try)',
    'pay attention',
    'listen to (?:me|what i)\\b',
    'read what i (?:said|wrote)',
    // You keep doing it.
    'you keep (?:on )?(?:doing|breaking|deleting|changing|removing|ignoring|adding|making|forgetting|reverting|rewriting|overwriting|undoing|repeating|missing|getting|putting|trying|messing|failing)',
    'stop (?:doing (?:that|this)|(?:it|that)(?=\\W*$|\\s*[!.,]))',
    "you(?:'ve| have)? (?:just )?(?:broke|broken|ruined|wrecked|messed (?:it |this |everything )?up|screwed (?:it |this |everything )?up)",
    '(?:made|making) (?:it|this|that|things|everything) worse',
    // It's still broken.
    "still (?:broken|wrong|failing|not working|not fixed|(?:doesn'?t|does not|isn'?t|is not|won'?t) work(?:ing)?)",
    "(?:broken|wrong|failing|not working|doesn'?t work) again",
    '(?:oh )?not again\\b',
    // Exasperation.
    'are you (?:serious|kidding|joking)',
    "you(?:'re| are) (?:useless|stupid|an idiot|hopeless|not listening|wasting my time)",
    "(?:this is|that is|that'?s) (?:ridiculous|insane|useless|hopeless|a mess|painful|a joke|a nightmare|garbage|rubbish|terrible|awful|unusable|bullshit)",
    'wasting my time',
    'waste of my time',
    'i give up',
    "i'?ll (?:just )?do it myself",
    'come on\\W*$',
    'seriously\\s*[?!]',
    // Swearing at it, rather than in passing.
    'fuck (?:you|this|off)\\b',
    "for fuck'?s sake",
    'piece of (?:shit|crap|junk|garbage|rubbish)',
    'fucking (?:useless|stupid|broken|ridiculous|joke|idiot|hopeless)',
    'screw (?:you|this)\\b'
  ].join('|'),
  'im'
)

const PUNCTUATION_RE = /!{3,}|\?{3,}|[?!]*(?:\?!|!\?)[?!]*/

/** A word naming a file ("app.ts", "notes.txt."). */
const FILE_RE = /\.(?:js|mjs|cjs|ts|tsx|jsx|vue|php|py|rb|go|rs|java|json|ya?ml|toml|md|txt|log|sh|css|html)\b/i

/** The start and the end of a long text (TENSION_MAX_CHARS in all). */
function clip(text) {
  if (text.length <= TENSION_MAX_CHARS) return text
  const half = TENSION_MAX_CHARS / 2
  return `${text.slice(0, half)}\n${text.slice(-half)}`
}

/**
 * Drop what the user didn't write in their own voice: fenced and inline code,
 * quoted lines, indented lines (pasted code / logs), URLs and file paths.
 * Every pass is linear in the text's length, and the word-by-word pass only
 * sees the clipped text: a huge paste can't hold up a send.
 */
export function ownWords(text) {
  const own = String(text || '')
    .replace(/[‘’]/g, "'") // curly apostrophes (macOS smart quotes)
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^(?: {2,}|\t|[ \t]*>).*$/gm, ' ')
  // URLs and paths (any word with a slash), and file names.
  return clip(own).replace(/\S+/g, word => (word.includes('/') || FILE_RE.test(word) ? ' ' : word))
}

/** Mostly capitals over several words ("WHY DID YOU DELETE IT"), not acronyms ("README API URL"). */
function isShouting(words) {
  const long = words.filter(w => /[A-Za-z]{3,}/.test(w))
  const caps = long.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w))
  return caps.length >= 4 && caps.length / long.length >= 0.6
}

/** Which signals a message shows. */
export function tensionSignals(text) {
  const t = ownWords(text)
  const words = t.split(/[^A-Za-z']+/).filter(Boolean)
  return {
    swear: SWEAR_RE.test(t),
    phrase: PHRASE_RE.test(t),
    shouting: isShouting(words),
    punctuation: PUNCTUATION_RE.test(t)
  }
}

/** Weighted score for one message, capped at TENSION_MESSAGE_MAX. 0 = calm. */
export function tensionScore(text) {
  const sig = tensionSignals(text)
  if (sig.swear && !sig.phrase && !sig.shouting && !sig.punctuation) return TENSION_SWEAR_ALONE
  const sum = Object.keys(TENSION_WEIGHTS).reduce((acc, k) => acc + (sig[k] ? TENSION_WEIGHTS[k] : 0), 0)
  return Math.min(sum, TENSION_MESSAGE_MAX)
}

/** Keep only entries ({ at, score }) inside the window. */
export function recentTension(entries, now) {
  return entries.filter(e => now - e.at < TENSION_WINDOW_MS)
}

/** Total score in the window. */
export function tensionTotal(entries, now) {
  return recentTension(entries, now).reduce((sum, e) => sum + e.score, 0)
}

/** Has frustration risen enough to offer a breather? */
export function tensionUptick(entries, now) {
  return tensionTotal(entries, now) >= TENSION_THRESHOLD
}

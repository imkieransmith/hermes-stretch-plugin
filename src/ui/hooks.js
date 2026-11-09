/** React hooks for the card: ticking, measuring our own element, motion. */

import { useEffect, useRef, useState } from 'react'
import { EXIT_MS } from '../config.js'
import { EASE_IN, EASE_OUT, ENTER_MS, FADE_MS, STEP_ENTER_EASE, STEP_ENTER_MS } from './theme.js'

/** Re-render every `ms` while `active`. */
export function useTicker(active, ms = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setTick(t => t + 1), ms)
    return () => clearInterval(id)
  }, [active, ms])
}

/**
 * Watch whatever element `ref` points at with a ResizeObserver, calling
 * `onResize(el, entry)`. Checked after every render: if React swapped the element
 * (a remount), the old one is let go and the new one watched, so a
 * measurement never goes stale.
 */
function useResize(ref, onResize) {
  const watched = useRef(null) // { el, ro }
  useEffect(() => {
    const el = ref.current
    if (watched.current && watched.current.el === el) return
    if (watched.current) watched.current.ro.disconnect()
    watched.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => onResize(el, entry))
    ro.observe(el)
    watched.current = { el, ro }
  })
  useEffect(
    () => () => {
      if (watched.current) watched.current.ro.disconnect()
      watched.current = null
    },
    []
  )
}

/** Width of our own element's content box (null until measured). */
export function useWidth(ref) {
  const [width, setWidth] = useState(null)
  useResize(ref, (el, entry) => setWidth(Math.round(entry.contentRect.width)))
  return width
}

/** Our own element's border-box height (null until measured). */
export function useHeight(ref) {
  const [height, setHeight] = useState(null)
  useResize(ref, el => {
    const h = Math.round(el.getBoundingClientRect().height)
    // ±1 px is rounding noise; ignoring it keeps tile ↔ text from ping-ponging.
    setHeight(prev => (prev != null && Math.abs(prev - h) <= 1 ? prev : h))
  })
  return height
}

/**
 * A new step arriving: our own element fades in when `key` changes (not on
 * mount). A fade only, no movement. Off with reduced motion.
 */
export function useEnterOnChange(ref, key) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return undefined
    }
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return undefined
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: STEP_ENTER_MS,
      easing: STEP_ENTER_EASE
    })
    return () => anim.cancel()
  }, [key])
}

/** Soft cross-fade of our own element when `key` changes (not on mount). */
export function useFadeOnChange(ref, key) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return undefined
    }
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return undefined
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASE_OUT })
    return () => anim.cancel()
  }, [key])
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Enter/exit motion for our OWN root element (Web Animations API on a ref —
 * no injected CSS, no app DOM). The layout zone itself snaps; this softens it.
 */
export function useCardMotion(ref, closing) {
  // Runs on mount (enter) and whenever `closing` flips: true → exit,
  // false again (work resumed mid-exit) → enter.
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

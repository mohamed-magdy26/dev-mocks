import { clsx } from 'clsx'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { FOCUS } from './classes.js'

/** The gap between the (i) button and its tip, in pixels, matching the mt-1.5 and mb-1.5 below. */
const TIP_GAP = 6

/** How close to the panel's edge the tip may come, in pixels, so it never looks glued to it. */
const EDGE_MARGIN = 8

/**
 * The edges the tip must stay inside. The panel's body scrolls, so a tip opened near its bottom or
 * its right is cut off by that box, not by the browser window. A tip with no scrolling box above it,
 * which happens in a test or if the panel's layout changes, is held inside the window instead.
 *
 * The right and bottom edges come from clientWidth and clientHeight, which leave out the scrollbars
 * the box already shows. Measuring to the border edge instead would let a tip sit under the vertical
 * scrollbar, and those few pixels are enough to put a second scrollbar along the bottom.
 */
function clipEdges(button: HTMLElement): { bottom: number; left: number; right: number } {
  for (let box = button.parentElement; box; box = box.parentElement) {
    const flow = getComputedStyle(box)
    if (/^(auto|scroll|hidden|clip)$/.test(flow.overflowY) || /^(auto|scroll|hidden|clip)$/.test(flow.overflowX)) {
      // clientTop and clientLeft are the box's own border widths, which clientHeight and clientWidth
      // both start inside, so they are added back to reach the same edges the rectangle measures to.
      const seen = box.getBoundingClientRect()
      const left = seen.left + box.clientLeft
      return { bottom: seen.top + box.clientTop + box.clientHeight, left, right: left + box.clientWidth }
    }
  }
  return { bottom: window.innerHeight, left: 0, right: window.innerWidth }
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
      <path d="M8 7.3v4.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The worked examples at the foot of a tip, under a hairline. Reading one line of what to type and
 * one line of what it then answers is faster than reading the same rule written as a sentence.
 */
export function TipCases({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 border-t border-line-strong pt-2">{children}</div>
}

/** One example: `code` is what the user types or picks, and the text under it is what that answers. */
export function TipCase({ code, children }: { code: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <code className="justify-self-start break-all rounded-xs bg-sunken px-1.5 py-0.5 font-mono text-xs font-medium text-ink">
        {code}
      </code>
      <span className="text-faint">{children}</span>
    </div>
  )
}

/** A value written inside a tip's prose, such as a body the rule would match. */
export function TipValue({ children }: { children: ReactNode }) {
  return <code className="break-all font-mono text-xs text-ink">{children}</code>
}

/**
 * The explanation of one field, behind an (i) button beside its label, so the form reads as fields
 * rather than as paragraphs. `label` names the field in the button's own label, because "More
 * information" repeated eight times down the form tells a screen reader user nothing.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  // Hover and focus show the text while they last. A click pins it, so it survives the mouse leaving
  // and can be read on a touch screen, where hover does not exist at all.
  const [pinned, setPinned] = useState(false)
  const [pointing, setPointing] = useState(false)
  const [focused, setFocused] = useState(false)
  const open = pinned || pointing || focused
  const button = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)

  // Measured after the tip is in the page and before the browser paints it, so a tip opened near an
  // edge of the panel's scrolling body is moved instead of being cut off by it.
  useLayoutEffect(() => {
    if (!open || !button.current || !tip.current) return
    const edge = clipEdges(button.current)
    const anchor = button.current.getBoundingClientRect()
    setAbove(tip.current.offsetHeight + TIP_GAP > edge.bottom - anchor.bottom)
    // The tip hangs from the button's left edge. This slides it back leftwards when its right edge
    // would leave the panel, and stops at the panel's left edge, because a tip beside a button in
    // the middle of a narrow panel has room on neither side and has to sit across the button.
    const overRight = anchor.left + tip.current.offsetWidth + EDGE_MARGIN - edge.right
    const shift = Math.max(Math.min(0, -overRight), edge.left + EDGE_MARGIN - anchor.left)
    tip.current.style.setProperty('--dm-tip-shift', `${Math.round(shift)}px`)
  }, [open])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape' || !open) return
    // Stops here, so Escape over an open tip closes the tip and leaves the panel open.
    event.stopPropagation()
    setPinned(false)
    setPointing(false)
    event.currentTarget.blur()
  }

  return (
    <div className="relative inline-flex" onMouseEnter={() => setPointing(true)} onMouseLeave={() => setPointing(false)}>
      <button
        ref={button}
        type="button"
        aria-label={`What "${label}" means`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setPinned(!pinned)}
        // Only keyboard focus opens the tip. A mouse click focuses the button too, and counting that
        // would hold the tip open after the second click that was meant to close it.
        onFocus={(event) => setFocused(event.target.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className={clsx(
          'grid h-4 w-4 place-items-center rounded-full transition-colors',
          FOCUS,
          open ? 'text-accent' : 'text-faint hover:text-dim',
        )}
      >
        <InfoIcon />
      </button>
      <div
        ref={tip}
        id={id}
        role="note"
        // One width for every tip, slid sideways by the measured --dm-tip-shift so the text can never
        // run past the panel's edge. Closed, it is display:none, so it adds nothing to the body's
        // scrollable area.
        className={clsx(
          'absolute left-0 z-10 grid w-tip translate-x-tip gap-2 rounded-field border border-line-strong bg-raised px-2.5 py-2 text-sm font-normal normal-case leading-normal tracking-normal text-dim shadow-menu',
          above ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          { hidden: !open },
        )}
      >
        {children}
      </div>
    </div>
  )
}

import { clsx } from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { FOCUS } from './classes.js'
import { GearIcon } from './icons.js'
import { BAR, EDGE, isDragStart, isSideEdge, nearestSpot, nudgeSpot, ruleStatus, type Spot } from './settings.js'

const NEAR_PX = 96
const PRIMARY_BUTTON = 0
/*
 * `focus-visible`, never plain `focus`: a mouse press focuses a button, so a plain `focus` ring
 * would appear the moment you grab the tab to drag it and stay there after you let go.
 * The ring falls on the host page, which may be white, so a dark halo sits under the lime ring.
 */
const LAUNCHER_FOCUS = [FOCUS, 'focus-visible:shadow-focus-halo']
/** Both the ⚙️ tab and the bar left in its place can be dragged, so both carry these. */
const DRAGGABLE = 'touch-none select-none'

/** The arrow keys that move the tab along its own edge. A key not in the table is left to the browser. */
const SIDE_KEYS: Record<string, number | undefined> = { ArrowUp: -1, ArrowDown: 1 }
const FLAT_KEYS: Record<string, number | undefined> = { ArrowLeft: -1, ArrowRight: 1 }

interface LauncherProps {
  buttonRef: RefObject<HTMLButtonElement>
  open: boolean
  shrunk: boolean
  count: number
  paused: boolean
  spot: Spot
  shortcutLabel: string
  shrinkLabel: string
  autoFocus: boolean
  onToggle: () => void
  onOpen: () => void
  onSpotChange: (spot: Spot) => void
}

/**
 * Writes the place along the edge onto the button this component renders. It is set on the element
 * rather than written into a class, because the place is a measurement the developer chooses by
 * dragging, and Tailwind can only carry values that are written out in the source.
 */
function useSpotProperty(button: RefObject<HTMLButtonElement>, at: number) {
  useLayoutEffect(() => {
    button.current?.style.setProperty('--dm-at', `${(at * 100).toFixed(2)}%`)
  }, [button, at])
}

/** Moves the tab along its edge with the arrow keys, which is the only way to move it without a mouse. */
function arrowMoveHandler(spot: Spot, onSpotChange: (spot: Spot) => void) {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
    // A held modifier means the key belongs to the browser or to a screen reader: Alt+Left is Back in
    // Chrome, and several JAWS commands hold Ctrl with an arrow. A plain arrow does nothing on a
    // button of its own, so only a plain arrow is taken.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const steps = (isSideEdge(spot.edge) ? SIDE_KEYS : FLAT_KEYS)[event.key]
    if (steps === undefined) return
    event.preventDefault()
    onSpotChange(nudgeSpot(spot, steps))
  }
}

interface Drag {
  x: number
  y: number
  moved: boolean
}

/**
 * Dragging a button to another edge. Both the ⚙️ tab and the shrunk bar use it, so the bar can be
 * moved out of the way without being brought back to full size first.
 *
 * `press` wraps whatever the button does when clicked. A drag ends with a click on the same button,
 * and that click must not also open the panel, so the drag swallows it.
 */
function useEdgeDrag(onSpotChange: (spot: Spot) => void) {
  const drag = useRef<Drag | null>(null)
  const dragged = useRef(false)
  const [dragging, setDragging] = useState(false)

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    dragged.current = false
    if (event.button !== PRIMARY_BUTTON) return
    drag.current = { x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved) {
      if (!isDragStart(dx, dy)) return
      start.moved = true
      setDragging(true)
    }
    // Set on the element, not through state: a re-render on every pointer move would make the drag lag.
    event.currentTarget.style.setProperty('--dm-drag-x', `${dx}px`)
    event.currentTarget.style.setProperty('--dm-drag-y', `${dy}px`)
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    drag.current = null
    if (!start?.moved) return
    setDragging(false)
    event.currentTarget.style.removeProperty('--dm-drag-x')
    event.currentTarget.style.removeProperty('--dm-drag-y')
    if (event.type !== 'pointerup') return
    dragged.current = true
    onSpotChange(nearestSpot(event.clientX, event.clientY, globalThis.innerWidth, globalThis.innerHeight))
  }

  return {
    dragging,
    press: (action: () => void) => () => {
      if (dragged.current) {
        dragged.current = false
        return
      }
      action()
    },
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
  }
}

interface SliverProps {
  buttonRef: RefObject<HTMLButtonElement>
  open: boolean
  count: number
  paused: boolean
  spot: Spot
  shortcutLabel: string
  shrinkLabel: string
  autoFocus: boolean
  onOpen: () => void
  onSpotChange: (spot: Spot) => void
}

/**
 * What is left of the ⚙️ tab once it is shrunk: a thin bar against the screen edge. Clicking it opens
 * the panel in one click and leaves the tab shrunk, so the app keeps the quiet edge it was given.
 * Its button is 28 px by 10 px, a quarter of the box it used to take, because the app underneath has
 * to stay within reach.
 */
function Sliver(props: SliverProps) {
  const { buttonRef, open, count, paused, spot, shortcutLabel, shrinkLabel, autoFocus, onOpen } = props
  const status = ruleStatus(count, paused)
  const edge = EDGE[spot.edge]
  const bar = BAR[isSideEdge(spot.edge) ? 'side' : 'flat']
  const { dragging, press, handlers } = useEdgeDrag(props.onSpotChange)
  useSpotProperty(buttonRef, spot.at)
  return (
    <button
      ref={buttonRef}
      type="button"
      autoFocus={autoFocus}
      aria-expanded={open}
      // The panel is in the page only while it is open, so the id is claimed only while it exists.
      aria-controls={open ? 'dm-pop' : undefined}
      aria-haspopup="dialog"
      aria-label={`${open ? 'Close' : 'Open'} the dev mocks panel. ${status}. The gear tab is shrunk to this bar. The arrow keys move it along the screen edge, and dragging moves it to another edge.`}
      aria-keyshortcuts={`${shortcutLabel} ${shrinkLabel}`}
      title={`${status} · click to open dev mocks · drag to move · ${shrinkLabel} brings the ⚙️ tab back`}
      onClick={press(onOpen)}
      onKeyDown={arrowMoveHandler(spot, props.onSpotChange)}
      {...handlers}
      className={clsx(LAUNCHER_FOCUS, DRAGGABLE, edge.sliver, 'group fixed z-top flex', {
        'translate-x-drag-x translate-y-drag-y cursor-grabbing will-change-transform': dragging,
      })}
    >
      <span
        aria-hidden="true"
        className={clsx(
          edge.bar,
          bar.thickness,
          // A rule to show makes the bar longer, so a glance at the edge says whether anything is mocked.
          count === 0 ? bar.none : bar.rules,
          'dm-sliver ring-1 ring-panel transition-size duration-200 ease-dm',
          {
            'animate-rec bg-accent': count > 0 && !paused,
            'dm-sliver-paused': count > 0 && paused,
            'bg-faint': count === 0,
          },
        )}
      />
    </button>
  )
}

interface FabProps {
  buttonRef: RefObject<HTMLButtonElement>
  open: boolean
  count: number
  paused: boolean
  spot: Spot
  shortcutLabel: string
  shrinkLabel: string
  autoFocus: boolean
  onToggle: () => void
  onSpotChange: (spot: Spot) => void
}

function Fab(props: FabProps) {
  const { buttonRef, open, count, paused, spot } = props
  const [near, setNear] = useState(false)
  const edge = EDGE[spot.edge]
  const active = count > 0 && !paused
  const pausedRules = count > 0 && paused
  const { dragging, press, handlers } = useEdgeDrag(props.onSpotChange)
  const idle = !open && !near && !dragging
  useSpotProperty(buttonRef, spot.at)

  // The box is measured only when it can change, so a mouse move on the app costs a few comparisons, not a layout.
  useEffect(() => {
    const button = buttonRef.current
    if (open || !button) return
    let box = button.getBoundingClientRect()
    const measure = () => {
      box = button.getBoundingClientRect()
    }
    const sizes = new ResizeObserver(measure)
    sizes.observe(button)
    addEventListener('resize', measure)
    const onMove = (event: globalThis.PointerEvent) => {
      const dx = Math.max(box.left - event.clientX, 0, event.clientX - box.right)
      const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom)
      setNear(Math.hypot(dx, dy) < NEAR_PX)
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      removeEventListener('resize', measure)
      sizes.disconnect()
    }
    // Do not remove `spot` from this list although the effect never reads it. A ResizeObserver
    // reports a change of size, never of place, so without `spot` the box measured here keeps the
    // tab's old place after a drag, and the tab stops noticing the mouse coming near it.
  }, [open, spot, buttonRef])

  return (
    <button
      ref={buttonRef}
      type="button"
      autoFocus={props.autoFocus}
      aria-expanded={open}
      aria-controls={open ? 'dm-pop' : undefined}
      aria-haspopup="dialog"
      aria-label={`Dev mocks panel. ${ruleStatus(count, paused)}. The arrow keys move this tab along the screen edge, and dragging moves it to another edge.`}
      aria-keyshortcuts={`${props.shortcutLabel} ${props.shrinkLabel}`}
      title={`${ruleStatus(count, paused)} · drag to move · ${props.shortcutLabel} opens the panel · ${props.shrinkLabel} shrinks this tab`}
      onClick={press(props.onToggle)}
      onKeyDown={arrowMoveHandler(spot, props.onSpotChange)}
      {...handlers}
      className={clsx(
        LAUNCHER_FOCUS,
        DRAGGABLE,
        edge.tab,
        'group fixed z-top flex items-center gap-1.5 border border-line-strong bg-panel text-ink shadow-pop transition-fab duration-200 ease-dm hover:border-faint focus-visible:opacity-100',
        {
          [edge.tucked]: idle,
          'translate-x-drag-x translate-y-drag-y cursor-grabbing will-change-transform': dragging,
          'opacity-75': idle,
        },
      )}
    >
      <span
        aria-hidden="true"
        className={clsx('absolute rounded-full', edge.stripe, {
          'bg-accent': active,
          'bg-amber': pausedRules,
          'bg-line-strong': count === 0,
        })}
      />
      <GearIcon className="h-5 w-5 transition-transform duration-500 ease-dm group-aria-expanded:rotate-90" />
      <span
        className={clsx('grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono text-xs font-bold leading-none', {
          'bg-accent text-accent-ink': active,
          'bg-hover text-ink': !active,
          'shadow-ring-amber': pausedRules,
        })}
      >
        {count}
      </span>
    </button>
  )
}

/**
 * The ⚙️ tab on the screen edge. Dragging it sticks it to the nearest of the four edges, at the place
 * it was dropped, and the arrow keys move it along that edge. Shrunk, it leaves a thin bar on the
 * edge: a solid lime bar while rules are active, a split amber bar while paused, a short grey stub
 * with no rules. That bar opens the panel on one click, without bringing the tab back, and it can be
 * dragged to another edge exactly like the tab itself.
 */
export function Launcher(props: LauncherProps) {
  if (props.shrunk) {
    return (
      <Sliver
        buttonRef={props.buttonRef}
        open={props.open}
        count={props.count}
        paused={props.paused}
        spot={props.spot}
        shortcutLabel={props.shortcutLabel}
        shrinkLabel={props.shrinkLabel}
        autoFocus={props.autoFocus}
        onOpen={props.onOpen}
        onSpotChange={props.onSpotChange}
      />
    )
  }
  return (
    <Fab
      buttonRef={props.buttonRef}
      open={props.open}
      count={props.count}
      paused={props.paused}
      spot={props.spot}
      shortcutLabel={props.shortcutLabel}
      shrinkLabel={props.shrinkLabel}
      autoFocus={props.autoFocus}
      onToggle={props.onToggle}
      onSpotChange={props.onSpotChange}
    />
  )
}

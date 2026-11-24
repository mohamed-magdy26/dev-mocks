import { clsx } from 'clsx'
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { FOCUS } from './classes.js'
import { GearIcon } from './icons.js'
import { EDGE, isDragStart, nearestCorner, ruleStatus, type Corner } from './settings.js'

const NEAR_PX = 96
const PRIMARY_BUTTON = 0
// The ring falls on the host page, which may be white, so a dark halo sits under the lime ring.
const LAUNCHER_FOCUS = [FOCUS, 'focus-visible:shadow-focus-halo']

interface LauncherProps {
  buttonRef: RefObject<HTMLButtonElement>
  open: boolean
  hidden: boolean
  count: number
  paused: boolean
  corner: Corner
  shortcutLabel: string
  autoFocus: boolean
  onToggle: () => void
  onShow: () => void
  onCornerChange: (corner: Corner) => void
}

interface SliverProps {
  count: number
  paused: boolean
  corner: Corner
  shortcutLabel: string
  autoFocus: boolean
  onShow: () => void
}

function Sliver({ count, paused, corner, shortcutLabel, autoFocus, onShow }: SliverProps) {
  const status = ruleStatus(count, paused)
  const edge = EDGE[corner]
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      aria-label={`Show the dev mocks button. ${status}.`}
      aria-keyshortcuts={shortcutLabel}
      title={`${status} · click or press ${shortcutLabel} to show the dev mocks tab`}
      onClick={onShow}
      className={clsx(LAUNCHER_FOCUS, edge.sliver, 'group fixed z-top flex h-11 w-6 items-center')}
    >
      <span
        aria-hidden="true"
        className={clsx(
          edge.bar,
          'dm-sliver w-1 ring-1 ring-panel transition-size duration-200 ease-dm group-hover:w-2 group-focus-visible:w-2',
          {
            'h-7 animate-rec bg-accent group-hover:h-9 group-focus-visible:h-9': count > 0 && !paused,
            'dm-sliver-paused h-7 group-hover:h-9 group-focus-visible:h-9': count > 0 && paused,
            'h-3 bg-faint group-hover:h-5 group-focus-visible:h-5': count === 0,
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
  corner: Corner
  autoFocus: boolean
  onToggle: () => void
  onCornerChange: (corner: Corner) => void
}

interface Drag {
  x: number
  y: number
  moved: boolean
}

function Fab(props: FabProps) {
  const { buttonRef, open, count, paused, corner } = props
  const drag = useRef<Drag | null>(null)
  const dragged = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [near, setNear] = useState(false)
  const edge = EDGE[corner]
  const idle = !open && !near && !dragging
  const active = count > 0 && !paused
  const pausedRules = count > 0 && paused

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
      if (drag.current) return
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
  }, [open, corner, buttonRef])

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
    props.onCornerChange(nearestCorner(event.clientX, event.clientY, globalThis.innerWidth, globalThis.innerHeight))
  }

  function onClick() {
    if (dragged.current) {
      dragged.current = false
      return
    }
    props.onToggle()
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      autoFocus={props.autoFocus}
      aria-expanded={open}
      aria-controls="dm-pop"
      aria-label={`Dev mocks panel. ${ruleStatus(count, paused)}.`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={clsx(
        LAUNCHER_FOCUS,
        edge.tab,
        'group fixed z-top flex w-9 touch-none flex-col items-center gap-1.5 border border-line-strong bg-panel py-2.5 text-ink shadow-pop transition-fab duration-200 ease-dm hover:border-faint focus-visible:opacity-100',
        {
          [edge.tucked]: idle,
          'translate-x-drag-x translate-y-drag-y cursor-grabbing will-change-transform': dragging,
          'opacity-75': idle,
        },
      )}
    >
      <span
        aria-hidden="true"
        className={clsx('absolute inset-y-3.5 w-0.5 rounded-full', edge.stripe, {
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

/** The ⚙️ tab on the screen edge. Dragging it snaps it to the nearest corner. While it is hidden, a thin bar stays on the edge: a solid lime bar while rules are active, a split amber bar while paused, a short grey stub with no rules. */
export function Launcher(props: LauncherProps) {
  if (!props.hidden) {
    return (
      <Fab
        buttonRef={props.buttonRef}
        open={props.open}
        count={props.count}
        paused={props.paused}
        corner={props.corner}
        autoFocus={props.autoFocus}
        onToggle={props.onToggle}
        onCornerChange={props.onCornerChange}
      />
    )
  }
  return (
    <Sliver
      count={props.count}
      paused={props.paused}
      corner={props.corner}
      shortcutLabel={props.shortcutLabel}
      autoFocus={props.autoFocus}
      onShow={props.onShow}
    />
  )
}

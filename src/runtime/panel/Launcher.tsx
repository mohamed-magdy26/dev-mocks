import { clsx } from 'clsx'
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { FOCUS } from './classes.js'
import { GearIcon } from './icons.js'
import { FAB_CORNER, isDragStart, nearestCorner, ruleStatus, showsDot, type Corner } from './settings.js'

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

interface DotProps {
  count: number
  paused: boolean
  corner: Corner
  shortcutLabel: string
  autoFocus: boolean
  onShow: () => void
}

function Dot({ count, paused, corner, shortcutLabel, autoFocus, onShow }: DotProps) {
  const status = ruleStatus(count, paused)
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      aria-label={`${status}. Show the dev mocks button.`}
      aria-keyshortcuts={shortcutLabel}
      title={`${status} · click or press ${shortcutLabel} to show ⚙️`}
      onClick={onShow}
      className={clsx(LAUNCHER_FOCUS, FAB_CORNER[corner], 'fixed z-top grid h-6 w-6 place-items-center rounded-full')}
    >
      <span
        aria-hidden="true"
        className={clsx('dm-dot h-2 w-2 rounded-full ring-2 ring-panel', {
          'animate-rec bg-accent': !paused,
          'bg-amber': paused,
        })}
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
      aria-label={`Dev mocks panel, ${ruleStatus(count, paused)}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={clsx(
        LAUNCHER_FOCUS,
        FAB_CORNER[corner],
        'group fixed z-top flex h-11 touch-none items-center gap-2 rounded-full border border-line-strong bg-panel pl-3.5 pr-3 text-ink shadow-pop transition-fab duration-200 ease-dm focus-visible:opacity-100',
        {
          'hover:-translate-y-px hover:border-faint': !dragging,
          'translate-x-drag-x translate-y-drag-y cursor-grabbing will-change-transform': dragging,
          'opacity-75': !open && !near && !dragging,
        },
      )}
    >
      <GearIcon className="h-5 w-5 transition-transform duration-500 ease-dm group-aria-expanded:rotate-90" />
      <span
        className={clsx('grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono text-xs font-bold leading-none', {
          'bg-accent text-accent-ink': count > 0 && !paused,
          'bg-hover text-ink': count === 0 || paused,
        })}
      >
        {count}
      </span>
    </button>
  )
}

/** The ⚙️ button. Dragging it snaps it to a corner. While hidden, only a dot stays when there are rules: lime while active, amber while paused. */
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
  if (!showsDot(props)) return null
  return (
    <Dot
      count={props.count}
      paused={props.paused}
      corner={props.corner}
      shortcutLabel={props.shortcutLabel}
      autoFocus={props.autoFocus}
      onShow={props.onShow}
    />
  )
}

import { plural } from './form.js'

const PREFIX = 'dev-mocks:'
// The stored name stays "hidden" although the setting is now called shrunk, so a developer who
// already shrank the button keeps that choice after upgrading.
export const SHRUNK_KEY = 'hidden'
export const SPOT_KEY = 'spot'
/** Written by versions up to 0.3.0, which had four corners and no edges. Read only to carry that choice over. */
export const CORNER_KEY = 'corner'
export const ON_FLAG = '1'
export const OFF_FLAG = ''

/** Panel settings live in localStorage, like the rules, so they last across sessions. */
export function readSetting(key: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? ''
  } catch {
    return ''
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch (e) {
    console.warn('Failed to save panel setting', e)
  }
}

/** `rule` is the form, used to create a rule and to edit one. `active` lists the rules already saved. */
export type Tab = 'rule' | 'active' | 'requests'
export const TABS: Tab[] = ['active', 'rule', 'requests']
export const TAB_LABELS: Record<Tab, string> = { active: 'Active rules', rule: 'Rule', requests: 'Requests' }

/**
 * The tab the panel opens on. A tab the user already chose this session wins, so reopening the panel
 * returns them to where they were. Otherwise it opens on the list of active rules, whether or not any
 * exist, so the first thing seen is always what is mocking the app right now.
 */
export function openingTab(saved: string): Tab {
  if (TABS.some((name) => name === saved)) return saved as Tab
  return 'active'
}

export type Edge = 'left' | 'right' | 'top' | 'bottom'

/**
 * Where the ⚙️ tab sits. `edge` is the screen edge it touches. `at` is how far along that edge it
 * sits, from 0 at the start to 1 at the end: on the left and right edges 0 is the top of the window
 * and 1 the bottom, and on the top and bottom edges 0 is the left and 1 the right. It is a fraction
 * of the window, not a number of pixels, so the tab keeps the same place when the window is resized.
 */
export interface Spot {
  edge: Edge
  at: number
}

export const DEFAULT_SPOT: Spot = { edge: 'right', at: 0.82 }

/** True while the tab is on the left or right edge, where it slides up and down instead of sideways. */
export const isSideEdge = (edge: Edge): boolean => edge === 'left' || edge === 'right'

const EDGES: Edge[] = ['left', 'right', 'top', 'bottom']
const isEdge = (value: string): value is Edge => EDGES.some((edge) => edge === value)
const clampAt = (at: number): number => Math.min(Math.max(at, 0), 1)

/** The spot is stored as one line, such as "right:0.820", because localStorage holds text only. */
export const spotText = (spot: Spot): string => `${spot.edge}:${spot.at.toFixed(3)}`

export function parseSpot(text: string): Spot | undefined {
  const [edge, along] = text.split(':')
  const at = Number(along)
  if (!isEdge(edge) || along === '' || !Number.isFinite(at)) return undefined
  return { edge, at: clampAt(at) }
}

/**
 * The four corners saved by versions up to 0.3.0, which could only put the tab at one of them. Each
 * one is read as the edge it touched and roughly the place it used to sit, so a developer who had
 * moved the tab keeps that side of the screen after upgrading.
 */
const SAVED_CORNERS: Record<string, Spot> = {
  'top-left': { edge: 'left', at: 0.12 },
  'top-right': { edge: 'right', at: 0.12 },
  'bottom-left': { edge: 'left', at: 0.88 },
  'bottom-right': { edge: 'right', at: 0.88 },
}

/**
 * `Object.hasOwn` first, because the saved text comes from localStorage and a plain object answers
 * for every name on `Object.prototype`. Without the check, a saved corner of `toString` hands back
 * a function, and the tab then reads `edge` off it and renders nothing.
 */
const savedCorner = (name: string): Spot | undefined =>
  Object.hasOwn(SAVED_CORNERS, name) ? SAVED_CORNERS[name] : undefined

export function readSpot(): Spot {
  return parseSpot(readSetting(SPOT_KEY)) ?? savedCorner(readSetting(CORNER_KEY)) ?? DEFAULT_SPOT
}

/**
 * The spot for a pointer let go at this point: the nearest of the four edges, and the place along
 * that edge the pointer was at. A pointer let go in the middle of the window is near the bottom
 * edge on a wide screen, because that is the shortest way out.
 */
export function nearestSpot(x: number, y: number, width: number, height: number): Spot {
  const reaches = [
    { edge: 'left' as const, gap: x, at: y / height },
    { edge: 'right' as const, gap: width - x, at: y / height },
    { edge: 'top' as const, gap: y, at: x / width },
    { edge: 'bottom' as const, gap: height - y, at: x / width },
  ]
  const nearest = reaches.reduce((best, reach) => (reach.gap < best.gap ? reach : best))
  return { edge: nearest.edge, at: clampAt(nearest.at) }
}

/** One arrow-key press moves the tab a twentieth of the way along its edge. */
export const NUDGE = 0.05

/** Moves the tab along its own edge, for the arrow keys, which is the way to move it without a mouse. */
export const nudgeSpot = (spot: Spot, steps: number): Spot => ({ edge: spot.edge, at: clampAt(spot.at + steps * NUDGE) })

/** Clockwise. The header's move button uses it, so the tab can change edges without a mouse drag. */
export const NEXT_EDGE: Record<Edge, Edge> = { right: 'bottom', bottom: 'left', left: 'top', top: 'right' }

interface EdgeClasses {
  tab: string
  tucked: string
  stripe: string
  sliver: string
  bar: string
  pop: string
  popNear: string
}

/**
 * Everything that changes with the edge the tab touches: where it is pinned, which of its sides is
 * flat against the screen, and which side the panel opens on. `dm-spot-*` also slides the tab along
 * the edge, by reading the `--dm-at` property the tab carries.
 *
 * There are two places the panel can open. `pop` is 44 px in from the edge, which clears the 36 px
 * tab. `popNear` is 20 px in, used while the tab is shrunk, because the bar left in its place is
 * only 10 px deep and the panel would otherwise float away from the thing it belongs to.
 */
// Do not build these class names from pieces: Tailwind finds a class only when the whole name is written in a file.
export const EDGE: Record<Edge, EdgeClasses> = {
  left: {
    tab: 'dm-spot-left w-9 flex-col py-2.5 rounded-r-tab border-l-0',
    tucked: 'dm-tuck-left',
    stripe: 'inset-y-3.5 right-0 w-0.5',
    sliver: 'dm-spot-left h-7 w-2.5 items-center justify-start',
    bar: 'rounded-r-xs',
    pop: 'dm-pop-down left-11 origin-left narrow:right-4',
    popNear: 'dm-pop-down left-5 origin-left narrow:right-4',
  },
  right: {
    tab: 'dm-spot-right w-9 flex-col py-2.5 rounded-l-tab border-r-0',
    tucked: 'dm-tuck-right',
    stripe: 'inset-y-3.5 left-0 w-0.5',
    sliver: 'dm-spot-right h-7 w-2.5 items-center justify-end',
    bar: 'rounded-l-xs',
    pop: 'dm-pop-down right-11 origin-right narrow:left-4',
    popNear: 'dm-pop-down right-5 origin-right narrow:left-4',
  },
  top: {
    tab: 'dm-spot-top h-9 flex-row px-2.5 rounded-b-tab border-t-0',
    tucked: 'dm-tuck-up',
    stripe: 'inset-x-3.5 bottom-0 h-0.5',
    sliver: 'dm-spot-top h-2.5 w-7 items-start justify-center',
    bar: 'rounded-b-xs',
    pop: 'dm-pop-across top-11 origin-top',
    popNear: 'dm-pop-across top-5 origin-top',
  },
  bottom: {
    tab: 'dm-spot-bottom h-9 flex-row px-2.5 rounded-t-tab border-b-0',
    tucked: 'dm-tuck-down',
    stripe: 'inset-x-3.5 top-0 h-0.5',
    sliver: 'dm-spot-bottom h-2.5 w-7 items-end justify-center',
    bar: 'rounded-t-xs',
    pop: 'dm-pop-across bottom-11 origin-bottom',
    popNear: 'dm-pop-across bottom-5 origin-bottom',
  },
}

interface BarClasses {
  thickness: string
  rules: string
  none: string
}

/**
 * The thin bar left on the edge while the tab is shrunk. It stands on end against a left or right
 * edge and lies flat against a top or bottom edge, so the two swap width for height. `rules` is its
 * length while any rule exists, and `none` its shorter length while there is none.
 *
 * The bar grows by 2 px under the mouse, not by 8 px as it once did. Its button is deliberately
 * small, so that the app underneath stays within reach, and a bar that grew more than its button
 * would promise a click where there is none.
 */
export const BAR: Record<'side' | 'flat', BarClasses> = {
  side: {
    thickness: 'w-1 group-hover:w-1.5 group-focus-visible:w-1.5',
    rules: 'h-6 group-hover:h-7 group-focus-visible:h-7',
    none: 'h-3 group-hover:h-4 group-focus-visible:h-4',
  },
  flat: {
    thickness: 'h-1 group-hover:h-1.5 group-focus-visible:h-1.5',
    rules: 'w-6 group-hover:w-7 group-focus-visible:w-7',
    none: 'w-3 group-hover:w-4 group-focus-visible:w-4',
  },
}

/** A press that moves less than this is a click, not a drag. */
export const DRAG_START_PX = 6

export const isDragStart = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRAG_START_PX

export interface Shortcut {
  code: string
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
  label: string
}

/** Opens the panel and closes it again. */
export const DEFAULT_SHORTCUT: Shortcut = {
  code: 'KeyM',
  alt: true,
  shift: true,
  ctrl: false,
  meta: false,
  label: 'Alt+Shift+M',
}

/** Shrinks the ⚙️ tab to a bar on the edge, and brings it back. */
export const DEFAULT_SHRINK_SHORTCUT: Shortcut = {
  code: 'KeyH',
  alt: true,
  shift: true,
  ctrl: false,
  meta: false,
  label: 'Alt+Shift+H',
}

type Modifier = 'alt' | 'shift' | 'ctrl' | 'meta'
const MODIFIERS = new Map<string, Modifier>([
  ['alt', 'alt'],
  ['option', 'alt'],
  ['shift', 'shift'],
  ['ctrl', 'ctrl'],
  ['control', 'ctrl'],
  ['meta', 'meta'],
  ['cmd', 'meta'],
  ['command', 'meta'],
])

/** `event.code` names the key's position, so "M" also matches when the keyboard types Arabic or French. */
function keyCode(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (/^\d$/.test(key)) return `Digit${key}`
  if (/^f([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase()
  return ''
}

/** Reads text such as "Alt+Shift+M". A shortcut without Alt, Ctrl or Meta would fire while the user types, so it is refused. */
export function parseShortcut(text: string): Shortcut | undefined {
  const parts = text.split('+').map((part) => part.trim())
  const key = parts.pop() ?? ''
  const code = keyCode(key)
  if (!code) return undefined
  const held = { alt: false, shift: false, ctrl: false, meta: false }
  for (const part of parts) {
    const modifier = MODIFIERS.get(part.toLowerCase())
    if (!modifier) return undefined
    held[modifier] = true
  }
  if (!held.alt && !held.ctrl && !held.meta) return undefined
  const names = [held.ctrl && 'Ctrl', held.alt && 'Alt', held.shift && 'Shift', held.meta && 'Meta', key.toUpperCase()]
  return { code, ...held, label: names.filter(Boolean).join('+') }
}

/** `fallback` is the key this setting uses when the app sets none, or sets one the parser refuses. */
export function toShortcut(text: string | undefined, fallback: Shortcut = DEFAULT_SHORTCUT): Shortcut {
  if (text === undefined) return fallback
  const parsed = parseShortcut(text)
  if (parsed) return parsed
  console.warn(
    `[dev-mocks] The shortcut "${text}" is not valid, so ${fallback.label} is used. Write modifiers and one letter, digit or F-key, for example "Ctrl+Alt+K".`,
  )
  return fallback
}

/**
 * Reads both shortcuts the app asked for. The one that opens the panel is tested first when a key is
 * pressed, so if an app gives both the same keys, shrinking never happens. That case gets its own
 * warning in the DevTools Console, so the developer is told instead of left guessing.
 */
export function toShortcuts(
  open: string | undefined,
  shrink: string | undefined,
): { shortcut: Shortcut; shrinkShortcut: Shortcut } {
  const shortcut = toShortcut(open)
  const shrinkShortcut = toShortcut(shrink, DEFAULT_SHRINK_SHORTCUT)
  if (shortcut.label !== shrinkShortcut.label) return { shortcut, shrinkShortcut }
  console.warn(
    `[dev-mocks] Both shortcuts are ${shortcut.label}, so that key opens and closes the panel and nothing shrinks the ⚙️ tab. Give "shrinkShortcut" its own keys. The panel's own shrink button still works.`,
  )
  return { shortcut, shrinkShortcut }
}

type KeyState = Pick<KeyboardEvent, 'code' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'> & {
  getModifierState?: (key: string) => boolean
}

/** On Windows, AltGr reports Ctrl and Alt together. It types characters such as "µ", so it never counts as the shortcut. */
export function matchesShortcut(event: KeyState, shortcut: Shortcut): boolean {
  if (event.getModifierState?.('AltGraph')) return false
  return (
    event.code === shortcut.code &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.ctrlKey === shortcut.ctrl &&
    event.metaKey === shortcut.meta
  )
}

export function ruleStatus(count: number, paused: boolean): string {
  if (count === 0) return '0 rules'
  return `${plural(count, 'rule')} ${paused ? 'paused' : 'active'}`
}

/**
 * The console line printed on page load while the ⚙️ tab is shrunk to a bar, so a developer who
 * cannot see the tab can always find the way back. `shrink` is the key that brings the tab itself
 * back, which is the one worth printing: the bar on the edge already opens the panel on one click.
 */
export function shrunkNotice(state: { shrunk: boolean; paused: boolean; count: number }, shrink: Shortcut): string | undefined {
  if (!state.shrunk) return undefined
  const way = `The ⚙️ tab is shrunk to a bar on the screen edge. Click the bar to open the panel, or press ${shrink.label} to bring the tab back.`
  if (state.count === 0) return `[dev-mocks] ${way}`
  return `[dev-mocks] ${ruleStatus(state.count, state.paused)}. ${way}`
}

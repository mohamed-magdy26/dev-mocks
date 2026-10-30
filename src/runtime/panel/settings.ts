import { plural } from './form.js'

const PREFIX = 'dev-mocks:'
export const HIDDEN_KEY = 'hidden'
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

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export const DEFAULT_CORNER: Corner = 'bottom-right'

// Do not build these class names from pieces: Tailwind finds a class only when the whole name is written in a file.
export const FAB_CORNER: Record<Corner, string> = {
  'top-left': 'top-5 left-5 narrow:top-4 narrow:left-4',
  'top-right': 'top-5 right-5 narrow:top-4 narrow:right-4',
  'bottom-left': 'bottom-5 left-5 narrow:bottom-4 narrow:left-4',
  'bottom-right': 'bottom-5 right-5 narrow:bottom-4 narrow:right-4',
}

export const POP_CORNER: Record<Corner, string> = {
  'top-left': 'top-pop left-5 origin-top-left narrow:top-pop-narrow',
  'top-right': 'top-pop right-5 origin-top-right narrow:top-pop-narrow',
  'bottom-left': 'bottom-pop left-5 origin-bottom-left narrow:bottom-pop-narrow',
  'bottom-right': 'bottom-pop right-5 origin-bottom-right narrow:bottom-pop-narrow',
}

const isCorner = (value: string): value is Corner => Object.keys(FAB_CORNER).includes(value)

export function readCorner(): Corner {
  const saved = readSetting(CORNER_KEY)
  return isCorner(saved) ? saved : DEFAULT_CORNER
}

export function nearestCorner(x: number, y: number, width: number, height: number): Corner {
  const left = x < width / 2
  if (y < height / 2) return left ? 'top-left' : 'top-right'
  return left ? 'bottom-left' : 'bottom-right'
}

/** Clockwise. The header's move button uses it, so the button can change corners without a mouse drag. */
export const NEXT_CORNER: Record<Corner, Corner> = {
  'top-left': 'top-right',
  'top-right': 'bottom-right',
  'bottom-right': 'bottom-left',
  'bottom-left': 'top-left',
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

export const DEFAULT_SHORTCUT: Shortcut = {
  code: 'KeyD',
  alt: true,
  shift: true,
  ctrl: false,
  meta: false,
  label: 'Alt+Shift+D',
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

/** `event.code` names the key's position, so "D" also matches when the keyboard types Arabic or French. */
function keyCode(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (/^\d$/.test(key)) return `Digit${key}`
  if (/^f([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase()
  return ''
}

/** Reads text such as "Alt+Shift+D". A shortcut without Alt, Ctrl or Meta would fire while the user types, so it is refused. */
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

export function toShortcut(text: string | undefined): Shortcut {
  if (text === undefined) return DEFAULT_SHORTCUT
  const parsed = parseShortcut(text)
  if (parsed) return parsed
  console.warn(
    `[dev-mocks] The shortcut "${text}" is not valid, so ${DEFAULT_SHORTCUT.label} is used. Write modifiers and one letter, digit or F-key, for example "Ctrl+Alt+M".`,
  )
  return DEFAULT_SHORTCUT
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

/** While the button is hidden, a dot shows whenever there are rules: lime while they answer requests, amber while paused. */
export const showsDot = (state: { count: number }) => state.count > 0

export const ruleStatus = (count: number, paused: boolean) => `${plural(count, 'rule')} ${paused ? 'paused' : 'active'}`

/** The console line printed on page load while the button is hidden, so a developer can always find the way back. */
export function hiddenNotice(state: { hidden: boolean; paused: boolean; count: number }, shortcut: Shortcut): string | undefined {
  if (!state.hidden) return undefined
  const way = `Press ${shortcut.label} to show it.`
  if (!showsDot(state)) return `[dev-mocks] Panel hidden. ${way}`
  return `[dev-mocks] ${ruleStatus(state.count, state.paused)}, panel hidden. ${way}`
}

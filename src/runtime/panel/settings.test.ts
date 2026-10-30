import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CORNER,
  DEFAULT_SHORTCUT,
  hiddenNotice,
  isDragStart,
  matchesShortcut,
  nearestCorner,
  NEXT_CORNER,
  parseShortcut,
  readCorner,
  showsDot,
  toShortcut,
} from './settings.js'

// `key` is what an Arabic layout types on the D key; only `code` must decide the match.
const press = (code: string, held: { alt?: boolean; shift?: boolean; ctrl?: boolean; meta?: boolean } = {}) => ({
  code,
  key: 'ي',
  altKey: Boolean(held.alt),
  shiftKey: Boolean(held.shift),
  ctrlKey: Boolean(held.ctrl),
  metaKey: Boolean(held.meta),
})

describe('shortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the default Alt+Shift+D', () => {
    expect(parseShortcut('Alt+Shift+D')).toEqual({
      code: 'KeyD',
      alt: true,
      shift: true,
      ctrl: false,
      meta: false,
      label: 'Alt+Shift+D',
    })
    expect(parseShortcut('Alt+Shift+D')).toEqual(DEFAULT_SHORTCUT)
  })

  it('accepts other modifier names in any case, and writes them in one order', () => {
    expect(parseShortcut('option + ctrl + m')).toMatchObject({ code: 'KeyM', alt: true, ctrl: true, label: 'Ctrl+Alt+M' })
    expect(parseShortcut('Cmd+Shift+5')).toMatchObject({ code: 'Digit5', meta: true, shift: true, label: 'Shift+Meta+5' })
    expect(parseShortcut('Alt+F2')).toMatchObject({ code: 'F2', alt: true, label: 'Alt+F2' })
  })

  it('refuses a shortcut without Alt, Ctrl or Meta, an unknown modifier, and a key that is not one letter, digit or F-key', () => {
    for (const text of ['D', 'Shift+D', 'Hyper+D', 'Alt+toString+D', 'Alt+DD', 'Alt+', 'Alt+F13', '']) {
      expect(parseShortcut(text)).toBeUndefined()
    }
  })

  it('falls back to Alt+Shift+D with one warning when the option is not valid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toShortcut('Shift+D').label).toBe('Alt+Shift+D')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(toShortcut(undefined).label).toBe('Alt+Shift+D')
    expect(toShortcut('Ctrl+Alt+M').label).toBe('Ctrl+Alt+M')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('matches by key position and needs the exact modifiers', () => {
    expect(matchesShortcut(press('KeyD', { alt: true, shift: true }), DEFAULT_SHORTCUT)).toBe(true)
    expect(matchesShortcut(press('KeyD', { alt: true, shift: true, ctrl: true }), DEFAULT_SHORTCUT)).toBe(false)
    expect(matchesShortcut(press('KeyD', { alt: true }), DEFAULT_SHORTCUT)).toBe(false)
    expect(matchesShortcut(press('KeyS', { alt: true, shift: true }), DEFAULT_SHORTCUT)).toBe(false)
  })

  it('ignores AltGr, which Windows reports as Ctrl and Alt together', () => {
    const ctrlAltM = toShortcut('Ctrl+Alt+M')
    const altGr = { ...press('KeyM', { ctrl: true, alt: true }), getModifierState: (key: string) => key === 'AltGraph' }
    expect(matchesShortcut(press('KeyM', { ctrl: true, alt: true }), ctrlAltM)).toBe(true)
    expect(matchesShortcut(altGr, ctrlAltM)).toBe(false)
  })
})

describe('corners', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('picks the corner of the screen quarter the pointer is in', () => {
    expect(nearestCorner(100, 100, 1200, 800)).toBe('top-left')
    expect(nearestCorner(1100, 100, 1200, 800)).toBe('top-right')
    expect(nearestCorner(100, 700, 1200, 800)).toBe('bottom-left')
    expect(nearestCorner(600, 400, 1200, 800)).toBe('bottom-right')
  })

  it('reads the saved corner, and falls back to bottom right for a missing or unknown value', () => {
    const saved = new Map<string, string>([['dev-mocks:corner', 'top-left']])
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: vi.fn() })
    expect(readCorner()).toBe('top-left')
    saved.set('dev-mocks:corner', 'constructor')
    expect(readCorner()).toBe('bottom-right')
    saved.clear()
    expect(readCorner()).toBe('bottom-right')
  })

  it('moves clockwise through all four corners and back', () => {
    const visited = [DEFAULT_CORNER]
    for (let step = 0; step < 4; step++) visited.push(NEXT_CORNER[visited[step]])
    expect(visited).toEqual(['bottom-right', 'bottom-left', 'top-left', 'top-right', 'bottom-right'])
  })

  it('starts a drag only after the pointer moves 6 px', () => {
    expect([isDragStart(5, 0), isDragStart(0, -6), isDragStart(4, 5)]).toEqual([false, true, true])
  })
})

describe('hiddenNotice', () => {
  it('gives one line whenever the button is hidden, and counts the rules whether they are active or paused', () => {
    expect(hiddenNotice({ hidden: true, paused: false, count: 2 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] 2 rules active, panel hidden. Press Alt+Shift+D to show it.',
    )
    expect(hiddenNotice({ hidden: true, paused: false, count: 1 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] 1 rule active, panel hidden. Press Alt+Shift+D to show it.',
    )
    expect(hiddenNotice({ hidden: true, paused: true, count: 2 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] 2 rules paused, panel hidden. Press Alt+Shift+D to show it.',
    )
    expect(hiddenNotice({ hidden: true, paused: false, count: 0 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] Panel hidden. Press Alt+Shift+D to show it.',
    )
    expect(hiddenNotice({ hidden: false, paused: false, count: 2 }, DEFAULT_SHORTCUT)).toBeUndefined()
  })

  it('shows the dot whenever there is a rule, paused or not', () => {
    expect([showsDot({ count: 2 }), showsDot({ count: 1 }), showsDot({ count: 0 })]).toEqual([true, true, false])
  })
})

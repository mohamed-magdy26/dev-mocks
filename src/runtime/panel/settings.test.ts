import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CORNER,
  DEFAULT_SHORTCUT,
  EDGE,
  hiddenNotice,
  isDragStart,
  matchesShortcut,
  nearestCorner,
  NEXT_CORNER,
  openingTab,
  parseShortcut,
  POP_CORNER,
  readCorner,
  ruleStatus,
  toShortcut,
  type Corner,
} from './settings.js'

// `key` is what an Arabic layout types on the M key; only `code` must decide the match.
const press = (code: string, held: { alt?: boolean; shift?: boolean; ctrl?: boolean; meta?: boolean } = {}) => ({
  code,
  key: 'ة',
  altKey: Boolean(held.alt),
  shiftKey: Boolean(held.shift),
  ctrlKey: Boolean(held.ctrl),
  metaKey: Boolean(held.meta),
})

describe('shortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the default Alt+Shift+M', () => {
    expect(parseShortcut('Alt+Shift+M')).toEqual({
      code: 'KeyM',
      alt: true,
      shift: true,
      ctrl: false,
      meta: false,
      label: 'Alt+Shift+M',
    })
    expect(parseShortcut('Alt+Shift+M')).toEqual(DEFAULT_SHORTCUT)
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

  it('falls back to Alt+Shift+M with one warning when the option is not valid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toShortcut('Shift+D').label).toBe('Alt+Shift+M')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(toShortcut(undefined).label).toBe('Alt+Shift+M')
    expect(toShortcut('Ctrl+Alt+K').label).toBe('Ctrl+Alt+K')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('matches by key position and needs the exact modifiers', () => {
    expect(matchesShortcut(press('KeyM', { alt: true, shift: true }), DEFAULT_SHORTCUT)).toBe(true)
    expect(matchesShortcut(press('KeyM', { alt: true, shift: true, ctrl: true }), DEFAULT_SHORTCUT)).toBe(false)
    expect(matchesShortcut(press('KeyM', { alt: true }), DEFAULT_SHORTCUT)).toBe(false)
    expect(matchesShortcut(press('KeyD', { alt: true, shift: true }), DEFAULT_SHORTCUT)).toBe(false)
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

  it('opens the panel on the same edge as the tab, 48 px in, so the panel never covers the tab', () => {
    for (const corner of Object.keys(EDGE) as Corner[]) {
      const side = corner.endsWith('left') ? 'left' : 'right'
      expect(EDGE[corner].tab).toContain(`${side}-0`)
      expect(EDGE[corner].tucked).toBe(`dm-tuck-${side}`)
      expect(POP_CORNER[corner]).toContain(`${side}-12`)
    }
  })
})

describe('hiddenNotice', () => {
  it('gives one line whenever the button is hidden, and counts the rules whether they are active or paused', () => {
    expect(hiddenNotice({ hidden: true, paused: false, count: 2 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] 2 rules active, panel hidden. Press Alt+Shift+M to show it.',
    )
    expect(hiddenNotice({ hidden: true, paused: false, count: 1 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] 1 rule active, panel hidden. Press Alt+Shift+M to show it.',
    )
    expect(hiddenNotice({ hidden: true, paused: true, count: 2 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] 2 rules paused, panel hidden. Press Alt+Shift+M to show it.',
    )
    expect(hiddenNotice({ hidden: true, paused: false, count: 0 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] Panel hidden. Press Alt+Shift+M to show it.',
    )
    expect(hiddenNotice({ hidden: true, paused: true, count: 0 }, DEFAULT_SHORTCUT)).toBe(
      '[dev-mocks] Panel hidden. Press Alt+Shift+M to show it.',
    )
    expect(hiddenNotice({ hidden: false, paused: false, count: 2 }, DEFAULT_SHORTCUT)).toBeUndefined()
  })

  it('names the state of the rules, and says "0 rules" when there is none, paused or not', () => {
    expect([ruleStatus(2, false), ruleStatus(1, true), ruleStatus(0, true), ruleStatus(0, false)]).toEqual([
      '2 rules active',
      '1 rule paused',
      '0 rules',
      '0 rules',
    ])
  })
})

describe('openingTab', () => {
  it('opens a panel that has rules on the list, so you first see what is mocking your app', () => {
    expect(openingTab('', 2)).toBe('active')
  })

  it('opens a panel with no rules on the form, because an empty list has nothing to show', () => {
    expect(openingTab('', 0)).toBe('rule')
  })

  it('reopens the tab the user chose earlier this session, whatever the rules say', () => {
    expect(openingTab('rule', 2)).toBe('rule')
    expect(openingTab('requests', 0)).toBe('requests')
    expect(openingTab('active', 0)).toBe('active')
  })

  it('ignores a stored tab name this version no longer has', () => {
    expect(openingTab('rules', 2)).toBe('active')
    expect(openingTab('rules', 0)).toBe('rule')
  })
})

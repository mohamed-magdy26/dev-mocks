import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SHORTCUT,
  DEFAULT_SHRINK_SHORTCUT,
  DEFAULT_SPOT,
  EDGE,
  isDragStart,
  isSideEdge,
  matchesShortcut,
  nearestSpot,
  NEXT_EDGE,
  nudgeSpot,
  openingTab,
  TABS,
  parseShortcut,
  parseSpot,
  readSpot,
  ruleStatus,
  shrunkNotice,
  spotText,
  toShortcut,
  type Edge,
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

describe('where the tab sits', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sticks the tab to the edge the pointer was let go nearest, at the place along it', () => {
    // 60 px down a 800 px window beats 100 px in from the left of a 1200 px one, so the top edge wins.
    expect(nearestSpot(100, 60, 1200, 800)).toEqual({ edge: 'top', at: 100 / 1200 })
    expect(nearestSpot(60, 400, 1200, 800)).toEqual({ edge: 'left', at: 0.5 })
    expect(nearestSpot(1180, 200, 1200, 800)).toEqual({ edge: 'right', at: 0.25 })
    expect(nearestSpot(300, 780, 1200, 800)).toEqual({ edge: 'bottom', at: 0.25 })
    // Let go in the exact middle of a wide window, the way out is 400 px up or 400 px down, and up
    // is taken. A tie only happens on that one point, so which way it goes changes nothing in use.
    expect(nearestSpot(600, 400, 1200, 800)).toEqual({ edge: 'top', at: 0.5 })
  })

  it('keeps a spot let go outside the window inside it, so the tab never lands off screen', () => {
    // Let go above the top left corner, both the left edge and the top edge are 40 px away, and the
    // left edge is taken. Either answer puts the tab in that corner, so neither is wrong.
    expect(nearestSpot(-40, -40, 1200, 800)).toEqual({ edge: 'left', at: 0 })
    expect(nearestSpot(1400, 900, 1200, 800)).toEqual({ edge: 'right', at: 1 })
  })

  it('reads the saved spot, and falls back to the right edge for a missing or broken one', () => {
    const saved = new Map<string, string>([['dev-mocks:spot', 'left:0.250']])
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: vi.fn() })
    expect(readSpot()).toEqual({ edge: 'left', at: 0.25 })
    saved.set('dev-mocks:spot', 'constructor:0.5')
    expect(readSpot()).toEqual(DEFAULT_SPOT)
    saved.set('dev-mocks:spot', 'left:nowhere')
    expect(readSpot()).toEqual(DEFAULT_SPOT)
    saved.clear()
    expect(readSpot()).toEqual(DEFAULT_SPOT)
  })

  it('reads a corner saved by an older version as the same side of the screen', () => {
    const saved = new Map<string, string>([['dev-mocks:corner', 'bottom-left']])
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem })
    expect(readSpot()).toEqual({ edge: 'left', at: 0.88 })
    // Reading the old corner must not write anything: the choice moves across only when the
    // developer next moves the tab, so an older version of the panel still reads its own key.
    expect(setItem).not.toHaveBeenCalled()
    // A spot of its own wins: the old corner speaks only while this version has saved nothing yet.
    saved.set('dev-mocks:spot', 'top:0.400')
    expect(readSpot()).toEqual({ edge: 'top', at: 0.4 })
  })

  it('writes the spot as one line and reads the same spot back', () => {
    const spot = { edge: 'bottom' as const, at: 0.125 }
    expect(spotText(spot)).toBe('bottom:0.125')
    expect(parseSpot(spotText(spot))).toEqual(spot)
  })

  it('moves the tab along its own edge with the arrow keys, and stops at both ends', () => {
    expect(nudgeSpot({ edge: 'right', at: 0.5 }, 1)).toEqual({ edge: 'right', at: 0.55 })
    expect(nudgeSpot({ edge: 'right', at: 0.5 }, -1)).toEqual({ edge: 'right', at: 0.45 })
    expect(nudgeSpot({ edge: 'top', at: 0.02 }, -1)).toEqual({ edge: 'top', at: 0 })
    expect(nudgeSpot({ edge: 'top', at: 0.98 }, 1)).toEqual({ edge: 'top', at: 1 })
  })

  it('moves clockwise through all four edges and back', () => {
    const visited: Edge[] = [DEFAULT_SPOT.edge]
    for (let step = 0; step < 4; step++) visited.push(NEXT_EDGE[visited[step]])
    expect(visited).toEqual(['right', 'bottom', 'left', 'top', 'right'])
  })

  it('slides up and down on the left and right edges, and sideways on the top and bottom ones', () => {
    expect([isSideEdge('left'), isSideEdge('right'), isSideEdge('top'), isSideEdge('bottom')]).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it('starts a drag only after the pointer moves 6 px', () => {
    expect([isDragStart(5, 0), isDragStart(0, -6), isDragStart(4, 5)]).toEqual([false, true, true])
  })

  it('pins the tab and its shrunk bar to the same edge, and opens the panel 44 px in from it, or 20 px while shrunk', () => {
    for (const edge of Object.keys(EDGE) as Edge[]) {
      expect(EDGE[edge].tab).toContain('dm-spot-' + edge)
      expect(EDGE[edge].sliver).toContain('dm-spot-' + edge)
      expect(EDGE[edge].pop).toContain(edge + '-11')
      expect(EDGE[edge].popNear).toContain(edge + '-5')
    }
  })

  it('ignores a corner name that every object answers to, so a junk value cannot crash the tab', () => {
    const saved = new Map<string, string>([['dev-mocks:corner', 'toString']])
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: vi.fn() })
    expect(readSpot()).toEqual(DEFAULT_SPOT)
  })
})

describe('shrunkNotice', () => {
  const WAY =
    'The \u2699\ufe0f tab is shrunk to a bar on the screen edge. Click the bar to open the panel, or press Alt+Shift+H to bring the tab back.'

  it('gives one line whenever the tab is shrunk, and counts the rules whether they are active or paused', () => {
    expect(shrunkNotice({ shrunk: true, paused: false, live: 2, saved: 2 }, DEFAULT_SHRINK_SHORTCUT)).toBe(
      `[dev-mocks] 2 rules active. ${WAY}`,
    )
    expect(shrunkNotice({ shrunk: true, paused: false, live: 1, saved: 1 }, DEFAULT_SHRINK_SHORTCUT)).toBe(
      `[dev-mocks] 1 rule active. ${WAY}`,
    )
    expect(shrunkNotice({ shrunk: true, paused: true, live: 2, saved: 2 }, DEFAULT_SHRINK_SHORTCUT)).toBe(
      `[dev-mocks] 2 rules paused. ${WAY}`,
    )
    expect(shrunkNotice({ shrunk: true, paused: false, live: 0, saved: 0 }, DEFAULT_SHRINK_SHORTCUT)).toBe(`[dev-mocks] ${WAY}`)
    expect(shrunkNotice({ shrunk: true, paused: true, live: 0, saved: 0 }, DEFAULT_SHRINK_SHORTCUT)).toBe(`[dev-mocks] ${WAY}`)
    expect(shrunkNotice({ shrunk: false, paused: false, live: 2, saved: 2 }, DEFAULT_SHRINK_SHORTCUT)).toBeUndefined()
  })

  it('names the state of the rules, and says "0 rules" when there is none, paused or not', () => {
    expect([ruleStatus(2, 2, false), ruleStatus(1, 1, true), ruleStatus(0, 0, true), ruleStatus(0, 0, false)]).toEqual([
      '2 rules active',
      '1 rule paused',
      '0 rules',
      '0 rules',
    ])
  })

  it('names the live rules apart from the saved ones', () => {
    expect(ruleStatus(1, 2, false)).toBe('1 of 2 rules active')
    expect(ruleStatus(0, 2, false)).toBe('2 rules paused')
  })
})

describe('openingTab', () => {
  it('always opens on the list, so you first see what is mocking your app', () => {
    expect(openingTab('')).toBe('active')
  })

  it('opens on the list even when no rule exists, so the panel always starts in the same place', () => {
    expect(openingTab('')).toBe('active')
  })

  it('reopens the tab the user chose earlier this session', () => {
    expect(openingTab('rule')).toBe('rule')
    expect(openingTab('requests')).toBe('requests')
    expect(openingTab('active')).toBe('active')
  })

  it('ignores a stored tab name this version no longer has', () => {
    expect(openingTab('rules')).toBe('active')
  })
})

describe('TABS', () => {
  it('puts the active rules first, then the form, then the recorded requests', () => {
    expect(TABS).toEqual(['active', 'rule', 'requests'])
  })
})

import type { JsonBodyType } from 'msw'
import { notify } from './notify.js'

const STORAGE_KEY = 'dev-mocks:rules'
const PAUSED_KEY = 'dev-mocks:paused'
const PAUSED_FLAG = '1'

export type ErrorScenario = 'none' | '500' | '404' | '401' | '403' | 'network' | 'timeout' | 'slow' | 'custom'

/** One answer a rule can give: which failure, with what status, body and delay. */
export interface MockAnswer {
  scenario: ErrorScenario
  customStatusCode?: number
  customResponse?: JsonBodyType
  delayMs?: number
}

export interface MockConfig extends MockAnswer {
  endpoints: string[]
  /**
   * How many calls the rule's own answer covers. After them, `later` answers instead. Absent means
   * the rule answers the same way every time, which is what every rule saved before this field did.
   */
  firstCalls?: number
  later?: MockAnswer
  /**
   * The rule answers only when the request body carries this value. `field` is a dot path into the
   * JSON body, for example `coupon` or `user.role`, and `value` is compared as text.
   */
  bodyMatch?: { field: string; value: string }
  matchFullUrl?: boolean
  /** Scheme, host and port of the request this rule was made from, for example `https://eu.api.example.com`. */
  origin?: string
  matchOrigin?: boolean
  /**
   * The method of the request this rule was made from, upper case, for example `POST`. It is kept
   * even while `matchMethod` is off, so turning the switch back on does not need the request again.
   */
  method?: string
  /**
   * True when the rule answers `method` only. Absent means every method, which is what a rule saved
   * before this field existed means, so `GET /api/orders` and `POST /api/orders` can be two rules
   * that answer differently.
   */
  matchMethod?: boolean
  /**
   * True while the developer has this one rule paused. The rule stays saved and keeps its answer,
   * but no request matches it, so the real server answers instead. Absent means live, which is what
   * every rule saved before this field existed is. The "Mock rules" switch is the separate, global
   * pause: it stops every rule at once and does not touch this field.
   */
  paused?: boolean
}

/** Splits the panel's "Endpoints" text at commas. A comma inside a query (`?ids=1,2`) stays, unless a space, "/" or "http" follows it. */
export function splitEndpoints(text: string): string[] {
  const endpoints: string[] = []
  for (const piece of text.split(',')) {
    const previous = endpoints.at(-1)
    if (previous?.includes('?') && /^[^\s/]/.test(piece) && !/^https?:\/\//i.test(piece)) {
      endpoints[endpoints.length - 1] = `${previous},${piece}`
    } else {
      endpoints.push(piece)
    }
  }
  return endpoints.map((endpoint) => endpoint.trim()).filter(Boolean)
}

/**
 * Turns typed text into the path and query a request URL has: "/" added in front, percent-encoding applied, and any
 * "#fragment" dropped. A pasted full URL keeps only its path and query. Returns undefined for text that is not a URL.
 */
export function parseEndpoint(endpoint: string): { path: string; query: string } | undefined {
  const text = endpoint.trim()
  const input = /^https?:\/\//i.test(text) || text.startsWith('/') ? text : `/${text}`
  try {
    const url = new URL(input, 'http://placeholder.invalid')
    return { path: url.pathname, query: url.search }
  } catch {
    return undefined
  }
}

const dropTrailingSlash = (path: string) => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path)

/**
 * Compares whole path segments from the end of the path: `/Order/GetAll` matches `/v1/Order/GetAll` but not
 * `/v1/MyOrder/GetAll`. `/api/orders/*` matches `/api/orders` and every path under it, wherever it sits. A trailing
 * "/" on either side is ignored, and the rule "/" matches the root path only.
 */
function matchesPath(path: string, pattern: string): boolean {
  const target = dropTrailingSlash(path)
  if (pattern.endsWith('/*')) {
    const base = dropTrailingSlash(pattern.slice(0, -2))
    return base === '' || target.endsWith(base) || target.includes(`${base}/`)
  }
  const exact = dropTrailingSlash(pattern)
  return exact === '/' ? target === '/' : target.endsWith(exact)
}

/**
 * The origin a rule claims. A rule that pins no origin claims every origin, written here as `*`,
 * which is also what a rule saved before the origin field existed claims.
 */
function originKey(config: MockConfig): string {
  return config.matchOrigin && config.origin ? config.origin : '*'
}

/** The method a rule claims. A rule whose method switch is off claims every method, written here as `*`. */
function methodKey(config: MockConfig): string {
  return config.matchMethod && config.method ? config.method : '*'
}

/**
 * The body condition a rule claims. A rule with none answers every body, written here as `*`.
 * It belongs in the identity: without it, saving "coupon is USED" would delete "coupon is EXPIRED"
 * on the same path, which is the very case the body condition exists for.
 */
function bodyKey(config: MockConfig): string {
  return config.bodyMatch ? `${config.bodyMatch.field}=${config.bodyMatch.value}` : '*'
}

/**
 * The method, origin and body condition a rule claims, as one piece of text. A rule that pins none
 * of the three claims every method on every server for every body, written here as `* * *`.
 */
export function slotKey(config: MockConfig): string {
  return `${methodKey(config)} ${originKey(config)} ${bodyKey(config)}`
}

/** Identifies one rule, by the same four things that decide which rules can exist side by side. */
export const ruleKey = (rule: MockConfig) => `${slotKey(rule)} ${rule.endpoints.join(', ')}`

/**
 * True when two rules own the same path, for the same method, on the same origin, under the same
 * body condition, so only one of them can exist. Two rules that differ in any of the four never
 * share a slot, which is how `GET /api/orders` and `POST /api/orders` can be mocked differently, on
 * each server separately, and how one coupon can fail while another one does not.
 */
function sharesSlot(a: MockConfig, b: MockConfig): boolean {
  return slotKey(a) === slotKey(b) && a.endpoints.some((e) => b.endpoints.includes(e))
}

/**
 * True when the JSON body carries `value` at `field`. The dot path walks objects and arrays, so
 * `user.role` reaches inside the user object and `items.0.sku` reaches the first item. The value is
 * compared as text, so the number 7 matches the typed "7". A body that is not JSON never matches,
 * which is also what an empty body does.
 */
export function bodyHasValue(body: string, match: { field: string; value: string }): boolean {
  let found: unknown
  try {
    found = JSON.parse(body)
  } catch {
    return false
  }
  for (const step of match.field.split('.')) {
    if (typeof found !== 'object' || found === null) return false
    // Only what the body itself carries: without this, the path `constructor` would reach Object's own.
    if (!Object.hasOwn(found, step)) return false
    found = (found as Record<string, unknown>)[step]
  }
  // An object or a list has no single text to compare, and `String({})` would wrongly match "[object Object]".
  if (found === null || found === undefined || typeof found === 'object') return false
  return String(found) === match.value
}

/**
 * The parts of a path that carry a name: `/api/orders` is two, `/api/orders/*` is also two because
 * the `*` names nothing, and the root path `/` is none.
 */
function segmentCount(path: string): number {
  return path
    .replace(/\/\*$/, '')
    .split('/')
    .filter(Boolean).length
}

/**
 * How specific one rule is about one of its own paths, as six numbers that are compared one by one,
 * in this order, where the bigger number is the more specific rule:
 *
 * | Position | 1 means | 0 means |
 * |---|---|---|
 * | 1. how long the path is | the count of named parts, so `/api/v1/orders` is 3 and beats `/orders` | the `*` of a `/*` path is not one of them |
 * | 2. the path's shape | it names the path, `/api/orders` | it ends in `/*` and covers everything below |
 * | 3. the query | "Match the full URL" is on, so the query has to be the typed one | any query answers |
 * | 4. the body | the rule answers one field and value only | any body answers |
 * | 5. the method | the rule answers GET only, or POST only | any method answers |
 * | 6. the origin | the rule answers one server only | every server answers |
 *
 * Position 3 counts only for a path that does not end in `/*`, because the matcher below ignores the
 * query of a `/*` path, and a number that stands for a condition nobody applies would decide a
 * contest it takes no part in.
 */
function endpointRank(config: MockConfig, pattern: { path: string; query: string }): number[] {
  const coversEverythingBelow = pattern.path.endsWith('/*')
  return [
    segmentCount(pattern.path),
    coversEverythingBelow ? 0 : 1,
    config.matchFullUrl && !coversEverythingBelow ? 1 : 0,
    config.bodyMatch ? 1 : 0,
    config.matchMethod && config.method ? 1 : 0,
    config.matchOrigin && config.origin ? 1 : 0,
  ]
}

/** True when `a` is the more specific of the two. Two ranks that are equal all the way down give false. */
function isMoreSpecific(a: number[], b: number[]): boolean {
  for (let at = 0; at < a.length; at += 1) {
    if (a[at] !== b[at]) return a[at] > b[at]
  }
  return false
}

/** The most specific of a rule's own paths, which is the one the Active rules list orders it by. */
function bestRank(config: MockConfig): number[] {
  let best = [0, 0, 0, 0, 0, 0]
  for (const endpoint of config.endpoints) {
    const pattern = parseEndpoint(endpoint)
    if (!pattern) continue
    const rank = endpointRank(config, pattern)
    if (isMoreSpecific(rank, best)) best = rank
  }
  return best
}

/**
 * Orders two rules for the Active rules list, most specific first. It ranks a rule by its most
 * specific path, so a rule holding `/api/orders` and `/api/*` is placed by the first of the two.
 */
export function compareSpecificity(a: MockConfig, b: MockConfig): number {
  const [left, right] = [bestRank(a), bestRank(b)]
  if (isMoreSpecific(left, right)) return -1
  return isMoreSpecific(right, left) ? 1 : 0
}

/**
 * How specific the rule is about this very request, or undefined when it does not answer it at all.
 * Every test that can refuse the request lives here, so the matcher cannot accept a request on one
 * path and then rank it by another.
 */
function rankForRequest(config: MockConfig, url: URL, method: string, body?: string): number[] | undefined {
  // First, so a paused rule never shadows a live one.
  if (config.paused) return undefined
  // Do not remove the `config.origin` test: rules saved before this field existed have no origin,
  // and must keep matching every origin instead of matching nothing.
  if (config.matchOrigin && config.origin && url.origin !== config.origin) return undefined
  // Gated on the switch, like the origin above: a rule saved before these fields existed has
  // neither, so it keeps answering every method.
  if (config.matchMethod && config.method && method.toUpperCase() !== config.method) return undefined
  if (config.bodyMatch && body !== undefined && !bodyHasValue(body, config.bodyMatch)) return undefined
  let best: number[] | undefined
  for (const endpoint of config.endpoints) {
    const pattern = parseEndpoint(endpoint)
    if (!pattern || !matchesPath(url.pathname, pattern.path)) continue
    const coversEverythingBelow = pattern.path.endsWith('/*')
    if (config.matchFullUrl && !coversEverythingBelow && url.search !== pattern.query) continue
    const rank = endpointRank(config, pattern)
    if (!best || isMoreSpecific(rank, best)) best = rank
  }
  return best
}

/**
 * How many times each rule has answered since this page loaded, keyed by `ruleKey` so a count
 * belongs to the same rule the Requests tab labels its rows with. In memory on purpose, and never
 * stored: a reload starts every sequence again, so pressing F5 makes the next call a 1st call.
 */
const calls = new Map<string, number>()
const callListeners = new Set<() => void>()
/**
 * Counts the changes to the map above, never the calls themselves. `useSyncExternalStore` compares
 * what `getSnapshot` returns, and it must return the same value until something really changes, so
 * it cannot hand back the map, nor a copy of it built on every render.
 */
let callsVersion = 0

function callsChanged() {
  callsVersion += 1
  notify(callListeners, 'call count')
}

function countCall(key: string): number {
  const seen = (calls.get(key) ?? 0) + 1
  calls.set(key, seen)
  callsChanged()
  return seen
}

function forgetCalls() {
  if (calls.size === 0) return
  calls.clear()
  callsChanged()
}

/** How far each rule that answers in sequence has got, so the Active rules tab can show it. */
export const callCounts = {
  subscribe(listener: () => void) {
    callListeners.add(listener)
    return () => {
      callListeners.delete(listener)
    }
  },
  getSnapshot: () => callsVersion,
  /** Calls this rule has answered since the page loaded. */
  used: (rule: MockConfig) => calls.get(ruleKey(rule)) ?? 0,
}

/** Chrome, Firefox and Safari keep about 5 MB of localStorage per site, shared with the app's own data. */
export const STORAGE_LIMIT_MB = 5
export const MEGABYTE = 1_000_000

class ErrorMockController {
  private configs: MockConfig[] = []
  private paused = false

  /**
   * Another tab may have saved rules since this page loaded, so every change starts from the stored list.
   * `replacing` is the rule being edited; it goes in the same write as the new one.
   * Returns false when the browser refused to store the list.
   */
  addConfig(config: MockConfig, replacing?: MockConfig): boolean {
    this.loadFromLocalStorage()
    this.configs = this.configs
      .filter((c) => !(replacing && sharesSlot(c, replacing)))
      .map((c) =>
        slotKey(c) === slotKey(config)
          ? { ...c, endpoints: c.endpoints.filter((e) => !config.endpoints.includes(e)) }
          : c,
      )
      .filter((c) => c.endpoints.length > 0)
    this.configs.push(config)
    return this.saveToLocalStorage()
  }

  removeConfig(config: MockConfig): boolean {
    this.loadFromLocalStorage()
    this.configs = this.configs.filter((c) => !sharesSlot(c, config))
    return this.saveToLocalStorage()
  }

  /**
   * Counts this call against the rule and returns the answer for it. Call this once per request, and
   * only from the request handler. `getConfigForRequest` is called a second time to label the
   * Requests tab, so counting inside the matcher would count every request twice and the 1st call
   * would already get the later answer.
   */
  answerFor(config: MockConfig): MockAnswer {
    if (!config.firstCalls || !config.later) return config
    const seen = countCall(ruleKey(config))
    return seen <= config.firstCalls ? config : config.later
  }

  /** Also ends a pause: with no rules left, a saved pause would silently pause the next rule the user adds. */
  clearAll(): boolean {
    this.configs = []
    forgetCalls()
    const saved = this.saveToLocalStorage()
    if (saved && this.paused) this.setPaused(false)
    return saved
  }

  /**
   * When several rules match one request, the most specific of them answers it, as `endpointRank`
   * above lays out: a path that names more parts beats a shorter one, a path that names its last
   * part beats one ending in `/*`, and a rule that pins the query, the body, the method or the
   * origin beats one that does not. Rules that are equal all the way down are decided by the one added last, so saving a
   * rule still takes effect over an identical older one. While paused, no rule matches.
   *
   * `body` is the request body as text, and the request handler always passes it, even as `''` for a
   * request that has none. Leaving it out means "I do not have the body": the Requests tab's logger
   * calls it that way, so a row can still link to its rule, and `requestLog.finish` then corrects
   * the row's label from what MSW really did.
   */
  getConfigForRequest(request: Request, body?: string): MockConfig | undefined {
    if (this.paused) return undefined
    const url = new URL(request.url)
    let winner: MockConfig | undefined
    let winningRank: number[] | undefined
    for (const config of this.configs) {
      const rank = rankForRequest(config, url, request.method, body)
      if (rank === undefined) continue
      // The walk runs oldest to newest, and a rule only keeps its place by being strictly more
      // specific, so the newer of two rules that rank the same takes over from the older one.
      if (winningRank && isMoreSpecific(winningRank, rank)) continue
      winner = config
      winningRank = rank
    }
    return winner
  }

  /**
   * True when any saved rule looks at the request body. The request handler asks first, so a page
   * that uploads a large file does not have it read into a string for rules that ignore it.
   */
  wantsBody(): boolean {
    return this.configs.some((config) => config.bodyMatch && !config.paused)
  }

  getAllConfigs(): MockConfig[] {
    return [...this.configs]
  }

  /**
   * Pauses one rule, or starts it again, leaving it where it stands in the list. It is edited in
   * place on purpose: the list order still decides between two rules that are equally specific, and
   * going through `addConfig` would push the rule to the end and quietly change that order.
   * Returns false when the browser refused to store the list.
   */
  setRulePaused(rule: MockConfig, paused: boolean): boolean {
    this.loadFromLocalStorage()
    this.configs = this.configs.map((c) => {
      if (ruleKey(c) !== ruleKey(rule)) return c
      // Resuming deletes the field instead of writing `false`, so a resumed rule is stored exactly
      // like a rule that was never paused, and no dead field builds up in `dev-mocks:rules`.
      const { paused: _was, ...rest } = c
      return paused ? { ...rest, paused: true } : rest
    })
    return this.saveToLocalStorage()
  }

  /** Rules that can answer a request now. A rule the developer paused on its own row is not one. */
  liveCount(): number {
    return this.configs.filter((config) => !config.paused).length
  }

  isPaused(): boolean {
    return this.paused
  }

  /** Keeps every rule, but while paused every request goes to the real server. Returns false when the browser refused to store the flag. */
  setPaused(paused: boolean): boolean {
    try {
      localStorage.setItem(PAUSED_KEY, paused ? PAUSED_FLAG : '')
      this.paused = paused
      return true
    } catch (e) {
      console.warn('Failed to save the paused flag', e)
      return false
    }
  }

  private saveToLocalStorage(): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.configs))
      return true
    } catch (e) {
      console.warn('Failed to save mock configs', e)
      // With nothing stored yet, loading changes nothing, so the refused rule would stay in memory and still answer requests.
      this.configs = []
      this.loadFromLocalStorage()
      return false
    }
  }

  loadFromLocalStorage() {
    try {
      this.paused = localStorage.getItem(PAUSED_KEY) === PAUSED_FLAG
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed)) this.configs = parsed
      }
    } catch (e) {
      console.warn('Failed to load mock configs', e)
    }
  }
}

export const errorController = new ErrorMockController()

if (typeof globalThis.window !== 'undefined') {
  errorController.loadFromLocalStorage()
}

import type { JsonBodyType } from 'msw'

const STORAGE_KEY = 'dev-mocks:rules'

export type ErrorScenario = 'none' | '500' | '404' | '401' | '403' | 'network' | 'timeout' | 'slow' | 'custom'

export interface MockConfig {
  scenario: ErrorScenario
  endpoints: string[]
  customStatusCode?: number
  customResponse?: JsonBodyType
  delayMs?: number
  matchFullUrl?: boolean
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

/** Chrome, Firefox and Safari keep about 5 MB of localStorage per site, shared with the app's own data. */
export const STORAGE_LIMIT_MB = 5
export const MEGABYTE = 1_000_000

class ErrorMockController {
  private configs: MockConfig[] = []

  /**
   * Another tab may have saved rules since this page loaded, so every change starts from the stored list.
   * `replacing` lists the endpoints of the rule being edited; that rule goes in the same write as the new one.
   * Returns false when the browser refused to store the list.
   */
  addConfig(config: MockConfig, replacing: string[] = []): boolean {
    this.loadFromLocalStorage()
    this.configs = this.configs
      .filter((c) => !replacing.some((e) => c.endpoints.includes(e)))
      .map((c) => ({ ...c, endpoints: c.endpoints.filter((e) => !config.endpoints.includes(e)) }))
      .filter((c) => c.endpoints.length > 0)
    this.configs.push(config)
    return this.saveToLocalStorage()
  }

  removeConfig(endpoints: string[]): boolean {
    this.loadFromLocalStorage()
    this.configs = this.configs.filter((c) => !endpoints.some((e) => c.endpoints.includes(e)))
    return this.saveToLocalStorage()
  }

  clearAll(): boolean {
    this.configs = []
    return this.saveToLocalStorage()
  }

  /** When several rules match, the rule added last wins, so a rule the user just saved always takes effect. */
  getConfigForRequest(request: Request): MockConfig | undefined {
    const url = new URL(request.url)
    return [...this.configs].reverse().find((config) =>
      config.endpoints.some((endpoint) => {
        const rule = parseEndpoint(endpoint)
        if (!rule || !matchesPath(url.pathname, rule.path)) return false
        if (!config.matchFullUrl || rule.path.endsWith('/*')) return true
        return url.search === rule.query
      }),
    )
  }

  getAllConfigs(): MockConfig[] {
    return [...this.configs]
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

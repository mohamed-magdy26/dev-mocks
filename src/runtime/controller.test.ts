import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorController, splitEndpoints } from './controller.js'

const request = (url: string) => new Request(url)

describe('errorController.getConfigForRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(() => null) })
    errorController.clearAll()
    errorController.setPaused(false)
  })

  it('matches an exact path and ignores the query string', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu?page=2'))?.scenario).toBe('500')
  })

  it('matches every path under a /* wildcard', () => {
    errorController.addConfig({ scenario: '404', endpoints: ['/api/orders/*'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/orders/42/items'))?.scenario).toBe('404')
  })

  it('returns undefined when no rule matches', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/cart'))).toBeUndefined()
  })

  it('compares path plus query when matchFullUrl is true', () => {
    errorController.addConfig({ scenario: '401', endpoints: ['/api/menu?page=2'], matchFullUrl: true })
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu?page=2'))?.scenario).toBe('401')
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu?page=3'))).toBeUndefined()
  })

  it('matches the wildcard base itself but not a neighbouring path', () => {
    errorController.addConfig({ scenario: '404', endpoints: ['/api/orders/*'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/orders'))?.scenario).toBe('404')
    expect(errorController.getConfigForRequest(request('https://api.test/api/orders-archive'))).toBeUndefined()
  })

  const orders =
    'https://api.example.com/external/shop/api/v1.0/Order/GetAllOrders?Page=1&ItemsPerPage=10'

  it('matches the end of the path, with or without a leading slash', () => {
    errorController.addConfig({ scenario: 'slow', endpoints: ['shop/api/v1.0/Order/GetAllOrders'] })
    expect(errorController.getConfigForRequest(request(orders))?.scenario).toBe('slow')
    errorController.clearAll()
    errorController.addConfig({ scenario: 'slow', endpoints: ['/Order/GetAllOrders'] })
    expect(errorController.getConfigForRequest(request(orders))?.scenario).toBe('slow')
  })

  it('matches whole path segments only', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/GetAll', '/Order', 'Orders'] })
    expect(errorController.getConfigForRequest(request(orders))).toBeUndefined()
  })

  it('takes the path from a pasted full URL and ignores its query', () => {
    errorController.addConfig({ scenario: '404', endpoints: [orders] })
    expect(errorController.getConfigForRequest(request(orders.replace('Page=1', 'Page=2')))?.scenario).toBe('404')
  })

  it('matches a wildcard segment anywhere in the path', () => {
    errorController.addConfig({ scenario: '403', endpoints: ['/Order/*'] })
    expect(errorController.getConfigForRequest(request(orders))?.scenario).toBe('403')
    expect(errorController.getConfigForRequest(request('https://api.test/external/Orders/1'))).toBeUndefined()
  })

  it('compares the pasted query when matchFullUrl is true', () => {
    errorController.addConfig({ scenario: '401', endpoints: [orders], matchFullUrl: true })
    expect(errorController.getConfigForRequest(request(orders))?.scenario).toBe('401')
    expect(errorController.getConfigForRequest(request(orders.replace('Page=1', 'Page=2')))).toBeUndefined()
  })

  it('lets the rule added last win when two rules match', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/Users'] })
    errorController.addConfig({ scenario: '404', endpoints: ['/api/v1/Users'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/v1/Users'))?.scenario).toBe('404')
  })

  it('ignores a trailing slash on the rule and on the request', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/users/'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/users'))?.scenario).toBe('500')
    errorController.clearAll()
    errorController.addConfig({ scenario: '500', endpoints: ['/api/users'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/users/'))?.scenario).toBe('500')
  })

  it('matches the root path only for the rule "/"', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/'] })
    expect(errorController.getConfigForRequest(request('https://api.test/'))?.scenario).toBe('500')
    expect(errorController.getConfigForRequest(request('https://api.test/api/users/'))).toBeUndefined()
  })

  it('encodes the rule like the request URL and drops a #fragment', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/users/John Doe', '/api/menu#top'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/users/John%20Doe'))?.scenario).toBe('500')
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu'))?.scenario).toBe('500')
  })

  it('skips a rule that is not a valid URL instead of throwing', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['https://[bad/x'] })
    expect(errorController.getConfigForRequest(request('https://api.test/x'))).toBeUndefined()
  })

  it('keeps the other endpoints of an older rule when a new rule takes one of them', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu', '/api/cart'] })
    errorController.addConfig({ scenario: '404', endpoints: ['/api/cart'] })
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu'))?.scenario).toBe('500')
    expect(errorController.getConfigForRequest(request('https://api.test/api/cart'))?.scenario).toBe('404')
  })

  it('ignores a saved value that is not a list', () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(() => '{}') })
    errorController.loadFromLocalStorage()
    expect(errorController.getAllConfigs()).toEqual([])
  })

  it('keeps a rule another tab saved after this page loaded', () => {
    const saved = [{ scenario: '500', endpoints: ['/api/menu'] }]
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(() => JSON.stringify(saved)) })
    errorController.addConfig({ scenario: '404', endpoints: ['/api/cart'] })
    expect(errorController.getAllConfigs().map((c) => c.scenario)).toEqual(['500', '404'])
  })

  it('reports a refused save and keeps only the rules that are stored', () => {
    const saved = [{ scenario: '500', endpoints: ['/api/menu'] }]
    const full = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', { setItem: full, getItem: vi.fn(() => JSON.stringify(saved)) })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(errorController.addConfig({ scenario: 'custom', endpoints: ['/api/cart'], customStatusCode: 200 })).toBe(false)
    expect(errorController.getAllConfigs()).toEqual(saved)
    warn.mockRestore()
  })

  it('does not apply a refused rule when no rules were stored before', () => {
    const full = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', { setItem: full, getItem: vi.fn(() => null) })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(errorController.addConfig({ scenario: '500', endpoints: ['/api/cart'] })).toBe(false)
    expect(errorController.getAllConfigs()).toEqual([])
    expect(errorController.getConfigForRequest(new Request('https://api.test/api/cart'))).toBeUndefined()
    warn.mockRestore()
  })

  it('replaces the edited rule and adds the new one in a single save', () => {
    const setItem = vi.fn()
    const saved = [
      { scenario: '500', endpoints: ['/api/menu'] },
      { scenario: '401', endpoints: ['/api/user'] },
    ]
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(() => JSON.stringify(saved)) })
    expect(errorController.addConfig({ scenario: '404', endpoints: ['/api/cart'] }, ['/api/menu'])).toBe(true)
    expect(errorController.getAllConfigs().map((c) => c.scenario)).toEqual(['401', '404'])
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('matches no rule while paused, keeps the rules, and matches again after resume', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    expect(errorController.setPaused(true)).toBe(true)
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu'))).toBeUndefined()
    expect(errorController.getAllConfigs()).toHaveLength(1)
    errorController.setPaused(false)
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu'))?.scenario).toBe('500')
  })

  it('reads the paused flag another tab saved, and stores the new flag', () => {
    const setItem = vi.fn()
    const getItem = vi.fn((key: string) => (key === 'dev-mocks:paused' ? '1' : null))
    vi.stubGlobal('localStorage', { setItem, getItem })
    errorController.loadFromLocalStorage()
    expect(errorController.isPaused()).toBe(true)
    errorController.setPaused(false)
    expect(setItem).toHaveBeenCalledWith('dev-mocks:paused', '')
    expect(errorController.isPaused()).toBe(false)
  })

  it('reports a refused pause and keeps the rules working', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    const full = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', { setItem: full, getItem: vi.fn(() => null) })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(errorController.setPaused(true)).toBe(false)
    expect(errorController.isPaused()).toBe(false)
    expect(errorController.getConfigForRequest(request('https://api.test/api/menu'))?.scenario).toBe('500')
    warn.mockRestore()
  })

  it('ends the pause when every rule is removed', () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    errorController.setPaused(true)
    expect(errorController.clearAll()).toBe(true)
    expect(errorController.isPaused()).toBe(false)
  })
})

describe('splitEndpoints', () => {
  it('splits at commas between endpoints', () => {
    expect(splitEndpoints('/api/users, /api/posts/*')).toEqual(['/api/users', '/api/posts/*'])
    expect(splitEndpoints('/a,/b')).toEqual(['/a', '/b'])
    expect(splitEndpoints('Order/GetAll,Campaign/List')).toEqual(['Order/GetAll', 'Campaign/List'])
  })

  it('keeps a comma inside a pasted query', () => {
    expect(splitEndpoints('https://api.test/api/products?ids=1,2,3')).toEqual(['https://api.test/api/products?ids=1,2,3'])
    expect(splitEndpoints('/page?sort=createdAt,desc, /api/cart')).toEqual(['/page?sort=createdAt,desc', '/api/cart'])
    expect(splitEndpoints('/page?ids=1,https://api.test/x')).toEqual(['/page?ids=1', 'https://api.test/x'])
  })
})

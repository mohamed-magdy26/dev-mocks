import { getResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callCounts, errorController } from './controller.js'
import { handleRequest, handlers, takeDecision } from './handlers.js'

const request = (url: string) => new Request(url)

describe('handlers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(() => null) })
    errorController.clearAll()
    errorController.setPaused(false)
  })

  it('answers a matching request with the default 500 body', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(500)
    expect(await response?.json()).toEqual({ message: 'Internal Server Error', code: 'SERVER_ERROR' })
  })

  it('gives the first answer to the 1st call and the later answer to every call after it', async () => {
    errorController.addConfig({
      scenario: 'custom',
      endpoints: ['/api/orders'],
      customStatusCode: 200,
      customResponse: { ok: true },
      firstCalls: 1,
      later: { scenario: 'custom', customStatusCode: 500 },
    })
    const call = () => getResponse(handlers, request('https://api.test/api/orders'))
    const first = await call()
    expect(first?.status).toBe(200)
    expect(await first?.json()).toEqual({ ok: true })
    expect((await call())?.status).toBe(500)
    expect((await call())?.status).toBe(500)
  })

  it('lets the real server answer once the first calls are used up', async () => {
    errorController.addConfig({
      scenario: 'custom',
      endpoints: ['/api/orders'],
      customStatusCode: 500,
      firstCalls: 2,
      later: { scenario: 'none' },
    })
    const call = () => getResponse(handlers, request('https://api.test/api/orders'))
    expect((await call())?.status).toBe(500)
    expect((await call())?.status).toBe(500)
    expect(await call()).toBeUndefined()
  })

  it('tells the Active rules tab how many calls a rule has answered, and wakes it on each one', async () => {
    const rule = {
      scenario: 'custom' as const,
      endpoints: ['/api/orders'],
      customStatusCode: 200,
      firstCalls: 2,
      later: { scenario: 'custom' as const, customStatusCode: 500 },
    }
    errorController.addConfig(rule)
    const woken = vi.fn()
    const stop = callCounts.subscribe(woken)
    expect(callCounts.used(rule)).toBe(0)
    const call = () => getResponse(handlers, request('https://api.test/api/orders'))
    await call()
    await call()
    expect(callCounts.used(rule)).toBe(2)
    expect(woken).toHaveBeenCalledTimes(2)
    // Every call past the first ones still counts, so the row keeps saying the later answer is live.
    await call()
    expect(callCounts.used(rule)).toBe(3)
    errorController.clearAll()
    expect(callCounts.used(rule)).toBe(0)
    expect(woken).toHaveBeenCalledTimes(4)
    stop()
  })

  it('counts each method and each server on its own, so one sequence never spends another', async () => {
    const sequence = { firstCalls: 1, later: { scenario: 'custom' as const, customStatusCode: 500 } }
    errorController.addConfig({ scenario: 'custom', customStatusCode: 200, endpoints: ['/api/orders'], method: 'GET', matchMethod: true, ...sequence })
    errorController.addConfig({ scenario: 'custom', customStatusCode: 201, endpoints: ['/api/orders'], method: 'POST', matchMethod: true, ...sequence })
    const get = () => getResponse(handlers, request('https://api.test/api/orders'))
    const post = () => getResponse(handlers, new Request('https://api.test/api/orders', { method: 'POST' }))
    expect((await get())?.status).toBe(200)
    // The GET has spent its one first call. The POST must still have its own.
    expect((await post())?.status).toBe(201)
    expect((await get())?.status).toBe(500)
    expect((await post())?.status).toBe(500)
  })

  describe('what the handler reports back about a request', () => {
    it('reports "mocked" when a rule answered, and "delayed" when one only waited', async () => {
      errorController.addConfig({ scenario: '500', endpoints: ['/api/user'] })
      errorController.addConfig({ scenario: 'slow', endpoints: ['/api/menu'], delayMs: 1 })
      await handleRequest(request('https://api.test/api/user'), 'a')
      await handleRequest(request('https://api.test/api/menu'), 'b')
      expect(takeDecision('a')).toEqual({ tag: 'mocked', rule: '* * * /api/user' })
      expect(takeDecision('b')).toEqual({ tag: 'delayed', rule: '* * * /api/menu' })
    })

    it('names the rule that really answered, not the one saved last on the same path', async () => {
      const shared = { scenario: 'custom' as const, endpoints: ['/api/orders'], method: 'POST', matchMethod: true }
      errorController.addConfig({ ...shared, customStatusCode: 400, bodyMatch: { field: 'coupon', value: 'EXPIRED' } })
      errorController.addConfig({ ...shared, customStatusCode: 409, bodyMatch: { field: 'coupon', value: 'USED' } })
      const expired = new Request('https://api.test/api/orders', { method: 'POST', body: '{"coupon":"EXPIRED"}' })
      expect((await handleRequest(expired, 'e'))?.status).toBe(400)
      expect(takeDecision('e')?.rule).toBe('POST * coupon=EXPIRED /api/orders')
    })

    it('reports nothing when a body condition stopped the rule, so the row cannot claim a rule', async () => {
      errorController.addConfig({
        scenario: 'slow',
        endpoints: ['/api/orders'],
        delayMs: 1,
        bodyMatch: { field: 'coupon', value: 'EXPIRED' },
      })
      const other = new Request('https://api.test/api/orders', { method: 'POST', body: '{"coupon":"WELCOME"}' })
      expect(await handleRequest(other, 'c')).toBeUndefined()
      expect(takeDecision('c')).toBeUndefined()
    })

    it('forgets a decision once it is read, so the map does not grow for the life of the page', async () => {
      errorController.addConfig({ scenario: '500', endpoints: ['/api/user'] })
      await handleRequest(request('https://api.test/api/user'), 'd')
      expect(takeDecision('d')?.tag).toBe('mocked')
      expect(takeDecision('d')).toBeUndefined()
    })
  })

  it('answers the same way every time when the rule has no call count, which is every older rule', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/orders'] })
    for (let call = 0; call < 3; call++) {
      expect((await getResponse(handlers, request('https://api.test/api/orders')))?.status).toBe(500)
    }
  })

  describe('matching on the request body', () => {
    const order = (body: unknown) =>
      new Request('https://api.test/api/orders', { method: 'POST', body: JSON.stringify(body) })

    it('answers the body it was made for and lets every other body through', async () => {
      errorController.addConfig({
        scenario: 'custom',
        endpoints: ['/api/orders'],
        method: 'POST',
        customStatusCode: 400,
        bodyMatch: { field: 'coupon', value: 'EXPIRED' },
      })
      expect((await getResponse(handlers, order({ coupon: 'EXPIRED' })))?.status).toBe(400)
      expect(await getResponse(handlers, order({ coupon: 'SAVE10' }))).toBeUndefined()
    })

    it('reads a field inside another field, and compares a number as text', async () => {
      errorController.addConfig({
        scenario: '500',
        endpoints: ['/api/orders'],
        bodyMatch: { field: 'user.id', value: '7' },
      })
      expect((await getResponse(handlers, order({ user: { id: 7 } })))?.status).toBe(500)
      expect(await getResponse(handlers, order({ user: { id: 8 } }))).toBeUndefined()
    })

    it('never matches a request that carries no body, such as a GET', async () => {
      errorController.addConfig({
        scenario: '500',
        endpoints: ['/api/orders'],
        bodyMatch: { field: 'coupon', value: 'EXPIRED' },
      })
      expect(await getResponse(handlers, request('https://api.test/api/orders'))).toBeUndefined()
    })

    it('never matches a body that is not JSON', async () => {
      errorController.addConfig({
        scenario: '500',
        endpoints: ['/api/orders'],
        bodyMatch: { field: 'coupon', value: 'EXPIRED' },
      })
      const text = new Request('https://api.test/api/orders', { method: 'POST', body: 'coupon=EXPIRED' })
      expect(await getResponse(handlers, text)).toBeUndefined()
    })

    it('leaves the body unread, so a request that goes to the real server still carries it', async () => {
      errorController.addConfig({
        scenario: '500',
        endpoints: ['/api/orders'],
        bodyMatch: { field: 'coupon', value: 'EXPIRED' },
      })
      const sent = order({ coupon: 'SAVE10' })
      expect(await getResponse(handlers, sent)).toBeUndefined()
      expect(sent.bodyUsed).toBe(false)
      expect(await sent.text()).toBe('{"coupon":"SAVE10"}')
    })
  })

  it('returns undefined when no rule matches, so MSW sends the real request', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    expect(await getResponse(handlers, request('https://api.test/api/cart'))).toBeUndefined()
  })

  it('sends a slow request on to the real server when the rule has no custom body', async () => {
    errorController.addConfig({ scenario: 'slow', endpoints: ['/api/menu'], delayMs: 1 })
    expect(await getResponse(handlers, request('https://api.test/api/menu'))).toBeUndefined()
  })

  it('waits for delayMs on a rule typed without the leading slash and the gateway prefix', async () => {
    errorController.addConfig({
      scenario: 'slow',
      endpoints: ['shop/api/v1.0/Order/GetAllOrders'],
      delayMs: 50,
    })
    const started = Date.now()
    const response = await getResponse(
      handlers,
      request('https://api.example.com/external/shop/api/v1.0/Order/GetAllOrders?Page=1'),
    )
    expect(response).toBeUndefined()
    // Node timers can fire about 1 ms early, so the check allows 5 ms of slack.
    expect(Date.now() - started).toBeGreaterThanOrEqual(45)
  })

  it('sends the default body for the status code of a custom rule', async () => {
    errorController.addConfig({ scenario: 'custom', endpoints: ['/api/menu'], customStatusCode: 401 })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(401)
    expect(await response?.json()).toEqual({ message: 'Unauthorized', code: 'AUTH_ERROR' })
  })

  it('falls back to the generic body for a status code without a default', async () => {
    errorController.addConfig({ scenario: 'custom', endpoints: ['/api/menu'], customStatusCode: 422 })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(422)
    expect(await response?.json()).toEqual({ message: 'Custom response' })
  })

  it('answers status 204 with an empty body instead of throwing', async () => {
    errorController.addConfig({
      scenario: 'custom',
      endpoints: ['/api/menu'],
      customStatusCode: 204,
      customResponse: { ignored: true },
    })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(204)
    expect(await response?.text()).toBe('')
  })

  it('lets the app load its own scripts under a catch-all rule, but still mocks JSON files', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/*'] })
    expect(await getResponse(handlers, request('https://app.test/static/js/main.js'))).toBeUndefined()
    expect((await getResponse(handlers, request('https://app.test/config/app.json')))?.status).toBe(500)
  })

  it('answers a saved slow rule that has a body with status 200 and that body', async () => {
    errorController.addConfig({ scenario: 'slow', endpoints: ['/api/menu'], delayMs: 1, customResponse: { data: [] } })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ data: [] })
  })

  it('answers a custom rule with its own status and body', async () => {
    errorController.addConfig({
      scenario: 'custom',
      endpoints: ['/api/menu'],
      customStatusCode: 422,
      customResponse: { errors: [] },
    })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(422)
    expect(await response?.json()).toEqual({ errors: [] })
  })

  it('fails a network rule, hangs a timeout rule, and passes a disabled rule through', async () => {
    errorController.addConfig({ scenario: 'network', endpoints: ['/api/cart'] })
    errorController.addConfig({ scenario: 'timeout', endpoints: ['/api/user'] })
    errorController.addConfig({ scenario: 'none', endpoints: ['/api/off'], delayMs: 5000 })
    expect((await getResponse(handlers, request('https://api.test/api/cart')))?.type).toBe('error')
    const late = new Promise((resolve) => setTimeout(() => resolve('still waiting'), 50))
    expect(await Promise.race([getResponse(handlers, request('https://api.test/api/user')), late])).toBe('still waiting')
    expect(await getResponse(handlers, request('https://api.test/api/off'))).toBeUndefined()
  })

  it('sends the default body of the status that a saved 0.1.x rule overrides', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'], customStatusCode: 503 })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(503)
    expect(await response?.json()).toEqual({ message: 'Custom response' })
  })

  it('lets hot-reload updates through under a catch-all rule', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/*'] })
    expect(await getResponse(handlers, request('https://app.test/main.4f2a.hot-update.json'))).toBeUndefined()
  })

  it("lets Vite's dev-server ping through under a catch-all rule", async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/*'] })
    const ping = new Request('http://localhost:5173/', { mode: 'no-cors', headers: { Accept: 'text/x-vite-ping' } })
    expect(await getResponse(handlers, ping)).toBeUndefined()
    expect((await getResponse(handlers, request('http://localhost:5173/')))?.status).toBe(500)
  })

  it('sends every request to the real server while the rules are paused', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    errorController.setPaused(true)
    expect(await getResponse(handlers, request('https://api.test/api/menu'))).toBeUndefined()
  })
})

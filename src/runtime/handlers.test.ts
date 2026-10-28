import { getResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorController } from './controller.js'
import { handlers } from './handlers.js'

const request = (url: string) => new Request(url)

describe('handlers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(() => null) })
    errorController.clearAll()
  })

  it('answers a matching request with the default 500 body', async () => {
    errorController.addConfig({ scenario: '500', endpoints: ['/api/menu'] })
    const response = await getResponse(handlers, request('https://api.test/api/menu'))
    expect(response?.status).toBe(500)
    expect(await response?.json()).toEqual({ message: 'Internal Server Error', code: 'SERVER_ERROR' })
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
})

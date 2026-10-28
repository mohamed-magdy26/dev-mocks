import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorController, MEGABYTE } from './controller.js'
import { BODY_LIMIT_MB, requestLog } from './requests.js'

const jsonResponse = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { 'content-type': 'application/json', ...headers } })
// Exactly 1,000,000 bytes: 999,998 letters plus the two quotes.
const ONE_MB_JSON = JSON.stringify('x'.repeat(BODY_LIMIT_MB * MEGABYTE - 2))
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `r${from + i}`)

async function recordMegabytes(list: string[]) {
  for (const id of list) {
    requestLog.start(new Request(`https://api.test/api/${id}`), id)
    await requestLog.recordBody(id, jsonResponse(ONE_MB_JSON))
  }
}

/** A JSON response whose body arrives only when the test calls `finish`. */
function slowJsonResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c
    },
  })
  return {
    response: new Response(stream, { headers: { 'content-type': 'application/json' } }),
    finish(text: string) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  }
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('requestLog', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
    errorController.clearAll()
    requestLog.clear()
    requestLog.flush()
  })

  it('records a request as pending, then stores its status, newest first', () => {
    requestLog.start(new Request('https://api.test/api/menu'), 'a')
    requestLog.start(new Request('https://api.test/api/cart', { method: 'POST' }), 'b')
    requestLog.finish('a', new Response(null, { status: 404 }))
    const [cart, menu] = requestLog.getSnapshot()
    expect(cart).toMatchObject({ id: 'b', method: 'POST', status: 'pending' })
    expect(menu).toMatchObject({ id: 'a', method: 'GET', status: 404 })
    expect(menu.ms).toBeGreaterThanOrEqual(0)
  })

  it('marks a network error response as failed', () => {
    requestLog.start(new Request('https://api.test/api/menu'), 'a')
    requestLog.finish('a', Response.error())
    expect(requestLog.getSnapshot()[0].status).toBe('failed')
  })

  it('keeps the rule that matched and tags a delay-only rule as delayed', () => {
    errorController.addConfig({ scenario: 'slow', endpoints: ['/api/menu', '/api/cart'], delayMs: 2000 })
    errorController.addConfig({ scenario: 'custom', endpoints: ['/api/user'], customStatusCode: 500 })
    requestLog.start(new Request('https://api.test/api/cart'), 'a')
    requestLog.start(new Request('https://api.test/api/user'), 'b')
    requestLog.start(new Request('https://api.test/api/other'), 'c')
    const [other, user, cart] = requestLog.getSnapshot()
    expect(cart).toMatchObject({ rule: '/api/menu, /api/cart', tag: 'delayed' })
    expect(user).toMatchObject({ rule: '/api/user', tag: 'mocked' })
    expect(other.rule).toBeUndefined()
  })

  it('keeps only the newest 100 requests', () => {
    for (let i = 0; i < 105; i++) requestLog.start(new Request(`https://api.test/api/item/${i}`), String(i))
    const entries = requestLog.getSnapshot()
    expect(entries).toHaveLength(100)
    expect(entries[0].id).toBe('104')
  })

  it('reloads the saved list, drops broken entries, and marks the requests that never got an answer as unfinished', () => {
    const saved = [
      { id: 'b', method: 'GET', url: 'https://api.test/api/cart', status: 200, startedAt: 0 },
      { id: 'a', method: 'GET', url: 'https://api.test/api/menu', status: 'pending', startedAt: 0 },
      { id: 'c', method: 'GET', status: 200, startedAt: 0 },
    ]
    sessionStorage.setItem('dev-mocks:requests', JSON.stringify(saved))
    requestLog.load()
    expect(requestLog.getSnapshot().map((entry) => entry.status)).toEqual([200, 'unfinished'])
  })

  it('saves the list once after a burst of requests, or at once on flush', () => {
    requestLog.start(new Request('https://api.test/api/menu'), 'a')
    expect(sessionStorage.getItem('dev-mocks:requests')).toBe('[]')
    requestLog.flush()
    expect(JSON.parse(sessionStorage.getItem('dev-mocks:requests') ?? '[]')).toHaveLength(1)
  })

  it('gives no tag to a request that a disabled rule sends to the real server', () => {
    errorController.addConfig({ scenario: 'none', endpoints: ['/api/menu'] })
    requestLog.start(new Request('https://api.test/api/menu'), 'a')
    expect(requestLog.getSnapshot()[0].tag).toBeUndefined()
  })

  it('gives a new list on every change, and ignores a finish after clear', () => {
    const listener = vi.fn()
    const unsubscribe = requestLog.subscribe(listener)
    requestLog.start(new Request('https://api.test/api/menu'), 'a')
    const before = requestLog.getSnapshot()
    requestLog.finish('a', new Response(null, { status: 200 }))
    expect(requestLog.getSnapshot()).not.toBe(before)
    expect(before[0].status).toBe('pending')
    requestLog.clear()
    requestLog.finish('a', new Response(null, { status: 200 }))
    expect(requestLog.getSnapshot()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('keeps a JSON response body in memory, and never in sessionStorage', async () => {
    requestLog.start(new Request('https://api.test/api/menu'), 'a')
    await requestLog.recordBody('a', jsonResponse('{"secret":"x"}'))
    requestLog.flush()
    expect(requestLog.body('a')).toEqual({ json: '{"secret":"x"}' })
    expect(sessionStorage.getItem('dev-mocks:requests')).not.toContain('secret')
  })

  it('skips a body whose content type is not JSON, and keeps a JSON body without parsing it', async () => {
    requestLog.start(new Request('https://api.test/a'), 'html')
    requestLog.start(new Request('https://api.test/b'), 'stream')
    requestLog.start(new Request('https://api.test/c'), 'broken')
    await requestLog.recordBody('html', new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } }))
    await requestLog.recordBody('stream', new Response('{}\n', { headers: { 'content-type': 'application/x-ndjson' } }))
    await requestLog.recordBody('broken', jsonResponse('{'))
    expect([requestLog.body('html'), requestLog.body('stream'), requestLog.body('broken')]).toEqual([
      { missing: 'not-json' },
      { missing: 'not-json' },
      { json: '{' },
    ])
  })

  it('skips a body larger than 1 MB, by its header or by its text', async () => {
    requestLog.start(new Request('https://api.test/a'), 'header')
    requestLog.start(new Request('https://api.test/b'), 'text')
    await requestLog.recordBody('header', jsonResponse('{}', { 'content-length': String(BODY_LIMIT_MB * MEGABYTE + 1) }))
    await requestLog.recordBody('text', jsonResponse(JSON.stringify('x'.repeat(BODY_LIMIT_MB * MEGABYTE))))
    expect([requestLog.body('header'), requestLog.body('text')]).toEqual([{ missing: 'too-big' }, { missing: 'too-big' }])
  })

  it('marks a response without a body, or with only spaces, as empty', async () => {
    requestLog.start(new Request('https://api.test/a'), 'a')
    requestLog.start(new Request('https://api.test/b'), 'b')
    await requestLog.recordBody('a', new Response(null, { status: 204 }))
    await requestLog.recordBody('b', jsonResponse('  \n '))
    expect([requestLog.body('a'), requestLog.body('b')]).toEqual([{ missing: 'empty' }, { missing: 'empty' }])
  })

  it('reports a body it never recorded, and forgets every body on clear', async () => {
    await requestLog.recordBody('asset', jsonResponse('{}'))
    requestLog.start(new Request('https://api.test/a'), 'a')
    await requestLog.recordBody('a', jsonResponse('{}'))
    requestLog.clear()
    expect([requestLog.body('asset'), requestLog.body('a')]).toEqual([{ missing: 'not-recorded' }, { missing: 'not-recorded' }])
  })

  it('keeps a body of exactly 1 MB, and reads a content type in capital letters', async () => {
    requestLog.start(new Request('https://api.test/a'), 'a')
    await requestLog.recordBody('a', new Response(ONE_MB_JSON, { headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } }))
    expect(requestLog.body('a')).toEqual({ json: ONE_MB_JSON })
  })

  it('counts bytes, not characters, against the 1 MB limit', async () => {
    // "é" is 2 bytes in UTF-8, so 500,000 of them plus the quotes are 1,000,002 bytes but only 500,002 characters.
    requestLog.start(new Request('https://api.test/a'), 'a')
    await requestLog.recordBody('a', jsonResponse(JSON.stringify('é'.repeat((BODY_LIMIT_MB * MEGABYTE) / 2))))
    expect(requestLog.body('a')).toEqual({ missing: 'too-big' })
  })

  it('says the body is still being read until the read ends', async () => {
    const slow = slowJsonResponse()
    requestLog.start(new Request('https://api.test/a'), 'a')
    const reading = requestLog.recordBody('a', slow.response)
    expect(requestLog.body('a')).toEqual({ missing: 'reading' })
    slow.finish('{"ok":true}')
    await reading
    expect(requestLog.body('a')).toEqual({ json: '{"ok":true}' })
  })

  it('drops a body whose read ends after clear', async () => {
    const slow = slowJsonResponse()
    requestLog.start(new Request('https://api.test/a'), 'a')
    const reading = requestLog.recordBody('a', slow.response)
    requestLog.clear()
    slow.finish('{"late":true}')
    await reading
    expect(requestLog.body('a')).toEqual({ missing: 'not-recorded' })
  })

  it('forgets the body of a request pushed out of the newest 100, even while it is being read', async () => {
    requestLog.start(new Request('https://api.test/first'), 'first')
    await requestLog.recordBody('first', jsonResponse('{"a":1}'))
    const slow = slowJsonResponse()
    requestLog.start(new Request('https://api.test/second'), 'second')
    const reading = requestLog.recordBody('second', slow.response)
    for (let i = 0; i < 100; i++) requestLog.start(new Request(`https://api.test/item/${i}`), `item-${i}`)
    slow.finish('{"b":2}')
    await reading
    expect([requestLog.body('first'), requestLog.body('second')]).toEqual([{ missing: 'not-recorded' }, { missing: 'not-recorded' }])
  })

  it('drops the oldest body once all bodies pass 20 MB, and keeps the reasons of bodies it never kept', async () => {
    requestLog.start(new Request('https://api.test/page'), 'html')
    await requestLog.recordBody('html', new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } }))
    await recordMegabytes(ids(1, 21))
    expect(requestLog.body('html')).toEqual({ missing: 'not-json' })
    expect(requestLog.body('r1')).toEqual({ missing: 'evicted' })
    expect(requestLog.body('r2')).toEqual({ json: ONE_MB_JSON })
    expect(requestLog.body('r21')).toEqual({ json: ONE_MB_JSON })
  })

  it('starts the 20 MB count again after clear', async () => {
    await recordMegabytes(ids(1, 20))
    requestLog.clear()
    await recordMegabytes(ids(21, 40))
    expect(requestLog.body('r21')).toEqual({ json: ONE_MB_JSON })
  })

  it('stops the download itself once a body passes 1 MB', async () => {
    const cancel = vi.fn()
    let chunks = 0
    // Ends after 5 chunks, so a broken cap fails the test instead of reading forever.
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        if (chunks++ === 5) controller.close()
        else controller.enqueue(new Uint8Array(BODY_LIMIT_MB * MEGABYTE))
      },
      cancel,
    })
    requestLog.start(new Request('https://api.test/a'), 'a')
    await requestLog.recordBody('a', new Response(stream, { headers: { 'content-type': 'application/json' } }))
    expect(requestLog.body('a')).toEqual({ missing: 'too-big' })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('reports a body that was already read as not recorded', async () => {
    const response = jsonResponse('{}')
    await response.text()
    requestLog.start(new Request('https://api.test/a'), 'a')
    await requestLog.recordBody('a', response)
    expect(requestLog.body('a')).toEqual({ missing: 'not-recorded' })
  })
})

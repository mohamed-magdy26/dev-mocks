import { describe, expect, it, vi } from 'vitest'
import type { LoggedRequest } from '../requests.js'
import {
  applyPreset,
  changedFields,
  checkJson,
  COPIED_TEXT,
  describeRule,
  EMPTY_FORM,
  findProblem,
  formatMs,
  formToRule,
  isPresetActive,
  jsonFileProblem,
  lastToken,
  liftPastedOrigin,
  loadedJson,
  MISSING_BODY_TEXT,
  pathParts,
  PRESETS,
  refusedSaveText,
  requestToForm,
  ruleToForm,
  statusView,
  suggestions,
  type FormState,
} from './form.js'

const form = (overrides: Partial<FormState>): FormState => ({ ...EMPTY_FORM, path: '/api/menu', ...overrides })
const preset = (id: string) => PRESETS.find((p) => p.id === id)!

describe('formToRule', () => {
  it('saves a response as a custom rule with its status, body and delay', () => {
    expect(formToRule(form({ status: '422', json: '{"message":"Bad"}', delay: '1500' }))).toEqual({
      scenario: 'custom',
      endpoints: ['/api/menu'],
      matchFullUrl: false,
      customStatusCode: 422,
      customResponse: { message: 'Bad' },
      delayMs: 1500,
    })
  })

  it('saves Delay only with an empty delay as a 3 s slow rule without a body', () => {
    expect(formToRule(form({ kind: 'delay', json: '{"a":1}' }))).toEqual({
      scenario: 'slow',
      endpoints: ['/api/menu'],
      matchFullUrl: false,
      delayMs: 3000,
    })
  })

  it('drops the JSON for status 204, which cannot have a body', () => {
    expect(formToRule(form({ status: '204', json: '{"a":1}' })).customResponse).toBeUndefined()
  })

  it('ties the rule to the server whenever the form holds one, with no switch to turn it on', () => {
    const rule = formToRule({ ...EMPTY_FORM, path: '/v1/orders', origin: 'https://eu.api.test' })
    expect(rule.origin).toBe('https://eu.api.test')
    expect(rule.matchOrigin).toBe(true)
  })

  it('leaves both fields off a rule with no origin', () => {
    const rule = formToRule({ ...EMPTY_FORM, path: '/v1/orders' })
    expect(rule.origin).toBeUndefined()
    expect(rule.matchOrigin).toBeUndefined()
  })

  it('opens a saved origin back into the form', () => {
    const form = ruleToForm({ scenario: '500', endpoints: ['/v1/orders'], origin: 'https://eu.api.test', matchOrigin: true })
    expect(form.origin).toBe('https://eu.api.test')
  })

  it('leaves the origin out of the form when an older saved rule kept one with its switch off', () => {
    const form = ruleToForm({ scenario: '500', endpoints: ['/v1/orders'], origin: 'https://eu.api.test', matchOrigin: false })
    expect(form.origin).toBe('')
    expect(formToRule({ ...form, path: '/v1/orders' }).matchOrigin).toBeUndefined()
  })
})

describe('the method, the sequence and the body condition', () => {
  it('upper cases the method, and an empty one is the "Any" option that saves no method', () => {
    expect(formToRule(form({ method: 'post' })).method).toBe('POST')
    expect(formToRule(form({ method: 'post' })).matchMethod).toBe(true)
    expect(formToRule(form({ method: '' })).method).toBeUndefined()
    expect(formToRule(form({ method: '' })).matchMethod).toBeUndefined()
  })

  it('opens a saved method back into the select, and an older rule with its switch off as "Any"', () => {
    const saved = formToRule(form({ path: '/api/orders', method: 'POST' }))
    expect(ruleToForm(saved).method).toBe('POST')
    expect(ruleToForm({ ...saved, matchMethod: false }).method).toBe('')
  })

  it('keeps the method on a rule holding several paths, unlike the origin', () => {
    const rule = formToRule(form({ path: '/a, /b', method: 'POST', origin: 'https://api.test' }))
    expect(rule.method).toBe('POST')
    expect(rule.matchOrigin).toBeUndefined()
  })

  it('saves the call count and the later answer together, or neither', () => {
    const rule = formToRule(form({ sequenceOn: true, firstCalls: '2', laterKind: 'response', laterStatus: '500', laterJson: '' }))
    expect(rule.firstCalls).toBe(2)
    expect(rule.later).toEqual({ scenario: 'custom', customStatusCode: 500, customResponse: undefined })
    const plain = formToRule(form({ firstCalls: '' }))
    expect(plain.firstCalls).toBeUndefined()
    expect(plain.later).toBeUndefined()
  })

  it('refuses an empty count box while the switch is on, instead of silently saving no sequence', () => {
    const clearing = form({ sequenceOn: true, firstCalls: '' })
    expect(findProblem(clearing)?.text).toContain('or more')
    expect(formToRule(clearing).firstCalls).toBeUndefined()
  })

  it('saves a later step of "the real server" as the scenario that passes the request through', () => {
    expect(formToRule(form({ sequenceOn: true, firstCalls: '1', laterKind: 'real' })).later).toEqual({ scenario: 'none' })
  })

  it('saves the body condition only when both halves are filled in', () => {
    expect(formToRule(form({ bodyField: ' coupon ', bodyValue: 'EXPIRED' })).bodyMatch).toEqual({
      field: 'coupon',
      value: 'EXPIRED',
    })
    expect(formToRule(form({ bodyField: 'coupon', bodyValue: '  EXPIRED  ' })).bodyMatch?.value).toBe('EXPIRED')
    expect(formToRule(form({ bodyField: 'coupon', bodyValue: '   ' })).bodyMatch).toBeUndefined()
    expect(formToRule(form({ bodyField: 'coupon', bodyValue: '' })).bodyMatch).toBeUndefined()
    expect(formToRule(form({ bodyField: '', bodyValue: 'EXPIRED' })).bodyMatch).toBeUndefined()
  })

  it('opens a saved rule with all three back into the same form', () => {
    const saved = formToRule(
      form({
        path: '/api/orders',
        method: 'POST',
        sequenceOn: true,
        firstCalls: '3',
        laterKind: 'response',
        laterStatus: '503',
        laterJson: '{"down":true}',
        bodyField: 'user.role',
        bodyValue: 'admin',
      }),
    )
    const reopened = ruleToForm(saved)
    expect(reopened).toMatchObject({
      method: 'POST',
      sequenceOn: true,
      firstCalls: '3',
      laterKind: 'response',
      laterStatus: '503',
      bodyField: 'user.role',
      bodyValue: 'admin',
    })
    expect(formToRule(reopened)).toEqual(saved)
  })

  it('refuses a call count below 1, and a body field with no value', () => {
    expect(findProblem(form({ sequenceOn: true, firstCalls: '0' }))?.text).toContain('1 or more')
    expect(findProblem(form({ bodyField: 'coupon', bodyValue: '' }))?.text).toContain('value the body must carry')
    expect(findProblem(form({ bodyField: '', bodyValue: 'EXPIRED' }))?.text).toContain('body field to look in')
    expect(findProblem(form({ sequenceOn: true, firstCalls: '2', laterKind: 'response', laterStatus: '500', laterJson: '{' }))?.text).toContain(
      'JSON of the later calls',
    )
  })

  it('says in the rules list what changes after the first calls, and what the body must carry', () => {
    const rule = formToRule(form({ sequenceOn: true, firstCalls: '1', laterStatus: '500', bodyField: 'coupon', bodyValue: 'EXPIRED' }))
    expect(describeRule(rule).meta).toContain('body coupon = EXPIRED')
    expect(describeRule(rule).meta).toContain('first 1 call, then 500')
    expect(describeRule(formToRule(form({ sequenceOn: true, firstCalls: '2', laterKind: 'real' }))).meta).toContain(
      'first 2 calls, then the real server',
    )
  })

  it('names the method in the rules list, and says ANY when the rule answers them all', () => {
    expect(describeRule(formToRule(form({ method: 'POST' }))).method).toBe('POST')
    expect(describeRule(formToRule(form({}))).method).toBe('ANY')
    expect(describeRule(formToRule(form({ method: '' }))).method).toBe('ANY')
  })
})

describe('ruleToForm', () => {
  it('opens a saved slow rule that has a body as a 200 response with the same delay', () => {
    expect(ruleToForm({ scenario: 'slow', endpoints: ['/a', '/b'], delayMs: 2000, customResponse: { data: [] } })).toEqual({
      ...EMPTY_FORM,
      path: '/a, /b',
      kind: 'response',
      status: '200',
      json: '{\n  "data": []\n}',
      delay: '2000',
    })
  })

  it('opens a saved 404 rule as a response with status 404', () => {
    expect(ruleToForm({ scenario: '404', endpoints: ['/a'] })).toMatchObject({ kind: 'response', status: '404', json: '', delay: '' })
  })

  it('round-trips a network rule with a delay', () => {
    expect(ruleToForm(formToRule(form({ kind: 'network', delay: '500' })))).toEqual(form({ kind: 'network', delay: '500' }))
  })
})

describe('findProblem', () => {
  it('asks for a path first', () => {
    expect(findProblem(form({ path: ' , ' }))?.text).toBe('Type a request path, or pick one in the Requests tab.')
  })

  it('rejects a status code the Response constructor would refuse, and an empty one', () => {
    expect(findProblem(form({ status: '199' }))?.text).toBe('Fix the status code first.')
    expect(findProblem(form({ status: '' }))?.text).toBe('Type a status code, or pick a preset.')
  })

  it('checks the JSON only when the answer can have a body', () => {
    expect(findProblem(form({ status: '204', json: '{' }))).toBeUndefined()
    expect(findProblem(form({ kind: 'network', json: '{' }))).toBeUndefined()
    expect(findProblem(form({ json: '{' }))?.text).toBe('Fix the JSON first.')
  })
})

describe('presets', () => {
  it('fills the status and body, keeps the delay, and highlights only the matching card', () => {
    const next = applyPreset(form({ delay: '2000' }), preset('v422'))
    expect(next.delay).toBe('2000')
    expect(PRESETS.filter((p) => isPresetActive(next, p)).map((p) => p.id)).toEqual(['v422'])
  })

  it('starts on the 500 error card', () => {
    expect(PRESETS.filter((p) => isPresetActive(EMPTY_FORM, p)).map((p) => p.id)).toEqual(['e500'])
  })
})

describe('describeRule', () => {
  it('describes the delay-only rule from the original bug report', () => {
    expect(
      describeRule({
        scenario: 'slow',
        endpoints: ['shop/api/v1.0/Order/GetAllOrders'],
        delayMs: 9969,
        matchFullUrl: false,
      }),
    ).toEqual({ badge: 'Delay', tone: 'blue', meta: 'waits 9.97 s · real response', method: 'ANY' })
  })

  it('describes a 204 response that must match the query', () => {
    expect(describeRule({ scenario: 'custom', endpoints: ['/a?x=1'], customStatusCode: 204, matchFullUrl: true })).toEqual({
      badge: '204',
      tone: 'lime',
      meta: 'no body · no delay · query must match',
      method: 'ANY',
    })
  })
})

describe('helpers', () => {
  it('formats milliseconds', () => {
    expect([formatMs(450), formatMs(1000), formatMs(9969)]).toEqual(['450 ms', '1 s', '9.97 s'])
  })

  it('splits a path before its last two segments', () => {
    expect(pathParts('/external/shop/api/v1.0/Order/GetAllOrders')).toEqual({
      head: '/external/shop/api/v1.0/',
      tail: 'Order/GetAllOrders',
    })
    expect(pathParts('/menu')).toEqual({ head: '', tail: '/menu' })
  })

  it('lists the fields that changed', () => {
    expect(changedFields(EMPTY_FORM, { ...EMPTY_FORM, full: true, json: '{}' })).toEqual(['path', 'json'])
  })

  it('suggests each recorded path once and skips the path already typed', () => {
    const logged = (id: string, url: string) => ({ id, method: 'GET', url, status: 200, startedAt: 0 })
    const requests = [
      logged('1', 'https://api.test/api/menu?page=2'),
      logged('2', 'https://api.test/api/menu'),
      logged('3', 'https://api.test/api/cart'),
    ]
    expect(suggestions(requests, 'api').map((r) => r.id)).toEqual(['1', '3'])
    expect(suggestions(requests, '/api/menu')).toEqual([])
    expect(suggestions(requests, 'https://api.test')).toEqual([])
  })
})

describe('statusView', () => {
  const row = (overrides: Partial<LoggedRequest>): LoggedRequest => ({
    id: '1',
    method: 'GET',
    url: 'https://api.test/a',
    status: 200,
    startedAt: 0,
    ...overrides,
  })

  it('colours each request state, and keeps a delayed real error red', () => {
    expect(
      [
        row({ status: 'failed' }),
        row({ status: 'pending' }),
        row({ status: 'unfinished' }),
        row({ status: 500, tag: 'delayed' }),
        row({ status: 200, tag: 'delayed' }),
        row({ status: 200, tag: 'mocked' }),
        row({ status: 200 }),
        row({ status: 404 }),
      ].map(statusView),
    ).toEqual([
      { text: 'failed', tone: 'red' },
      { text: 'pending', tone: 'grey' },
      { text: 'no answer', tone: 'grey' },
      { text: '500', tone: 'red' },
      { text: '200', tone: 'blue' },
      { text: '200', tone: 'lime' },
      { text: '200', tone: 'grey' },
      { text: '404', tone: 'amber' },
    ])
  })
})

describe('path text', () => {
  it('keeps a query comma, a bare path and a full URL apart after save and reopen', () => {
    const rule = formToRule(form({ path: '/a?ids=1,2, b, https://x.test/c?y=1' }))
    expect(rule.endpoints).toEqual(['/a?ids=1,2', 'b', 'https://x.test/c?y=1'])
    expect(formToRule(ruleToForm(rule)).endpoints).toEqual(rule.endpoints)
  })

  it('flags a path that is not a URL', () => {
    expect(findProblem(form({ path: '/a, http://[' }))?.text).toBe('One of the paths is not a valid URL.')
  })

  it('treats a comma inside a query as part of the path being typed', () => {
    expect([lastToken('/orders?ids=1,2'), lastToken('/a, /b'), lastToken('/a, ')]).toEqual(['/orders?ids=1,2', '/b', ''])
  })
})

describe('requestToForm', () => {
  const logged = (status: LoggedRequest['status']): LoggedRequest => ({
    id: '1',
    method: 'GET',
    url: 'https://api.test/api/menu?page=2',
    status,
    startedAt: 0,
  })

  it('copies the real status and the formatted body', () => {
    expect(requestToForm(EMPTY_FORM, logged(201), { json: '{"id":7}' })).toEqual({
      form: { ...EMPTY_FORM, path: '/api/menu', origin: 'https://api.test', method: 'GET', status: '201', json: '{\n  "id": 7\n}' },
      note: COPIED_TEXT,
    })
  })

  it('fills only the path, and says why, when the body is missing or does not parse', () => {
    expect(requestToForm(EMPTY_FORM, logged(200), { missing: 'reading' })).toEqual({
      form: { ...EMPTY_FORM, path: '/api/menu', origin: 'https://api.test', method: 'GET' },
      note: MISSING_BODY_TEXT.reading,
    })
    expect(requestToForm(EMPTY_FORM, logged(200), { json: '{' }).note).toBe(MISSING_BODY_TEXT['not-json'])
  })

  it('fills only the path, with no note, for a request that never got an answer', () => {
    expect(requestToForm(EMPTY_FORM, logged('pending'), { missing: 'reading' })).toEqual({
      form: { ...EMPTY_FORM, path: '/api/menu', origin: 'https://api.test', method: 'GET' },
      note: '',
    })
  })
})

describe('JSON files and saving', () => {
  it('refuses a file that is not JSON, or that is too big to store', () => {
    expect(jsonFileProblem({ name: 'menu.json', size: 10, type: '' })).toBe('')
    expect(jsonFileProblem({ name: 'menu.txt', size: 10, type: 'text/plain' })).toBe('menu.txt is not a .json file.')
    expect(jsonFileProblem({ name: 'big.json', size: 6_200_000, type: 'application/json' })).toBe(
      "big.json is 6.2 MB. A rule must fit in the browser's 5 MB of storage.",
    )
  })

  it('formats a file that parses, and keeps the text of a file that does not', () => {
    expect(loadedJson('{"a":1}')).toEqual({ json: '{\n  "a": 1\n}', valid: true })
    expect(loadedJson('{"a":')).toEqual({ json: '{"a":', valid: false })
  })

  it('gives the size of a rule the browser refused to store', () => {
    expect(refusedSaveText({ scenario: 'custom', endpoints: ['/a'], customResponse: 'x'.repeat(1_500_000) })).toContain(
      'The rule is about 1.5 MB',
    )
    expect(refusedSaveText({ scenario: 'custom', endpoints: ['/a'] })).toContain('The rule is small, so the app')
  })

  it('uses the JSON check it is given, so the panel parses a body only once per change', () => {
    const parse = vi.spyOn(JSON, 'parse')
    const broken = form({ json: '{' })
    expect(findProblem(broken, checkJson(broken.json))?.text).toBe('Fix the JSON first.')
    expect(parse).toHaveBeenCalledTimes(1)
    parse.mockRestore()
  })
})

describe('liftPastedOrigin', () => {
  it('splits a pasted full URL into the origin line and the path field', () => {
    expect(liftPastedOrigin({ ...EMPTY_FORM, path: 'https://eu.api.test/v1/orders?page=2' })).toMatchObject({
      path: '/v1/orders?page=2',
      origin: 'https://eu.api.test',
    })
  })

  it('keeps the port, lowercases the host, and leaves the spelling of the path alone', () => {
    expect(liftPastedOrigin({ ...EMPTY_FORM, path: 'HTTP://LOCALHOST:5173/v1/Orders' })).toMatchObject({
      path: '/v1/Orders',
      origin: 'http://localhost:5173',
    })
  })

  it('drops a #fragment, which no request ever sends', () => {
    expect(liftPastedOrigin({ ...EMPTY_FORM, path: 'https://api.test/v1/orders#top' })?.path).toBe('/v1/orders')
  })

  it('leaves a plain path alone', () => {
    expect(liftPastedOrigin({ ...EMPTY_FORM, path: '/v1/orders' })).toBeUndefined()
  })

  it('leaves two paths alone, because one origin cannot speak for both', () => {
    expect(liftPastedOrigin({ ...EMPTY_FORM, path: '/v1/items, https://eu.api.test/v1/orders' })).toBeUndefined()
  })

  it('keeps the text when the paste is not a URL after all, so the save can report it', () => {
    expect(liftPastedOrigin({ ...EMPTY_FORM, path: 'http://' })).toBeUndefined()
  })

  it('does nothing on a second blur, after the origin has already been lifted', () => {
    const once = liftPastedOrigin({ ...EMPTY_FORM, path: 'https://eu.api.test/v1/orders' })
    expect(once).toBeDefined()
    expect(liftPastedOrigin(once!)).toBeUndefined()
  })
})

describe('an origin a rule cannot promise', () => {
  it('stops enforcing one origin once the rule holds a second path', () => {
    const rule = formToRule({
      ...EMPTY_FORM,
      kind: 'timeout',
      path: '/v1/orders, /v1/items',
      origin: 'https://eu.api.test',
    })
    expect(rule.matchOrigin).toBeUndefined()
  })

  it('keeps a rule saved before the origin field existed free of an origin after an edit', () => {
    const old = { scenario: '500' as const, endpoints: ['/v1/orders'], matchFullUrl: false }
    const again = formToRule({ ...ruleToForm(old), status: '503' })
    expect(JSON.stringify(again)).not.toContain('origin')
  })

  it('describes a rule whose stored origin is not a URL, instead of blanking the rules list', () => {
    expect(describeRule({ scenario: '500', endpoints: ['/v1/orders'], origin: 'eu.api.test', matchOrigin: true }).meta).toContain(
      'eu.api.test only',
    )
  })

  it('names the host of an origin-pinned rule, and keeps the port when there is one', () => {
    expect(describeRule({ scenario: '500', endpoints: ['/v1/orders'], origin: 'https://eu.api.test', matchOrigin: true }).meta).toContain(
      'eu.api.test only',
    )
    expect(describeRule({ scenario: '500', endpoints: ['/v1/orders'], origin: 'http://localhost:5173', matchOrigin: true }).meta).toContain(
      'localhost:5173 only',
    )
  })

  it('says nothing about an origin the rule does not enforce', () => {
    expect(describeRule({ scenario: '500', endpoints: ['/v1/orders'], origin: 'https://eu.api.test' }).meta).not.toContain('only')
  })
})

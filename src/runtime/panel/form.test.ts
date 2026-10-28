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
})

describe('ruleToForm', () => {
  it('opens a saved slow rule that has a body as a 200 response with the same delay', () => {
    expect(ruleToForm({ scenario: 'slow', endpoints: ['/a', '/b'], delayMs: 2000, customResponse: { data: [] } })).toEqual({
      path: '/a, /b',
      full: false,
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
    ).toEqual({ badge: 'Delay', tone: 'blue', meta: 'waits 9.97 s · real response' })
  })

  it('describes a 204 response that must match the query', () => {
    expect(describeRule({ scenario: 'custom', endpoints: ['/a?x=1'], customStatusCode: 204, matchFullUrl: true })).toEqual({
      badge: '204',
      tone: 'lime',
      meta: 'no body · no delay · query must match',
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
      form: { ...EMPTY_FORM, path: '/api/menu', status: '201', json: '{\n  "id": 7\n}' },
      note: COPIED_TEXT,
    })
  })

  it('fills only the path, and says why, when the body is missing or does not parse', () => {
    expect(requestToForm(EMPTY_FORM, logged(200), { missing: 'reading' })).toEqual({
      form: { ...EMPTY_FORM, path: '/api/menu' },
      note: MISSING_BODY_TEXT.reading,
    })
    expect(requestToForm(EMPTY_FORM, logged(200), { json: '{' }).note).toBe(MISSING_BODY_TEXT['not-json'])
  })

  it('fills only the path, with no note, for a request that never got an answer', () => {
    expect(requestToForm(EMPTY_FORM, logged('pending'), { missing: 'reading' })).toEqual({
      form: { ...EMPTY_FORM, path: '/api/menu' },
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

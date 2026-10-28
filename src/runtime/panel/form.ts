import type { JsonBodyType } from 'msw'
import { MEGABYTE, parseEndpoint, splitEndpoints, STORAGE_LIMIT_MB, type MockConfig } from '../controller.js'
import { defaultBody, NULL_BODY_STATUSES } from '../handlers.js'
import { BODIES_LIMIT_MB, BODY_LIMIT_MB, type LoggedRequest, type MissingBody, type RecordedBody } from '../requests.js'

export type Kind = 'response' | 'delay' | 'network' | 'timeout'
export type Tone = 'red' | 'amber' | 'blue' | 'grey' | 'lime'
export type FlashField = 'path' | 'kind' | 'delay' | 'status' | 'json'

export interface FormState {
  path: string
  full: boolean
  kind: Kind
  delay: string
  status: string
  json: string
}

export interface Preset {
  id: string
  label: string
  hint: string
  tone: Tone
  kind: Kind
  status?: string
  json?: string
}

export const pretty = (value: unknown) => JSON.stringify(value, null, 2)
const MB_DECIMALS = 1
export const formatMegabytes = (bytes: number) => (bytes / MEGABYTE).toFixed(MB_DECIMALS)
export const MS_PER_SECOND = 1000
const SECONDS_DECIMALS = 2
export const formatMs = (ms: number) =>
  ms < MS_PER_SECOND ? `${ms} ms` : `${Number((ms / MS_PER_SECOND).toFixed(SECONDS_DECIMALS))} s`
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const EXAMPLES = {
  error: { message: 'Something went wrong', code: 'ERROR' },
  validation: { message: 'Validation failed', errors: [{ field: 'name', message: 'Name is required' }] },
  success: { success: true, message: 'Done' },
  empty: { data: [], totalCount: 0 },
}
export type ExampleName = keyof typeof EXAMPLES
export const EXAMPLE_NAMES: ExampleName[] = ['error', 'validation', 'success', 'empty']
export const EXAMPLE_LABELS: Record<ExampleName, string> = {
  error: 'Error',
  validation: 'Validation',
  success: 'Success',
  empty: 'Empty list',
}

export const PRESETS: Preset[] = [
  { id: 'e500', label: '500 error', hint: '500 · default body', tone: 'red', kind: 'response', status: '500', json: '' },
  { id: 'u401', label: 'Unauthorized', hint: '401 · default body', tone: 'amber', kind: 'response', status: '401', json: '' },
  { id: 'n404', label: 'Not found', hint: '404 · default body', tone: 'amber', kind: 'response', status: '404', json: '' },
  {
    id: 'v422',
    label: 'Validation',
    hint: '422 · field errors',
    tone: 'amber',
    kind: 'response',
    status: '422',
    json: pretty(EXAMPLES.validation),
  },
  { id: 'empty', label: 'Empty list', hint: '200 · data: []', tone: 'lime', kind: 'response', status: '200', json: pretty(EXAMPLES.empty) },
  { id: 'delay', label: 'Delay only', hint: 'real response, late', tone: 'blue', kind: 'delay' },
  { id: 'network', label: 'Network down', hint: 'Failed to fetch', tone: 'red', kind: 'network' },
  { id: 'hang', label: 'Never answers', hint: 'request hangs', tone: 'grey', kind: 'timeout' },
]

export const STATUS_CHIPS = ['200', '400', '401', '403', '404', '422', '500', '503']
export const DELAY_CHIPS = ['1000', '3000', '5000', '10000']
export const DELAY_ONLY_DEFAULT = 3000
export const NO_DELAY = 0
export const DELAY_MAX_DIGITS = 6
export const STATUS_MIN = 200
export const STATUS_MAX = 599
const STATUS_FLOOR = { clientError: 400, serverError: 500 } as const
/** The status an old rule without a status code answers with. */
const FALLBACK_STATUS = 200
const MAX_SUGGESTIONS = 6
export const STATUS_DIGITS = String(STATUS_MAX).length
export const DEFAULT_BODY_LABEL = 'default body'

export const EMPTY_FORM: FormState = { path: '', full: false, kind: 'response', delay: '', status: '500', json: '' }

export function toneForStatus(code: number, mocked: boolean): Tone {
  if (code >= STATUS_FLOOR.serverError) return 'red'
  if (code >= STATUS_FLOOR.clientError) return 'amber'
  return mocked ? 'lime' : 'grey'
}

export const isNullBody = (status: string) => NULL_BODY_STATUSES.includes(Number(status))

export type JsonCheck = { state: 'empty' | 'ok' | 'bad'; message: string }

/** Parses the text. Callers keep the answer with `useMemo`, because a 1 MB body takes milliseconds to parse. */
export function checkJson(text: string): JsonCheck {
  if (!text.trim()) return { state: 'empty', message: '' }
  try {
    JSON.parse(text)
    return { state: 'ok', message: '' }
  } catch (error) {
    return { state: 'bad', message: error instanceof Error ? error.message : String(error) }
  }
}

export const COPIED_TEXT = 'The real response is in the form. Change what you need, then save.'
export const RULE_ANSWERED_TEXT = 'A rule answered this request, so that rule is open for editing.'
export const REFUSED_CHANGE_TEXT = 'Not changed: the browser refused to store the rules. Reload the page and try again.'
export const MISSING_BODY_TEXT: Record<MissingBody, string> = {
  reading: 'The response is still loading, so only the path is in the form. Pick the request again in a moment.',
  empty: 'This response had no body to copy, so only the path is in the form.',
  'not-json': 'This response was not JSON, so only the path is in the form.',
  'too-big': `This response was larger than ${BODY_LIMIT_MB} MB, so the panel did not keep it. Only the path is in the form.`,
  evicted: `The panel keeps only the newest ${BODIES_LIMIT_MB} MB of response bodies, and this one was older. Only the path is in the form.`,
  'not-recorded':
    'The panel has no body for this response. It keeps bodies only for responses since the last reload. Only the path is in the form.',
}

/** Fills the form from a request that no rule answered, with the real status and body when the panel kept them. */
export function requestToForm(form: FormState, request: LoggedRequest, body: RecordedBody): { form: FormState; note: string } {
  const withPath: FormState = { ...form, path: new URL(request.url).pathname, full: false }
  if (typeof request.status !== 'number') return { form: withPath, note: '' }
  if ('missing' in body) return { form: withPath, note: MISSING_BODY_TEXT[body.missing] }
  try {
    const json = pretty(JSON.parse(body.json))
    return { form: { ...withPath, kind: 'response', status: String(request.status), json }, note: COPIED_TEXT }
  } catch {
    return { form: withPath, note: MISSING_BODY_TEXT['not-json'] }
  }
}

/** A file larger than the browser's storage could never be saved as a rule, so it is refused before it is read. */
export function jsonFileProblem(file: Pick<File, 'name' | 'size' | 'type'>): string {
  if (!file.name.toLowerCase().endsWith('.json') && !file.type.includes('json')) return `${file.name} is not a .json file.`
  if (file.size > STORAGE_LIMIT_MB * MEGABYTE) {
    return `${file.name} is ${formatMegabytes(file.size)} MB. A rule must fit in the browser's ${STORAGE_LIMIT_MB} MB of storage.`
  }
  return ''
}

/** Formats a loaded file when it parses. Text that does not parse stays as it is, so the field shows the parse error. */
export function loadedJson(text: string): { json: string; valid: boolean } {
  try {
    return { json: pretty(JSON.parse(text)), valid: true }
  } catch {
    return { json: text, valid: false }
  }
}

export function refusedSaveText(rule: MockConfig): string {
  const megabytes = Number(formatMegabytes(JSON.stringify(rule).length))
  const cause =
    megabytes > 0
      ? `The rule is about ${megabytes} MB, and the browser keeps about ${STORAGE_LIMIT_MB} MB per site, shared with the app's own data. Make the JSON smaller, or remove rules you no longer need.`
      : `The rule is small, so the app's own data has already filled the browser's ${STORAGE_LIMIT_MB} MB for this site. Remove rules you no longer need, or clear the site's storage in the DevTools Application tab.`
  return `Not saved: the browser refused to store this rule. ${cause}`
}

/** The Response constructor throws a RangeError for a status outside 200 to 599. */
export function statusProblem(value: string): string {
  if (!value) return ''
  const code = Number(value)
  return code >= STATUS_MIN && code <= STATUS_MAX ? '' : `Use a status code from ${STATUS_MIN} to ${STATUS_MAX}.`
}

export function bodyLabel(form: FormState): string {
  if (form.json.trim()) return 'your JSON'
  return isNullBody(form.status) ? 'no body' : DEFAULT_BODY_LABEL
}

export function defaultBodyText(status: string): string {
  const code = Number(status)
  if (!code || statusProblem(status)) return 'Left empty, it sends the default body.'
  return `Left empty, it sends ${JSON.stringify(defaultBody(code))}.`
}

export function applyPreset(form: FormState, preset: Preset): FormState {
  if (preset.kind !== 'response') return { ...form, kind: preset.kind }
  return { ...form, kind: 'response', status: preset.status ?? form.status, json: preset.json ?? '' }
}

export function isPresetActive(form: FormState, preset: Preset): boolean {
  if (form.kind !== preset.kind) return false
  if (preset.kind !== 'response') return true
  return form.status === preset.status && form.json.trim() === (preset.json ?? '').trim()
}

export function findProblem(form: FormState, json = checkJson(form.json)): { text: string; warn: boolean } | undefined {
  const endpoints = splitEndpoints(form.path)
  if (endpoints.length === 0) return { text: 'Type a request path, or pick one in the Requests tab.', warn: false }
  if (endpoints.some((endpoint) => !parseEndpoint(endpoint))) return { text: 'One of the paths is not a valid URL.', warn: true }
  if (form.kind !== 'response') return undefined
  if (!form.status) return { text: 'Type a status code, or pick a preset.', warn: true }
  if (statusProblem(form.status)) return { text: 'Fix the status code first.', warn: true }
  if (!isNullBody(form.status) && json.state === 'bad') return { text: 'Fix the JSON first.', warn: true }
  return undefined
}

export function formToRule(form: FormState): MockConfig {
  const base = { endpoints: splitEndpoints(form.path), matchFullUrl: form.full }
  const delayMs = Number(form.delay) || undefined
  switch (form.kind) {
    case 'delay':
      return { ...base, scenario: 'slow', delayMs: delayMs ?? DELAY_ONLY_DEFAULT }
    case 'network':
      return { ...base, scenario: 'network', delayMs }
    case 'timeout':
      return { ...base, scenario: 'timeout' }
    case 'response': {
      const customResponse =
        isNullBody(form.status) || !form.json.trim() ? undefined : (JSON.parse(form.json) as JsonBodyType)
      return { ...base, scenario: 'custom', customStatusCode: Number(form.status), customResponse, delayMs }
    }
  }
}

/** Opens a saved rule in the form. Rules saved by 0.1.x ('500', 'slow' with a body, and so on) open as the matching card. */
export function ruleToForm(rule: MockConfig): FormState {
  const base: FormState = {
    ...EMPTY_FORM,
    path: rule.endpoints.join(', '),
    full: Boolean(rule.matchFullUrl),
    delay: rule.delayMs ? String(rule.delayMs) : '',
  }
  const json = rule.customResponse === undefined ? '' : pretty(rule.customResponse)
  switch (rule.scenario) {
    case 'network':
      return { ...base, kind: 'network' }
    case 'timeout':
      return { ...base, kind: 'timeout', delay: '' }
    case 'none':
      return { ...base, kind: 'delay' }
    case 'slow': {
      const delay = String(rule.delayMs || DELAY_ONLY_DEFAULT)
      if (rule.customResponse === undefined) return { ...base, kind: 'delay', delay }
      return { ...base, kind: 'response', status: String(FALLBACK_STATUS), json, delay }
    }
    case 'custom':
      return { ...base, kind: 'response', status: String(rule.customStatusCode || FALLBACK_STATUS), json }
    default:
      return { ...base, kind: 'response', status: String(rule.customStatusCode || Number(rule.scenario)), json }
  }
}

export function describeRule(rule: MockConfig): { badge: string; tone: Tone; meta: string } {
  if (rule.scenario === 'none') return { badge: 'Off', tone: 'grey', meta: 'does nothing' }
  const form = ruleToForm(rule)
  const delay = Number(form.delay)
  const query = rule.matchFullUrl ? ' · query must match' : ''
  switch (form.kind) {
    case 'delay':
      return { badge: 'Delay', tone: 'blue', meta: `waits ${formatMs(delay)} · real response${query}` }
    case 'network':
      return { badge: 'Network', tone: 'red', meta: `${delay ? `fails after ${formatMs(delay)}` : 'fails at once'}${query}` }
    case 'timeout':
      return { badge: 'Hang', tone: 'grey', meta: `never answers${query}` }
    case 'response':
      return {
        badge: form.status,
        tone: toneForStatus(Number(form.status), true),
        meta: `${bodyLabel(form)} · ${delay ? `waits ${formatMs(delay)}` : 'no delay'}${query}`,
      }
  }
}

export function changedFields(before: FormState, after: FormState): FlashField[] {
  const fields: FlashField[] = []
  if (before.path !== after.path || before.full !== after.full) fields.push('path')
  if (before.kind !== after.kind) fields.push('kind')
  if (before.delay !== after.delay) fields.push('delay')
  if (before.status !== after.status) fields.push('status')
  if (before.json !== after.json) fields.push('json')
  return fields
}

/** Splits a path before its last two segments, so a long path can fade its start and keep its end readable. */
export function pathParts(text: string): { head: string; tail: string } {
  const cut = text.lastIndexOf('/', text.lastIndexOf('/') - 1)
  return cut <= 0 ? { head: '', tail: text } : { head: text.slice(0, cut + 1), tail: text.slice(cut + 1) }
}

export function lastToken(text: string): string {
  if (/,\s*$/.test(text)) return ''
  return splitEndpoints(text).at(-1) ?? ''
}

/** Up to MAX_SUGGESTIONS recorded requests whose path contains the typed text, each path once. A pasted full URL gets none. */
export function suggestions(requests: LoggedRequest[], token: string): LoggedRequest[] {
  if (/^https?:/i.test(token)) return []
  const needle = token.toLowerCase()
  const seen = new Set<string>()
  const result: LoggedRequest[] = []
  for (const request of requests) {
    const path = new URL(request.url).pathname
    if (seen.has(path)) continue
    seen.add(path)
    if (path !== token && path.toLowerCase().includes(needle)) result.push(request)
    if (result.length === MAX_SUGGESTIONS) break
  }
  return result
}

export function statusView(request: LoggedRequest): { text: string; tone: Tone } {
  if (request.status === 'failed') return { text: 'failed', tone: 'red' }
  if (request.status === 'pending') return { text: 'pending', tone: 'grey' }
  if (request.status === 'unfinished') return { text: 'no answer', tone: 'grey' }
  if (request.tag === 'delayed' && request.status < STATUS_FLOOR.clientError) return { text: String(request.status), tone: 'blue' }
  return { text: String(request.status), tone: toneForStatus(request.status, request.tag === 'mocked') }
}

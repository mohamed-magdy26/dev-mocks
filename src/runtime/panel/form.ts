import type { JsonBodyType } from 'msw'
import { MEGABYTE, parseEndpoint, splitEndpoints, STORAGE_LIMIT_MB, type MockAnswer, type MockConfig } from '../controller.js'
import { defaultBody, NULL_BODY_STATUSES } from '../handlers.js'
import { BODIES_LIMIT_MB, BODY_LIMIT_MB, type LoggedRequest, type MissingBody, type RecordedBody } from '../requests.js'

export type Kind = 'response' | 'delay' | 'network' | 'timeout'
/** What the calls after the first ones get: a status with a body, or the real server's own answer. */
export type LaterKind = 'response' | 'real'
export type Tone = 'red' | 'amber' | 'blue' | 'grey' | 'lime'
export type FlashField = 'path' | 'kind' | 'delay' | 'status' | 'json' | 'sequence' | 'body'

export interface FormState {
  path: string
  full: boolean
  /** The server the rule is tied to, for example `https://api.shop.com`. Empty means every server. */
  origin: string
  /** The one method the rule answers, upper case. Empty means every method, shown in the select as "Any". */
  method: string
  kind: Kind
  delay: string
  status: string
  json: string
  /**
   * True while the rule answers differently after its first calls. Its own field, not `firstCalls !== ''`:
   * otherwise one Backspace on the count box would unmount the box the user is typing in.
   */
  sequenceOn: boolean
  /** How many calls the answer above covers. Empty while the user is retyping it, which `findProblem` refuses. */
  firstCalls: string
  laterKind: LaterKind
  laterStatus: string
  laterJson: string
  /** A dot path into the request body, for example `coupon`. Empty means the body is not looked at. */
  bodyField: string
  bodyValue: string
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

export const EMPTY_FORM: FormState = {
  path: '',
  full: false,
  origin: '',
  method: '',
  kind: 'response',
  delay: '',
  status: '500',
  json: '',
  sequenceOn: false,
  firstCalls: '',
  laterKind: 'response',
  laterStatus: '500',
  laterJson: '',
  bodyField: '',
  bodyValue: '',
}

/** The methods the select offers beside the path. Empty, shown as "Any", answers all of them. */
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export const FIRST_CALLS_CHIPS = ['1', '2', '3']
export const FIRST_CALLS_MAX_DIGITS = 3
export const MIN_FIRST_CALLS = 1

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
  const picked = new URL(request.url)
  const withPath: FormState = {
    ...form,
    path: picked.pathname,
    full: false,
    origin: picked.origin,
    method: request.method.toUpperCase(),
  }
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

/** What is wrong with the two-step answer, or undefined when the rule answers the same way every time. */
function sequenceProblem(form: FormState): { text: string; warn: boolean } | undefined {
  if (!form.sequenceOn) return undefined
  if (Number(form.firstCalls) < MIN_FIRST_CALLS) {
    return { text: `The first calls must be ${MIN_FIRST_CALLS} or more, or turn the switch off.`, warn: true }
  }
  if (form.laterKind !== 'response') return undefined
  if (statusProblem(form.laterStatus)) return { text: 'Fix the status code of the later calls first.', warn: true }
  if (!isNullBody(form.laterStatus) && checkJson(form.laterJson).state === 'bad') {
    return { text: 'Fix the JSON of the later calls first.', warn: true }
  }
  return undefined
}

export function findProblem(form: FormState, json = checkJson(form.json)): { text: string; warn: boolean } | undefined {
  const endpoints = splitEndpoints(form.path)
  if (endpoints.length === 0) return { text: 'Type a request path, or pick one in the Requests tab.', warn: false }
  if (endpoints.some((endpoint) => !parseEndpoint(endpoint))) return { text: 'One of the paths is not a valid URL.', warn: true }
  // Checked before the response fields, because a sequence can sit on a delay, network or hang rule too.
  const sequence = sequenceProblem(form)
  if (sequence) return sequence
  if (form.bodyField.trim() && !form.bodyValue.trim()) return { text: 'Type the value the body must carry.', warn: true }
  if (!form.bodyField.trim() && form.bodyValue.trim()) return { text: 'Type the body field to look in.', warn: true }
  if (form.kind !== 'response') return undefined
  if (!form.status) return { text: 'Type a status code, or pick a preset.', warn: true }
  if (statusProblem(form.status)) return { text: 'Fix the status code first.', warn: true }
  if (!isNullBody(form.status) && json.state === 'bad') return { text: 'Fix the JSON first.', warn: true }
  return undefined
}

/** The answer the calls after the first ones get. `scenario: 'none'` lets the request through to the real server. */
function laterAnswer(form: FormState): MockAnswer {
  if (form.laterKind === 'real') return { scenario: 'none' }
  const customResponse =
    isNullBody(form.laterStatus) || !form.laterJson.trim() ? undefined : (JSON.parse(form.laterJson) as JsonBodyType)
  return { scenario: 'custom', customStatusCode: Number(form.laterStatus), customResponse }
}

export function formToRule(form: FormState): MockConfig {
  const endpoints = splitEndpoints(form.path)
  const firstCalls = Number(form.firstCalls)
  // Both fields go in together, so a rule can never hold a count with no answer to change to.
  const sequence = form.sequenceOn && firstCalls >= MIN_FIRST_CALLS ? { firstCalls, later: laterAnswer(form) } : {}
  // One origin can only speak for one path, so a rule holding several paths stops enforcing it.
  const pinned = Boolean(form.origin) && endpoints.length === 1
  const base = {
    endpoints,
    matchFullUrl: form.full,
    // Written together, and only when the origin applies. `matchOrigin` is no longer a choice the
    // user makes, but it stays in the saved rule so rules saved by older versions still read the same.
    origin: pinned ? form.origin : undefined,
    matchOrigin: pinned ? true : undefined,
    // An empty method is the "Any" option in the select, which saves no method at all.
    method: form.method ? form.method.toUpperCase() : undefined,
    matchMethod: form.method ? true : undefined,
    // Both halves go in together, so a rule can never hold a field with no value to compare it to.
    // Both are trimmed, so a trailing space typed in either box cannot stop the rule ever matching.
    bodyMatch:
      form.bodyField.trim() && form.bodyValue.trim()
        ? { field: form.bodyField.trim(), value: form.bodyValue.trim() }
        : undefined,
    ...sequence,
  }
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
    // Read through the saved switch, not around it. A rule saved by an older version could hold an
    // origin with its switch off, and loading that origin into the form would start enforcing it.
    origin: rule.matchOrigin ? (rule.origin ?? '') : '',
    method: rule.matchMethod ? (rule.method ?? '') : '',
    delay: rule.delayMs ? String(rule.delayMs) : '',
    sequenceOn: Boolean(rule.firstCalls && rule.later),
    firstCalls: rule.firstCalls ? String(rule.firstCalls) : '',
    laterKind: rule.later?.scenario === 'none' ? 'real' : 'response',
    laterStatus: String(rule.later?.customStatusCode || EMPTY_FORM.laterStatus),
    laterJson: rule.later?.customResponse === undefined ? '' : pretty(rule.later.customResponse),
    bodyField: rule.bodyMatch?.field ?? '',
    bodyValue: rule.bodyMatch?.value ?? '',
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

/**
 * The host and port of a stored origin, or the raw text when it is not a URL. The rules list renders
 * with no error boundary around it, so a hand-edited localStorage entry must not blank the whole list.
 */
function originLabel(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/**
 * Moves the origin of a pasted full URL out of the path text and onto the origin line.
 * Returns undefined when there is nothing to lift, so the field keeps what the user typed.
 */
export function liftPastedOrigin(form: FormState): FormState | undefined {
  const endpoints = splitEndpoints(form.path)
  if (endpoints.length !== 1 || !/^https?:\/\//i.test(endpoints[0])) return undefined
  try {
    const url = new URL(endpoints[0])
    return { ...form, path: `${url.pathname}${url.search}`, origin: url.origin }
  } catch {
    // Not a URL after all, so the caller keeps the text and findProblem() reports it on save.
    return undefined
  }
}

/** What the rule answers once its first calls are used up: a status code, or the real server. */
function laterLabel(later: MockAnswer): string {
  return later.scenario === 'none' ? 'the real server' : String(later.customStatusCode || FALLBACK_STATUS)
}

/** Says what changes after the first calls, or nothing at all when the rule never changes. */
function sequenceLabel(rule: MockConfig): string {
  if (!rule.firstCalls || !rule.later) return ''
  return ` · first ${plural(rule.firstCalls, 'call')}, then ${laterLabel(rule.later)}`
}

/**
 * How far a rule that answers in sequence has got, for the row in the Active rules tab. `used` is
 * how many calls it has answered since the page loaded. `switched` is true once the first calls are
 * spent and the later answer is the one being given, which the row shows in amber. A rule that
 * answers the same way every time has no progress to show, and gets undefined.
 */
export function sequenceProgress(rule: MockConfig, used: number): { text: string; switched: boolean } | undefined {
  if (!rule.firstCalls || !rule.later) return undefined
  if (used < rule.firstCalls) return { text: `${used} of ${plural(rule.firstCalls, 'call')} used`, switched: false }
  return { text: `${rule.firstCalls} of ${rule.firstCalls} used · answering ${laterLabel(rule.later)} now`, switched: true }
}

export interface RuleView {
  badge: string
  tone: Tone
  meta: string
  /** The method the rule answers, or 'ANY' when it answers them all. */
  method: string
}

export function describeRule(rule: MockConfig): RuleView {
  const method = rule.matchMethod && rule.method ? rule.method : 'ANY'
  if (rule.scenario === 'none') return { badge: 'Off', tone: 'grey', meta: 'does nothing', method }
  const form = ruleToForm(rule)
  const delay = Number(form.delay)
  const origin = rule.matchOrigin && rule.origin ? ` · ${originLabel(rule.origin)} only` : ''
  const body = rule.bodyMatch ? ` · body ${rule.bodyMatch.field} = ${rule.bodyMatch.value}` : ''
  const query = `${origin}${rule.matchFullUrl ? ' · query must match' : ''}${body}${sequenceLabel(rule)}`
  switch (form.kind) {
    case 'delay':
      return { badge: 'Delay', tone: 'blue', meta: `waits ${formatMs(delay)} · real response${query}`, method }
    case 'network':
      return { badge: 'Network', tone: 'red', meta: `${delay ? `fails after ${formatMs(delay)}` : 'fails at once'}${query}`, method }
    case 'timeout':
      return { badge: 'Hang', tone: 'grey', meta: `never answers${query}`, method }
    case 'response':
      return {
        badge: form.status,
        tone: toneForStatus(Number(form.status), true),
        meta: `${bodyLabel(form)} · ${delay ? `waits ${formatMs(delay)}` : 'no delay'}${query}`,
        method,
      }
  }
}

export function changedFields(before: FormState, after: FormState): FlashField[] {
  const fields: FlashField[] = []
  if (
    before.path !== after.path ||
    before.full !== after.full ||
    before.origin !== after.origin ||
    before.method !== after.method
  ) {
    fields.push('path')
  }
  if (before.kind !== after.kind) fields.push('kind')
  if (before.delay !== after.delay) fields.push('delay')
  if (before.status !== after.status) fields.push('status')
  if (before.json !== after.json) fields.push('json')
  if (before.bodyField !== after.bodyField || before.bodyValue !== after.bodyValue) fields.push('body')
  if (
    before.sequenceOn !== after.sequenceOn ||
    before.firstCalls !== after.firstCalls ||
    before.laterKind !== after.laterKind ||
    before.laterStatus !== after.laterStatus ||
    before.laterJson !== after.laterJson
  ) {
    fields.push('sequence')
  }
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

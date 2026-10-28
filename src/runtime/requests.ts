import { errorController, MEGABYTE, type MockConfig } from './controller.js'
import { NULL_BODY_STATUSES } from './handlers.js'

const STORAGE_KEY = 'dev-mocks:requests'
const LIMIT = 100
export const BODY_LIMIT_MB = 1
const BODY_LIMIT = BODY_LIMIT_MB * MEGABYTE
// 100 bodies of 1 MB would keep 100 MB in the app's tab, so past 20 MB the oldest bodies are dropped first.
export const BODIES_LIMIT_MB = 20
const BODIES_LIMIT = BODIES_LIMIT_MB * MEGABYTE
// Matches application/json and application/problem+json, but not application/x-ndjson, a stream that may never end.
const JSON_TYPE = /\bjson\b/i

export type RequestStatus = number | 'pending' | 'failed' | 'unfinished'
export type RequestTag = 'mocked' | 'delayed'
export type MissingBody = 'reading' | 'empty' | 'not-json' | 'too-big' | 'evicted' | 'not-recorded'
export type RecordedBody = { json: string } | { missing: MissingBody }

export interface LoggedRequest {
  id: string
  method: string
  url: string
  status: RequestStatus
  startedAt: number
  ms?: number
  /** The endpoints of the rule that matched, joined with ", ". */
  rule?: string
  tag?: RequestTag
}

export const ruleKey = (rule: MockConfig) => rule.endpoints.join(', ')

/** A disabled rule ('none') sends the request to the real server, so the request gets no tag. */
export function ruleTag(rule: MockConfig): RequestTag | undefined {
  if (rule.scenario === 'none') return undefined
  return rule.scenario === 'slow' && rule.customResponse === undefined ? 'delayed' : 'mocked'
}

const SAVE_DELAY_MS = 250

let entries: LoggedRequest[] = []
let saveTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
/** Response bodies by request id. In memory only: a body can hold tokens or personal data. */
const bodies = new Map<string, RecordedBody>()
let bodyChars = 0

const isLogged = (id: string) => entries.some((entry) => entry.id === id)
const sizeOf = (body: RecordedBody | undefined) => (body && 'json' in body ? body.json.length : 0)

function dropBody(id: string) {
  bodyChars -= sizeOf(bodies.get(id))
  bodies.delete(id)
}

function keepBody(id: string, body: RecordedBody) {
  dropBody(id)
  bodies.set(id, body)
  bodyChars += sizeOf(body)
  for (const [oldest, kept] of bodies) {
    if (bodyChars <= BODIES_LIMIT) break
    // A reason such as 'not-json' holds no text, so only kept text goes, and its marker still says why it is gone.
    if (sizeOf(kept) > 0) {
      bodyChars -= sizeOf(kept)
      bodies.set(oldest, { missing: 'evicted' })
    }
  }
}

/** Reads the stream until it passes BODY_LIMIT bytes, then cancels it, so a huge download is never held in memory. */
async function readCapped(stream: ReadableStream<Uint8Array>): Promise<string | undefined> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > BODY_LIMIT) {
      reader.cancel().catch(() => {})
      return undefined
    }
    chunks.push(value)
  }
  const decoder = new TextDecoder()
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()
}

/** The text is not parsed here, so the app's responses are not parsed twice; the panel parses only the body it copies. */
async function readBody(response: Response): Promise<RecordedBody> {
  if (response.body === null || NULL_BODY_STATUSES.includes(response.status)) return { missing: 'empty' }
  if (!JSON_TYPE.test(response.headers.get('content-type') ?? '')) return { missing: 'not-json' }
  if (Number(response.headers.get('content-length')) > BODY_LIMIT) return { missing: 'too-big' }
  if (response.bodyUsed) return { missing: 'not-recorded' }
  let text: string | undefined
  // No clone: MSW builds this Response only for the event, so a clone would keep the cancel from reaching the download.
  try {
    text = await readCapped(response.body)
  } catch {
    return { missing: 'not-recorded' }
  }
  if (text === undefined) return { missing: 'too-big' }
  if (!text.trim()) return { missing: 'empty' }
  return { json: text }
}

const isLoggedRequest = (value: unknown): value is LoggedRequest =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as LoggedRequest).id === 'string' &&
  typeof (value as LoggedRequest).url === 'string' &&
  /^https?:\/\//.test((value as LoggedRequest).url)

function save() {
  clearTimeout(saveTimer)
  saveTimer = undefined
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (e) {
    console.warn('Failed to save recorded requests', e)
  }
}

// A page that fires many requests would otherwise stringify the whole list twice per request on the app's main thread.
function commit(next: LoggedRequest[]) {
  entries = next
  saveTimer ??= setTimeout(save, SAVE_DELAY_MS)
  for (const listener of listeners) listener()
}

/** The Requests tab's data. Its methods read no `this`, so they can be passed around as callbacks. */
export const requestLog = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  getSnapshot(): LoggedRequest[] {
    return entries
  },

  start(request: Request, id: string) {
    const rule = errorController.getConfigForRequest(request)
    const entry: LoggedRequest = {
      id,
      method: request.method,
      url: request.url,
      status: 'pending',
      startedAt: Date.now(),
      rule: rule && ruleKey(rule),
      tag: rule && ruleTag(rule),
    }
    const next = [entry, ...entries]
    for (const dropped of next.slice(LIMIT)) dropBody(dropped.id)
    commit(next.slice(0, LIMIT))
  },

  finish(id: string, response: Response) {
    if (!entries.some((entry) => entry.id === id)) return
    const status = response.type === 'error' || response.status === 0 ? 'failed' : response.status
    commit(entries.map((entry) => (entry.id === id ? { ...entry, status, ms: Date.now() - entry.startedAt } : entry)))
  },

  /** Keeps the JSON body of a recorded request, so the panel can copy it into a rule. Until the read ends, the body is 'reading'. */
  async recordBody(id: string, response: Response) {
    if (!isLogged(id)) return
    keepBody(id, { missing: 'reading' })
    const body = await readBody(response)
    if (isLogged(id)) keepBody(id, body)
  },

  body(id: string): RecordedBody {
    return bodies.get(id) ?? { missing: 'not-recorded' }
  },

  clear() {
    bodies.clear()
    bodyChars = 0
    commit([])
  },

  /** Saves at once. start.ts calls it on `pagehide`, so the list survives the reload that every rule change does. */
  flush() {
    save()
  },

  /** Loads the list saved before the last reload. A request still pending then never got its answer. */
  load() {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
      if (Array.isArray(saved)) {
        entries = saved
          .filter(isLoggedRequest)
          .map((entry) => (entry.status === 'pending' ? { ...entry, status: 'unfinished' } : entry))
      }
    } catch (e) {
      console.warn('Failed to load recorded requests', e)
    }
  },
}

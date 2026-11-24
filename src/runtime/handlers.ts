import { delay, http, HttpResponse, isCommonAssetRequest, type JsonBodyType } from 'msw'
import { errorController, ruleKey } from './controller.js'
// Type-only, so no module loads the other at runtime and the two files stay free of a cycle.
import type { RequestTag } from './requests.js'

/** Which rule answered one request, and what it did. */
export interface Decision {
  tag: RequestTag
  rule: string
}

/**
 * What really happened to one request, by request id. Only the handler knows: the Requests tab
 * labels a row before the body is read, so its guess can name the wrong rule, or no rule at all.
 */
const decisions = new Map<string, Decision>()

/** Reads and forgets one request's real outcome. Undefined means no rule answered and none delayed. */
export function takeDecision(id: string): Decision | undefined {
  const decision = decisions.get(id)
  decisions.delete(id)
  return decision
}

const DEFAULT_BODIES: Record<number, JsonBodyType> = {
  500: { message: 'Internal Server Error', code: 'SERVER_ERROR' },
  404: { message: 'Resource not found', code: 'NOT_FOUND' },
  401: { message: 'Unauthorized', code: 'AUTH_ERROR' },
  403: { message: 'Forbidden', code: 'FORBIDDEN' },
}

/** Statuses the Fetch spec forbids a body for: `new Response('{}', { status: 204 })` throws a TypeError. */
export const NULL_BODY_STATUSES = [204, 205, 304]

export function defaultBody(status: number): JsonBodyType {
  return DEFAULT_BODIES[status] ?? { message: 'Custom response' }
}

/** The app's own files (scripts, styles, fonts, images, hot-reload updates), so a broad rule such as `/*` cannot break the page. Other JSON stays mockable. */
export function isAppAsset(request: Request): boolean {
  const path = new URL(request.url).pathname.toLowerCase()
  if (path.includes('.hot-update.')) return true
  // Vite's client polls "/" with this Accept header while the dev server restarts (vite/dist/client/client.mjs).
  if (request.headers.get('accept') === 'text/x-vite-ping') return true
  return isCommonAssetRequest(request) && !path.endsWith('.json')
}

function respond(status: number, body: JsonBodyType | undefined) {
  if (NULL_BODY_STATUSES.includes(status)) return new HttpResponse(null, { status })
  return HttpResponse.json(body === undefined ? defaultBody(status) : body, { status })
}

/**
 * Decides one request's answer and records what it really did under `requestId`. Exported because it
 * is the unit: the handler below is a one-line adapter that only unpacks MSW's resolver argument.
 */
export async function handleRequest(request: Request, requestId: string) {
  if (isAppAsset(request)) return undefined
  // Reading a clone leaves `request.bodyUsed` false, so a request that goes on to the real server
  // still carries its body. A request with no body reads as '', which no body condition matches.
  // Asked only when some rule has a body condition, so an upload is not buffered for nothing.
  const body = request.body === null || !errorController.wantsBody() ? '' : await request.clone().text()
  const config = errorController.getConfigForRequest(request, body)
  if (!config) return undefined
  // A rule that answers in sequence gives a different answer once its first calls are used up, so
  // everything below reads the answer, never the rule.
  const answer = errorController.answerFor(config)
  if (answer.scenario === 'none') return undefined
  // A delay-only answer waits and then lets the real server reply, so the row is 'delayed', not 'mocked'.
  const tag = answer.scenario === 'slow' && answer.customResponse === undefined ? 'delayed' : 'mocked'
  decisions.set(requestId, { tag, rule: ruleKey(config) })

  if (answer.delayMs) {
    await delay(answer.delayMs)
  }

  switch (answer.scenario) {
    case '500':
    case '404':
    case '401':
    case '403':
      return respond(answer.customStatusCode || Number(answer.scenario), answer.customResponse)

    case 'network':
      return HttpResponse.error()

    case 'timeout':
      // Never resolves, so the request hangs until the app's own timeout fires.
      await new Promise(() => {})
      return undefined

    case 'slow':
      if (!answer.delayMs) {
        await delay(3000)
      }
      // Returning undefined makes MSW send the real request once the wait is over.
      return answer.customResponse === undefined ? undefined : respond(200, answer.customResponse)

    case 'custom':
      return respond(answer.customStatusCode || 200, answer.customResponse)

    default:
      return undefined
  }
}

export const handlers = [http.all('*', ({ request, requestId }) => handleRequest(request, requestId))]

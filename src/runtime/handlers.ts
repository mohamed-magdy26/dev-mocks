import { delay, http, HttpResponse, isCommonAssetRequest, type JsonBodyType } from 'msw'
import { errorController } from './controller.js'

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

async function handleRequest(request: Request) {
  if (isAppAsset(request)) return undefined
  const config = errorController.getConfigForRequest(request)
  if (!config || config.scenario === 'none') return undefined

  if (config.delayMs) {
    await delay(config.delayMs)
  }

  switch (config.scenario) {
    case '500':
    case '404':
    case '401':
    case '403':
      return respond(config.customStatusCode || Number(config.scenario), config.customResponse)

    case 'network':
      return HttpResponse.error()

    case 'timeout':
      // Never resolves, so the request hangs until the app's own timeout fires.
      await new Promise(() => {})
      return undefined

    case 'slow':
      if (!config.delayMs) {
        await delay(3000)
      }
      // Returning undefined makes MSW send the real request once the wait is over.
      return config.customResponse === undefined ? undefined : respond(200, config.customResponse)

    case 'custom':
      return respond(config.customStatusCode || 200, config.customResponse)

    default:
      return undefined
  }
}

export const handlers = [http.all('*', ({ request }) => handleRequest(request))]

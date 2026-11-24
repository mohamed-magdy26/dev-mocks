import { setupWorker } from 'msw/browser'
import type { StartDevMocksOptions } from '../index.js'
import { handlers, isAppAsset } from './handlers.js'
import { mountPanel } from './panel/mount.js'
import { toShortcut } from './panel/settings.js'
import { requestLog } from './requests.js'

export async function start({ serviceWorkerUrl = '/mockServiceWorker.js', shortcut }: StartDevMocksOptions): Promise<void> {
  const keys = toShortcut(shortcut)
  requestLog.load()
  addEventListener('pagehide', requestLog.flush)
  const worker = setupWorker(...handlers)
  const onResponse = (mocked: boolean) => (event: { response: Response; requestId: string }) => {
    requestLog.finish(event.requestId, event.response, mocked)
    void requestLog.recordBody(event.requestId, event.response)
  }
  worker.events.on('request:start', ({ request, requestId }) => {
    if (!isAppAsset(request)) requestLog.start(request, requestId)
  })
  // Two events, so the Requests tab can label a row from what really happened instead of guessing.
  worker.events.on('response:mocked', onResponse(true))
  worker.events.on('response:bypass', onResponse(false))
  await worker.start({ onUnhandledRequest: 'bypass', serviceWorker: { url: serviceWorkerUrl } })
  mountPanel(keys)
}

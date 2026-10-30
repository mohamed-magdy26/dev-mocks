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
  const onResponse = ({ response, requestId }: { response: Response; requestId: string }) => {
    requestLog.finish(requestId, response)
    void requestLog.recordBody(requestId, response)
  }
  worker.events.on('request:start', ({ request, requestId }) => {
    if (!isAppAsset(request)) requestLog.start(request, requestId)
  })
  worker.events.on('response:mocked', onResponse)
  worker.events.on('response:bypass', onResponse)
  await worker.start({ onUnhandledRequest: 'bypass', serviceWorker: { url: serviceWorkerUrl } })
  mountPanel(keys)
}

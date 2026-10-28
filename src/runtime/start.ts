import { setupWorker } from 'msw/browser'
import { handlers, isAppAsset } from './handlers.js'
import { mountPanel } from './panel/mount.js'
import { requestLog } from './requests.js'

export async function start(serviceWorkerUrl = '/mockServiceWorker.js'): Promise<void> {
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
  mountPanel()
}

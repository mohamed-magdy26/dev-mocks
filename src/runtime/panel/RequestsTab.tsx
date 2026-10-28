import { clsx } from 'clsx'
import { memo, useState, useSyncExternalStore } from 'react'
import { requestLog, type LoggedRequest } from '../requests.js'
import { FOCUS, ICON_BTN, INPUT } from './classes.js'
import { Empty } from './Empty.js'
import { formatMs, pathParts, plural, statusView } from './form.js'
import { Highlight } from './Highlight.js'
import { BanIcon, SearchIcon } from './icons.js'

interface RequestsTabProps {
  onPick: (request: LoggedRequest) => void
  onClear: () => void
}

interface RequestRowProps {
  request: LoggedRequest
  query: string
  onPick: (request: LoggedRequest) => void
}

const RequestRow = memo(function RequestRow({ request, query, onPick }: RequestRowProps) {
  const url = new URL(request.url)
  const { head, tail } = pathParts(url.pathname)
  const status = statusView(request)
  return (
    <button
      type="button"
      title={`${request.method} ${request.url}`}
      onClick={() => onPick(request)}
      className="grid w-full grid-cols-req items-center gap-x-2.5 gap-y-1 rounded-lg px-2.5 py-2 text-left hover:bg-hover focus-visible:bg-hover focus-visible:shadow-ring-accent focus-visible:outline-none"
    >
      <span
        className={clsx('row-span-2 self-start pt-0.5 font-mono text-tiny font-bold tracking-wide', {
          'text-faint': request.method === 'GET',
          'text-dim': request.method !== 'GET',
        })}
      >
        {request.method}
      </span>
      <span className="truncate font-mono text-body font-semibold leading-tight text-ink">
        <Highlight text={tail} query={query} />
      </span>
      <span
        className={clsx(`tone-${status.tone}`, 'justify-self-end rounded-sm bg-tone-soft px-1.5 py-1 font-mono text-tiny font-bold text-tone')}
      >
        {status.text}
      </span>
      <span className="truncate font-mono text-xs text-faint">
        {request.tag && <span className={clsx('dm-tag', { 'tone-blue': request.tag === 'delayed', 'tone-lime': request.tag === 'mocked' })}>{request.tag}</span>}
        <Highlight text={head} query={query} />
        {url.search && (
          <span className="text-dim">
            <Highlight text={url.search} query={query} />
          </span>
        )}
      </span>
      <span className="justify-self-end font-mono text-tiny text-faint">{request.ms === undefined ? '…' : formatMs(request.ms)}</span>
    </button>
  )
})

export function RequestsTab({ onPick, onClear }: RequestsTabProps) {
  const requests = useSyncExternalStore(requestLog.subscribe, requestLog.getSnapshot)
  const [filter, setFilter] = useState('')
  const [invert, setInvert] = useState(false)
  const text = filter.trim()
  const needle = text.toLowerCase()
  const shown = needle ? requests.filter((request) => request.url.toLowerCase().includes(needle) !== invert) : requests
  const highlight = invert ? '' : text

  return (
    <div role="tabpanel" id="dm-panel-requests" aria-labelledby="dm-tab-requests">
      <div className="sticky top-0 z-10 border-b border-line bg-panel px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Filter by URL"
              aria-label="Filter requests by URL"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={clsx(INPUT, 'h-8 w-full pl-8')}
            />
          </div>
          <label
            title="Show the requests that do not contain the filter text"
            className="inline-flex cursor-pointer select-none items-center gap-1.5 text-sm text-dim"
          >
            <input
              type="checkbox"
              className="dm-check"
              aria-describedby="dm-invert-help"
              checked={invert}
              onChange={(event) => setInvert(event.target.checked)}
            />
            Invert
            <span id="dm-invert-help" className="sr-only">
              Show the requests that do not contain the filter text
            </span>
          </label>
          <button
            type="button"
            aria-label="Clear recorded requests"
            title="Clear recorded requests"
            onClick={onClear}
            className={clsx(ICON_BTN, FOCUS, 'hover:text-red')}
          >
            <BanIcon className="h-4 w-4" />
          </button>
        </div>
        {requests.length > 0 && (
          <p className="m-0 mt-2 flex justify-between gap-2 text-note text-faint">
            <span>
              {shown.length === requests.length
                ? plural(requests.length, 'request')
                : `${shown.length} of ${plural(requests.length, 'request')}`}
            </span>
            <span>Click a request to mock it</span>
          </p>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="m-0 list-none px-2 pb-3 pt-1.5">
          {shown.map((request) => (
            <li key={request.id} className="border-t border-hairline first:border-t-0">
              <RequestRow request={request} query={highlight} onPick={onPick} />
            </li>
          ))}
        </ul>
      )}
      {requests.length === 0 && (
        <div className="p-4">
          <Empty
            title="No requests recorded yet"
            text="Use the app. Every fetch and XHR call appears here, newest first. The list keeps the last 100 requests, and it survives a reload."
          />
        </div>
      )}
      {requests.length > 0 && shown.length === 0 && (
        <div className="p-4">
          <Empty
            title={invert ? `Every request contains “${text}”` : `No request contains “${text}”`}
            text={
              invert
                ? 'Invert is on, so this list shows only the requests that do not contain the filter text.'
                : 'The filter looks at the whole URL, including the query.'
            }
          />
        </div>
      )}
    </div>
  )
}

import { clsx } from 'clsx'
import { useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { splitEndpoints } from '../controller.js'
import { requestLog, type LoggedRequest } from '../requests.js'
import { FOCUS, HELP, INPUT, LABEL, MINI } from './classes.js'
import { Field, type FormProps } from './Field.js'
import { lastToken, pathParts, suggestions } from './form.js'
import { Breakable, Highlight } from './Highlight.js'

interface PathFieldProps extends FormProps {
  pendingQuery: string
  onPendingQueryChange: (query: string) => void
}

function Suggestion(props: { id: string; request: LoggedRequest; token: string; active: boolean; onPick: () => void }) {
  const { id, request, token, active, onPick } = props
  const url = new URL(request.url)
  const { head, tail } = pathParts(url.pathname)
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      title={request.url}
      onClick={onPick}
      className="group/opt flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 font-mono text-sm font-medium leading-snug text-dim hover:bg-hover hover:text-ink aria-selected:bg-hover aria-selected:text-ink"
    >
      <span className="w-11 shrink-0 pt-0.5 text-tiny font-bold tracking-wide text-faint">{request.method}</span>
      <span className="grid min-w-0 gap-0.5">
        <span className="break-words">
          <span className="text-faint group-hover/opt:text-dim group-aria-selected/opt:text-dim">
            <Highlight text={head} query={token} breakable />
          </span>
          <Highlight text={tail} query={token} breakable />
        </span>
        <span className="break-words text-tiny text-faint">
          {url.host}
          {url.search && (
            <>
              {' '}
              <span className="text-dim">
                <Breakable text={url.search} />
              </span>
            </>
          )}
        </span>
      </span>
    </li>
  )
}

export function PathField({ form, onChange, pendingQuery, onPendingQueryChange }: PathFieldProps) {
  const requests = useSyncExternalStore(requestLog.subscribe, requestLog.getSnapshot)
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const token = lastToken(form.path)
  const options = menuOpen ? suggestions(requests, token) : []
  const showMenu = options.length > 0

  function pick(request: LoggedRequest) {
    const url = new URL(request.url)
    const kept = splitEndpoints(form.path)
    if (token) kept.pop()
    setMenuOpen(false)
    onChange({ ...form, path: [...kept, url.pathname].join(', ') })
    onPendingQueryChange(kept.length === 0 ? url.search : '')
  }

  function move(step: number) {
    if (active < 0) {
      setActive(step > 0 ? 0 : options.length - 1)
      return
    }
    setActive((active + step + options.length) % options.length)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showMenu) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMenuOpen(true)
        setActive(-1)
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      pick(options[active])
    } else if (event.key === 'Escape') {
      // Keeps the popover open: Escape here closes only the suggestion list.
      event.stopPropagation()
      setMenuOpen(false)
    }
  }

  return (
    <Field name="path">
      <label htmlFor="dm-path" className={LABEL}>
        Request path
      </label>
      <div className="relative">
        <input
          id="dm-path"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="/Order/GetAllOrders"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showMenu}
          aria-controls="dm-suggest"
          aria-activedescendant={showMenu && active >= 0 ? `dm-opt-${active}` : undefined}
          aria-describedby="dm-path-help"
          value={form.path}
          onChange={(event) => {
            onChange({ ...form, path: event.target.value }, false)
            onPendingQueryChange('')
            setMenuOpen(true)
            setActive(-1)
          }}
          onFocus={() => setMenuOpen(true)}
          onBlur={() => setMenuOpen(false)}
          onKeyDown={onKeyDown}
          className={clsx(INPUT, 'h-9 w-full')}
        />
        {showMenu && (
          <div
            onMouseDown={(event) => event.preventDefault()}
            className="dm-scroll absolute left-0 right-0 top-full z-10 mt-1 max-h-menu overflow-auto rounded-field border border-line-strong bg-raised p-1 shadow-menu"
          >
            <div id="dm-suggest-label" className="px-2 pb-1 pt-1.5 text-tiny font-semibold uppercase tracking-label text-faint">
              {token ? 'Recorded requests that match' : 'Recent requests'}
            </div>
            <ul id="dm-suggest" role="listbox" aria-labelledby="dm-suggest-label" className="m-0 list-none p-0">
              {options.map((request, index) => (
                <Suggestion
                  key={request.id}
                  id={`dm-opt-${index}`}
                  request={request}
                  token={token}
                  active={index === active}
                  onPick={() => pick(request)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
      <p id="dm-path-help" className={HELP}>
        Matches the end of the path. Paste a full URL from the Network tab, or end with{' '}
        <code className="font-mono text-dim">/*</code> to match everything under a path. Separate several paths with commas.
      </p>
      {pendingQuery && !form.full && (
        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 rounded-field border border-blue-line bg-blue-soft px-2.5 py-2 text-sm">
          <span className="min-w-0">
            The request was sent with{' '}
            <code className="break-words font-mono text-ink">
              <Breakable text={pendingQuery} />
            </code>
            . The rule ignores the query, so every page matches.
          </span>
          <button
            type="button"
            onClick={() => {
              onChange({ ...form, path: form.path.trim() + pendingQuery, full: true })
              onPendingQueryChange('')
            }}
            className={clsx(MINI, FOCUS)}
          >
            Match only this query
          </button>
        </div>
      )}
      <label className="relative inline-flex w-fit cursor-pointer select-none items-center gap-2 text-body text-dim">
        <input
          type="checkbox"
          className="dm-switch"
          checked={form.full}
          onChange={(event) => onChange({ ...form, full: event.target.checked }, false)}
        />
        <span aria-hidden="true" className="dm-switch-track" />
        Match the query too
      </label>
    </Field>
  )
}

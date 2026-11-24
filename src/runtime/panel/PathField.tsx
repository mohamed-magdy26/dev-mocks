import { clsx } from 'clsx'
import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { splitEndpoints } from '../controller.js'
import { requestLog, type LoggedRequest } from '../requests.js'
import { FOCUS, HELP, INPUT, LABEL, MINI } from './classes.js'
import { Field, type FormProps } from './Field.js'
import { lastToken, liftPastedOrigin, METHODS, pathParts, suggestions } from './form.js'
import { InfoTip, TipCase, TipCases } from './InfoTip.js'
import { Breakable, Highlight } from './Highlight.js'

/** No suggestion is highlighted, so Enter picks nothing and the arrow keys start from the ends of the list. */
const NO_ACTIVE = -1

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
  const pathBox = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState(NO_ACTIVE)
  const token = lastToken(form.path)
  // formToRule() drops the origin from a rule holding several paths, so the line above must not claim otherwise.
  const pinned = Boolean(form.origin) && splitEndpoints(form.path).length <= 1
  const options = menuOpen ? suggestions(requests, token) : []
  const showMenu = options.length > 0

  function pick(request: LoggedRequest) {
    const url = new URL(request.url)
    const kept = splitEndpoints(form.path)
    if (token) kept.pop()
    setMenuOpen(false)
    // Only a rule holding this one path can promise one server, so adding a second path leaves both alone.
    const origin = kept.length === 0 ? { origin: url.origin, method: request.method.toUpperCase() } : {}
    onChange({ ...form, path: [...kept, url.pathname].join(', '), ...origin })
    onPendingQueryChange(kept.length === 0 ? url.search : '')
  }

  /**
   * Lifts a pasted full URL once the field loses focus, not on every keystroke: while someone types
   * "https://api.example.com", the text "https://a" is already a valid URL and the line would jump.
   * The field flashes because the text changes without the user typing it.
   */
  function liftOnBlur() {
    const lifted = liftPastedOrigin(form)
    if (lifted) onChange(lifted)
  }

  function move(step: number) {
    if (active === NO_ACTIVE) {
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
        setActive(NO_ACTIVE)
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && active !== NO_ACTIVE) {
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
      {form.origin && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className={LABEL}>Server</span>
            {/* Breakable inserts <wbr> for wrapping, which a screen reader reads as breaks, so the
                note below is described by this unbroken copy instead. */}
            <span id="dm-origin-value" className="sr-only">
              {form.origin}
            </span>
            <span aria-hidden="true" className="min-w-0 break-words font-mono text-sm text-dim">
              <Breakable text={form.origin} />
            </span>
          </div>
          {/*
            Clearing the origin removes this whole row, and with it this button. Focus is moved to the
            path box first, while the button is still in the page: dropped focus sends the next Tab
            back to the top of the panel, which loses a keyboard user's place in the form.
          */}
          <button
            type="button"
            onClick={() => {
              pathBox.current?.focus()
              // Focusing the path box opens its suggestion list. This press was about the server, not
              // about picking another path, so the list is closed again right after the focus moves.
              setMenuOpen(false)
              onChange({ ...form, origin: '' }, false)
            }}
            className={clsx(MINI, FOCUS)}
          >
            Every server
          </button>
        </div>
      )}
      {form.origin && !pinned && (
        <p className={HELP}>
          The rule holds several paths, so it matches them on every server. One server cannot speak for all of
          them. Leave one path to tie the rule to <span className="font-mono text-dim">{new URL(form.origin).host}</span>.
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <label htmlFor="dm-path" className={LABEL}>
          Request path
        </label>
        <InfoTip label="Request path">
          <p>The rule answers a request whose path ends with what you type here. The box on the left picks the
          method: GET answers GET only, and "Any" answers every method.</p>
          <TipCases>
            <TipCase code="/api/orders">
              Answers /api/orders. A longer path, such as /api/orders/5, does not match.
            </TipCase>
            <TipCase code="/api/orders/*">Answers /api/orders and everything under it.</TipCase>
            <TipCase code="/api/orders, /api/cart">Two paths in one rule, separated by a comma.</TipCase>
            <TipCase code="https://shop.test/api/orders">
              Pasted whole from the Network tab. The server moves up to the Server line.
            </TipCase>
          </TipCases>
        </InfoTip>
      </div>
      <div className="relative">
        <div className="flex w-full">
          <select
            id="dm-method"
            aria-label="Method"
            value={form.method}
            onChange={(event) => onChange({ ...form, method: event.target.value }, false)}
            className={clsx(INPUT, FOCUS, 'h-9 w-20 shrink-0 rounded-r-none border-r-0 px-2 text-sm')}
          >
            <option value="">Any</option>
            {METHODS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            ref={pathBox}
            id="dm-path"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="/Order/GetAllOrders"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showMenu}
            aria-controls="dm-suggest"
            aria-activedescendant={showMenu && active !== NO_ACTIVE ? `dm-opt-${active}` : undefined}
            value={form.path}
            onChange={(event) => {
              onChange({ ...form, path: event.target.value }, false)
              onPendingQueryChange('')
              setMenuOpen(true)
              setActive(NO_ACTIVE)
            }}
            onFocus={() => setMenuOpen(true)}
            onBlur={() => {
              setMenuOpen(false)
              liftOnBlur()
            }}
            onKeyDown={onKeyDown}
            className={clsx(INPUT, 'h-9 w-full rounded-l-none')}
          />
        </div>
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

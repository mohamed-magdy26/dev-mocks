import { clsx } from 'clsx'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { errorController, type MockConfig } from '../controller.js'
import { requestLog, ruleKey, type LoggedRequest } from '../requests.js'
import { FOCUS, ICON_BTN, PRIMARY } from './classes.js'
import { FlashContext } from './Field.js'
import {
  changedFields,
  checkJson,
  EMPTY_FORM,
  findProblem,
  formToRule,
  REFUSED_CHANGE_TEXT,
  refusedSaveText,
  requestToForm,
  RULE_ANSWERED_TEXT,
  ruleToForm,
  type FlashField,
  type FormState,
} from './form.js'
import { CloseIcon, EyeOffIcon, MoveIcon, PulseIcon } from './icons.js'
import { Launcher } from './Launcher.js'
import { RequestsTab } from './RequestsTab.js'
import { RulesTab } from './RulesTab.js'
import { readSession, takeSession, writeSession } from './session.js'
import {
  CORNER_KEY,
  HIDDEN_KEY,
  matchesShortcut,
  NEXT_CORNER,
  OFF_FLAG,
  ON_FLAG,
  POP_CORNER,
  readCorner,
  readSetting,
  ruleStatus,
  showsDot,
  writeSetting,
  type Corner,
  type Shortcut,
} from './settings.js'

type Tab = 'rules' | 'requests'
const TABS: Tab[] = ['rules', 'requests']
const TAB_LABELS: Record<Tab, string> = { rules: 'Rules', requests: 'Requests' }
const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ ↵' : 'Ctrl ↵'
// Read once per page load: the notice is written just before a reload and shown once after it.
const notice = takeSession('notice')
const TOAST_MS = 4500
const NOT_FOUND = -1
const OPEN_FLAG = '1'
const CLOSED_FLAG = ''
const FOCUS_SWITCH = 'switch'
// Read once per page load: the switch reloads the page, and keyboard focus returns to it afterwards.
const focusSwitchOnLoad = takeSession('focus') === FOCUS_SWITCH

/** A file dropped just outside the JSON box would otherwise make the browser leave the app and open the file. */
function preventFileDrop(event: DragEvent<HTMLElement>) {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault()
}

/** Only this badge re-renders on every recorded request, not the whole panel. */
function RequestCount() {
  const requests = useSyncExternalStore(requestLog.subscribe, requestLog.getSnapshot)
  return <>{requests.length}</>
}

interface Toast {
  text: string
  showRequests?: boolean
}

interface Note {
  text: string
  warn: boolean
}

export default function DevMocksPanel({ shortcut }: { shortcut: Shortcut }) {
  const [hidden, setHidden] = useState(() => readSetting(HIDDEN_KEY) === ON_FLAG)
  const [corner, setCorner] = useState<Corner>(readCorner)
  const [focusLauncher, setFocusLauncher] = useState(false)
  const [focusSwitch, setFocusSwitch] = useState(focusSwitchOnLoad)
  const [announcement, setAnnouncement] = useState('')
  const [open, setOpen] = useState(() => !hidden && readSession('open') === OPEN_FLAG)
  const [tab, setTab] = useState<Tab>(() => (readSession('tab') === 'requests' ? 'requests' : 'rules'))
  const [rules] = useState<MockConfig[]>(() => errorController.getAllConfigs())
  const [paused] = useState(() => errorController.isPaused())
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editing, setEditing] = useState<number | null>(null)
  const [pendingQuery, setPendingQuery] = useState('')
  const [flashing, setFlashing] = useState<ReadonlySet<FlashField>>(() => new Set())
  const [focusPresets, setFocusPresets] = useState(false)
  const [toast, setToast] = useState<Toast | null>(() => (notice ? { text: notice, showRequests: true } : null))
  const [toastHeld, setToastHeld] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ rules: null, requests: null })

  const jsonCheck = useMemo(() => checkJson(form.json), [form.json])
  const problem = findProblem(form, jsonCheck)
  // A note lasts only until the next edit, so it is shown before the problem, which the fields also show.
  const footer = note ?? problem
  const count = rules.length
  let status = 'No active rules'
  if (count > 0) status = ruleStatus(count, paused)

  useEffect(() => {
    if (!toast || toastHeld) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast, toastHeld])

  function close() {
    setOpen(false)
    setFocusSwitch(false)
    writeSession('open', CLOSED_FLAG)
    fabRef.current?.focus()
  }

  const changeHidden = useCallback((next: boolean) => {
    setHidden(next)
    setAnnouncement('')
    writeSetting(HIDDEN_KEY, next ? ON_FLAG : OFF_FLAG)
    if (!next) return
    setOpen(false)
    setFocusSwitch(false)
    writeSession('open', CLOSED_FLAG)
  }, [])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.repeat || !matchesShortcut(event, shortcut)) return
      event.preventDefault()
      setFocusLauncher(false)
      changeHidden(!hidden)
    }
    // Capture phase: a host editor that stops the key event would otherwise swallow the shortcut.
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [hidden, shortcut, changeHidden])

  function showButton() {
    setFocusLauncher(true)
    changeHidden(false)
  }

  function hideButton() {
    changeHidden(true)
    if (showsDot({ count })) {
      setFocusLauncher(true)
      return
    }
    setAnnouncement(`Dev mocks button hidden. Press ${shortcut.label} to show it.`)
  }

  function moveTo(next: Corner) {
    setCorner(next)
    writeSetting(CORNER_KEY, next)
  }

  const endFlash = useCallback((field: FlashField) => {
    setFlashing((current) => {
      const next = new Set(current)
      next.delete(field)
      return next
    })
  }, [])
  const flash = useMemo(() => ({ flashing, end: endFlash }), [flashing, endFlash])

  function toggle() {
    if (open) {
      close()
      return
    }
    setOpen(true)
    writeSession('open', OPEN_FLAG)
  }

  function changeTab(next: Tab, focus = false) {
    setTab(next)
    writeSession('tab', next)
    setFocusPresets(false)
    bodyRef.current?.scrollTo({ top: 0 })
    if (focus) tabRefs.current[next]?.focus()
  }

  function updateForm(next: FormState, withFlash = true) {
    if (withFlash) setFlashing(new Set(changedFields(form, next)))
    setNote(null)
    setForm(next)
  }

  function resetForm() {
    setEditing(null)
    setPendingQuery('')
    setNote(null)
    setForm(EMPTY_FORM)
  }

  function startEdit(index: number) {
    setEditing(index)
    setPendingQuery('')
    updateForm(ruleToForm(rules[index]))
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function reloadWith(text: string) {
    writeSession('notice', text)
    globalThis.location.reload()
  }

  function save() {
    if (problem) return
    const rule = formToRule(form)
    if (!errorController.addConfig(rule, editing === null ? [] : rules[editing].endpoints)) {
      setNote({ text: refusedSaveText(rule), warn: true })
      return
    }
    reloadWith(editing === null ? 'Rule saved. The page reloaded.' : 'Rule updated. The page reloaded.')
  }

  function remove(index: number) {
    if (!errorController.removeConfig(rules[index].endpoints)) {
      setNote({ text: REFUSED_CHANGE_TEXT, warn: true })
      return
    }
    reloadWith('Rule removed. The page reloaded.')
  }

  function clearAll() {
    if (!errorController.clearAll()) {
      setNote({ text: REFUSED_CHANGE_TEXT, warn: true })
      return
    }
    reloadWith('All rules removed. The page reloaded.')
  }

  function togglePaused() {
    if (!errorController.setPaused(!paused)) {
      setToast({ text: REFUSED_CHANGE_TEXT })
      return
    }
    writeSession('focus', FOCUS_SWITCH)
    reloadWith(paused ? 'Rules resumed. The page reloaded.' : 'All rules paused. The page reloaded.')
  }

  function pickRequest(request: LoggedRequest) {
    changeTab('rules')
    setFocusPresets(true)
    // A disabled or delay-only rule still matches, but the real server answered, so only a mocked request opens its rule.
    const index = request.tag !== 'mocked' ? NOT_FOUND : rules.findIndex((rule) => ruleKey(rule) === request.rule)
    if (index !== NOT_FOUND) {
      startEdit(index)
      setNote({ text: RULE_ANSWERED_TEXT, warn: false })
      return
    }
    const picked = requestToForm(form, request, requestLog.body(request.id))
    setEditing(null)
    updateForm(picked.form)
    if (picked.note) setNote({ text: picked.note, warn: false })
    setPendingQuery(new URL(request.url).search)
  }

  function onPopoverKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      close()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && tab === 'rules') {
      event.preventDefault()
      save()
    }
  }

  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = TABS.indexOf(tab)
    let next = current
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (current + 1) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault()
    changeTab(TABS[next], true)
  }

  return (
    <div className="font-ui text-base text-ink">
      <Launcher
        buttonRef={fabRef}
        open={open}
        hidden={hidden}
        count={count}
        paused={paused}
        corner={corner}
        shortcutLabel={shortcut.label}
        autoFocus={focusLauncher}
        onToggle={toggle}
        onShow={showButton}
        onCornerChange={moveTo}
      />

      {open && (
        <section
          id="dm-pop"
          role="dialog"
          aria-labelledby="dm-title"
          onKeyDown={onPopoverKeyDown}
          onDragOver={preventFileDrop}
          onDrop={preventFileDrop}
          className={clsx(
            POP_CORNER[corner],
            'fixed z-top flex h-pop w-pop animate-pop-in flex-col overflow-hidden rounded-pop border border-line bg-panel shadow-pop narrow:left-4 narrow:right-4 narrow:h-pop-narrow narrow:w-auto',
          )}
        >
          <header className="dm-head relative flex items-center justify-between gap-3 py-3.5 pl-4 pr-3">
            <div className="relative flex items-center gap-2.5">
              <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink">
                <PulseIcon className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <div>
                <h2 id="dm-title" className="m-0 text-md font-bold tracking-tight">
                  Dev Mocks
                </h2>
                <p className="m-0 mt-px flex items-center gap-1.5 text-note text-dim">
                  <span
                    className={clsx('h-1.5 w-1.5 rounded-full', {
                      'bg-accent shadow-live': count > 0 && !paused,
                      'bg-amber': count > 0 && paused,
                      'bg-faint': count === 0,
                    })}
                  />
                  {status}
                </p>
              </div>
            </div>
            <div className="relative flex items-center gap-1">
              {(count > 0 || paused) && (
                <>
                  <label
                    title="Changing this reloads the page"
                    className="relative mr-1.5 inline-flex cursor-pointer select-none items-center gap-2 text-note font-semibold text-dim"
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      className="dm-switch"
                      aria-describedby="dm-switch-note"
                      autoFocus={focusSwitch}
                      checked={!paused}
                      onChange={togglePaused}
                    />
                    <span aria-hidden="true" className="dm-switch-track" />
                    Mock rules
                  </label>
                  <span id="dm-switch-note" className="sr-only">
                    Changing this reloads the page.
                  </span>
                </>
              )}
              <button
                type="button"
                aria-label={`Move the dev mocks button to the ${NEXT_CORNER[corner].replace('-', ' ')} corner`}
                title="Move ⚙️ to the next corner"
                onClick={() => moveTo(NEXT_CORNER[corner])}
                className={clsx(ICON_BTN, FOCUS, 'hover:text-ink')}
              >
                <MoveIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Hide the dev mocks button. Press ${shortcut.label} to show it again.`}
                aria-keyshortcuts={shortcut.label}
                title={`Hide ⚙️ · ${shortcut.label} shows it again`}
                onClick={hideButton}
                className={clsx(ICON_BTN, FOCUS, 'hover:text-ink')}
              >
                <EyeOffIcon className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Close dev mocks panel" onClick={close} className={clsx(ICON_BTN, FOCUS, 'hover:text-ink')}>
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div role="tablist" aria-label="Dev mocks sections" onKeyDown={onTabsKeyDown} className="flex gap-1 border-b border-line px-2.5">
            {TABS.map((name) => (
              <button
                key={name}
                ref={(element) => {
                  tabRefs.current[name] = element
                }}
                type="button"
                role="tab"
                id={`dm-tab-${name}`}
                aria-controls={tab === name ? `dm-panel-${name}` : undefined}
                aria-selected={tab === name}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => changeTab(name)}
                className={clsx(FOCUS, '-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-2 pb-3 pt-2.5 text-body font-semibold leading-none', {
                  'border-accent text-ink': tab === name,
                  'border-transparent text-dim hover:text-ink': tab !== name,
                })}
              >
                {name === 'requests' && <span aria-hidden="true" className="h-1.5 w-1.5 animate-rec rounded-full bg-red" />}
                {TAB_LABELS[name]}
                <span
                  className={clsx('rounded-full border bg-raised px-1.5 py-0.5 font-mono text-tiny font-semibold', {
                    'border-line-strong text-ink': tab === name,
                    'border-line text-dim': tab !== name,
                  })}
                >
                  {name === 'rules' ? count : <RequestCount />}
                </span>
              </button>
            ))}
          </div>

          <div ref={bodyRef} className="dm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {tab === 'rules' ? (
              <FlashContext.Provider value={flash}>
                <RulesTab
                  form={form}
                  onChange={updateForm}
                  rules={rules}
                  editing={editing}
                  onEdit={startEdit}
                  onRemove={remove}
                  onClearAll={clearAll}
                  onCancelEdit={resetForm}
                  pendingQuery={pendingQuery}
                  onPendingQueryChange={setPendingQuery}
                  focusPresets={focusPresets}
                  paused={paused}
                />
              </FlashContext.Provider>
            ) : (
              <RequestsTab onPick={pickRequest} onClear={requestLog.clear} />
            )}
          </div>

          {tab === 'rules' && (
            <footer className="flex items-center justify-between gap-3 border-t border-line bg-raised py-3 pl-4 pr-3.5">
              <p aria-live="polite" className={clsx('m-0 text-note', { 'text-amber': footer?.warn, 'text-faint': !footer?.warn })}>
                {footer?.text ??
                  (editing === null
                    ? 'Saving reloads the page, so the app sends its requests again.'
                    : 'Updating replaces the rule, then reloads the page.')}
              </p>
              <button type="button" disabled={Boolean(problem)} onClick={save} className={clsx(PRIMARY, FOCUS)}>
                {editing === null ? 'Save & reload' : 'Update & reload'}
                <span aria-hidden="true" className="rounded-xs bg-shade px-1 py-0.5 font-mono text-micro font-semibold">
                  {SHORTCUT}
                </span>
              </button>
            </footer>
          )}

          <div
            role="status"
            aria-live="polite"
            onMouseEnter={() => setToastHeld(true)}
            onMouseLeave={() => setToastHeld(false)}
            onFocus={() => setToastHeld(true)}
            onBlur={() => setToastHeld(false)}
            className={clsx(
              'absolute left-1/2 z-10 flex w-max max-w-toast -translate-x-1/2 items-center gap-2.5 rounded-xl border border-line-strong bg-toast py-2 pl-3 pr-2.5 text-body text-ink shadow-toast transition duration-200 ease-dm',
              {
                'bottom-toast': tab === 'rules',
                'bottom-3.5': tab === 'requests',
                'pointer-events-auto opacity-100': toast !== null,
                'pointer-events-none translate-y-2 opacity-0': toast === null,
              },
            )}
          >
            {toast && <span>{toast.text}</span>}
            {toast?.showRequests && (
              <button
                type="button"
                onClick={() => {
                  changeTab('requests')
                  setToast(null)
                  setToastHeld(false)
                }}
                className={clsx(FOCUS, 'shrink-0 rounded-md bg-accent-soft px-2 py-1 text-sm font-bold leading-none text-accent')}
              >
                Show requests
              </button>
            )}
          </div>
        </section>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

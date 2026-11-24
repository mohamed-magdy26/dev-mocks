import { clsx } from 'clsx'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { CloseIcon, MoveIcon, PulseIcon, ShrinkIcon } from './icons.js'
import { Launcher } from './Launcher.js'
import { RequestsTab } from './RequestsTab.js'
import { ActiveRulesTab } from './ActiveRulesTab.js'
import { RuleTab } from './RuleTab.js'
import { readSession, takeSession, writeSession } from './session.js'
import {
  EDGE,
  isSideEdge,
  matchesShortcut,
  NEXT_EDGE,
  OFF_FLAG,
  ON_FLAG,
  openingTab,
  readSetting,
  readSpot,
  ruleStatus,
  SHRUNK_KEY,
  SPOT_KEY,
  spotText,
  TAB_LABELS,
  TABS,
  writeSetting,
  type Shortcut,
  type Spot,
  type Tab,
} from './settings.js'

const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ ↵' : 'Ctrl ↵'
// Read once per page load: the notice is written just before a reload and shown once after it.
const notice = takeSession('notice')
const TOAST_MS = 4500
/** How close to the window's edge the panel may come, in pixels, when it lines up with the ⚙️ tab. */
const POP_MARGIN = 8
const NOT_FOUND = -1
const OPEN_FLAG = '1'
const CLOSED_FLAG = ''
const FOCUS_SWITCH = 'switch'
/** Written before a pause reloads the page, with the paused rule's key after it. */
const FOCUS_RULE = 'rule:'
// Read once per page load, and read only here: a control that reloads the page writes down which
// control it was, so keyboard focus comes back to it instead of starting at the top of the app.
const focusOnLoad = takeSession('focus')
const focusSwitchOnLoad = focusOnLoad === FOCUS_SWITCH
const focusRuleOnLoad = focusOnLoad?.startsWith(FOCUS_RULE) ? focusOnLoad.slice(FOCUS_RULE.length) : null

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

export default function DevMocksPanel({ shortcut, shrinkShortcut }: { shortcut: Shortcut; shrinkShortcut: Shortcut }) {
  const [shrunk, setShrunk] = useState(() => readSetting(SHRUNK_KEY) === ON_FLAG)
  const [spot, setSpot] = useState<Spot>(readSpot)
  const [focusLauncher, setFocusLauncher] = useState(false)
  const [focusSwitch, setFocusSwitch] = useState(focusSwitchOnLoad)
  // State, not the module value straight from storage: `autoFocus` fires on every mount of the
  // button, and leaving the key set would pull focus back into the row each time the Active rules
  // tab is mounted again, for example after a trip to the Rule tab.
  const [focusRule, setFocusRule] = useState(focusRuleOnLoad)
  // The panel can be open while the ⚙️ tab is shrunk, so what was open last stands whichever it was.
  const [open, setOpen] = useState(() => readSession('open') === OPEN_FLAG)
  const [rules] = useState<MockConfig[]>(() => errorController.getAllConfigs())
  const [tab, setTab] = useState<Tab>(() => openingTab(readSession('tab')))
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
  const rootRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLElement>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ rule: null, active: null, requests: null })

  const jsonCheck = useMemo(() => checkJson(form.json), [form.json])
  const problem = findProblem(form, jsonCheck)
  // A note lasts only until the next edit, so it is shown before the problem, which the fields also show.
  const footer = note ?? problem
  // Two counts, because they differ once one rule is paused on its own row: `saved` is how many
  // rules exist, which is what the "Active rules" list shows, and `live` is how many can answer a
  // request now, which is what the header line and the ⚙️ tab's badge report.
  const saved = rules.length
  const live = rules.filter((rule) => !rule.paused).length
  const status = ruleStatus(live, saved, paused)

  useEffect(() => {
    if (!toast || toastHeld) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast, toastHeld])

  const changeOpen = useCallback((next: boolean) => {
    setOpen(next)
    writeSession('open', next ? OPEN_FLAG : CLOSED_FLAG)
    if (!next) {
      setFocusSwitch(false)
      setFocusRule(null)
    }
  }, [])

  const close = useCallback(() => {
    changeOpen(false)
    fabRef.current?.focus()
  }, [changeOpen])

  const changeShrunk = useCallback(
    (next: boolean) => {
      setShrunk(next)
      writeSetting(SHRUNK_KEY, next ? ON_FLAG : OFF_FLAG)
      // Shrinking puts the whole thing out of the way, so the open panel goes with the ⚙️ tab.
      if (next) changeOpen(false)
    },
    [changeOpen],
  )

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.repeat) return
      const root = rootRef.current?.getRootNode()
      const inPanel = root instanceof ShadowRoot && root.activeElement !== null
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault()
        if (open) {
          close()
          return
        }
        changeOpen(true)
        // The tab sits before the panel in the page, so the next Tab press walks into the panel.
        fabRef.current?.focus()
        return
      }
      if (!matchesShortcut(event, shrinkShortcut)) return
      event.preventDefault()
      // The ⚙️ tab and the shrunk bar are two different buttons, so the one arriving takes the focus
      // the one leaving had. Without this, the focus falls to the page and Tab starts again at the top.
      setFocusLauncher(inPanel)
      changeShrunk(!shrunk)
    }
    // Capture phase: a host editor that stops the key event would otherwise swallow the shortcut.
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [open, shrunk, shortcut, shrinkShortcut, changeOpen, changeShrunk, close])

  /**
   * The bar on the edge opens the panel, and closes it again on a second click. Either way the ⚙️ tab
   * stays shrunk, because that is the choice the developer made and a click on the bar does not undo it.
   */
  function pressBar() {
    if (open) close()
    else changeOpen(true)
  }

  function shrinkTab() {
    changeShrunk(true)
    setFocusLauncher(true)
  }

  function moveTo(next: Spot) {
    setSpot(next)
    writeSetting(SPOT_KEY, spotText(next))
  }

  /*
   * The panel opens beside the ⚙️ tab and lines up with it, so the eye goes straight from one to the
   * other. It is measured after the panel is in the page and before the browser paints it, because
   * only the panel knows how tall and wide it is, and the window can be smaller than the panel.
   */
  useLayoutEffect(() => {
    const pop = popRef.current
    if (!open || !pop) return
    const place = () => {
      const sideways = isSideEdge(spot.edge)
      const edgeLength = sideways ? innerHeight : innerWidth
      const panelSize = sideways ? pop.offsetHeight : pop.offsetWidth
      const centred = spot.at * edgeLength - panelSize / 2
      const at = Math.max(POP_MARGIN, Math.min(centred, edgeLength - panelSize - POP_MARGIN))
      pop.style.setProperty('--dm-pop-at', `${Math.round(at)}px`)
    }
    place()
    addEventListener('resize', place)
    // On a window 520 px wide or narrower the panel's width follows its content, so switching from
    // the rule list to the requests list changes it. Watching the panel itself catches that too.
    const sizes = new ResizeObserver(place)
    sizes.observe(pop)
    return () => {
      removeEventListener('resize', place)
      sizes.disconnect()
    }
  }, [open, spot])

  const endFlash = useCallback((field: FlashField) => {
    setFlashing((current) => {
      const next = new Set(current)
      next.delete(field)
      return next
    })
  }, [])
  const flash = useMemo(() => ({ flashing, end: endFlash }), [flashing, endFlash])

  function toggle() {
    if (open) close()
    else changeOpen(true)
  }

  /**
   * Moves to another tab and says where the keyboard lands. `focus.tab` puts it on the tab button,
   * which the arrow keys need; `focus.presets` puts it on the first preset card, which picking a
   * request needs. Both default to off, so every caller states its own target in one call and no
   * later call can quietly undo an earlier one.
   */
  function changeTab(next: Tab, focus: { tab?: boolean; presets?: boolean } = {}) {
    setTab(next)
    // Leaving the Active rules tab spends the key, so coming back does not steal focus from the tab.
    setFocusRule(null)
    writeSession('tab', next)
    setFocusPresets(Boolean(focus.presets))
    bodyRef.current?.scrollTo({ top: 0 })
    if (focus.tab) tabRefs.current[next]?.focus()
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

  /** Loads a rule into the form. The caller moves to the Rule tab, which holds the fields that edit it. */
  function startEdit(index: number) {
    setEditing(index)
    setPendingQuery('')
    updateForm(ruleToForm(rules[index]))
  }

  /** Pressing Edit in the Active rules list loads the rule and moves to the tab that can edit it. */
  function editFromList(index: number) {
    startEdit(index)
    changeTab('rule')
  }

  function reloadWith(text: string) {
    writeSession('notice', text)
    globalThis.location.reload()
  }

  function save() {
    if (problem) return
    const rule = formToRule(form)
    if (!errorController.addConfig(rule, editing === null ? undefined : rules[editing])) {
      setNote({ text: refusedSaveText(rule), warn: true })
      return
    }
    reloadWith(editing === null ? 'Rule saved. The page reloaded.' : 'Rule updated. The page reloaded.')
  }

  function remove(index: number) {
    if (!errorController.removeConfig(rules[index])) {
      // The toast, not `note`: `note` is drawn in the Rule tab's footer, and this button is on the
      // Active rules tab, so a `note` here would never reach the screen.
      setToast({ text: REFUSED_CHANGE_TEXT })
      return
    }
    reloadWith('Rule removed. The page reloaded.')
  }

  /**
   * Pauses one rule, or starts it answering again. The page reloads for the same reason every other
   * change here does: the app sends its requests once more, so the effect is on screen at once.
   */
  function togglePause(index: number) {
    const rule = rules[index]
    const next = !rule.paused
    if (!errorController.setRulePaused(rule, next)) {
      setToast({ text: REFUSED_CHANGE_TEXT })
      return
    }
    // The rule's own key, so focus lands on this row's button again and the developer can press
    // Enter twice to pause and resume without tabbing in from the top of the app each time.
    writeSession('focus', `${FOCUS_RULE}${ruleKey(rule)}`)
    reloadWith(next ? 'Rule paused. The page reloaded.' : 'Rule resumed. The page reloaded.')
  }

  function clearAll() {
    if (!errorController.clearAll()) {
      setToast({ text: REFUSED_CHANGE_TEXT })
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
    // A disabled or delay-only rule still matches, but the real server answered, so only a mocked request opens its rule.
    const index = request.tag !== 'mocked' ? NOT_FOUND : rules.findIndex((rule) => ruleKey(rule) === request.rule)
    if (index !== NOT_FOUND) {
      startEdit(index)
      setNote({ text: RULE_ANSWERED_TEXT, warn: false })
    } else {
      const picked = requestToForm(form, request, requestLog.body(request.id))
      setEditing(null)
      updateForm(picked.form)
      if (picked.note) setNote({ text: picked.note, warn: false })
      setPendingQuery(new URL(request.url).search)
    }
    changeTab('rule', { presets: true })
  }

  function onPopoverKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      close()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && tab === 'rule') {
      event.preventDefault()
      save()
    }
  }

  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = TABS.indexOf(tab)
    let next = current
    // Each arrow goes its own way and wraps round. With two tabs either arrow swapped them, so this
    // only started to matter once a third tab existed.
    if (event.key === 'ArrowRight') next = (current + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault()
    changeTab(TABS[next], { tab: true })
  }

  return (
    <div ref={rootRef} className="font-ui text-base text-ink">
      <Launcher
        buttonRef={fabRef}
        open={open}
        shrunk={shrunk}
        live={live}
        saved={saved}
        paused={paused}
        spot={spot}
        shortcutLabel={shortcut.label}
        shrinkLabel={shrinkShortcut.label}
        autoFocus={focusLauncher}
        onToggle={toggle}
        onOpen={pressBar}
        onSpotChange={moveTo}
      />

      {open && (
        <section
          ref={popRef}
          id="dm-pop"
          role="dialog"
          aria-labelledby="dm-title"
          onKeyDown={onPopoverKeyDown}
          onDragOver={preventFileDrop}
          onDrop={preventFileDrop}
          className={clsx(
            // Shrunk, the thing the panel lines up with is a 10 px bar, not a 36 px tab, so the panel
            // moves in to 20 px from the edge. Any further out and it floats away from what opened it.
            shrunk ? EDGE[spot.edge].popNear : EDGE[spot.edge].pop,
            // Do not put `overflow-hidden` alone here: a hidden box is still a scroll container, so
            // focusing a visually hidden radio makes the browser scroll the whole panel out of sight.
            // `overflow-clip` clips without scrolling; `overflow-hidden` stays as the fallback for
            // browsers that do not support clip, and Tailwind emits the clip rule after the hidden one.
            'fixed z-top flex h-pop w-pop animate-pop-in flex-col overflow-hidden overflow-clip rounded-pop border border-line bg-panel shadow-pop narrow:h-pop-narrow narrow:w-auto',
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
                      'bg-accent shadow-live': live > 0 && !paused,
                      'bg-amber': saved > 0 && (paused || live === 0),
                      'bg-faint': saved === 0,
                    })}
                  />
                  {status}
                </p>
              </div>
            </div>
            <div className="relative flex items-center gap-1">
              {(saved > 0 || paused) && (
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
                aria-label={`Move the dev mocks tab to the ${NEXT_EDGE[spot.edge]} edge of the screen`}
                title="Move ⚙️ to the next edge · drag it, or use the arrow keys, to slide it along one"
                onClick={() => moveTo({ edge: NEXT_EDGE[spot.edge], at: spot.at })}
                className={clsx(ICON_BTN, FOCUS, 'hover:text-ink')}
              >
                <MoveIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Shrink the dev mocks tab to a bar on the screen edge. Press ${shrinkShortcut.label} to bring it back.`}
                aria-keyshortcuts={shrinkShortcut.label}
                title={`Shrink to the edge · the bar still opens this panel · ${shrinkShortcut.label} brings the ⚙️ tab back`}
                onClick={shrinkTab}
                className={clsx(ICON_BTN, FOCUS, 'hover:text-ink')}
              >
                <ShrinkIcon className="h-4 w-4" />
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
                {/* The Rule tab holds one rule, so it has nothing to count. */}
                {name !== 'rule' && (
                  <span
                    className={clsx('rounded-full border bg-raised px-1.5 py-0.5 font-mono text-tiny font-semibold', {
                      'border-line-strong text-ink': tab === name,
                      'border-line text-dim': tab !== name,
                    })}
                  >
                    {name === 'active' ? saved : <RequestCount />}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div ref={bodyRef} className="dm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {tab === 'rule' && (
              <FlashContext.Provider value={flash}>
                <RuleTab
                  form={form}
                  onChange={updateForm}
                  rules={rules}
                  editing={editing}
                  onCancelEdit={resetForm}
                  pendingQuery={pendingQuery}
                  onPendingQueryChange={setPendingQuery}
                  focusPresets={focusPresets}
                  paused={paused}
                />
              </FlashContext.Provider>
            )}
            {tab === 'active' && (
              <ActiveRulesTab
                rules={rules}
                editing={editing}
                onEdit={editFromList}
                onRemove={remove}
                onTogglePause={togglePause}
                focusRule={focusRule}
                onClearAll={clearAll}
                paused={paused}
              />
            )}
            {tab === 'requests' && <RequestsTab onPick={pickRequest} onClear={requestLog.clear} />}
          </div>

          {tab === 'rule' && (
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
                // The Rule tab is the only one with a footer, so only there does the toast sit above it.
                'bottom-toast': tab === 'rule',
                'bottom-3.5': tab !== 'rule',
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
    </div>
  )
}

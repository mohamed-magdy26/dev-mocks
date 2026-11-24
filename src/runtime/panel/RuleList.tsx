import { clsx } from 'clsx'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { callCounts, compareSpecificity, ruleKey, type MockConfig } from '../controller.js'
import { FOCUS, ICON_BTN, LINK, NOTE } from './classes.js'
import { Empty } from './Empty.js'
import { describeRule, pathParts, plural, sequenceProgress } from './form.js'
import { EditIcon, PauseIcon, PlayIcon, TrashIcon } from './icons.js'

const CONFIRM_MS = 3000

interface RuleListProps {
  rules: MockConfig[]
  editing: number | null
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onTogglePause: (index: number) => void
  onClearAll: () => void
  focusRule: string | null
}

interface RuleRowProps {
  rule: MockConfig
  used: number
  editing: boolean
  onEdit: () => void
  onRemove: () => void
  onTogglePause: () => void
  takeFocus: boolean
}

function RuleRow(props: RuleRowProps) {
  const { rule, used, editing, onEdit, onRemove, onTogglePause, takeFocus } = props
  const view = describeRule(rule)
  const progress = sequenceProgress(rule, used)
  const path = rule.endpoints.join(', ')
  const { head, tail } = pathParts(path)
  // Two rules can share a path and differ only by method, so the method belongs in the label that
  // names them apart. Spoken as a phrase, because the badge's "ANY" reads as a value, not an absence.
  const name = `${view.method === 'ANY' ? 'any method on' : view.method} ${path}`
  return (
    <li
      className={clsx('grid grid-cols-rule items-center gap-2 rounded-field border py-2 pl-2.5 pr-1.5', {
        'border-accent shadow-ring-accent': editing,
        'border-line': !editing,
        // A paused rule sinks to the panel background and gets a dashed edge. Do not dim it with
        // `opacity`: that mixes every colour in the row with the background behind it, which pushed
        // the path and the amber line below the 4.5:1 contrast minimum. The row is still marked three
        // ways without colour: the dashed edge, the amber line in words, and the play icon.
        'border-dashed bg-panel': rule.paused,
        'bg-raised': !rule.paused,
      })}
    >
      <span
        className={clsx(
          `tone-${view.tone}`,
          'min-w-badge rounded-sm bg-tone-soft px-1.5 py-1 text-center font-mono text-tiny font-bold uppercase tracking-wide text-tone',
        )}
      >
        {view.badge}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <code title={name} className="flex min-w-0 items-baseline gap-1.5 font-mono text-sm font-medium">
          <span className="shrink-0 text-tiny font-bold tracking-wide text-faint">{view.method}</span>
          <span className="min-w-0 shrink-lots truncate text-faint">{head}</span>
          <span className="min-w-0 truncate">{tail}</span>
        </code>
        <span className="text-note text-faint">{view.meta}</span>
        {/* Its own line, so pausing a rule never hides what the rule would do when it answers again. */}
        {rule.paused && <span className="text-note text-amber">paused · the real server answers</span>}
        {/* No role="status": this changes on every request the rule answers, and a screen reader
            would read the whole running count out over whatever the user is doing. */}
        {progress && (
          <span className={clsx('text-note', progress.switched ? 'text-amber' : 'text-faint')}>{progress.text}</span>
        )}
      </span>
      <span className="flex gap-0.5">
        <button
          type="button"
          aria-label={
            rule.paused
              ? `Start the rule for ${name} answering again. This reloads the page.`
              : `Pause the rule for ${name}. This reloads the page.`
          }
          title={
            rule.paused
              ? 'Resume · this rule answers again · reloads the page'
              : 'Pause · the real server answers this one, the rule stays saved · reloads the page'
          }
          autoFocus={takeFocus}
          onClick={onTogglePause}
          className={clsx(ICON_BTN, FOCUS, rule.paused ? 'text-amber hover:text-ink' : 'hover:text-ink')}
        >
          {rule.paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
        </button>
        <button type="button" aria-label={`Edit rule for ${name}`} title="Edit" onClick={onEdit} className={clsx(ICON_BTN, FOCUS, 'hover:text-ink')}>
          <EditIcon className="h-4 w-4" />
        </button>
        <button type="button" aria-label={`Remove rule for ${name}`} title="Remove" onClick={onRemove} className={clsx(ICON_BTN, FOCUS, 'hover:text-red')}>
          <TrashIcon className="h-4 w-4" />
        </button>
      </span>
    </li>
  )
}

export function RuleList({ rules, editing, onEdit, onRemove, onTogglePause, onClearAll, focusRule }: RuleListProps) {
  const [armed, setArmed] = useState(false)
  // Subscribed once for the whole list, and the rows below read their own counts out of the store.
  // The value is a version number, not the counts: it only says that some count has moved.
  useSyncExternalStore(callCounts.subscribe, callCounts.getSnapshot)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [armed])

  // Reversed first, then sorted: `sort` keeps equal items in the order it found them, so rules that
  // are equally specific stay newest first, which is also how the matcher decides between them.
  // Held across renders because the subscription above re-renders this list on every mocked request,
  // and the order cannot have changed: saving, pausing or removing a rule reloads the page.
  const byPriority = useMemo(
    () =>
      rules
        .map((rule, index) => ({ rule, index }))
        .reverse()
        .sort((a, b) => compareSpecificity(a.rule, b.rule)),
    [rules],
  )

  return (
    <>
      {/* The tab above already names this list and counts it, so only the ordering needs saying. */}
      {rules.length > 1 && (
        <div className="flex justify-end">
          {/* No promise about which rule answers a given request: this list ranks a rule by its most
              specific path, while a request is answered by the rule whose matching path is the most
              specific, and the two differ for a rule that holds several paths. */}
          <span className={NOTE}>most specific first</span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {rules.length === 0 ? (
          <Empty
            title="No rules yet"
            text="Every request goes to the real server. Open the Rule tab to write one, or pick a request in the Requests tab."
          />
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {byPriority.map(({ rule, index }) => (
                <RuleRow
                  key={index}
                  rule={rule}
                  used={callCounts.used(rule)}
                  editing={index === editing}
                  onEdit={() => onEdit(index)}
                  onRemove={() => onRemove(index)}
                  onTogglePause={() => onTogglePause(index)}
                  takeFocus={ruleKey(rule) === focusRule}
                />
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={armed ? onClearAll : () => setArmed(true)}
                className={clsx(LINK, FOCUS, { 'text-red': armed, 'text-dim hover:text-ink': !armed })}
              >
                {armed ? `Click again to remove ${plural(rules.length, 'rule')}` : 'Remove all'}
              </button>
              <span role="status" className="sr-only">
                {armed ? 'Press again to remove every rule.' : ''}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  )
}

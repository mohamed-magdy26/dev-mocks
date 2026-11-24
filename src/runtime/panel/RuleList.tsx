import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import type { MockConfig } from '../controller.js'
import { FOCUS, ICON_BTN, LINK, NOTE } from './classes.js'
import { Empty } from './Empty.js'
import { describeRule, pathParts, plural } from './form.js'
import { EditIcon, TrashIcon } from './icons.js'

const CONFIRM_MS = 3000

interface RuleListProps {
  rules: MockConfig[]
  editing: number | null
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onClearAll: () => void
}

function RuleRow(props: { rule: MockConfig; editing: boolean; onEdit: () => void; onRemove: () => void }) {
  const { rule, editing, onEdit, onRemove } = props
  const view = describeRule(rule)
  const path = rule.endpoints.join(', ')
  const { head, tail } = pathParts(path)
  // Two rules can share a path and differ only by method, so the method belongs in the label that
  // names them apart. Spoken as a phrase, because the badge's "ANY" reads as a value, not an absence.
  const name = `${view.method === 'ANY' ? 'any method on' : view.method} ${path}`
  return (
    <li
      className={clsx('grid grid-cols-rule items-center gap-2.5 rounded-field border bg-raised py-2 pl-2.5 pr-1.5', {
        'border-accent shadow-ring-accent': editing,
        'border-line': !editing,
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
      </span>
      <span className="flex gap-0.5">
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

export function RuleList({ rules, editing, onEdit, onRemove, onClearAll }: RuleListProps) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [armed])

  const newestFirst = rules.map((rule, index) => ({ rule, index })).reverse()

  return (
    <>
      {/* The tab above already names this list and counts it, so only the ordering needs saying. */}
      {rules.length > 1 && (
        <div className="flex justify-end">
          <span className={NOTE}>newest first, the newest wins</span>
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
              {newestFirst.map(({ rule, index }) => (
                <RuleRow
                  key={index}
                  rule={rule}
                  editing={index === editing}
                  onEdit={() => onEdit(index)}
                  onRemove={() => onRemove(index)}
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

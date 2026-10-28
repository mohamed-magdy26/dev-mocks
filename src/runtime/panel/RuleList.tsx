import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import type { MockConfig } from '../controller.js'
import { FOCUS, ICON_BTN, LABEL, LINK, NOTE } from './classes.js'
import { Empty } from './Empty.js'
import { describeRule, pathParts, plural } from './form.js'
import { ChevronIcon, EditIcon, TrashIcon } from './icons.js'

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
        <code title={path} className="flex min-w-0 font-mono text-sm font-medium">
          <span className="min-w-0 shrink-lots truncate text-faint">{head}</span>
          <span className="min-w-0 truncate">{tail}</span>
        </code>
        <span className="text-note text-faint">{view.meta}</span>
      </span>
      <span className="flex gap-0.5">
        <button type="button" aria-label={`Edit rule for ${path}`} title="Edit" onClick={onEdit} className={clsx(ICON_BTN, FOCUS, 'hover:text-ink')}>
          <EditIcon className="h-4 w-4" />
        </button>
        <button type="button" aria-label={`Remove rule for ${path}`} title="Remove" onClick={onRemove} className={clsx(ICON_BTN, FOCUS, 'hover:text-red')}>
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
    <details open className="group border-t border-line pt-3.5">
      <summary className={clsx(FOCUS, 'flex cursor-pointer list-none items-center justify-between gap-2 rounded-xs')}>
        <span className={LABEL}>Active rules · {rules.length}</span>
        <span className="flex items-center gap-2">
          <span className={NOTE}>newest first, the newest wins</span>
          <ChevronIcon className="h-3.5 w-3.5 text-faint transition-transform duration-200 ease-dm group-open:rotate-180" />
        </span>
      </summary>
      <div className="mt-2.5 flex flex-col gap-2">
        {rules.length === 0 ? (
          <Empty
            title="No rules yet"
            text="Every request goes to the real server. Pick a request in the Requests tab, or type a path above."
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
    </details>
  )
}

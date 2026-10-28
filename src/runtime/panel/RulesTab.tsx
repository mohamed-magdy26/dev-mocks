import { clsx } from 'clsx'
import type { MockConfig } from '../controller.js'
import { FOCUS, LINK } from './classes.js'
import type { FormProps } from './Field.js'
import { Breakable } from './Highlight.js'
import { PathField } from './PathField.js'
import { Presets } from './Presets.js'
import { ResponseFields } from './ResponseFields.js'
import { RuleList } from './RuleList.js'

interface RulesTabProps extends FormProps {
  rules: MockConfig[]
  editing: number | null
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onClearAll: () => void
  onCancelEdit: () => void
  pendingQuery: string
  onPendingQueryChange: (query: string) => void
  focusPresets: boolean
}

export function RulesTab(props: RulesTabProps) {
  const { form, onChange, rules, editing } = props
  return (
    <div role="tabpanel" id="dm-panel-rules" aria-labelledby="dm-tab-rules" className="flex flex-col gap-5 px-4 pb-5 pt-3.5">
      {editing !== null && (
        <div className="flex items-center justify-between gap-2.5 rounded-field border border-accent-line bg-accent-soft py-2 pl-3 pr-2.5 text-body">
          <span className="min-w-0">
            Editing the rule for{' '}
            <code className="break-words font-mono text-accent">
              <Breakable text={rules[editing].endpoints.join(', ')} />
            </code>
          </span>
          <button
            type="button"
            onClick={props.onCancelEdit}
            className={clsx(LINK, FOCUS, 'shrink-0 whitespace-nowrap text-dim hover:text-ink')}
          >
            Cancel edit
          </button>
        </div>
      )}
      <PathField
        form={form}
        onChange={onChange}
        pendingQuery={props.pendingQuery}
        onPendingQueryChange={props.onPendingQueryChange}
      />
      <Presets form={form} onChange={onChange} autoFocus={props.focusPresets} />
      <ResponseFields form={form} onChange={onChange} />
      <RuleList rules={rules} editing={editing} onEdit={props.onEdit} onRemove={props.onRemove} onClearAll={props.onClearAll} />
    </div>
  )
}

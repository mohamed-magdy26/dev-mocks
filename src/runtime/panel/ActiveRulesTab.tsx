import type { MockConfig } from '../controller.js'
import { PausedNote } from './PausedNote.js'
import { RuleList } from './RuleList.js'

interface ActiveRulesTabProps {
  rules: MockConfig[]
  editing: number | null
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onClearAll: () => void
  paused: boolean
}

/** Every rule already saved. Pressing Edit on one opens it on the Rule tab. */
export function ActiveRulesTab(props: ActiveRulesTabProps) {
  return (
    <div role="tabpanel" id="dm-panel-active" aria-labelledby="dm-tab-active" className="flex flex-col gap-4 px-4 pb-5 pt-3.5">
      {props.paused && <PausedNote />}
      <RuleList
        rules={props.rules}
        editing={props.editing}
        onEdit={props.onEdit}
        onRemove={props.onRemove}
        onClearAll={props.onClearAll}
      />
    </div>
  )
}

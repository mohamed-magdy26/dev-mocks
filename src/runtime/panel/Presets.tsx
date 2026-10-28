import { clsx } from 'clsx'
import { FOCUS, HELP, LABEL, LABEL_ROW, NOTE } from './classes.js'
import { Field, type FormProps } from './Field.js'
import { applyPreset, isPresetActive, PRESETS } from './form.js'
import { Summary } from './Summary.js'

export function Presets({ form, onChange, autoFocus }: FormProps & { autoFocus: boolean }) {
  return (
    <Field name="kind">
      <div className={LABEL_ROW}>
        <span id="dm-presets-label" className={LABEL}>
          What should happen
        </span>
        <span className={NOTE}>one click fills the fields</span>
      </div>
      <div role="group" aria-labelledby="dm-presets-label" className="grid grid-cols-4 gap-1.5 narrow:grid-cols-2">
        {PRESETS.map((preset, index) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={isPresetActive(form, preset)}
            autoFocus={autoFocus && index === 0}
            onClick={() => onChange(applyPreset(form, preset))}
            className={clsx(
              `tone-${preset.tone}`,
              FOCUS,
              'flex min-w-0 flex-col items-start gap-1 rounded-field border border-line bg-gradient-to-b from-raised to-panel px-2.5 py-2 text-left text-body font-semibold leading-tight text-ink transition hover:-translate-y-px hover:border-tone aria-pressed:border-tone aria-pressed:bg-tone-soft aria-pressed:bg-none aria-pressed:shadow-ring-tone',
            )}
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-tone" />
              {preset.label}
            </span>
            <small className="text-xs font-medium text-faint">{preset.hint}</small>
          </button>
        ))}
      </div>
      <Summary form={form} />
      {form.kind === 'timeout' && <p className={HELP}>Never answers has no other settings.</p>}
    </Field>
  )
}

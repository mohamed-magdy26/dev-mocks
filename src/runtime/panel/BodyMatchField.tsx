import { clsx } from 'clsx'
import { FOCUS, GHOST, HELP, INPUT, LABEL, LABEL_ROW } from './classes.js'
import { Field, type FormProps } from './Field.js'
import { InfoTip, TipCase, TipCases, TipValue } from './InfoTip.js'

/**
 * Narrows a rule to the requests whose body carries one value, so `POST /api/orders` can fail only
 * for the order carrying an expired coupon while every other order reaches the real server.
 */
export function BodyMatchField({ form, onChange }: FormProps) {
  const on = form.bodyField !== '' || form.bodyValue !== ''
  const halfFilled = on && (!form.bodyField.trim() || !form.bodyValue.trim())
  // The two boxes are described only by the error line, which is the one message that must reach a
  // screen reader while typing. The rest of the explanation lives in the (i) button beside the label.
  const describedBy = clsx({ 'dm-body-error': halfFilled })

  return (
    <Field name="body">
      <div className={LABEL_ROW}>
        <div className="flex items-center gap-1.5">
          <span className={LABEL}>Match on the request body</span>
          <InfoTip label="Match on the request body">
            <p>Left empty, the rule answers every body. Filled in, it answers only the requests carrying that value,
            so one failing order does not break the rest.</p>
            <TipCases>
              <TipCase code="coupon is EXPIRED">
                Answers <TipValue>{'{"coupon": "EXPIRED"}'}</TipValue>, and leaves every other coupon alone.
              </TipCase>
              <TipCase code="user.role is admin">
                A dot reaches a field inside another: <TipValue>{'{"user": {"role": "admin"}}'}</TipValue>.
              </TipCase>
            </TipCases>
            <p>A body that is not JSON never matches. Spaces around the value are dropped.</p>
          </InfoTip>
        </div>
        {/*
          Kept mounted and turned inert with aria-disabled, never unmounted: pressing it empties both
          boxes, and a button that disappears under the keyboard's focus drops the user back to the
          top of the panel.
        */}
        <button
          type="button"
          aria-label="Clear the body match"
          aria-disabled={!on}
          onClick={() => {
            if (!on) return
            onChange({ ...form, bodyField: '', bodyValue: '' }, false)
          }}
          className={clsx(GHOST, FOCUS, { 'opacity-45': !on })}
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="dm-body-field" className={LABEL}>
            Field
          </label>
          {/* "Field" alone names nothing in a screen reader's forms list, which strips the heading above. */}
          <input
            id="dm-body-field"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="coupon"
            aria-label="Match on the request body: the field"
            aria-invalid={on && !form.bodyField.trim()}
            aria-describedby={describedBy}
            value={form.bodyField}
            onChange={(event) => onChange({ ...form, bodyField: event.target.value }, false)}
            className={clsx(INPUT, 'h-8 w-full')}
          />
        </div>
        <span className="pb-1.5 text-body text-dim">is</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="dm-body-value" className={LABEL}>
            Value
          </label>
          <input
            id="dm-body-value"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="EXPIRED"
            aria-label="Match on the request body: is this value"
            aria-invalid={on && !form.bodyValue.trim()}
            aria-describedby={describedBy}
            value={form.bodyValue}
            onChange={(event) => onChange({ ...form, bodyValue: event.target.value }, false)}
            className={clsx(INPUT, 'h-8 w-full')}
          />
        </div>
      </div>
      <p id="dm-body-error" role="alert" className={clsx(HELP, 'text-red')}>
        {halfFilled ? 'Fill in both the field and the value, or clear them both.' : ''}
      </p>
    </Field>
  )
}

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { CHIP, CHIP_RADIO, FOCUS, HELP, INPUT, LABEL, LABEL_ROW } from './classes.js'
import { Field, type FormProps } from './Field.js'
import { InfoTip, TipCase, TipCases } from './InfoTip.js'
import {
  checkJson,
  FIRST_CALLS_CHIPS,
  FIRST_CALLS_MAX_DIGITS,
  isNullBody,
  MIN_FIRST_CALLS,
  STATUS_CHIPS,
  STATUS_DIGITS,
  STATUS_MAX,
  STATUS_MIN,
  statusProblem,
  type LaterKind,
} from './form.js'

// A text field with inputMode="numeric" instead of type="number", so the mouse wheel never changes the value.
const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max)
const JSON_ROWS = 4

const LATER_LABELS: Record<LaterKind, string> = { response: 'A status code', real: 'The real server' }
const LATER_KINDS: LaterKind[] = ['response', 'real']

export function SequenceFields({ form, onChange }: FormProps) {
  const on = form.sequenceOn
  const json = useMemo(() => checkJson(form.laterJson), [form.laterJson])
  const statusError = statusProblem(form.laterStatus)
  const tooFew = on && Number(form.firstCalls) < MIN_FIRST_CALLS

  return (
    <Field name="sequence">
      {/* The (i) button sits beside the label, never inside it: a click anywhere in a label flips the
          switch, so a button placed in there would turn the sequence on while opening the explanation. */}
      <div className="flex items-center gap-1.5">
        <label className="relative inline-flex w-fit cursor-pointer select-none items-center gap-2 text-body text-dim">
          <input
            type="checkbox"
            className="dm-switch"
            checked={on}
            aria-expanded={on}
            onChange={(event) =>
              onChange(
                {
                  ...form,
                  sequenceOn: event.target.checked,
                  // A count the user already typed survives being switched off and back on. Only an
                  // empty or refused box falls back to the smallest count.
                  firstCalls:
                    Number(form.firstCalls) >= MIN_FIRST_CALLS ? form.firstCalls : String(MIN_FIRST_CALLS),
                },
                false,
              )
            }
          />
          <span aria-hidden="true" className="dm-switch-track" />
          Answer differently after the first calls
        </label>
        <InfoTip label="Answer differently after the first calls">
          <p>Off, the rule answers the same way every time. On, the answer changes once a number of calls have been
          made, which is how a retry gets tested.</p>
          <TipCases>
            <TipCase code="first 1 call">Gets the answer set above, such as 200 with your JSON.</TipCase>
            <TipCase code="every call after that">Gets what you set below, such as 500, or the real server.</TipCase>
          </TipCases>
          <p>The count starts again on every page reload.</p>
        </InfoTip>
      </div>

      {on && (
        <div className="flex flex-col gap-3 rounded-field border border-line bg-sunken px-3 py-2.5">
          <div className="flex flex-col gap-2">
            <label htmlFor="dm-first-calls" className={LABEL}>
              The answer above covers the first
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                id="dm-first-calls"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={tooFew}
                aria-describedby={clsx('dm-first-calls-help', { 'dm-first-calls-error': tooFew })}
                value={form.firstCalls}
                onChange={(event) =>
                  onChange({ ...form, firstCalls: digits(event.target.value, FIRST_CALLS_MAX_DIGITS) }, false)
                }
                className={clsx(INPUT, 'h-8 w-16 text-center')}
              />
              <span className="text-body text-dim">call(s)</span>
              <div role="group" aria-label="Call count shortcuts" className="flex flex-wrap gap-1.5">
                {FIRST_CALLS_CHIPS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={form.firstCalls === value}
                    onClick={() => onChange({ ...form, firstCalls: value }, false)}
                    className={clsx(CHIP, FOCUS)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <p id="dm-first-calls-help" className={HELP}>
              The count is kept only in this page. Reload, and the next call is a 1st call again.
            </p>
            {/*
              Kept mounted with empty text, never added on error: a role="alert" element that appears at
              the same moment as its text is announced unreliably, while one already in the page is not.
            */}
            <p id="dm-first-calls-error" role="alert" className={clsx(HELP, 'text-red')}>
              {tooFew ? `Type ${MIN_FIRST_CALLS} or more.` : ''}
            </p>
          </div>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={clsx(LABEL, 'mb-2 p-0')}>Every call after that gets</legend>
            <div className="flex flex-wrap gap-1.5">
              {LATER_KINDS.map((kind) => (
                <label key={kind} className={clsx(CHIP_RADIO, 'inline-flex cursor-pointer items-center')}>
                  <input
                    type="radio"
                    name="dm-later-kind"
                    className="sr-only"
                    checked={form.laterKind === kind}
                    onChange={() => onChange({ ...form, laterKind: kind }, false)}
                  />
                  {LATER_LABELS[kind]}
                </label>
              ))}
            </div>
          </fieldset>

          {form.laterKind === 'real' && (
            <p className={HELP}>The request goes to the real server, so the rule stops answering after the first calls.</p>
          )}

          {form.laterKind === 'response' && (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor="dm-later-status" className={LABEL}>
                  Status code
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    id="dm-later-status"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-invalid={Boolean(statusError)}
                    aria-describedby={clsx('dm-later-status-note', { 'dm-later-status-error': statusError })}
                    value={form.laterStatus}
                    onChange={(event) =>
                      onChange({ ...form, laterStatus: digits(event.target.value, STATUS_DIGITS) }, false)
                    }
                    className={clsx(INPUT, 'h-8 w-16 text-center')}
                  />
                  <div role="group" aria-label="Status code presets for the later calls" className="flex flex-wrap gap-1.5">
                    {STATUS_CHIPS.map((code) => (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={form.laterStatus === code}
                        onClick={() => onChange({ ...form, laterStatus: code }, false)}
                        className={clsx(CHIP, FOCUS)}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
                <p id="dm-later-status-note" className={HELP}>
                  {STATUS_MIN} to {STATUS_MAX}. The first calls keep the answer above.
                </p>
                <p id="dm-later-status-error" role="alert" className={clsx(HELP, 'text-red')}>
                  {statusError}
                </p>
              </div>

              {!isNullBody(form.laterStatus) && (
                <div className="flex flex-col gap-2">
                  <div className={LABEL_ROW}>
                    <label htmlFor="dm-later-json" className={LABEL}>
                      Response body
                    </label>
                    {/* The glyph has no reliable spoken name, and the words beside it already carry the meaning. */}
                    {json.state === 'bad' && (
                      <span className="text-note font-semibold text-red">
                        <span aria-hidden="true">✕ </span>invalid JSON
                      </span>
                    )}
                    {json.state === 'ok' && (
                      <span className="text-note font-semibold text-accent">
                        <span aria-hidden="true">✓ </span>valid JSON
                      </span>
                    )}
                  </div>
                  <textarea
                    id="dm-later-json"
                    rows={JSON_ROWS}
                    spellCheck={false}
                    aria-invalid={json.state === 'bad'}
                    aria-describedby="dm-later-json-error"
                    placeholder="Left empty, it sends the default body."
                    value={form.laterJson}
                    onChange={(event) => onChange({ ...form, laterJson: event.target.value }, false)}
                    className={clsx(INPUT, 'dm-scroll resize-y py-2 leading-normal')}
                  />
                  <p id="dm-later-json-error" role="alert" className={clsx(HELP, 'text-red')}>
                    {json.state === 'bad' ? `Invalid JSON: ${json.message}` : ''}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Field>
  )
}

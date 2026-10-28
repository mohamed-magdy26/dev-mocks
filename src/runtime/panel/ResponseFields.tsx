import { clsx } from 'clsx'
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { CHIP, FOCUS, GHOST, HELP, INPUT, LABEL, LABEL_ROW, MINI, NOTE } from './classes.js'
import { Field, type FormProps } from './Field.js'
import {
  checkJson,
  defaultBodyText,
  DELAY_CHIPS,
  DELAY_MAX_DIGITS,
  DELAY_ONLY_DEFAULT,
  EXAMPLE_LABELS,
  EXAMPLE_NAMES,
  EXAMPLES,
  formatMs,
  isNullBody,
  jsonFileProblem,
  loadedJson,
  MS_PER_SECOND,
  NO_DELAY,
  pretty,
  STATUS_CHIPS,
  STATUS_DIGITS,
  STATUS_MAX,
  STATUS_MIN,
  statusProblem,
} from './form.js'

// Text fields with inputMode="numeric" instead of type="number", so the mouse wheel never changes the value.
const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max)
const JSON_ROWS = 7
const JSON_BADGE = {
  ok: { icon: '✓', label: 'valid JSON', tone: 'text-accent' },
  bad: { icon: '✕', label: 'invalid JSON', tone: 'text-red' },
} as const

/** Reads a picked or dropped .json file and hands its JSON to `onLoad`. A file too big to store is refused unread. */
function useJsonFile(onLoad: (json: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [dragging, setDragging] = useState(false)

  async function read(file: File) {
    setStatus('')
    const problem = jsonFileProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    try {
      const text = await file.text()
      if (!text.trim()) {
        setError(`${file.name} is empty.`)
        return
      }
      const loaded = loadedJson(text)
      setError('')
      setStatus(loaded.valid ? `Loaded ${file.name}.` : `Loaded ${file.name}, but it is not valid JSON.`)
      onLoad(loaded.json)
    } catch (e) {
      setError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return {
    error,
    status,
    clearMessages: () => {
      setError('')
      setStatus('')
    },
    dragging,
    pick: () => inputRef.current?.click(),
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: '.json,application/json',
      tabIndex: -1,
      'aria-hidden': true,
      className: 'sr-only',
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        // Clearing the value lets the same file be picked again after an edit.
        event.target.value = ''
        if (file) void read(file)
      },
    },
    dropProps: {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        const to = event.relatedTarget
        if (!(to instanceof Node) || !event.currentTarget.contains(to)) setDragging(false)
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        // Text dragged into the textarea must keep the browser's own drop, which inserts the text.
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) void read(file)
      },
    },
  }
}

function DelayField({ form, onChange }: FormProps) {
  const delayOnly = form.kind === 'delay'
  const delay = Number(form.delay)
  return (
    <Field name="delay">
      <div className={LABEL_ROW}>
        <label htmlFor="dm-delay" className={LABEL}>
          {delayOnly ? 'Delay' : 'Delay before answering'}
        </label>
        <span id="dm-delay-note" className={NOTE}>
          {delayOnly ? `empty or 0 waits ${formatMs(DELAY_ONLY_DEFAULT)}` : 'empty answers at once'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Delay presets" className="flex flex-wrap gap-1.5">
          {DELAY_CHIPS.map((ms) => (
            <button
              key={ms}
              type="button"
              aria-pressed={form.delay === ms}
              onClick={() => onChange({ ...form, delay: form.delay === ms ? '' : ms }, false)}
              className={clsx(CHIP, FOCUS)}
            >
              {formatMs(Number(ms))}
            </button>
          ))}
        </div>
        <div className="relative flex w-delay items-center">
          <input
            id="dm-delay"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby="dm-delay-note"
            placeholder={delayOnly ? String(DELAY_ONLY_DEFAULT) : String(NO_DELAY)}
            value={form.delay}
            onChange={(event) => onChange({ ...form, delay: digits(event.target.value, DELAY_MAX_DIGITS) }, false)}
            className={clsx(INPUT, 'h-9 w-full pr-8 text-right')}
          />
          <span aria-hidden="true" className="pointer-events-none absolute right-2.5 font-mono text-xs text-faint">
            ms
          </span>
        </div>
        {delay >= MS_PER_SECOND && <span className="font-mono text-note text-dim">= {formatMs(delay)}</span>}
      </div>
    </Field>
  )
}

function StatusField({ form, onChange }: FormProps) {
  const issue = statusProblem(form.status)
  return (
    <Field name="status">
      <div className={LABEL_ROW}>
        <label htmlFor="dm-status" className={LABEL}>
          Status code
        </label>
        <span id="dm-status-note" className={NOTE}>
          {STATUS_MIN} to {STATUS_MAX}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="dm-status"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={STATUS_DIGITS}
          aria-invalid={Boolean(issue)}
          aria-describedby={clsx('dm-status-note', { 'dm-status-error': issue })}
          value={form.status}
          onChange={(event) => onChange({ ...form, status: digits(event.target.value, STATUS_DIGITS) }, false)}
          className={clsx(INPUT, 'h-9 w-status text-center')}
        />
        <div role="group" aria-label="Status code presets" className="flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={form.status === code}
              onClick={() => onChange({ ...form, status: code }, false)}
              className={clsx(CHIP, FOCUS)}
            >
              {code}
            </button>
          ))}
        </div>
      </div>
      {issue && (
        <p id="dm-status-error" className="m-0 text-sm text-red">
          {issue}
        </p>
      )}
    </Field>
  )
}

function JsonField({ form, onChange }: FormProps) {
  const [writing, setWriting] = useState(false)
  const [focusPlaceholder, setFocusPlaceholder] = useState(false)
  const file = useJsonFile((json) => onChange({ ...form, json }))
  const json = useMemo(() => checkJson(form.json), [form.json])
  const open = writing || form.json.trim() !== ''

  if (isNullBody(form.status)) {
    return (
      <Field name="json">
        <span className={LABEL}>Response JSON</span>
        <p className={HELP}>Status {form.status} has no body, so the response is empty.</p>
      </Field>
    )
  }

  return (
    <Field name="json">
      <div className={LABEL_ROW}>
        {open ? (
          <label htmlFor="dm-json" className={LABEL}>
            Response JSON
          </label>
        ) : (
          <span className={LABEL}>Response JSON</span>
        )}
        {json.state === 'empty' ? (
          <span className={NOTE}>or drop a .json file below</span>
        ) : (
          <span className={clsx('font-mono text-xs', JSON_BADGE[json.state].tone)}>
            <span aria-hidden="true">{JSON_BADGE[json.state].icon}</span> {JSON_BADGE[json.state].label}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-note text-faint">Fill with</span>
        {EXAMPLE_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              file.clearMessages()
              onChange({ ...form, json: pretty(EXAMPLES[name]) })
            }}
            className={clsx(MINI, FOCUS)}
          >
            {EXAMPLE_LABELS[name]}
          </button>
        ))}
        <button type="button" onClick={file.pick} className={clsx(MINI, FOCUS, 'ml-auto')}>
          Load .json file
        </button>
        <input {...file.inputProps} />
      </div>
      <div {...file.dropProps} className={clsx('rounded-field', { 'outline outline-2 outline-offset-2 outline-accent': file.dragging })}>
        {open ? (
          <div>
            <textarea
              id="dm-json"
              rows={JSON_ROWS}
              spellCheck={false}
              autoFocus={writing}
              aria-invalid={json.state === 'bad'}
              aria-describedby={json.state === 'bad' ? 'dm-json-error' : undefined}
              value={form.json}
              onChange={(event) => {
                file.clearMessages()
                onChange({ ...form, json: event.target.value }, false)
              }}
              className={clsx(INPUT, 'block min-h-json w-full resize-y py-2.5 leading-relaxed')}
            />
            <div className="mt-1.5 flex justify-end gap-1">
              <button
                type="button"
                disabled={json.state !== 'ok'}
                onClick={() => onChange({ ...form, json: pretty(JSON.parse(form.json)) }, false)}
                className={clsx(GHOST, FOCUS, 'disabled:cursor-not-allowed disabled:opacity-50')}
              >
                Format
              </button>
              <button
                type="button"
                onClick={() => {
                  file.clearMessages()
                  onChange({ ...form, json: '' }, false)
                  setWriting(false)
                  setFocusPlaceholder(true)
                }}
                className={clsx(GHOST, FOCUS)}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            autoFocus={focusPlaceholder}
            onClick={() => {
              setWriting(true)
              setFocusPlaceholder(false)
            }}
            className={clsx(
              FOCUS,
              'flex w-full flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 rounded-field border border-dashed border-line-strong px-3 py-2.5 text-left text-sm font-medium text-faint hover:border-faint hover:text-dim',
            )}
          >
            <span className="min-w-0 break-words">{defaultBodyText(form.status)}</span>
            <span className="font-semibold text-accent">Write my own JSON</span>
          </button>
        )}
      </div>
      {file.error && (
        <p role="alert" className="m-0 rounded-md bg-red-soft px-2 py-1.5 text-note text-red">
          {file.error}
        </p>
      )}
      <p role="status" className="sr-only">
        {file.status}
      </p>
      {json.state === 'bad' && (
        <p id="dm-json-error" className="m-0 rounded-md bg-red-soft px-2 py-1.5 font-mono text-note text-red">
          {json.message}
        </p>
      )}
    </Field>
  )
}

/** The fields the chosen card can use: Never answers has none, Delay only and Network down have only the delay. */
export function ResponseFields({ form, onChange }: FormProps) {
  return (
    <>
      {form.kind !== 'timeout' && <DelayField form={form} onChange={onChange} />}
      {form.kind === 'response' && <StatusField form={form} onChange={onChange} />}
      {form.kind === 'response' && <JsonField form={form} onChange={onChange} />}
    </>
  )
}

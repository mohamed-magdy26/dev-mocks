import { clsx } from 'clsx'
import { parseEndpoint, splitEndpoints } from '../controller.js'
import {
  bodyLabel,
  DEFAULT_BODY_LABEL,
  DELAY_ONLY_DEFAULT,
  formatMs,
  toneForStatus,
  type FormState,
  type Kind,
  type Tone,
} from './form.js'
import { Breakable } from './Highlight.js'

const WILDCARD = '/*'
const KIND_TONE: Record<Kind, Tone> = { response: 'red', delay: 'blue', network: 'red', timeout: 'grey' }

const Code = ({ text }: { text: string }) => (
  <code className="break-words font-mono text-ink">
    <Breakable text={text} />
  </code>
)

function Target({ form }: { form: FormState }) {
  const endpoints = splitEndpoints(form.path)
  if (endpoints.length === 0) return <>A matching request</>
  if (endpoints.length > 1) return <>A request that matches any of these {endpoints.length} paths</>
  const parsed = parseEndpoint(endpoints[0])
  const shown = parsed ? parsed.path : endpoints[0]
  if (shown.endsWith(WILDCARD)) {
    return (
      <>
        Any request under <Code text={shown.slice(0, -WILDCARD.length) || '/'} />
      </>
    )
  }
  return (
    <>
      A request whose path ends in <Code text={shown} />
      {form.full && parsed?.query && (
        <>
          {' '}
          and whose query is exactly <Code text={parsed.query} />
        </>
      )}
      {form.full && parsed && !parsed.query && ' and that has no query'}
    </>
  )
}

function Outcome({ form }: { form: FormState }) {
  const delay = Number(form.delay)
  const waits = delay ? `waits ${formatMs(delay)}, then ` : ''
  switch (form.kind) {
    case 'network':
      return (
        <>
          {waits}fails as if the server were down. The app sees <Code text="TypeError: Failed to fetch" />.
        </>
      )
    case 'timeout':
      return <>never gets an answer, so the app&apos;s own timeout decides what happens.</>
    case 'delay':
      return <>waits {formatMs(delay || DELAY_ONLY_DEFAULT)}, then the real server answers.</>
    case 'response': {
      if (!form.status) return <>answers with the status code you type below.</>
      const body = bodyLabel(form)
      return (
        <>
          {waits}answers with status <b className="font-mono text-tone">{form.status}</b> and{' '}
          {body === DEFAULT_BODY_LABEL ? 'the default body' : body}.
        </>
      )
    }
  }
}

/** One plain sentence that says what the rule will do, so nobody has to guess what the fields mean together. */
export function Summary({ form }: { form: FormState }) {
  const tone = form.kind === 'response' ? toneForStatus(Number(form.status), true) : KIND_TONE[form.kind]
  return (
    <p
      className={clsx(
        `tone-${tone}`,
        'm-0 rounded-field border border-l-2 border-line border-l-tone bg-sunken px-3 py-2.5 text-body leading-relaxed text-dim',
      )}
    >
      <Target form={form} /> <Outcome form={form} />
    </p>
  )
}

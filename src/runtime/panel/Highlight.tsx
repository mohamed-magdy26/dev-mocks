import { Fragment } from 'react'

/** Lets a long URL wrap after "/", "?" and "&" instead of in the middle of a word. */
export function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=[/?&])/)
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  )
}

/** Wraps every case-insensitive match of `query` in <mark>. */
export function Highlight({ text, query, breakable = false }: { text: string; query: string; breakable?: boolean }) {
  const pieces: { text: string; match: boolean }[] = []
  const needle = query.toLowerCase()
  if (needle) {
    const lower = text.toLowerCase()
    let from = 0
    let at = lower.indexOf(needle)
    while (at !== -1) {
      pieces.push({ text: text.slice(from, at), match: false }, { text: text.slice(at, at + needle.length), match: true })
      from = at + needle.length
      at = lower.indexOf(needle, from)
    }
    pieces.push({ text: text.slice(from), match: false })
  } else {
    pieces.push({ text, match: false })
  }
  return (
    <>
      {pieces.map((piece, index) => {
        const content = breakable ? <Breakable text={piece.text} /> : piece.text
        return piece.match ? <mark key={index}>{content}</mark> : <Fragment key={index}>{content}</Fragment>
      })}
    </>
  )
}

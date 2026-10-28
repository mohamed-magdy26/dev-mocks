import { clsx } from 'clsx'
import { createContext, useContext, type ReactNode } from 'react'
import type { FlashField, FormState } from './form.js'

export interface FormProps {
  form: FormState
  onChange: (next: FormState, flash?: boolean) => void
}

export const FlashContext = createContext<{ flashing: ReadonlySet<FlashField>; end: (field: FlashField) => void }>({
  flashing: new Set(),
  end: () => {},
})

/** One form block. It flashes green once when a preset or a picked request changes its value. */
export function Field({ name, children }: { name: FlashField; children: ReactNode }) {
  const { flashing, end } = useContext(FlashContext)
  return (
    <div
      className={clsx('flex min-w-0 flex-col gap-2 rounded-xl', { 'animate-flash': flashing.has(name) })}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) end(name)
      }}
    >
      {children}
    </div>
  )
}

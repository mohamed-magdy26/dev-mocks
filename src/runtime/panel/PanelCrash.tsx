import { clsx } from 'clsx'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { FOCUS, HELP, PRIMARY } from './classes.js'

/** Shown in place of the message when the thrown error carries none, so the box is never blank. */
const NO_MESSAGE = 'The error carried no message.'

interface State {
  /** Its own field, never `message !== ''`: an Error thrown with no message would otherwise read as healthy, and the same child would throw again. */
  crashed: boolean
  message: string
}

/**
 * Shows the error instead of a blank panel when something inside it throws while rendering.
 * Without this, React unmounts the whole panel, the ⚙️ tab stops working, and the page keeps
 * no sign of what failed, so a crash can only be reported as "the panel disappeared".
 */
export class PanelCrash extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error)
    return { crashed: true, message: message || NO_MESSAGE }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[dev-mocks] The panel crashed while rendering.', error, info.componentStack)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div
        role="alert"
        className="fixed bottom-4 right-4 z-top flex w-80 flex-col gap-3 rounded-xl border border-red bg-panel p-4 font-ui text-body text-ink shadow-pop"
      >
        <strong className="font-semibold text-red">The dev mocks panel crashed.</strong>
        <code className="dm-scroll max-h-menu overflow-auto break-words rounded-field bg-sunken p-2 font-mono text-sm text-dim">
          {this.state.message}
        </code>
        <p className={HELP}>The full error and the component stack are in the browser console.</p>
        <button type="button" onClick={() => globalThis.location.reload()} className={clsx(PRIMARY, FOCUS)}>
          Reload the page
        </button>
      </div>
    )
  }
}

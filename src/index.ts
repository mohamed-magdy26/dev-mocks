export interface StartDevMocksOptions {
  /** Pass `false` to keep mocks off without removing the call. */
  enabled?: boolean
  /** Where the dev server serves the MSW worker file. Set it when the app runs under a base path, for example `/checkout/mockServiceWorker.js`. */
  serviceWorkerUrl?: string
  /** Hides and shows the ⚙️ button. Ctrl, Alt, Shift or Meta joined by "+" to one letter, digit or F1 to F12, with at least Ctrl, Alt or Meta. Default "Alt+Shift+D". */
  shortcut?: string
}

/** Starts MSW and mounts the ⚙️ panel in development. Resolves immediately in any other mode. */
export function startDevMocks(options: StartDevMocksOptions = {}): Promise<void> {
  if (process.env.NODE_ENV === 'development' && options.enabled !== false) {
    // Do not let this promise reject: the host renders its app inside `.then()`, so a rejection leaves a blank page.
    return import('./runtime/start.js')
      .then((runtime) => runtime.start(options))
      .catch((error: unknown) => {
        console.error(
          '[dev-mocks] Mocks are off because MSW failed to start. Run `npx dev-mocks init` at the repo root, then reload.',
          error,
        )
      })
  }
  return Promise.resolve()
}

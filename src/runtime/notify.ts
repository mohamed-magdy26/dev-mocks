/**
 * Calls every listener, each inside its own try. Both stores in this runtime are written to while a
 * request is being answered, so a listener that threw would fail that request, and a broken panel
 * would become a broken app. The error is reported and the listeners after it still run.
 *
 * `what` names the store in the message, because the two stores look alike in a stack trace.
 */
export function notify(listeners: Set<() => void>, what: string) {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error(`[dev-mocks] a ${what} listener threw`, error)
    }
  }
}

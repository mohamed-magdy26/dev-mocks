const PREFIX = 'dev-mocks:'

export function readSession(key: string): string {
  try {
    return sessionStorage.getItem(PREFIX + key) ?? ''
  } catch {
    return ''
  }
}

export function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(PREFIX + key, value)
  } catch (e) {
    console.warn('Failed to save panel state', e)
  }
}

export function takeSession(key: string): string {
  const value = readSession(key)
  if (value) writeSession(key, '')
  return value
}

// Single access point to the preload bridge so the UI can be swapped freely later.
export const api = window.launcher

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // Strip Electron's "Error invoking remote method 'x': Error: " prefix.
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

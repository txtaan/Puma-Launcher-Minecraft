import type { MessageKey } from '@shared/i18n'

// A host name (letters, digits and hyphens between dots) or an IPv4 address, as Minecraft's "Direct connection" takes it.
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i

/**
 * What's wrong with a server address the player typed (`host` or `host:port`, port 1–65535), as a message key;
 * undefined when it's fine. An empty address is only wrong when `required`.
 */
export function serverAddressError(address: string, required = false): MessageKey | undefined {
  const value = address.trim()
  if (!value) return required ? 'server.required' : undefined
  const colon = value.lastIndexOf(':')
  const host = colon < 0 ? value : value.slice(0, colon)
  const port = colon < 0 ? undefined : value.slice(colon + 1)
  // "https://…" or "a:b:c" aren't a host with a port, so they get the general hint rather than the port one.
  if (!HOST.test(host) || (port !== undefined && !/^\d*$/.test(port))) return 'server.invalid'
  if (port !== undefined && !(Number(port) >= 1 && Number(port) <= 65535)) return 'server.port'
  return undefined
}

// First labels that say "this is a Minecraft server" rather than which one: play.example.net is "Example".
const GENERIC_LABELS = new Set(['play', 'mc', 'minecraft', 'server', 'join', 'www'])

/** A short name for an instance made for a server: "name.aternos.me" → "Name". IP addresses stay as they are. */
export function serverInstanceName(address: string): string {
  const host = address.trim().replace(/:\d*$/, '')
  if (/^\d+(\.\d+){3}$/.test(host)) return host
  const labels = host.split('.')
  // Skip a generic first label only when the next one isn't the domain ending (play.net stays "Play").
  const label = labels.length > 2 && GENERIC_LABELS.has(labels[0].toLowerCase()) ? labels[1] : labels[0]
  return label ? label[0].toUpperCase() + label.slice(1) : host
}

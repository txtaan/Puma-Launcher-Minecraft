import { release } from 'node:os'

/** OS name as used in Mojang's version JSON rules. */
export function mojangOs(): 'windows' | 'osx' | 'linux' {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

export function mojangArch(): string {
  return process.arch === 'ia32' ? 'x86' : process.arch
}

/** Platform key used by Mojang's Java runtime manifest. */
export function javaRuntimePlatform(): string {
  const arm = process.arch === 'arm64'
  switch (process.platform) {
    case 'win32':
      return arm ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64'
    case 'darwin':
      return arm ? 'mac-os-arm64' : 'mac-os'
    default:
      // Mojang ships no Linux ARM builds; this key matches nothing, so Temurin is used instead.
      if (process.arch === 'arm64' || process.arch === 'arm') return `linux-${process.arch}`
      return process.arch === 'ia32' ? 'linux-i386' : 'linux'
  }
}

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; version?: string; arch?: string; versionRange?: { min?: string; max?: string } }
  features?: Record<string, boolean>
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

function osMatches(os: NonNullable<Rule['os']>): boolean {
  if (os.name && os.name !== mojangOs()) return false
  if (os.arch && os.arch !== mojangArch()) return false
  if (os.version && !new RegExp(os.version).test(release())) return false
  if (os.versionRange) {
    if (os.versionRange.min && compareVersion(release(), os.versionRange.min) < 0) return false
    if (os.versionRange.max && compareVersion(release(), os.versionRange.max) >= 0) return false
  }
  return true
}

/** Evaluate a Mojang rule list. No rules = allowed. Last matching rule wins. */
export function rulesAllow(rules: Rule[] | undefined, features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    let matches = true
    if (rule.os && !osMatches(rule.os)) matches = false
    if (rule.features) {
      for (const [k, v] of Object.entries(rule.features)) if ((features[k] ?? false) !== v) matches = false
    }
    if (matches) allowed = rule.action === 'allow'
  }
  return allowed
}

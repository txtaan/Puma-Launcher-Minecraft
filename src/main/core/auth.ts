import { safeStorage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Account, DeviceCodePrompt, PublicAccount } from '@shared/types'
import { downloadAll, fetchJson, USER_AGENT } from './http'
import { paths } from './paths'
import { tr } from './i18n'

interface StoredAccount extends Account {
  msRefreshToken?: string
}

// ---------------------------------------------------------------------------
// Storage (encrypted with the OS keychain when available)
// ---------------------------------------------------------------------------

let accounts: StoredAccount[] | undefined

async function load(): Promise<StoredAccount[]> {
  if (accounts) return accounts
  try {
    const raw = await readFile(paths.accounts())
    const encrypted = raw.subarray(0, 4).toString() === 'enc:'
    const text = encrypted ? (await safeStorage.decryptStringAsync(raw.subarray(4))).result : raw.toString('utf8')
    accounts = JSON.parse(text) as StoredAccount[]
  } catch {
    accounts = []
  }
  return accounts
}

async function save(): Promise<void> {
  const text = JSON.stringify(accounts ?? [])
  await mkdir(dirname(paths.accounts()), { recursive: true })
  const data = (await safeStorage.isAsyncEncryptionAvailable())
    ? Buffer.concat([Buffer.from('enc:'), await safeStorage.encryptStringAsync(text)])
    : Buffer.from(text)
  await writeFile(paths.accounts(), data)
}

export function toPublic(a: Account): PublicAccount {
  return { id: a.id, type: a.type, username: a.username, uuid: a.uuid, serverName: a.serverName }
}

export async function listAccounts(): Promise<PublicAccount[]> {
  return (await load()).map(toPublic)
}

export async function removeAccount(id: string): Promise<void> {
  accounts = (await load()).filter((a) => a.id !== id)
  await save()
}

async function upsert(account: StoredAccount): Promise<PublicAccount> {
  const list = await load()
  const existing = list.findIndex(
    (a) => a.type === account.type && a.uuid === account.uuid && a.authServer === account.authServer
  )
  if (existing >= 0) {
    account.id = list[existing].id
    list[existing] = account
  } else list.push(account)
  await save()
  return toPublic(account)
}

// ---------------------------------------------------------------------------
// Offline accounts
// ---------------------------------------------------------------------------

/** Same UUID the vanilla server derives for offline players: UUID.nameUUIDFromBytes("OfflinePlayer:" + name). */
export function offlineUuid(name: string): string {
  const md5 = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  md5[6] = (md5[6] & 0x0f) | 0x30
  md5[8] = (md5[8] & 0x3f) | 0x80
  return md5.toString('hex')
}

export async function addOfflineAccount(username: string): Promise<PublicAccount> {
  const name = username.trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error(tr('error.username'))
  }
  return upsert({ id: randomUUID(), type: 'offline', username: name, uuid: offlineUuid(name), accessToken: '0' })
}

// ---------------------------------------------------------------------------
// Microsoft accounts: device code flow -> Xbox Live -> XSTS -> Minecraft services
// ---------------------------------------------------------------------------

const MS_AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE = 'XboxLive.signin offline_access'

let loginAbort: AbortController | undefined

async function postForm<T>(url: string, body: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams(body),
    signal
  })
  const json = (await res.json()) as T
  if (!res.ok && !(json as { error?: string }).error) throw new Error(tr('error.httpFrom', { status: res.status, url }))
  return json
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    const xerr = /"XErr":\s*(\d+)/.exec(text)?.[1]
    if (xerr === '2148916233') throw new Error(tr('error.noXbox'))
    if (xerr === '2148916238') throw new Error(tr('error.childAccount'))
    if (xerr === '2148916235') throw new Error(tr('error.xboxCountry'))
    throw new Error(`${tr('error.httpFrom', { status: res.status, url })}: ${text}`)
  }
  return (await res.json()) as T
}

interface MsToken {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function minecraftFromMsToken(msAccessToken: string): Promise<Omit<StoredAccount, 'id' | 'msRefreshToken'>> {
  const xbl = await postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }
  )
  const xsts = await postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://xsts.auth.xboxlive.com/xsts/authorize',
    {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    }
  )
  const uhs = xsts.DisplayClaims.xui[0].uhs
  const mc = await postJson<{ access_token: string; expires_in: number }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` }
  )
  const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}`, 'User-Agent': USER_AGENT }
  })
  if (profileRes.status === 404) throw new Error(tr('error.noMinecraft'))
  if (!profileRes.ok) throw new Error(tr('error.profile', { status: profileRes.status }))
  const profile = (await profileRes.json()) as { id: string; name: string }

  let xuid: string | undefined
  try {
    xuid = JSON.parse(Buffer.from(mc.access_token.split('.')[1], 'base64url').toString()).xuid
  } catch {
    xuid = undefined
  }
  return {
    type: 'microsoft',
    username: profile.name,
    uuid: profile.id,
    accessToken: mc.access_token,
    xuid,
    expiresAt: Date.now() + (mc.expires_in - 300) * 1000
  }
}

/**
 * Start Microsoft login. `onPrompt` receives the code the user has to enter at microsoft.com/link;
 * the promise resolves once the user has completed the sign-in in their browser.
 */
export async function loginMicrosoft(
  clientId: string,
  onPrompt: (prompt: DeviceCodePrompt) => void
): Promise<PublicAccount> {
  if (!clientId) {
    throw new Error(tr('error.needClientId'))
  }
  loginAbort?.abort()
  const abort = (loginAbort = new AbortController())

  const code = await postForm<{
    device_code: string
    user_code: string
    verification_uri: string
    interval: number
    expires_in: number
    message: string
    error?: string
    error_description?: string
  }>(`${MS_AUTHORITY}/devicecode`, { client_id: clientId, scope: SCOPE }, abort.signal)
  if (code.error) throw new Error(code.error_description ?? code.error)
  onPrompt({ userCode: code.user_code, verificationUri: code.verification_uri, message: code.message })

  let interval = code.interval * 1000
  const deadline = Date.now() + code.expires_in * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval))
    if (abort.signal.aborted) throw new Error(tr('error.loginCancelled'))
    const token = await postForm<MsToken>(
      `${MS_AUTHORITY}/token`,
      { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: code.device_code },
      abort.signal
    )
    if (token.error === 'authorization_pending') continue
    if (token.error === 'slow_down') {
      interval += 5000
      continue
    }
    if (token.error || !token.access_token) throw new Error(token.error_description ?? token.error ?? tr('error.loginFailed'))
    const mc = await minecraftFromMsToken(token.access_token)
    return upsert({ id: randomUUID(), ...mc, msRefreshToken: token.refresh_token })
  }
  throw new Error(tr('error.codeExpired'))
}

export function cancelLogin(): void {
  loginAbort?.abort()
}

/** Return a launch-ready account, refreshing Microsoft tokens if they expired. */
export async function getLaunchAccount(id: string, clientId: string): Promise<Account> {
  const list = await load()
  const account = list.find((a) => a.id === id)
  if (!account) throw new Error(tr('error.accountNotFound'))
  if (account.type === 'authlib') return refreshAuthlib(account)
  if (account.type !== 'microsoft' || (account.expiresAt ?? 0) > Date.now()) return account
  if (!account.msRefreshToken || !clientId) throw new Error(tr('error.msExpired'))

  const token = await postForm<MsToken>(`${MS_AUTHORITY}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: account.msRefreshToken,
    scope: SCOPE
  })
  if (token.error || !token.access_token) throw new Error(tr('error.msExpired'))
  const mc = await minecraftFromMsToken(token.access_token)
  Object.assign(account, mc, { msRefreshToken: token.refresh_token ?? account.msRefreshToken })
  await save()
  return account
}

// ---------------------------------------------------------------------------
// authlib-injector accounts (Ely.by, LittleSkin, any Yggdrasil server) — as in HMCL,
// ElyPrismLauncher and FjordLauncher. Logs in with the Yggdrasil protocol and launches the
// game with the authlib-injector Java agent pointed at that server.
// ---------------------------------------------------------------------------

export const AUTH_SERVER_PRESETS = {
  'Ely.by': 'https://authserver.ely.by/api/authlib-injector',
  LittleSkin: 'https://littleskin.cn/api/yggdrasil'
}

/** Resolve a server URL to its API root, following the API Location Indication header. */
async function resolveAuthServer(url: string): Promise<{ api: string; name: string }> {
  let api = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  const first = await fetch(api, { headers: { 'User-Agent': USER_AGENT } })
  const location = first.headers.get('x-authlib-injector-api-location')
  if (location) api = new URL(location, api).toString()
  api = api.replace(/\/$/, '')
  const meta = (await (await fetch(api, { headers: { 'User-Agent': USER_AGENT } })).json().catch(() => null)) as {
    meta?: { serverName?: string }
  } | null
  if (!meta?.meta) throw new Error(tr('error.notAuthlib'))
  return { api, name: meta.meta.serverName ?? new URL(api).hostname }
}

async function yggdrasil<T>(api: string, path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${api}/authserver/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  const data = (text ? JSON.parse(text) : {}) as T & { errorMessage?: string; error?: string }
  if (!res.ok && res.status !== 204) throw new Error(data.errorMessage ?? data.error ?? `HTTP ${res.status}`)
  return { status: res.status, data }
}

interface YggdrasilSession {
  accessToken: string
  clientToken: string
  selectedProfile?: { id: string; name: string }
  availableProfiles?: { id: string; name: string }[]
}

export async function addAuthlibAccount(server: string, username: string, password: string): Promise<PublicAccount> {
  const { api, name } = await resolveAuthServer(server)
  const clientToken = randomUUID().replace(/-/g, '')
  const { data } = await yggdrasil<YggdrasilSession>(api, 'authenticate', {
    agent: { name: 'Minecraft', version: 1 },
    username,
    password,
    clientToken,
    requestUser: true
  })
  const profile = data.selectedProfile ?? data.availableProfiles?.[0]
  if (!profile) throw new Error(tr('error.noCharacter', { server: name }))
  return upsert({
    id: randomUUID(),
    type: 'authlib',
    username: profile.name,
    uuid: profile.id,
    accessToken: data.accessToken,
    clientToken: data.clientToken ?? clientToken,
    authServer: api,
    serverName: name
  })
}

async function refreshAuthlib(account: StoredAccount): Promise<Account> {
  const api = account.authServer!
  const { status } = await yggdrasil(api, 'validate', { accessToken: account.accessToken, clientToken: account.clientToken }).catch(
    () => ({ status: 403 })
  )
  if (status === 204) return account
  try {
    const { data } = await yggdrasil<YggdrasilSession>(api, 'refresh', {
      accessToken: account.accessToken,
      clientToken: account.clientToken,
      requestUser: true
    })
    account.accessToken = data.accessToken
    if (data.selectedProfile) Object.assign(account, { uuid: data.selectedProfile.id, username: data.selectedProfile.name })
    await save()
    return account
  } catch {
    throw new Error(tr('error.serverExpired', { server: account.serverName ?? tr('error.authServer') }))
  }
}

/** Download authlib-injector (verified by sha256) and build its JVM arguments for a server. */
export async function authlibAgentArgs(api: string): Promise<string[]> {
  const latest = await fetchJson<{ version: string; download_url: string; checksums: { sha256: string } }>(
    'https://authlib-injector.yushi.moe/artifact/latest.json'
  ).catch(() => null)
  const dir = join(paths.libraries(), 'moe', 'yushi', 'authlib-injector')
  let jar: string
  if (latest) {
    jar = join(dir, latest.version, `authlib-injector-${latest.version}.jar`)
    await downloadAll([{ url: latest.download_url, dest: jar, sha256: latest.checksums.sha256 }], 1, () => undefined)
  } else {
    // Offline: use whatever version we downloaded before.
    const versions = existsSync(dir) ? (await readdir(dir)).sort() : []
    if (!versions.length) throw new Error(tr('error.authlibDownload'))
    const v = versions[versions.length - 1]
    jar = join(dir, v, `authlib-injector-${v}.jar`)
  }
  const meta = await fetch(api, { headers: { 'User-Agent': USER_AGENT } })
    .then((r) => r.text())
    .catch(() => '')
  return [`-javaagent:${jar}=${api}`, ...(meta ? [`-Dauthlibinjector.yggdrasil.prefetched=${Buffer.from(meta).toString('base64')}`] : [])]
}

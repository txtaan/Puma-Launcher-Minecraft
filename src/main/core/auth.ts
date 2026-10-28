import { safeStorage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Account, DeviceCodePrompt, PublicAccount } from '@shared/types'
import { USER_AGENT } from './http'
import { paths } from './paths'

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
    const text = raw.subarray(0, 4).toString() === 'enc:'
      ? safeStorage.decryptString(raw.subarray(4))
      : raw.toString('utf8')
    accounts = JSON.parse(text) as StoredAccount[]
  } catch {
    accounts = []
  }
  return accounts
}

async function save(): Promise<void> {
  const text = JSON.stringify(accounts ?? [])
  await mkdir(dirname(paths.accounts()), { recursive: true })
  const data = safeStorage.isEncryptionAvailable()
    ? Buffer.concat([Buffer.from('enc:'), safeStorage.encryptString(text)])
    : Buffer.from(text)
  await writeFile(paths.accounts(), data)
}

export function toPublic(a: Account): PublicAccount {
  return { id: a.id, type: a.type, username: a.username, uuid: a.uuid }
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
  const existing = list.findIndex((a) => a.type === account.type && a.uuid === account.uuid)
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
    throw new Error('Username must be 3-16 characters: letters, numbers and underscores only.')
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
  if (!res.ok && !(json as { error?: string }).error) throw new Error(`HTTP ${res.status} from ${url}`)
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
    if (xerr === '2148916233') throw new Error('This Microsoft account has no Xbox profile. Sign in at xbox.com first.')
    if (xerr === '2148916238') throw new Error('Child accounts must be added to a Microsoft Family by an adult.')
    if (xerr === '2148916235') throw new Error('Xbox Live is not available in your country.')
    throw new Error(`HTTP ${res.status} from ${url}: ${text}`)
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
  if (profileRes.status === 404) throw new Error('This Microsoft account does not own Minecraft: Java Edition.')
  if (!profileRes.ok) throw new Error(`Could not load Minecraft profile (HTTP ${profileRes.status})`)
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
    throw new Error('Microsoft login needs an Azure application (client) ID. Add one in Settings → Accounts.')
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
    if (abort.signal.aborted) throw new Error('Login cancelled')
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
    if (token.error || !token.access_token) throw new Error(token.error_description ?? token.error ?? 'Login failed')
    const mc = await minecraftFromMsToken(token.access_token)
    return upsert({ id: randomUUID(), ...mc, msRefreshToken: token.refresh_token })
  }
  throw new Error('The login code expired. Please try again.')
}

export function cancelLogin(): void {
  loginAbort?.abort()
}

/** Return a launch-ready account, refreshing Microsoft tokens if they expired. */
export async function getLaunchAccount(id: string, clientId: string): Promise<Account> {
  const list = await load()
  const account = list.find((a) => a.id === id)
  if (!account) throw new Error('Account not found. Please sign in again.')
  if (account.type !== 'microsoft' || (account.expiresAt ?? 0) > Date.now()) return account
  if (!account.msRefreshToken || !clientId) throw new Error('Your Microsoft session expired. Please sign in again.')

  const token = await postForm<MsToken>(`${MS_AUTHORITY}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: account.msRefreshToken,
    scope: SCOPE
  })
  if (token.error || !token.access_token) throw new Error('Your Microsoft session expired. Please sign in again.')
  const mc = await minecraftFromMsToken(token.access_token)
  Object.assign(account, mc, { msRefreshToken: token.refresh_token ?? account.msRefreshToken })
  await save()
  return account
}

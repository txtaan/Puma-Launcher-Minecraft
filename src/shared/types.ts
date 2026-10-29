// Types shared between the main process, preload bridge and renderer.
import type { LanguagePreference } from './i18n'

export type VersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

export interface VersionSummary {
  id: string
  type: VersionType
  url: string
  sha1: string
  releaseTime: string
  installed: boolean
}

export interface VersionList {
  latest: { release: string; snapshot: string }
  versions: VersionSummary[]
  fetchedAt: number
}

/** "authlib" = third-party Yggdrasil servers (Ely.by, LittleSkin, ...) through authlib-injector. */
export type AccountType = 'microsoft' | 'offline' | 'authlib'

export interface Account {
  id: string
  type: AccountType
  username: string
  uuid: string
  /** Minecraft access token. "0" for offline accounts. */
  accessToken: string
  xuid?: string
  /** Epoch ms after which accessToken must be refreshed. */
  expiresAt?: number
  /** authlib-injector API root, for "authlib" accounts. */
  authServer?: string
  serverName?: string
  clientToken?: string
}

/** Account data safe to hand to the renderer (no tokens). */
export interface PublicAccount {
  id: string
  type: AccountType
  username: string
  uuid: string
  serverName?: string
}

export interface DeviceCodePrompt {
  userCode: string
  verificationUri: string
  message: string
}

export interface JavaInstall {
  path: string
  version: string
  majorVersion: number
  arch: string
  /** "managed" = downloaded by this launcher from Mojang, "system" = found on this PC. */
  source: 'managed' | 'system' | 'custom'
}

export interface JavaRuntimeOption {
  /** Mojang component name (e.g. "java-runtime-delta") or "adoptium-<major>". */
  component: string
  version: string
  majorVersion: number
  installed: boolean
  vendor: 'mojang' | 'adoptium'
}

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export interface LoaderVersion {
  version: string
  recommended: boolean
  releaseTime: string
  stable: boolean
}

export interface InstalledMod {
  fileName: string
  enabled: boolean
  name: string
  version?: string
  projectId?: string
}

export interface ModSearchHit {
  projectId: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  iconUrl?: string
  installed: boolean
}

export interface Instance {
  id: string
  name: string
  versionId: string
  /** Mod loader installed on top of vanilla (resolved through Prism Launcher's metadata). */
  loader?: { type: Exclude<LoaderType, 'vanilla'>; version: string }
  createdAt: number
  lastPlayed?: number
  /** Explicit java executable. Empty = pick automatically (managed runtime or best system Java). */
  javaPath?: string
  minMemoryMb?: number
  maxMemoryMb?: number
  jvmArgs?: string
  width?: number
  height?: number
}

/** "system" follows the operating system's light/dark setting. */
export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  /** Azure application (client) ID used for Microsoft login. */
  msClientId: string
  theme: ThemePreference
  language: LanguagePreference
  defaultMaxMemoryMb: number
  defaultMinMemoryMb: number
  /** Download the Java version required by Mojang automatically when launching. */
  autoDownloadJava: boolean
  /** Minutes between background refreshes of the version manifest. */
  versionRefreshMinutes: number
  concurrentDownloads: number
  closeOnLaunch: boolean
  selectedAccountId?: string
  selectedInstanceId?: string
}

/** Where the launcher's own update stands (see src/main/core/updater.ts). */
export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export interface UpdateInfo {
  /** The running version. */
  current: string
  /** False in development builds and the browser preview, which can't update themselves. */
  supported: boolean
  /** `restart`: installs on restart (Windows, Linux AppImage). `installer`: opens the downloaded installer (macOS, .deb). */
  method: 'restart' | 'installer'
  state: UpdateStatus
}

export interface ProgressEvent {
  taskId: string
  title: string
  stage: string
  done: number
  total: number
  finished?: boolean
  error?: string
}

export interface GameLogEvent {
  instanceId: string
  line: string
  stream: 'stdout' | 'stderr' | 'launcher'
}

export interface GameExitEvent {
  instanceId: string
  code: number | null
}

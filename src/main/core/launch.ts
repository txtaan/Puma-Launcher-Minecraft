import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { delimiter, join, normalize, sep } from 'node:path'
import yauzl from 'yauzl'
import type { Account, Instance, Settings } from '@shared/types'
import {
  activeLibraries,
  assetIndexId,
  classpath,
  installVersion,
  legacyAssetsDir,
  logConfigPath,
  nativeClassifier,
  readAssetIndex,
  type Argument,
  type VersionJson
} from './install'
import { resolveJava } from './java'
import { paths } from './paths'
import { rulesAllow } from './platform'
import { gameDir } from './instances'

export const LAUNCHER_NAME = 'txtaan-launcher'
export const LAUNCHER_VERSION = '0.1.0'

const running = new Map<string, ChildProcess>()

export function isRunning(instanceId: string): boolean {
  return running.has(instanceId)
}

export function killInstance(instanceId: string): void {
  running.get(instanceId)?.kill()
}

/** Extract legacy LWJGL 2 natives (pre-1.19) into the instance's natives folder. */
async function extractNatives(version: VersionJson, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })
  for (const lib of activeLibraries(version)) {
    const classifier = nativeClassifier(lib)
    const art = classifier ? lib.downloads?.classifiers?.[classifier] : undefined
    if (!art) continue
    const exclude = lib.extract?.exclude ?? ['META-INF/']
    await unzip(join(paths.libraries(), art.path), dest, (name) => !exclude.some((e) => name.startsWith(e)))
  }
}

function unzip(file: string, dest: string, filter: (name: string) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err)
      zip.on('error', reject)
      zip.on('end', () => resolve())
      zip.on('entry', (entry: yauzl.Entry) => {
        const target = normalize(join(dest, entry.fileName))
        // Guard against zip-slip and skip directories / filtered entries.
        if (entry.fileName.endsWith('/') || !filter(entry.fileName) || !target.startsWith(normalize(dest) + sep)) {
          zip.readEntry()
          return
        }
        zip.openReadStream(entry, async (e, stream) => {
          if (e || !stream) return reject(e)
          await mkdir(join(target, '..'), { recursive: true })
          stream.pipe(createWriteStream(target)).on('finish', () => zip.readEntry()).on('error', reject)
        })
      })
      zip.readEntry()
    })
  })
}

function expandArgs(args: Argument[], vars: Record<string, string>, features: Record<string, boolean>): string[] {
  const out: string[] = []
  for (const arg of args) {
    if (typeof arg === 'string') out.push(arg)
    else if (rulesAllow(arg.rules, features)) out.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]))
  }
  return out.map((a) => a.replace(/\$\{(\w+)\}/g, (m, k: string) => vars[k] ?? m))
}

export interface LaunchCallbacks {
  onProgress: (stage: string, done: number, total: number) => void
  onLog: (line: string, stream: 'stdout' | 'stderr' | 'launcher') => void
  onExit: (code: number | null) => void
}

export async function launchInstance(
  instance: Instance,
  account: Account,
  settings: Settings,
  cb: LaunchCallbacks
): Promise<void> {
  if (running.has(instance.id)) throw new Error(`${instance.name} is already running`)
  const dir = gameDir(instance.id)
  await mkdir(dir, { recursive: true })

  const version = await installVersion(instance.versionId, dir, settings.concurrentDownloads, cb.onProgress)
  const java = await resolveJava({
    explicitPath: instance.javaPath,
    component: version.javaVersion?.component,
    majorVersion: version.javaVersion?.majorVersion ?? 8,
    autoDownload: settings.autoDownloadJava,
    concurrency: settings.concurrentDownloads,
    onProgress: cb.onProgress
  })

  cb.onProgress('Preparing natives', 0, 1)
  const nativesDir = paths.natives(instance.id)
  await extractNatives(version, nativesDir)

  const assetIndex = await readAssetIndex(version)
  const hasResolution = !!(instance.width && instance.height)
  const vars: Record<string, string> = {
    auth_player_name: account.username,
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken,
    auth_session: `token:${account.accessToken}:${account.uuid}`,
    auth_xuid: account.xuid ?? '0',
    clientid: '',
    user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
    user_properties: '{}',
    version_name: version.id,
    version_type: version.type,
    game_directory: dir,
    assets_root: paths.assets(),
    game_assets: legacyAssetsDir(version, dir, assetIndex),
    assets_index_name: assetIndexId(version),
    natives_directory: nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath: classpath(version).join(delimiter),
    classpath_separator: delimiter,
    library_directory: paths.libraries(),
    resolution_width: String(instance.width ?? 854),
    resolution_height: String(instance.height ?? 480)
  }
  const features = { has_custom_resolution: hasResolution, is_demo_user: false }

  const maxMem = instance.maxMemoryMb ?? settings.defaultMaxMemoryMb
  const minMem = instance.minMemoryMb ?? settings.defaultMinMemoryMb
  const jvm: string[] = [`-Xms${minMem}M`, `-Xmx${maxMem}M`]
  if (version.arguments?.jvm) {
    jvm.push(...expandArgs(version.arguments.jvm, vars, features))
  } else {
    // Legacy versions have no JVM argument list; supply the essentials ourselves.
    if (process.platform === 'darwin') jvm.push('-XstartOnFirstThread')
    jvm.push(`-Djava.library.path=${nativesDir}`, '-cp', vars.classpath)
  }
  const logArg = version.logging?.client?.argument
  const logFile = logConfigPath(version)
  if (logArg && logFile) jvm.push(logArg.replace('${path}', logFile))
  if (instance.jvmArgs?.trim()) jvm.push(...instance.jvmArgs.trim().split(/\s+/))
  // Mojang's recommended GC/heap flags, used only when the user hasn't set their own.
  else if (version.arguments?.['default-user-jvm']) jvm.push(...expandArgs(version.arguments['default-user-jvm'], vars, features))

  const game = version.arguments?.game
    ? expandArgs(version.arguments.game, vars, features)
    : (version.minecraftArguments ?? '').split(' ').filter(Boolean).map((a) => a.replace(/\$\{(\w+)\}/g, (m, k: string) => vars[k] ?? m))
  if (!version.arguments?.game && hasResolution) game.push('--width', vars.resolution_width, '--height', vars.resolution_height)

  const args = [...jvm, version.mainClass, ...game]
  cb.onLog(`Launching ${version.id} with ${java}`, 'launcher')
  cb.onLog(
    `Arguments: ${args.map((a) => (a === account.accessToken && a !== '0' ? '<access token>' : a)).join(' ')}`,
    'launcher'
  )

  const child = spawn(java, args, { cwd: dir, windowsHide: true, detached: false })
  running.set(instance.id, child)
  const pipeLines = (stream: NodeJS.ReadableStream | null, name: 'stdout' | 'stderr') => {
    let buf = ''
    stream?.setEncoding('utf8')
    stream?.on('data', (chunk: string) => {
      buf += chunk
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      for (const l of lines) cb.onLog(l, name)
    })
  }
  pipeLines(child.stdout, 'stdout')
  pipeLines(child.stderr, 'stderr')
  child.on('error', (err) => {
    cb.onLog(`Failed to start Java: ${err.message}`, 'launcher')
    running.delete(instance.id)
    cb.onExit(-1)
  })
  child.on('exit', (code) => {
    running.delete(instance.id)
    cb.onExit(code)
  })
}

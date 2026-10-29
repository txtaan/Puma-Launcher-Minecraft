import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { unzip } from './archive'
import type { Account, Instance, Settings } from '@shared/types'
import {
  activeLibraries,
  assetIndexId,
  classpath,
  installVersion,
  libraryArtifact,
  legacyAssetsDir,
  logConfigPath,
  nativeClassifier,
  nativePath,
  readAssetIndex,
  type Argument,
  type VersionJson
} from './install'
import { resolveJava } from './java'
import { authlibAgentArgs } from './auth'
import { loaderComponents } from './meta'
import { paths } from './paths'
import { rulesAllow } from './platform'
import { gameDir } from './instances'

export const LAUNCHER_NAME = 'txtaan-launcher'
export const LAUNCHER_VERSION = '0.2.2'

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
    await unzip(join(paths.libraries(), nativePath(lib, art, classifier!)), dest, {
      filter: (name) => !exclude.some((e) => name.startsWith(e))
    })
  }
}

function expandArgs(args: Argument[], vars: Record<string, string>, features: Record<string, boolean>): string[] {
  const out: string[] = []
  for (const arg of args) {
    if (typeof arg === 'string') out.push(arg)
    else if (rulesAllow(arg.rules, features)) out.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]))
  }
  return out.map((a) => a.replace(/\$\{(\w+)\}/g, (m, k: string) => vars[k] ?? m))
}

const FORGE_WRAPPER_MAIN = 'io.github.zekerzhayard.forgewrapper.installer.Main'

/**
 * Modern Forge/NeoForge run through Prism's ForgeWrapper, which executes the official installer's
 * processors on first launch. Tell it where our libraries, the installer and the vanilla jar are.
 */
function forgeWrapperArgs(version: VersionJson): string[] {
  const installer = (version.mavenFiles ?? []).find((l) => l.name.endsWith(':installer'))
  const art = installer && libraryArtifact(installer)
  if (!art) throw new Error('This Forge version is missing its installer in the metadata')
  return [
    `-Dforgewrapper.librariesDir=${paths.libraries()}`,
    `-Dforgewrapper.installer=${join(paths.libraries(), art.path)}`,
    `-Dforgewrapper.minecraft=${paths.versionJar(version.jar ?? version.id)}`
  ]
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

  cb.onProgress('Resolving version', 0, 1)
  const components = instance.loader ? await loaderComponents(instance.loader, instance.versionId) : []
  const version = await installVersion(instance.versionId, dir, settings.concurrentDownloads, cb.onProgress, components)
  const agent = account.type === 'authlib' && account.authServer ? await authlibAgentArgs(account.authServer) : []
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
    user_type: account.type === 'microsoft' ? 'msa' : account.type === 'authlib' ? 'mojang' : 'legacy',
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
  jvm.push(...agent)
  for (const arg of version.extraJvmArgs ?? []) jvm.push(arg.replace(/\$\{(\w+)\}/g, (m, k: string) => vars[k] ?? m))
  if (version.mainClass === FORGE_WRAPPER_MAIN) jvm.push(...forgeWrapperArgs(version))
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
  for (const tweaker of version.tweakers ?? []) game.push('--tweakClass', tweaker)

  const args = [...jvm, version.mainClass, ...game]
  const loaderLabel = instance.loader ? ` + ${instance.loader.type} ${instance.loader.version}` : ''
  cb.onLog(`Launching ${version.id}${loaderLabel} with ${java}`, 'launcher')
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
      for (const l of lines) {
        const out = name === 'stdout' ? log4j.push(l) : [l]
        for (const o of out) cb.onLog(o, name)
      }
    })
  }
  const log4j = new Log4jXmlParser()
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

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/**
 * Modern versions log through log4j's XMLLayout (meant for launchers to parse).
 * Turn each <log4j:Event> back into a readable "[time] [thread/LEVEL]: message" line.
 */
class Log4jXmlParser {
  private event: string[] | null = null

  push(line: string): string[] {
    if (this.event === null) {
      if (!line.trimStart().startsWith('<log4j:Event')) return [line]
      this.event = []
    }
    this.event.push(line)
    if (!line.includes('</log4j:Event>')) return []
    const xml = this.event.join('\n')
    this.event = null
    const attr = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(xml)?.[1] ?? ''
    const cdata = (tag: string) => {
      const m = new RegExp(`<log4j:${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></log4j:${tag}>`).exec(xml)
      return m ? m[1] : unescapeXml(new RegExp(`<log4j:${tag}>([\\s\\S]*?)</log4j:${tag}>`).exec(xml)?.[1] ?? '')
    }
    const time = new Date(Number(attr('timestamp'))).toTimeString().slice(0, 8)
    const out = [`[${time}] [${unescapeXml(attr('thread'))}/${attr('level')}]: ${cdata('Message')}`]
    const throwable = cdata('Throwable')
    if (throwable) out.push(...throwable.split('\n'))
    return out
  }
}

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const USER_AGENT = 'TxtaanLauncher/0.1 (+https://github.com/txtaan/Minecraft-Launcher-txtaan-)'

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init?.headers } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${await res.text().catch(() => '')}`)
  return (await res.json()) as T
}

export async function sha1File(file: string): Promise<string> {
  const hash = createHash('sha1')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

export interface DownloadItem {
  url: string
  dest: string
  sha1?: string
  size?: number
}

/** True when the file exists and matches the expected hash (or size, when no hash is known). */
export async function isValid(item: DownloadItem): Promise<boolean> {
  try {
    const st = await stat(item.dest)
    if (item.size !== undefined && st.size !== item.size) return false
    if (item.sha1) return (await sha1File(item.dest)) === item.sha1
    return true
  } catch {
    return false
  }
}

export async function download(item: DownloadItem, retries = 3): Promise<void> {
  await mkdir(dirname(item.dest), { recursive: true })
  const tmp = `${item.dest}.part`
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(item.url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${item.url}`)
      const hash = createHash('sha1')
      const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
      body.on('data', (chunk: Buffer) => hash.update(chunk))
      await pipeline(body, createWriteStream(tmp))
      const digest = hash.digest('hex')
      if (item.sha1 && digest !== item.sha1) throw new Error(`Checksum mismatch for ${item.url}`)
      await rename(tmp, item.dest)
      return
    } catch (err) {
      lastErr = err
      await rm(tmp, { force: true })
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
  throw lastErr
}

/**
 * Verify and download a batch of files with bounded concurrency.
 * Files that already exist with the right hash are skipped.
 */
export async function downloadAll(
  items: DownloadItem[],
  concurrency: number,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  // De-duplicate: several assets can share the same hash/path.
  const unique = [...new Map(items.map((i) => [i.dest, i])).values()]
  let done = 0
  let next = 0
  const errors: unknown[] = []
  onProgress(0, unique.length)
  const worker = async (): Promise<void> => {
    while (next < unique.length) {
      const item = unique[next++]
      try {
        if (!(await isValid(item))) await download(item)
      } catch (err) {
        errors.push(err)
      }
      onProgress(++done, unique.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  if (errors.length) {
    throw new Error(`${errors.length} file(s) failed to download. First error: ${String(errors[0])}`)
  }
}

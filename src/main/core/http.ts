import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { tr } from './i18n'

export const USER_AGENT = 'PumaLauncher/0.2 (+https://github.com/txtaan/Puma-Launcher-Minecraft)'

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init?.headers } })
  if (!res.ok) throw new Error(`${tr('error.httpFor', { status: res.status, url })}: ${await res.text().catch(() => '')}`)
  return (await res.json()) as T
}

export async function sha1File(file: string, algo: 'sha1' | 'sha256' = 'sha1'): Promise<string> {
  const hash = createHash(algo)
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

export interface DownloadItem {
  url: string
  dest: string
  sha1?: string
  sha256?: string
  size?: number
}

/**
 * How to check a file that is already on disk:
 * - `hash`: read it and compare its hash. For files whose content can change under the same name.
 * - `size`: compare its size only (the hash when the size is unknown). For files that never change once
 *   published: libraries, client jars, asset objects. A download is only moved into place after its hash
 *   has been verified, so a file of the right size is the one we verified. Hashing thousands of files
 *   instead would make every launch read the whole game again.
 */
export type FileCheck = 'hash' | 'size'

/** True when the file exists and matches the expected size and hash (see {@link FileCheck}). */
export async function isValid(item: DownloadItem, check: FileCheck = 'hash'): Promise<boolean> {
  try {
    const st = await stat(item.dest)
    if (item.size !== undefined && st.size !== item.size) return false
    if (check === 'size' && item.size !== undefined) return true
    if (item.sha1) return (await sha1File(item.dest)) === item.sha1
    if (item.sha256) return (await sha1File(item.dest, 'sha256')) === item.sha256
    return true
  } catch {
    return false
  }
}

export async function download(
  item: DownloadItem,
  retries = 3,
  onBytes?: (received: number, total: number) => void
): Promise<void> {
  await mkdir(dirname(item.dest), { recursive: true })
  const tmp = `${item.dest}.part`
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(item.url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok || !res.body) throw new Error(tr('error.httpFor', { status: res.status, url: item.url }))
      const hash = createHash(item.sha256 && !item.sha1 ? 'sha256' : 'sha1')
      const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
      const total = item.size ?? Number(res.headers.get('content-length') ?? 0)
      let received = 0
      body.on('data', (chunk: Buffer) => {
        hash.update(chunk)
        received += chunk.length
        onBytes?.(received, total)
      })
      await pipeline(body, createWriteStream(tmp))
      const digest = hash.digest('hex')
      if ((item.sha1 && digest !== item.sha1) || (!item.sha1 && item.sha256 && digest !== item.sha256)) {
        throw new Error(tr('error.checksum', { name: item.url }))
      }
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
 * Download the files of a batch that are missing or damaged, with bounded concurrency.
 * Files on disk are checked first, so the progress only counts files that are really downloaded,
 * and isn't reported at all when everything is already there.
 */
export async function downloadAll(
  items: DownloadItem[],
  concurrency: number,
  onProgress: (done: number, total: number) => void,
  check: FileCheck = 'hash'
): Promise<void> {
  // De-duplicate: several assets can share the same hash/path.
  const unique = [...new Map(items.map((i) => [i.dest, i])).values()]
  const valid = await mapLimit(unique, concurrency, (item) => isValid(item, check))
  const missing = unique.filter((_, i) => !valid[i])
  if (!missing.length) return

  let done = 0
  const errors: unknown[] = []
  onProgress(0, missing.length)
  await mapLimit(missing, concurrency, async (item) => {
    try {
      await download(item)
    } catch (err) {
      errors.push(err)
    }
    onProgress(++done, missing.length)
  })
  if (errors.length) {
    throw new Error(tr('error.downloadsFailed', { count: errors.length, error: String(errors[0]) }))
  }
}

/** Run `fn` on every item with at most `limit` running at once. Results keep the items' order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}

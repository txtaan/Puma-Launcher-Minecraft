import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'
import { x as untar } from 'tar'
import yauzl from 'yauzl'

/** Strip the first `strip` path components of an archive entry name. */
function stripPath(name: string, strip: number): string {
  return name.split('/').slice(strip).join('/')
}

/** Extract a zip, optionally filtering and stripping leading folders. Guards against zip-slip. */
export function unzip(
  file: string,
  dest: string,
  opts: { filter?: (name: string) => boolean; strip?: number } = {}
): Promise<void> {
  const root = normalize(dest) + sep
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err)
      zip.on('error', reject)
      zip.on('end', () => resolve())
      zip.on('entry', (entry: yauzl.Entry) => {
        const rel = stripPath(entry.fileName, opts.strip ?? 0)
        const target = normalize(join(dest, rel))
        if (!rel || entry.fileName.endsWith('/') || (opts.filter && !opts.filter(entry.fileName)) || !target.startsWith(root)) {
          zip.readEntry()
          return
        }
        zip.openReadStream(entry, async (e, stream) => {
          if (e || !stream) return reject(e)
          await mkdir(join(target, '..'), { recursive: true })
          // Preserve the executable bit (unix mode lives in the high 16 bits of externalFileAttributes).
          const mode = (entry.externalFileAttributes >>> 16) & 0o777
          stream
            .pipe(createWriteStream(target, mode ? { mode } : undefined))
            .on('finish', () => zip.readEntry())
            .on('error', reject)
        })
      })
      zip.readEntry()
    })
  })
}

/** Read one file out of a zip/jar, or null when it is not there. */
export function readZipEntry(file: string, name: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return resolve(null)
      let found = false
      zip.on('error', () => resolve(null))
      zip.on('end', () => !found && resolve(null))
      zip.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName !== name) return zip.readEntry()
        found = true
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return resolve(null)
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => {
            zip.close()
            resolve(Buffer.concat(chunks))
          })
        })
      })
      zip.readEntry()
    })
  })
}

export async function extractArchive(file: string, dest: string, strip = 0): Promise<void> {
  await mkdir(dest, { recursive: true })
  if (/\.zip$/i.test(file)) return unzip(file, dest, { strip })
  await untar({ file, cwd: dest, strip })
}

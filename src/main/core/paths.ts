import { app } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

// Layout mirrors the official launcher's .minecraft structure so shared
// folders (libraries, assets, versions) can be reused between instances.
let root: string | undefined

export function dataRoot(): string {
  if (!root) root = process.env.PUMA_HOME || process.env.TXTAAN_HOME || defaultRoot()
  return root
}

/** Default data folder. Data from before the rename to Puma Launcher ("txtaan-launcher") is moved over once. */
function defaultRoot(): string {
  const current = join(app.getPath('appData'), 'puma-launcher')
  const legacy = join(app.getPath('appData'), 'txtaan-launcher')
  if (!existsSync(current) && existsSync(legacy)) {
    try {
      renameSync(legacy, current)
    } catch {
      return legacy // e.g. the folder is in use; keep using it rather than starting empty
    }
  }
  return current
}

export const paths = {
  root: () => dataRoot(),
  versions: () => join(dataRoot(), 'versions'),
  versionDir: (id: string) => join(dataRoot(), 'versions', id),
  versionJson: (id: string) => join(dataRoot(), 'versions', id, `${id}.json`),
  versionJar: (id: string) => join(dataRoot(), 'versions', id, `${id}.jar`),
  libraries: () => join(dataRoot(), 'libraries'),
  assets: () => join(dataRoot(), 'assets'),
  runtimes: () => join(dataRoot(), 'runtime'),
  instances: () => join(dataRoot(), 'instances'),
  instanceDir: (id: string) => join(dataRoot(), 'instances', id),
  natives: (instanceId: string) => join(dataRoot(), 'instances', instanceId, 'natives'),
  cache: () => join(dataRoot(), 'cache'),
  skins: () => join(dataRoot(), 'skins'),
  settings: () => join(dataRoot(), 'settings.json'),
  accounts: () => join(dataRoot(), 'accounts.json')
}

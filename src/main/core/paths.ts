import { app } from 'electron'
import { join } from 'node:path'

// Layout mirrors the official launcher's .minecraft structure so shared
// folders (libraries, assets, versions) can be reused between instances.
let root: string | undefined

export function dataRoot(): string {
  if (!root) root = process.env.TXTAAN_HOME || join(app.getPath('appData'), 'txtaan-launcher')
  return root
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
  settings: () => join(dataRoot(), 'settings.json'),
  accounts: () => join(dataRoot(), 'accounts.json')
}

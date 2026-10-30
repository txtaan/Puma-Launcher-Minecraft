import polymarketBillboard from './assets/mods/polymarket-billboard.png'

/** Icons of Puma Launcher's own mods, which don't come from Modrinth's CDN. */
const OWN_ICONS: Record<string, string> = {
  'puma:polymarket-billboard': polymarketBillboard
}

export const modIcon = (projectId: string, iconUrl?: string): string | undefined => iconUrl ?? OWN_ICONS[projectId]

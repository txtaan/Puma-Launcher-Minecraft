import polymarketPredictionMarket from './assets/mods/polymarket-prediction-market.png'

/** Icons of Puma Launcher's own mods, which don't come from Modrinth's CDN. */
const OWN_ICONS: Record<string, string> = {
  'puma:polymarket-prediction-market': polymarketPredictionMarket
}

export const modIcon = (projectId: string, iconUrl?: string): string | undefined => iconUrl ?? OWN_ICONS[projectId]

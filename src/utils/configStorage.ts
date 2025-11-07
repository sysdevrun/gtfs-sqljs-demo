export interface AppConfig {
  gtfsUrl: string
  gtfsRtUrls: string[]
  upcomingDeparturesCount: number
  updateInterval: number // in seconds, 0 = disabled
  selectedTab: number
}

const CONFIG_KEY = 'gtfs-app-config'

export const defaultConfig: AppConfig = {
  gtfsUrl: 'https://pysae.com/api/v2/groups/car-jaune/gtfs/pub',
  gtfsRtUrls: ['https://pysae.com/api/v2/groups/car-jaune/gtfs-rt'],
  upcomingDeparturesCount: 10,
  updateInterval: 5,
  selectedTab: 0
}

export function loadConfig(): AppConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY)
    if (saved) {
      return { ...defaultConfig, ...JSON.parse(saved) }
    }
  } catch (err) {
    console.error('Error loading config from localStorage:', err)
  }
  return defaultConfig
}

export function saveConfig(config: Partial<AppConfig>): void {
  try {
    const current = loadConfig()
    const updated = { ...current, ...config }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Error saving config to localStorage:', err)
  }
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { wrap, Remote, proxy } from 'comlink'
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Container
} from '@mui/material'
import {
  Settings as SettingsIcon,
  Search as SearchIcon,
  Schedule as ScheduleIcon,
  Map as MapIcon,
  Warning as WarningIcon,
  DirectionsBus as BusIcon,
  Update as UpdateIcon
} from '@mui/icons-material'
import {
  Agency,
  Route,
  Trip,
  StopTimeWithRealtime,
  Alert,
  VehiclePosition,
  TripUpdate,
  Stop
} from 'gtfs-sqljs'
import LoadingProgress from './components/LoadingProgress'
import type { GtfsWorkerAPI, ProgressInfo } from './gtfs.worker'
import { GtfsApiAdapter } from './utils/GtfsApiAdapter'
import { loadConfig, saveConfig, AppConfig } from './utils/configStorage'
import ConfigurationTab from './tabs/ConfigurationTab'
import BrowseDataTab from './tabs/BrowseDataTab'
import TimetablesTab from './tabs/TimetablesTab'
import MapTab from './tabs/MapTab'
import AlertsTab from './tabs/AlertsTab'
import DeparturesTab from './tabs/DeparturesTab'
import DeparturesV2Tab from './tabs/DeparturesV2Tab'
import RealtimeDataTab from './tabs/RealtimeDataTab'

const PROXY_BASE = 'https://gtfs-proxy.sys-dev-run.re/proxy/'

const proxyUrl = (url: string) => {
  // Don't proxy relative or absolute paths (local files)
  if (url.startsWith('./') || url.startsWith('/') || url.startsWith('../')) {
    return url
  }

  // Only proxy remote HTTP/HTTPS URLs
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return PROXY_BASE + parsed.host + parsed.pathname + parsed.search
    }
    return url
  } catch {
    // If URL parsing fails, assume it's a relative path
    return url
  }
}

interface PresetConfig {
  name: string
  gtfsUrl: string
  gtfsRtUrls: string[]
}

const PRESETS: PresetConfig[] = [
  {
    name: 'Car Jaune',
    gtfsUrl: 'https://pysae.com/api/v2/groups/car-jaune/gtfs/pub',
    gtfsRtUrls: ['https://pysae.com/api/v2/groups/car-jaune/gtfs-rt']
  },
  {
    name: 'Irigo',
    gtfsUrl: 'https://chouette.enroute.mobi/api/v1/datas/Irigo/gtfs.zip',
    gtfsRtUrls: [
      'https://ara-api.enroute.mobi/irigo/gtfs/trip-updates',
      'https://ara-api.enroute.mobi/irigo/gtfs/vehicle-positions',
      'https://notify.ratpdev.com/api/networks/RD%20ANGERS/alerts/gtfsrt'
    ]
  },
  {
    name: 'Kar\'Ouest',
    gtfsUrl: 'https://www.data.gouv.fr/api/1/datasets/r/c9c2f609-d0cd-4233-ad1b-cf86b9bf2dc8',
    gtfsRtUrls: ['https://pysae.com/api/v2/groups/semto-2/gtfs-rt']
  },
  {
    name: 'Alternéo',
    gtfsUrl: 'https://transport.data.gouv.fr/resources/80676/download',
    gtfsRtUrls: [
      'https://proxy.transport.data.gouv.fr/resource/alterneo-civis-gtfs-rt-trip-update',
      'https://proxy.transport.data.gouv.fr/resource/alterneo-civis-gtfs-rt-service-alert',
      'https://proxy.transport.data.gouv.fr/resource/alterneo-civis-gtfs-rt-vehicle-position'
    ]
  },
  {
    name: 'CaRsud',
    gtfsUrl: 'https://www.data.gouv.fr/api/1/datasets/r/8f3642e3-9fc3-45ed-af46-8c532966ace3',
    gtfsRtUrls: ['https://zenbus.net/gtfs/rt/poll.proto?src=true&dataset=carsud-reunion']
  },
  {
    name: 'Citalis',
    gtfsUrl: 'https://pysae.com/api/v2/groups/citalis/gtfs/pub',
    gtfsRtUrls: ['https://pysae.com/api/v2/groups/citalis/gtfs-rt']
  },
  {
    name: 'STAS',
    gtfsUrl: 'https://api-preprod.saint-etienne-metropole.fr/gtfs-tools/api/gtfs',
    gtfsRtUrls: ['https://api-preprod.saint-etienne-metropole.fr/gtfs-tools/api/TripUpdate?format=pb']
  },
  {
    name: 'Astuce',
    gtfsUrl: 'https://api.mrn.cityway.fr/dataflow/offre-tc/download?provider=ASTUCE&dataFormat=gtfs&dataProfil=ASTUCE',
    gtfsRtUrls: [
      'https://api.mrn.cityway.fr/dataflow/vehicle-tc-tr/download?provider=TCAR&dataFormat=gtfs-rt',
      'https://api.mrn.cityway.fr/dataflow/info-transport/download?provider=ASTUCE&dataFormat=gtfs-rt',
      'https://api.mrn.cityway.fr/dataflow/vehicule-tc-tr/download?provider=TNI&dataFormat=gtfs-rt',
      'https://api.mrn.cityway.fr/dataflow/horaire-tc-tr/download?provider=TNI&dataFormat=gtfs-rt',
      'https://api.mrn.cityway.fr/dataflow/horaire-tc-tr/download?provider=TAE&dataFormat=gtfs-rt',
      'https://api.mrn.cityway.fr/dataflow/horaire-tc-tr/download?provider=TCAR&dataFormat=gtfs-rt'
    ]
  },
  {
    name: 'MAP',
    gtfsUrl: 'https://www.data.gouv.fr/api/1/datasets/r/3bd31fbe-93f4-432d-ade7-ee8d69897880',
    gtfsRtUrls: ['https://proxy.transport.data.gouv.fr/resource/mat-saint-malo-gtfs-rt-trip-update']
  }
]

// Create red theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#d32f2f',
      light: '#ff6659',
      dark: '#9a0007',
    },
    secondary: {
      main: '#f44336',
    },
    error: {
      main: '#d32f2f',
    },
  },
})

function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig())
  const [currentTab, setCurrentTab] = useState(config.selectedTab)
  const [gtfsLoaded, setGtfsLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<ProgressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [realtimeLastUpdated, setRealtimeLastUpdated] = useState<number>(0)
  const [lastRtFetchTimestamp, setLastRtFetchTimestamp] = useState<number | null>(null)
  const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState<number | null>(null)

  // Web Worker reference
  const workerRef = useRef<Remote<GtfsWorkerAPI> | null>(null)
  const rawWorkerRef = useRef<Worker | null>(null)
  const gtfsApiRef = useRef<GtfsApiAdapter | null>(null)

  // Data states
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null)
  const [stopTimes, setStopTimes] = useState<StopTimeWithRealtime[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([])
  const [tripUpdates, setTripUpdates] = useState<TripUpdate[]>([])

  // Helper function to initialize or reinitialize worker
  const initializeWorker = useCallback(() => {
    // Terminate existing worker if it exists
    if (rawWorkerRef.current) {
      console.log('Terminating existing worker...')
      rawWorkerRef.current.terminate()
    }

    // Create new worker
    console.log('Creating new worker...')
    const worker = new Worker(new URL('./gtfs.worker.ts', import.meta.url), {
      type: 'module'
    })
    const workerApi = wrap<GtfsWorkerAPI>(worker)

    // Update refs
    rawWorkerRef.current = worker
    workerRef.current = workerApi
    gtfsApiRef.current = new GtfsApiAdapter(workerApi)
  }, [])

  // Initialize worker on mount
  useEffect(() => {
    initializeWorker()

    return () => {
      if (rawWorkerRef.current) {
        rawWorkerRef.current.terminate()
      }
    }
  }, [initializeWorker])

  // Handle tab change
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue)
    saveConfig({ selectedTab: newValue })
  }

  // Load GTFS data
  const loadGtfs = useCallback(async (gtfsUrl: string, gtfsRtUrls: string[]) => {
    setLoading(true)
    setLoadingProgress(null)
    setError(null)
    setGtfsLoaded(false)

    // Clear existing data
    setAgencies([])
    setRoutes([])
    setStops([])
    setTrips([])
    setStopTimes([])
    setAlerts([])
    setVehicles([])
    setTripUpdates([])
    setSelectedRoute(null)
    setSelectedTrip(null)

    // Deregister old worker and register new one
    console.log('Reinitializing worker for new GTFS data...')
    initializeWorker()

    // Ensure the new worker is ready
    if (!workerRef.current) {
      setError('Failed to initialize worker')
      setLoading(false)
      return
    }

    try {
      const proxiedGtfsUrl = proxyUrl(gtfsUrl)
      const proxiedRtUrls = gtfsRtUrls
        .filter(url => url.trim() !== '')
        .map(url => proxyUrl(url))

      console.log('Loading GTFS from:', proxiedGtfsUrl)
      console.log('Loading GTFS-RT from:', proxiedRtUrls)

      // Load GTFS with progress callback
      await workerRef.current.loadGtfs(
        proxiedGtfsUrl,
        proxiedRtUrls,
        proxy((progress: ProgressInfo) => {
          setLoadingProgress(progress)
        })
      )

      // Fetch data from worker
      const agenciesData = await workerRef.current.getAgencies()
      console.log('Loaded agencies:', agenciesData.map(a => a.agency_name).join(', '))
      setAgencies(agenciesData)

      const routesData = await workerRef.current.getRoutes()
      console.log(`Loaded ${routesData.length} routes`)
      const sortedRoutes = routesData.sort((a: Route, b: Route) => {
        const aSort = a.route_sort_order ?? 9999
        const bSort = b.route_sort_order ?? 9999
        return aSort - bSort
      })
      setRoutes(sortedRoutes)

      // Fetch stops and update API adapter cache
      const stopsData = await workerRef.current.getStops()
      console.log(`Loaded ${stopsData.length} stops`)
      setStops(stopsData)
      if (gtfsApiRef.current) {
        gtfsApiRef.current.setStops(stopsData)
      }

      // Update realtime data
      await updateRealtimeData()

      setGtfsLoaded(true)
      setLoading(false)
      setLoadingProgress(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load GTFS data')
      setLoading(false)
      setLoadingProgress(null)
      setGtfsLoaded(false)
    }
  }, [initializeWorker])

  const updateRealtimeData = useCallback(async () => {
    if (!workerRef.current || !gtfsLoaded || !gtfsApiRef.current) return

    try {
      const alertsData = await workerRef.current.getAlerts({ activeOnly: true })
      setAlerts(alertsData)

      const vehiclesData = await workerRef.current.getVehiclePositions()
      const tripUpdatesData = await workerRef.current.getTripUpdates()

      console.log(`Realtime data: ${vehiclesData.length} vehicles, ${tripUpdatesData.length} trip updates, ${alertsData.length} alerts`)

      // Pre-fetch trip data for all vehicles to populate cache
      const tripIds = new Set<string>()
      vehiclesData.forEach(v => {
        if (v.trip_id) tripIds.add(v.trip_id)
      })

      await Promise.all(
        Array.from(tripIds).map(tripId => gtfsApiRef.current!.fetchAndCacheTripData(tripId))
      )

      // Sort vehicles by route sort order
      const sortedVehicles = vehiclesData.sort((a: VehiclePosition, b: VehiclePosition) => {
        const aRouteId = a.route_id
        const bRouteId = b.route_id
        const aRoute = aRouteId ? routes.find((r: Route) => r.route_id === aRouteId) : null
        const bRoute = bRouteId ? routes.find((r: Route) => r.route_id === bRouteId) : null

        const aSort = aRoute?.route_sort_order ?? 9999
        const bSort = bRoute?.route_sort_order ?? 9999

        if (aSort !== bSort) return aSort - bSort

        const aVehicleId = a.vehicle?.id || ''
        const bVehicleId = b.vehicle?.id || ''
        return aVehicleId.localeCompare(bVehicleId)
      })
      setVehicles(sortedVehicles)
      setTripUpdates(tripUpdatesData)

      // Get and store the last realtime fetch timestamp from the library
      // The library returns Unix timestamp in seconds, convert to milliseconds
      const rtTimestamp = await workerRef.current.getLastRealtimeFetchTimestamp()
      setLastRtFetchTimestamp(rtTimestamp !== null ? rtTimestamp * 1000 : null)

      // Update timestamp to trigger stop times refresh
      setRealtimeLastUpdated(Date.now())
    } catch (err) {
      console.error('Error updating realtime data:', err)
    }
  }, [routes, gtfsLoaded])

  // Initial load
  useEffect(() => {
    loadGtfs(config.gtfsUrl, config.gtfsRtUrls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh realtime data
  useEffect(() => {
    if (!workerRef.current || !gtfsLoaded || config.updateInterval === 0) return

    const interval = setInterval(async () => {
      try {
        await workerRef.current!.fetchRealtimeData()
        await updateRealtimeData()
      } catch (err) {
        console.error('Error fetching realtime data:', err)
      }
    }, config.updateInterval * 1000)

    return () => clearInterval(interval)
  }, [gtfsLoaded, config.updateInterval, updateRealtimeData])

  // Update seconds since last realtime update every second
  useEffect(() => {
    if (lastRtFetchTimestamp === null) {
      setSecondsSinceLastUpdate(null)
      return
    }

    const updateSeconds = () => {
      const now = Date.now()
      const seconds = Math.floor((now - lastRtFetchTimestamp) / 1000)
      setSecondsSinceLastUpdate(seconds)
    }

    updateSeconds()
    const interval = setInterval(updateSeconds, 1000)

    return () => clearInterval(interval)
  }, [lastRtFetchTimestamp])

  // Load trips for selected route (Browse Data tab)
  useEffect(() => {
    if (!workerRef.current || !gtfsLoaded || !selectedRoute || !gtfsApiRef.current) return

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    workerRef.current.getTrips({ routeId: selectedRoute, date: today, includeRealtime: true }).then(async tripsData => {
      const sortedTrips = tripsData.sort((a: Trip, b: Trip) => {
        const aName = a.trip_short_name || a.trip_id
        const bName = b.trip_short_name || b.trip_id
        return aName.localeCompare(bName)
      })

      // Pre-fetch trip data for all trips in this route
      if (gtfsApiRef.current) {
        await Promise.all(
          sortedTrips.map(trip => gtfsApiRef.current!.fetchAndCacheTripData(trip.trip_id))
        )
      }

      setTrips(sortedTrips)
      setSelectedTrip(null)
      setStopTimes([])
    })
  }, [gtfsLoaded, selectedRoute])

  // Load stop times for selected trip (Browse Data tab)
  useEffect(() => {
    if (!workerRef.current || !gtfsLoaded || !selectedTrip) return

    workerRef.current.getStopTimes({ tripId: selectedTrip, includeRealtime: true }).then(stopTimesData => {
      const withRealtime = stopTimesData.filter(st => st.realtime !== undefined)
      if (withRealtime.length > 0) {
        console.log(`Trip ${selectedTrip}: ${withRealtime.length}/${stopTimesData.length} stop times have realtime data`)
      }

      setStopTimes(stopTimesData)
    })
  }, [gtfsLoaded, selectedTrip, realtimeLastUpdated])

  const downloadDatabase = async () => {
    if (!workerRef.current || !gtfsLoaded) return
    try {
      const dbBuffer = await workerRef.current.getDatabase()
      if (!dbBuffer) {
        alert('No database available')
        return
      }

      const arrayBuffer = new ArrayBuffer(dbBuffer.byteLength)
      const uint8View = new Uint8Array(arrayBuffer)
      uint8View.set(new Uint8Array(dbBuffer.buffer, dbBuffer.byteOffset, dbBuffer.byteLength))

      const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gtfs-${new Date().toISOString().slice(0, 10)}.db`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading database:', err)
      alert('Failed to download database')
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Loading Progress Overlay */}
        {loading && <LoadingProgress progress={loadingProgress} />}

        {/* Header */}
        <AppBar position="static">
          <Toolbar>
            <BusIcon sx={{ mr: 2 }} />
            <Box>
              <Typography variant="h6" component="div">
                {agencies.length > 0 && `${agencies.map(a => a.agency_name).join(', ')} - `}GTFS Real-Time Explorer
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>
                {secondsSinceLastUpdate !== null
                  ? `GTFS-RT: last update ${secondsSinceLastUpdate} seconds ago`
                  : 'Explore transit data with gtfs-sqljs'}
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Container maxWidth="xl">
            <Tabs value={currentTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
              <Tab icon={<SearchIcon />} label="Browse Data" disabled={!gtfsLoaded} />
              <Tab icon={<ScheduleIcon />} label="Timetables" disabled={!gtfsLoaded} />
              <Tab icon={<MapIcon />} label="Map" disabled={!gtfsLoaded} />
              <Tab icon={<WarningIcon />} label="Alerts" disabled={!gtfsLoaded} />
              <Tab icon={<BusIcon />} label="Departures at Stop" disabled={!gtfsLoaded} />
              <Tab icon={<BusIcon />} label="Departures v2" disabled={!gtfsLoaded} />
              <Tab icon={<UpdateIcon />} label="GTFS-RT Data" disabled={!gtfsLoaded} />
              <Tab icon={<SettingsIcon />} label="Configuration" />
            </Tabs>
          </Container>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flexGrow: 1, bgcolor: 'grey.100' }}>
          <Container maxWidth="xl" sx={{ py: 0 }}>
            {currentTab === 0 && gtfsLoaded && (
              <BrowseDataTab
                agencies={agencies}
                routes={routes}
                selectedRoute={selectedRoute}
                setSelectedRoute={setSelectedRoute}
                trips={trips}
                selectedTrip={selectedTrip}
                setSelectedTrip={setSelectedTrip}
                stopTimes={stopTimes}
                vehicles={vehicles}
                gtfsApi={gtfsApiRef.current}
              />
            )}

            {currentTab === 1 && gtfsLoaded && (
              <TimetablesTab
                routes={routes}
                workerApi={workerRef.current}
                agencies={agencies}
                vehicles={vehicles}
              />
            )}

            {currentTab === 2 && gtfsLoaded && (
              <MapTab
                vehicles={vehicles}
                routes={routes}
                gtfsApi={gtfsApiRef.current}
                workerApi={workerRef.current}
              />
            )}

            {currentTab === 3 && gtfsLoaded && (
              <AlertsTab
                alerts={alerts}
                routes={routes}
              />
            )}

            {currentTab === 4 && gtfsLoaded && (
              <DeparturesTab
                stops={stops}
                routes={routes}
                workerApi={workerRef.current}
                gtfsApi={gtfsApiRef.current}
                upcomingDeparturesCount={config.upcomingDeparturesCount}
                updateInterval={config.updateInterval}
                agencies={agencies}
              />
            )}

            {currentTab === 5 && gtfsLoaded && (
              <DeparturesV2Tab
                stops={stops}
                routes={routes}
                workerApi={workerRef.current}
                gtfsApi={gtfsApiRef.current}
                upcomingDeparturesCount={config.upcomingDeparturesCount}
                updateInterval={config.updateInterval}
                agencies={agencies}
              />
            )}

            {currentTab === 6 && gtfsLoaded && (
              <RealtimeDataTab
                workerApi={workerRef.current}
                realtimeLastUpdated={realtimeLastUpdated}
              />
            )}

            {currentTab === 7 && (
              <ConfigurationTab
                config={config}
                setConfig={setConfig}
                presets={PRESETS}
                loading={loading}
                error={error}
                loadGtfs={loadGtfs}
                downloadDatabase={downloadDatabase}
                gtfsLoaded={gtfsLoaded}
                agencies={agencies}
                routesCount={routes.length}
                vehicles={vehicles}
                alerts={alerts}
                tripUpdates={tripUpdates}
              />
            )}
          </Container>
        </Box>

        {/* Footer */}
        <Box
          component="footer"
          sx={{
            py: 3,
            px: 2,
            mt: 'auto',
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider'
          }}
        >
          <Container maxWidth="xl">
            <Typography variant="body2" color="text.secondary" align="center">
              Powered by{' '}
              <a
                href="https://github.com/sysdevrun/gtfs-sqljs"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.palette.primary.main }}
              >
                gtfs-sqljs
              </a>
              {' '}with Web Workers
            </Typography>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App

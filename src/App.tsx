import { useState, useEffect, useCallback, useRef } from 'react'
import { wrap, Remote, proxy } from 'comlink'
import {
  Agency,
  Route,
  Trip,
  StopTimeWithRealtime,
  Alert,
  VehiclePosition
} from 'gtfs-sqljs'
import ConfigurationPanel from './components/ConfigurationPanel'
import AgenciesList from './components/AgenciesList'
import RoutesGrid from './components/RoutesGrid'
import TripsList from './components/TripsList'
import StopTimesTable from './components/StopTimesTable'
import AlertsTable from './components/AlertsTable'
import VehiclesTable from './components/VehiclesTable'
import LoadingProgress from './components/LoadingProgress'
import type { GtfsWorkerAPI, ProgressInfo } from './gtfs.worker'
import { GtfsApiAdapter } from './utils/GtfsApiAdapter'

const PROXY_BASE = 'https://gtfs-proxy.sys-dev-run.re/proxy/'

const proxyUrl = (url: string) => {
  const parsed = new URL(url)
  return PROXY_BASE + parsed.host + parsed.pathname + parsed.search
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
  }
]

function App() {
  const [gtfsUrl, setGtfsUrl] = useState('https://pysae.com/api/v2/groups/car-jaune/gtfs/pub')
  const [gtfsRtUrls, setGtfsRtUrls] = useState<string[]>(['https://pysae.com/api/v2/groups/car-jaune/gtfs-rt'])
  const [newRtUrl, setNewRtUrl] = useState('')
  const [gtfsLoaded, setGtfsLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<ProgressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [realtimeLastUpdated, setRealtimeLastUpdated] = useState<number>(0)

  // Web Worker reference
  const workerRef = useRef<Remote<GtfsWorkerAPI> | null>(null)
  const gtfsApiRef = useRef<GtfsApiAdapter | null>(null)

  // Data states
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null)
  const [stopTimes, setStopTimes] = useState<StopTimeWithRealtime[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([])

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(new URL('./gtfs.worker.ts', import.meta.url), {
      type: 'module'
    })
    const workerApi = wrap<GtfsWorkerAPI>(worker)
    workerRef.current = workerApi
    gtfsApiRef.current = new GtfsApiAdapter(workerApi)

    return () => {
      worker.terminate()
    }
  }, [])

  // Load preset configuration
  const loadPreset = (preset: PresetConfig) => {
    setGtfsUrl(preset.gtfsUrl)
    setGtfsRtUrls(preset.gtfsRtUrls)
  }

  // Add a new RT URL
  const addRtUrl = () => {
    if (newRtUrl.trim() && !gtfsRtUrls.includes(newRtUrl.trim())) {
      setGtfsRtUrls([...gtfsRtUrls, newRtUrl.trim()])
      setNewRtUrl('')
    }
  }

  // Remove an RT URL
  const removeRtUrl = (url: string) => {
    setGtfsRtUrls(gtfsRtUrls.filter(u => u !== url))
  }

  // Load GTFS data
  const loadGtfs = useCallback(async () => {
    if (!workerRef.current) return

    setLoading(true)
    setLoadingProgress(null)
    setError(null)
    setGtfsLoaded(false)

    // Clear existing data
    setAgencies([])
    setRoutes([])
    setTrips([])
    setStopTimes([])
    setAlerts([])
    setVehicles([])
    setSelectedRoute(null)
    setSelectedTrip(null)

    // Clear API adapter cache
    if (gtfsApiRef.current) {
      gtfsApiRef.current.clearCache()
    }

    try {
      const proxiedGtfsUrl = proxyUrl(gtfsUrl)
      const proxiedRtUrls = gtfsRtUrls.map(url => proxyUrl(url))

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
      setAgencies(agenciesData)

      const routesData = await workerRef.current.getRoutes()
      const sortedRoutes = routesData.sort((a: Route, b: Route) => {
        const aSort = a.route_sort_order ?? 9999
        const bSort = b.route_sort_order ?? 9999
        return aSort - bSort
      })
      setRoutes(sortedRoutes)

      // Fetch stops and update API adapter cache
      const stopsData = await workerRef.current.getStops()
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
  }, [gtfsUrl, gtfsRtUrls])

  const updateRealtimeData = useCallback(async () => {
    if (!workerRef.current || !gtfsLoaded || !gtfsApiRef.current) return

    try {
      const alertsData = await workerRef.current.getAlerts()
      setAlerts(alertsData)

      const vehiclesData = await workerRef.current.getVehiclePositions()
      const tripUpdatesData = await workerRef.current.getTripUpdates()

      // Debug: Log realtime data counts
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

        // If same route or no route, sort by vehicle ID
        const aVehicleId = a.vehicle?.id || ''
        const bVehicleId = b.vehicle?.id || ''
        return aVehicleId.localeCompare(bVehicleId)
      })
      setVehicles(sortedVehicles)

      // Update timestamp to trigger stop times refresh
      setRealtimeLastUpdated(Date.now())
    } catch (err) {
      console.error('Error updating realtime data:', err)
    }
  }, [routes, gtfsLoaded])

  useEffect(() => {
    loadGtfs()
  }, [])

  useEffect(() => {
    if (!workerRef.current || !gtfsLoaded || !autoRefresh) return

    const interval = setInterval(async () => {
      try {
        await workerRef.current!.fetchRealtimeData()
        await updateRealtimeData()
      } catch (err) {
        console.error('Error fetching realtime data:', err)
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [gtfsLoaded, autoRefresh, updateRealtimeData])

  useEffect(() => {
    if (!workerRef.current || !gtfsLoaded || !selectedRoute || !gtfsApiRef.current) return

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    workerRef.current.getTrips({ routeId: selectedRoute, date: today }).then(async tripsData => {
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

  useEffect(() => {
    if (!workerRef.current || !gtfsLoaded || !selectedTrip) return

    workerRef.current.getStopTimes(selectedTrip).then(stopTimesData => {
      // Debug: Check if realtime data is present
      const withRealtime = stopTimesData.filter(st => st.realtime !== undefined)
      if (withRealtime.length > 0) {
        console.log(`Trip ${selectedTrip}: ${withRealtime.length}/${stopTimesData.length} stop times have realtime data`)
      } else {
        console.log(`Trip ${selectedTrip}: No realtime data in stop times`)
      }

      setStopTimes(stopTimesData)
    })
  }, [gtfsLoaded, selectedTrip, realtimeLastUpdated])

  const getRouteById = (routeId: string): Route | undefined => {
    return routes.find((r: Route) => r.route_id === routeId)
  }

  const downloadDatabase = async () => {
    if (!workerRef.current || !gtfsLoaded) return
    try {
      const dbBuffer = await workerRef.current.getDatabase()
      if (!dbBuffer) {
        alert('No database available')
        return
      }

      // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Loading Progress Overlay */}
      {loading && <LoadingProgress progress={loadingProgress} />}

      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-white">GTFS Real-Time Explorer</h1>
          <p className="mt-2 text-blue-100">Explore transit data with gtfs-sqljs (Web Worker)</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Configuration Panel */}
        <ConfigurationPanel
          presets={PRESETS}
          gtfsUrl={gtfsUrl}
          setGtfsUrl={setGtfsUrl}
          gtfsRtUrls={gtfsRtUrls}
          setGtfsRtUrls={setGtfsRtUrls}
          newRtUrl={newRtUrl}
          setNewRtUrl={setNewRtUrl}
          loading={loading}
          error={error}
          autoRefresh={autoRefresh}
          setAutoRefresh={setAutoRefresh}
          gtfs={gtfsLoaded ? {} as any : null}
          loadGtfs={loadGtfs}
          loadPreset={loadPreset}
          addRtUrl={addRtUrl}
          removeRtUrl={removeRtUrl}
          downloadDatabase={downloadDatabase}
        />

        {gtfsLoaded && (
          <>
            {/* Agencies */}
            <AgenciesList agencies={agencies} />

            {/* Routes */}
            <RoutesGrid
              routes={routes}
              selectedRoute={selectedRoute}
              setSelectedRoute={setSelectedRoute}
            />

            {/* Trips */}
            {selectedRoute && trips.length > 0 && gtfsApiRef.current && (
              <TripsList
                trips={trips}
                selectedTrip={selectedTrip}
                setSelectedTrip={setSelectedTrip}
                routes={routes}
                selectedRoute={selectedRoute}
                vehicles={vehicles}
                gtfs={gtfsApiRef.current}
                agencies={agencies}
              />
            )}

            {/* Stop Times */}
            {selectedTrip && stopTimes.length > 0 && gtfsApiRef.current && (
              <StopTimesTable stopTimes={stopTimes} gtfs={gtfsApiRef.current} selectedTrip={selectedTrip} vehicles={vehicles} agencies={agencies} />
            )}

            {/* Active Alerts */}
            <AlertsTable alerts={alerts} getRouteById={getRouteById} />

            {/* Vehicles */}
            {gtfsApiRef.current && (
              <VehiclesTable vehicles={vehicles} getRouteById={getRouteById} gtfs={gtfsApiRef.current} realtimeLastUpdated={realtimeLastUpdated} agencies={agencies} />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-600">
            Powered by{' '}
            <a
              href="https://github.com/sysdevrun/gtfs-sqljs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              gtfs-sqljs
            </a>
            {' '}with Web Workers
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App

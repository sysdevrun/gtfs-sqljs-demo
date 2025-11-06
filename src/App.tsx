import { useState, useEffect, useCallback } from 'react'
import { GtfsSqlJs } from 'gtfs-sqljs'

const PROXY_BASE = 'https://gtfs-proxy.sys-dev-run.re/proxy/'

const proxyUrl = (url: string) => {
  const parsed = new URL(url)
  return PROXY_BASE + parsed.host + parsed.pathname + parsed.search
}

function App() {
  const [gtfsUrl, setGtfsUrl] = useState('https://pysae.com/api/v2/groups/car-jaune/gtfs/pub')
  const [gtfsRtUrl, setGtfsRtUrl] = useState('https://pysae.com/api/v2/groups/car-jaune/gtfs-rt')
  const [gtfs, setGtfs] = useState<GtfsSqlJs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Data states
  const [agencies, setAgencies] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [trips, setTrips] = useState<any[]>([])
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null)
  const [stopTimes, setStopTimes] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])

  // Load GTFS data
  const loadGtfs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const proxiedGtfsUrl = proxyUrl(gtfsUrl)
      const proxiedRtUrl = proxyUrl(gtfsRtUrl)

      const instance = await GtfsSqlJs.fromZip(proxiedGtfsUrl, {
        realtimeFeedUrls: [proxiedRtUrl],
        stalenessThreshold: 120,
        skipFiles: ['shapes.txt'],
        locateFile: (filename: string) => {
          if (filename.endsWith('.wasm')) {
            return import.meta.env.BASE_URL + filename
          }
          return filename
        }
      })

      setGtfs(instance)

      const agenciesData = instance.getAgencies()
      setAgencies(agenciesData)

      const routesData = instance.getRoutes()
      const sortedRoutes = routesData.sort((a: any, b: any) => {
        const aSort = a.route_sort_order ?? 9999
        const bSort = b.route_sort_order ?? 9999
        return aSort - bSort
      })
      setRoutes(sortedRoutes)

      await instance.fetchRealtimeData()
      updateRealtimeData(instance)

      setLoading(false)
    } catch (err: any) {
      setError(err.message || 'Failed to load GTFS data')
      setLoading(false)
    }
  }, [gtfsUrl, gtfsRtUrl])

  const updateRealtimeData = useCallback((instance: GtfsSqlJs) => {
    try {
      const alertsData = instance.getAlerts({ activeOnly: true })
      setAlerts(alertsData)

      const vehiclesData = instance.getVehiclePositions()

      // Debug: Log the first vehicle to see the structure
      if (vehiclesData.length > 0) {
        console.log('Sample vehicle data structure:', JSON.stringify(vehiclesData[0], null, 2))
      }

      // Sort vehicles by route sort order
      const sortedVehicles = vehiclesData.sort((a: any, b: any) => {
        const aRouteId = a.route_id
        const bRouteId = b.route_id
        const aRoute = aRouteId ? routes.find((r: any) => r.route_id === aRouteId) : null
        const bRoute = bRouteId ? routes.find((r: any) => r.route_id === bRouteId) : null

        const aSort = aRoute?.route_sort_order ?? 9999
        const bSort = bRoute?.route_sort_order ?? 9999

        if (aSort !== bSort) return aSort - bSort

        // If same route or no route, sort by vehicle ID
        const aVehicleId = a.vehicle?.id || ''
        const bVehicleId = b.vehicle?.id || ''
        return aVehicleId.localeCompare(bVehicleId)
      })
      setVehicles(sortedVehicles)
    } catch (err) {
      console.error('Error updating realtime data:', err)
    }
  }, [routes])

  useEffect(() => {
    loadGtfs()
  }, [])

  useEffect(() => {
    if (!gtfs || !autoRefresh) return

    const interval = setInterval(async () => {
      try {
        await gtfs.fetchRealtimeData()
        updateRealtimeData(gtfs)
      } catch (err) {
        console.error('Error fetching realtime data:', err)
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [gtfs, autoRefresh, updateRealtimeData])

  useEffect(() => {
    if (!gtfs || !selectedRoute) return

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const tripsData = gtfs.getTrips({
      routeId: selectedRoute,
      date: today,
      includeRealtime: true
    })

    const sortedTrips = tripsData.sort((a: any, b: any) => {
      const aName = a.trip_short_name || a.trip_id
      const bName = b.trip_short_name || b.trip_id
      return aName.localeCompare(bName)
    })

    setTrips(sortedTrips)
    setSelectedTrip(null)
    setStopTimes([])
  }, [gtfs, selectedRoute])

  useEffect(() => {
    if (!gtfs || !selectedTrip) return

    const stopTimesData = gtfs.getStopTimes({
      tripId: selectedTrip,
      includeRealtime: true
    })

    setStopTimes(stopTimesData)
  }, [gtfs, selectedTrip])

  const getContrastColor = (hexColor: string) => {
    if (!hexColor) return '#000000'
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
    return yiq >= 128 ? '#000000' : '#FFFFFF'
  }

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp * 1000).toLocaleString()
  }

  const applyDelayToTime = (timeString: string, delaySeconds?: number) => {
    if (!delaySeconds) return timeString

    // Parse HH:MM:SS format (can have hours >= 24 for next-day times)
    const [hours, minutes, seconds] = timeString.split(':').map(Number)
    let totalSeconds = hours * 3600 + minutes * 60 + seconds + delaySeconds

    // Handle negative times
    if (totalSeconds < 0) totalSeconds = 0

    const newHours = Math.floor(totalSeconds / 3600)
    const newMinutes = Math.floor((totalSeconds % 3600) / 60)
    const newSeconds = totalSeconds % 60

    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}:${String(newSeconds).padStart(2, '0')}`
  }

  const formatTimeWithRealtime = (scheduledTime: string, delay?: number) => {
    if (!delay) {
      return <span className="font-mono">{scheduledTime}</span>
    }

    const actualTime = applyDelayToTime(scheduledTime, delay)
    const delayMinutes = Math.floor(Math.abs(delay) / 60)
    const delaySign = delay > 0 ? '+' : '-'

    return (
      <div className="font-mono">
        <div className="text-gray-900 font-semibold">{actualTime}</div>
        <div className="text-xs text-gray-400 line-through">{scheduledTime}</div>
        <div className={`text-xs font-medium ${delay > 0 ? 'text-red-600' : 'text-green-600'}`}>
          {delaySign}{delayMinutes}min
        </div>
      </div>
    )
  }

  const getVehicleStatus = (status: number) => {
    switch (status) {
      case 0: return 'Incoming'
      case 1: return 'Stopped'
      case 2: return 'In Transit'
      default: return 'Unknown'
    }
  }

  const getVehicleStatusColor = (status: number) => {
    switch (status) {
      case 0: return 'text-yellow-600 bg-yellow-50'
      case 1: return 'text-red-600 bg-red-50'
      case 2: return 'text-green-600 bg-green-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getRouteById = (routeId: string) => {
    return routes.find((r: any) => r.route_id === routeId)
  }

  const getStopById = (stopId: string) => {
    if (!gtfs) return null
    return gtfs.getStopById(stopId)
  }

  const groupTripsByDirection = (trips: any[]) => {
    const grouped: { [key: string]: any[] } = {}
    trips.forEach(trip => {
      const dirId = trip.direction_id ?? '0'
      if (!grouped[dirId]) grouped[dirId] = []
      grouped[dirId].push(trip)
    })
    return grouped
  }

  const getTripVehicle = (tripId: string) => {
    return vehicles.find((v: any) => v.trip_id === tripId)
  }

  const downloadDatabase = async () => {
    if (!gtfs) return
    try {
      const db = gtfs.getDatabase()
      const dbBuffer = db.export()
      const blob = new Blob([dbBuffer], { type: 'application/x-sqlite3' })
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
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-white">GTFS Real-Time Explorer</h1>
          <p className="mt-2 text-blue-100">Explore transit data with gtfs-sqljs</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Configuration Panel */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GTFS URL
              </label>
              <input
                type="text"
                value={gtfsUrl}
                onChange={(e) => setGtfsUrl(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GTFS-RT URL
              </label>
              <input
                type="text"
                value={gtfsRtUrl}
                onChange={(e) => setGtfsRtUrl(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadGtfs}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Loading...' : 'Reload'}
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-6 py-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                autoRefresh
                  ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500'
              }`}
            >
              {autoRefresh ? '✓ Auto-Refresh' : 'Auto-Refresh Off'}
            </button>
            {gtfs && (
              <button
                onClick={downloadDatabase}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
              >
                Download Database
              </button>
            )}
          </div>
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
        </div>

        {gtfs && (
          <>
            {/* Agencies */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Agencies</h2>
              <div className="space-y-3">
                {agencies.map((agency: any) => (
                  <div
                    key={agency.agency_id}
                    className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100"
                  >
                    <div className="font-semibold text-gray-900">{agency.agency_name}</div>
                    {agency.agency_url && (
                      <a
                        href={agency.agency_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Visit Website →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Routes */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Routes</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {routes.map((route: any) => {
                  const bgColor = route.route_color ? `#${route.route_color}` : '#3b82f6'
                  const textColor = route.route_text_color
                    ? `#${route.route_text_color}`
                    : getContrastColor(bgColor)
                  const isSelected = selectedRoute === route.route_id

                  return (
                    <button
                      key={route.route_id}
                      onClick={() => setSelectedRoute(route.route_id)}
                      style={{ backgroundColor: bgColor, color: textColor }}
                      className={`p-4 rounded-lg font-semibold transition-all hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                        isSelected ? 'ring-4 ring-blue-500 shadow-xl scale-105' : 'shadow-md'
                      }`}
                    >
                      <div className="text-lg">{route.route_short_name || route.route_id}</div>
                      <div className="text-xs mt-1 opacity-90 line-clamp-2">
                        {route.route_long_name}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Trips */}
            {selectedRoute && trips.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Trips for Route{' '}
                  <span className="text-blue-600">
                    {routes.find((r) => r.route_id === selectedRoute)?.route_short_name}
                  </span>
                </h2>
                {Object.entries(groupTripsByDirection(trips)).map(([directionId, dirTrips]) => (
                  <div key={directionId} className="mb-6 last:mb-0">
                    <h3 className="text-lg font-medium text-gray-700 mb-3">
                      Direction {directionId}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {(dirTrips as any[]).map((trip: any) => {
                        const vehicleOnTrip = getTripVehicle(trip.trip_id)
                        return (
                          <button
                            key={trip.trip_id}
                            onClick={() => setSelectedTrip(trip.trip_id)}
                            className={`p-3 rounded-lg text-sm font-medium transition-all hover:shadow-md relative ${
                              selectedTrip === trip.trip_id
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {vehicleOnTrip && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                            )}
                            <div>{trip.trip_short_name || trip.trip_id}</div>
                            {trip.trip_headsign && (
                              <div className="text-xs mt-1 opacity-80 truncate">
                                {trip.trip_headsign}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stop Times */}
            {selectedTrip && stopTimes.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Stop Times</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Seq
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Stop Name
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Arrival
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Departure
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stopTimes.map((st: any, idx: number) => {
                        const stop = getStopById(st.stop_id)

                        return (
                          <tr
                            key={`${st.trip_id}-${st.stop_sequence}`}
                            className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                              idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                            }`}
                          >
                            <td className="py-3 px-4 text-sm font-medium text-gray-600">
                              {st.stop_sequence}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900">
                              {stop?.stop_name || st.stop_id}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">
                              {formatTimeWithRealtime(st.arrival_time, st.realtime?.arrival_delay)}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">
                              {formatTimeWithRealtime(st.departure_time, st.realtime?.departure_delay)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Active Alerts */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Active Alerts</h2>
              {alerts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No active alerts</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Header
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Description
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Routes
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Period
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((alert: any, idx: number) => {
                        const affectedRoutes = alert.informed_entity
                          ?.map((entity: any) => entity.route_id)
                          .filter(Boolean)
                          .map((routeId: string) => getRouteById(routeId))
                          .filter(Boolean) || []

                        const activePeriod = alert.active_period?.[0]

                        return (
                          <tr
                            key={alert.id || idx}
                            className={`border-b border-gray-100 hover:bg-orange-50 transition-colors ${
                              idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                            }`}
                          >
                            <td className="py-3 px-4 text-sm font-medium text-gray-900">
                              {alert.header_text?.translation?.[0]?.text || 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">
                              {alert.description_text?.translation?.[0]?.text || 'N/A'}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1">
                                {affectedRoutes.map((route: any) => {
                                  const bgColor = route.route_color
                                    ? `#${route.route_color}`
                                    : '#3b82f6'
                                  const textColor = route.route_text_color
                                    ? `#${route.route_text_color}`
                                    : getContrastColor(bgColor)
                                  return (
                                    <span
                                      key={route.route_id}
                                      style={{ backgroundColor: bgColor, color: textColor }}
                                      className="px-2 py-1 rounded text-xs font-semibold"
                                    >
                                      {route.route_short_name}
                                    </span>
                                  )
                                })}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs text-gray-600">
                              <div>{formatDate(activePeriod?.start)}</div>
                              <div className="text-gray-500">to</div>
                              <div>{formatDate(activePeriod?.end)}</div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Vehicles */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Vehicle Positions</h2>
              {vehicles.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No vehicle positions available</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Vehicle
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Route
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Trip
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Position
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                          Current Stop
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((vehicle: any, idx: number) => {
                        // Extract vehicle position properties
                        const routeId = vehicle.route_id
                        const tripId = vehicle.trip_id
                        const vehicleInfo = vehicle.vehicle
                        const position = vehicle.position
                        const stopId = vehicle.stop_id
                        const currentStatus = vehicle.current_status

                        const route = routeId ? getRouteById(routeId) : null
                        const currentStop = stopId ? getStopById(stopId) : null
                        const trip = tripId && gtfs ? gtfs.getTripById(tripId) : null

                        return (
                          <tr
                            key={vehicleInfo?.id || idx}
                            className={`border-b border-gray-100 hover:bg-green-50 transition-colors ${
                              idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                            }`}
                          >
                            <td className="py-3 px-4 text-sm">
                              <div className="font-medium text-gray-900">
                                {vehicleInfo?.label || vehicleInfo?.id || 'N/A'}
                              </div>
                              {vehicleInfo?.licensePlate && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {vehicleInfo.licensePlate}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {route ? (
                                <span
                                  style={{
                                    backgroundColor: route.route_color
                                      ? `#${route.route_color}`
                                      : '#3b82f6',
                                    color: route.route_text_color
                                      ? `#${route.route_text_color}`
                                      : getContrastColor(
                                          route.route_color ? `#${route.route_color}` : '#3b82f6'
                                        ),
                                  }}
                                  className="px-2 py-1 rounded text-sm font-semibold inline-block"
                                >
                                  {route.route_short_name}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-sm">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">
                              {trip ? (
                                <div>
                                  <div className="font-medium">
                                    {trip.trip_short_name || tripId}
                                  </div>
                                  {trip.trip_headsign && (
                                    <div className="text-xs text-gray-500 truncate max-w-xs">
                                      {trip.trip_headsign}
                                    </div>
                                  )}
                                </div>
                              ) : tripId ? (
                                <div className="text-xs text-gray-500">{tripId}</div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-gray-700">
                              <div>Lat: {position?.latitude?.toFixed(6) || 'N/A'}</div>
                              <div>Lng: {position?.longitude?.toFixed(6) || 'N/A'}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getVehicleStatusColor(
                                  currentStatus
                                )}`}
                              >
                                {getVehicleStatus(currentStatus)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">
                              {currentStop?.stop_name || stopId || 'N/A'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App

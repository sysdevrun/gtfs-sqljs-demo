import { useState, useEffect, useCallback } from 'react'
import { GtfsSqlJs } from 'gtfs-sqljs'
import './App.css'

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
        stalenessThreshold: 120
      })

      setGtfs(instance)

      // Load initial data
      const agenciesData = instance.getAgencies()
      setAgencies(agenciesData)

      const routesData = instance.getRoutes()
      // Sort by route_sort_order
      const sortedRoutes = routesData.sort((a: any, b: any) => {
        const aSort = a.route_sort_order ?? 9999
        const bSort = b.route_sort_order ?? 9999
        return aSort - bSort
      })
      setRoutes(sortedRoutes)

      // Fetch realtime data
      await instance.fetchRealtimeData()
      updateRealtimeData(instance)

      setLoading(false)
    } catch (err: any) {
      setError(err.message || 'Failed to load GTFS data')
      setLoading(false)
    }
  }, [gtfsUrl, gtfsRtUrl])

  // Update realtime data
  const updateRealtimeData = useCallback((instance: GtfsSqlJs) => {
    try {
      const alertsData = instance.getAlerts({ activeOnly: true })
      setAlerts(alertsData)

      const vehiclesData = instance.getVehiclePositions()
      setVehicles(vehiclesData)
    } catch (err) {
      console.error('Error updating realtime data:', err)
    }
  }, [])

  // Load GTFS on mount
  useEffect(() => {
    loadGtfs()
  }, [])

  // Auto-refresh realtime data every 10 seconds
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

  // Load trips when route is selected
  useEffect(() => {
    if (!gtfs || !selectedRoute) return

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const tripsData = gtfs.getTrips({
      routeId: selectedRoute,
      date: today,
      includeRealtime: true
    })

    // Sort by trip_short_name
    const sortedTrips = tripsData.sort((a: any, b: any) => {
      const aName = a.trip_short_name || a.trip_id
      const bName = b.trip_short_name || b.trip_id
      return aName.localeCompare(bName)
    })

    setTrips(sortedTrips)
    setSelectedTrip(null)
    setStopTimes([])
  }, [gtfs, selectedRoute])

  // Load stop times when trip is selected
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

  const getVehicleStatus = (status: number) => {
    switch (status) {
      case 0: return 'INCOMING_AT'
      case 1: return 'STOPPED_AT'
      case 2: return 'IN_TRANSIT_TO'
      default: return 'UNKNOWN'
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

  return (
    <div className="app">
      <header>
        <h1>GTFS SQL.js Demo</h1>
      </header>

      <div className="config-panel">
        <div className="config-row">
          <label>
            GTFS URL:
            <input
              type="text"
              value={gtfsUrl}
              onChange={(e) => setGtfsUrl(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            GTFS-RT URL:
            <input
              type="text"
              value={gtfsRtUrl}
              onChange={(e) => setGtfsRtUrl(e.target.value)}
              disabled={loading}
            />
          </label>
          <button onClick={loadGtfs} disabled={loading}>
            {loading ? 'Loading...' : 'Reload'}
          </button>
          <button onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? 'Stop Auto-Refresh' : 'Start Auto-Refresh'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {gtfs && (
        <div className="content">
          <section className="section">
            <h2>Agencies</h2>
            <div className="agencies">
              {agencies.map((agency: any) => (
                <div key={agency.agency_id} className="agency-item">
                  <strong>{agency.agency_name}</strong>
                  {agency.agency_url && (
                    <span> - <a href={agency.agency_url} target="_blank" rel="noopener noreferrer">Website</a></span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <h2>Routes</h2>
            <div className="routes-grid">
              {routes.map((route: any) => {
                const bgColor = route.route_color ? `#${route.route_color}` : '#333333'
                const textColor = route.route_text_color ? `#${route.route_text_color}` : getContrastColor(bgColor)

                return (
                  <div
                    key={route.route_id}
                    className={`route-item ${selectedRoute === route.route_id ? 'selected' : ''}`}
                    onClick={() => setSelectedRoute(route.route_id)}
                    style={{
                      backgroundColor: bgColor,
                      color: textColor,
                      cursor: 'pointer',
                      padding: '8px',
                      margin: '4px',
                      borderRadius: '4px',
                      border: selectedRoute === route.route_id ? '2px solid #646cff' : '2px solid transparent'
                    }}
                  >
                    <strong>{route.route_short_name || route.route_id}</strong>
                    <div style={{ fontSize: '0.85em' }}>{route.route_long_name}</div>
                  </div>
                )
              })}
            </div>
          </section>

          {selectedRoute && (
            <section className="section">
              <h2>Trips for Route {routes.find(r => r.route_id === selectedRoute)?.route_short_name}</h2>
              {Object.entries(groupTripsByDirection(trips)).map(([directionId, dirTrips]) => (
                <div key={directionId}>
                  <h3>Direction {directionId}</h3>
                  <div className="trips-list">
                    {(dirTrips as any[]).map((trip: any) => (
                      <div
                        key={trip.trip_id}
                        className={`trip-item ${selectedTrip === trip.trip_id ? 'selected' : ''}`}
                        onClick={() => setSelectedTrip(trip.trip_id)}
                        style={{
                          cursor: 'pointer',
                          padding: '8px',
                          margin: '4px',
                          border: selectedTrip === trip.trip_id ? '2px solid #646cff' : '1px solid #444',
                          borderRadius: '4px'
                        }}
                      >
                        {trip.trip_short_name || trip.trip_id}
                        {trip.trip_headsign && <span> - {trip.trip_headsign}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {selectedTrip && stopTimes.length > 0 && (
            <section className="section">
              <h2>Stop Times for Trip</h2>
              <table>
                <thead>
                  <tr>
                    <th>Sequence</th>
                    <th>Stop Name</th>
                    <th>Arrival Time</th>
                    <th>Departure Time</th>
                  </tr>
                </thead>
                <tbody>
                  {stopTimes.map((st: any) => {
                    const stop = getStopById(st.stop_id)
                    return (
                      <tr key={`${st.trip_id}-${st.stop_sequence}`}>
                        <td>{st.stop_sequence}</td>
                        <td>{stop?.stop_name || st.stop_id}</td>
                        <td>{st.arrival_time}</td>
                        <td>{st.departure_time}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}

          <section className="section">
            <h2>Active Alerts</h2>
            {alerts.length === 0 ? (
              <p>No active alerts</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Header</th>
                    <th>Description</th>
                    <th>Affected Routes</th>
                    <th>Start</th>
                    <th>End</th>
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
                      <tr key={alert.id || idx}>
                        <td>{alert.header_text?.translation?.[0]?.text || 'N/A'}</td>
                        <td>{alert.description_text?.translation?.[0]?.text || 'N/A'}</td>
                        <td>
                          {affectedRoutes.map((route: any) => {
                            const bgColor = route.route_color ? `#${route.route_color}` : '#333333'
                            const textColor = route.route_text_color ? `#${route.route_text_color}` : getContrastColor(bgColor)
                            return (
                              <span
                                key={route.route_id}
                                className="route-badge"
                                style={{
                                  backgroundColor: bgColor,
                                  color: textColor,
                                  marginRight: '4px'
                                }}
                              >
                                {route.route_short_name}
                              </span>
                            )
                          })}
                        </td>
                        <td>{formatDate(activePeriod?.start)}</td>
                        <td>{formatDate(activePeriod?.end)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="section">
            <h2>Vehicles</h2>
            {vehicles.length === 0 ? (
              <p>No vehicle positions available</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Vehicle ID</th>
                    <th>Route</th>
                    <th>Trip</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Status</th>
                    <th>Current Stop</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle: any) => {
                    const route = getRouteById(vehicle.trip?.route_id)
                    const currentStop = vehicle.stop_id ? getStopById(vehicle.stop_id) : null

                    return (
                      <tr key={vehicle.vehicle?.id || vehicle.trip?.trip_id}>
                        <td>{vehicle.vehicle?.id || 'N/A'}</td>
                        <td>
                          {route && (
                            <span
                              className="route-badge"
                              style={{
                                backgroundColor: route.route_color ? `#${route.route_color}` : '#333333',
                                color: route.route_text_color ? `#${route.route_text_color}` : getContrastColor(route.route_color ? `#${route.route_color}` : '#333333')
                              }}
                            >
                              {route.route_short_name}
                            </span>
                          )}
                        </td>
                        <td>{vehicle.trip?.trip_id || 'N/A'}</td>
                        <td>{vehicle.position?.latitude?.toFixed(6) || 'N/A'}</td>
                        <td>{vehicle.position?.longitude?.toFixed(6) || 'N/A'}</td>
                        <td>{getVehicleStatus(vehicle.current_status)}</td>
                        <td>{currentStop?.stop_name || vehicle.stop_id || 'N/A'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App

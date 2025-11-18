import { useEffect, useState } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Collapse, IconButton, Chip } from '@mui/material'
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material'
import { Alert, VehiclePosition, TripUpdate, StopTimeUpdate, Route, Trip } from 'gtfs-sqljs'
import type { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'

// Helper function to format time as HH:MM:SS
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

// Helper function to format active period
const formatActivePeriod = (start?: number, end?: number): string => {
  if (!start && !end) return '-'
  const parts = []
  if (start) parts.push(`From ${new Date(start * 1000).toLocaleString()}`)
  if (end) parts.push(`Until ${new Date(end * 1000).toLocaleString()}`)
  return parts.join(' ')
}

// Helper function to format relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000)
  const seconds = now - timestamp

  if (seconds < 60) return `${seconds} seconds ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

// Helper function to format schedule relationship
const formatScheduleRelationship = (rel?: number): string => {
  if (rel === undefined) return '-'
  switch (rel) {
    case 0: return 'SCHEDULED'
    case 1: return 'ADDED'
    case 2: return 'UNSCHEDULED'
    case 3: return 'CANCELED'
    default: return String(rel)
  }
}

interface RealtimeDataTabProps {
  workerApi: Remote<GtfsWorkerAPI> | null
  realtimeLastUpdated: number
}

export default function RealtimeDataTab({ workerApi, realtimeLastUpdated }: RealtimeDataTabProps) {
  const [tripUpdates, setTripUpdates] = useState<TripUpdate[]>([])
  const [vehiclePositions, setVehiclePositions] = useState<VehiclePosition[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null)
  const [tripStopTimes, setTripStopTimes] = useState<Record<string, StopTimeUpdate[]>>({})
  const [routes, setRoutes] = useState<Record<string, Route>>({})
  const [trips, setTrips] = useState<Record<string, Trip>>({})
  const [stops, setStops] = useState<Record<string, any>>({})

  useEffect(() => {
    const fetchData = async () => {
      if (!workerApi) return

      try {
        const [tripUpdateData, vehicles, serviceAlerts] = await Promise.all([
          workerApi.getTripUpdates(),
          workerApi.getVehiclePositions(),
          workerApi.getAlerts()
        ])

        setTripUpdates(tripUpdateData)
        setVehiclePositions(vehicles)
        setAlerts(serviceAlerts)

        // Fetch routes and trips for the trip updates
        const routeIds = [...new Set(tripUpdateData.map(tu => tu.route_id).filter(Boolean))]
        const tripIds = [...new Set(tripUpdateData.map(tu => tu.trip_id).filter(Boolean))]

        const [routeData, tripData] = await Promise.all([
          Promise.all(routeIds.map(async (routeId) => {
            const routes = await workerApi.getRoutes({ routeId })
            return routes[0]
          })),
          Promise.all(tripIds.map(async (tripId) => {
            const trips = await workerApi.getTrips({ tripId })
            return trips[0]
          }))
        ])

        // Create lookup maps
        const routeMap: Record<string, Route> = {}
        routeData.forEach(route => {
          if (route) routeMap[route.route_id] = route
        })

        const tripMap: Record<string, Trip> = {}
        tripData.forEach(trip => {
          if (trip) tripMap[trip.trip_id] = trip
        })

        setRoutes(routeMap)
        setTrips(tripMap)
      } catch (error) {
        console.error('Error fetching GTFS-RT data:', error)
      } finally {
        setInitialLoading(false)
      }
    }

    fetchData()
  }, [workerApi, realtimeLastUpdated])

  const handleTripClick = async (tripId: string) => {
    if (expandedTripId === tripId) {
      setExpandedTripId(null)
      return
    }

    setExpandedTripId(tripId)

    // Fetch stop times if not already cached
    if (!tripStopTimes[tripId] && workerApi) {
      try {
        const stopTimes = await workerApi.getStopTimeUpdates({ tripId })
        setTripStopTimes(prev => ({ ...prev, [tripId]: stopTimes }))

        // Fetch stop data for all stops in this trip
        const stopIds = [...new Set(stopTimes.map(st => st.stop_id).filter(Boolean))]
        const stopData = await Promise.all(
          stopIds.map(async (stopId) => {
            const stops = await workerApi.getStops({ stopId })
            return stops[0]
          })
        )

        // Update stops cache
        const newStops: Record<string, any> = {}
        stopData.forEach(stop => {
          if (stop) newStops[stop.stop_id] = stop
        })
        setStops(prev => ({ ...prev, ...newStops }))
      } catch (error) {
        console.error('Error fetching stop times for trip:', error)
      }
    }
  }

  if (initialLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading GTFS-RT data...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        GTFS-RT Data
      </Typography>
      {realtimeLastUpdated > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Last updated: {new Date(realtimeLastUpdated).toLocaleString()}
        </Typography>
      )}

      {/* Trip Updates */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="h6">Trip Updates ({tripUpdates.length})</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Trip</TableCell>
                <TableCell>Route</TableCell>
                <TableCell>Vehicle ID</TableCell>
                <TableCell>Vehicle Label</TableCell>
                <TableCell>Delay (s)</TableCell>
                <TableCell>Schedule Rel.</TableCell>
                <TableCell>Timestamp</TableCell>
                <TableCell>Stop Time Updates</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...tripUpdates].sort((a, b) => {
                const tripA = trips[a.trip_id]
                const tripB = trips[b.trip_id]
                const nameA = tripA?.trip_short_name || a.trip_id
                const nameB = tripB?.trip_short_name || b.trip_id
                return nameA.localeCompare(nameB, undefined, { numeric: true })
              }).map((tu, idx) => (
                <>
                  <TableRow
                    key={idx}
                    hover
                    onClick={() => handleTripClick(tu.trip_id)}
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <TableCell>
                      <IconButton size="small">
                        {expandedTripId === tu.trip_id ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      {trips[tu.trip_id] ? (
                        <Box>
                          <Typography variant="body2">{trips[tu.trip_id].trip_short_name || tu.trip_id}</Typography>
                          <Typography variant="caption" color="text.secondary">{tu.trip_id}</Typography>
                        </Box>
                      ) : (
                        tu.trip_id
                      )}
                    </TableCell>
                    <TableCell>
                      {tu.route_id && routes[tu.route_id] ? (
                        <Box>
                          <Chip
                            label={routes[tu.route_id].route_short_name || routes[tu.route_id].route_long_name}
                            size="small"
                            sx={{
                              bgcolor: `#${routes[tu.route_id].route_color || 'cccccc'}`,
                              color: `#${routes[tu.route_id].route_text_color || '000000'}`,
                              fontWeight: 'bold'
                            }}
                          />
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            {tu.route_id}
                          </Typography>
                        </Box>
                      ) : (
                        tu.route_id || '-'
                      )}
                    </TableCell>
                    <TableCell>{tu.vehicle?.id || '-'}</TableCell>
                    <TableCell>{tu.vehicle?.label || '-'}</TableCell>
                    <TableCell>{tu.delay ?? '-'}</TableCell>
                    <TableCell>{formatScheduleRelationship(tu.schedule_relationship)}</TableCell>
                    <TableCell>{tu.timestamp ? formatTime(tu.timestamp) : '-'}</TableCell>
                    <TableCell>{tu.stop_time_update?.length || 0}</TableCell>
                    <TableCell>{formatRelativeTime(tu.rt_last_updated)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
                      <Collapse in={expandedTripId === tu.trip_id} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Stop Sequence</TableCell>
                                <TableCell>Stop</TableCell>
                                <TableCell>Arrival Delay (s)</TableCell>
                                <TableCell>Arrival Time</TableCell>
                                <TableCell>Departure Delay (s)</TableCell>
                                <TableCell>Departure Time</TableCell>
                                <TableCell>Schedule Relationship</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {tripStopTimes[tu.trip_id]?.map((stu, stuIdx) => (
                                <TableRow key={stuIdx}>
                                  <TableCell>{stu.stop_sequence ?? '-'}</TableCell>
                                  <TableCell>
                                    {stu.stop_id && stops[stu.stop_id] ? (
                                      <Box>
                                        <Typography variant="body2">{stops[stu.stop_id].stop_name}</Typography>
                                        <Typography variant="caption" color="text.secondary">{stu.stop_id}</Typography>
                                      </Box>
                                    ) : (
                                      stu.stop_id || '-'
                                    )}
                                  </TableCell>
                                  <TableCell>{stu.arrival?.delay ?? '-'}</TableCell>
                                  <TableCell>{stu.arrival?.time ? formatTime(stu.arrival.time) : '-'}</TableCell>
                                  <TableCell>{stu.departure?.delay ?? '-'}</TableCell>
                                  <TableCell>{stu.departure?.time ? formatTime(stu.departure.time) : '-'}</TableCell>
                                  <TableCell>{stu.schedule_relationship ?? '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Vehicle Positions */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="h6">Vehicle Positions ({vehiclePositions.length})</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Trip ID</TableCell>
                <TableCell>Route ID</TableCell>
                <TableCell>Vehicle ID</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Latitude</TableCell>
                <TableCell>Longitude</TableCell>
                <TableCell>Bearing</TableCell>
                <TableCell>Speed (m/s)</TableCell>
                <TableCell>Stop ID</TableCell>
                <TableCell>Current Stop Seq.</TableCell>
                <TableCell>Current Status</TableCell>
                <TableCell>Timestamp</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vehiclePositions.map((vp, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{vp.trip_id}</TableCell>
                  <TableCell>{vp.route_id || '-'}</TableCell>
                  <TableCell>{vp.vehicle?.id || '-'}</TableCell>
                  <TableCell>{vp.vehicle?.label || '-'}</TableCell>
                  <TableCell>{vp.position?.latitude?.toFixed(5) || '-'}</TableCell>
                  <TableCell>{vp.position?.longitude?.toFixed(5) || '-'}</TableCell>
                  <TableCell>{vp.position?.bearing ?? '-'}</TableCell>
                  <TableCell>{vp.position?.speed ?? '-'}</TableCell>
                  <TableCell>{vp.stop_id || '-'}</TableCell>
                  <TableCell>{vp.current_stop_sequence ?? '-'}</TableCell>
                  <TableCell>{vp.current_status ?? '-'}</TableCell>
                  <TableCell>{vp.timestamp ? formatTime(vp.timestamp) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Alerts */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 2, bgcolor: 'warning.main', color: 'white' }}>
          <Typography variant="h6">Service Alerts ({alerts.length})</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Header</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>ID</TableCell>
                <TableCell>Cause</TableCell>
                <TableCell>Effect</TableCell>
                <TableCell>Active Period</TableCell>
                <TableCell>URL</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>
                    {typeof alert.header_text === 'string'
                      ? alert.header_text
                      : alert.header_text?.translation?.[0]?.text || '-'}
                  </TableCell>
                  <TableCell>
                    {typeof alert.description_text === 'string'
                      ? alert.description_text
                      : alert.description_text?.translation?.[0]?.text || '-'}
                  </TableCell>
                  <TableCell>{alert.id || '-'}</TableCell>
                  <TableCell>{alert.cause ?? '-'}</TableCell>
                  <TableCell>{alert.effect ?? '-'}</TableCell>
                  <TableCell>
                    {alert.active_period?.[0]
                      ? formatActivePeriod(alert.active_period[0].start, alert.active_period[0].end)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {alert.url ? (
                      typeof alert.url === 'string' ? (
                        <a href={alert.url} target="_blank" rel="noopener noreferrer">Link</a>
                      ) : (
                        <a href={alert.url?.translation?.[0]?.text} target="_blank" rel="noopener noreferrer">Link</a>
                      )
                    ) : '-'}
                  </TableCell>
                  <TableCell>{formatRelativeTime(alert.rt_last_updated)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

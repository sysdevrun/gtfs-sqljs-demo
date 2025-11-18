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

// Helper function to format alert cause
const formatCause = (cause?: number): string => {
  if (cause === undefined) return 'Unknown'
  switch (cause) {
    case 1: return 'Unknown Cause'
    case 2: return 'Other Cause'
    case 3: return 'Technical Problem'
    case 4: return 'Strike'
    case 5: return 'Demonstration'
    case 6: return 'Accident'
    case 7: return 'Holiday'
    case 8: return 'Weather'
    case 9: return 'Maintenance'
    case 10: return 'Construction'
    case 11: return 'Police Activity'
    case 12: return 'Medical Emergency'
    default: return 'Unknown'
  }
}

// Helper function to format alert effect
const formatEffect = (effect?: number): string => {
  if (effect === undefined) return 'Unknown'
  switch (effect) {
    case 1: return 'No Service'
    case 2: return 'Reduced Service'
    case 3: return 'Significant Delays'
    case 4: return 'Detour'
    case 5: return 'Additional Service'
    case 6: return 'Modified Service'
    case 7: return 'Other Effect'
    case 8: return 'Unknown Effect'
    case 9: return 'Stop Moved'
    case 10: return 'No Effect'
    case 11: return 'Accessibility Issue'
    default: return 'Unknown'
  }
}

// Helper function to format vehicle current status
const formatCurrentStatus = (status?: number): string => {
  if (status === undefined) return 'Unknown'
  switch (status) {
    case 0: return 'Incoming At'
    case 1: return 'Stopped At'
    case 2: return 'In Transit To'
    default: return 'Unknown'
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

        // Fetch routes and stops for alerts
        const alertRouteIds = [...new Set(
          serviceAlerts.flatMap(alert =>
            alert.informed_entity?.map(entity => entity.route_id).filter(Boolean) || []
          )
        )]
        const alertStopIds = [...new Set(
          serviceAlerts.flatMap(alert =>
            alert.informed_entity?.map(entity => entity.stop_id).filter(Boolean) || []
          )
        )]

        // Fetch stops for vehicle positions
        const vehicleStopIds = [...new Set(vehicles.map(v => v.stop_id).filter(Boolean))]

        // Combine all stop IDs
        const allStopIds = [...new Set([...alertStopIds, ...vehicleStopIds])]

        // Combine all route IDs
        const allRouteIds = [...new Set([...routeIds, ...alertRouteIds])]

        // Fetch all data in bulk with single queries
        const [routeData, tripData, stopData] = await Promise.all([
          allRouteIds.length > 0 ? workerApi.getRoutes({ routeId: allRouteIds }) : Promise.resolve([]),
          tripIds.length > 0 ? workerApi.getTrips({ tripId: tripIds }) : Promise.resolve([]),
          allStopIds.length > 0 ? workerApi.getStops({ stopId: allStopIds }) : Promise.resolve([])
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

        const stopMap: Record<string, any> = {}
        stopData.forEach(stop => {
          if (stop) stopMap[stop.stop_id] = stop
        })

        setRoutes(routeMap)
        setTrips(tripMap)
        setStops(stopMap)
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

        // Fetch stop data for all stops in this trip with a single query
        const stopIds = [...new Set(stopTimes.map(st => st.stop_id).filter(Boolean))]
        if (stopIds.length > 0) {
          const stopData = await workerApi.getStops({ stopId: stopIds })

          // Update stops cache
          const newStops: Record<string, any> = {}
          stopData.forEach(stop => {
            if (stop) newStops[stop.stop_id] = stop
          })
          setStops(prev => ({ ...prev, ...newStops }))
        }
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
                const routeA = a.route_id ? routes[a.route_id] : null
                const routeB = b.route_id ? routes[b.route_id] : null

                // Sort by route_sort_order first
                const sortOrderA = routeA?.route_sort_order ?? 999999
                const sortOrderB = routeB?.route_sort_order ?? 999999

                if (sortOrderA !== sortOrderB) {
                  return sortOrderA - sortOrderB
                }

                // Then by trip short name
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
                <TableCell>Trip</TableCell>
                <TableCell>Route</TableCell>
                <TableCell>Vehicle ID</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Latitude</TableCell>
                <TableCell>Longitude</TableCell>
                <TableCell>Bearing</TableCell>
                <TableCell>Speed (m/s)</TableCell>
                <TableCell>Stop</TableCell>
                <TableCell>Current Stop Seq.</TableCell>
                <TableCell>Current Status</TableCell>
                <TableCell>Timestamp</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...vehiclePositions].sort((a, b) => {
                const routeA = a.route_id ? routes[a.route_id] : null
                const routeB = b.route_id ? routes[b.route_id] : null

                // Sort by route_sort_order first
                const sortOrderA = routeA?.route_sort_order ?? 999999
                const sortOrderB = routeB?.route_sort_order ?? 999999

                if (sortOrderA !== sortOrderB) {
                  return sortOrderA - sortOrderB
                }

                // Then by trip short name
                const tripA = trips[a.trip_id]
                const tripB = trips[b.trip_id]
                const nameA = tripA?.trip_short_name || a.trip_id
                const nameB = tripB?.trip_short_name || b.trip_id
                return nameA.localeCompare(nameB, undefined, { numeric: true })
              }).map((vp, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>
                    {trips[vp.trip_id] ? (
                      <Box>
                        <Typography variant="body2">{trips[vp.trip_id].trip_short_name || vp.trip_id}</Typography>
                        <Typography variant="caption" color="text.secondary">{vp.trip_id}</Typography>
                      </Box>
                    ) : (
                      vp.trip_id
                    )}
                  </TableCell>
                  <TableCell>
                    {vp.route_id && routes[vp.route_id] ? (
                      <Box>
                        <Chip
                          label={routes[vp.route_id].route_short_name || routes[vp.route_id].route_long_name}
                          size="small"
                          sx={{
                            bgcolor: `#${routes[vp.route_id].route_color || 'cccccc'}`,
                            color: `#${routes[vp.route_id].route_text_color || '000000'}`,
                            fontWeight: 'bold'
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          {vp.route_id}
                        </Typography>
                      </Box>
                    ) : (
                      vp.route_id || '-'
                    )}
                  </TableCell>
                  <TableCell>{vp.vehicle?.id || '-'}</TableCell>
                  <TableCell>{vp.vehicle?.label || '-'}</TableCell>
                  <TableCell>{vp.position?.latitude?.toFixed(5) || '-'}</TableCell>
                  <TableCell>{vp.position?.longitude?.toFixed(5) || '-'}</TableCell>
                  <TableCell>{vp.position?.bearing ?? '-'}</TableCell>
                  <TableCell>{vp.position?.speed ?? '-'}</TableCell>
                  <TableCell>
                    {vp.stop_id && stops[vp.stop_id] ? (
                      <Box>
                        <Typography variant="body2">{stops[vp.stop_id].stop_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{vp.stop_id}</Typography>
                      </Box>
                    ) : (
                      vp.stop_id || '-'
                    )}
                  </TableCell>
                  <TableCell>{vp.current_stop_sequence ?? '-'}</TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2">{formatCurrentStatus(vp.current_status)}</Typography>
                      {vp.current_status !== undefined && (
                        <Typography variant="caption" color="text.secondary">{vp.current_status}</Typography>
                      )}
                    </Box>
                  </TableCell>
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
                <TableCell>Impacted Routes</TableCell>
                <TableCell>Impacted Stops</TableCell>
                <TableCell>ID</TableCell>
                <TableCell>Cause</TableCell>
                <TableCell>Effect</TableCell>
                <TableCell>Active Period</TableCell>
                <TableCell>URL</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert, idx) => {
                // Extract unique route IDs and stop IDs from informed entities
                const impactedRouteIds = [...new Set(
                  alert.informed_entity?.map(entity => entity.route_id).filter(Boolean) || []
                )]
                const impactedStopIds = [...new Set(
                  alert.informed_entity?.map(entity => entity.stop_id).filter(Boolean) || []
                )]
                const impactedStopNames = impactedStopIds
                  .map(stopId => stops[stopId]?.stop_name || stopId)
                  .join(', ')

                return (
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
                    <TableCell>
                      {impactedRouteIds.length > 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {impactedRouteIds.map(routeId => {
                            const route = routes[routeId]
                            return route ? (
                              <Chip
                                key={routeId}
                                label={route.route_short_name || route.route_long_name}
                                size="small"
                                sx={{
                                  bgcolor: `#${route.route_color || 'cccccc'}`,
                                  color: `#${route.route_text_color || '000000'}`,
                                  fontWeight: 'bold'
                                }}
                              />
                            ) : (
                              <span key={routeId}>{routeId}</span>
                            )
                          })}
                        </Box>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {impactedStopIds.length > 0 ? (
                        <span title={impactedStopNames} style={{ textDecoration: 'underline', cursor: 'help' }}>
                          {impactedStopIds.length}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{alert.id || '-'}</TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{formatCause(alert.cause)}</Typography>
                        {alert.cause !== undefined && (
                          <Typography variant="caption" color="text.secondary">{alert.cause}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{formatEffect(alert.effect)}</Typography>
                        {alert.effect !== undefined && (
                          <Typography variant="caption" color="text.secondary">{alert.effect}</Typography>
                        )}
                      </Box>
                    </TableCell>
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
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

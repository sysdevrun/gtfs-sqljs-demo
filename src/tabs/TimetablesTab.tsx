import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Button
} from '@mui/material'
import { Route, Trip, StopTimeWithRealtime, Stop, Agency, VehiclePosition } from 'gtfs-sqljs'
import type { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'
import { timeToSeconds } from '../components/utils'

interface TimetablesTabProps {
  routes: Route[]
  workerApi: Remote<GtfsWorkerAPI> | null
  stops: Stop[]
  agencies: Agency[]
  vehicles: VehiclePosition[]
}

interface TripWithTimes {
  trip: Trip
  stopTimes: StopTimeWithRealtime[]
}

interface DirectionGroup {
  directionId: number
  headsign: string
  trips: Trip[]
}

export default function TimetablesTab({ routes, workerApi, stops, agencies, vehicles }: TimetablesTabProps) {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [directions, setDirections] = useState<DirectionGroup[]>([])
  const [selectedDirection, setSelectedDirection] = useState<DirectionGroup | null>(null)
  const [timetable, setTimetable] = useState<TripWithTimes[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Load trips for selected route and date
  useEffect(() => {
    if (!workerApi || !selectedRoute) {
      setDirections([])
      setSelectedDirection(null)
      setTimetable([])
      return
    }

    const dateString = selectedDate.replace(/-/g, '')

    workerApi.getTrips({ routeId: selectedRoute.route_id, date: dateString }).then((trips) => {
      // Group by direction_id
      const groupsMap = new Map<number, DirectionGroup>()

      trips.forEach((trip) => {
        const dirId = trip.direction_id ?? 0
        if (!groupsMap.has(dirId)) {
          groupsMap.set(dirId, {
            directionId: dirId,
            headsign: trip.trip_headsign || `Direction ${dirId}`,
            trips: []
          })
        }
        groupsMap.get(dirId)!.trips.push(trip)
      })

      const directionsList = Array.from(groupsMap.values())
      setDirections(directionsList)
      setSelectedDirection(null)
      setTimetable([])
    })
  }, [workerApi, selectedRoute, selectedDate])

  // Load timetable for selected direction
  useEffect(() => {
    if (!workerApi || !selectedDirection) {
      setTimetable([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const loadTimetable = async () => {
      try {
        const tripsWithTimes: TripWithTimes[] = []

        for (const trip of selectedDirection.trips) {
          const stopTimes = await workerApi.getStopTimes(trip.trip_id)
          tripsWithTimes.push({ trip, stopTimes })
        }

        // Sort trips by first departure time
        tripsWithTimes.sort((a, b) => {
          const aTime = a.stopTimes[0]?.departure_time || ''
          const bTime = b.stopTimes[0]?.departure_time || ''
          return aTime.localeCompare(bTime)
        })

        // Validate that all trips have the same stops
        if (tripsWithTimes.length > 1) {
          const firstStops = tripsWithTimes[0].stopTimes.map(st => st.stop_id).join(',')
          const allSame = tripsWithTimes.every(tt =>
            tt.stopTimes.map(st => st.stop_id).join(',') === firstStops
          )

          if (!allSame) {
            setError('Some trips have different stops')
            setTimetable([])
            setLoading(false)
            return
          }
        }

        setTimetable(tripsWithTimes)
        setLoading(false)
      } catch (err) {
        console.error('Error loading timetable:', err)
        setError('Failed to load timetable')
        setTimetable([])
        setLoading(false)
      }
    }

    loadTimetable()
  }, [workerApi, selectedDirection])

  const formatTime = (timeStr: string): string => {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':')
    const hours = (parseInt(h, 10) % 24).toString().padStart(2, '0')  // Use modulo 24 for times >= 24h
    return `${hours}:${m}`
  }

  const getStopName = (stopId: string): string => {
    const stop = stops.find(s => s.stop_id === stopId)
    return stop?.stop_name || stopId
  }

  const getPlatform = (stopId: string): string | null => {
    const stop = stops.find(s => s.stop_id === stopId)
    return stop?.platform_code || null
  }

  const getRealtimeDepartureTime = (stopTime: StopTimeWithRealtime): string | null => {
    if (!stopTime.realtime) return null

    const agencyTimezone = agencies.length > 0 && agencies[0].agency_timezone
      ? agencies[0].agency_timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone

    // If we have a realtime departure timestamp
    if (stopTime.realtime.departure_time) {
      const date = new Date(stopTime.realtime.departure_time * 1000)
      const timeString = date.toLocaleString('en-US', {
        timeZone: agencyTimezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      const [h, m] = timeString.split(':')
      return `${h}:${m}`
    }

    // If we have a delay, apply it to the scheduled time
    if (stopTime.realtime.departure_delay !== undefined) {
      const scheduledSeconds = timeToSeconds(stopTime.departure_time)
      const realtimeSeconds = scheduledSeconds + stopTime.realtime.departure_delay
      const h = Math.floor(realtimeSeconds / 3600) % 24
      const m = Math.floor((realtimeSeconds % 3600) / 60)
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    }

    return null
  }

  const isToday = (): boolean => {
    const today = new Date().toISOString().split('T')[0]
    return selectedDate === today
  }

  const getVehicleStatus = (tripId: string, stopId: string): 'at-stop' | 'approaching' | null => {
    if (!isToday()) return null

    const vehicle = vehicles.find(v => v.trip_id === tripId)
    if (!vehicle) return null

    // Check if vehicle is at this stop
    if (vehicle.stop_id === stopId && vehicle.current_status === 1) {
      return 'at-stop'
    }

    // Check if vehicle is approaching this stop (INCOMING_AT or IN_TRANSIT_TO)
    if (vehicle.stop_id === stopId && (vehicle.current_status === 0 || vehicle.current_status === 2)) {
      return 'approaching'
    }

    return null
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* part1: Top controls (Route + Date + Direction) */}
      <Box sx={{ display: 'flex', gap: 3, mb: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        {/* part1-left: Route selection + Direction selection */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Route selection */}
          <Paper sx={{ p: 2, height: '300px', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Routes
            </Typography>
            <List>
              {routes.map((route) => {
                const bgColor = route.route_color ? `#${route.route_color}` : '#CCCCCC'
                const textColor = route.route_text_color ? `#${route.route_text_color}` : '#000000'

                return (
                  <ListItem key={route.route_id} disablePadding>
                    <ListItemButton
                      selected={selectedRoute?.route_id === route.route_id}
                      onClick={() => setSelectedRoute(route)}
                    >
                      <Box
                        sx={{
                          display: 'inline-block',
                          px: 1.5,
                          py: 0.5,
                          mr: 1.5,
                          borderRadius: 1,
                          backgroundColor: bgColor,
                          color: textColor,
                          fontWeight: 'bold',
                          minWidth: '40px',
                          textAlign: 'center'
                        }}
                      >
                        {route.route_short_name || route.route_long_name?.substring(0, 3)}
                      </Box>
                      <ListItemText
                        primary={route.route_long_name}
                      />
                    </ListItemButton>
                  </ListItem>
                )
              })}
            </List>
          </Paper>

          {/* Direction selection (horizontal buttons, 50% width each) */}
          {selectedRoute && directions.length > 0 && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              {directions.map((dir) => {
                const bgColor = selectedRoute.route_color ? `#${selectedRoute.route_color}` : '#CCCCCC'
                const textColor = selectedRoute.route_text_color ? `#${selectedRoute.route_text_color}` : '#000000'
                const isSelected = selectedDirection?.directionId === dir.directionId

                return (
                  <Button
                    key={dir.directionId}
                    variant="outlined"
                    onClick={() => setSelectedDirection(dir)}
                    sx={{
                      flex: 1,
                      backgroundColor: 'white',
                      borderColor: isSelected ? 'primary.main' : 'grey.300',
                      borderWidth: isSelected ? 2 : 1,
                      '&:hover': {
                        backgroundColor: 'grey.50',
                        borderColor: isSelected ? 'primary.main' : 'grey.400'
                      },
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      py: 1.5
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                      {/* Route badge */}
                      <Box
                        sx={{
                          display: 'inline-flex',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          backgroundColor: bgColor,
                          color: textColor,
                          fontWeight: 'bold',
                          minWidth: '40px',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {selectedRoute.route_short_name || selectedRoute.route_long_name?.substring(0, 3)}
                        </Typography>
                      </Box>

                      {/* Direction info */}
                      <Box sx={{ textAlign: 'left', flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                          {dir.headsign}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
                          {dir.trips.length} trips
                        </Typography>
                      </Box>
                    </Box>
                  </Button>
                )
              })}
            </Box>
          )}
        </Box>

        {/* part1-right: Date selection */}
        <Paper sx={{ p: 2, width: { xs: '100%', md: '280px' } }}>
          <Typography variant="h6" gutterBottom>
            Date
          </Typography>
          <TextField
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Paper>
      </Box>

      {/* part2: Bottom - Timetable table */}
      <Box>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {loading && (
            <Typography>Loading timetable...</Typography>
          )}

          {!loading && timetable.length > 0 && (
            <Paper sx={{ overflow: 'auto' }}>
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Stop</TableCell>
                      {timetable.map((tt, idx) => (
                        <TableCell key={idx} align="center">
                          {tt.trip.trip_short_name || `Trip ${idx + 1}`}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {timetable[0]?.stopTimes.map((_, stopIdx) => {
                      const stopId = timetable[0].stopTimes[stopIdx].stop_id
                      const stopName = getStopName(stopId)
                      const platform = getPlatform(stopId)

                      return (
                        <TableRow key={stopIdx}>
                          <TableCell>
                            <Box>
                              <Typography variant="body2">{stopName}</Typography>
                              {platform && (
                                <Typography variant="caption" color="text.secondary">
                                  Platform {platform}
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          {timetable.map((tt, tripIdx) => {
                            const stopTime = tt.stopTimes[stopIdx]
                            const scheduledTime = formatTime(stopTime.departure_time)
                            const realtimeTime = isToday() ? getRealtimeDepartureTime(stopTime) : null
                            const vehicleStatus = getVehicleStatus(tt.trip.trip_id, stopTime.stop_id)

                            return (
                              <TableCell key={tripIdx} align="center">
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                  {vehicleStatus === 'at-stop' && (
                                    <Box
                                      sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        bgcolor: 'success.main',
                                        flexShrink: 0
                                      }}
                                    />
                                  )}
                                  {vehicleStatus === 'approaching' && (
                                    <Box
                                      sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        bgcolor: 'info.main',
                                        flexShrink: 0
                                      }}
                                    />
                                  )}
                                  <Box>
                                    {realtimeTime ? (
                                      <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'black' }}>
                                          {realtimeTime}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>
                                          {scheduledTime}
                                        </Typography>
                                      </Box>
                                    ) : (
                                      <Typography variant="body2">
                                        {scheduledTime}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Legend */}
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', mb: 1 }}>
                  Legend
                </Typography>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'success.main'
                      }}
                    />
                    <Typography variant="caption">Vehicle at stop</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'info.main'
                      }}
                    />
                    <Typography variant="caption">Vehicle approaching</Typography>
                  </Box>
                </Box>
              </Box>
            </Paper>
          )}
      </Box>
    </Box>
  )
}

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
  Alert
} from '@mui/material'
import { Route, Trip, StopTimeWithRealtime, Stop } from 'gtfs-sqljs'
import type { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'

interface TimetablesTabProps {
  routes: Route[]
  workerApi: Remote<GtfsWorkerAPI> | null
  stops: Stop[]
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

export default function TimetablesTab({ routes, workerApi, stops }: TimetablesTabProps) {
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

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Select Date
        </Typography>
        <TextField
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
      </Paper>

      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: { xs: '1', md: '0 0 33%' } }}>
          <Paper sx={{ p: 2, height: '600px', overflow: 'auto' }}>
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
        </Box>

        <Box sx={{ flex: 1 }}>
          {selectedRoute && (
            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Directions for {selectedRoute.route_short_name || selectedRoute.route_long_name}
              </Typography>
              <List>
                {directions.map((dir) => (
                  <ListItem key={dir.directionId} disablePadding>
                    <ListItemButton
                      selected={selectedDirection?.directionId === dir.directionId}
                      onClick={() => setSelectedDirection(dir)}
                    >
                      <ListItemText
                        primary={dir.headsign}
                        secondary={`${dir.trips.length} trips`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

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
                          {timetable.map((tt, tripIdx) => (
                            <TableCell key={tripIdx} align="center">
                              {formatTime(tt.stopTimes[stopIdx].departure_time)}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  )
}

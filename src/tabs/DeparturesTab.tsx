import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Chip,
  Stack
} from '@mui/material'
import { Stop, Route, Trip, StopTimeWithRealtime } from 'gtfs-sqljs'
import type { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'
import { GtfsApiAdapter } from '../utils/GtfsApiAdapter'

interface DeparturesTabProps {
  stops: Stop[]
  routes: Route[]
  workerApi: Remote<GtfsWorkerAPI> | null
  gtfsApi: GtfsApiAdapter | null
  upcomingDeparturesCount: number
  updateInterval: number
}

interface StopGroup {
  name: string
  stops: Stop[]
  selected: boolean
  routes: Route[]
}

interface Departure {
  trip: Trip
  route: Route | null
  stopTime: StopTimeWithRealtime
  stop: Stop
  departureTimeSeconds: number
  realtimeDepartureSeconds: number | null
}

export default function DeparturesTab({
  stops,
  routes,
  workerApi,
  gtfsApi,
  upcomingDeparturesCount,
  updateInterval
}: DeparturesTabProps) {
  const [stopGroups, setStopGroups] = useState<StopGroup[]>([])
  const [departures, setDepartures] = useState<Departure[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [stopRoutesMap, setStopRoutesMap] = useState<Map<string, Set<string>>>(new Map())

  // Load routes going through each stop
  useEffect(() => {
    if (!workerApi) return

    const loadStopRoutes = async () => {
      const stopRoutes = new Map<string, Set<string>>()

      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')

      for (const route of routes) {
        try {
          const trips = await workerApi.getTrips({ routeId: route.route_id, date: today })

          for (const trip of trips) {
            const stopTimes = await workerApi.getStopTimes(trip.trip_id)
            stopTimes.forEach(st => {
              if (!stopRoutes.has(st.stop_id)) {
                stopRoutes.set(st.stop_id, new Set())
              }
              stopRoutes.get(st.stop_id)!.add(route.route_id)
            })
          }
        } catch (err) {
          console.error(`Error loading routes for stop:`, err)
        }
      }

      setStopRoutesMap(stopRoutes)
    }

    loadStopRoutes()
  }, [workerApi, routes])

  // Group stops by name
  useEffect(() => {
    const groupsMap = new Map<string, Stop[]>()

    stops.forEach(stop => {
      const name = stop.stop_name
      if (!groupsMap.has(name)) {
        groupsMap.set(name, [])
      }
      groupsMap.get(name)!.push(stop)
    })

    const groups: StopGroup[] = Array.from(groupsMap.entries())
      .map(([name, stopList]) => {
        // Get unique routes for all stops with this name
        const routeIds = new Set<string>()
        stopList.forEach(stop => {
          const routesForStop = stopRoutesMap.get(stop.stop_id)
          if (routesForStop) {
            routesForStop.forEach(rid => routeIds.add(rid))
          }
        })

        const groupRoutes = routes.filter(r => routeIds.has(r.route_id))

        return { name, stops: stopList, selected: false, routes: groupRoutes }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    setStopGroups(groups)
  }, [stops, stopRoutesMap, routes])

  // Toggle stop group selection
  const toggleStopGroup = (groupName: string) => {
    setStopGroups(prev =>
      prev.map(g => g.name === groupName ? { ...g, selected: !g.selected } : g)
    )
  }

  // Load departures for selected stops
  useEffect(() => {
    if (!workerApi || !gtfsApi) return

    const selectedStops = stopGroups
      .filter(g => g.selected)
      .flatMap(g => g.stops)

    if (selectedStops.length === 0) {
      setDepartures([])
      return
    }

    const loadDepartures = async () => {
      setLoading(true)
      try {
        const now = new Date()
        const currentTimeSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
        const today = now.toISOString().split('T')[0].replace(/-/g, '')

        const allDepartures: Departure[] = []

        // Get all trips running today
        const tripsToday = new Map<string, { trip: Trip, route: Route | null }>()
        for (const route of routes) {
          try {
            const trips = await workerApi.getTrips({ routeId: route.route_id, date: today })
            trips.forEach(trip => {
              tripsToday.set(trip.trip_id, { trip, route })
            })
          } catch (err) {
            console.error('Error loading trips:', err)
          }
        }

        for (const stop of selectedStops) {
          const stopTimes = await workerApi.getStopTimes(stop.stop_id)

          for (const stopTime of stopTimes) {
            // Only process if trip is running today
            const tripInfo = tripsToday.get(stopTime.trip_id)
            if (!tripInfo) continue

            // Parse departure time
            const [h, m, s] = stopTime.departure_time.split(':').map(Number)
            const departureTimeSeconds = h * 3600 + m * 60 + s

            // Get realtime departure if available
            let realtimeDepartureSeconds: number | null = null
            if (stopTime.realtime?.departure_time) {
              realtimeDepartureSeconds = stopTime.realtime.departure_time
            }

            const effectiveDepartureSeconds = realtimeDepartureSeconds ?? departureTimeSeconds

            // Only include upcoming departures (with tolerance for times past midnight)
            if (effectiveDepartureSeconds >= currentTimeSeconds || departureTimeSeconds >= 24 * 3600) {
              allDepartures.push({
                trip: tripInfo.trip,
                route: tripInfo.route,
                stopTime,
                stop,
                departureTimeSeconds,
                realtimeDepartureSeconds
              })
            }
          }
        }

        // Sort by effective departure time and limit
        allDepartures.sort((a, b) => {
          const aTime = a.realtimeDepartureSeconds ?? a.departureTimeSeconds
          const bTime = b.realtimeDepartureSeconds ?? b.departureTimeSeconds
          return aTime - bTime
        })

        setDepartures(allDepartures.slice(0, upcomingDeparturesCount))
        setLoading(false)
      } catch (err) {
        console.error('Error loading departures:', err)
        setLoading(false)
      }
    }

    loadDepartures()

    // Auto-refresh if enabled
    if (updateInterval > 0) {
      const interval = setInterval(loadDepartures, updateInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [stopGroups, workerApi, gtfsApi, routes, upcomingDeparturesCount, updateInterval])

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const formatDepartureTime = (departureSeconds: number, realtimeSeconds: number | null): string => {
    const now = new Date()
    const currentTimeSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
    const effectiveSeconds = realtimeSeconds ?? departureSeconds
    const minutesUntil = Math.floor((effectiveSeconds - currentTimeSeconds) / 60)

    if (minutesUntil < 60) {
      return `${minutesUntil} min.`
    }

    return formatTime(effectiveSeconds)
  }

  const selectedCount = stopGroups.filter(g => g.selected).length

  const filteredStopGroups = stopGroups.filter(group =>
    searchQuery === '' || group.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: { xs: '1', md: '0 0 33%' } }}>
          <Paper sx={{ p: 2, height: '600px', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
              Select Stops ({selectedCount} selected)
            </Typography>

            <TextField
              fullWidth
              size="small"
              placeholder="Search stops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <List>
                {filteredStopGroups.map(group => (
                  <ListItem key={group.name} disablePadding sx={{ display: 'block' }}>
                    <ListItemButton onClick={() => toggleStopGroup(group.name)} dense>
                      <Checkbox
                        edge="start"
                        checked={group.selected}
                        tabIndex={-1}
                        disableRipple
                      />
                      <ListItemText
                        primary={group.name}
                        secondary={
                          <Box>
                            <Typography variant="caption" display="block">
                              {group.stops.length} stop{group.stops.length > 1 ? 's' : ''}
                            </Typography>
                            {group.routes.length > 0 && (
                              <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                                {group.routes.map(route => (
                                  <Chip
                                    key={route.route_id}
                                    label={route.route_short_name || route.route_long_name}
                                    size="small"
                                    sx={{
                                      backgroundColor: route.route_color ? `#${route.route_color}` : undefined,
                                      color: route.route_text_color ? `#${route.route_text_color}` : undefined,
                                      height: '20px',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold'
                                    }}
                                  />
                                ))}
                              </Stack>
                            )}
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Paper>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Next Departures
            </Typography>

            {loading && <Typography>Loading departures...</Typography>}

            {!loading && selectedCount === 0 && (
              <Typography color="text.secondary">
                Select one or more stops to see departures
              </Typography>
            )}

            {!loading && selectedCount > 0 && departures.length === 0 && (
              <Typography color="text.secondary">
                No upcoming departures found
              </Typography>
            )}

            {!loading && departures.length > 0 && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Route</TableCell>
                      <TableCell>Destination</TableCell>
                      <TableCell>Stop</TableCell>
                      <TableCell>Platform</TableCell>
                      <TableCell>Scheduled</TableCell>
                      <TableCell>Real-time</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {departures.map((dep, idx) => {
                      const textColor = dep.route?.route_text_color ? `#${dep.route.route_text_color}` : '#000'
                      const bgColor = dep.route?.route_color ? `#${dep.route.route_color}` : '#CCC'

                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <Box
                              sx={{
                                display: 'inline-block',
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                backgroundColor: bgColor,
                                color: textColor,
                                fontWeight: 'bold'
                              }}
                            >
                              {dep.trip.trip_short_name || dep.route?.route_short_name || 'N/A'}
                            </Box>
                          </TableCell>
                          <TableCell>{dep.trip.trip_headsign || 'N/A'}</TableCell>
                          <TableCell>{dep.stop.stop_name}</TableCell>
                          <TableCell>{dep.stop.platform_code || '-'}</TableCell>
                          <TableCell>{formatTime(dep.departureTimeSeconds)}</TableCell>
                          <TableCell>
                            <strong>
                              {formatDepartureTime(dep.departureTimeSeconds, dep.realtimeDepartureSeconds)}
                            </strong>
                            {dep.realtimeDepartureSeconds && dep.realtimeDepartureSeconds !== dep.departureTimeSeconds && (
                              <Typography variant="caption" color="error" display="block">
                                (delay)
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      </Box>
    </Box>
  )
}

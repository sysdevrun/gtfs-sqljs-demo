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
  TableRow
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
      .map(([name, stops]) => ({ name, stops, selected: false }))
      .sort((a, b) => a.name.localeCompare(b.name))

    setStopGroups(groups)
  }, [stops])

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

        const allDepartures: Departure[] = []

        for (const stop of selectedStops) {
          const stopTimes = await workerApi.getStopTimes(stop.stop_id)

          for (const stopTime of stopTimes) {
            // Parse departure time
            const [h, m, s] = stopTime.departure_time.split(':').map(Number)
            const departureTimeSeconds = h * 3600 + m * 60 + s

            // Get realtime departure if available
            let realtimeDepartureSeconds: number | null = null
            if (stopTime.realtime?.departure_time) {
              const rtTime = new Date(stopTime.realtime.departure_time * 1000)
              realtimeDepartureSeconds = rtTime.getHours() * 3600 + rtTime.getMinutes() * 60 + rtTime.getSeconds()
            }

            const effectiveDepartureSeconds = realtimeDepartureSeconds ?? departureTimeSeconds

            // Only include upcoming departures
            if (effectiveDepartureSeconds >= currentTimeSeconds) {
              // Fetch trip and route data
              const tripData = await gtfsApi.fetchAndCacheTripData(stopTime.trip_id)
              if (!tripData.trip) continue

              const trip = tripData.trip
              const route = trip.route_id ? routes.find(r => r.route_id === trip.route_id) || null : null

              allDepartures.push({
                trip,
                route,
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

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: { xs: '1', md: '0 0 33%' } }}>
          <Paper sx={{ p: 2, height: '600px', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Select Stops ({selectedCount} selected)
            </Typography>
            <List>
              {stopGroups.map(group => (
                <ListItem key={group.name} disablePadding>
                  <ListItemButton onClick={() => toggleStopGroup(group.name)} dense>
                    <Checkbox
                      edge="start"
                      checked={group.selected}
                      tabIndex={-1}
                      disableRipple
                    />
                    <ListItemText
                      primary={group.name}
                      secondary={`${group.stops.length} stop${group.stops.length > 1 ? 's' : ''}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
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

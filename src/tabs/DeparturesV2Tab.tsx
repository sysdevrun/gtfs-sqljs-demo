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
  TextField,
  Stack,
  Card,
  CardContent,
  FormControlLabel
} from '@mui/material'
import { Stop, Route, Trip, StopTimeWithRealtime, Agency } from 'gtfs-sqljs'
import type { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'
import { GtfsApiAdapter } from '../utils/GtfsApiAdapter'

interface DeparturesV2TabProps {
  stops: Stop[]
  routes: Route[]
  workerApi: Remote<GtfsWorkerAPI> | null
  gtfsApi: GtfsApiAdapter | null
  upcomingDeparturesCount: number
  updateInterval: number
  agencies: Agency[]
}

interface Departure {
  trip: Trip
  route: Route | null
  stopTime: StopTimeWithRealtime
  stop: Stop
  departureTimeSeconds: number
  realtimeDepartureSeconds: number | null
}

interface RouteDirectionGroup {
  routeId: string
  directionId: number
  route: Route | null
  tripHeadsign: string
  departures: Departure[]
  upcomingStops: string[]
}

export default function DeparturesV2Tab({
  stops,
  routes,
  workerApi,
  gtfsApi,
  updateInterval,
  agencies
}: DeparturesV2TabProps) {
  const [selectedStopIds, setSelectedStopIds] = useState<Set<string>>(new Set())
  const [departures, setDepartures] = useState<Departure[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [agencyTime, setAgencyTime] = useState<string>('')
  const [routeDirectionGroups, setRouteDirectionGroups] = useState<RouteDirectionGroup[]>([])
  const [showTheoreticalSchedules, setShowTheoreticalSchedules] = useState(false)

  // Toggle individual stop selection
  const toggleStop = (stopId: string) => {
    setSelectedStopIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stopId)) {
        newSet.delete(stopId)
      } else {
        newSet.add(stopId)
      }
      return newSet
    })
  }

  // Update agency time display every second
  useEffect(() => {
    const updateAgencyTime = () => {
      const agencyTimezone = agencies.length > 0 && agencies[0].agency_timezone
        ? agencies[0].agency_timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone

      const now = new Date()
      const timeString = now.toLocaleString('en-US', {
        timeZone: agencyTimezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      })
      setAgencyTime(timeString)
    }

    updateAgencyTime() // Initial update
    const interval = setInterval(updateAgencyTime, 1000)
    return () => clearInterval(interval)
  }, [agencies])

  // Load departures for selected stops
  useEffect(() => {
    if (!workerApi || !gtfsApi) return

    const selectedStops = stops.filter(s => selectedStopIds.has(s.stop_id))

    if (selectedStops.length === 0) {
      setDepartures([])
      setRouteDirectionGroups([])
      return
    }

    const loadDepartures = async () => {
      setLoading(true)

      try {
        const now = new Date()

        // Get agency timezone and calculate current time in that timezone
        const agencyTimezone = agencies.length > 0 && agencies[0].agency_timezone
          ? agencies[0].agency_timezone
          : Intl.DateTimeFormat().resolvedOptions().timeZone

        // Get current time in agency timezone
        const agencyTimeString = now.toLocaleString('en-US', {
          timeZone: agencyTimezone,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
        const [h, m, s] = agencyTimeString.split(':').map(Number)
        const currentTimeSeconds = h * 3600 + m * 60 + s

        // Update agency time display (HH:MM format)
        setAgencyTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)

        // Get today's date in agency timezone
        const agencyDateString = now.toLocaleString('en-US', {
          timeZone: agencyTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
        const [month, day, year] = agencyDateString.split('/')
        const today = `${year}${month}${day}`

        // Get active service IDs for today
        const activeServiceIds = await workerApi.getActiveServiceIds(today)

        if (activeServiceIds.length === 0) {
          setDepartures([])
          setRouteDirectionGroups([])
          setLoading(false)
          return
        }

        // Single query for all stop times at selected stops
        const selectedStopIdList = selectedStops.map(s => s.stop_id)

        const allStopTimes = await workerApi.getStopTimes({
          stopId: selectedStopIdList,
          serviceIds: activeServiceIds,
          includeRealtime: true,
        })

        // Filter and process departures
        const allDepartures: Departure[] = []

        for (const stopTime of allStopTimes) {
          // Find the corresponding stop object
          const stop = selectedStops.find(s => s.stop_id === stopTime.stop_id)
          if (!stop) continue

          // Filter out CANCELED and SKIPPED trips
          if (stopTime.realtime?.schedule_relationship === 3) continue  // CANCELED
          if (stopTime.realtime?.schedule_relationship === 4) continue  // SKIPPED

          // Parse scheduled departure time
          const [h, m, s] = stopTime.departure_time.split(':').map(Number)
          const departureTimeSeconds = h * 3600 + m * 60 + s

          // Get realtime departure if available (Unix timestamp -> seconds from midnight)
          let realtimeDepartureSeconds: number | null = null
          if (stopTime.realtime?.departure_time) {
            // Convert Unix timestamp to seconds-from-midnight in agency timezone
            const realtimeDate = new Date(stopTime.realtime.departure_time * 1000)
            const realtimeTimeString = realtimeDate.toLocaleString('en-US', {
              timeZone: agencyTimezone,
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
            const [rh, rm, rs] = realtimeTimeString.split(':').map(Number)
            realtimeDepartureSeconds = rh * 3600 + rm * 60 + rs
          }

          const effectiveDepartureSeconds = realtimeDepartureSeconds ?? departureTimeSeconds

          // Only include upcoming departures (with tolerance for times past midnight)
          if (effectiveDepartureSeconds >= currentTimeSeconds || departureTimeSeconds >= 24 * 3600) {
            allDepartures.push({
              trip: null as any, // Will be enriched below
              route: null,
              stopTime,
              stop,
              departureTimeSeconds,
              realtimeDepartureSeconds
            })
          }
        }

        // Enrich with trip and route data
        const tripIds = [...new Set(allDepartures.map(d => d.stopTime.trip_id))]
        const trips = await workerApi.getTrips({ tripId: tripIds, includeRealtime: true })
        const tripMap = new Map(trips.map(t => [t.trip_id, t]))

        const routeIds = [...new Set(trips.map(t => t.route_id))]
        const routesData = await workerApi.getRoutes({ routeId: routeIds })
        const routeMap = new Map(routesData.map(r => [r.route_id, r]))

        // Enrich departures with trip and route data
        allDepartures.forEach(dep => {
          const trip = tripMap.get(dep.stopTime.trip_id)
          if (trip) {
            dep.trip = trip
            dep.route = routeMap.get(trip.route_id) || null
          }
        })

        // Remove departures without trip data
        const enrichedDepartures = allDepartures.filter(d => d.trip !== null)

        // Sort by effective departure time
        enrichedDepartures.sort((a, b) => {
          const aTime = a.realtimeDepartureSeconds ?? a.departureTimeSeconds
          const bTime = b.realtimeDepartureSeconds ?? b.departureTimeSeconds
          return aTime - bTime
        })

        setDepartures(enrichedDepartures)

        // Group by (route_id, direction_id)
        const groups = new Map<string, RouteDirectionGroup>()

        for (const dep of enrichedDepartures) {
          const directionId = dep.trip.direction_id ?? 0
          const key = `${dep.trip.route_id}_${directionId}`

          if (!groups.has(key)) {
            groups.set(key, {
              routeId: dep.trip.route_id,
              directionId: directionId,
              route: dep.route,
              tripHeadsign: dep.trip.trip_headsign || 'Unknown',
              departures: [],
              upcomingStops: []
            })
          }

          groups.get(key)!.departures.push(dep)
        }

        // For each group, get upcoming stops for the first trip
        const groupsArray: RouteDirectionGroup[] = []

        for (const group of groups.values()) {
          if (group.departures.length > 0) {
            const firstDeparture = group.departures[0]

            // Get all stop times for this trip to find upcoming stops
            const tripStopTimes = await workerApi.getStopTimes({
              tripId: firstDeparture.trip.trip_id,
              includeRealtime: true
            })

            // Sort by stop_sequence
            tripStopTimes.sort((a, b) => a.stop_sequence - b.stop_sequence)

            // Find the index of the current stop
            const currentStopIndex = tripStopTimes.findIndex(
              st => st.stop_id === firstDeparture.stop.stop_id && st.stop_sequence === firstDeparture.stopTime.stop_sequence
            )

            if (currentStopIndex !== -1) {
              // Get upcoming stops (after current stop to end, excluding current)
              const upcomingStopIds = tripStopTimes
                .slice(currentStopIndex + 1)
                .map(st => st.stop_id)

              // Get stop names
              const upcomingStopsData = await workerApi.getStops({ stopId: upcomingStopIds })
              const stopNamesMap = new Map(upcomingStopsData.map(s => [s.stop_id, s.stop_name]))

              group.upcomingStops = tripStopTimes
                .slice(currentStopIndex + 1)
                .map(st => stopNamesMap.get(st.stop_id) || st.stop_id)
            }

            // Only keep first 2 departures for display
            group.departures = group.departures.slice(0, 2)
            groupsArray.push(group)
          }
        }

        // Sort groups by route_sort_order
        groupsArray.sort((a, b) => {
          const aSort = a.route?.route_sort_order ?? 9999
          const bSort = b.route?.route_sort_order ?? 9999
          return aSort - bSort
        })

        setRouteDirectionGroups(groupsArray)
        console.log(groupsArray)
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
  }, [selectedStopIds, workerApi, gtfsApi, routes, updateInterval, agencies, stops])

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600) % 24
    const m = Math.floor((seconds % 3600) / 60)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const formatDepartureTime = (departureSeconds: number, realtimeSeconds: number | null): string => {
    // Get current time in agency timezone
    const agencyTimezone = agencies.length > 0 && agencies[0].agency_timezone
      ? agencies[0].agency_timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone

    const now = new Date()
    const agencyTimeString = now.toLocaleString('en-US', {
      timeZone: agencyTimezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    const [h, m, s] = agencyTimeString.split(':').map(Number)
    const currentTimeSeconds = h * 3600 + m * 60 + s

    const effectiveSeconds = realtimeSeconds ?? departureSeconds
    const minutesUntil = Math.floor((effectiveSeconds - currentTimeSeconds) / 60)

    if (minutesUntil >= 0 && minutesUntil < 60) {
      return `${minutesUntil} min.`
    }

    return formatTime(effectiveSeconds)
  }

  const filteredStops = stops.filter(stop =>
    searchQuery === '' ||
    stop.stop_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stop.stop_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedCount = selectedStopIds.size

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: { xs: '1', md: '0 0 33%' } }}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Configuration
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={showTheoreticalSchedules}
                  onChange={(e) => setShowTheoreticalSchedules(e.target.checked)}
                />
              }
              label="Show theoretical schedules"
            />
          </Paper>

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
                {filteredStops.map(stop => (
                  <ListItem key={stop.stop_id} disablePadding sx={{ display: 'block' }}>
                    <ListItemButton onClick={() => toggleStop(stop.stop_id)} dense>
                      <Checkbox
                        edge="start"
                        checked={selectedStopIds.has(stop.stop_id)}
                        tabIndex={-1}
                        disableRipple
                      />
                      <ListItemText
                        primary={`${stop.stop_name}`}
                        secondary={
                          <Typography variant="caption" display="block">
                            {stop.stop_id}
                          </Typography>
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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">
                {selectedCount > 0
                  ? Array.from(new Set(stops.filter(s => selectedStopIds.has(s.stop_id)).map(s => s.stop_name))).join(', ')
                  : 'Next Departures (v2)'}
              </Typography>
              {agencyTime && (
                <Typography variant="h6" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  {agencyTime.split(':')[0]}
                  <span style={{ color: loading ? '#000' : 'inherit' }}>:</span>
                  {agencyTime.split(':')[1]}
                </Typography>
              )}
            </Box>

            {loading && departures.length === 0 && <Typography>Loading departures...</Typography>}

            {!loading && selectedCount === 0 && (
              <Typography color="text.secondary">
                Select one or more stops to see departures
              </Typography>
            )}

            {!loading && selectedCount > 0 && routeDirectionGroups.length === 0 && (
              <Typography color="error" variant="h6">
                No upcoming departures found
              </Typography>
            )}

            {routeDirectionGroups.length > 0 && (
              <Stack spacing={2}>
                {routeDirectionGroups.map((group, idx) => {
                  const textColor = group.route?.route_text_color ? `#${group.route.route_text_color}` : '#000'
                  const bgColor = group.route?.route_color ? `#${group.route.route_color}` : '#CCC'

                  return (
                    <Card key={idx} variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                              {group.route?.route_short_name || 'N/A'}
                            </Box>
                            <Typography variant="h6">
                              {group.tripHeadsign}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'flex', gap: 2 }}>
                            {group.departures.map((dep, depIdx) => (
                              <Box
                                key={depIdx}
                                sx={{
                                  border: 1,
                                  borderColor: 'divider',
                                  borderRadius: 1,
                                  p: 2,
                                  minWidth: '120px',
                                  textAlign: 'center'
                                }}
                              >
                                <Typography
                                  variant="h4"
                                  sx={{
                                    fontWeight: 'bold',
                                    color: dep.realtimeDepartureSeconds !== null ? '#1b5e20' : 'inherit'
                                  }}
                                >
                                  {formatDepartureTime(dep.departureTimeSeconds, dep.realtimeDepartureSeconds)}
                                </Typography>
                                {dep.trip.trip_short_name}

                                {showTheoreticalSchedules && dep.realtimeDepartureSeconds !== null && (
                                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                    {formatTime(dep.departureTimeSeconds)}
                                  </Typography>
                                )}
                              </Box>
                            ))}
                          </Box>
                        </Box>

                        {group.upcomingStops.length > 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                            Next stops: {group.upcomingStops.join(' · ')}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </Stack>
            )}
          </Paper>
        </Box>
      </Box>
    </Box>
  )
}

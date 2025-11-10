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
import { Stop, Route, Trip, StopTimeWithRealtime, Agency } from 'gtfs-sqljs'
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
  agencies: Agency[]
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
  updateInterval,
  agencies
}: DeparturesTabProps) {
  const [stopGroups, setStopGroups] = useState<StopGroup[]>([])
  const [departures, setDepartures] = useState<Departure[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [stopRoutesMap, setStopRoutesMap] = useState<Map<string, Set<string>>>(new Map())
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [agencyTime, setAgencyTime] = useState<string>('')

  // Load routes going through each stop
  useEffect(() => {
    if (!workerApi) return

    const loadStopRoutes = async () => {
      const stopRoutes = new Map<string, Set<string>>()

      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')

      for (const route of routes) {
        try {
          const trips = await workerApi.getTrips({ routeId: route.route_id, date: today, includeRealtime: true })

          for (const trip of trips) {
            const stopTimes = await workerApi.getStopTimes({ tripId: trip.trip_id, includeRealtime: true })
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

        // Debug info collection
        let debugLines: string[] = []
        debugLines.push(`=== DEBUG INFO ===`)
        debugLines.push(`Browser time: ${now.toISOString()} (local: ${now.toLocaleString()})`)
        debugLines.push(`Agency timezone: ${agencyTimezone}`)
        debugLines.push(`Current time in agency TZ: ${agencyTimeString} (${currentTimeSeconds}s = ${formatTime(currentTimeSeconds)})`)
        debugLines.push(`Today's date string: ${today}`)
        debugLines.push(`Selected stops: ${selectedStops.length}`)
        debugLines.push(`Stop names: ${selectedStops.map(s => s.stop_name).join(', ')}`)
        debugLines.push(``)

        // EFFICIENT APPROACH: Get active service IDs for today
        const activeServiceIds = await workerApi.getActiveServiceIds(today)

        if (activeServiceIds.length === 0) {
          debugLines.push(`⚠️ No active services for date: ${today}`)
          setDebugInfo(debugLines.join('\n'))
          setDepartures([])
          setLoading(false)
          return
        }

        debugLines.push(`Active service IDs: ${activeServiceIds.join(', ')}`)
        debugLines.push(``)

        // EFFICIENT APPROACH: Single query for all stop times at selected stops
        const selectedStopIds = selectedStops.map(s => s.stop_id)

        const startQueryTime = performance.now()
        const allStopTimes = await workerApi.getStopTimes({
          stopId: selectedStopIds,
          serviceIds: activeServiceIds,
          includeRealtime: true,
        })
        const queryTime = performance.now() - startQueryTime

        debugLines.push(`⚡ Query time: ${queryTime.toFixed(2)}ms`)
        debugLines.push(`Total stop times retrieved: ${allStopTimes.length}`)
        debugLines.push(``)

        // Filter and process departures
        const allDepartures: Departure[] = []
        let filteredByTime = 0
        let filteredByCanceled = 0
        let filteredBySkipped = 0

        for (const stopTime of allStopTimes) {
          // Find the corresponding stop object
          const stop = selectedStops.find(s => s.stop_id === stopTime.stop_id)
          if (!stop) continue

          // Filter out CANCELED and SKIPPED trips (CORRECT LOGIC)
          if (stopTime.realtime?.schedule_relationship === 3) {  // CANCELED
            filteredByCanceled++
            continue
          }
          if (stopTime.realtime?.schedule_relationship === 4) {  // SKIPPED
            filteredBySkipped++
            continue
          }

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
          } else {
            filteredByTime++
          }
        }

        debugLines.push(`Filtered (time in past): ${filteredByTime}`)
        debugLines.push(`Filtered (CANCELED trips): ${filteredByCanceled}`)
        debugLines.push(`Filtered (SKIPPED stops): ${filteredBySkipped}`)
        debugLines.push(`Departures (before enrichment): ${allDepartures.length}`)
        debugLines.push(``)

        // Enrich with trip and route data
        const tripIds = [...new Set(allDepartures.map(d => d.stopTime.trip_id))]
        debugLines.push(`Unique trips to enrich: ${tripIds.length}`)

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

        debugLines.push(`Departures after enrichment: ${enrichedDepartures.length}`)
        debugLines.push(``)

        // Show sample departures
        if (enrichedDepartures.length > 0) {
          debugLines.push(`Sample of first 10 departures:`)
          enrichedDepartures.slice(0, 10).forEach((dep, idx) => {
            const scheduledTime = formatTime(dep.departureTimeSeconds)
            const effectiveTime = formatTime(dep.realtimeDepartureSeconds ?? dep.departureTimeSeconds)
            const delay = dep.realtimeDepartureSeconds ? ` (${dep.realtimeDepartureSeconds > dep.departureTimeSeconds ? '+' : ''}${Math.round((dep.realtimeDepartureSeconds - dep.departureTimeSeconds) / 60)}min)` : ''
            const status = dep.stopTime.realtime?.schedule_relationship === 1 ? ' [ADDED]' : ''
            debugLines.push(`  ${idx + 1}. ${dep.route?.route_short_name || 'N/A'} to ${dep.trip.trip_headsign}: ${scheduledTime} → ${effectiveTime}${delay}${status}`)
          })
        }

        // Sort by effective departure time and limit
        enrichedDepartures.sort((a, b) => {
          const aTime = a.realtimeDepartureSeconds ?? a.departureTimeSeconds
          const bTime = b.realtimeDepartureSeconds ?? b.departureTimeSeconds
          return aTime - bTime
        })

        setDepartures(enrichedDepartures.slice(0, upcomingDeparturesCount))
        setDebugInfo(debugLines.join('\n'))
        setLoading(false)
      } catch (err) {
        console.error('Error loading departures:', err)
        setDebugInfo(`Error loading departures: ${err}`)
        setLoading(false)
      }
    }

    loadDepartures()

    // Auto-refresh if enabled
    if (updateInterval > 0) {
      const interval = setInterval(loadDepartures, updateInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [stopGroups, workerApi, gtfsApi, routes, upcomingDeparturesCount, updateInterval, agencies])

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600) % 24  // Use modulo 24 for times >= 24h
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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">
                  Next Departures
                </Typography>
                {loading && departures.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    (Updating...)
                  </Typography>
                )}
              </Box>
              {agencyTime && (
                <Typography variant="h6" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  {agencyTime}
                </Typography>
              )}
            </Box>

            {loading && departures.length === 0 && <Typography>Loading departures...</Typography>}

            {!loading && selectedCount === 0 && (
              <Typography color="text.secondary">
                Select one or more stops to see departures
              </Typography>
            )}

            {!loading && selectedCount > 0 && departures.length === 0 && (
              <Box>
                <Typography color="error" variant="h6" sx={{ mb: 2 }}>
                  No upcoming departures found
                </Typography>
                {debugInfo && (
                  <Paper sx={{ p: 2, bgcolor: 'grey.100', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {debugInfo}
                    </pre>
                  </Paper>
                )}
              </Box>
            )}

            {departures.length > 0 && (
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
                            {dep.realtimeDepartureSeconds !== null && dep.realtimeDepartureSeconds !== dep.departureTimeSeconds && (
                              <Typography variant="caption" color="error" display="block">
                                ({Math.round((dep.realtimeDepartureSeconds - dep.departureTimeSeconds) / 60)} min. delay)
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

import { useState, useEffect, useRef } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Alert,
  FormControlLabel,
  Checkbox,
  Chip
} from '@mui/material'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Dot
} from 'recharts'
import { Route, Trip, StopTimeWithRealtime, Agency, Stop } from 'gtfs-sqljs'
import type { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'
import { timeToSeconds } from '../components/utils'

interface TimeDistanceGraphTabProps {
  routes: Route[]
  workerApi: Remote<GtfsWorkerAPI> | null
  agencies: Agency[]
}

interface TripWithTimes {
  trip: Trip
  stopTimes: StopTimeWithRealtime[]
}

interface DirectionGroup {
  directionId: number
  headsign: string
  trips: TripWithTimes[]
}

interface ChartDataPoint {
  stopSequence: number
  stopName: string
  [key: string]: number | string | undefined // For trip data: tripId_theoretical, tripId_realtime
}

// Hash-based color generation from string
const stringToColor = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  // Generate HSL color with good saturation and lightness for visibility
  const h = Math.abs(hash) % 360
  const s = 65 + (Math.abs(hash >> 8) % 20) // 65-85%
  const l = 45 + (Math.abs(hash >> 16) % 15) // 45-60%

  return `hsl(${h}, ${s}%, ${l}%)`
}

// Format seconds as duration (e.g., "1h 23m" or "45m 30s")
const formatDuration = (seconds: number): string => {
  if (seconds < 0) seconds = 0
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  }
  return `${minutes}m ${secs.toString().padStart(2, '0')}s`
}

export default function TimeDistanceGraphTab({ routes, workerApi, agencies }: TimeDistanceGraphTabProps) {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [directions, setDirections] = useState<DirectionGroup[]>([])
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set())
  const [showRealtime, setShowRealtime] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [stopsMap, setStopsMap] = useState<Map<string, Stop>>(new Map())

  const directionsRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<HTMLDivElement>(null)

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  // Scroll to directions when a route is selected
  useEffect(() => {
    if (selectedRoute && directions.length > 0 && directionsRef.current) {
      setTimeout(() => {
        directionsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      }, 100)
    }
  }, [selectedRoute, directions.length])

  // Scroll to graph when trips are selected
  useEffect(() => {
    if (selectedTripIds.size > 0 && graphRef.current) {
      setTimeout(() => {
        graphRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      }, 100)
    }
  }, [selectedTripIds.size])

  // Load trips for selected route and date
  useEffect(() => {
    if (!workerApi || !selectedRoute) {
      setDirections([])
      setSelectedTripIds(new Set())
      return
    }

    setLoading(true)
    setError(null)

    const dateString = selectedDate.replace(/-/g, '')

    const loadTripsAndStopTimes = async () => {
      try {
        const trips = await workerApi.getTrips({
          routeId: selectedRoute.route_id,
          date: dateString,
          includeRealtime: true
        })

        // Load stop times for each trip and collect stop IDs
        const tripsWithTimes: TripWithTimes[] = []
        const stopIds = new Set<string>()
        for (const trip of trips) {
          const stopTimes = await workerApi.getStopTimes({
            tripId: trip.trip_id,
            includeRealtime: true
          })
          tripsWithTimes.push({ trip, stopTimes })
          stopTimes.forEach(st => stopIds.add(st.stop_id))
        }

        // Fetch stops and build a map
        const allStops = await workerApi.getStops()
        const newStopsMap = new Map<string, Stop>()
        allStops.forEach(stop => {
          if (stopIds.has(stop.stop_id)) {
            newStopsMap.set(stop.stop_id, stop)
          }
        })
        setStopsMap(newStopsMap)

        // Sort trips by first departure time
        tripsWithTimes.sort((a, b) => {
          const aTime = a.stopTimes[0]?.departure_time || ''
          const bTime = b.stopTimes[0]?.departure_time || ''
          return aTime.localeCompare(bTime)
        })

        // Group by direction_id
        const groupsMap = new Map<number, DirectionGroup>()

        tripsWithTimes.forEach((tripWithTimes) => {
          const dirId = tripWithTimes.trip.direction_id ?? 0
          if (!groupsMap.has(dirId)) {
            groupsMap.set(dirId, {
              directionId: dirId,
              headsign: tripWithTimes.trip.trip_headsign || `Direction ${dirId}`,
              trips: []
            })
          }
          groupsMap.get(dirId)!.trips.push(tripWithTimes)
        })

        const directionsList = Array.from(groupsMap.values())
        setDirections(directionsList)
        setSelectedTripIds(new Set())
        setLoading(false)
      } catch (err) {
        console.error('Error loading trips:', err)
        setError('Failed to load trips')
        setLoading(false)
      }
    }

    loadTripsAndStopTimes()
  }, [workerApi, selectedRoute, selectedDate])

  // Toggle trip selection
  const toggleTripSelection = (tripId: string) => {
    setSelectedTripIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tripId)) {
        newSet.delete(tripId)
      } else {
        newSet.add(tripId)
      }
      return newSet
    })
  }

  // Get selected trips data
  const getSelectedTrips = (): TripWithTimes[] => {
    const allTrips: TripWithTimes[] = []
    directions.forEach(dir => {
      dir.trips.forEach(tripWithTimes => {
        if (selectedTripIds.has(tripWithTimes.trip.trip_id)) {
          allTrips.push(tripWithTimes)
        }
      })
    })
    return allTrips
  }

  // Build chart data
  const buildChartData = (): { data: ChartDataPoint[], trips: TripWithTimes[] } => {
    const selectedTrips = getSelectedTrips()
    if (selectedTrips.length === 0) return { data: [], trips: [] }

    // Find the maximum stop sequence across all selected trips
    let maxStopSequence = 0
    selectedTrips.forEach(({ stopTimes }) => {
      stopTimes.forEach(st => {
        if (st.stop_sequence > maxStopSequence) {
          maxStopSequence = st.stop_sequence
        }
      })
    })

    // Build data points for each stop sequence
    const dataPoints: ChartDataPoint[] = []

    // Create a map of stop_sequence to stop_name (using first trip that has it)
    const stopNameMap = new Map<number, string>()
    selectedTrips.forEach(({ stopTimes }) => {
      stopTimes.forEach(st => {
        if (!stopNameMap.has(st.stop_sequence)) {
          const stop = stopsMap.get(st.stop_id)
          stopNameMap.set(st.stop_sequence, stop?.stop_name || `Stop ${st.stop_sequence}`)
        }
      })
    })

    // Always start at (0, 0) - virtual first point
    const firstPoint: ChartDataPoint = {
      stopSequence: 0,
      stopName: 'Departure'
    }
    selectedTrips.forEach(({ trip }) => {
      const tripKey = trip.trip_short_name || trip.trip_id
      firstPoint[`${tripKey}_theoretical`] = 0
      if (showRealtime && isToday) {
        firstPoint[`${tripKey}_realtime`] = 0
      }
    })
    dataPoints.push(firstPoint)

    // Get unique stop sequences sorted
    const stopSequences = Array.from(new Set(
      selectedTrips.flatMap(({ stopTimes }) => stopTimes.map(st => st.stop_sequence))
    )).sort((a, b) => a - b)

    // Build data for each stop sequence
    stopSequences.forEach(seq => {
      const point: ChartDataPoint = {
        stopSequence: seq,
        stopName: stopNameMap.get(seq) || `Stop ${seq}`
      }

      selectedTrips.forEach(({ trip, stopTimes }) => {
        const tripKey = trip.trip_short_name || trip.trip_id
        const stopTime = stopTimes.find(st => st.stop_sequence === seq)

        if (stopTime) {
          // Get first departure time for this trip
          const firstStopTime = stopTimes[0]
          const firstDepartureSeconds = timeToSeconds(firstStopTime.departure_time)

          // Theoretical time (seconds since departure)
          const arrivalSeconds = timeToSeconds(stopTime.arrival_time || stopTime.departure_time)
          const theoreticalSeconds = Math.max(0, arrivalSeconds - firstDepartureSeconds)
          point[`${tripKey}_theoretical`] = theoreticalSeconds

          // Realtime (if available and showing today)
          if (showRealtime && isToday && stopTime.realtime) {
            let realtimeArrivalSeconds: number | null = null

            // Try to get realtime arrival time
            if (stopTime.realtime.arrival_time) {
              // arrival_time is a Unix timestamp
              const agencyTimezone = agencies.length > 0 && agencies[0].agency_timezone
                ? agencies[0].agency_timezone
                : Intl.DateTimeFormat().resolvedOptions().timeZone

              const date = new Date(stopTime.realtime.arrival_time * 1000)
              const timeString = date.toLocaleString('en-US', {
                timeZone: agencyTimezone,
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
              realtimeArrivalSeconds = timeToSeconds(timeString)
            } else if (stopTime.realtime.arrival_delay !== undefined) {
              // Apply delay to theoretical arrival
              const theoreticalArrival = timeToSeconds(stopTime.arrival_time || stopTime.departure_time)
              realtimeArrivalSeconds = theoreticalArrival + stopTime.realtime.arrival_delay
            }

            if (realtimeArrivalSeconds !== null) {
              // Get first stop realtime departure
              let firstRealtimeDeparture = firstDepartureSeconds
              if (firstStopTime.realtime?.departure_time) {
                const agencyTimezone = agencies.length > 0 && agencies[0].agency_timezone
                  ? agencies[0].agency_timezone
                  : Intl.DateTimeFormat().resolvedOptions().timeZone
                const date = new Date(firstStopTime.realtime.departure_time * 1000)
                const timeString = date.toLocaleString('en-US', {
                  timeZone: agencyTimezone,
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
                firstRealtimeDeparture = timeToSeconds(timeString)
              } else if (firstStopTime.realtime?.departure_delay !== undefined) {
                firstRealtimeDeparture = firstDepartureSeconds + firstStopTime.realtime.departure_delay
              }

              // Ensure never negative
              const realtimeSeconds = Math.max(0, realtimeArrivalSeconds - firstRealtimeDeparture)
              point[`${tripKey}_realtime`] = realtimeSeconds
            }
          }
        }
      })

      dataPoints.push(point)
    })

    return { data: dataPoints, trips: selectedTrips }
  }

  const { data: chartData, trips: chartTrips } = buildChartData()

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean, payload?: Array<{ name: string, value: number, color: string }>, label?: number }) => {
    if (!active || !payload || payload.length === 0) return null

    const point = chartData.find(p => p.stopSequence === label)

    return (
      <Paper sx={{ p: 1.5, maxWidth: 300 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
          {point?.stopName || `Stop ${label}`}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Stop sequence: {label}
        </Typography>
        {payload.map((entry, index) => {
          const isRealtime = entry.name.includes('(RT)')
          return (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Box sx={{
                width: 12,
                height: 3,
                backgroundColor: entry.color,
                borderStyle: isRealtime ? 'dashed' : 'solid'
              }} />
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                {entry.name}: {formatDuration(entry.value)}
              </Typography>
            </Box>
          )
        })}
      </Paper>
    )
  }

  // Custom dot component for the chart
  const renderDot = (props: { cx?: number, cy?: number, fill?: string }) => {
    const { cx, cy, fill } = props
    if (cx === undefined || cy === undefined) return null
    return <Dot cx={cx} cy={cy} r={4} fill={fill} />
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Top controls (Route + Date) */}
      <Box sx={{ display: 'flex', gap: 3, mb: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Route selection */}
        <Paper sx={{ p: 2, flex: 1, height: '300px', overflow: 'auto' }}>
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
                    <ListItemText primary={route.route_long_name} />
                  </ListItemButton>
                </ListItem>
              )
            })}
          </List>
        </Paper>

        {/* Date selection */}
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

          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={showRealtime}
                  onChange={(e) => setShowRealtime(e.target.checked)}
                  disabled={!isToday}
                />
              }
              label={
                <Typography variant="body2">
                  Show real-time data
                  {!isToday && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      (only available for today)
                    </Typography>
                  )}
                </Typography>
              }
            />
          </Box>
        </Paper>
      </Box>

      {/* Direction groups and trip selection */}
      {selectedRoute && directions.length > 0 && (
        <Box ref={directionsRef} sx={{ mb: 3 }}>
          {directions.map((dir) => {
            const bgColor = selectedRoute.route_color ? `#${selectedRoute.route_color}` : '#CCCCCC'
            const textColor = selectedRoute.route_text_color ? `#${selectedRoute.route_text_color}` : '#000000'

            return (
              <Paper key={dir.directionId} sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
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
                      justifyContent: 'center'
                    }}
                  >
                    {selectedRoute.route_short_name || selectedRoute.route_long_name?.substring(0, 3)}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {dir.headsign}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dir.trips.length} trips - Click to select/deselect
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {dir.trips.map(({ trip, stopTimes }) => {
                    const tripKey = trip.trip_short_name || trip.trip_id
                    const isSelected = selectedTripIds.has(trip.trip_id)
                    const color = stringToColor(tripKey)
                    const firstDeparture = stopTimes[0]?.departure_time?.substring(0, 5) || ''

                    return (
                      <Chip
                        key={trip.trip_id}
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {tripKey}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ({firstDeparture})
                            </Typography>
                          </Box>
                        }
                        onClick={() => toggleTripSelection(trip.trip_id)}
                        sx={{
                          borderColor: color,
                          borderWidth: 2,
                          borderStyle: 'solid',
                          backgroundColor: isSelected ? `${color}20` : 'transparent',
                          '&:hover': {
                            backgroundColor: isSelected ? `${color}30` : `${color}10`
                          }
                        }}
                        variant={isSelected ? 'filled' : 'outlined'}
                      />
                    )
                  })}
                </Box>
              </Paper>
            )
          })}
        </Box>
      )}

      {/* Loading state */}
      {loading && (
        <Typography>Loading trips...</Typography>
      )}

      {/* Error state */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Graph */}
      {chartData.length > 0 && chartTrips.length > 0 && (
        <Paper ref={graphRef} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Time-Distance Graph
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            X-axis: Stop sequence | Y-axis: Time since departure
            {showRealtime && isToday && ' | Dashed lines: Real-time data'}
          </Typography>

          <Box sx={{ width: '100%', height: 500 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="stopSequence"
                  label={{ value: 'Stop Sequence', position: 'bottom', offset: 40 }}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => formatDuration(value)}
                  label={{ value: 'Time Since Departure', angle: -90, position: 'insideLeft', offset: 10 }}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: 20 }}
                  formatter={(value) => {
                    const isRealtime = value.includes('(RT)')
                    return (
                      <span style={{
                        fontWeight: isRealtime ? 'normal' : 'bold',
                        fontStyle: isRealtime ? 'italic' : 'normal'
                      }}>
                        {value}
                      </span>
                    )
                  }}
                />

                {chartTrips.map(({ trip, stopTimes }) => {
                  const tripKey = trip.trip_short_name || trip.trip_id
                  const color = stringToColor(tripKey)
                  const hasRealtime = showRealtime && isToday && stopTimes.some(st => st.realtime)

                  return (
                    <React.Fragment key={trip.trip_id}>
                      {/* Theoretical line */}
                      <Line
                        type="monotone"
                        dataKey={`${tripKey}_theoretical`}
                        name={tripKey}
                        stroke={color}
                        strokeWidth={2}
                        dot={renderDot}
                        connectNulls
                      />

                      {/* Realtime line (if available) */}
                      {hasRealtime && (
                        <Line
                          type="monotone"
                          dataKey={`${tripKey}_realtime`}
                          name={`${tripKey} (RT)`}
                          stroke={color}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={renderDot}
                          connectNulls
                        />
                      )}
                    </React.Fragment>
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {/* Empty state */}
      {selectedRoute && directions.length > 0 && selectedTripIds.size === 0 && !loading && (
        <Alert severity="info">
          Select one or more trips above to display the time-distance graph.
        </Alert>
      )}

      {selectedRoute && directions.length === 0 && !loading && (
        <Alert severity="warning">
          No trips found for this route on the selected date.
        </Alert>
      )}
    </Box>
  )
}

// Need to import React for JSX.Element in Legend formatter
import React from 'react'

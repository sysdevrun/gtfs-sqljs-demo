import { useEffect, useState } from 'react'
import { Box, Paper, Typography, Dialog, DialogTitle, DialogContent, Fab } from '@mui/material'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import { MyLocation as MyLocationIcon } from '@mui/icons-material'
import L from 'leaflet'
import { VehiclePosition, Route, Trip, StopTimeWithRealtime } from 'gtfs-sqljs'
import { GtfsApiAdapter } from '../utils/GtfsApiAdapter'
import 'leaflet/dist/leaflet.css'

interface MapTabProps {
  vehicles: VehiclePosition[]
  routes: Route[]
  gtfsApi: GtfsApiAdapter | null
}

interface LastStopInfo {
  stopName: string
  scheduledArrival: string    // HH:MM format
  realtimeArrival: string | null  // HH:MM format if available
  arrivalDelay: number | null     // Delay in seconds
}

interface VehicleWithDetails {
  vehicle: VehiclePosition
  route: Route | null
  trip: Trip | null
  stopTimes: StopTimeWithRealtime[]
  lastStop: LastStopInfo | null
}

// Fix for default marker icon in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

function createColoredIcon(
  textColor: string,
  bgColor: string,
  tripLabel: string | null,
  vehicleLabel: string | null,
  lastStopInfo: LastStopInfo | null
): L.DivIcon {
  // Build last stop display
  let lastStopHtml = ''
  if (lastStopInfo) {
    // Determine delay color
    let delayColor = textColor
    let delayText = ''
    if (lastStopInfo.arrivalDelay !== null) {
      const delayMinutes = Math.floor(Math.abs(lastStopInfo.arrivalDelay) / 60)
      if (lastStopInfo.arrivalDelay > 120) { // More than 2 minutes late
        delayColor = '#ff4444'
        delayText = ` <span style="color: ${delayColor};">+${delayMinutes}m</span>`
      } else if (lastStopInfo.arrivalDelay < -120) { // More than 2 minutes early
        delayColor = '#44ff44'
        delayText = ` <span style="color: ${delayColor};">-${delayMinutes}m</span>`
      }
    }

    const arrivalTime = lastStopInfo.realtimeArrival || lastStopInfo.scheduledArrival
    const realtimeIndicator = lastStopInfo.realtimeArrival ? '' : '<span style="opacity: 0.6;"> (sched)</span>'

    lastStopHtml = `
      <div style="font-size: 12px; opacity: 0.95; margin-top: 3px; line-height: 1.3;">
        → ${lastStopInfo.stopName}
      </div>
      <div style="font-size: 11px; opacity: 0.9; line-height: 1.3;">
        ${arrivalTime}${delayText}${realtimeIndicator}
      </div>
    `
  }

  const pinWidth = 30
  const pinHeight = 40
  const gap = 10

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        transform: translate(-50%, -100%);
      ">
        <!-- Text above marker -->
        <div style="
          color: #000000;
          font-weight: bold;
          font-size: 11px;
          white-space: nowrap;
          text-align: center;
          line-height: 1.1;
          text-shadow:
            -1px -1px 0 #fff,
            1px -1px 0 #fff,
            -1px 1px 0 #fff,
            1px 1px 0 #fff,
            0 0 3px #fff;
        ">
          <div style="font-weight: bold;">
            ${tripLabel} (${vehicleLabel})
          </div>
          ${lastStopHtml}
        </div>

        <!-- Gap -->
        <div style="height: ${gap}px;"></div>

        <!-- Pin marker -->
        <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 30 40" style="display: block;">
          <!-- Pin shape: circle + triangle -->
          <defs>
            <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
              <feOffset dx="0" dy="2" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <!-- Teardrop shape -->
          <circle cx="15" cy="12" r="11" fill="${bgColor}" stroke="white" stroke-width="2" filter="url(#pin-shadow)"/>
          <path d="M 15 23 L 8 32 L 15 40 L 22 32 Z" fill="${bgColor}" stroke="white" stroke-width="2" filter="url(#pin-shadow)"/>
        </svg>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  })
}

function calculateLastStop(
  vehicle: VehiclePosition,
  stopTimes: StopTimeWithRealtime[],
  gtfsApi: GtfsApiAdapter
): LastStopInfo | null {
  try {
    // Sort stop times by stop_sequence to ensure correct order
    const sortedStopTimes = [...stopTimes].sort((a, b) => a.stop_sequence - b.stop_sequence)

    // Get the last stop (destination)
    const lastStopTime = sortedStopTimes[sortedStopTimes.length - 1]
    if (!lastStopTime) return null

    // Get stop information
    const stops = gtfsApi.getStops({ stopId: lastStopTime.stop_id })
    const stopName = stops.length > 0 ? stops[0].stop_name : lastStopTime.stop_id

    // Parse scheduled arrival time (format: "HH:MM:SS")
    const scheduledArrival = lastStopTime.arrival_time.substring(0, 5) // Get HH:MM

    // Get realtime arrival if available
    let realtimeArrival: string | null = null
    let arrivalDelay: number | null = null

    if (lastStopTime.realtime?.arrival_time) {
      // Convert Unix timestamp to HH:MM format
      const realtimeDate = new Date(lastStopTime.realtime.arrival_time * 1000)
      const hours = realtimeDate.getHours().toString().padStart(2, '0')
      const minutes = realtimeDate.getMinutes().toString().padStart(2, '0')
      realtimeArrival = `${hours}:${minutes}`

      // Calculate delay in seconds
      // Parse scheduled time to seconds from midnight
      const [schedHours, schedMinutes, schedSeconds] = lastStopTime.arrival_time.split(':').map(Number)
      const scheduledSeconds = schedHours * 3600 + schedMinutes * 60 + (schedSeconds || 0)

      // Get realtime seconds from midnight
      const realtimeSeconds = realtimeDate.getHours() * 3600 + realtimeDate.getMinutes() * 60 + realtimeDate.getSeconds()

      arrivalDelay = realtimeSeconds - scheduledSeconds
    }

    return {
      stopName,
      scheduledArrival,
      realtimeArrival,
      arrivalDelay
    }
  } catch (err) {
    console.error('Error calculating last stop:', err)
    return null
  }
}

function MapEventHandler({ onUserInteraction }: { onUserInteraction: () => void }) {
  const map = useMap()

  useEffect(() => {
    const handleInteraction = () => {
      onUserInteraction()
    }

    // Listen for user-initiated map movements
    map.on('movestart', handleInteraction)
    map.on('zoomstart', handleInteraction)
    map.on('dragstart', handleInteraction)

    return () => {
      map.off('movestart', handleInteraction)
      map.off('zoomstart', handleInteraction)
      map.off('dragstart', handleInteraction)
    }
  }, [map, onUserInteraction])

  return null
}

function MapBounds({
  vehicles,
  hasUserInteracted,
  shouldRecenter
}: {
  vehicles: VehiclePosition[]
  hasUserInteracted: boolean
  shouldRecenter: boolean
}) {
  const map = useMap()

  useEffect(() => {
    // Only auto-center if user hasn't interacted OR if recenter was explicitly requested
    if (vehicles.length > 0 && (!hasUserInteracted || shouldRecenter)) {
      const bounds = vehicles
        .filter(v => v.position?.latitude && v.position?.longitude)
        .map(v => [v.position!.latitude!, v.position!.longitude!] as [number, number])

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    }
  }, [vehicles, map, hasUserInteracted, shouldRecenter])

  return null
}

export default function MapTab({ vehicles, routes, gtfsApi }: MapTabProps) {
  const [vehiclesWithDetails, setVehiclesWithDetails] = useState<VehicleWithDetails[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithDetails | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [shouldRecenter, setShouldRecenter] = useState(false)

  useEffect(() => {
    const loadVehicleDetails = async () => {
      if (!gtfsApi) return

      const details: VehicleWithDetails[] = []

      for (const vehicle of vehicles) {
        if (!vehicle.position?.latitude || !vehicle.position?.longitude) continue

        const route = vehicle.route_id ? routes.find(r => r.route_id === vehicle.route_id) || null : null
        let trip: Trip | null = null
        let stopTimes: StopTimeWithRealtime[] = []
        let lastStop: LastStopInfo | null = null

        if (vehicle.trip_id) {
          try {
            const tripData = await gtfsApi.fetchAndCacheTripData(vehicle.trip_id)
            trip = tripData.trip || null
            stopTimes = tripData.stopTimes || []

            // Calculate last stop information
            if (stopTimes.length > 0) {
              lastStop = calculateLastStop(vehicle, stopTimes, gtfsApi)
            }
          } catch (err) {
            console.error('Error fetching trip data:', err)
          }
        }

        details.push({ vehicle, route, trip, stopTimes, lastStop })
      }

      setVehiclesWithDetails(details)
    }

    loadVehicleDetails()
  }, [vehicles, routes, gtfsApi])

  const handleMarkerClick = (vehicleWithDetails: VehicleWithDetails) => {
    setSelectedVehicle(vehicleWithDetails)
    setDialogOpen(true)
  }

  const handleUserInteraction = () => {
    if (!hasUserInteracted) {
      setHasUserInteracted(true)
    }
    // Reset shouldRecenter after interaction is detected
    if (shouldRecenter) {
      setShouldRecenter(false)
    }
  }

  const handleRecenterClick = () => {
    setShouldRecenter(true)
    setHasUserInteracted(false)
    // Reset shouldRecenter after a short delay to allow MapBounds to trigger
    setTimeout(() => setShouldRecenter(false), 100)
  }

  const center: [number, number] = vehiclesWithDetails.length > 0 && vehiclesWithDetails[0].vehicle.position
    ? [vehiclesWithDetails[0].vehicle.position.latitude!, vehiclesWithDetails[0].vehicle.position.longitude!]
    : [48.8566, 2.3522] // Default to Paris

  return (
    <Box sx={{ p: 3, height: 'calc(100vh - 150px)' }}>
      <Paper sx={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
        {vehiclesWithDetails.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography>No vehicle positions available</Typography>
          </Box>
        ) : (
          <>
            <MapContainer
              center={center}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapEventHandler onUserInteraction={handleUserInteraction} />
              <MapBounds
                vehicles={vehicles}
                hasUserInteracted={hasUserInteracted}
                shouldRecenter={shouldRecenter}
              />
              {vehiclesWithDetails.map((vd, idx) => {
                if (!vd.vehicle.position?.latitude || !vd.vehicle.position?.longitude) return null

                const textColor = vd.route?.route_text_color ? `#${vd.route.route_text_color}` : '#000000'
                const bgColor = vd.route?.route_color ? `#${vd.route.route_color}` : '#CCCCCC'
                const tripLabel = vd.trip?.trip_short_name || null
                const vehicleLabel = vd.vehicle.vehicle?.label || null

                return (
                  <Marker
                    key={idx}
                    position={[vd.vehicle.position.latitude, vd.vehicle.position.longitude]}
                    icon={createColoredIcon(textColor, bgColor, tripLabel, vehicleLabel, vd.lastStop)}
                    eventHandlers={{
                      click: () => handleMarkerClick(vd)
                    }}
                  />
                )
              })}
            </MapContainer>

            {/* Recenter button */}
            <Fab
              color="primary"
              aria-label="recenter map"
              onClick={handleRecenterClick}
              sx={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                zIndex: 1000
              }}
            >
              <MyLocationIcon />
            </Fab>
          </>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Vehicle Details</DialogTitle>
        <DialogContent>
          {selectedVehicle && (
            <Box>
              <Typography variant="body1">
                <strong>Vehicle ID:</strong> {selectedVehicle.vehicle.vehicle?.id || 'N/A'}
              </Typography>
              <Typography variant="body1">
                <strong>Label:</strong> {selectedVehicle.vehicle.vehicle?.label || 'N/A'}
              </Typography>
              {selectedVehicle.route && (
                <>
                  <Typography variant="body1">
                    <strong>Route:</strong> {selectedVehicle.route.route_short_name || selectedVehicle.route.route_long_name}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Route Name:</strong> {selectedVehicle.route.route_long_name}
                  </Typography>
                </>
              )}
              {selectedVehicle.trip && (
                <>
                  <Typography variant="body1">
                    <strong>Trip:</strong> {selectedVehicle.trip.trip_short_name || selectedVehicle.trip.trip_id}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Headsign:</strong> {selectedVehicle.trip.trip_headsign}
                  </Typography>
                </>
              )}
              {selectedVehicle.vehicle.position && (
                <>
                  <Typography variant="body1">
                    <strong>Position:</strong> {selectedVehicle.vehicle.position.latitude?.toFixed(6)}, {selectedVehicle.vehicle.position.longitude?.toFixed(6)}
                  </Typography>
                  {selectedVehicle.vehicle.position.speed && (
                    <Typography variant="body1">
                      <strong>Speed:</strong> {selectedVehicle.vehicle.position.speed} m/s
                    </Typography>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}

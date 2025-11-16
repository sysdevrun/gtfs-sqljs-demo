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

interface NextStopInfo {
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
  nextStop: NextStopInfo | null
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
  label: string,
  vehicleId: string | null,
  nextStopInfo: NextStopInfo | null
): L.DivIcon {
  // Build the display label with vehicle ID if available
  const mainLabel = vehicleId ? `${label} (${vehicleId})` : label

  // Build next stop display
  let nextStopHtml = ''
  if (nextStopInfo) {
    // Determine delay color
    let delayColor = textColor
    let delayText = ''
    if (nextStopInfo.arrivalDelay !== null) {
      const delayMinutes = Math.floor(Math.abs(nextStopInfo.arrivalDelay) / 60)
      if (nextStopInfo.arrivalDelay > 120) { // More than 2 minutes late
        delayColor = '#ff4444'
        delayText = ` <span style="color: ${delayColor};">+${delayMinutes}m</span>`
      } else if (nextStopInfo.arrivalDelay < -120) { // More than 2 minutes early
        delayColor = '#44ff44'
        delayText = ` <span style="color: ${delayColor};">-${delayMinutes}m</span>`
      }
    }

    const arrivalTime = nextStopInfo.realtimeArrival || nextStopInfo.scheduledArrival
    const realtimeIndicator = nextStopInfo.realtimeArrival ? '' : '<span style="opacity: 0.6;"> (sched)</span>'

    nextStopHtml = `
      <div style="font-size: 12px; opacity: 0.95; margin-top: 3px; line-height: 1.3;">
        → ${nextStopInfo.stopName}
      </div>
      <div style="font-size: 11px; opacity: 0.9; line-height: 1.3;">
        ${arrivalTime}${delayText}${realtimeIndicator}
      </div>
    `
  }

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${bgColor};
        color: ${textColor};
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: bold;
        font-size: 16px;
        white-space: nowrap;
        border: 3px solid white;
        box-shadow: 0 3px 8px rgba(0,0,0,0.5);
        min-width: 50px;
        text-align: center;
        line-height: 1.4;
      ">
        <div style="font-size: 16px; font-weight: bold;">
          ${mainLabel}
        </div>
        ${nextStopHtml}
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  })
}

function calculateNextStop(
  vehicle: VehiclePosition,
  stopTimes: StopTimeWithRealtime[],
  gtfsApi: GtfsApiAdapter
): NextStopInfo | null {
  try {
    // Sort stop times by stop_sequence to ensure correct order
    const sortedStopTimes = [...stopTimes].sort((a, b) => a.stop_sequence - b.stop_sequence)

    // Find current position in the trip
    let currentStopIndex = -1

    // Try to use current_stop_sequence if available
    if (vehicle.current_stop_sequence !== undefined && vehicle.current_stop_sequence !== null) {
      currentStopIndex = sortedStopTimes.findIndex(st => st.stop_sequence >= vehicle.current_stop_sequence!)
    }
    // Otherwise try to use stop_id
    else if (vehicle.stop_id) {
      currentStopIndex = sortedStopTimes.findIndex(st => st.stop_id === vehicle.stop_id)
    }

    // If we couldn't determine current position, use the first upcoming stop
    if (currentStopIndex === -1) {
      currentStopIndex = 0
    }

    // Get the next stop (current if vehicle hasn't reached it yet, or next one)
    const nextStopTime = sortedStopTimes[currentStopIndex]
    if (!nextStopTime) return null

    // Get stop information
    const stops = gtfsApi.getStops({ stopId: nextStopTime.stop_id })
    const stopName = stops.length > 0 ? stops[0].stop_name : nextStopTime.stop_id

    // Parse scheduled arrival time (format: "HH:MM:SS")
    const scheduledArrival = nextStopTime.arrival_time.substring(0, 5) // Get HH:MM

    // Get realtime arrival if available
    let realtimeArrival: string | null = null
    let arrivalDelay: number | null = null

    if (nextStopTime.realtime?.arrival_time) {
      // Convert Unix timestamp to HH:MM format
      const realtimeDate = new Date(nextStopTime.realtime.arrival_time * 1000)
      const hours = realtimeDate.getHours().toString().padStart(2, '0')
      const minutes = realtimeDate.getMinutes().toString().padStart(2, '0')
      realtimeArrival = `${hours}:${minutes}`

      // Calculate delay in seconds
      // Parse scheduled time to seconds from midnight
      const [schedHours, schedMinutes, schedSeconds] = nextStopTime.arrival_time.split(':').map(Number)
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
    console.error('Error calculating next stop:', err)
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
        let nextStop: NextStopInfo | null = null

        if (vehicle.trip_id) {
          try {
            const tripData = await gtfsApi.fetchAndCacheTripData(vehicle.trip_id)
            trip = tripData.trip || null
            stopTimes = tripData.stopTimes || []

            // Calculate next stop information
            if (stopTimes.length > 0) {
              nextStop = calculateNextStop(vehicle, stopTimes, gtfsApi)
            }
          } catch (err) {
            console.error('Error fetching trip data:', err)
          }
        }

        details.push({ vehicle, route, trip, stopTimes, nextStop })
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
                const label = vd.trip?.trip_short_name || vd.vehicle.vehicle?.label || 'Vehicle'
                const vehicleId = vd.vehicle.vehicle?.id || vd.vehicle.vehicle?.label || null

                return (
                  <Marker
                    key={idx}
                    position={[vd.vehicle.position.latitude, vd.vehicle.position.longitude]}
                    icon={createColoredIcon(textColor, bgColor, label, vehicleId, vd.nextStop)}
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

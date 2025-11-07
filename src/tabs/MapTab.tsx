import { useEffect, useState } from 'react'
import { Box, Paper, Typography, Dialog, DialogTitle, DialogContent } from '@mui/material'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { VehiclePosition, Route, Trip } from 'gtfs-sqljs'
import { GtfsApiAdapter } from '../utils/GtfsApiAdapter'
import 'leaflet/dist/leaflet.css'

interface MapTabProps {
  vehicles: VehiclePosition[]
  routes: Route[]
  gtfsApi: GtfsApiAdapter | null
}

interface VehicleWithDetails {
  vehicle: VehiclePosition
  route: Route | null
  trip: Trip | null
}

// Fix for default marker icon in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

function createColoredIcon(textColor: string, bgColor: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${bgColor};
        color: ${textColor};
        padding: 6px 12px;
        border-radius: 4px;
        font-weight: bold;
        font-size: 14px;
        white-space: nowrap;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        min-width: 40px;
        text-align: center;
      ">
        ${label}
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  })
}

function MapBounds({ vehicles }: { vehicles: VehiclePosition[] }) {
  const map = useMap()

  useEffect(() => {
    if (vehicles.length > 0) {
      const bounds = vehicles
        .filter(v => v.position?.latitude && v.position?.longitude)
        .map(v => [v.position!.latitude!, v.position!.longitude!] as [number, number])

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    }
  }, [vehicles, map])

  return null
}

export default function MapTab({ vehicles, routes, gtfsApi }: MapTabProps) {
  const [vehiclesWithDetails, setVehiclesWithDetails] = useState<VehicleWithDetails[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithDetails | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    const loadVehicleDetails = async () => {
      if (!gtfsApi) return

      const details: VehicleWithDetails[] = []

      for (const vehicle of vehicles) {
        if (!vehicle.position?.latitude || !vehicle.position?.longitude) continue

        const route = vehicle.route_id ? routes.find(r => r.route_id === vehicle.route_id) || null : null
        let trip: Trip | null = null

        if (vehicle.trip_id) {
          try {
            const tripData = await gtfsApi.fetchAndCacheTripData(vehicle.trip_id)
            trip = tripData.trip || null
          } catch (err) {
            console.error('Error fetching trip data:', err)
          }
        }

        details.push({ vehicle, route, trip })
      }

      setVehiclesWithDetails(details)
    }

    loadVehicleDetails()
  }, [vehicles, routes, gtfsApi])

  const handleMarkerClick = (vehicleWithDetails: VehicleWithDetails) => {
    setSelectedVehicle(vehicleWithDetails)
    setDialogOpen(true)
  }

  const center: [number, number] = vehiclesWithDetails.length > 0 && vehiclesWithDetails[0].vehicle.position
    ? [vehiclesWithDetails[0].vehicle.position.latitude!, vehiclesWithDetails[0].vehicle.position.longitude!]
    : [48.8566, 2.3522] // Default to Paris

  return (
    <Box sx={{ p: 3, height: 'calc(100vh - 150px)' }}>
      <Paper sx={{ height: '100%', overflow: 'hidden' }}>
        {vehiclesWithDetails.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography>No vehicle positions available</Typography>
          </Box>
        ) : (
          <MapContainer
            center={center}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBounds vehicles={vehicles} />
            {vehiclesWithDetails.map((vd, idx) => {
              if (!vd.vehicle.position?.latitude || !vd.vehicle.position?.longitude) return null

              const textColor = vd.route?.route_text_color ? `#${vd.route.route_text_color}` : '#000000'
              const bgColor = vd.route?.route_color ? `#${vd.route.route_color}` : '#CCCCCC'
              const label = vd.trip?.trip_short_name || vd.vehicle.vehicle?.label || 'Vehicle'

              return (
                <Marker
                  key={idx}
                  position={[vd.vehicle.position.latitude, vd.vehicle.position.longitude]}
                  icon={createColoredIcon(textColor, bgColor, label)}
                  eventHandlers={{
                    click: () => handleMarkerClick(vd)
                  }}
                />
              )
            })}
          </MapContainer>
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

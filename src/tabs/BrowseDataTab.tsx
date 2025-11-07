import { Box } from '@mui/material'
import { Agency, Route, Trip, StopTimeWithRealtime, VehiclePosition } from 'gtfs-sqljs'
import AgenciesList from '../components/AgenciesList'
import RoutesGrid from '../components/RoutesGrid'
import TripsList from '../components/TripsList'
import StopTimesTable from '../components/StopTimesTable'
import { GtfsApiAdapter } from '../utils/GtfsApiAdapter'

interface BrowseDataTabProps {
  agencies: Agency[]
  routes: Route[]
  selectedRoute: string | null
  setSelectedRoute: (routeId: string | null) => void
  trips: Trip[]
  selectedTrip: string | null
  setSelectedTrip: (tripId: string | null) => void
  stopTimes: StopTimeWithRealtime[]
  vehicles: VehiclePosition[]
  gtfsApi: GtfsApiAdapter | null
}

export default function BrowseDataTab({
  agencies,
  routes,
  selectedRoute,
  setSelectedRoute,
  trips,
  selectedTrip,
  setSelectedTrip,
  stopTimes,
  vehicles,
  gtfsApi
}: BrowseDataTabProps) {
  return (
    <Box sx={{ p: 3 }}>
      <AgenciesList agencies={agencies} />

      <RoutesGrid
        routes={routes}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
      />

      {selectedRoute && trips.length > 0 && gtfsApi && (
        <TripsList
          trips={trips}
          selectedTrip={selectedTrip}
          setSelectedTrip={setSelectedTrip}
          routes={routes}
          selectedRoute={selectedRoute}
          vehicles={vehicles}
          gtfs={gtfsApi}
          agencies={agencies}
        />
      )}

      {selectedTrip && stopTimes.length > 0 && gtfsApi && (
        <StopTimesTable
          stopTimes={stopTimes}
          gtfs={gtfsApi}
          selectedTrip={selectedTrip}
          vehicles={vehicles}
          agencies={agencies}
        />
      )}
    </Box>
  )
}

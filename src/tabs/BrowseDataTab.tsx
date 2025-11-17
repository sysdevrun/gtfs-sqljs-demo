import { useRef, useEffect } from 'react'
import { Box } from '@mui/material'
import { Agency, Route, Trip, StopTimeWithRealtime, VehiclePosition } from 'gtfs-sqljs'
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
  const tripsListRef = useRef<HTMLDivElement>(null)
  const stopTimesRef = useRef<HTMLDivElement>(null)

  // Scroll to trips list when a route is selected
  useEffect(() => {
    if (selectedRoute && trips.length > 0 && tripsListRef.current) {
      // Small delay to ensure the component is rendered
      setTimeout(() => {
        tripsListRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        })
      }, 100)
    }
  }, [selectedRoute, trips.length])

  // Scroll to stop times when a trip is selected
  useEffect(() => {
    if (selectedTrip && stopTimes.length > 0 && stopTimesRef.current) {
      // Small delay to ensure the component is rendered
      setTimeout(() => {
        stopTimesRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        })
      }, 100)
    }
  }, [selectedTrip, stopTimes.length])

  return (
    <Box sx={{ p: 3 }}>
      <RoutesGrid
        routes={routes}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
      />

      {selectedRoute && trips.length > 0 && gtfsApi && (
        <Box ref={tripsListRef}>
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
        </Box>
      )}

      {selectedTrip && stopTimes.length > 0 && gtfsApi && (
        <Box ref={stopTimesRef}>
          <StopTimesTable
            stopTimes={stopTimes}
            gtfs={gtfsApi}
            selectedTrip={selectedTrip}
            vehicles={vehicles}
            agencies={agencies}
          />
        </Box>
      )}
    </Box>
  )
}

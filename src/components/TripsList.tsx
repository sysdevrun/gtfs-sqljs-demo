import { Route, Trip, VehiclePosition, GtfsSqlJs, StopTimeWithRealtime, Agency } from 'gtfs-sqljs'
import { computeDelayFromTimestamp, formatDelay, getContrastColor } from './utils'
import RouteLabel from './RouteLabel'

interface TripsListProps {
  trips: Trip[]
  selectedTrip: string | null
  setSelectedTrip: (tripId: string) => void
  routes: Route[]
  selectedRoute: string
  vehicles: VehiclePosition[]
  gtfs: GtfsSqlJs
  agencies: Agency[]
}

interface GroupedTrips {
  headsign: string
  directionId: number
  trips: Trip[]
}

export default function TripsList({
  trips,
  selectedTrip,
  setSelectedTrip,
  routes,
  selectedRoute,
  vehicles,
  gtfs,
  agencies
}: TripsListProps) {
  // Get agency timezone (use first agency's timezone)
  if (agencies.length === 0 || !agencies[0].agency_timezone) {
    throw new Error('Agency timezone is required but not available')
  }
  const agencyTimezone = agencies[0].agency_timezone

  const currentRoute = routes.find((r) => r.route_id === selectedRoute)

  const groupTripsByHeadsign = (trips: Trip[]): GroupedTrips[] => {
    const grouped: { [key: string]: GroupedTrips } = {}

    trips.forEach(trip => {
      const headsign = trip.trip_headsign || 'Unknown Destination'
      const directionId = trip.direction_id ?? 0
      const key = `${headsign}-${directionId}`

      if (!grouped[key]) {
        grouped[key] = {
          headsign,
          directionId,
          trips: []
        }
      }

      grouped[key].trips.push(trip)
    })

    // Sort by direction ID
    return Object.values(grouped).sort((a, b) => a.directionId - b.directionId)
  }

  const getTripVehicle = (tripId: string): VehiclePosition | undefined => {
    return vehicles.find((v: VehiclePosition) => v.trip_id === tripId)
  }

  const getTripDelay = (tripId: string): number | undefined => {
    try {
      const stopTimesData = gtfs.getStopTimes({
        tripId: tripId,
        includeRealtime: true
      }) as StopTimeWithRealtime[]

      // Find the first stop with realtime data
      for (const st of stopTimesData) {
        if (st.realtime) {
          // Use delay if available
          if (st.realtime.arrival_delay !== undefined) {
            return st.realtime.arrival_delay
          }
          // Otherwise compute from arrival timestamp
          if (st.realtime.arrival_time !== undefined) {
            return computeDelayFromTimestamp(st.arrival_time, st.realtime.arrival_time, agencyTimezone)
          }
          // Fallback to departure delay
          if (st.realtime.departure_delay !== undefined) {
            return st.realtime.departure_delay
          }
          // Or compute from departure timestamp
          if (st.realtime.departure_time !== undefined) {
            return computeDelayFromTimestamp(st.departure_time, st.realtime.departure_time, agencyTimezone)
          }
        }
      }
    } catch (err) {
      console.error(`Error getting delay for trip ${tripId}:`, err)
    }

    return undefined
  }

  const groupedTrips = groupTripsByHeadsign(trips)

  // Get route colors
  const routeBgColor = currentRoute?.route_color ? `#${currentRoute.route_color}` : '#3b82f6'
  const routeTextColor = currentRoute?.route_text_color
    ? `#${currentRoute.route_text_color}`
    : getContrastColor(routeBgColor)

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Trips for Route
        </h2>
        {currentRoute && <RouteLabel route={currentRoute} />}
      </div>

      {groupedTrips.map((group, groupIdx) => (
        <div key={groupIdx} className="mb-6 last:mb-0">
          <h3 className="text-lg font-medium text-gray-700 mb-3">
            {group.headsign}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {group.trips.map((trip: Trip) => {
              const vehicleOnTrip = getTripVehicle(trip.trip_id)
              const delay = getTripDelay(trip.trip_id)
              const isSelected = selectedTrip === trip.trip_id

              return (
                <button
                  key={trip.trip_id}
                  onClick={() => setSelectedTrip(trip.trip_id)}
                  style={
                    isSelected
                      ? { backgroundColor: routeBgColor, color: routeTextColor }
                      : undefined
                  }
                  className={`p-3 rounded-lg text-sm font-medium transition-all hover:shadow-md relative ${
                    isSelected
                      ? 'shadow-lg'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {vehicleOnTrip && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                  <div>{trip.trip_short_name || trip.trip_id}</div>
                  {delay !== undefined && (
                    <div className={`text-xs mt-1 font-semibold ${
                      isSelected
                        ? 'opacity-90'
                        : delay > 0
                          ? 'text-red-600'
                          : delay < 0
                            ? 'text-green-600'
                            : 'text-gray-600'
                    }`}>
                      {formatDelay(delay)}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

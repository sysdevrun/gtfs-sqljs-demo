import { Route, Trip, VehiclePosition, GtfsSqlJs, StopTimeWithRealtime } from 'gtfs-sqljs'
import { computeDelayFromTimestamp, formatDelay } from './utils'
import { ExtendedStopTimeRealtime } from '../types'

interface TripsListProps {
  trips: Trip[]
  selectedTrip: string | null
  setSelectedTrip: (tripId: string) => void
  routes: Route[]
  selectedRoute: string
  vehicles: VehiclePosition[]
  gtfs: GtfsSqlJs
}

export default function TripsList({
  trips,
  selectedTrip,
  setSelectedTrip,
  routes,
  selectedRoute,
  vehicles,
  gtfs
}: TripsListProps) {
  const groupTripsByDirection = (trips: Trip[]) => {
    const grouped: { [key: string]: Trip[] } = {}
    trips.forEach(trip => {
      const dirId = trip.direction_id ?? '0'
      if (!grouped[dirId]) grouped[dirId] = []
      grouped[dirId].push(trip)
    })
    return grouped
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
          const realtimeExt = st.realtime as ExtendedStopTimeRealtime
          // Use delay if available
          if (st.realtime.arrival_delay !== undefined) {
            return st.realtime.arrival_delay
          }
          // Otherwise compute from arrival timestamp
          if (realtimeExt.arrival_time !== undefined) {
            return computeDelayFromTimestamp(st.arrival_time, realtimeExt.arrival_time)
          }
          // Fallback to departure delay
          if (st.realtime.departure_delay !== undefined) {
            return st.realtime.departure_delay
          }
          // Or compute from departure timestamp
          if (realtimeExt.departure_time !== undefined) {
            return computeDelayFromTimestamp(st.departure_time, realtimeExt.departure_time)
          }
        }
      }
    } catch (err) {
      console.error(`Error getting delay for trip ${tripId}:`, err)
    }

    return undefined
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        Trips for Route{' '}
        <span className="text-blue-600">
          {routes.find((r) => r.route_id === selectedRoute)?.route_short_name}
        </span>
      </h2>
      {Object.entries(groupTripsByDirection(trips)).map(([directionId, dirTrips]) => (
        <div key={directionId} className="mb-6 last:mb-0">
          <h3 className="text-lg font-medium text-gray-700 mb-3">
            Direction {directionId}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {dirTrips.map((trip: Trip) => {
              const vehicleOnTrip = getTripVehicle(trip.trip_id)
              const delay = getTripDelay(trip.trip_id)
              return (
                <button
                  key={trip.trip_id}
                  onClick={() => setSelectedTrip(trip.trip_id)}
                  className={`p-3 rounded-lg text-sm font-medium transition-all hover:shadow-md relative ${
                    selectedTrip === trip.trip_id
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {vehicleOnTrip && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                  <div>{trip.trip_short_name || trip.trip_id}</div>
                  {trip.trip_headsign && (
                    <div className="text-xs mt-1 opacity-80 truncate">
                      {trip.trip_headsign}
                    </div>
                  )}
                  {delay !== undefined && (
                    <div className={`text-xs mt-1 font-semibold ${
                      selectedTrip === trip.trip_id
                        ? 'text-white'
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

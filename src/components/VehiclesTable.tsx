import { VehiclePosition, Route, GtfsSqlJs, StopTimeWithRealtime } from 'gtfs-sqljs'
import { getVehicleStatus, getVehicleStatusColor, formatTimeAgo, formatDistance, computeDelayFromTimestamp, formatDelay } from './utils'
import RouteLabel from './RouteLabel'
import { getDistance } from 'geolib'

interface VehiclesTableProps {
  vehicles: VehiclePosition[]
  getRouteById: (routeId: string) => Route | undefined
  gtfs: GtfsSqlJs
  realtimeLastUpdated: number
}

interface GroupedVehicles {
  routeId: string
  route: Route | null | undefined
  tripHeadsign: string
  directionId: number
  vehicles: VehiclePosition[]
  routeSortOrder: number
}

export default function VehiclesTable({ vehicles, getRouteById, gtfs, realtimeLastUpdated }: VehiclesTableProps) {
  const getStopById = (stopId: string) => {
    const stops = gtfs.getStops({ stopId })
    return stops.length > 0 ? stops[0] : null
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
            return computeDelayFromTimestamp(st.arrival_time, st.realtime.arrival_time)
          }
          // Fallback to departure delay
          if (st.realtime.departure_delay !== undefined) {
            return st.realtime.departure_delay
          }
          // Or compute from departure timestamp
          if (st.realtime.departure_time !== undefined) {
            return computeDelayFromTimestamp(st.departure_time, st.realtime.departure_time)
          }
        }
      }
    } catch (err) {
      console.error(`Error getting delay for trip ${tripId}:`, err)
    }
    return undefined
  }

  // Group vehicles by route and trip headsign
  const groupVehicles = (): GroupedVehicles[] => {
    const groups: { [key: string]: GroupedVehicles } = {}

    vehicles.forEach(vehicle => {
      const routeId = vehicle.route_id || 'unknown'
      const tripId = vehicle.trip_id
      const trips = tripId ? gtfs.getTrips({ tripId }) : []
      const trip = trips.length > 0 ? trips[0] : null
      const tripHeadsign = trip?.trip_headsign || 'Unknown Destination'
      const directionId = trip?.direction_id ?? 0
      const route = routeId ? getRouteById(routeId) : null
      const routeSortOrder = route?.route_sort_order ?? 9999

      const key = `${routeId}-${tripHeadsign}-${directionId}`

      if (!groups[key]) {
        groups[key] = {
          routeId,
          route,
          tripHeadsign,
          directionId,
          vehicles: [],
          routeSortOrder
        }
      }

      groups[key].vehicles.push(vehicle)
    })

    // Sort groups by route sort order, then direction
    return Object.values(groups).sort((a, b) => {
      if (a.routeSortOrder !== b.routeSortOrder) {
        return a.routeSortOrder - b.routeSortOrder
      }
      return a.directionId - b.directionId
    })
  }

  const groupedVehicles = groupVehicles()

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Vehicle Positions</h2>
        {realtimeLastUpdated > 0 && (
          <span className="text-xs text-gray-500">
            {formatTimeAgo(realtimeLastUpdated)} · {new Date(realtimeLastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {vehicles.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No vehicle positions available</p>
      ) : (
        <div className="space-y-6">
          {groupedVehicles.map((group, groupIdx) => (
            <div key={groupIdx} className="border-l-4 pl-4" style={{ borderColor: group.route?.route_color ? `#${group.route.route_color}` : '#3b82f6' }}>
              <div className="flex items-center gap-3 mb-3">
                {group.route && <RouteLabel route={group.route} />}
                <span className="font-semibold text-gray-800">{group.tripHeadsign}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">
                        Vehicle
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">
                        Trip
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">
                        Position
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">
                        Status
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">
                        Stop
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">
                        Delay
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.vehicles.map((vehicle: VehiclePosition, idx: number) => {
                      const tripId = vehicle.trip_id
                      const vehicleInfo = vehicle.vehicle
                      const position = vehicle.position
                      const stopId = vehicle.stop_id
                      const currentStatus = vehicle.current_status

                      const currentStop = stopId ? getStopById(stopId) : null
                      const trips = tripId ? gtfs.getTrips({ tripId }) : []
                      const trip = trips.length > 0 ? trips[0] : null

                      // Calculate distance to stop if vehicle is not at stop and we have coordinates
                      let distanceToStop: number | null = null
                      if (currentStatus !== 1 && position && currentStop?.stop_lat && currentStop?.stop_lon) {
                        try {
                          distanceToStop = getDistance(
                            { latitude: position.latitude, longitude: position.longitude },
                            { latitude: currentStop.stop_lat, longitude: currentStop.stop_lon }
                          )
                        } catch (err) {
                          console.error('Error calculating distance:', err)
                        }
                      }

                      const delay = tripId ? getTripDelay(tripId) : undefined

                      return (
                        <tr
                          key={vehicleInfo?.id || idx}
                          className={`border-b border-gray-100 hover:bg-green-50 transition-colors ${
                            idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                          }`}
                        >
                          <td className="py-2 px-3 text-sm">
                            <div className="font-medium text-gray-900">
                              {vehicleInfo?.label || vehicleInfo?.id || 'N/A'}
                            </div>
                            {vehicleInfo?.license_plate && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {vehicleInfo.license_plate}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-sm text-gray-700">
                            {trip?.trip_short_name || tripId || '-'}
                          </td>
                          <td className="py-2 px-3 text-xs font-mono text-gray-700">
                            {position ? (
                              <>
                                <div>{position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}</div>
                              </>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getVehicleStatusColor(
                                currentStatus ?? 2
                              )}`}
                            >
                              {getVehicleStatus(currentStatus ?? 2)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-sm text-gray-700">
                            {currentStop ? (
                              <>
                                <div>{currentStop.stop_name}</div>
                                {distanceToStop !== null && currentStatus !== 1 && (
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {formatDistance(distanceToStop)} away
                                  </div>
                                )}
                              </>
                            ) : stopId ? (
                              <span className="text-gray-500">{stopId}</span>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-sm">
                            {delay !== undefined ? (
                              <span className={delay > 0 ? 'text-red-600 font-medium' : delay < 0 ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                {formatDelay(delay)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

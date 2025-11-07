import { VehiclePosition, Route, GtfsSqlJs } from 'gtfs-sqljs'
import { getContrastColor, getVehicleStatus, getVehicleStatusColor } from './utils'

interface VehiclesTableProps {
  vehicles: VehiclePosition[]
  getRouteById: (routeId: string) => Route | undefined
  gtfs: GtfsSqlJs
}

export default function VehiclesTable({ vehicles, getRouteById, gtfs }: VehiclesTableProps) {
  const getStopById = (stopId: string) => {
    return gtfs.getStopById(stopId)
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Vehicle Positions</h2>
      {vehicles.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No vehicle positions available</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Vehicle
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Route
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Trip
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Position
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Current Stop
                </th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle: VehiclePosition, idx: number) => {
                // Extract vehicle position properties
                const routeId = vehicle.route_id
                const tripId = vehicle.trip_id
                const vehicleInfo = vehicle.vehicle
                const position = vehicle.position
                const stopId = vehicle.stop_id
                const currentStatus = vehicle.current_status

                const route = routeId ? getRouteById(routeId) : null
                const currentStop = stopId ? getStopById(stopId) : null
                const trip = tripId ? gtfs.getTripById(tripId) : null

                return (
                  <tr
                    key={vehicleInfo?.id || idx}
                    className={`border-b border-gray-100 hover:bg-green-50 transition-colors ${
                      idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <td className="py-3 px-4 text-sm">
                      <div className="font-medium text-gray-900">
                        {vehicleInfo?.label || vehicleInfo?.id || 'N/A'}
                      </div>
                      {vehicleInfo?.license_plate && (
                        <div className="text-xs text-gray-500 mt-1">
                          {vehicleInfo.license_plate}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {route ? (
                        <span
                          style={{
                            backgroundColor: route.route_color
                              ? `#${route.route_color}`
                              : '#3b82f6',
                            color: route.route_text_color
                              ? `#${route.route_text_color}`
                              : getContrastColor(
                                  route.route_color ? `#${route.route_color}` : '#3b82f6'
                                ),
                          }}
                          className="px-2 py-1 rounded text-sm font-semibold inline-block"
                        >
                          {route.route_short_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {trip ? (
                        <div>
                          <div className="font-medium">
                            {trip.trip_short_name || tripId}
                          </div>
                          {trip.trip_headsign && (
                            <div className="text-xs text-gray-500 truncate max-w-xs">
                              {trip.trip_headsign}
                            </div>
                          )}
                        </div>
                      ) : tripId ? (
                        <div className="text-xs text-gray-500">{tripId}</div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-gray-700">
                      <div>Lat: {position?.latitude != null ? position.latitude.toFixed(6) : 'N/A'}</div>
                      <div>Lng: {position?.longitude != null ? position.longitude.toFixed(6) : 'N/A'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getVehicleStatusColor(
                          currentStatus ?? 2
                        )}`}
                      >
                        {getVehicleStatus(currentStatus ?? 2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {currentStop?.stop_name || stopId || 'N/A'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

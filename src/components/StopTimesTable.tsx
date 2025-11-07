import { StopTimeWithRealtime, GtfsSqlJs, VehiclePosition } from 'gtfs-sqljs'
import { computeDelayFromTimestamp, applyDelayToTime, unixTimestampToTime } from './utils'

interface StopTimesTableProps {
  stopTimes: StopTimeWithRealtime[]
  gtfs: GtfsSqlJs
  selectedTrip: string
  vehicles: VehiclePosition[]
}

export default function StopTimesTable({ stopTimes, gtfs, selectedTrip, vehicles }: StopTimesTableProps) {
  const getStopById = (stopId: string) => {
    const stops = gtfs.getStops({ stopId })
    return stops.length > 0 ? stops[0] : null
  }

  // Find vehicle for this trip
  const tripVehicle = vehicles.find(v => v.trip_id === selectedTrip)
  const vehicleStopId = tripVehicle?.stop_id

  const formatTimeWithRealtime = (scheduledTime: string, delay?: number, realtimeTimestamp?: number) => {
    // Determine the delay: use provided delay, or compute from realtime timestamp
    let effectiveDelay = delay
    if (effectiveDelay === undefined && realtimeTimestamp !== undefined) {
      effectiveDelay = computeDelayFromTimestamp(scheduledTime, realtimeTimestamp)
    }

    if (effectiveDelay === undefined) {
      return <span className="font-mono text-sm">{scheduledTime}</span>
    }

    // Determine actual time: convert realtime timestamp to HH:MM:SS if available, otherwise apply delay
    const actualTime = realtimeTimestamp !== undefined
      ? unixTimestampToTime(realtimeTimestamp)
      : applyDelayToTime(scheduledTime, effectiveDelay)
    const delayMinutes = Math.floor(Math.abs(effectiveDelay) / 60)
    const delaySign = effectiveDelay > 0 ? '+' : '-'

    return (
      <div className="font-mono text-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-gray-900 font-semibold">{actualTime}</span>
          <span className={`text-xs font-medium ${effectiveDelay > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {delaySign}{delayMinutes}min
          </span>
        </div>
        <div className="text-xs text-gray-400">{scheduledTime}</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Stop Times</h2>
        {tripVehicle && (
          <span className="text-sm text-gray-600">
            Vehicle: <span className="font-medium">{tripVehicle.vehicle?.label || tripVehicle.vehicle?.id || 'Unknown'}</span>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                Seq
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                Stop Name
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                Arrival
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                Departure
              </th>
            </tr>
          </thead>
          <tbody>
            {stopTimes.map((st: StopTimeWithRealtime, idx: number) => {
              const stop = getStopById(st.stop_id)
              const isVehicleHere = vehicleStopId === st.stop_id

              return (
                <tr
                  key={`${st.trip_id}-${st.stop_sequence}`}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                    isVehicleHere
                      ? 'bg-green-100 border-l-4 border-l-green-500'
                      : idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                  }`}
                >
                  <td className="py-3 px-4 text-sm font-medium text-gray-600">
                    {isVehicleHere && (
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    )}
                    {st.stop_sequence}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className={isVehicleHere ? 'font-semibold' : ''}>{stop?.stop_name || st.stop_id}</span>
                      {isVehicleHere && (
                        <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full font-medium">
                          Vehicle Here
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {formatTimeWithRealtime(st.arrival_time, st.realtime?.arrival_delay, st.realtime?.arrival_time)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {formatTimeWithRealtime(st.departure_time, st.realtime?.departure_delay, st.realtime?.departure_time)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

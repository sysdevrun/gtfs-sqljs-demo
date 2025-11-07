import { StopTimeWithRealtime, VehiclePosition, Agency } from 'gtfs-sqljs'
import { computeDelayFromTimestamp, applyDelayToTime, unixTimestampToTime } from './utils'
import { getDistance } from 'geolib'
import type { GtfsApi } from '../types/GtfsApi'

interface StopTimesTableProps {
  stopTimes: StopTimeWithRealtime[]
  gtfs: GtfsApi
  selectedTrip: string
  vehicles: VehiclePosition[]
  agencies: Agency[]
}

export default function StopTimesTable({ stopTimes, gtfs, selectedTrip, vehicles, agencies }: StopTimesTableProps) {
  // Get agency timezone (use first agency's timezone)
  if (agencies.length === 0 || !agencies[0].agency_timezone) {
    throw new Error('Agency timezone is required but not available')
  }
  const agencyTimezone = agencies[0].agency_timezone

  const getStopById = (stopId: string) => {
    const stops = gtfs.getStops({ stopId })
    return stops.length > 0 ? stops[0] : null
  }

  // Find vehicle for this trip
  const tripVehicle = vehicles.find(v => v.trip_id === selectedTrip)
  const vehicleStopId = tripVehicle?.stop_id
  const vehicleStatus = tripVehicle?.current_status // 0 = INCOMING_AT, 1 = STOPPED_AT, 2 = IN_TRANSIT_TO
  const vehiclePosition = tripVehicle?.position

  // Calculate vehicle progress between stops
  const calculateVehicleProgress = (stopSequence: number): { percentage: number; previousStop: string; nextStop: string } | null => {
    if (!tripVehicle || !vehiclePosition || vehicleStatus === 1) return null

    const currentStopIndex = stopTimes.findIndex(st => st.stop_id === vehicleStopId)
    if (currentStopIndex === -1) return null

    const currentStop = stopTimes[currentStopIndex]
    const previousStop = currentStopIndex > 0 ? stopTimes[currentStopIndex - 1] : null

    // Determine if this row is between the relevant stops
    if (stopSequence === currentStop.stop_sequence && previousStop) {
      // Vehicle is heading to this stop, calculate progress from previous
      const prevStopData = getStopById(previousStop.stop_id)
      const currStopData = getStopById(currentStop.stop_id)

      if (prevStopData?.stop_lat && prevStopData?.stop_lon && currStopData?.stop_lat && currStopData?.stop_lon) {
        try {
          const totalDistance = getDistance(
            { latitude: prevStopData.stop_lat, longitude: prevStopData.stop_lon },
            { latitude: currStopData.stop_lat, longitude: currStopData.stop_lon }
          )
          const distanceFromPrev = getDistance(
            { latitude: prevStopData.stop_lat, longitude: prevStopData.stop_lon },
            { latitude: vehiclePosition.latitude, longitude: vehiclePosition.longitude }
          )
          const percentage = Math.min(100, Math.max(0, (distanceFromPrev / totalDistance) * 100))
          return {
            percentage,
            previousStop: prevStopData.stop_name || previousStop.stop_id,
            nextStop: currStopData.stop_name || currentStop.stop_id
          }
        } catch (err) {
          console.error('Error calculating distance:', err)
        }
      }
    }

    return null
  }

  const formatTimeWithRealtime = (scheduledTime: string, delay?: number, realtimeTimestamp?: number) => {
    // Determine the delay: use provided delay, or compute from realtime timestamp
    let effectiveDelay = delay
    if (effectiveDelay === undefined && realtimeTimestamp !== undefined) {
      effectiveDelay = computeDelayFromTimestamp(scheduledTime, realtimeTimestamp, agencyTimezone)
    }

    if (effectiveDelay === undefined) {
      return <span className="font-mono text-sm">{scheduledTime}</span>
    }

    // Determine actual time: convert realtime timestamp to HH:MM:SS if available, otherwise apply delay
    const actualTime = realtimeTimestamp !== undefined
      ? unixTimestampToTime(realtimeTimestamp, agencyTimezone)
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
              const isVehicleAtStop = vehicleStopId === st.stop_id && vehicleStatus === 1
              const progress = calculateVehicleProgress(st.stop_sequence)
              const isVehicleInTransitToHere = progress !== null

              return (
                <tr
                  key={`${st.trip_id}-${st.stop_sequence}`}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                    isVehicleAtStop
                      ? 'bg-green-100 border-l-4 border-l-green-500'
                      : isVehicleInTransitToHere
                        ? 'bg-blue-100 border-l-4 border-l-blue-500'
                        : idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                  }`}
                >
                  <td className="py-3 px-4 text-sm font-medium text-gray-600">
                    {isVehicleAtStop && (
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    )}
                    {isVehicleInTransitToHere && (
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                    )}
                    {st.stop_sequence}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={isVehicleAtStop || isVehicleInTransitToHere ? 'font-semibold' : ''}>
                          {stop?.stop_name || st.stop_id}
                        </span>
                        {isVehicleAtStop && (
                          <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full font-medium">
                            Vehicle Here
                          </span>
                        )}
                        {isVehicleInTransitToHere && (
                          <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded-full font-medium">
                            Approaching
                          </span>
                        )}
                      </div>
                      {isVehicleInTransitToHere && progress && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 whitespace-nowrap">
                            {Math.round(progress.percentage)}%
                          </span>
                        </div>
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

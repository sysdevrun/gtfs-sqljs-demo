import { StopTimeWithRealtime, GtfsSqlJs } from 'gtfs-sqljs'
import { computeDelay, applyDelayToTime } from './utils'
import { ExtendedStopTimeRealtime } from '../types'

interface StopTimesTableProps {
  stopTimes: StopTimeWithRealtime[]
  gtfs: GtfsSqlJs
}

export default function StopTimesTable({ stopTimes, gtfs }: StopTimesTableProps) {
  const getStopById = (stopId: string) => {
    return gtfs.getStopById(stopId)
  }

  const formatTimeWithRealtime = (scheduledTime: string, delay?: number, realtimeTime?: string) => {
    // Determine the delay: use provided delay, or compute from realtime time
    let effectiveDelay = delay
    if (effectiveDelay === undefined && realtimeTime) {
      effectiveDelay = computeDelay(scheduledTime, realtimeTime)
    }

    if (effectiveDelay === undefined) {
      return <span className="font-mono">{scheduledTime}</span>
    }

    // Determine actual time: use realtime time if available, otherwise apply delay to scheduled time
    const actualTime = realtimeTime || applyDelayToTime(scheduledTime, effectiveDelay)
    const delayMinutes = Math.floor(Math.abs(effectiveDelay) / 60)
    const delaySign = effectiveDelay > 0 ? '+' : '-'

    return (
      <div className="font-mono">
        <div className="text-gray-900 font-semibold">{actualTime}</div>
        <div className="text-xs text-gray-400 line-through">{scheduledTime}</div>
        <div className={`text-xs font-medium ${effectiveDelay > 0 ? 'text-red-600' : 'text-green-600'}`}>
          {delaySign}{delayMinutes}min
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Stop Times</h2>
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

              return (
                <tr
                  key={`${st.trip_id}-${st.stop_sequence}`}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                    idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                  }`}
                >
                  <td className="py-3 px-4 text-sm font-medium text-gray-600">
                    {st.stop_sequence}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900">
                    {stop?.stop_name || st.stop_id}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {formatTimeWithRealtime(st.arrival_time, st.realtime?.arrival_delay, (st.realtime as ExtendedStopTimeRealtime)?.arrival_time)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {formatTimeWithRealtime(st.departure_time, st.realtime?.departure_delay, (st.realtime as ExtendedStopTimeRealtime)?.departure_time)}
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

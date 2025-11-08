import { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'
import {
  Stop,
  Trip,
  StopTimeWithRealtime,
  StopFilters,
  TripFilters,
  StopTimeFilters
} from 'gtfs-sqljs'
import type { GtfsApi } from '../types/GtfsApi'

/**
 * Adapter class that provides a synchronous-like API on top of the async worker
 * Uses caching to enable synchronous access to frequently needed data
 */
export class GtfsApiAdapter implements GtfsApi {
  private worker: Remote<GtfsWorkerAPI>
  private stopsCache: Map<string, Stop> = new Map()
  private tripsCache: Map<string, Trip> = new Map()
  private stopTimesCache: Map<string, StopTimeWithRealtime[]> = new Map()

  constructor(worker: Remote<GtfsWorkerAPI>) {
    this.worker = worker
  }

  setStops(stops: Stop[]) {
    this.stopsCache.clear()
    stops.forEach(stop => {
      this.stopsCache.set(stop.stop_id, stop)
    })
  }

  getStops(filters?: StopFilters): Stop[] {
    if (filters?.stopId) {
      const stopId = Array.isArray(filters.stopId) ? filters.stopId[0] : filters.stopId
      const stop = this.stopsCache.get(stopId)
      return stop ? [stop] : []
    }
    return Array.from(this.stopsCache.values())
  }

  async fetchAndCacheTripData(tripId: string): Promise<{ trip: Trip | null; stopTimes: StopTimeWithRealtime[] }> {
    try {
      const [trips, stopTimes] = await Promise.all([
        this.worker.getTrips({ tripId, includeRealtime: true }),
        this.worker.getStopTimes({ tripId, includeRealtime: true })
      ])

      if (trips.length > 0) {
        this.tripsCache.set(tripId, trips[0])
        this.stopTimesCache.set(tripId, stopTimes)
        return { trip: trips[0], stopTimes }
      }
      this.stopTimesCache.set(tripId, stopTimes)
      return { trip: null, stopTimes }
    } catch (err) {
      console.error(`Error fetching trip data for ${tripId}:`, err)
      return { trip: null, stopTimes: [] }
    }
  }

  getTrips(filters?: TripFilters): Trip[] {
    if (filters?.tripId) {
      const tripId = Array.isArray(filters.tripId) ? filters.tripId[0] : filters.tripId
      const trip = this.tripsCache.get(tripId)
      return trip ? [trip] : []
    }
    // For other queries, return empty - these should be fetched via worker directly
    return []
  }

  getStopTimes(filters?: StopTimeFilters): StopTimeWithRealtime[] {
    if (filters?.tripId) {
      const tripId = Array.isArray(filters.tripId) ? filters.tripId[0] : filters.tripId
      const cached = this.stopTimesCache.get(tripId)
      return cached || []
    }
    return []
  }

  clearCache() {
    this.stopsCache.clear()
    this.tripsCache.clear()
    this.stopTimesCache.clear()
  }
}

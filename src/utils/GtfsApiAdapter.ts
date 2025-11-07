import { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'
import { Stop, Trip, StopTimeWithRealtime } from 'gtfs-sqljs'

/**
 * Adapter class that provides a synchronous-like API on top of the async worker
 * Uses caching to enable synchronous access to frequently needed data
 */
export class GtfsApiAdapter {
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

  getStops(options?: { stopId?: string }): Stop[] {
    if (options?.stopId) {
      const stop = this.stopsCache.get(options.stopId)
      return stop ? [stop] : []
    }
    return Array.from(this.stopsCache.values())
  }

  async fetchAndCacheTripData(tripId: string): Promise<void> {
    try {
      const [trips, stopTimes] = await Promise.all([
        this.worker.getTrips({ tripId }),
        this.worker.getStopTimes(tripId)
      ])

      if (trips.length > 0) {
        this.tripsCache.set(tripId, trips[0])
      }
      this.stopTimesCache.set(tripId, stopTimes)
    } catch (err) {
      console.error(`Error fetching trip data for ${tripId}:`, err)
    }
  }

  getTrips(options?: { tripId?: string; routeId?: string; date?: string }): Trip[] {
    if (options?.tripId) {
      const trip = this.tripsCache.get(options.tripId)
      return trip ? [trip] : []
    }
    // For other queries, return empty - these should be fetched via worker directly
    return []
  }

  getStopTimes(options: { tripId: string; includeRealtime?: boolean }): StopTimeWithRealtime[] {
    const cached = this.stopTimesCache.get(options.tripId)
    return cached || []
  }

  clearCache() {
    this.stopsCache.clear()
    this.tripsCache.clear()
    this.stopTimesCache.clear()
  }
}

import { Stop, Trip, StopTimeWithRealtime } from 'gtfs-sqljs'

/**
 * Interface representing the subset of GTFS API methods used by components
 * This allows both GtfsSqlJs and GtfsApiAdapter to be used interchangeably
 */
export interface GtfsApi {
  getStops(options?: { stopId?: string }): Stop[]
  getTrips(options?: { tripId?: string; routeId?: string; date?: string }): Trip[]
  getStopTimes(options: { tripId: string; includeRealtime?: boolean }): StopTimeWithRealtime[]
}
